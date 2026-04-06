/* ─── State ───────────────────────────────────────────────────────────────── */
const STATE = {
  sessionId:   crypto.randomUUID(),
  items:       new Map(),   // id -> ImageItem
  cancelled:   false,
  processing:  false,
  concurrency: 3,
};

/* ─── DOM refs ────────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const els = {
  dropZone:       $('dropZone'),
  fileInput:      $('fileInput'),
  modeAI:         $('modeAI'),
  modeColor:      $('modeColor'),
  panelAI:        $('panelAI'),
  panelColor:     $('panelColor'),
  modelSelect:    $('modelSelect'),
  colorInput:     $('colorInput'),
  colorHex:       $('colorHex'),
  colorSwatch:    $('colorSwatch'),
  btnEyedrop:     $('btnEyedrop'),
  tolerance:      $('tolerance'),
  toleranceVal:   $('toleranceVal'),
  feather:        $('feather'),
  featherVal:     $('featherVal'),
  methodFlood:    $('methodFlood'),
  methodGlobal:   $('methodGlobal'),
  btnProcess:     $('btnProcess'),
  btnDownloadZip: $('btnDownloadZip'),
  btnClearAll:    $('btnClearAll'),
  btnSelAll:      $('btnSelAll'),
  btnSelNone:     $('btnSelNone'),
  previewGrid:    $('previewGrid'),
  statTotal:      $('statTotal'),
  statDone:       $('statDone'),
  statError:      $('statError'),
  progressFooter: $('progressFooter'),
  progressFill:   $('progressFill'),
  progressText:   $('progressText'),
  btnCancel:      $('btnCancel'),
  aiStatusDot:    $('aiStatusDot'),
  aiStatusLabel:  $('aiStatusLabel'),
  toolbarLabel:   $('toolbarLabel'),
  // Eye-dropper modal
  eyedropModal:   $('eyedropModal'),
  eyedropCanvas:  $('eyedropCanvas'),
  eyedropColorBox:$('eyedropColorBox'),
  eyedropColorVal:$('eyedropColorVal'),
  btnEyedropOk:   $('btnEyedropOk'),
  btnEyedropCancel:$('btnEyedropCancel'),
};

/* ─── Init ────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setupDropZone();
  setupModeToggle();
  setupColorControls();
  setupMethodToggle();
  setupRangeSliders();
  setupButtons();
  setupEyedropper();
  setupModelWarning();
  pollAIStatus();
  updateUI();
});

/* ─── Model Warning ───────────────────────────────────────────────────────── */
function setupModelWarning() {
  els.modelSelect.addEventListener('change', () => {
    const warning = $('modelWarning');
    warning.style.display = els.modelSelect.value === 'balanced' ? 'none' : 'block';
  });
}

/* ─── AI Status Polling ───────────────────────────────────────────────────── */
function pollAIStatus() {
  const check = async () => {
    try {
      const r = await fetch('api/status');
      const d = await r.json();
      if (d.ai_ready) {
        els.aiStatusDot.className   = 'ai-status-dot ready';
        els.aiStatusLabel.textContent = 'AI Ready';
      } else {
        setTimeout(check, 2000);
      }
    } catch { setTimeout(check, 3000); }
  };
  check();
}

/* ─── Drop Zone ───────────────────────────────────────────────────────────── */
function setupDropZone() {
  els.dropZone.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', e => addFiles(e.target.files));

  els.dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    els.dropZone.classList.add('drag-over');
  });
  els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('drag-over'));
  els.dropZone.addEventListener('drop', e => {
    e.preventDefault();
    els.dropZone.classList.remove('drag-over');
    addFiles(e.dataTransfer.files);
  });
}

/* ─── Add Files ───────────────────────────────────────────────────────────── */
function addFiles(files) {
  const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
  if (!imageFiles.length) return;

  // Remove empty state
  const empty = els.previewGrid.querySelector('.empty-state');
  if (empty) empty.remove();

  imageFiles.forEach(file => {
    const id   = crypto.randomUUID();
    const item = {
      id,
      file,
      name:         file.name,
      status:       'pending',   // pending|queued|processing|done|error
      originalUrl:  URL.createObjectURL(file),
      processedUrl: null,
      token:        null,
      error:        null,
      showingOriginal: false,
    };
    STATE.items.set(id, item);
    renderCard(id);
  });

  // Reset file input so same files can be re-added after clear
  els.fileInput.value = '';
  updateUI();
}

/* ─── Render Card ─────────────────────────────────────────────────────────── */
function renderCard(id) {
  const item = STATE.items.get(id);
  const card = document.createElement('div');
  card.className = 'image-card';
  card.id        = `card-${id}`;
  card.dataset.id = id;

  card.innerHTML = `
    <div class="card-img-area" id="imgArea-${id}">
      <img class="card-img" id="img-${id}" src="${item.originalUrl}" alt="${escapeHtml(item.name)}">
      <div class="card-badge pending" id="badge-${id}">•</div>
      <div class="card-toggle-bar">
        <button class="btn-toggle-view" id="toggleBtn-${id}" disabled>Before / After</button>
      </div>
      <div class="card-error-msg" id="errMsg-${id}"></div>
    </div>
    <div class="card-footer">
      <span class="card-name" title="${escapeHtml(item.name)}">${truncate(item.name, 22)}</span>
      <button class="btn-dl" id="dlBtn-${id}" disabled title="Download PNG">↓</button>
    </div>
  `;

  els.previewGrid.appendChild(card);

  $(`toggleBtn-${id}`).addEventListener('click', () => toggleView(id));
  $(`dlBtn-${id}`).addEventListener('click',     () => downloadSingle(id));
}

/* ─── Update Card ─────────────────────────────────────────────────────────── */
function updateCard(id) {
  const item    = STATE.items.get(id);
  const card    = $(`card-${id}`);
  const imgEl   = $(`img-${id}`);
  const badge   = $(`badge-${id}`);
  const imgArea = $(`imgArea-${id}`);
  const toggle  = $(`toggleBtn-${id}`);
  const dlBtn   = $(`dlBtn-${id}`);
  const errMsg  = $(`errMsg-${id}`);
  if (!card) return;

  // Badge
  badge.className = `card-badge ${item.status}`;
  const badgeIcons = { pending:'•', queued:'⋯', done:'✓', error:'✕' };
  badge.textContent = badgeIcons[item.status] ?? '';

  if (item.status === 'done') {
    card.classList.add('is-done');
    card.classList.remove('is-error');
    imgEl.src = item.processedUrl;
    imgArea.classList.add('show-checker');
    item.showingOriginal = false;
    toggle.disabled = false;
    toggle.textContent = 'See Original';
    dlBtn.disabled = false;
  }

  if (item.status === 'error') {
    card.classList.add('is-error');
    card.classList.remove('is-done');
    errMsg.textContent = item.error || 'Processing failed';
  }
}

/* ─── Toggle Before/After ─────────────────────────────────────────────────── */
function toggleView(id) {
  const item    = STATE.items.get(id);
  const imgEl   = $(`img-${id}`);
  const imgArea = $(`imgArea-${id}`);
  const toggle  = $(`toggleBtn-${id}`);
  if (!item || item.status !== 'done') return;

  if (item.showingOriginal) {
    imgEl.src  = item.processedUrl;
    imgArea.classList.add('show-checker');
    toggle.textContent = 'See Original';
    item.showingOriginal = false;
  } else {
    imgEl.src  = item.originalUrl;
    imgArea.classList.remove('show-checker');
    toggle.textContent = 'See Result';
    item.showingOriginal = true;
  }
}

/* ─── Mode Toggle ─────────────────────────────────────────────────────────── */
function setupModeToggle() {
  els.modeAI.addEventListener('click', () => setMode('ai'));
  els.modeColor.addEventListener('click', () => setMode('color'));
}

function setMode(mode) {
  STATE.mode = mode;
  els.modeAI.classList.toggle('active', mode === 'ai');
  els.modeColor.classList.toggle('active', mode === 'color');
  els.panelAI.classList.toggle('active', mode === 'ai');
  els.panelColor.classList.toggle('active', mode === 'color');
}

/* ─── Color Controls ──────────────────────────────────────────────────────── */
function setupColorControls() {
  // Sync color picker <-> hex text field
  els.colorInput.addEventListener('input', () => {
    els.colorHex.value = els.colorInput.value.toUpperCase();
    els.colorSwatch.style.background = els.colorInput.value;
  });

  els.colorHex.addEventListener('input', () => {
    const v = els.colorHex.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      els.colorInput.value = v;
      els.colorSwatch.style.background = v;
    }
  });

  // Initialise swatch
  els.colorSwatch.style.background = els.colorInput.value;
}

function setupMethodToggle() {
  els.methodFlood.addEventListener('click',  () => setMethod('flood'));
  els.methodGlobal.addEventListener('click', () => setMethod('global'));
}

function setMethod(m) {
  els.methodFlood.classList.toggle('active',  m === 'flood');
  els.methodGlobal.classList.toggle('active', m === 'global');
}

function getMethod() {
  return els.methodFlood.classList.contains('active') ? 'flood' : 'global';
}

function setupRangeSliders() {
  els.tolerance.addEventListener('input', () => {
    els.toleranceVal.textContent = els.tolerance.value;
  });
  els.feather.addEventListener('input', () => {
    els.featherVal.textContent = els.feather.value;
  });
}

/* ─── Buttons ─────────────────────────────────────────────────────────────── */
function setupButtons() {
  els.btnProcess.addEventListener('click',     startProcessing);
  els.btnDownloadZip.addEventListener('click', downloadZip);
  $('btnDownloadZipSm').addEventListener('click', downloadZip);
  els.btnClearAll.addEventListener('click',    clearAll);
  els.btnCancel.addEventListener('click',      () => { STATE.cancelled = true; });
}

/* ─── Process All ─────────────────────────────────────────────────────────── */
async function startProcessing() {
  if (STATE.processing) return;

  const pending = [...STATE.items.values()].filter(i => i.status === 'pending');
  if (!pending.length) return;

  STATE.processing = true;
  STATE.cancelled  = false;

  // Mark all pending as queued
  pending.forEach(item => { item.status = 'queued'; updateCard(item.id); });

  const total   = pending.length;
  let   done    = 0;
  const queue   = [...pending];

  setProgress(0, total);

  const settings = getSettings();

  const worker = async () => {
    while (queue.length > 0 && !STATE.cancelled) {
      const item = queue.shift();
      item.status = 'processing';
      updateCard(item.id);

      try {
        const res   = await processOne(item, settings);
        item.status       = 'done';
        item.processedUrl = res.data;
        item.token        = res.token;
      } catch (err) {
        item.status = 'error';
        item.error  = err.message || 'Unknown error';
      }

      done++;
      updateCard(item.id);
      setProgress(done, total);
    }
  };

  await Promise.all(Array.from({ length: STATE.concurrency }, worker));

  // If cancelled, mark remaining queued as pending again
  if (STATE.cancelled) {
    STATE.items.forEach(item => {
      if (item.status === 'queued') { item.status = 'pending'; updateCard(item.id); }
    });
  }

  STATE.processing = false;
  STATE.cancelled  = false;
  updateUI();
}

async function processOne(item, settings) {
  const fd = new FormData();
  fd.append('image',      item.file);
  fd.append('mode',       settings.mode);
  fd.append('session_id', STATE.sessionId);

  if (settings.mode === 'ai') {
    fd.append('model', settings.model);
  } else {
    fd.append('color',     settings.color);
    fd.append('tolerance', settings.tolerance);
    fd.append('method',    settings.method);
    fd.append('feather',   settings.feather);
  }

  const resp = await fetch('api/process', { method: 'POST', body: fd });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${resp.status}`);
  }
  return resp.json();
}

function getSettings() {
  return {
    mode:      STATE.mode || 'ai',
    model:     els.modelSelect.value,
    color:     els.colorInput.value,
    tolerance: parseInt(els.tolerance.value, 10),
    method:    getMethod(),
    feather:   parseInt(els.feather.value, 10),
  };
}

/* ─── Download Single ─────────────────────────────────────────────────────── */
function downloadSingle(id) {
  const item = STATE.items.get(id);
  if (!item?.processedUrl) return;

  const stem = item.name.replace(/\.[^.]+$/, '');
  const a    = document.createElement('a');
  a.href     = item.processedUrl;
  a.download = stem + '_nobg.png';
  a.click();
}

/* ─── Download ZIP ────────────────────────────────────────────────────────── */
async function downloadZip() {
  const tokens = [...STATE.items.values()]
    .filter(i => i.token)
    .map(i => i.token);

  if (!tokens.length) return;

  const btn      = els.btnDownloadZip;
  const origText = btn.textContent;
  btn.disabled   = true;
  btn.textContent = 'Preparing ZIP…';

  try {
    const resp = await fetch('api/download-zip', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ tokens }),
    });

    if (!resp.ok) throw new Error('ZIP creation failed');

    const blob = await resp.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'BackgroundForge_processed.zip';
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('ZIP download failed: ' + e.message);
  } finally {
    btn.disabled    = false;
    btn.textContent = origText;
  }
}

/* ─── Clear All ───────────────────────────────────────────────────────────── */
function clearAll() {
  if (STATE.processing) return;
  // Revoke object URLs to free memory
  STATE.items.forEach(item => {
    if (item.originalUrl)  URL.revokeObjectURL(item.originalUrl);
  });
  STATE.items.clear();
  els.previewGrid.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">🖼️</div>
      <div class="empty-state-title">No images yet</div>
      <div class="empty-state-sub">Drop images here or use the sidebar to add them</div>
    </div>`;
  updateUI();
}

/* ─── UI State ────────────────────────────────────────────────────────────── */
function updateUI() {
  const items    = [...STATE.items.values()];
  const total    = items.length;
  const done     = items.filter(i => i.status === 'done').length;
  const errors   = items.filter(i => i.status === 'error').length;
  const pending  = items.filter(i => i.status === 'pending').length;

  els.statTotal.textContent = total;
  els.statDone.textContent  = done;
  els.statError.textContent = errors;

  els.btnProcess.disabled     = STATE.processing || pending === 0;
  els.btnDownloadZip.disabled = done === 0;
  $('btnDownloadZipSm').disabled = done === 0;
  els.btnClearAll.disabled    = STATE.processing || total === 0;

  const label = total === 0
    ? 'No images loaded'
    : `${total} image${total !== 1 ? 's' : ''} — ${done} processed${errors ? `, ${errors} error${errors !== 1 ? 's' : ''}` : ''}`;
  els.toolbarLabel.innerHTML = `<strong>${label}</strong>`;
}

function setProgress(done, total) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  els.progressFill.style.width  = pct + '%';
  els.progressText.textContent  = `${done} / ${total} (${pct}%)`;
  els.progressFooter.classList.toggle('hidden', total === 0 || done === total);
  updateUI();
}

/* ─── Eye-Dropper Modal ───────────────────────────────────────────────────── */
let _pickedColor = null;

function setupEyedropper() {
  els.btnEyedrop.addEventListener('click', openEyedropper);
  els.btnEyedropCancel.addEventListener('click', closeEyedropper);
  els.btnEyedropOk.addEventListener('click', confirmEyedropColor);
  els.eyedropModal.addEventListener('click', e => {
    if (e.target === els.eyedropModal) closeEyedropper();
  });
  els.eyedropCanvas.addEventListener('mousemove', eyedropHover);
  els.eyedropCanvas.addEventListener('click',     eyedropPick);
}

function openEyedropper() {
  // Use first available image
  const firstItem = [...STATE.items.values()].find(i => i.originalUrl);
  if (!firstItem) { alert('Add at least one image first.'); return; }

  _pickedColor = null;
  els.btnEyedropOk.disabled = true;
  els.eyedropColorBox.style.background = 'transparent';
  els.eyedropColorVal.textContent = 'Hover to sample…';

  const img = new Image();
  img.onload = () => {
    els.eyedropCanvas.width  = img.naturalWidth;
    els.eyedropCanvas.height = img.naturalHeight;
    const ctx = els.eyedropCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    els.eyedropModal.classList.add('open');
  };
  img.src = firstItem.originalUrl;
}

function closeEyedropper() {
  els.eyedropModal.classList.remove('open');
}

function eyedropHover(e) {
  const hex = sampleCanvasColor(e);
  if (!hex) return;
  els.eyedropColorBox.style.background = hex;
  els.eyedropColorVal.textContent      = hex;
}

function eyedropPick(e) {
  const hex = sampleCanvasColor(e);
  if (!hex) return;
  _pickedColor = hex;
  els.eyedropColorBox.style.background = hex;
  els.eyedropColorVal.textContent      = hex + '  ✓ Click "Use Color" to apply';
  els.btnEyedropOk.disabled = false;
}

function sampleCanvasColor(e) {
  const rect = els.eyedropCanvas.getBoundingClientRect();
  const scaleX = els.eyedropCanvas.width  / rect.width;
  const scaleY = els.eyedropCanvas.height / rect.height;
  const x = Math.floor((e.clientX - rect.left) * scaleX);
  const y = Math.floor((e.clientY - rect.top)  * scaleY);
  const ctx = els.eyedropCanvas.getContext('2d');
  const px  = ctx.getImageData(x, y, 1, 1).data;
  return `#${toHex(px[0])}${toHex(px[1])}${toHex(px[2])}`.toUpperCase();
}

function confirmEyedropColor() {
  if (!_pickedColor) return;
  els.colorInput.value              = _pickedColor;
  els.colorHex.value                = _pickedColor.toUpperCase();
  els.colorSwatch.style.background  = _pickedColor;
  // Switch to color mode automatically
  setMode('color');
  closeEyedropper();
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  const ext  = str.lastIndexOf('.');
  const name = ext > 0 ? str.slice(0, ext) : str;
  const extPart = ext > 0 ? str.slice(ext) : '';
  return name.slice(0, maxLen - extPart.length - 1) + '…' + extPart;
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toHex(n) {
  return n.toString(16).padStart(2, '0');
}
