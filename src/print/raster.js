// Blue Marble on a polyhedral net.
//
// The source is an equirectangular photo, so the naive route - for every output
// pixel ask the projection which lon/lat lands there - is far too slow: the
// polyhedral projection's invert() does a tree lookup per point (measured at
// ~144us, i.e. minutes for one A4 sheet). Projecting forwards is ~0.4us per
// point when done per face through node.project, which skips the lookup.
//
// So: walk a lon/lat grid over each face's own spherical region, project the
// cell corners into that face's plane, and fill the resulting quad with the
// source colour at the cell centre. The whole page ends up as one bitmap that
// the sheet's existing netclip path trims to the faces.

const DEFAULT_STEP = 1; // degrees per cell

// Unwrap a ring's longitudes into one continuous range. A face that straddles
// the antimeridian comes back as 170, 175, -175, -170 and has to read as
// 170..190, otherwise the grid would sweep the whole globe.
function lonRange(ring) {
  const lats = ring.map((p) => p[1]);
  if (lats.some((la) => Math.abs(la) > 89.999)) {
    // Touching a pole, so every meridian meets this face.
    return [-180, 180];
  }
  let acc = ring[0][0];
  let lo = acc;
  let hi = acc;
  for (let i = 1; i < ring.length; i++) {
    let d = ring[i][0] - ring[i - 1][0];
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    acc += d;
    lo = Math.min(lo, acc);
    hi = Math.max(hi, acc);
  }
  return [lo, hi];
}

export function faceRegion(node) {
  const [lo, hi] = lonRange(node.face);
  const lat0 = Math.min(...node.face.map((p) => p[1]));
  const lat1 = Math.max(...node.face.map((p) => p[1]));
  return { lo, hi, lat0, lat1 };
}

// A face ring cannot be trusted to describe the face's lon/lat footprint:
// d3-geo-polygon's cube defines its north cell as four points all sitting on
// one parallel, so the ring has zero latitude span and would yield an empty
// grid. Sample the face's interior through the inverse projection instead -
// a handful of calls per face, which is affordable even though invert() costs
// ~144us a point.
function regionFromInterior(proj, poly, extra, step) {
  const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
  const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  const probes = [[cx, cy]];
  for (const p of poly) probes.push([cx + (p[0] - cx) * 0.8, cy + (p[1] - cy) * 0.8]);

  const lons = [];
  const lats = [];
  let probeLon = 0;
  let probeLat = 0;
  let probeN = 0;
  for (const q of probes) {
    const ll = proj.invert(q);
    if (ll && Number.isFinite(ll[0]) && Number.isFinite(ll[1])) {
      lons.push(ll[0]);
      lats.push(ll[1]);
      probeLon += ll[0];
      probeLat += ll[1];
      probeN++;
    }
  }
  for (const p of extra) {
    lons.push(p[0]);
    lats.push(p[1]);
  }
  if (!lons.length) return null;
  if (probeN) {
    probeLon /= probeN;
    probeLat /= probeN;
  } else {
    probeLon = lons[0];
    probeLat = lats[0];
  }

  let lo = Infinity;
  let hi = -Infinity;
  let acc = lons[0];
  lo = hi = acc;
  for (let i = 1; i < lons.length; i++) {
    let d = lons[i] - lons[i - 1];
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    acc += d;
    lo = Math.min(lo, acc);
    hi = Math.max(hi, acc);
  }

  // A face that reaches far in longitude is a polar one; every meridian
  // crosses it, so the grid has to sweep the whole circle.
  if (hi - lo > 180) {
    lo = -180;
    hi = 180;
  }
  return {
    lo: lo - step,
    hi: hi + step,
    lat0: Math.min(...lats) - step,
    lat1: Math.max(...lats) + step,
    probeLon,
    probeLat,
  };
}

const wrapLon = (lon) => {
  if (lon >= -180 && lon <= 180) return lon;
  let x = ((lon + 180) % 360 + 360) % 360 - 180;
  return x === -180 ? 180 : x;
};

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

/**
 * Rasterise the whole page.
 * @param net      from buildNet
 * @param P        net-space point -> page millimetres
 * @param box      { x, y, w, h } page rect the bitmap covers
 * @param pxPerMm  bitmap resolution
 * @param source   { data, width, height } RGBA of the equirectangular image
 */
export function rasterizeFaces(net, P, proj, box, pxPerMm, source, opts = {}) {
  const step = opts.step ?? DEFAULT_STEP;
  const w = Math.max(1, Math.round(box.w * pxPerMm));
  const h = Math.max(1, Math.round(box.h * pxPerMm));
  const canvas = opts.canvas || document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  ctx.clearRect(0, 0, w, h);

  const { data, width: sw, height: sh } = source;
  const sx = w / box.w; // page px per mm
  const toX = (pageX) => (pageX - box.x) * sx;
  const toY = (pageY) => (pageY - box.y) * sx;

  let cells = 0;
  let painted = 0;

  for (const node of net.nodes) {
    // The face's outline in page millimetres, used to reject cells that
    // belong to a neighbouring face (node.project extrapolates happily).
    const poly = node.face.map((ll) => P(net.pt(node, ll)));
    const region = regionFromInterior(proj, poly, node.face, step);
    if (!region) continue;
    const { lo, hi, lat0, lat1 } = region;

    // Map lon/lat into this face's plane and on to page millimetres. Reuse
    // net.pt so the frame compensation the net was built with is applied
    // identically here - projecting straight through node.project would land
    // in a different space and every point-in-polygon test would fail.
    const project = (lon, lat) => {
      const p = net.pt(node, [wrapLon(lon), lat]);
      if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
      return P(p);
    };

    // Cheap rejection before the exact test: most candidates in a polar face's
    // 360-degree sweep land nowhere near this face.
    const bx0 = Math.min(...poly.map((p) => p[0]));
    const bx1 = Math.max(...poly.map((p) => p[0]));
    const by0 = Math.min(...poly.map((p) => p[1]));
    const by1 = Math.max(...poly.map((p) => p[1]));

    // Keep the cell small. A cell is kept only when its centre falls inside the
    // face, so a large cell straddling the boundary gets dropped whole and
    // leaves a gap; at a degree or finer the loss is a sub-cell sliver.
// Resolution is dialled with pxPerMm instead of the angular step.
const cell = step;

    for (let lat = region.lat0; lat < region.lat1 - 1e-9; lat += cell) {
      const latA = lat;
      const latB = Math.min(lat + cell, region.lat1);
      for (let lon = lo; lon < hi - 1e-9; lon += cell) {
        const lonA = lon;
        const lonB = lon + cell;
        cells++;

        // Reject cells outside this face before touching the canvas.
        const midLon = lonA + (lonB - lonA) / 2;
        const midLat = latA + (latB - latA) / 2;
        const probe = project(midLon, midLat);
        if (!probe) continue;
        if (probe[0] < bx0 || probe[0] > bx1 || probe[1] < by0 || probe[1] > by1) continue;
        if (!pointInRing(probe, poly)) continue;

        const c = [
          project(lonA, latA),
          project(lonB, latA),
          project(lonB, latB),
          project(lonA, latB),
        ];
        if (c.some((q) => !q)) continue;

        // Colour from the source at the cell centre.
        const u = ((wrapLon(midLon) + 180) / 360) * sw;
        const v = ((90 - midLat) / 180) * sh;
        const ix = Math.min(sw - 1, Math.max(0, Math.round(u)));
        const iy = Math.min(sh - 1, Math.max(0, Math.round(v)));
        const o = (iy * sw + ix) * 4;
        if (data[o + 3] === 0) continue;
        const col = `rgb(${data[o]},${data[o + 1]},${data[o + 2]})`;

        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(toX(c[0][0]), toY(c[0][1]));
        ctx.lineTo(toX(c[1][0]), toY(c[1][1]));
        ctx.lineTo(toX(c[2][0]), toY(c[2][1]));
        ctx.lineTo(toX(c[3][0]), toY(c[3][1]));
        ctx.closePath();
        ctx.fill();
        painted++;
      }
    }
  }

  return { dataUrl: canvas.toDataURL('image/png'), w, h, box, cells, painted };
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