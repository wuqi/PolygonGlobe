// Render a paper net to SVG for preview and export.

import { geoPath } from 'd3-geo';
import { buildNet } from './net.js';
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
  const { solid, page = 'A4', style = 'color', margin = 12, graticule = false } = opts;
  const [W, H] = PAGES[page] || PAGES.A4;
  const c = THEME[style] || THEME.color;

  const net = buildNet(solid);
  const [b0, b1] = net.bbox;
  const bw = b1[0] - b0[0];
  const bh = b1[1] - b0[1];
  const k = Math.min((W - 2 * margin) / bw, (H - 2 * margin) / bh);
  const dx = margin + ((W - 2 * margin) - bw * k) / 2 - b0[0] * k;
  const dy = margin + ((H - 2 * margin) - bh * k) / 2 - b0[1] * k;
  const P = (p) => [dx + k * p[0], dy + k * p[1]];

  // Faces are unioned into one path. The library hands back faces with mixed
  // winding, so the nonzero fill rule would let neighbouring faces cancel and
  // punch holes in the clip region (which showed up as China being sliced in
  // half). evenodd is winding-independent and cuts exactly the face interiors.
  const dFaces = net.faces.map((ring) => dOf(ring.map(P), true)).join(' ');

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

  // map content drawn with the same projection so it lines up with the faces
  const proj = net.proj;
  proj.scale(k).translate([dx, dy]);
  const geo = geoPath(proj);
  const dLand = geo({ type: 'FeatureCollection', features: worldFeatures }) || '';
  const dChina = geo(chinaFeature) || '';
  const dGrat = graticule ? geo({ type: 'GeometryCollection', geometries: graticuleLines() }) : '';

  const label = `${solid.name} · ${net.faceCount} 面 · ${page} · ${style === 'color' ? '彩色' : '单色'}`;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">`,
    `<defs><clipPath id="netclip" clip-rule="evenodd"><path d="${dFaces}" clip-rule="evenodd" fill-rule="evenodd"/></clipPath></defs>`,
    `<rect width="${W}" height="${H}" fill="${c.page}"/>`,
    `<path d="${dFaces}" fill="${c.face}"/>`,
    `<g clip-path="url(#netclip)">`,
    dGrat ? `<path d="${dGrat}" fill="none" stroke="#a9c4da" stroke-width="0.1"/>` : '',
    `<path d="${dLand}" fill="${c.land}" stroke="${c.coast}" stroke-width="0.1"/>`,
    `<path d="${dChina}" fill="${c.china}" stroke="${c.coast}" stroke-width="0.12"/>`,
    `</g>`,
    `<path d="${dFolds}" fill="none" stroke="${c.fold}" stroke-width="${c.foldW}" stroke-dasharray="1.2 0.8"/>`,
    `<path d="${dCuts}" fill="none" stroke="${c.cut}" stroke-width="${c.cutW}" stroke-linecap="round"/>`,
    `<text x="${W - margin}" y="${H - 4}" text-anchor="end" font-family="sans-serif" font-size="3" fill="#666">${label}</text>`,
    `</svg>`,
  ].join('');

  return { svg, W, H, net };
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