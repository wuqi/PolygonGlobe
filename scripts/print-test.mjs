// Regression tests for the paper-net geometry.
//
// The critical one is `net vs d3 page alignment`: a point placed inside a face
// must land at the same screen position whether we go through our net-space
// transform or straight through d3's own projection(). Anything less and the
// map content drifts off the faces (which is exactly what the naive
// [dx + k*x, dy + k*y] mapping produced).

import { geoCentroid, geoInterpolate, geoRotation } from 'd3-geo';
import { SOLIDS } from '../src/print/solids.js';
import { buildNet } from '../src/print/net.js';
import { renderNet } from '../src/print/sheet.js';
import { makeInverse } from '../src/print/raster.js';

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
  // A vertex shared by several faces legitimately has one planar position per
  // face, so compare interior points instead: probe slightly inside each face
  // where exactly one face owns the location.
  const rot = geoRotation(proj.rotate());
  const k = proj.scale();
  const [tx, ty] = proj.translate();
  let maxErr = 0;
  r.nodes.forEach((n) => {
    const ring = n.face;
    const cen = geoCentroid({ type: 'Polygon', coordinates: [[...ring, ring[0]]] });
    for (let i = 0; i < ring.length; i++) {
      const q = geoInterpolate(ring[i], cen)(0.25);
      const expected = proj(rot.invert(q));
      const netPt = r.pt(n, q);
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

// The raster inverse is hand-rolled to avoid d3's ~144us/point tree walk, so it
// has to be pinned against the reference implementation from 2.worker.html:
// d3's own projection.invert(). They must agree exactly, and every pixel it
// paints has to land inside a face.
console.log('== raster inverse vs d3 projection.invert ==');
for (const s of SOLIDS) {
  const net = buildNet(s);
  const [[nx0, ny0], [nx1, ny1]] = net.bbox;
  const margin = 6;
  const aspect = (nx1 - nx0) / (ny1 - ny0);
  const [W0, H0] = [210, 297];
  const [W, H] = aspect > 1 ? [H0, W0] : [W0, H0];
  const k = Math.min((W - 2 * margin) / (nx1 - nx0), (H - 2 * margin) / (ny1 - ny0));
  const tx = (W - (nx1 - nx0) * k) / 2 - nx0 * k;
  const ty = (H - (ny1 - ny0) * k) / 2 - ny0 * k;
  net.proj.scale(k).translate([tx, ty]);

  const invertPage = makeInverse(net, { k, tx, ty });
  const pageRing = net.nodes.map((n) =>
    n.face.map((ll) => {
      const q = net.pt(n, ll);
      return [tx + q[0] * k, ty + q[1] * k];
    }),
  );
  const insideAnyFace = (x, y) =>
    pageRing.some((ring) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    });

  let both = 0;
  let agree = 0;
  let worst = 0;
  let stray = 0;
  const N = 70;
  for (let iy = 0; iy < N; iy++) {
    for (let ix = 0; ix < N; ix++) {
      const pageX = ((ix + 0.5) / N) * W;
      const pageY = ((iy + 0.5) / N) * H;
      const r = net.proj.invert([pageX, pageY]);
      const m = invertPage(pageX, pageY);
      const rOk = r && Number.isFinite(r[0]) && r[1] >= -90 && r[1] <= 90;
      if (m && !insideAnyFace(pageX, pageY)) stray++;
      if (rOk && m) {
        both++;
        let dl = Math.abs(r[0] - m[0]);
        if (dl > 180) dl = 360 - dl;
        const err = Math.hypot(dl, r[1] - m[1]);
        if (err > worst) worst = err;
        if (err < 0.01) agree++;
      }
    }
  }
  ok(both > 100 && agree === both, `${s.key}: raster inverse disagrees with d3 (${agree}/${both})`);
  ok(stray === 0, `${s.key}: raster painted outside the faces (${stray} samples)`);
  console.log(`  ${s.key.padEnd(11)} ${agree}/${both} agree, maxErr=${worst.toExponential(1)}deg, stray=${stray}`);
}

console.log(failures ? `\n${failures} FAILURES` : '\nALL PASS');
process.exit(failures ? 1 : 0);