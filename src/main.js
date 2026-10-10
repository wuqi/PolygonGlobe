// 纸质多面体地图 - 界面
// 左侧多面体列表，右侧 A4/A5 版式实时预览，底部工具条导出。

import './style.css';
import { SOLIDS } from './print/solids.js';
import { renderNet, loadSkyData } from './print/sheet.js';

const state = {
  polyKey: 'cube',
  solid: 'cube',
  page: 'A4',
  style: 'color',
  base: 'vector',
  graticule: false,
  folds: true,
  china: true,
};

const app = document.querySelector('#app');
app.innerHTML = `
  <aside class="sidebar">
    <div class="brand">
      <h1>纸质多面体地图</h1>
      <p>选择多面体，生成可打印的纸模展开图</p>
    </div>
    <div class="solid-list" id="solid-list"></div>
    <div class="sidebar-foot">
      <span id="stat"></span>
    </div>
  </aside>

  <main class="stage">
    <div class="toolbar">
      <div class="grp">
        <label>页面</label>
        <button class="seg" data-page="A4">A4</button>
        <button class="seg" data-page="A5">A5</button>
      </div>
      <div class="grp">
        <label>样式</label>
        <button class="seg" data-style="color">彩色</button>
        <button class="seg" data-style="mono">单色</button>
      </div>
      <div class="grp">
        <label>底图</label>
        <button class="seg" data-base="vector">矢量</button>
        <button class="seg" data-base="raster">栅格</button>
        <button class="seg" data-base="sky">星图</button>
      </div>
      <div class="grp">
        <label class="chk"><input type="checkbox" id="china" checked> 中国标红</label>
        <label class="chk"><input type="checkbox" id="grat"> 经纬网</label>
        <label class="chk"><input type="checkbox" id="folds" checked> 折线</label>
      </div>
      <div class="grp right">
        <button class="btn" id="dl-png">导出 PNG</button>
        <button class="btn" id="dl-svg">导出 SVG</button>
        <button class="btn primary" id="dl-pdf">导出 PDF</button>
      </div>
    </div>
    <div class="preview" id="preview"></div>
  </main>
`;

const listEl = document.querySelector('#solid-list');
const previewEl = document.querySelector('#preview');
const statEl = document.querySelector('#stat');

// 多面体卡片
for (const s of SOLIDS) {
  const card = document.createElement('button');
  card.className = 'solid';
  card.dataset.key = s.key;
  card.innerHTML = `
    <span class="thumb" data-key="${s.key}"></span>
    <span class="meta">
      <span class="name">${s.name}</span>
      <span class="en">${s.en}</span>
    </span>`;
  card.addEventListener('click', () => {
    state.solid = s.key;
    syncSelection();
    render();
  });
  listEl.appendChild(card);
}

// 工具条
document.querySelectorAll('[data-page]').forEach((b) => {
  b.addEventListener('click', () => {
    state.page = b.dataset.page;
    syncToolbar();
    render();
  });
});
document.querySelectorAll('[data-style]').forEach((b) => {
  b.addEventListener('click', () => {
    state.style = b.dataset.style;
    syncToolbar();
    render();
  });
});
document.querySelectorAll('[data-base]').forEach((b) => {
  b.addEventListener('click', () => {
    state.base = b.dataset.base;
    syncToolbar();
    render();
  });
});
// The checkbox id is `grat`, but the render option is called `graticule`.
// Writing to state[id] put the flag in an unused field, so the toggle never
// reached renderNet and the graticule stayed off.
for (const [id, field] of [['grat', 'graticule'], ['folds', 'folds'], ['china', 'china']]) {
  const el = document.querySelector('#' + id);
  if (!el) continue;
  el.addEventListener('change', (e) => {
    state[field] = e.target.checked;
    render();
  });
}

document.querySelector('#dl-svg').addEventListener('click', () => {
  const { svg } = current();
  download(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${state.solid}-${state.page}-${state.style}.svg`);
});

const dpi = Number(document.body.dataset.dpi || 150);

document.querySelector('#dl-png').addEventListener('click', () => {
  const { svg, W, H } = current();
  const px = (mm) => Math.round((mm / 25.4) * dpi);
  const w = px(W);
  const h = px(H);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  img.onload = () => {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    cv.toBlob((blob) => {
      if (blob) download(blob, `${state.solid}-${state.page}-${state.style}-${dpi}dpi.png`);
    }, 'image/png');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert('PNG 导出失败');
  };
  img.src = url;
});

const pdfBtn = document.querySelector('#dl-pdf');
pdfBtn.addEventListener('click', async () => {
  pdfBtn.disabled = true;
  const old = pdfBtn.textContent;
  pdfBtn.textContent = '生成中…';
  try {
    const { svg, W, H } = current();
    const { jsPDF } = await import('jspdf');
    const { svg2pdf } = await import('svg2pdf.js');
    const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: W > H ? 'landscape' : 'portrait' });
    const el = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    await svg2pdf(el, doc, { x: 0, y: 0 });
    doc.save(`${state.solid}-${state.page}-${state.style}.pdf`);
  } catch (e) {
    console.error(e);
    alert(`PDF 导出失败：${e.message || e}`);
  } finally {
    pdfBtn.disabled = false;
    pdfBtn.textContent = old;
  }
});

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function solidOf() {
  return SOLIDS.find((s) => s.key === state.solid);
}

let cached = null;
let cacheKey = '';
function current() {
  const key = [state.solid, state.page, state.style, state.graticule, state.folds, state.base, state.china].join('|');
  if (!cached || cacheKey !== key) {
    cached = renderNet({
      solid: solidOf(),
      page: state.page,
      style: state.style,
      graticule: state.graticule,
      showFolds: state.folds,
      base: state.base,
      china: state.china,
    });
    cacheKey = key;
  }
  return cached;
}

function render() {
  previewEl.setAttribute('aria-busy', 'true');
  const { svg, net } = current();
  previewEl.innerHTML = svg;
  statEl.innerHTML = `${net.faceCount} 面 · 折线 ${net.folds} · 剪线 ${net.cuts} · 比例 ${net.aspect.toFixed(2)}`;
  statEl.className = net.overlaps ? 'warn' : '';
  previewEl.removeAttribute('aria-busy');
}

function syncSelection() {
  listEl.querySelectorAll('.solid').forEach((b) => {
    b.classList.toggle('active', b.dataset.key === state.solid);
  });
}

function syncToolbar() {
  document.querySelectorAll('[data-page]').forEach((b) => {
    b.classList.toggle('on', b.dataset.page === state.page);
  });
  document.querySelectorAll('[data-style]').forEach((b) => {
    b.classList.toggle('on', b.dataset.style === state.style);
  });
  document.querySelectorAll('[data-base]').forEach((b) => {
    b.classList.toggle('on', b.dataset.base === state.base);
  });
}

// 卡片缩略图：懒加载，且只画面的轮廓（不跑世界地图的 geoPath）
async function paintThumb(el) {
  const solid = SOLIDS.find((s) => s.key === el.dataset.key);
  if (!solid) return;
  try {
    const { buildNet } = await import('./print/net.js');
    const net = buildNet(solid);
    const [b0, b1] = net.bbox;
    const bw = b1[0] - b0[0];
    const bh = b1[1] - b0[1];
    const pad = bw * 0.04;
    const vb = [b0[0] - pad, b0[1] - pad, bw + pad * 2, bh + pad * 2].map((v) => Math.round(v * 100) / 100);
    const d = net.faces
      .map((ring) => 'M' + ring.map((p) => `${Math.round(p[0] * 100) / 100},${Math.round(p[1] * 100) / 100}`).join('L') + 'Z')
      .join(' ');
    el.innerHTML =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" preserveAspectRatio="xMidYMid meet">` +
      `<path d="${d}" fill="#dce7f2" stroke="#5b7ea6" stroke-width="0.04"/></svg>`;
  } catch {
    el.textContent = '!';
  }
}

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      paintThumb(e.target);
    }
  },
  { root: listEl, rootMargin: '120px' },
);
listEl.querySelectorAll('.thumb').forEach((el) => io.observe(el));

syncSelection();
syncToolbar();
render();

// star data is ~1.2MB of JSON; fetch it the first time it is actually needed
let skyRequested = false;
document.querySelectorAll('[data-base]').forEach((b) => {
  b.addEventListener('click', async () => {
    if (b.dataset.base === 'sky' && !skyRequested) {
      skyRequested = true;
      try {
        await loadSkyData();
        render();
      } catch (e) {
        console.error(e);
        alert('星图数据加载失败');
      }
    }
  });
});