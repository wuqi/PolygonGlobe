// Regression tests for the paper-net geometry.
//
// The critical one is `net vs d3 page alignment`: a point placed inside a face
// must land at the same screen position whether we go through our net-space
// transform or straight through d3's own projection(). Anything less and the
// map content drifts off the faces (which is exactly what the naive
// [dx + k*x, dy + k*y] mapping produced).

import { geoCentroid, geoInterpolate, geoRotation } from 'd3-geo';
import { SOLIDS } from '../src/print/solids.js';
import { buildNet, rawToNet } from '../src/print/net.js';
import { renderNet } from '../src/print/sheet.js';

let failures = 0;
const ok = (cond, msg) => {
  if (!cond) {
    failures++;
    console.log(`  FAIL: ${msg}`);
  }
};

console.log('== net structure ==');
for (const s of SOLIDS) {
  const r = buildNet(s);
  ok(r.folds === r.expectFolds, `${s.key}: folds=${r.folds} expect=${r.expectFolds}`);
  ok(r.overlaps === 0, `${s.key}: ${r.overlaps} overlapping faces`);
  ok(r.faces.length === r.faceCount, `${s.key}: face array mismatch`);
  const [b0, b1] = r.bbox;
  ok([b0[0], b0[1], b1[0], b1[1]].every(Number.isFinite), `${s.key}: bbox not finite`);
  ok(b1[0] > b0[0] && b1[1] > b0[1], `${s.key}: bbox degenerate`);
  console.log(`  ${s.key.padEnd(11)} faces=${String(r.faceCount).padStart(3)} folds=${String(r.folds).padStart(3)} cuts=${String(r.cuts).padStart(4)} overlaps=${r.overlaps} aspect=${r.aspect.toFixed(2)}`);
}

console.log('== net vs d3 page alignment ==');
for (const s of SOLIDS) {
  const r = buildNet(s);
  const proj = r.proj;
  const rot = geoRotation(proj.rotate());
  const k = proj.scale();
  const [tx, ty] = proj.translate();
  let maxErr = 0;
  r.nodes.forEach((n) => {
    const ring = n.face;
    const cen = geoCentroid({ type: 'Polygon', coordinates: [[...ring, ring[0]]] });
    for (let i = 0; i < ring.length; i++) {
      // Pull the corner inside the face, and stay off the antimeridian where
      // rot.invert jumps by 360 and the point lands on a different face.
      const q = geoInterpolate(ring[i], cen)(0.2);
      if (Math.abs(Math.abs(q[0]) - 180) < 5) continue;
      const expected = proj(rot.invert(q));
      const netPt = rawToNet(r.xf, (() => {
        const p = n.project(q);
        const t = n.transform;
        return t
          ? [t[0] * p[0] + t[1] * p[1] + t[2], -(t[3] * p[0] + t[4] * p[1] + t[5])]
          : [p[0], -p[1]];
      })());
      const got = [tx + k * netPt[0], ty + k * netPt[1]];
      const err = Math.hypot(expected[0] - got[0], expected[1] - got[1]);
      if (err > maxErr) maxErr = err;
    }
  });
  ok(maxErr < 1e-6, `${s.key}: net/page misaligned, maxErr=${maxErr.toExponential(2)}`);
  console.log(`  ${s.key.padEnd(11)} maxErr=${maxErr.toExponential(2)}`);
}

console.log('== svg output ==');
for (const s of SOLIDS) {
  for (const [page, style] of [['A4', 'color'], ['A4', 'mono'], ['A5', 'color']]) {
    const { svg, W, H } = renderNet({ solid: s, page, style });
    const tag = `${s.key}/${page}/${style}`;
    ok(svg.startsWith('<svg'), `${tag}: no svg root`);
    ok(!svg.includes('NaN'), `${tag}: NaN in output`);
    ok(!svg.includes('Infinity'), `${tag}: Infinity in output`);
    ok(svg.includes(`viewBox="0 0 ${W} ${H}"`), `${tag}: viewBox mismatch`);
    ok(svg.includes('<clipPath'), `${tag}: no clipPath`);
  }
  console.log(`  ${s.key.padEnd(11)} A4/color, A4/mono, A5/color OK`);
}

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);