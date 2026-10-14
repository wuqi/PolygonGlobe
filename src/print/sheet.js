// Render a paper net to SVG for preview and export.

import { geoPath } from 'd3-geo';
import { buildNet } from './net.js';
import { rasterizeFaces, imageToSource } from './raster.js';
import { glueTabs } from './tabs.js';
import { worldFeatures, chinaFeature } from '../data/world.js';

export const PAGES = { A4: [210, 297], A5: [148, 210] };

const THEME = {
  color: {
    page: '#ffffff',
    face: '#bcd9f2',
    land: '#cfe3b8',
    coast: '#7f9a6b',
    china: '#e8998d',
    cut: '#111111',
    cutW: 0.5,
    fold: '#5b7ea6',
    foldW: 0.25,
    grat: '#1f4e79',
    gratW: 0.18,
    mw: '#dce6f2',
    consBound: '#9fb0c4',
    consBoundW: 0.1,
    consLine: '#3f5875',
    consLineW: 0.14,
    consName: '#5b6f88',
    consNameSize: 1.1,
    star: '#16233a',
    starMax: 0.24,
    rasterOpacity: 1,
    tabFill: '#ffffff',
    tab: '#7a8ea0',
    tabW: 0.2,
  },
  mono: {
    page: '#ffffff',
    face: '#ffffff',
    land: '#eeeeee',
    coast: '#999999',
    china: '#cccccc',
    cut: '#000000',
    cutW: 0.5,
    fold: '#777777',
    foldW: 0.25,
    grat: '#2b3f55',
    gratW: 0.2,
    mw: '#eeeeee',
    consBound: '#b4b4b4',
    consBoundW: 0.1,
    consLine: '#666666',
    consLineW: 0.14,
    consName: '#8c8c8c',
    consNameSize: 1.1,
    star: '#111111',
    starMax: 0.24,
    rasterOpacity: 1,
    tabFill: '#ffffff',
    tab: '#888888',
    tabW: 0.2,
  },
};

const n3 = (v) => Math.round(v * 1000) / 1000;
const dOf = (pts, close) => 'M' + pts.map((p) => `${n3(p[0])},${n3(p[1])}`).join('L') + (close ? 'Z' : '');

// Projected path strings keyed by everything but colour.
const layerCache = new Map();

// Palette entries the UI is allowed to override, in the order they are shown.
export const THEME_KEYS = [
  ['page', '纸张'],
  ['face', '地图底色'],
  ['land', '陆地填充'],
  ['china', '中国填充'],
  ['coast', '描边'],
  ['grat', '经纬网'],
  ['fold', '折线'],
  ['cut', '剪切线'],
  ['tab', '贴边'],
];

// Star map colours; only meaningful when the base is 'sky'.
export const SKY_KEYS = [
  ['mw', '银河底色'],
  ['consBound', '星座界'],
  ['consLine', '星座连线'],
  ['consName', '星座名'],
  ['star', '星点'],
];

// Numeric sky settings get sliders rather than colour pickers.
export const SKY_WIDTHS = [
  ['consLineW', '连线宽'],
  ['consBoundW', '星座界宽'],
  ['consNameSize', '星座名字号'],
  ['starMax', '亮星半径'],
  ['starMin', '暗星半径'],
];

export function themeOf(style) {
  return { ...(THEME[style] || THEME.color) };
}

/**
 * @param opts.solid   entry from SOLIDS
 * @param opts.page    'A4' | 'A5'
 * @param opts.style   'color' | 'mono'
 * @param opts.margin  page margin in mm
 * @param opts.theme   colour overrides merged on top of the style's palette
 */
export function renderNet(opts) {
  const {
    solid,
    page = 'A4',
    style = 'color',
    margin = 6,
    graticule = false,
    showFolds = true,
    base = 'vector',
    china = true,
    pxPerMm = 4,
  } = opts;
  const [W0, H0] = PAGES[page] || PAGES.A4;
  const c = { ...(THEME[style] || THEME.color), ...(opts.theme || {}) };

  const net = buildNet(solid);

  // Glue tabs live in net space so they can be tested against the faces, then
  // ride through the same page transform as everything else.
  const tabPolys = glueTabs(net.outline.map((loop) => loop.map((e) => e.pts)), net.faces, {
    width: opts.tabWidth ?? 0.72,
    depth: opts.tabDepth ?? 0.13,
  });

  // Bounding box of faces plus tabs, in net space.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const group of [net.faces, tabPolys]) {
    for (const ring of group) {
      for (const p of ring) {
        if (p[0] < x0) x0 = p[0];
        if (p[1] < y0) y0 = p[1];
        if (p[0] > x1) x1 = p[0];
        if (p[1] > y1) y1 = p[1];
      }
    }
  }

  // Fit the net into the sheet. The sheet is offered in whichever orientation
  // suits the net; the drawing itself is never rotated, because the net's
  // coordinate frame was solved from the angle the projection was built with.
  // Rotating afterwards (or changing projection.angle()) moves the map content
  // away from the faces, which used to blank out most solids.
  //
  // netAspect is width/height of the net. A net wider than the sheet is tall
  // (portrait) reads better turned, but since nothing is rotated, just hand it
  // the orientation that wastes least paper: wide nets get the landscape sheet.
  const netAspect = (x1 - x0) / (y1 - y0);
  const [W, H] = netAspect > 1 ? [H0, W0] : [W0, H0];

  const bw = x1 - x0;
  const bh = y1 - y0;

  const k = Math.min((W - 2 * margin) / bw, (H - 2 * margin) / bh);

  // The projection maps lon/lat to page as `translate + scale * netSpace`, and
  // net.pt() returns that same netSpace. So both sides must share one offset;
  // subtracting the bbox origin in P() alone would slide the map content away
  // from the faces and clip it away entirely.
  const tx = (W - bw * k) / 2 - x0 * k;
  const ty = (H - bh * k) / 2 - y0 * k;

  const P = (p) => [tx + p[0] * k, ty + p[1] * k];

  const proj = net.proj;
  proj.scale(k).translate([tx, ty]);

  // Faces are unioned into one path. The library hands back faces with mixed
  // winding, so the nonzero fill rule would let neighbouring faces cancel and
  // punch holes in the clip region. evenodd is winding-independent.
  const dFaces = net.faces.map((ring) => dOf(ring.map(P), true)).join(' ');
  const dTabs = tabPolys.map((ring) => dOf(ring.map(P), true)).join(' ');

  // cut outline: every edge still stored as a coordinate pair on some node
  const cuts = [];
  net.nodes.forEach((n) => {
    const m = n.face.length;
    for (let i = 0; i < m; i++) {
      if (!Array.isArray(n.edges[i])) continue;
      cuts.push([net.pt(n, n.face[(i - 1 + m) % m]), net.pt(n, n.face[i])]);
    }
  });
  const dCuts = cuts.map((s) => dOf(s.map(P), false)).join(' ');

  // folds: node-reference edges
  const foldSeen = new Set();
  const folds = [];
  net.nodes.forEach((n) => {
    const m = n.face.length;
    for (let i = 0; i < m; i++) {
      if (Array.isArray(n.edges[i])) continue;
      const a = n.face[(i - 1 + m) % m];
      const b = n.face[i];
      const key = [a[0].toFixed(6) + ',' + a[1].toFixed(6), b[0].toFixed(6) + ',' + b[1].toFixed(6)].sort().join('|');
      if (foldSeen.has(key)) continue;
      foldSeen.add(key);
      folds.push([net.pt(n, a), net.pt(n, b)]);
    }
  });
  const dFolds = folds.map((f) => dOf(f.map(P), false)).join(' ');

  // Map content uses the same net->page mapping as everything else, so the
  // projection was re-scaled above in step with the fit.
  //
  // These paths are expensive: the world outline alone is ~370ms and the
  // graticule ~260ms, because geoPath resamples densely across each face.
  // None of that depends on colour, so memoise by geometry and reuse the
  // strings when only the palette changes - otherwise dragging a colour
  // picker reruns the whole projection every pixel of travel.
  const geo = geoPath(proj);
  setStarScale(c.starMax, c.starMin);
  // The star radius is baked into the dots, so it has to be part of the key.
  // skyVersion bumps once the star JSON lands: without it the first render
  // after switching to the sky base caches an empty sheet (data still in
  // flight) and every later render reuses that empty entry.
  const layerKey = `${solid.key}|${page}|${margin}|${base}|${graticule ? 1 : 0}|${china ? 1 : 0}|${c.starMax}|${c.starMin}|${skyVersion}|${rasterVersion}|${pxPerMm}`;
  let layers = layerCache.get(layerKey);
  if (!layers) {
    layers = {
      dLand: base === 'vector' ? geo({ type: 'FeatureCollection', features: worldFeatures }) || '' : '',
      dChina: base === 'vector' && china ? geo(chinaFeature) || '' : '',
      dGrat: graticule ? geo({ type: 'GeometryCollection', geometries: graticuleLines() }) : '',
      dSky: base === 'sky' ? skyLayers(geo, proj) : '',
      raster:
        base === 'raster' && rasterSource
          ? rasterizeFaces(net, { k, tx, ty }, { x: 0, y: 0, w: W, h: H }, pxPerMm, rasterSource)
          : null,
    };
    // Never memoise a render that ran before the sky data arrived; the next
    // one has to redo it.
    const skyReady = base !== 'sky' || Boolean(skyData);
    if (skyReady) {
      if (layerCache.size > 12) layerCache.clear();
      layerCache.set(layerKey, layers);
    }
  }
  const { dLand, dChina, dGrat, dSky, raster } = layers;

  const skyPaths = base === 'sky'
    ? [
        dSky.dMw ? `<path d="${dSky.dMw}" fill="${c.mw}" fill-rule="evenodd" stroke="${c.mw}" stroke-width="0.05"/>` : '',
        dSky.dBounds
          ? `<path d="${dSky.dBounds}" fill="none" stroke="${c.consBound}" stroke-width="${c.consBoundW}" stroke-dasharray="${c.consBoundW * 8} ${c.consBoundW * 10}" opacity="0.75"/>`
          : '',
        dSky.dLines
          ? `<path d="${dSky.dLines}" fill="none" stroke="${c.consLine}" stroke-width="${c.consLineW}" stroke-linecap="round"/>`
          : '',
        dSky.dStars ? `<path d="${dSky.dStars}" fill="${c.star}" fill-rule="evenodd"/>` : '',
      ].join('')
    : '';

  const label = `${solid.name} · ${net.faceCount} 面 · ${page} · ${style === 'color' ? '彩色' : '单色'}`;

  // The rasterised bitmap spans the page; netclip trims it to the faces.
  const rasterImage = raster
    ? `<image x="${raster.box.x}" y="${raster.box.y}" width="${raster.box.w}" height="${raster.box.h}" ` +
      `href="${raster.dataUrl}" preserveAspectRatio="none" opacity="${c.rasterOpacity}"/>`
    : '';

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">`,
    `<defs><clipPath id="netclip" clip-rule="evenodd"><path d="${dFaces}" clip-rule="evenodd" fill-rule="evenodd"/></clipPath></defs>`,
    `<rect width="${W}" height="${H}" fill="${c.page}"/>`,
    base === 'sky' || base === 'raster' ? '' : `<path d="${dFaces}" fill="${c.face}"/>`,
    dTabs ? `<path d="${dTabs}" fill="${c.tabFill}" stroke="${c.tab}" stroke-width="${c.tabW}"/>` : '',
    `<g clip-path="url(#netclip)">`,
    rasterImage,
    dGrat ? `<path d="${dGrat}" fill="none" stroke="${c.grat}" stroke-width="${c.gratW}"/>` : '',
    `<path d="${dLand}" fill="${c.land}" stroke="${c.coast}" stroke-width="0.1"/>`,
    `<path d="${dChina}" fill="${c.china}" stroke="${c.coast}" stroke-width="0.12"/>`,
    skyPaths,
    `</g>`,
    showFolds
      ? `<path d="${dFolds}" fill="none" stroke="${c.fold}" stroke-width="${c.foldW}" stroke-dasharray="1.2 0.8"/>`
      : '',
    `<path d="${dCuts}" fill="none" stroke="${c.cut}" stroke-width="${c.cutW}" stroke-linecap="round"/>`,
    `<text x="${W - margin}" y="${H - 4}" text-anchor="end" font-family="sans-serif" font-size="3" fill="#666">${label}</text>`,
    `</svg>`,
  ].join('');

  return { svg, W, H, net };
}

// Star map content, from the data the reference notebook uses
// (https://ofrohn.github.io/data, mirrored under src/data/sky).
// Returns bare path strings; the palette is applied by the caller so colour
// changes never re-run the projection.
// Blue Marble equirectangular source, loaded once on demand.
let rasterSource = null;
let rasterVersion = 0;
export async function loadRasterData() {
  if (rasterSource) return rasterSource;
  const url = new URL('../data/sky/blue-marble-2048.jpg', import.meta.url).href;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('栅格底图加载失败: ' + url));
    img.src = url;
  });
  rasterSource = imageToSource(img);
  rasterVersion++;
  return rasterSource;
}

let skyData = null;
// Bumped when the star data lands, so cached layers built before that are
// recomputed instead of being served empty.
let skyVersion = 0;
function skyLayers(geo, proj) {
  if (!skyData) return { dMw: '', dBounds: '', dLines: '', dStars: '' };
  const out = { dMw: '', dBounds: '', dLines: '', dStars: '' };

  // The Milky Way is drawn as its *complement*: the source polygon reversed,
  // so the band shows through and everything else is tinted. Filling the band
  // itself would wash over the whole sphere in some orientations.
  if (skyData.mwBg) {
    out.dMw = geo(skyData.mwBg) || '';
  }
  // These are already FeatureCollections; wrapping them in another one nests
  // a collection inside `features`, which yields an empty path.
  if (skyData.constellationBounds) {
    out.dBounds = geo(skyData.constellationBounds) || '';
  }
  if (skyData.constellationLines) {
    out.dLines = geo(skyData.constellationLines) || '';
  }
  if (skyData.stars) {
    let dots = '';
    for (const f of skyData.stars.features) {
      // geoPath(f) returns an SVG path string, not coordinates, so read the
      // projected point off the projection directly.
      const p = proj(f.geometry.coordinates);
      if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
      const r = starRadius(f.properties?.mag ?? 5);
      dots += `M${p[0].toFixed(1)},${p[1].toFixed(1)}m${(-r).toFixed(3)},0a${r.toFixed(3)},${r.toFixed(3)} 0 1,0 ${(r * 2).toFixed(3)},0a${r.toFixed(3)},${r.toFixed(3)} 0 1,0 ${(-r * 2).toFixed(3)},0`;
    }
    out.dStars = dots;
  }
  return out;
}

// Star radius in mm, from a magnitude scale set at render time.
let starScale = { max: 0.24, min: 0.05 };
function setStarScale(max, min) {
  starScale = { max, min };
}

// Brighter stars are bigger: map magnitude ~1 to rMax and ~5 to rMin.
function starRadius(mag) {
  const { max: rMax, min: rMin } = starScale;
  const t = Math.max(0, Math.min(1, (mag - 1) / 4));
  return rMax + (rMin - rMax) * t;
}

// Lets the test suite exercise the sky layers against the checked-in JSON
// instead of going through fetch.
export function __injectSky(data) {
  skyData = data;
  skyVersion++;
}
export async function loadSkyData() {
  if (skyData) return skyData;
  // These live in src/data/sky, one level up from this module.
  const fetchJson = (name) =>
    fetch(new URL(`../data/sky/${name}`, import.meta.url)).then((r) => {
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      return r.json();
    });
  const [mw, stars, clines, cbounds, cnames] = await Promise.all([
    fetchJson('mw.json'),
    fetchJson('stars.6.json'),
    fetchJson('constellations.lines.json'),
    fetchJson('constellations.bounds.json'),
    fetchJson('constellations.json'),
  ]);
  skyData = {
    // Reversing the outer ring turns the Milky Way band into everything
    // outside it, which is what gets tinted so the band shows through.
    mwBg: mwBackground(mw),
    stars: { ...stars, features: stars.features.filter((d) => (d.properties?.mag ?? 9) < 5) },
    constellationLines: clines,
    constellationBounds: cbounds,
    constellationNames: cnames,
  };
  skyVersion++;
  return skyData;
}

function mwBackground(mw) {
  const ring = mw?.features?.[0]?.geometry?.coordinates?.[0];
  if (!ring) return null;
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'MultiPolygon',
          coordinates: [ring.map((p) => p.slice().reverse())],
        },
      },
    ],
  };
}

function graticuleLines() {
  const lines = [];
  for (let lon = -180; lon < 180; lon += 10) {
    const l = [];
    for (let lat = -90; lat <= 90; lat += 2) l.push([lon, lat]);
    lines.push({ type: 'LineString', coordinates: l });
  }
  for (let lat = -80; lat <= 80; lat += 10) {
    const l = [];
    for (let lon = -180; lon <= 180; lon += 2) l.push([lon, lat]);
    lines.push({ type: 'LineString', coordinates: l });
  }
  return lines;
}