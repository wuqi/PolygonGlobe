import { geoPolyhedralVoronoi } from 'd3-geo-polygon';

const PHI = (1 + Math.sqrt(5)) / 2;
const INV_PHI = 1 / PHI;
const TRUNC = 1 + Math.SQRT2;

const SIGNS = [
  [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
  [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
];

function normalize(v) {
  const r = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / r, v[1] / r, v[2] / r];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function lonLat(v) {
  const n = normalize(v);
  const lon = Math.atan2(n[1], n[0]) * 180 / Math.PI;
  const lat = Math.asin(Math.max(-1, Math.min(1, n[2]))) * 180 / Math.PI;
  return [lon, lat];
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const v of list) {
    const k = v.map((x) => x.toFixed(12)).join(',');
    if (!seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

function axisDirs() {
  const out = [];
  for (const axis of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
    for (const s of SIGNS) {
      out.push([s[0] * axis[0], s[1] * axis[1], s[2] * axis[2]]);
    }
  }
  return dedupe(out);
}

function twoAxisDirs(scale = 1) {
  const out = [];
  for (const s of SIGNS) {
    out.push([s[0] * scale, s[1] * scale, 0]);
    out.push([s[0] * scale, 0, s[2] * scale]);
    out.push([0, s[1] * scale, s[2] * scale]);
  }
  return dedupe(out);
}

function icosaVerts() {
  const out = [];
  for (const s of SIGNS) {
    out.push([0, s[1], s[2] * PHI]);
    out.push([s[0], s[1] * PHI, 0]);
    out.push([s[0] * PHI, 0, s[2]]);
  }
  return dedupe(out);
}

function dodecaVerts() {
  const out = [...SIGNS];
  for (const s of SIGNS) {
    out.push([0, s[1] * INV_PHI, s[2] * PHI]);
    out.push([s[0] * INV_PHI, s[1] * PHI, 0]);
    out.push([s[0] * PHI, 0, s[2] * INV_PHI]);
  }
  return dedupe(out);
}

function truncatedCubeVerts() {
  const out = [];
  for (const s of SIGNS) {
    out.push([s[0] * TRUNC, s[1] * TRUNC, s[2]]);
    out.push([s[0] * TRUNC, s[1], s[2] * TRUNC]);
    out.push([s[0], s[1] * TRUNC, s[2] * TRUNC]);
  }
  return dedupe(out);
}

function truncatedOctaVerts() {
  const out = [];
  for (const s of SIGNS) {
    out.push([0, s[1], s[2] * 2]);
    out.push([s[0], 0, s[2] * 2]);
    out.push([s[0] * 2, s[1], 0]);
    out.push([s[0] * 2, 0, s[2]]);
    out.push([0, s[1] * 2, s[2]]);
    out.push([s[0], s[1] * 2, 0]);
  }
  return dedupe(out);
}

function truncatedIcosaVerts() {
  const base = icosaVerts();
  let min = Infinity;
  for (let i = 0; i < base.length; i++) {
    for (let j = i + 1; j < base.length; j++) {
      const d = Math.hypot(
        base[i][0] - base[j][0],
        base[i][1] - base[j][1],
        base[i][2] - base[j][2],
      );
      if (d < min) min = d;
    }
  }
  const out = [];
  for (let i = 0; i < base.length; i++) {
    for (let j = 0; j < base.length; j++) {
      if (i === j) continue;
      const v = base[i];
      const u = base[j];
      const d = Math.hypot(v[0] - u[0], v[1] - u[1], v[2] - u[2]);
      if (Math.abs(d - min) < 1e-9) {
        out.push([(2 * v[0] + u[0]) / 3, (2 * v[1] + u[1]) / 3, (2 * v[2] + u[2]) / 3]);
      }
    }
  }
  return dedupe(out);
}

const hullCache = new Map();

function hullFaces(verts) {
  const cacheKey = verts.map((v) => v.join(',')).join(';');
  if (hullCache.has(cacheKey)) return hullCache.get(cacheKey);
  const n = verts.length;
  const scale = Math.max(...verts.map((v) => Math.hypot(...v)));
  const tol = 1e-9 * scale;
  const faceMap = new Map();
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const a = verts[i];
        const b = verts[j];
        const c = verts[k];
        const nrm = cross(sub(b, a), sub(c, a));
        if (Math.hypot(...nrm) < 1e-12) continue;
        let pos = 0;
        let neg = 0;
        let onPlane = 0;
        const side = new Array(n);
        for (let l = 0; l < n; l++) {
          const d = dot(sub(verts[l], a), nrm);
          side[l] = d;
          if (d > tol) pos++;
          else if (d < -tol) neg++;
          else onPlane++;
        }
        if ((pos === 0 || neg === 0) && onPlane >= 3) {
          const on = [];
          for (let l = 0; l < n; l++) {
            if (Math.abs(side[l]) <= tol) on.push(l);
          }
          const key = [...on].sort((x, y) => x - y).join(',');
          if (faceMap.has(key)) continue;
          const center = on.reduce((acc, l) => {
            const v = verts[l];
            return [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]];
          }, [0, 0, 0]);
          let out = normalize(nrm);
          if (dot(out, center) < 0) out = [-out[0], -out[1], -out[2]];
          let e1 = Math.abs(out[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
          e1 = normalize(sub(e1, [out[0] * dot(e1, out), out[1] * dot(e1, out), out[2] * dot(e1, out)]));
          const e2 = cross(out, e1);
          on.sort((p, q) => {
            const vp = verts[p];
            const vq = verts[q];
            return Math.atan2(dot(vp, e2), dot(vp, e1)) - Math.atan2(dot(vq, e2), dot(vq, e1));
          });
          faceMap.set(key, on);
        }
      }
    }
  }
  const faces = [...faceMap.values()];
  if (!faces.length) throw new Error('convex hull produced no faces');
  hullCache.set(cacheKey, faces);
  return faces;
}

function facePlanes(verts, faces) {
  return faces.map((ring) => {
    const center = ring.reduce((acc, i) => {
      const v = normalize(verts[i]);
      return [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]];
    }, [0, 0, 0]);
    const c = normalize(center);
    const v0 = normalize(verts[ring[0]]);
    const v1 = normalize(verts[ring[1]]);
    const v2 = normalize(verts[ring[2]]);
    let n = normalize(cross(sub(v1, v0), sub(v2, v0)));
    if (dot(n, c) < 0) n = [-n[0], -n[1], -n[2]];
    return { n, d: dot(n, c) };
  });
}

function findFace(planes, lonDeg, latDeg) {
  const lambda = lonDeg * Math.PI / 180;
  const phi = latDeg * Math.PI / 180;
  const cp = Math.cos(phi);
  const p = [cp * Math.cos(lambda), cp * Math.sin(lambda), Math.sin(phi)];
  let best = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < planes.length; i++) {
    const s = dot(p, planes[i].n) - planes[i].d;
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return best;
}

function buildParents(faces) {
  const edgeMap = new Map();
  faces.forEach((ring, fi) => {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (!edgeMap.has(key)) edgeMap.set(key, []);
      edgeMap.get(key).push(fi);
    }
  });
  const adj = faces.map(() => new Set());
  for (const pair of edgeMap.values()) {
    if (pair.length === 2) {
      adj[pair[0]].add(pair[1]);
      adj[pair[1]].add(pair[0]);
    }
  }
  const parents = new Array(faces.length).fill(-1);
  const seen = new Array(faces.length).fill(false);
  const queue = [0];
  seen[0] = true;
  while (queue.length) {
    const cur = queue.shift();
    for (const nb of adj[cur]) {
      if (!seen[nb]) {
        seen[nb] = true;
        parents[nb] = cur;
        queue.push(nb);
      }
    }
  }
  if (seen.includes(false)) {
    throw new Error('face adjacency graph is disconnected');
  }
  return parents;
}

const SOLIDS = {
  tetrahedron: {
    name: '四面体',
    verts: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
  },
  cube: {
    name: '立方体',
    verts: SIGNS,
  },
  octahedron: {
    name: '八面体',
    verts: axisDirs(),
  },
  dodecahedron: {
    name: '十二面体',
    verts: dodecaVerts(),
  },
  icosahedron: {
    name: '二十面体',
    verts: icosaVerts(),
  },
  cuboctahedron: {
    name: '立方八面体',
    verts: twoAxisDirs(),
  },
  truncatedCube: {
    name: '截角立方体',
    verts: truncatedCubeVerts(),
  },
  truncatedOctahedron: {
    name: '十四面体·截角八面',
    verts: truncatedOctaVerts(),
  },
  truncatedIcosahedron: {
    name: '截角二十面体',
    verts: truncatedIcosaVerts(),
  },
};

export function buildPolygons(key) {
  const solid = SOLIDS[key];
  if (!solid) throw new Error(`unknown solid: ${key}`);
  const faces = hullFaces(solid.verts);
  for (const ring of faces) {
    if (ring.length < 3) throw new Error(`degenerate face in ${key}`);
  }
  const features = faces.map((ringIdx) => {
    const ring = ringIdx.map((i) => lonLat(solid.verts[i])).reverse();
    const sum = ringIdx.reduce((acc, i) => {
      const v = normalize(solid.verts[i]);
      return [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]];
    }, [0, 0, 0]);
    return {
      type: 'Feature',
      properties: { sitecoordinates: lonLat(sum) },
      geometry: {
        type: 'Polygon',
        coordinates: [[...ring, ring[0]]],
      },
    };
  });
  return {
    type: 'FeatureCollection',
    features,
    parents: buildParents(faces),
    planes: facePlanes(solid.verts, faces),
    faceCount: faces.length,
  };
}

export function createProjection(key, { rotate = [0, -30, 0] } = {}) {
  const { features, parents, planes } = buildPolygons(key);
  const projection = geoPolyhedralVoronoi(
    parents,
    { type: 'FeatureCollection', features },
    undefined,
    (lon, lat) => findFace(planes, lon, lat),
  );
  projection.rotate(rotate);
  return projection;
}

export const POLYHEDRA = Object.entries(SOLIDS).map(([key, s]) => ({
  key,
  name: s.name,
  faceCount: hullFaces(s.verts).length,
}));
