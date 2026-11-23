// Polyhedron definitions for paper nets.
//
// Follows the recipe from d3-geo-polygon issue #58: a vertex table in
// [lon, lat] plus faces given as vertex indices, and a `parents` array that
// is the unfolding tree (parents[i] is the face i is folded onto, -1 = root).
// Per-face projection, planar transforms and clipping are all handled by
// geoPolyhedralVoronoi.
//
// To add a solid, append an entry to SOLIDS. Nothing else needs to change.

import { geoCentroid, geoGnomonic, geoInterpolate } from 'd3-geo';
import {
  geoCubic,
  geoDodecahedral,
  geoIcosahedral,
  geoPolyhedral,
  geoPolyhedralButterfly,
  geoTetrahedralLee,
} from 'd3-geo-polygon';

const D = 180 / Math.PI;

const PHI1 = Math.atan(Math.SQRT1_2) * D;
const THETA = Math.atan(0.5) * D;
const A0 = Math.asin(1 / Math.sqrt(3)) * D;
const A1 = Math.acos((Math.sqrt(5) - 1) / Math.sqrt(3) / 2) * D;
const A2 = 90 - A1;
const A3 = (Math.acos(-(1 + Math.sqrt(5)) / Math.sqrt(3) / 2)) * D;

const mid = (a, b) => geoInterpolate(a, b)(0.5);
const centroid = (pts) => geoCentroid({ type: 'MultiPoint', coordinates: pts });

// --- octahedron: 8 triangles -------------------------------------------
const octa = {
  vertices: [[0, 90], [-90, 0], [0, 0], [90, 0], [180, 0], [0, -90]],
  faces: [
    [0, 2, 1], [0, 3, 2], [5, 1, 2], [5, 2, 3],
    [0, 1, 4], [0, 4, 3], [5, 4, 1], [5, 3, 4],
  ],
  parents: [-1, 3, 0, 2, 0, 1, 4, 5],
};

// --- dodecahedron: 12 pentagons (corners listed directly) --------------
const dodecahedron = {
  literalFaces: [
    [[45, A0], [0, A1], [180, A1], [135, A0], [90, A2]],
    [[45, A0], [A2, 0], [-A2, 0], [-45, A0], [0, A1]],
    [[45, A0], [90, A2], [90, -A2], [45, -A0], [A2, 0]],
    [[0, A1], [-45, A0], [-90, A2], [-135, A0], [180, A1]],
    [[A2, 0], [45, -A0], [0, -A1], [-45, -A0], [-A2, 0]],
    [[90, A2], [135, A0], [A3, 0], [135, -A0], [90, -A2]],
    [[45, -A0], [90, -A2], [135, -A0], [180, -A1], [0, -A1]],
    [[135, A0], [180, A1], [-135, A0], [-A3, 0], [A3, 0]],
    [[-45, A0], [-A2, 0], [-45, -A0], [-90, -A2], [-90, A2]],
    [[-45, -A0], [0, -A1], [180, -A1], [-135, -A0], [-90, -A2]],
    [[135, -A0], [A3, 0], [-A3, 0], [-135, -A0], [180, -A1]],
    [[-135, A0], [-90, A2], [-90, -A2], [-135, -A0], [-A3, 0]],
  ],
  parents: [-1, 0, 4, 8, 1, 2, 2, 3, 1, 8, 6, 3],
};

// --- icosahedron: 20 triangles -----------------------------------------
const icosahedron = {
  vertices: [[0, 90], [0, -90]].concat(
    Array.from({ length: 10 }, (_, i) => [(((i * 36 + 180) % 360) - 180), i & 1 ? THETA : -THETA]),
  ),
  faces: [
    [0, 3, 11], [0, 5, 3], [0, 7, 5], [0, 9, 7], [0, 11, 9],
    [2, 11, 3], [3, 4, 2], [4, 3, 5], [5, 6, 4], [6, 5, 7],
    [7, 8, 6], [8, 7, 9], [9, 10, 8], [10, 9, 11], [11, 2, 10],
    [1, 2, 4], [1, 4, 6], [1, 6, 8], [1, 8, 10], [1, 10, 2],
  ],
  parents: [-1, 0, 1, 11, 3, 0, 7, 1, 7, 8, 9, 10, 11, 12, 13, 6, 8, 10, 19, 15],
  rotate: [120, 0],
};

// --- rhombic dodecahedron: 12 rhombi (issue #58) -----------------------
// Note the site calculation: the face site must be computed from the open ring.
// Passing an already-closed ring to geoCentroid counts the first vertex twice
// and misplaces the site, which is what split faces apart in issue #58. The
// library itself drops the closing vertex before computing the default
// centroid, so omitting sitecoordinates is the safe route (see net.js).
const rhombicDodeca = {
  vertices: [
    [0, 90], [0, PHI1], [90, PHI1], [180, PHI1], [-90, PHI1],
    [45, 0], [135, 0], [-135, 0], [-45, 0],
    [0, -PHI1], [90, -PHI1], [180, -PHI1], [-90, -PHI1],
    [0, -90],
  ],
  faces: [
    [0, 1, 8, 4], [0, 2, 5, 1], [0, 3, 6, 2], [0, 4, 7, 3],
    [1, 5, 9, 8], [2, 6, 10, 5], [3, 7, 11, 6], [4, 8, 12, 7],
    [8, 9, 13, 12], [5, 10, 13, 9], [6, 11, 13, 10], [7, 12, 13, 11],
  ],
  parents: [-1, 0, 6, 2, 1, 9, 11, 3, 4, 8, 5, 10],
};

// --- deltoidal hexecontahedron: 60 kites (issue #57) -------------------
// The library's own deltoidal.js supplies an explicit site per face, computed
// from the OPEN ring via a MultiPoint. Reproducing it here keeps the kites from
// being split, and shows the shape a hand-written solid should take.
function kiteFaces() {
  const verts = [[0, 90], [0, -90]].concat(
    Array.from({ length: 10 }, (_, i) => [(((i * 36 + 180) % 360) - 180), i & 1 ? THETA : -THETA]),
  );
  const tris = [
    [0, 3, 11], [0, 5, 3], [0, 7, 5], [0, 9, 7], [0, 11, 9],
    [2, 11, 3], [3, 4, 2], [4, 3, 5], [5, 6, 4], [6, 5, 7],
    [7, 8, 6], [8, 7, 9], [9, 10, 8], [10, 9, 11], [11, 2, 10],
    [1, 2, 4], [1, 4, 6], [1, 6, 8], [1, 8, 10], [1, 10, 2],
  ];
  const out = [];
  for (const tri of tris) {
    const t = tri.map((i) => verts[i]);
    const a0 = mid(t[1], t[2]);
    const a1 = mid(t[0], t[2]);
    const a2 = mid(t[0], t[1]);
    const c = centroid(t);
    out.push([t[0], a2, c, a1], [t[1], a0, c, a2], [t[2], a1, c, a0]);
  }
  return out;
}

const deltoidal = {
  literalFaces: kiteFaces(),
  parents: [
    -1, 2, 0, 5, 5, 22, 8, 8, 28, 11, 11, 34, 14, 14, 40, 16, 2, 16, 17, 18, 18,
    19, 21, 21, 23, 24, 24, 25, 27, 27, 29, 30, 30, 31, 33, 33, 35, 36, 36, 37, 39,
    39, 41, 42, 42, 46, 20, 46, 49, 26, 49, 52, 32, 52, 55, 38, 55, 58, 44, 58,
  ],
  rotate: [108, 0],
};

// --- deltoidal icositetrahedron: 24 kites -----------------------------
// Dual of the rhombicuboctahedron. The 24 kites are the spherical Voronoi
// cells of the rhombicuboctahedron's vertices (all permutations of
// (±1, ±1, ±1+√2)), precomputed offline with d3-geo-voronoi and baked in here
// so no extra dependency ships. Each face carries its Voronoi site so the
// library's gnomonic face projection centres on the kite rather than on the
// ring's area centroid (which would split the kites apart).
const deltoidal24 = {
  literalFaces: [
    [[160.704657, -29.78401], [-175.029238, -72.929765], [90.528768, -59.998943], [109.182681, -27.125795]],
    [[-153.329046, -14.272812], [-131.131908, -44.030127], [-175.029238, -72.929765], [160.704657, -29.78401]],
    [[-169.830628, 17.004077], [-153.329046, -14.272812], [160.704657, -29.78401], [153.540559, 14.682402]],
    [[153.540559, 14.682402], [160.704657, -29.78401], [109.182681, -27.125795], [118.454795, 6.976375]],
    [[65.788849, -8.515256], [109.182681, -27.125795], [90.528768, -59.998943], [35.529645, -45.186645]],
    [[35.529645, -45.186645], [90.528768, -59.998943], [-175.029238, -72.929765], [-38.512606, -58.779573]],
    [[-90, -30], [-38.512606, -58.779573], [-175.029238, -72.929765], [-131.131908, -44.030127]],
    [[-114.211151, 8.515256], [-90, -30], [-131.131908, -44.030127], [-153.329046, -14.272812]],
    [[-144.470355, 45.186645], [-114.211151, 8.515256], [-153.329046, -14.272812], [-169.830628, 17.004077]],
    [[-144.470355, 45.186645], [-169.830628, 17.004077], [153.540559, 14.682402], [141.487394, 58.779573]],
    [[141.487394, 58.779573], [153.540559, 14.682402], [118.454795, 6.976375], [90, 30]],
    [[90, 30], [118.454795, 6.976375], [109.182681, -27.125795], [65.788849, -8.515256]],
    [[26.670954, 14.272812], [65.788849, -8.515256], [35.529645, -45.186645], [10.169372, -17.004077]],
    [[-26.459441, -14.682402], [10.169372, -17.004077], [35.529645, -45.186645], [-38.512606, -58.779573]],
    [[-61.545205, -6.976375], [-26.459441, -14.682402], [-38.512606, -58.779573], [-90, -30]],
    [[-70.817319, 27.125795], [-61.545205, -6.976375], [-90, -30], [-114.211151, 8.515256]],
    [[-89.471232, 59.998943], [-70.817319, 27.125795], [-114.211151, 8.515256], [-144.470355, 45.186645]],
    [[-89.471232, 59.998943], [-144.470355, 45.186645], [141.487394, 58.779573], [4.970762, 72.929765]],
    [[4.970762, 72.929765], [141.487394, 58.779573], [90, 30], [48.868092, 44.030127]],
    [[48.868092, 44.030127], [90, 30], [65.788849, -8.515256], [26.670954, 14.272812]],
    [[-19.295343, 29.78401], [26.670954, 14.272812], [10.169372, -17.004077], [-26.459441, -14.682402]],
    [[-70.817319, 27.125795], [-19.295343, 29.78401], [-26.459441, -14.682402], [-61.545205, -6.976375]],
    [[-89.471232, 59.998943], [4.970762, 72.929765], [-19.295343, 29.78401], [-70.817319, 27.125795]],
    [[-19.295343, 29.78401], [4.970762, 72.929765], [48.868092, 44.030127], [26.670954, 14.272812]],
  ],
  sites: [
    [132.530488, -51.922495], [-164.933026, -42.947882], [177.67679, -4.016225], [135.88988, -10.130068],
    [75.206397, -37.658059], [35.910122, -75.547399], [-99.988212, -59.59959], [-122.177319, -20.818987],
    [-144.568584, 14.825565], [175.74399, 37.827329], [125.286796, 30.493425], [95.035352, 0.019834],
    [35.431416, -14.825565], [-4.25601, -37.827329], [-54.713204, -30.493425], [-84.964648, -0.019834],
    [-104.793603, 37.658059], [-144.089878, 75.547399], [80.011788, 59.59959], [57.822681, 20.818987],
    [-2.32321, 4.016225], [-44.11012, 10.130068], [-47.469512, 51.922495], [15.066974, 42.947882],
  ],
  parents: [-1, 0, 1, 2, 0, 0, 1, 1, 2, 2, 3, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 18],
  // The flower net has 4-fold symmetry, so only 90 degrees of unfold need
  // searching. This is what makes the sheet fill the page at any rotation.
  autoAngle: 90,
};

// --- pentakis dodecahedron: 60 triangles (from observable notebook 881a8431)
// Each dodecahedron pentagon is fanned into five triangles meeting at its
// centroid, giving the star-shaped faces.
function pentakisFaces() {
  // The dodecahedron listing below is already in the permuted order the
  // parents table indexes into (0,1,2,5,7,3,6,10,11,8,4,9 - the source
  // notebook annotates each entry with its original index).
  const dodeca = [
    [[45, A0], [0, A1], [180, A1], [135, A0], [90, A2]], // 0
    [[45, A0], [A2, 0], [-A2, 0], [-45, A0], [0, A1]], // 1
    [[45, A0], [90, A2], [90, -A2], [45, -A0], [A2, 0]], // 2
    [[90, A2], [135, A0], [A3, 0], [135, -A0], [90, -A2]], // 5
    [[135, A0], [180, A1], [-135, A0], [-A3, 0], [A3, 0]], // 7
    [[0, A1], [-45, A0], [-90, A2], [-135, A0], [180, A1]], // 3
    [[45, -A0], [90, -A2], [135, -A0], [180, -A1], [0, -A1]], // 6
    [[135, -A0], [A3, 0], [-A3, 0], [-135, -A0], [180, -A1]], // 10
    [[-135, A0], [-90, A2], [-90, -A2], [-135, -A0], [-A3, 0]], // 11
    [[-45, A0], [-A2, 0], [-45, -A0], [-90, -A2], [-90, A2]], // 8
    [[A2, 0], [45, -A0], [0, -A1], [-45, -A0], [-A2, 0]], // 4
    [[-45, -A0], [0, -A1], [180, -A1], [-135, -A0], [-90, -A2]], // 9
  ];
  const out = [];
  for (const face of dodeca) {
    const c = centroid(face);
    for (let i = 0; i < 5; i++) {
      out.push([face[i], face[(i + 1) % 5], c]);
    }
  }
  return out;
}

const pentakis = {
  literalFaces: pentakisFaces(),
  parents: [
    -1, 2, 0, 5, 5, 22, 8, 8, 28, 11,
    11, 34, 14, 14, 40, 16, 2, 15, 17, 18,
    18, 19, 21, 21, 23, 24, 24, 25, 27, 27,
    29, 30, 30, 31, 33, 33, 35, 36, 36, 37,
    39, 39, 41, 42, 42, 46, 20, 46, 49, 26,
    49, 52, 32, 52, 55, 38, 55, 58, 44, 58,
  ],
  rotate: [-80, 0, -32],
  angle: 55,
};

// --- truncated / rectified solids -----------------------------------------
// These four follow the construction used by the reference print pages: derive
// unit-sphere vertices, give each face a gnomonic projection scaled by the
// face-plane distance (so faces of different sizes share edges exactly), and
// hand an explicit spanning tree to geoPolyhedral. The `parents` arrays were
// searched offline for a compact, non-overlapping net. `autoAngle` then lets
// buildNet rotate the net to the angle that fills the sheet best.
const vAdd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vMul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const vDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vLen = (a) => Math.hypot(a[0], a[1], a[2]);
const vNorm = (a) => vMul(a, 1 / vLen(a));
const toLL = (p) => [Math.atan2(p[1], p[0]) * D, Math.asin(p[2]) * D];

// Turns a vertex table into face records (loops on the unit sphere), each with
// its own gnomonic centered on the face normal and scaled by the face distance.
function faceMaker(P) {
  const LL = P.map(toLL);
  const faces = [];
  const push = (kind, ids) => {
    const c = vMul(ids.map((i) => P[i]).reduce(vAdd), 1 / ids.length);
    // d3 wants the outer ring clockwise seen from outside; flip if it is not.
    if (vDot(vCross(vSub(P[ids[1]], P[ids[0]]), vSub(P[ids[2]], P[ids[0]])), c) > 0) ids = ids.slice().reverse();
    const d = vLen(c);
    const n = vNorm(c);
    const cll = toLL(n);
    faces.push({
      kind,
      face: ids.map((i) => LL[i]),
      d,
      n,
      project: geoGnomonic().scale(d).translate([0, 0]).rotate([-cll[0], -cll[1]]),
    });
  };
  return { faces, push };
}

// Selects the vertices sitting on each face plane given by `normals`, ordered
// around the normal, and pushes them as faces.
function facesFromNormals(P, normals) {
  const { faces, push } = faceMaker(P);
  normals.forEach(([kind, n]) => {
    const m = Math.max(...P.map((p) => vDot(p, n)));
    const ids = P.map((p, i) => i).filter((i) => vDot(P[i], n) > m - 1e-9);
    const ax = Math.abs(n[0]) < 0.6 ? [1, 0, 0] : [0, 1, 0];
    const e1 = vNorm(vCross(n, ax));
    const e2 = vCross(n, e1);
    const ang = (i) => {
      const r = vSub(P[i], vMul(n, vDot(P[i], n)));
      return Math.atan2(vDot(r, e2), vDot(r, e1));
    };
    push(kind, ids.sort((x, y) => ang(x) - ang(y)));
  });
  return faces;
}

// Wires the faces into geoPolyhedral using the given unfolding tree. The face
// finder is the reference's: the ray from the centre hits the face whose plane
// is met furthest out, i.e. argmax dot(q, n) / d.
function makePolyhedral(faces, parents, root) {
  const nodes = faces.map((f) => ({ face: f.face, project: f.project, children: [] }));
  parents.forEach((p, i) => {
    if (p >= 0) nodes[p].children.push(nodes[i]);
  });
  const N = faces.length;
  return geoPolyhedral(nodes[root], (l, p) => {
    const x = Math.cos(p);
    const q = [x * Math.cos(l), x * Math.sin(l), Math.sin(p)];
    let b = 0;
    let bv = -9;
    for (let i = 0; i < N; i++) {
      const v = vDot(q, faces[i].n) / faces[i].d;
      if (v > bv) {
        bv = v;
        b = i;
      }
    }
    return nodes[b];
  });
}

// Truncated octahedron: vertices are the permutations of (0, ±1, ±2); faces are
// 6 squares (axis normals) and 8 hexagons ((±1, ±1, ±1) normals).
function truncatedOctaFaces() {
  const base = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const verts = [];
  base.forEach((q) => {
    for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
      let k = 0;
      verts.push(q.map((x) => (x ? x * [s1, s2][k++] : 0)));
    }
  });
  const normals = [];
  for (let a = 0; a < 3; a++) for (const s of [1, -1]) {
    const n = [0, 0, 0];
    n[a] = s;
    normals.push(['sq', n]);
  }
  for (const x of [1, -1]) for (const y of [1, -1]) for (const z of [1, -1]) normals.push(['hex', vNorm([x, y, z])]);
  return facesFromNormals(verts.map(vNorm), normals);
}
const TRUNC_OCTA_PARENTS = [6, 12, 6, 12, 6, 7, -1, 6, 4, 7, 6, 7, 4, 5];

// Truncated icosahedron: icosahedron vertices with each edge split at 1/3; 12
// pentagons (icosahedron vertices) and 20 hexagons (icosahedron faces).
function truncatedIcosaFaces() {
  const PHI = (1 + Math.sqrt(5)) / 2;
  const IV = [];
  for (const s1 of [1, -1]) for (const s2 of [1, -1]) IV.push([0, s1, s2 * PHI], [s1, s2 * PHI, 0], [s2 * PHI, 0, s1]);
  const nbr = IV.map((v, i) => IV.map((w, j) => j).filter((j) => j !== i && Math.abs(vLen(vSub(IV[i], IV[j])) - 2) < 1e-6));
  const vid = {};
  const P = [];
  IV.forEach((v, i) => nbr[i].forEach((j) => {
    vid[i + '-' + j] = P.length;
    P.push(vNorm(vAdd(v, vMul(vSub(IV[j], v), 1 / 3))));
  }));
  const { faces, push } = faceMaker(P);
  IV.forEach((v, i) => {
    const n = vNorm(v);
    const ax = Math.abs(n[0]) < 0.6 ? [1, 0, 0] : [0, 1, 0];
    const e1 = vNorm(vCross(n, ax));
    const e2 = vCross(n, e1);
    const ang = (j) => {
      const d = vSub(IV[j], v);
      return Math.atan2(vDot(d, e2), vDot(d, e1));
    };
    push('pent', nbr[i].slice().sort((a, b) => ang(a) - ang(b)).map((j) => vid[i + '-' + j]));
  });
  for (let a = 0; a < 12; a++) for (const b of nbr[a]) for (const c of nbr[b]) {
    if (a < b && b < c && nbr[a].includes(c)) {
      push('hex', [vid[a + '-' + b], vid[b + '-' + a], vid[b + '-' + c], vid[c + '-' + b], vid[c + '-' + a], vid[a + '-' + c]]);
    }
  }
  return faces;
}
const TRUNC_ICOSA_PARENTS = [
  12, 17, 20, 22, 25, 29, 28, 29, 21, 27, 30, 22, 1, 7, 2, 6, 5, 19, 7, 3, 21, 4, 18, 3, 11, 10, 8, 4, 25, -1, 29, 10,
];

// Rhombicuboctahedron: vertices are the permutations of (±1, ±1, ±1+√2); faces
// are 6 axial squares, 12 edge squares and 8 triangles.
function rhombicuboctaFaces() {
  const A1 = 1 + Math.SQRT2;
  const signs = [
    [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
    [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
  ];
  const verts = [];
  for (const q of [[1, 1, A1], [1, A1, 1], [A1, 1, 1]]) for (const sg of signs) verts.push(q.map((x, i) => x * sg[i]));
  const normals = [];
  for (let k = 0; k < 3; k++) for (const s of [1, -1]) {
    const n = [0, 0, 0];
    n[k] = s;
    normals.push(['sq', n]);
  }
  for (let k = 0; k < 3; k++) {
    const i = (k + 1) % 3;
    for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
      const n = [0, 0, 0];
      n[k] = s1;
      n[i] = s2;
      normals.push(['esq', vNorm(n)]);
    }
  }
  for (const x of [1, -1]) for (const y of [1, -1]) for (const z of [1, -1]) normals.push(['tri', vNorm([x, y, z])]);
  return facesFromNormals(verts.map(vNorm), normals);
}
// Cross-shaped net (reference page): the 8 equatorial squares form one column,
// each edge-square carries a triangle to left and right, the axial ±x/±y
// squares carry their mid-latitude edge-squares, and the ±z squares cap the
// +x axial square. 25 hinges, 23 cuts.
const RHOMBICUBOCTA_PARENTS = [-1, 8, 6, 7, 14, 16, 0, 0, 2, 3, 2, 2, 3, 3, 0, 1, 0, 1, 6, 6, 7, 7, 8, 8, 9, 9];

// Icosidodecahedron: midpoints of the icosahedron's 30 edges; faces are 12
// pentagons (icosahedron vertices) and 20 triangles (icosahedron faces).
function icosidodecaFaces() {
  const PHI = (1 + Math.sqrt(5)) / 2;
  const IV = [];
  for (const s1 of [1, -1]) for (const s2 of [1, -1]) IV.push([0, s1, s2 * PHI], [s1, s2 * PHI, 0], [s2 * PHI, 0, s1]);
  const nbr = IV.map((v, i) => IV.map((w, j) => j).filter((j) => j !== i && Math.abs(vLen(vSub(IV[i], IV[j])) - 2) < 1e-6));
  const verts = [];
  for (let i = 0; i < 12; i++) for (const j of nbr[i]) if (i < j) verts.push(vNorm(vAdd(IV[i], IV[j])));
  const normals = IV.map((v) => ['pent', vNorm(v)]);
  for (let a = 0; a < 12; a++) for (const b of nbr[a]) for (const c of nbr[b]) {
    if (a < b && b < c && nbr[a].includes(c)) normals.push(['tri', vNorm(vAdd(vAdd(IV[a], IV[b]), IV[c]))]);
  }
  return facesFromNormals(verts.map(vNorm), normals);
}
// Double pinwheel-flower net (reference page): the 32 faces split into a north
// flower (polar pentagon + 5 petals of triangle→pentagon→triangle) and a south
// flower, joined by a single hinge. 31 hinges; the wedge gaps are the cuts.
const ICOSIDODECA_PARENTS = [
  -1, 13, 12, 24, 26, 15, 14, 16, 17, 23, 27, 31, 0, 0, 0, 0, 0, 2, 3, 1, 4, 2, 7, 8, 9, 6, 9, 9, 10, 11, 5, 9,
];

const truncOcta = {
  make: () => makePolyhedral(truncatedOctaFaces(), TRUNC_OCTA_PARENTS, 6),
  autoAngle: 180,
};
const truncIcosa = {
  make: () => makePolyhedral(truncatedIcosaFaces(), TRUNC_ICOSA_PARENTS, 29),
  autoAngle: 180,
};
const rhombicubocta = {
  make: () => makePolyhedral(rhombicuboctaFaces(), RHOMBICUBOCTA_PARENTS, 0),
  autoAngle: 180,
};
const icosidodeca = {
  make: () => makePolyhedral(icosidodecaFaces(), ICOSIDODECA_PARENTS, 0),
  autoAngle: 180,
};

// --- projections built from d3-geo-polygon's own factories ----------------
// These carry their own vertices, unfolding tree, angle and rotation, so they
// only need `make`; the table-driven path above cannot express them.
const icosaIco = { make: () => geoIcosahedral() };
const butterfly = { make: () => geoPolyhedralButterfly() };
const tetraLee = { make: () => geoTetrahedralLee() };
const cubicLib = { make: () => geoCubic() };

// From https://observablehq.com/@fil/dodecahedral-projection - a different
// unfolding tree and rotation than the library default.
const dodecaFil = {
  make: () =>
    geoDodecahedral()
      .parents([-1, 0, 0, 0, 9, 0, 9, 0, 3, 8, 9, 9])
      .angle(72)
      .rotate([3, 0, -32]),
};

export const SOLIDS = [
  { key: 'tetraLee', name: '李氏四面体', en: 'Tetrahedral (Lee)', ...tetraLee },
  { key: 'cubic', name: '立方体(库)', en: 'Cubic (library)', ...cubicLib },
  { key: 'octa', name: '正八面体', en: 'Octahedron', ...octa },
  { key: 'butterfly', name: '蝶形八面体', en: 'Butterfly', ...butterfly },
  { key: 'icosa', name: '正二十面体', en: 'Icosahedron', ...icosahedron },
  { key: 'icosaIco', name: '二十面体(库)', en: 'Icosahedral (library)', ...icosaIco },
  { key: 'dodeca', name: '正十二面体', en: 'Dodecahedron', ...dodecahedron },
  { key: 'dodecaFil', name: '十二面体(Fil)', en: 'Dodecahedral (Fil)', ...dodecaFil },
  { key: 'rhdodeca', name: '菱形十二面体', en: 'Rhombic Dodecahedron', ...rhombicDodeca },
  { key: 'deltoidal', name: '鸢形六十面体', en: 'Deltoidal Hexecontahedron', ...deltoidal },
  { key: 'deltoidal24', name: '鸢形二十四面体', en: 'Deltoidal Icositetrahedron', ...deltoidal24 },
  { key: 'truncOcta', name: '截角八面体', en: 'Truncated Octahedron', ...truncOcta },
  { key: 'truncIcosa', name: '截角二十面体', en: 'Truncated Icosahedron', ...truncIcosa },
  { key: 'rhombicubocta', name: '小斜方截半立方体', en: 'Rhombicuboctahedron', ...rhombicubocta },
  { key: 'icosidodeca', name: '截半二十面体', en: 'Icosidodecahedron', ...icosidodeca },
  // TODO(pentakis): the parents table from the source notebook does not match
  // the face order produced here, so geoPolyhedralVoronoi throws. Kept out of
  // the list until the ordering is reconciled.
  // { key: 'pentakis', name: '五角星十二面体', en: 'Pentakis Dodecahedron', ...pentakis },
];

export { pentakis };

// Resolve a solid into { faces: [[lon,lat],...], parents } form.
// Solids built from a library factory only have `make`; their geometry lives
// inside the projection, so there is nothing to resolve.
export function resolve(solid) {
  if (solid.make) return { faces: [], parents: [], rotate: [0, 0], angle: 0 };
  const faces = solid.literalFaces
    ? solid.literalFaces.map((f) => f.map((p) => [p[0], p[1]]))
    : solid.faces.map((idx) => idx.map((i) => [solid.vertices[i][0], solid.vertices[i][1]]));
  return {
    faces,
    parents: solid.parents.slice(),
    sites: solid.sites ? solid.sites.map((s) => [s[0], s[1]]) : null,
    rotate: solid.rotate || [0, 0],
    angle: solid.angle || 0,
  };
}