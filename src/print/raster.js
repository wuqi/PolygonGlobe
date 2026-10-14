// Blue Marble on a polyhedral net.
//
// The source is an equirectangular photo, so the honest way to fill a sheet is
// to walk output pixels and ask which lon/lat each one is. d3-geo-polygon's own
// invert() does that with a recursive tree walk that tries every face's
// projection in turn - correct, but ~144us a pixel, i.e. minutes per A4 sheet.
//
// Two things make it affordable. Each face is a gnomonic projection centred on
// its Voronoi site, and d3's geoGnomonic has an analytic inverse, so one face
// can be inverted with closed-form arithmetic instead of a search. And each
// face's planar footprint is a quadrilateral we already know, so a pixel only
// tries the faces whose bounding box contains it.
//
// The result agrees with the reference implementation (see scripts/diag-raster3
// .mjs, which compares against d3's invert) to within a rounding step.

import { geoRotation } from 'd3-geo';

const RAD = Math.PI / 180;

// Unit vector for a lon/lat, for cheap great-circle comparison.
function lonLatVec(ll) {
  const a = ll[1] * RAD;
  const o = ll[0] * RAD;
  const c = Math.cos(a);
  return [c * Math.cos(o), c * Math.sin(o), Math.sin(a)];
}

function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Everything needed to turn a page point into lon/lat for one face.
function faceSolver(net, node, k, tx, ty) {
  const site = node.site || node.centroid;

  // net.js maps a point with
  //   p    = gp(lonlat)
  //   q    = t ? [t0*p0+t1*p1+t2, -(t3*p0+t4*p1+t5)] : [p0, -p1]
  //   net  = R * (q - c),  R = [[cosA,-sinA],[-sinA,-cosA]]
  //   page = [tx,ty] + k * net
  // so inverting means undoing the planar step as well - and the y negation
  // applies even when the node carries no transform.
  let m00 = 1;
  let m01 = 0;
  let m10 = 0;
  let m11 = -1;
  let b0 = 0;
  let b1 = 0;
  if (node.transform) {
    const t = node.transform;
    m00 = t[0];
    m01 = t[1];
    m10 = -t[3];
    m11 = -t[4];
    b0 = t[2];
    b1 = -t[5];
  }
  const det = m00 * m11 - m01 * m10;
  const ring = node.face;
  const poly = ring.map((ll) => {
    const q = net.pt(node, ll);
    return [tx + q[0] * k, ty + q[1] * k];
  });
  return {
    // The face's own projection, whose invert() is analytic for every face
    // type - gnomonic for the voronoi solids, Lee's raw projection for the
    // tetrahedral one. Reusing it avoids assuming a particular face projection.
    gp: node.project,
    ring,
    siteVec: lonLatVec(site),
    pageRing: poly,
    inv: det
      ? { a: m11 / det, b: -m01 / det, c: -m10 / det, d: m00 / det }
      : null,
    b0,
    b1,
    x0: Math.min(...poly.map((p) => p[0])),
    x1: Math.max(...poly.map((p) => p[0])),
    y0: Math.min(...poly.map((p) => p[1])),
    y1: Math.max(...poly.map((p) => p[1])),
  };
}

/** A page-millimetres -> [lon, lat] function; null outside every face. */
export function makeInverse(net, page) {
  const { k, tx, ty } = page;
  const { rcx, rcy, cosA, sinA } = net.xf;
  const faces = net.nodes.map((n) => faceSolver(net, n, k, tx, ty)).filter((f) => f.inv);
  // The face geometry - and so the gnomonic each face uses - lives in the
  // projection's rotated frame; the projection's rotate is applied before the
  // face projection runs. Undo it to get geographic lon/lat.
  const rotInvert = geoRotation(net.proj.rotate()).invert;
  // Largest faces first: they win the overlap test more often, letting a pixel
  // stop at the first hit.
  faces.sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0));

  return function invertPage(pageX, pageY) {
    const netX = (pageX - tx) / k;
    const netY = (pageY - ty) / k;
    // R has determinant -1 and squares to the identity, so it is its own inverse.
    const qx = rcx + cosA * netX - sinA * netY;
    const qy = rcy - sinA * netX - cosA * netY;

    // Which face owns a lon/lat is decided by the nearest Voronoi site, exactly
    // as the library's own find() does. Testing "inside the ring" in lon/lat
    // would be wrong: a face ring can be four points on one parallel, which on
    // the sphere bounds a polar cap rather than a polygon. The planar polygon
    // does the exact test, in the space the sheet is actually drawn in.
    let best = null;
    let bestDot = -Infinity;
    for (const f of faces) {
      if (pageX < f.x0 || pageX > f.x1 || pageY < f.y0 || pageY > f.y1) continue;
      if (!pointInRing([pageX, pageY], f.pageRing)) continue;
      const p0 = f.inv.a * (qx - f.b0) + f.inv.b * (qy - f.b1);
      const p1 = f.inv.c * (qx - f.b0) + f.inv.d * (qy - f.b1);
      const ll = f.gp.invert([p0, p1]);
      if (!ll || !Number.isFinite(ll[0]) || !Number.isFinite(ll[1])) continue;
      if (ll[1] > 90 || ll[1] < -90) continue;
      // Nearest-site comparison happens in the rotated frame, where the sites
      // are defined; the rotation is undone only for the returned value.
      const v = lonLatVec(ll);
      const s = f.siteVec;
      const dot = v[0] * s[0] + v[1] * s[1] + v[2] * s[2];
      if (dot <= bestDot) continue;
      const geo = rotInvert(ll);
      if (!geo || !Number.isFinite(geo[0]) || !Number.isFinite(geo[1])) continue;
      bestDot = dot;
      best = [((geo[0] + 180) % 360 + 360) % 360 - 180, geo[1]];
    }
    return best;
  };
}

/**
 * Rasterise the whole page.
 * @param net      from buildNet
 * @param page     { k, tx, ty } the net->page fit, matching P in renderNet
 * @param box      { x, y, w, h } page rect the bitmap covers
 * @param pxPerMm  bitmap resolution
 * @param source   { data, width, height } RGBA of the equirectangular image
 */
export function rasterizeFaces(net, page, box, pxPerMm, source, opts = {}) {
  const { w, h } = box;
  const pxW = Math.max(1, Math.round(w * pxPerMm));
  const pxH = Math.max(1, Math.round(h * pxPerMm));
  const canvas = opts.canvas || document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(pxW, pxH);
  const out = img.data;

  const invertPage = makeInverse(net, page);
  const { data, width: sw, height: sh } = source;

  let hit = 0;
  for (let py = 0; py < pxH; py++) {
    const pageY = box.y + (py + 0.5) / pxPerMm;
    for (let px = 0; px < pxW; px++) {
      const pageX = box.x + (px + 0.5) / pxPerMm;
      const ll = invertPage(pageX, pageY);
      if (!ll) continue;
      const u = ((ll[0] + 180) / 360) * sw;
      const v = ((90 - ll[1]) / 180) * sh;
      const ix = Math.min(sw - 1, Math.max(0, Math.round(u)));
      const iy = Math.min(sh - 1, Math.max(0, Math.round(v)));
      const so = (iy * sw + ix) * 4;
      const o = (py * pxW + px) * 4;
      out[o] = data[so];
      out[o + 1] = data[so + 1];
      out[o + 2] = data[so + 2];
      out[o + 3] = 255;
      hit++;
    }
  }

  ctx.putImageData(img, 0, 0);
  return { dataUrl: canvas.toDataURL('image/png'), w: pxW, h: pxH, box, pixels: hit };
}

// Turn a loaded image element into raw RGBA the sampler can index.
export function imageToSource(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  return { data, width: c.width, height: c.height };
}