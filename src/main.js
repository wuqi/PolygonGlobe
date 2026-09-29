import './style.css';
import { createProjection, POLYHEDRA } from './geo/polyhedra.js';
import { GlobeRenderer } from './render/renderer.js';

const state = {
  polyKey: 'cube',
  rotate: [0, -30, 0],
  zoom: 1,
  layers: {
    land: true,
    graticule: true,
    china: true,
    outline: true,
  },
};

const app = document.querySelector('#app');
app.innerHTML = `
  <header class="toolbar">
    <div class="group" id="poly-group"></div>
    <div class="group" id="layer-group"></div>
    <button id="reset" class="btn">重置视角</button>
  </header>
  <main class="stage">
    <canvas id="globe"></canvas>
  </main>
`;

const canvas = document.querySelector('#globe');
const renderer = new GlobeRenderer(canvas);

function buildProjection() {
  const projection = createProjection(state.polyKey, { rotate: state.rotate });
  projection.scale((projection.scale?.() || 150) * state.zoom);
  renderer.setProjection(projection);
  projection.scale(renderer.baseScale * state.zoom);
  projection.rotate(state.rotate);
}

const polyGroup = document.querySelector('#poly-group');
for (const p of POLYHEDRA) {
  const btn = document.createElement('button');
  btn.className = `btn${p.key === state.polyKey ? ' active' : ''}`;
  btn.textContent = `${p.name}`;
  btn.dataset.key = p.key;
  btn.addEventListener('click', () => {
    state.polyKey = p.key;
    polyGroup.querySelectorAll('.btn').forEach((b) => b.classList.toggle('active', b.dataset.key === p.key));
    buildProjection();
    draw();
  });
  polyGroup.appendChild(btn);
}

const layerGroup = document.querySelector('#layer-group');
for (const [key, label] of [
  ['land', '陆地'],
  ['graticule', '经纬网'],
  ['china', '中国'],
  ['outline', '展开轮廓'],
]) {
  const labelEl = document.createElement('label');
  labelEl.className = 'check';
  labelEl.innerHTML = `<input type="checkbox" ${state.layers[key] ? 'checked' : ''}><span>${label}</span>`;
  labelEl.querySelector('input').addEventListener('change', (e) => {
    state.layers[key] = e.target.checked;
    draw();
  });
  layerGroup.appendChild(labelEl);
}

document.querySelector('#reset').addEventListener('click', () => {
  state.rotate = [0, -30, 0];
  state.zoom = 1;
  buildProjection();
  draw();
});

function draw() {
  renderer.draw({ layers: state.layers });
}

function resize() {
  const stage = document.querySelector('.stage');
  renderer.resize(stage.clientWidth, stage.clientHeight);
  buildProjection();
  draw();
}

let dragging = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('grabbing');
});

canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  state.rotate = [
    state.rotate[0] + dx * 0.3,
    Math.max(-90, Math.min(90, state.rotate[1] + dy * 0.3)),
  ];
  renderer.projection.rotate(state.rotate);
  draw();
});

const endDrag = (e) => {
  dragging = false;
  canvas.classList.remove('grabbing');
  if (e.pointerId !== undefined && canvas.hasPointerCapture?.(e.pointerId)) {
    canvas.releasePointerCapture(e.pointerId);
  }
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = Math.exp(-e.deltaY * 0.0015);
  state.zoom = Math.max(0.4, Math.min(6, state.zoom * factor));
  renderer.projection.scale(renderer.baseScale * state.zoom);
  draw();
}, { passive: false });

window.addEventListener('resize', resize);
resize();
