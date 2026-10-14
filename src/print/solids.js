// Polyhedron definitions for paper nets.
//
// Follows the recipe from d3-geo-polygon issue #58: a vertex table in
// [lon, lat] plus faces given as vertex indices, and a `parents` array that
// is the unfolding tree (parents[i] is the face i is folded onto, -1 = root).
// Per-face projection, planar transforms and clipping are all handled by
// geoPolyhedralVoronoi.
//
// To add a solid, append an entry to SOLIDS. Nothing else needs to change.

import { geoCentroid, geoInterpolate } from 'd3-geo';
import {
  geoCubic,
  geoDodecahedral,
  geoIcosahedral,
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

// --- tetrahedron: 4 equilateral triangles ------------------------------
const LAT = -19.47122063449069;
const tetra = {
  literalFaces: [
    [[-180, LAT], [-60, LAT], [60, LAT]],
    [[0, 90], [60, LAT], [-60, LAT]],
    [[0, 90], [-60, LAT], [-180, LAT]],
    [[0, 90], [-180, LAT], [60, LAT]],
  ],
  parents: [-1, 0, 1, 2],
  rotate: [29.999999999999996, 180, 0],
  angle: 29.999999999999996,
};

// --- cube: 6 squares ---------------------------------------------------
const cube = {
  vertices: [
    [0, PHI1], [90, PHI1], [180, PHI1], [-90, PHI1],
    [0, -PHI1], [90, -PHI1], [180, -PHI1], [-90, -PHI1],
  ],
  faces: [
    [0, 3, 2, 1], [0, 1, 5, 4], [1, 2, 6, 5],
    [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7],
  ],
  parents: [-1, 0, 1, 5, 3, 2],
  rotate: [120, 0],
};

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
  { key: 'tetra', name: '正四面体', en: 'Tetrahedron', ...tetra },
  { key: 'tetraLee', name: '李氏四面体', en: 'Tetrahedral (Lee)', ...tetraLee },
  { key: 'cube', name: '正方体', en: 'Cube', ...cube },
  { key: 'cubic', name: '立方体(库)', en: 'Cubic (library)', ...cubicLib },
  { key: 'octa', name: '正八面体', en: 'Octahedron', ...octa },
  { key: 'butterfly', name: '蝶形八面体', en: 'Butterfly', ...butterfly },
  { key: 'icosa', name: '正二十面体', en: 'Icosahedron', ...icosahedron },
  { key: 'icosaIco', name: '二十面体(库)', en: 'Icosahedral (library)', ...icosaIco },
  { key: 'dodeca', name: '正十二面体', en: 'Dodecahedron', ...dodecahedron },
  { key: 'dodecaFil', name: '十二面体(Fil)', en: 'Dodecahedral (Fil)', ...dodecaFil },
  { key: 'rhdodeca', name: '菱形十二面体', en: 'Rhombic Dodecahedron', ...rhombicDodeca },
  { key: 'deltoidal', name: '鸢形六十面体', en: 'Deltoidal Hexecontahedron', ...deltoidal },
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
    rotate: solid.rotate || [0, 0],
    angle: solid.angle || 0,
  };
}