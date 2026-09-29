import { geoPath, geoGraticule10 } from 'd3-geo';
import { worldFeatures, chinaFeature, sphere } from '../data/world.js';

const graticule = geoGraticule10();

const COLORS = {
  ocean: '#0e1626',
  land: '#1e2a3a',
  landStroke: '#33465e',
  graticule: '#24344a',
  china: '#c2453a',
  chinaStroke: '#ff7a6e',
  netOutline: '#5b7ea6',
};

export class GlobeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.projection = null;
    this.path = null;
    this.measurePath = null;
    this.width = 0;
    this.height = 0;
  }

  setProjection(projection) {
    this.projection = projection;
    this.path = geoPath(projection, this.ctx);
    this.measurePath = geoPath(projection);
    this.fit();
  }

  resize(width, height) {
    const dpr = window.devicePixelRatio || 1;
    this.width = width;
    this.height = height;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.fit();
  }

  fit() {
    if (!this.projection || !this.width || !this.height) return;
    const pad = 24;
    let ok = false;
    try {
      this.projection.fitExtent(
        [[pad, pad], [this.width - pad, this.height - pad]],
        sphere,
      );
      const b = this.measurePath.bounds(sphere);
      ok = isFinite(b[0][0]) && isFinite(b[1][0]) && b[1][0] > b[0][0];
    } catch {
      ok = false;
    }
    if (!ok) {
      const k = Math.min(this.width, this.height) * 0.42;
      this.projection.scale(k).translate([this.width / 2, this.height / 2]);
    }
    this.baseScale = this.projection.scale();
  }

  draw({ layers }) {
    const { ctx, path } = this;
    if (!path) return;
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.beginPath();
    path(sphere);
    ctx.fillStyle = COLORS.ocean;
    ctx.fill();

    if (layers.graticule) {
      ctx.beginPath();
      path(graticule);
      ctx.strokeStyle = COLORS.graticule;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }

    if (layers.land) {
      ctx.beginPath();
      path({ type: 'FeatureCollection', features: worldFeatures });
      ctx.fillStyle = COLORS.land;
      ctx.fill();
      ctx.strokeStyle = COLORS.landStroke;
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }

    if (layers.china && chinaFeature) {
      ctx.beginPath();
      path(chinaFeature);
      ctx.fillStyle = COLORS.china;
      ctx.fill();
      ctx.strokeStyle = COLORS.chinaStroke;
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }

    if (layers.outline) {
      ctx.beginPath();
      path(sphere);
      ctx.strokeStyle = COLORS.netOutline;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}
