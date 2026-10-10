// Glue tabs, in the style of Perry's paper polyhedra.
//
// From his templates the shape is consistent: a narrow trapezoid centred on an
// outline edge, covering roughly 60% of that edge, tapering towards the outer
// edge, with its depth around 10-15% of the edge length. Tabs go only on the
// outer silhouette - interior fold lines get none, since those faces meet when
// folded and need no glue.

const DEFAULTS = {
  width: 0.72, // fraction of the edge the tab spans
  depth: 0.13, // tab depth as a fraction of the edge length
  taper: 0.15, // how much the outer edge narrows, as a fraction of its length
};

function inRing(pt, ring) {
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

function distToSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (!len2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Sample a polyline segment at arc-length fractions.
 */
function subSpan(pts, from, to) {
  let total = 0;
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segs.push(l);
    total += l;
  }
  if (!(total > 0)) return null;

  const at = (frac) => {
    let target = frac * total;
    for (let i = 0; i < segs.length; i++) {
      if (target <= segs[i] || i === segs.length - 1) {
        const f = segs[i] > 0 ? Math.max(0, Math.min(1, target / segs[i])) : 0;
        const a = pts[i];
        const b = pts[i + 1];
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      }
      target -= segs[i];
    }
    return pts[pts.length - 1].slice();
  };

  const out = [at(from)];
  const steps = 8;
  for (let s = 1; s <= steps; s++) out.push(at(from + ((to - from) * s) / steps));
  return { pts: out, length: total };
}

/**
 * Build one trapezoid tab along an outline edge.
 * The tab grows on the outward side (right of travel for a CCW outline).
 */
function tabFor(basePts, opts) {
  const { depth, taper } = opts;
  const n = basePts.length;
  if (n < 2) return null;

  const dirAt = (i) => {
    const a = basePts[Math.max(0, i - 1)];
    const b = basePts[Math.min(n - 1, i + 1)];
    let d = [b[0] - a[0], b[1] - a[1]];
    const L = Math.hypot(d[0], d[1]) || 1;
    d = [d[0] / L, d[1] / L];
    return d;
  };

  // right-hand normal = outward for a counter-clockwise outline
  const outward = (i) => {
    const d = dirAt(i);
    return [d[1], -d[0]];
  };

  const outer = basePts.map((p, i) => {
    const nn = outward(i);
    return [p[0] + nn[0] * depth, p[1] + nn[1] * depth];
  });

  // Pull the two outer corners back along the edge so the tab reads as a
  // trapezoid rather than a rectangle, the way Perry's templates look.
  const chordLen = Math.hypot(
    outer[n - 1][0] - outer[0][0],
    outer[n - 1][1] - outer[0][1],
  );
  const pull = taper * chordLen;
  outer[0] = [outer[0][0] + dirAt(0)[0] * pull, outer[0][1] + dirAt(0)[1] * pull];
  outer[n - 1] = [
    outer[n - 1][0] - dirAt(n - 1)[0] * pull,
    outer[n - 1][1] - dirAt(n - 1)[1] * pull,
  ];

  return [...basePts, ...outer.reverse()];
}

/**
 * @param outline array of closed loops, each an array of edges; each edge is
 *                 { pts: [[x,y],...] } in net space
 * @param faces   face polygons in net space (used to keep tabs off the net)
 * @param opts    { width, depth, margin, taper }
 */
export function glueTabs(outline, faces, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const allEdges = outline.flat();

  // Tab only on the outer silhouette: an edge qualifies when neither side of it
  // is another face, which is true for every non-fold edge, so simply skip
  // edges that are shared between two faces (folds are not in the outline) and
  // take alternating edges so tabs never crowd each other.
  const taken = [];
  const flat = [];

  outline.forEach((loop, li) => {
    loop.forEach((edge, ei) => {
      flat.push({ edge, li, ei });
      edge.__li = li;
      edge.__ei = ei;
    });
  });

const tabs = [];
  flat.forEach((item, order) => {
    const { edge, li, ei } = item;
    // `edge` is already the point array (outline is an array of point arrays)
    const pts = edge;
    if (!pts || pts.length < 2) return;

    const loopLen = outline[li].length;
    // Perry's tabs cover about 60% of the edge, centred on it, so leave
    // (1 - width) / 2 off each end.
    const pad = (1 - cfg.width) / 2;
    const span = subSpan(pts, pad, 1 - pad);
    if (!span) return;

    // Keep clear of other parts of the net that fold back nearby, but ignore
    // the edges immediately either side of this one: those share its endpoints,
    // so they always sit closer than any sensible tab depth.
    const mid = pts[Math.floor(pts.length / 2)];
    let clearance = Infinity;
    for (const other of allEdges) {
      if (other === edge) continue;
      let adjacent = false;
      if (other.__li === li) {
        const d = Math.abs(other.__ei - ei);
        if (d <= 1 || d === loopLen - 1) adjacent = true;
      }
      if (adjacent) continue;
      for (let i = 0; i < other.length - 1; i++) {
        const d = distToSegment(mid, other[i], other[i + 1]);
        if (d < clearance) clearance = d;
      }
    }

    const depth = Math.min(cfg.depth * span.length, clearance * 0.5);
    if (!(depth > span.length * 0.02)) return;

    const base = span.pts;
    const probe = tabFor(base, { ...cfg, depth });
    if (!probe) return;

    // a tab must stay outside every face
    const half = Math.floor(probe.length / 2);
    for (let i = half; i < probe.length; i++) {
      if (faces.some((f) => inRing(probe[i], f))) return;
    }

    tabs.push({ poly: probe, depth, edge: order, li, ei });
  });

  // Perry's templates alternate: every other outline edge carries a tab, so
  // tabs never sit back to back along the silhouette.
  return tabs.filter((t) => t.edge % 2 === 0).map((t) => t.poly);
}

export { inRing, distToSegment, subSpan, tabFor };