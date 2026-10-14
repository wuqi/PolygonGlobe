// Build an unfolded paper net for a solid using d3-geo-polygon's
// geoPolyhedralVoronoi, then report the layout metrics we care about.
//
// The library takes the unfolding tree as `parents` and derives every face's
// planar transform itself, so all this module does is hand over the tables and
// read the results back off the nodes.

import { geoPolyhedralVoronoi } from 'd3-geo-polygon';
import { geoCentroid, geoInterpolate, geoRotation } from 'd3-geo';
import { resolve } from './solids.js';

const pkey = (p) => `${Math.round(p[0] * 1e6) / 1e6},${Math.round(p[1] * 1e6) / 1e6}`;

// Chain cut edges into closed loops. Only cuts bound the net (folds connect
// faces that legitimately touch), so walking them by shared endpoint recovers
// the boundary that glue tabs hang off.
function chainOutline(cuts, { tol = 1e-9 } = {}) {
  const key = (p) => `${Math.round(p[0] / tol)},${Math.round(p[1] / tol)}`;
  const loops = [];
  const todo = cuts.map((c) => ({ ...c, pts: [c.a, c.b], used: false }));
  // Sample every edge so the loop can be compared against faces reliably.
  const flat = [];
  for (const c of todo) flat.push({ e: c, from: c.a, to: c.b });

  const adj = new Map();
  for (const f of flat) {
    for (const [u, v] of [[f.from, f.to], [f.to, f.from]]) {
      const k = key(u);
      if (!adj.has(k)) adj.set(k, []);
      adj.get(k).push({ u, v, e: f.e });
    }
  }

  while (flat.some((f) => !f.e.used)) {
    const start = flat.find((f) => !f.e.used);
    start.e.used = true;
    const loop = [{ pts: [start.from, start.to] }];
    let cur = start.to;
    for (;;) {
      const cands = adj.get(key(cur)) || [];
      const next = cands.find((c) => !c.e.used);
      if (!next) break;
      next.e.used = true;
      loop.push({ pts: [next.u, next.v] });
      cur = next.v;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

// Planar position of a lon/lat point on a node, matching the library's forward()
// (note the y negation - polyhedral flips it internally).
function nodePoint(node, pt) {
  const p = node.project(pt);
  const t = node.transform;
  return t
    ? [t[0] * p[0] + t[1] * p[1] + t[2], -(t[3] * p[0] + t[4] * p[1] + t[5])]
    : [p[0], -p[1]];
}

// The library's forward() is only half of the story: d3 then applies
// scaleTranslateRotate with a centre compensation and an angle, so
//   page = [tx + k*X, ty + k*Y]
// where (X, Y) is a rotation of (raw - rc) by -angle with y flipped again.
// rc (the raw position of the projection centre) is unknown because
// `raw` is private, so solve for it from one probe point placed strictly
// inside a known face.
function solveFrame(proj, node) {
  const k0 = proj.scale();
  const [tx0, ty0] = proj.translate();
  const alpha = (proj.angle() * Math.PI) / 180;
  const cosA = Math.cos(alpha);
  const sinA = Math.sin(alpha);
  const rot = geoRotation(proj.rotate());

  const ring = node.face;
  const cen = geoCentroid({ type: 'Polygon', coordinates: [[...ring, ring[0]]] });
  // The probe must sit strictly inside the face AND avoid the antimeridian,
  // where rot.invert jumps by 360 and the point gets routed to another face.
  let probe = null;
  for (const t of [0.2, 0.35, 0.5, 0.1, 0.05]) {
    for (let i = 0; i < ring.length; i++) {
      const cand = geoInterpolate(ring[i], cen)(t);
      if (Math.abs(Math.abs(cand[0]) - 180) < 5) continue;
      probe = cand;
      break;
    }
    if (probe) break;
  }
  if (!probe) probe = geoInterpolate(ring[0], cen)(0.3);

  const rawProbe = nodePoint(node, probe);
  const pageProbe = proj(rot.invert(probe));

  const a = k0 * cosA;
  const b = k0 * sinA;
  const R1 = tx0 + a * rawProbe[0] - b * rawProbe[1] - pageProbe[0];
  const R2 = pageProbe[1] - ty0 + b * rawProbe[0] + a * rawProbe[1];
  const det = a * a + b * b;

  return {
    rcx: (a * R1 + b * R2) / det,
    rcy: (-b * R1 + a * R2) / det,
    cosA,
    sinA,
  };
}

// raw (as returned by nodePoint) -> net space, where page = [tx + k*X, ty + k*Y]
export function rawToNet(xf, p) {
  const u = p[0] - xf.rcx;
  const v = p[1] - xf.rcy;
  return [xf.cosA * u - xf.sinA * v, -xf.sinA * u - xf.cosA * v];
}

function collectNodes(proj) {
  const tree = proj.tree();
  const nodes = [];
  const seen = new Set();
  const stack = [tree];
  while (stack.length) {
    const n = stack.pop();
    if (seen.has(n)) continue;
    seen.add(n);
    nodes.push(n);
    for (const e of n.edges) if (!Array.isArray(e)) stack.push(e);
  }
  return nodes;
}

function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const SHRINK = 1 - 1e-4;
function shrink(poly) {
  let cx = 0;
  let cy = 0;
  for (const p of poly) {
    cx += p[0];
    cy += p[1];
  }
  cx /= poly.length;
  cy /= poly.length;
  return poly.map((p) => [cx + (p[0] - cx) * SHRINK, cy + (p[1] - cy) * SHRINK]);
}

function segCross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** Build the net for a solid definition. Returns geometry plus a health report. */
export function buildNet(solid, { scale = 100 } = {}) {
  const { faces, parents, rotate, angle } = resolve(solid);

  let proj;
  if (solid.make) {
    // Solids built from a ready-made d3-geo-polygon factory (geoIcosahedral,
    // geoPolyhedralButterfly, ...). Those carry their own vertices, unfolding
    // tree, angle and rotation, so there is nothing left to assemble.
    proj = solid.make();
  } else {
    const polygons = {
      type: 'FeatureCollection',
      features: faces.map((face) => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [[...face, face[0]]] },
      })),
    };

    proj = geoPolyhedralVoronoi()
      .parents(parents)
      .polygons(polygons)
      .rotate(rotate)
      .scale(scale);
    if (angle) proj.angle(angle);
  }

  const nodes = collectNodes(proj);
  const xf = solveFrame(proj, nodes[0]);
  const pt = (node, ll) => rawToNet(xf, nodePoint(node, ll));
  const polys = nodes.map((n) => n.face.map((ll) => pt(n, ll)));

  // faces joined by a fold legitimately touch
  const folds = new Set();
  nodes.forEach((n, i) => {
    for (const e of n.edges) {
      if (Array.isArray(e)) continue;
      const j = nodes.indexOf(e);
      if (j >= 0) folds.add(i < j ? `${i}|${j}` : `${j}|${i}`);
    }
  });

  // cut edges = edges still stored as coordinate pairs
  const cuts = [];
  nodes.forEach((n, id) => {
    const m = n.face.length;
    for (let i = 0; i < m; i++) {
      if (Array.isArray(n.edges[i])) cuts.push({ face: id, a: n.face[(i - 1 + m) % m], b: n.face[i] });
    }
  });

  let overlaps = 0;
  for (let i = 0; i < polys.length; i++) {
    for (let j = i + 1; j < polys.length; j++) {
      if (folds.has(`${i}|${j}`)) continue;
      let sharedVertex = false;
      for (const a of polys[i]) for (const b of polys[j]) if (pkey(a) === pkey(b)) sharedVertex = true;
      if (sharedVertex) continue;
      const A = shrink(polys[i]);
      const B = shrink(polys[j]);
      let hit = A.some((p) => pointInRing(p, B)) || B.some((p) => pointInRing(p, A));
      if (!hit) {
        outer: for (let a = 0; a < A.length; a++) {
          for (let b = 0; b < B.length; b++) {
            if (segCross(A[a], A[(a + 1) % A.length], B[b], B[(b + 1) % B.length])) {
              hit = true;
              break outer;
            }
          }
        }
      }
      if (hit) overlaps++;
    }
  }

  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const poly of polys) {
    for (const p of poly) {
      if (p[0] < x0) x0 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[0] > x1) x1 = p[0];
      if (p[1] > y1) y1 = p[1];
    }
  }

  const foldCount = folds.size;

  // Chain the cut edges into closed loops so glue tabs can be attached to them.
  const outline = chainOutline(
    cuts.map(({ face, a, b }) => ({
      face,
      a: pt(nodes[face], a),
      b: pt(nodes[face], b),
    }))
  );

  return {
    key: solid.key,
    name: solid.name,
    en: solid.en,
    proj,
    nodes,
    xf,
    // net-space point for a node corner; page = [tx + k*X, ty + k*Y]
    pt,
    faces: polys,
    outline,
    faceCount: polys.length,
    folds: foldCount,
    cuts: cuts.length,
    overlaps,
    expectFolds: polys.length - 1,
    bbox: [[x0, y0], [x1, y1]],
    aspect: (x1 - x0) / (y1 - y0),
  };
}