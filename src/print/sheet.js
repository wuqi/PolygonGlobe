// Render a paper net to SVG for preview and export.

import { geoPath } from 'd3-geo';
import { buildNet } from './net.js';
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
    tabFill: '#ffffff',
    tab: '#888888',
    tabW: 0.2,
  },
};

const n3 = (v) => Math.round(v * 1000) / 1000;
const dOf = (pts, close) => 'M' + pts.map((p) => `${n3(p[0])},${n3(p[1])}`).join('L') + (close ? 'Z' : '');

/**
 * @param opts.solid   entry from SOLIDS
 * @param opts.page    'A4' | 'A5'
 * @param opts.style   'color' | 'mono'
 * @param opts.margin  page margin in mm
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
  } = opts;
  const [W0, H0] = PAGES[page] || PAGES.A4;
  const c = THEME[style] || THEME.color;

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
  const geo = geoPath(proj);
  const dLand = base === 'vector' ? geo({ type: 'FeatureCollection', features: worldFeatures }) || '' : '';
  const dChina = base === 'vector' && china ? geo(chinaFeature) || '' : '';
  const dGrat = graticule ? geo({ type: 'GeometryCollection', geometries: graticuleLines() }) : '';

  const label = `${solid.name} · ${net.faceCount} 面 · ${page} · ${style === 'color' ? '彩色' : '单色'}`;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">`,
    `<defs><clipPath id="netclip" clip-rule="evenodd"><path d="${dFaces}" clip-rule="evenodd" fill-rule="evenodd"/></clipPath></defs>`,
    `<rect width="${W}" height="${H}" fill="${c.page}"/>`,
    base === 'sky' ? '' : `<path d="${dFaces}" fill="${c.face}"/>`,
    dTabs ? `<path d="${dTabs}" fill="${c.tabFill}" stroke="${c.tab}" stroke-width="${c.tabW}"/>` : '',
    `<g clip-path="url(#netclip)">`,
    dGrat ? `<path d="${dGrat}" fill="none" stroke="#a9c4da" stroke-width="0.1"/>` : '',
    `<path d="${dLand}" fill="${c.land}" stroke="${c.coast}" stroke-width="0.1"/>`,
    `<path d="${dChina}" fill="${c.china}" stroke="${c.coast}" stroke-width="0.12"/>`,
    base === 'sky' ? skyLayers(geo, style) : '',
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

// Star map content, from d3-celestial's sample data.
let skyData = null;
function skyLayers(geo, style) {
  if (!skyData) return '';
  const mono = style === 'mono';
  const parts = [];

  if (skyData.mw) {
    const d = geo(skyData.mw) || '';
    if (d) parts.push(`<path d="${d}" fill="${mono ? '#dddddd' : '#4a5a7a'}" opacity="0.55"/>`);
  }
  if (skyData.constellationBounds) {
    const d = geo({ type: 'FeatureCollection', features: skyData.constellationBounds }) || '';
    if (d) parts.push(`<path d="${d}" fill="none" stroke="#9aa8bd" stroke-width="0.12" stroke-dasharray="1 1.2" opacity="0.7"/>`);
  }
  if (skyData.constellationLines) {
    const d = geo({ type: 'FeatureCollection', features: skyData.constellationLines }) || '';
    if (d) parts.push(`<path d="${d}" fill="none" stroke="#7f8ea6" stroke-width="0.15" opacity="0.8"/>`);
  }
  if (skyData.stars) {
    const stars = skyData.stars.features;
    let dots = '';
    for (const f of stars) {
      const p = geo(f);
      if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
      const r = 0.16 + (5.5 - (f.properties?.mag ?? 5)) * 0.05;
      dots += `M${p[0].toFixed(1)},${p[1].toFixed(1)}m${-r.toFixed(2)},0a${r.toFixed(2)},${r.toFixed(2)} 0 1,0 ${(r * 2).toFixed(2)},0a${r.toFixed(2)},${r.toFixed(2)} 0 1,0 ${(-r * 2).toFixed(2)},0`;
    }
    parts.push(`<path d="${dots}" fill="${mono ? '#333333' : '#1b2436'}" fill-rule="evenodd"/>`);
  }
  return parts.join('');
}

export async function loadSkyData() {
  if (skyData) return skyData;
  const [mw, stars, clines, cbounds] = await Promise.all([
    fetch(new URL('./data/sky/mw.json', import.meta.url)).then((r) => r.json()),
    fetch(new URL('./data/sky/stars.6.json', import.meta.url)).then((r) => r.json()),
    fetch(new URL('./data/sky/constellations.lines.json', import.meta.url)).then((r) => r.json()),
    fetch(new URL('./data/sky/constellations.bounds.json', import.meta.url)).then((r) => r.json()),
  ]);
  skyData = {
    mw,
    stars: { ...stars, features: stars.features.filter((d) => (d.properties?.mag ?? 9) < 5) },
    constellationLines: clines,
    constellationBounds: cbounds,
  };
  return skyData;
}

function graticuleLines() {
  const lines = [];
  for (let lon = -180; lon < 180; lon += 15) {
    const l = [];
    for (let lat = -90; lat <= 90; lat += 3) l.push([lon, lat]);
    lines.push({ type: 'LineString', coordinates: l });
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const l = [];
    for (let lon = -180; lon <= 180; lon += 3) l.push([lon, lat]);
    lines.push({ type: 'LineString', coordinates: l });
  }
  return lines;
}