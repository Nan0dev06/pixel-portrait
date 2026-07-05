"use strict";

const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const gridSizeEl = document.getElementById("gridSize");
const numColorsEl = document.getElementById("numColors");
const numberedEl = document.getElementById("numbered");
const gridLinesEl = document.getElementById("gridLines");
const downloadBtn = document.getElementById("downloadBtn");
const outCanvas = document.getElementById("outCanvas");
const placeholder = document.getElementById("placeholder");
const infoEl = document.getElementById("info");
const legendEl = document.getElementById("legend");

const CELL = 40; // rendered pixels per block

let sourceImg = null;
let palette = [];   // [{r,g,b,hex,count}] ordered light -> dark, index = number - 1

// ---------- image loading ----------

function loadFromSrc(src, name) {
  const img = new Image();
  img.onload = () => {
    sourceImg = img;
    dropzone.innerHTML = "<strong>" + (name || "Image loaded") + "</strong>click to choose a different photo";
    render();
    maybeRecommend();
  };
  img.onerror = () => { infoEl.textContent = "Could not read that file as an image."; };
  img.src = src;
}
window.loadFromSrc = loadFromSrc; // used by drag&drop and testing

function handleFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = e => loadFromSrc(e.target.result, file.name);
  reader.readAsDataURL(file);
}

dropzone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("over"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("over"));
dropzone.addEventListener("drop", e => {
  e.preventDefault();
  dropzone.classList.remove("over");
  handleFile(e.dataTransfer.files[0]);
});

const paperEl = document.getElementById("paper");
const paperW = document.getElementById("paperW");
const paperH = document.getElementById("paperH");

[gridSizeEl, numColorsEl, numberedEl, gridLinesEl, paperEl, paperW, paperH].forEach(el =>
  el.addEventListener("input", () => {
    document.getElementById("gridVal").textContent = gridSizeEl.value;
    document.getElementById("colorsVal").textContent = numColorsEl.value;
    document.getElementById("customPaper").hidden = paperEl.value !== "custom";
    render();
  })
);

// setup mode chosen in the wizard:
//   "usual"     - free grid slider, paper only for measurements
//   "blockSize" - block mm known, blank paper: blocks-across computed from paper
//   "preGrid"   - paper already ruled: grid is exactly cols × rows
let mode = "usual", blockMM = null, gridCols = null, gridRows = null;

function parsePaper() {
  const v = paperEl.value;
  if (!v) return null;
  if (v === "custom") {
    const w = +paperW.value, h = +paperH.value;
    if (!w || !h) return null;
    return { w, h, label: w + " × " + h + " mm" };
  }
  const [w, h] = v.split("x").map(Number);
  return { w, h, label: paperEl.options[paperEl.selectedIndex].text };
}

// physical size of one block when the grid is fit onto the chosen paper,
// rotating the paper to match the image orientation
function paperInfo(gridW, gridH) {
  const p = parsePaper();
  if (!p) return null;
  let { w, h } = p;
  if ((gridW > gridH) !== (w > h)) [w, h] = [h, w];
  const r1 = n => Math.round(n * 10) / 10;
  const block = mode === "blockSize" && blockMM ? blockMM : Math.min(w / gridW, h / gridH);
  return {
    block: r1(block),
    text: "block " + r1(block) + " mm · drawing " + Math.round(block * gridW) +
      " × " + Math.round(block * gridH) + " mm · " + p.label
  };
}

// grid dimensions for the current mode; falls back to the slider
function gridDims() {
  const iw = sourceImg.naturalWidth, ih = sourceImg.naturalHeight;
  const p = parsePaper();
  if (mode === "preGrid" && gridCols && gridRows) {
    return { gridW: gridCols, gridH: gridRows };
  }
  if (mode === "blockSize" && blockMM && p) {
    let pw = p.w, ph = p.h;
    if ((iw > ih) !== (pw > ph)) [pw, ph] = [ph, pw];
    const gridW = Math.max(2, Math.floor(pw / blockMM));
    const maxRows = Math.max(2, Math.floor(ph / blockMM));
    return { gridW, gridH: Math.min(Math.max(1, Math.round(gridW * ih / iw)), maxRows) };
  }
  const gridW = +gridSizeEl.value;
  return { gridW, gridH: Math.max(1, Math.round(gridW * ih / iw)) };
}

// ---------- color quantization (median cut) ----------

function medianCut(colors, k) {
  // colors: flat array of [r,g,b] per cell (duplicates included, so boxes are population-weighted)
  let boxes = [colors];
  const rangeOf = box => {
    const min = [255, 255, 255], max = [0, 0, 0];
    for (const c of box) for (let i = 0; i < 3; i++) {
      if (c[i] < min[i]) min[i] = c[i];
      if (c[i] > max[i]) max[i] = c[i];
    }
    let axis = 0, range = -1;
    for (let i = 0; i < 3; i++) if (max[i] - min[i] > range) { range = max[i] - min[i]; axis = i; }
    return { axis, range };
  };
  while (boxes.length < k) {
    let bestIdx = -1, bestScore = 0, bestAxis = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      const { axis, range } = rangeOf(box);
      const score = range * Math.log(box.length + 1);
      if (score > bestScore) { bestScore = score; bestIdx = i; bestAxis = axis; }
    });
    if (bestIdx < 0) break; // no box can be split further
    const box = boxes.splice(bestIdx, 1)[0];
    box.sort((a, b) => a[bestAxis] - b[bestAxis]);
    const mid = box.length >> 1;
    boxes.push(box.slice(0, mid), box.slice(mid));
  }
  return boxes.map(box => {
    let r = 0, g = 0, b = 0;
    for (const c of box) { r += c[0]; g += c[1]; b += c[2]; }
    const n = box.length;
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n), count: n };
  });
}

const nearestIdx = (c, pal) => {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const dr = c[0] - pal[i].r, dg = c[1] - pal[i].g, db = c[2] - pal[i].b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
};

const luminance = c => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
const toHex = c => "#" + [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, "0")).join("");

// ---------- main render ----------

function render() {
  if (!sourceImg) return;

  if (mode !== "usual" && !parsePaper()) {
    mode = "usual"; // paper was set to "None" — measurements no longer apply
    document.getElementById("gridField").style.display = "";
  }
  const { gridW, gridH } = gridDims();
  const k = +numColorsEl.value;

  // 1. Downscale: each grid cell = average color of that photo area (white under transparency)
  const small = document.createElement("canvas");
  small.width = gridW; small.height = gridH;
  const sctx = small.getContext("2d", { willReadFrequently: true });
  sctx.fillStyle = "#fff";
  sctx.fillRect(0, 0, gridW, gridH);
  // center-crop the photo to the grid's shape so fixed paper grids never distort it
  const iw = sourceImg.naturalWidth, ih = sourceImg.naturalHeight;
  let sx = 0, sy = 0, sw = iw, sh = ih;
  if (iw / ih > gridW / gridH) { sw = ih * gridW / gridH; sx = (iw - sw) / 2; }
  else { sh = iw * gridH / gridW; sy = (ih - sh) / 2; }
  sctx.drawImage(sourceImg, sx, sy, sw, sh, 0, 0, gridW, gridH);
  const data = sctx.getImageData(0, 0, gridW, gridH).data;

  const cells = [];
  for (let i = 0; i < gridW * gridH; i++) {
    cells.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
  }

  // 2. Quantize to k colors, number them light -> dark
  palette = medianCut(cells.slice(), k);
  palette.forEach(p => { p.hex = toHex(p); });
  // merge boxes that averaged to the same color, so every number is a distinct paint color
  const byHex = new Map();
  for (const p of palette) {
    const seen = byHex.get(p.hex);
    if (seen) seen.count += p.count; else byHex.set(p.hex, p);
  }
  palette = [...byHex.values()];
  palette.sort((a, b) => luminance(b) - luminance(a));
  const cellIdx = cells.map(c => nearestIdx(c, palette));

  // 3. Draw the big grid
  const numbered = numberedEl.checked;
  const lines = gridLinesEl.checked;
  outCanvas.width = gridW * CELL;
  outCanvas.height = gridH * CELL;
  const ctx = outCanvas.getContext("2d");

  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const p = palette[cellIdx[y * gridW + x]];
      ctx.fillStyle = p.hex;
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
  }

  if (lines) {
    // thick opaque lines (10% of a block) so every boundary stays visible
    // at any zoom level; mid-gray reads on both dark and light blocks
    const lw = Math.max(2, Math.round(CELL * 0.1));
    ctx.fillStyle = "#909090";
    for (let x = 0; x <= gridW; x++) {
      const px = x === 0 ? 0 : x === gridW ? gridW * CELL - lw : x * CELL - lw / 2;
      ctx.fillRect(px, 0, lw, gridH * CELL);
    }
    for (let y = 0; y <= gridH; y++) {
      const py = y === 0 ? 0 : y === gridH ? gridH * CELL - lw : y * CELL - lw / 2;
      ctx.fillRect(0, py, gridW * CELL, lw);
    }
  }

  if (numbered) {
    ctx.font = "600 " + Math.round(CELL * 0.42) + "px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const idx = cellIdx[y * gridW + x];
        ctx.fillStyle = luminance(palette[idx]) > 140 ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.85)";
        ctx.fillText(String(idx + 1), x * CELL + CELL / 2, y * CELL + CELL / 2 + 1);
      }
    }
  }

  // 4. UI: legend + info
  placeholder.style.display = "none";
  outCanvas.style.display = "block";
  downloadBtn.disabled = false;
  const paper = paperInfo(gridW, gridH);
  infoEl.textContent = "";
  document.getElementById("stats").hidden = false;
  document.getElementById("stPhoto").textContent = iw + " × " + ih + " px";
  document.getElementById("stGrid").textContent = gridW + " × " + gridH + " blocks";
  document.getElementById("stColors").textContent = palette.length;
  document.getElementById("stPaperRow").style.display = paper ? "" : "none";
  if (paper) document.getElementById("stPaper").textContent = paper.text;

  legendEl.innerHTML = "<h3>Color legend</h3>";
  palette.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "swatch-row";
    row.innerHTML = '<span class="num">' + (i + 1) + '</span>' +
      '<span class="sw" style="background:' + p.hex + '"></span>' +
      '<span class="hex">' + p.hex + '</span>';
    legendEl.appendChild(row);
  });
}
window.render = render;

// ---------- download (grid + legend strip when numbered) ----------

downloadBtn.addEventListener("click", () => {
  const wantLegend = document.getElementById("includeLegend").checked;
  const gridW = outCanvas.width / CELL, gridH = outCanvas.height / CELL;
  const paper = paperInfo(gridW, gridH);
  const legendRow = 52, legendPad = 16;
  const paperH2 = paper ? 44 : 0;
  const legendH = (wantLegend ? legendPad * 2 + palette.length * legendRow : 0) + paperH2;

  const dl = document.createElement("canvas");
  dl.width = outCanvas.width;
  dl.height = outCanvas.height + legendH;
  const ctx = dl.getContext("2d");
  ctx.drawImage(outCanvas, 0, 0);

  if (legendH) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, outCanvas.height, dl.width, legendH);
    ctx.textBaseline = "middle";
  }

  if (paper) {
    ctx.fillStyle = "#222";
    ctx.font = "600 22px Consolas, monospace";
    ctx.textAlign = "left";
    ctx.fillText(paper.text, 24, outCanvas.height + paperH2 / 2);
  }

  if (wantLegend) {
    palette.forEach((p, i) => {
      const y = outCanvas.height + paperH2 + legendPad + i * legendRow + legendRow / 2;
      ctx.font = "600 24px Consolas, monospace";
      ctx.fillStyle = "#222";
      ctx.textAlign = "right";
      ctx.fillText(String(i + 1), 56, y);
      ctx.fillStyle = p.hex;
      ctx.fillRect(72, y - 16, 64, 32);
      ctx.strokeStyle = "#999";
      ctx.strokeRect(72.5, y - 15.5, 63, 31);
      ctx.fillStyle = "#222";
      ctx.textAlign = "left";
      ctx.font = "20px Consolas, monospace";
      ctx.fillText(p.hex, 152, y);
    });
  }

  const name = tsName();
  dl.toBlob(blob => {
    const a = document.createElement("a");
    a.download = name;
    a.href = URL.createObjectURL(blob);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    saveToHistory(name, blob);
  }, "image/png");
});

// ---------- history (real folder via File System Access API, browser storage as fallback) ----------

const folderBtn = document.getElementById("folderBtn");
const historyNote = document.getElementById("historyNote");
const galleryEl = document.getElementById("gallery");
const viewerEl = document.getElementById("viewer");
const viewerImg = document.getElementById("viewerImg");
const viewerName = document.getElementById("viewerName");

let historyDir = null; // FileSystemDirectoryHandle when a folder is connected

function tsName() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return "pixel-portrait-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
    "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + ".png";
}

// tiny IndexedDB wrapper: "kv" persists the folder handle, "files" is the fallback store
function idb() {
  return new Promise((res, rej) => {
    const req = indexedDB.open("pixel-portrait", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("kv");
      req.result.createObjectStore("files");
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function dbOp(store, mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const rq = fn(db.transaction(store, mode).objectStore(store));
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
const dbGet = (s, k) => dbOp(s, "readonly", os => os.get(k));
const dbPut = (s, k, v) => dbOp(s, "readwrite", os => os.put(v, k));
const dbDel = (s, k) => dbOp(s, "readwrite", os => os.delete(k));
async function dbEntries(s) {
  const keys = await dbOp(s, "readonly", os => os.getAllKeys());
  const vals = await dbOp(s, "readonly", os => os.getAll());
  return keys.map((k, i) => [k, vals[i]]);
}

async function saveToHistory(name, blob) {
  try {
    if (historyDir) {
      const fh = await historyDir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(blob);
      await w.close();
    } else {
      await dbPut("files", name, blob);
    }
    refreshGallery();
  } catch (e) {
    historyNote.textContent = "Could not save to history: " + e.message;
  }
}
window.saveToHistory = saveToHistory;

async function getHistory() {
  const items = [];
  if (historyDir) {
    for await (const entry of historyDir.values()) {
      if (entry.kind === "file" && /\.(png|jpe?g|webp|gif|bmp)$/i.test(entry.name)) {
        items.push({ name: entry.name, blob: await entry.getFile() });
      }
    }
  } else {
    for (const [name, blob] of await dbEntries("files")) items.push({ name, blob });
  }
  items.sort((a, b) => b.name.localeCompare(a.name)); // timestamped names: newest first
  return items;
}

let galleryUrls = [];
async function refreshGallery() {
  const items = await getHistory();
  galleryUrls.forEach(u => URL.revokeObjectURL(u));
  galleryUrls = [];
  galleryEl.innerHTML = "";
  for (const item of items) {
    const url = URL.createObjectURL(item.blob);
    galleryUrls.push(url);
    const div = document.createElement("div");
    div.className = "g-item";
    div.title = item.name;
    const img = document.createElement("img");
    img.src = url;
    img.alt = item.name;
    const del = document.createElement("button");
    del.className = "g-del";
    del.textContent = "×";
    del.title = "Delete";
    del.addEventListener("click", async e => {
      e.stopPropagation();
      if (!confirm("Delete " + item.name + "?")) return;
      if (historyDir) await historyDir.removeEntry(item.name);
      else await dbDel("files", item.name);
      refreshGallery();
    });
    div.addEventListener("click", () => openViewer(item));
    div.append(img, del);
    galleryEl.appendChild(div);
  }
}
window.refreshGallery = refreshGallery;

let viewerItem = null;
function openViewer(item) {
  viewerItem = item;
  viewerImg.src = URL.createObjectURL(item.blob);
  viewerName.textContent = item.name;
  viewerEl.hidden = false;
}
function closeViewer() {
  viewerEl.hidden = true;
  URL.revokeObjectURL(viewerImg.src);
  viewerImg.src = "";
}
document.getElementById("viewerClose").addEventListener("click", closeViewer);
document.getElementById("viewerX").addEventListener("click", closeViewer);
viewerEl.addEventListener("click", e => { if (e.target === viewerEl) closeViewer(); });
document.getElementById("viewerDl").addEventListener("click", () => {
  if (!viewerItem) return;
  const a = document.createElement("a");
  a.download = viewerItem.name;
  a.href = URL.createObjectURL(viewerItem.blob);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

folderBtn.addEventListener("click", async () => {
  try {
    const stored = await dbGet("kv", "dir");
    if (stored && !historyDir &&
        (await stored.requestPermission({ mode: "readwrite" })) === "granted") {
      historyDir = stored; // reconnect the folder from last time
    } else {
      historyDir = await window.showDirectoryPicker({ mode: "readwrite" });
      await dbPut("kv", "dir", historyDir);
    }
    folderBtn.textContent = "Change history folder";
    historyNote.textContent = "Saving to folder: " + historyDir.name;
    refreshGallery();
  } catch (e) { /* picker cancelled */ }
});

async function initHistory() {
  if (!window.showDirectoryPicker) {
    folderBtn.style.display = "none";
    historyNote.textContent = "History is saved inside this browser.";
  } else {
    const stored = await dbGet("kv", "dir").catch(() => null);
    if (stored) {
      if ((await stored.queryPermission({ mode: "readwrite" })) === "granted") {
        historyDir = stored;
        folderBtn.textContent = "Change history folder";
        historyNote.textContent = "Saving to folder: " + stored.name;
      } else {
        folderBtn.textContent = "Reconnect “" + stored.name + "” folder";
        historyNote.textContent = "Click to keep saving into your folder.";
      }
    } else {
      historyNote.textContent = "Pick a folder on this computer — every created image is saved there and shown below.";
    }
  }
  refreshGallery();
}
initHistory();

// ---------- setup wizard ----------

const wizard = document.getElementById("wizard");
let wizChoice = "blank"; // or "preGrid"

function wizShow(step) {
  ["wizStep1", "wizStep2", "wizStep3"].forEach(id =>
    document.getElementById(id).hidden = id !== step);
  wizard.hidden = false;
}

document.getElementById("wizYes").addEventListener("click", () => wizShow("wizStep2"));
document.getElementById("wizNo").addEventListener("click", () => {
  mode = "usual";
  document.getElementById("gridField").style.display = "";
  wizard.hidden = true;
  render();
});
document.getElementById("wizClose").addEventListener("click", () => {
  wizard.hidden = true; // cancel: keep whatever mode was active
});

function prepStep3(choice) {
  wizChoice = choice;
  const pre = choice === "preGrid";
  document.getElementById("wizStep3Title").textContent =
    pre ? "Grid already on the paper" : "Blank paper, known measurements";
  document.getElementById("wizBlockField").hidden = pre;
  document.getElementById("wizGridField").hidden = !pre;
  wizShow("wizStep3");
  updateWizHint();
}
document.getElementById("wizBlank").addEventListener("click", () => prepStep3("blank"));
document.getElementById("wizPreGrid").addEventListener("click", () => prepStep3("preGrid"));

document.getElementById("wizPaper").addEventListener("input", e => {
  document.getElementById("wizCustom").hidden = e.target.value !== "custom";
});
document.getElementById("wizBack").addEventListener("click", () => wizShow("wizStep2"));

document.getElementById("wizStart").addEventListener("click", () => {
  // copy the paper choice into the main controls
  const wp = document.getElementById("wizPaper").value;
  paperEl.value = wp;
  if (wp === "custom") {
    paperW.value = document.getElementById("wizPW").value;
    paperH.value = document.getElementById("wizPH").value;
  }
  document.getElementById("customPaper").hidden = wp !== "custom";
  if (!parsePaper()) return;

  if (wizChoice === "preGrid") {
    const cols = +document.getElementById("wizCols").value;
    const rows = +document.getElementById("wizRows").value;
    if (!(cols >= 2 && rows >= 2)) return;
    gridCols = Math.round(cols);
    gridRows = Math.round(rows);
    mode = "preGrid";
  } else {
    const b = +document.getElementById("wizBlock").value;
    if (!(b > 0)) return;
    blockMM = b;
    mode = "blockSize";
  }
  document.getElementById("gridField").style.display = "none";
  wizard.hidden = true;
  render();
  maybeRecommend();
});

document.getElementById("setupBtn").addEventListener("click", () => wizShow("wizStep1"));

// ---------- measurement recommendation ----------
// each block should average >=3 photo pixels (finer keeps no extra quality),
// blocks under 3 mm are hard to hand-draw, and past ~64 blocks across the
// work grows without visible gain
function recommend(paper) {
  if (!sourceImg || !paper) return null;
  const iw = sourceImg.naturalWidth, ih = sourceImg.naturalHeight;
  let pw = paper.w, ph = paper.h;
  if ((iw > ih) !== (pw > ph)) [pw, ph] = [ph, pw];
  const maxFromImage = Math.floor(iw / 3);
  const maxFromPaper = Math.floor(pw / 3);
  const targetCols = Math.max(12, Math.min(maxFromImage, maxFromPaper, 64));
  const block = Math.max(3, Math.round((pw / targetCols) * 2) / 2); // nearest 0.5 mm
  const cols = Math.floor(pw / block);
  const rows = Math.min(Math.max(1, Math.round(cols * ih / iw)), Math.floor(ph / block));
  return {
    block, cols, rows,
    text: "Your photo is " + iw + " × " + ih + " px. On " + paper.label + ", " +
      block + " mm squares give " + cols + " × " + rows + " blocks — keeps the detail " +
      "the photo actually has, without blocks too small to draw."
  };
}

const recBox = document.getElementById("recBox");
function maybeRecommend() {
  if (mode !== "blockSize") { recBox.hidden = true; return; }
  const rec = recommend(parsePaper());
  if (!rec || rec.block === blockMM) { recBox.hidden = true; return; }
  document.getElementById("recText").textContent = rec.text;
  recBox.dataset.block = rec.block;
  recBox.hidden = false;
}
document.getElementById("recApply").addEventListener("click", () => {
  blockMM = +recBox.dataset.block;
  recBox.hidden = true;
  render();
});
document.getElementById("recDismiss").addEventListener("click", () => { recBox.hidden = true; });

// prefill the wizard's block-size input when a photo is already loaded
function parseWizPaper() {
  const sel = document.getElementById("wizPaper");
  if (sel.value === "custom") {
    const w = +document.getElementById("wizPW").value, h = +document.getElementById("wizPH").value;
    return (w && h) ? { w, h, label: w + " × " + h + " mm" } : null;
  }
  const [w, h] = sel.value.split("x").map(Number);
  return { w, h, label: sel.options[sel.selectedIndex].text };
}
function updateWizHint() {
  const hint = document.getElementById("wizRecHint");
  const rec = wizChoice === "blank" ? recommend(parseWizPaper()) : null;
  if (!rec) { hint.hidden = true; return; }
  document.getElementById("wizBlock").value = rec.block;
  hint.textContent = "Recommended for your photo: " + rec.block + " mm → " + rec.cols + " × " + rec.rows + " blocks";
  hint.hidden = false;
}
["wizPaper", "wizPW", "wizPH"].forEach(id =>
  document.getElementById(id).addEventListener("input", updateWizHint));

wizShow("wizStep1"); // ask on every visit
