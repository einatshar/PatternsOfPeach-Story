// ── Constants ──────────────────────────────────────────────────────────────

const CHUNK_SIZE        = 3;
const CUSTOM_COLOR      = '#9ea0a4';
const CELL_ASPECT       = 4;
const COLS_PER_SPEECH   = 1;   // one column per speech in all-years view
const ALL_YEARS_CELL_PX = 6;   // target cell height (px) in all-years view

let allYearsSegsPerCell = 1;   // updated each time all-years grid is built

// ── State ──────────────────────────────────────────────────────────────────

const state = {
  activeTopics:      new Set(),
  customKeywords:    [],
  selectedSpeechId:  null,
  allYears:          false,
  lastSpeechId:      null,  // remembered when entering all-years
  paneUserCollapsed: false, // true when user explicitly closed the pane
};

const segmentsCache = new Map();

// ── Color utilities ────────────────────────────────────────────────────────

function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function blendColors(hexList) {
  const rgbs = hexList.map(hexToRgb);
  return [
    Math.round(rgbs.reduce((s, c) => s + c[0], 0) / rgbs.length),
    Math.round(rgbs.reduce((s, c) => s + c[1], 0) / rgbs.length),
    Math.round(rgbs.reduce((s, c) => s + c[2], 0) / rgbs.length),
  ];
}

function buildBackground(colors, alpha) {
  if (colors.length === 1) {
    const [r, g, b] = hexToRgb(colors[0]);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  const stops = colors.map((c, i) => {
    const [r, g, b] = hexToRgb(c);
    const pct = Math.round(i * 100 / (colors.length - 1));
    return `rgba(${r},${g},${b},${alpha}) ${pct}%`;
  });
  return `linear-gradient(135deg, ${stops.join(', ')})`;
}

// ── Word matching ──────────────────────────────────────────────────────────

const WORD_SPLIT = /[\s,.\-–—:;!?()[\]"'״׳\/]+/;

function wordSet(text) {
  return new Set(text.split(WORD_SPLIT).filter(Boolean));
}

// ── Speech chunking ────────────────────────────────────────────────────────

function chunkSpeech(text) {
  const words = text.trim().split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += CHUNK_SIZE) {
    chunks.push(words.slice(i, i + CHUNK_SIZE).join(' '));
  }
  return chunks;
}

function computeSegmentKeywords(segText) {
  const words = wordSet(segText);
  const found = new Set();
  ALL_TOPICS.forEach(topic => {
    topic.terms.forEach(term => {
      if (words.has(term)) found.add(term);
    });
  });
  return [...found];
}

function buildSpeechSegments(speech) {
  return chunkSpeech(speech.text).map((text, index) => ({
    index,
    text,
    keywords: computeSegmentKeywords(text),
  }));
}

function buildAllSegments() {
  SPEECHES.forEach(speech => {
    segmentsCache.set(speech.id, buildSpeechSegments(speech));
  });
}

// ── Year selector ──────────────────────────────────────────────────────────

function renderYearSelector() {
  const container = document.getElementById('yearSelector');
  // year-selector uses flex-direction: row-reverse, so append oldest first
  // (first DOM child → rightmost, matching the grid column order)
  const sorted = [...SPEECHES].sort((a, b) => new Date(a.date) - new Date(b.date));

  sorted.forEach(speech => {
    const btn = document.createElement('button');
    btn.className = 'year-btn';
    btn.dataset.id = speech.id;
    btn.textContent = speech.date.slice(0, 4);
    btn.addEventListener('click', () => selectYear(speech.id));
    container.appendChild(btn);
  });
}

function setPaneCollapsed(collapsed) {
  const pane   = document.getElementById('speechPane');
  const toggle = document.getElementById('paneToggle');
  if (!pane) return;
  pane.classList.toggle('collapsed', collapsed);
  if (toggle) toggle.textContent = collapsed ? '‹' : '›';
}

function selectAllYears() {
  state.lastSpeechId   = state.selectedSpeechId;
  state.allYears       = true;
  state.selectedSpeechId = null;
  activeSegmentIndex   = null;

  document.querySelectorAll('.year-btn').forEach(btn => btn.classList.remove('active'));
  setPaneCollapsed(true);

  renderGrid();
}

function selectYear(speechId) {
  state.allYears       = false;
  state.selectedSpeechId = speechId;
  activeSegmentIndex   = null;

  document.querySelectorAll('.year-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.id === speechId);
  });
  if (!state.paneUserCollapsed) setPaneCollapsed(false);

  renderGrid();
}

// ── Layout computation ─────────────────────────────────────────────────────

function computeSegsPerColumn(totalSegments) {
  const stage = document.getElementById('archiveStage');
  const W = stage.clientWidth  || window.innerWidth;
  const H = stage.clientHeight || window.innerHeight - 102;
  const rows = Math.round(Math.sqrt(totalSegments * CELL_ASPECT * H / W));
  return Math.max(3, Math.min(rows, totalSegments));
}

// ── Grid rendering ─────────────────────────────────────────────────────────

function renderGrid() {
  const container  = document.getElementById('gridContainer');
  const emptyState = document.getElementById('emptyState');

  if (!state.allYears && !state.selectedSpeechId) {
    container.innerHTML = '';
    emptyState.hidden = false;
    syncTopicButtons();
    renderSpeechPane();
    return;
  }

  emptyState.hidden = true;

  const rebuild = () => {
    if (state.allYears) buildAllYearsGrid(container);
    else buildSingleYearGrid(container);
    applyIllumination();
    requestAnimationFrame(() => { container.style.opacity = '1'; });
  };

  if (container.children.length > 0) {
    container.style.opacity = '0';
    setTimeout(rebuild, 150);
  } else {
    rebuild();
  }
}

function buildSingleYearGrid(container) {
  const segments = segmentsCache.get(state.selectedSpeechId);
  if (!segments || segments.length === 0) return;

  const maxCount   = Math.max(...Array.from(segmentsCache.values()).map(s => s.length));
  const segsPerCol = computeSegsPerColumn(maxCount);
  const numCols    = Math.ceil(maxCount / segsPerCol);

  container.innerHTML = '';

  for (let c = 0; c < numCols; c++) {
    const col = document.createElement('div');
    col.className = 'speech-column';
    col.style.setProperty('--col-i', c);

    const cellsEl = document.createElement('div');
    cellsEl.className = 'column-cells';

    for (let r = 0; r < segsPerCol; r++) {
      const seg  = segments[c * segsPerCol + r];
      const cell = document.createElement('div');

      if (seg) {
        cell.className = 'cell';
        cell.dataset.speechId = state.selectedSpeechId;
        cell.dataset.index    = seg.index;
        attachCellTooltip(cell, seg, segments);
        cell.addEventListener('click', () => scrollPaneToSegment(seg.index));
      } else {
        cell.className = 'cell cell--blank';
      }

      cellsEl.appendChild(cell);
    }

    col.appendChild(cellsEl);
    container.appendChild(col);
  }
}

function buildAllYearsGrid(container) {
  const sortedSpeeches = [...SPEECHES].sort((a, b) => new Date(a.date) - new Date(b.date));
  const maxCount   = Math.max(...Array.from(segmentsCache.values()).map(s => s.length));
  const stage = document.getElementById('archiveStage');
  const containerH = Math.max(200,
    container.clientHeight ||
    container.parentElement?.clientHeight ||
    stage?.clientHeight ||
    window.innerHeight - 150
  );

  // How many rows would the longest speech have at our target cell height?
  const targetRows    = Math.max(10, Math.floor(containerH / ALL_YEARS_CELL_PX));
  // How many segments does one cell represent (same ratio for all speeches)
  const segsPerCell   = Math.max(1, Math.ceil(maxCount / targetRows));
  allYearsSegsPerCell = segsPerCell;

  const GAP  = 2;
  const cellH = Math.max(3, Math.floor((containerH - (targetRows - 1) * GAP) / targetRows));

  container.innerHTML = '';

  // Append oldest first → appears rightmost with flex row-reverse
  sortedSpeeches.forEach(speech => {
    const segs     = segmentsCache.get(speech.id) || [];
    const numCells = Math.ceil(segs.length / segsPerCell);

    const col = document.createElement('div');
    col.className = 'speech-column';
    col.dataset.speechId = speech.id;
    col.style.justifyContent = 'flex-end'; // anchor cells to bottom (bar-chart baseline)

    const cellsEl = document.createElement('div');
    cellsEl.className = 'column-cells';
    cellsEl.style.flex = '0 0 auto'; // height = speech length, not full container
    cellsEl.style.gap = '2px';

    for (let ci = 0; ci < numCells; ci++) {
      const from    = ci * segsPerCell;
      const bucketSegs = segs.slice(from, from + segsPerCell);
      const firstSeg   = bucketSegs[0];

      const cell = document.createElement('div');
      cell.style.flex         = `0 0 ${cellH}px`;
      cell.className          = 'cell';
      cell.dataset.speechId   = speech.id;
      cell.dataset.cellIndex  = ci;
      cell.dataset.index      = firstSeg.index; // for tooltip compat

      attachCellTooltip(cell, firstSeg, segs);
      cell.addEventListener('click', () => {
        state.selectedSpeechId = speech.id;
        renderSpeechPane();
        syncTopicButtons();
        scrollPaneToSegment(firstSeg.index);
      });

      cellsEl.appendChild(cell);
    }

    col.appendChild(cellsEl);
    container.appendChild(col);
  });
}

// ── Illumination ───────────────────────────────────────────────────────────

function applyIllumination() {
  const speechIds = state.allYears
    ? [...SPEECHES].map(s => s.id)
    : (state.selectedSpeechId ? [state.selectedSpeechId] : []);

  if (speechIds.length === 0) {
    syncTopicButtons();
    renderSpeechPane();
    return;
  }

  const activeTopicDefs = ALL_TOPICS.filter(t => state.activeTopics.has(t.label));
  const hasCustom       = state.customKeywords.length > 0;

  speechIds.forEach(speechId => {
    const segments = segmentsCache.get(speechId);
    if (!segments) return;

    if (state.allYears) {
      // ── All-years: aggregate segments into cell buckets ──────────────────
      // Build hit map: cellIndex → { topicLabels: Set, customHits: number }
      const buckets = new Map();
      segments.forEach(seg => {
        const ci = Math.floor(seg.index / allYearsSegsPerCell);
        if (!buckets.has(ci)) buckets.set(ci, { topics: new Set(), customHits: 0 });
        const b = buckets.get(ci);
        activeTopicDefs.forEach(t => {
          if (t.terms.some(term => seg.keywords.includes(term))) b.topics.add(t.label);
        });
        if (hasCustom) {
          const w = wordSet(seg.text);
          if (state.customKeywords.some(kw => w.has(kw))) b.customHits++;
        }
      });

      document.querySelectorAll(`.cell[data-speech-id="${speechId}"]`).forEach(cell => {
        cell.classList.remove('lit');
        cell.style.background = cell.style.borderColor = cell.style.boxShadow = '';

        const ci     = parseInt(cell.dataset.cellIndex);
        const bucket = buckets.get(ci);
        if (!bucket || (bucket.topics.size === 0 && bucket.customHits === 0)) return;

        cell.classList.add('lit');
        const matchedTopicDefs = activeTopicDefs.filter(t => bucket.topics.has(t.label));
        const colors = matchedTopicDefs.map(t => t.color);
        if (bucket.customHits > 0) colors.push(CUSTOM_COLOR);

        const [r, g, b]   = colors.length === 1 ? hexToRgb(colors[0]) : blendColors(colors);
        const termHits     = bucket.topics.size + (bucket.customHits > 0 ? 1 : 0);
        const bgAlpha      = termHits === 1 ? 0.52 : termHits <= 3 ? 0.80 : 1.0;
        const borderAlpha  = termHits === 1 ? 0.70 : termHits <= 3 ? 0.90 : 1.0;
        const glowAlpha    = termHits === 1 ? 0.20 : termHits <= 3 ? 0.38 : 0.58;
        const glowSize     = termHits === 1 ? 5    : termHits <= 3 ? 10   : 18;

        cell.style.background  = buildBackground(colors, bgAlpha);
        cell.style.borderColor = `rgba(${r},${g},${b},${borderAlpha})`;
        cell.style.boxShadow   = `0 0 ${glowSize}px rgba(${r},${g},${b},${glowAlpha})`;
      });

    } else {
      // ── Single-year: one cell per segment ────────────────────────────────
      segments.forEach(seg => {
        const cell = document.querySelector(
          `.cell[data-speech-id="${speechId}"][data-index="${seg.index}"]`
        );
        if (!cell) return;

        cell.classList.remove('lit');
        cell.style.background = cell.style.borderColor = cell.style.boxShadow = '';

        const matchedTopics = activeTopicDefs.filter(topic =>
          topic.terms.some(term => seg.keywords.includes(term))
        );
        const segWords   = hasCustom ? wordSet(seg.text) : null;
        const customHits = hasCustom
          ? state.customKeywords.filter(kw => segWords.has(kw)).length
          : 0;

        if (matchedTopics.length === 0 && customHits === 0) return;

        cell.classList.add('lit');
        const colors = matchedTopics.map(t => t.color);
        if (customHits > 0) colors.push(CUSTOM_COLOR);

        const [r, g, b] = colors.length === 1 ? hexToRgb(colors[0]) : blendColors(colors);
        const termHits  = matchedTopics.reduce((sum, t) =>
          sum + t.terms.filter(term => seg.keywords.includes(term)).length, 0
        ) + customHits;

        const bgAlpha     = termHits === 1 ? 0.52 : termHits <= 3 ? 0.80 : 1.0;
        const borderAlpha = termHits === 1 ? 0.70 : termHits <= 3 ? 0.90 : 1.0;
        const glowAlpha   = termHits === 1 ? 0.20 : termHits <= 3 ? 0.38 : 0.58;
        const glowSize    = termHits === 1 ? 5    : termHits <= 3 ? 10   : 18;

        cell.style.background  = buildBackground(colors, bgAlpha);
        cell.style.borderColor = `rgba(${r},${g},${b},${borderAlpha})`;
        cell.style.boxShadow   = `0 0 ${glowSize}px rgba(${r},${g},${b},${glowAlpha})`;
      });
    }
  });

  // Keyword count
  const kwCountEl = document.getElementById('keywordCount');
  if (kwCountEl) {
    if (hasCustom) {
      const countIds = state.selectedSpeechId ? [state.selectedSpeechId] : speechIds;
      const kwHits = countIds.reduce((total, speechId) => {
        const segs = segmentsCache.get(speechId) || [];
        return total + segs.filter(seg => {
          const w = wordSet(seg.text);
          return state.customKeywords.some(kw => w.has(kw));
        }).length;
      }, 0);
      kwCountEl.textContent = kwHits > 0 ? kwHits : '';
    } else {
      kwCountEl.textContent = '';
    }
  }

  syncTopicButtons();
  renderSpeechPane();
}

// ── Hit counting ───────────────────────────────────────────────────────────

function countTopicHits(label) {
  const topic = ALL_TOPICS.find(t => t.label === label);
  if (!topic) return 0;

  const speechId = state.selectedSpeechId;
  if (speechId) {
    const segments = segmentsCache.get(speechId) || [];
    return segments.filter(seg =>
      topic.terms.some(term => seg.keywords.includes(term))
    ).length;
  }

  if (state.allYears) {
    return SPEECHES.reduce((total, speech) => {
      const segments = segmentsCache.get(speech.id) || [];
      return total + segments.filter(seg =>
        topic.terms.some(term => seg.keywords.includes(term))
      ).length;
    }, 0);
  }

  return 0;
}

// ── Topic presets ──────────────────────────────────────────────────────────

function renderTopicPresets() {
  const container = document.getElementById('topicPresets');
  ALL_TOPICS.forEach(topic => {
    const btn = document.createElement('button');
    btn.className     = 'topic-btn';
    btn.dataset.topic = topic.label;
    btn.innerHTML     = `<span class="btn-count">○</span><span class="btn-label">${topic.label}</span>`;
    btn.addEventListener('click', () => {
      if (state.activeTopics.has(topic.label)) {
        state.activeTopics.delete(topic.label);
      } else {
        state.activeTopics.add(topic.label);
      }
      syncTopicButtons();
      applyIllumination();
    });
    container.appendChild(btn);
  });
}

function syncTopicButtons() {
  document.querySelectorAll('.topic-btn').forEach(btn => {
    const topic    = ALL_TOPICS.find(t => t.label === btn.dataset.topic);
    const isActive = state.activeTopics.has(btn.dataset.topic);
    btn.classList.toggle('active', isActive);
    const countEl = btn.querySelector('.btn-count');
    if (isActive && topic) {
      if (countEl) countEl.textContent = countTopicHits(topic.label);
      btn.style.color       = topic.color;
      btn.style.borderColor = topic.color;
    } else {
      if (countEl) countEl.textContent = '○';
      btn.style.color       = '';
      btn.style.borderColor = '';
    }
  });
}

function activateTopic(label) {
  const topic = ALL_TOPICS.find(t => t.label === label);
  if (!topic) return;
  state.activeTopics.add(label);
  syncTopicButtons();
  applyIllumination();
}

// ── Keyword input ──────────────────────────────────────────────────────────

function setupKeywordInput() {
  const input = document.getElementById('keywordInput');
  const clear = document.getElementById('clearKeyword');
  let timer;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const raw = input.value.trim();
      state.customKeywords = raw ? raw.split(/\s+/) : [];
      applyIllumination();
    }, 150);
  });

  clear.addEventListener('click', () => {
    input.value          = '';
    state.customKeywords = [];
    applyIllumination();
  });
}

// ── Text highlighting ──────────────────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function highlightText(text) {
  const activeTopicDefs = ALL_TOPICS.filter(t => state.activeTopics.has(t.label));
  const entries = [];
  activeTopicDefs.forEach(topic => {
    topic.terms.forEach(term => entries.push({ term, color: topic.color }));
  });
  state.customKeywords.forEach(kw => entries.push({ term: kw, color: CUSTOM_COLOR }));

  if (!entries.length) return escapeHtml(text);

  const matches = [];
  entries.forEach(({ term, color }) => {
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, text: m[0], color });
    }
  });

  if (!matches.length) return escapeHtml(text);

  matches.sort((a, b) => a.start - b.start);

  let result = '';
  let pos = 0;
  for (const match of matches) {
    if (match.start < pos) continue;
    result += escapeHtml(text.slice(pos, match.start));
    const [r, g, b] = hexToRgb(match.color);
    result += `<mark style="background:rgba(${r},${g},${b},0.18);color:${match.color};border-radius:2px;padding:0 2px">${escapeHtml(match.text)}</mark>`;
    pos = match.end;
  }
  result += escapeHtml(text.slice(pos));
  return result;
}

// ── Tooltip ────────────────────────────────────────────────────────────────

const tooltip = { el: null };

function setupTooltip() {
  tooltip.el = document.getElementById('tooltip');
}

function buildTooltipHtml(seg, allSegments) {
  const CONTEXT = 2;
  const parts = [];
  const from = Math.max(0, seg.index - CONTEXT);
  const to   = Math.min(allSegments.length - 1, seg.index + CONTEXT);

  for (let i = from; i <= to; i++) {
    const s = allSegments[i];
    if (i === seg.index) {
      parts.push(`<span class="ctx-focus">${highlightText(s.text)}</span>`);
    } else {
      parts.push(`<span class="ctx-dim">${escapeHtml(s.text)}</span>`);
    }
  }
  return parts.join(' ');
}

function attachCellTooltip(cell, seg, allSegments) {
  cell.addEventListener('mouseenter', () => {
    tooltip.el.innerHTML = buildTooltipHtml(seg, allSegments);

    if (cell.classList.contains('lit')) {
      const bcMatch = cell.style.borderColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      tooltip.el.style.borderColor = bcMatch
        ? `rgba(${bcMatch[1]},${bcMatch[2]},${bcMatch[3]},0.5)`
        : '';
    } else {
      tooltip.el.style.borderColor = '';
    }

    tooltip.el.style.visibility = 'hidden';
    tooltip.el.classList.add('visible');
    const th = tooltip.el.offsetHeight;
    const tw = tooltip.el.offsetWidth;
    tooltip.el.style.visibility = '';

    const rect   = cell.getBoundingClientRect();
    const margin = 8;
    const vw     = window.innerWidth;

    let top  = rect.top - th - margin;
    if (top < 8) top = rect.bottom + margin;

    let left = rect.left + rect.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, vw - tw - 8));

    tooltip.el.style.top  = top  + 'px';
    tooltip.el.style.left = left + 'px';
  });

  cell.addEventListener('mouseleave', () => {
    tooltip.el.classList.remove('visible');
    tooltip.el.style.borderColor = '';
  });
}

// ── Speech Pane ─────────────────────────────────────────────────────────────

let activeSegmentIndex = null;
let paneSyncLock       = false;
let paneScrollTimer    = null;

function renderSpeechPane() {
  const paneBody  = document.getElementById('paneBody');
  const paneText  = document.getElementById('paneText');
  const paneTitle = document.getElementById('paneSpeechTitle');
  if (!paneBody || !paneText) return;

  const speechId = state.selectedSpeechId;

  if (!speechId) {
    paneText.innerHTML = '';
    if (paneTitle) paneTitle.textContent = '';
    updateSegCounter();
    return;
  }

  const speech   = SPEECHES.find(s => s.id === speechId);
  const segments = segmentsCache.get(speechId);
  if (!segments) return;

  if (paneTitle) paneTitle.textContent = speech ? speech.date.slice(0, 4) : '';

  const activeTopicDefs = ALL_TOPICS.filter(t => state.activeTopics.has(t.label));
  const hasCustom       = state.customKeywords.length > 0;
  const scrollTop       = paneBody.scrollTop;

  const html = segments.map(seg => {
    const matchedTopics = activeTopicDefs.filter(topic =>
      topic.terms.some(term => seg.keywords.includes(term))
    );
    const segWords   = hasCustom ? wordSet(seg.text) : null;
    const customHits = hasCustom
      ? state.customKeywords.filter(kw => segWords.has(kw)).length
      : 0;
    const isLit = matchedTopics.length > 0 || customHits > 0;

    let style = '';
    if (isLit) {
      const colors = matchedTopics.map(t => t.color);
      if (customHits > 0) colors.push(CUSTOM_COLOR);
      const [r, g, b] = colors.length === 1 ? hexToRgb(colors[0]) : blendColors(colors);
      style = ` style="background:rgba(${r},${g},${b},0.13)"`;
    }

    const cls      = isLit ? 'seg-span seg-lit' : 'seg-span';
    const isActive = seg.index === activeSegmentIndex;
    return `<span class="${cls}${isActive ? ' seg-active' : ''}" data-index="${seg.index}"${style}>${highlightText(seg.text)}</span>`;
  }).join(' ');

  paneText.innerHTML = html;
  paneBody.scrollTop = scrollTop;
  updateSegCounter();
}

function updateSegCounter() {
  const counter = document.getElementById('segCounter');
  if (!counter) return;

  const speechId = state.selectedSpeechId;
  if (!speechId || activeSegmentIndex === null) {
    counter.textContent = '';
    return;
  }

  const segments = segmentsCache.get(speechId);
  if (!segments) return;
  counter.textContent = `${activeSegmentIndex + 1}/${segments.length}`;
}

function setActiveSegment(index) {
  activeSegmentIndex = index;

  document.querySelectorAll('.seg-span').forEach(el => {
    el.classList.toggle('seg-active', parseInt(el.dataset.index, 10) === index);
  });

  document.querySelectorAll('.cell--active').forEach(el => el.classList.remove('cell--active'));
  if (state.selectedSpeechId) {
    const cell = document.querySelector(
      `.cell[data-speech-id="${state.selectedSpeechId}"][data-index="${index}"]`
    );
    if (cell) cell.classList.add('cell--active');
  }

  updateSegCounter();
}

function scrollPaneToSegment(index) {
  const paneBody = document.getElementById('paneBody');
  const paneText = document.getElementById('paneText');
  if (!paneBody || !paneText) return;

  const target = paneText.querySelector(`.seg-span[data-index="${index}"]`);
  if (!target) return;

  setActiveSegment(index);

  const pane   = document.getElementById('speechPane');
  const toggle = document.getElementById('paneToggle');
  if (pane && pane.classList.contains('collapsed')) {
    pane.classList.remove('collapsed');
    if (toggle) toggle.textContent = '›';
  }

  paneSyncLock = true;
  const paneRect   = paneBody.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const offset     = targetRect.top - paneRect.top - paneRect.height / 2 + targetRect.height / 2;
  paneBody.scrollBy({ top: offset, behavior: 'smooth' });
  setTimeout(() => { paneSyncLock = false; }, 700);
}

function navigateSegment(direction) {
  const speechId = state.selectedSpeechId;
  if (!speechId) return;
  const segments = segmentsCache.get(speechId);
  if (!segments) return;

  const current = activeSegmentIndex ?? 0;
  const next = direction === 'next'
    ? Math.min(current + 1, segments.length - 1)
    : Math.max(current - 1, 0);
  scrollPaneToSegment(next);
}

function syncGridFromPane() {
  if (paneSyncLock) return;
  const paneBody = document.getElementById('paneBody');
  const paneText = document.getElementById('paneText');
  if (!paneBody || !paneText) return;

  const spans = Array.from(paneText.querySelectorAll('.seg-span'));
  if (!spans.length) return;

  const paneRect = paneBody.getBoundingClientRect();
  const center   = paneRect.top + paneRect.height / 2;
  const rects    = spans.map(s => s.getBoundingClientRect());

  let closestIdx = 0;
  let minDist    = Infinity;
  rects.forEach((rect, i) => {
    if (rect.bottom < paneRect.top || rect.top > paneRect.bottom) return;
    const dist = Math.abs((rect.top + rect.height / 2) - center);
    if (dist < minDist) { minDist = dist; closestIdx = i; }
  });

  const index = parseInt(spans[closestIdx].dataset.index, 10);
  setActiveSegment(index);
}

function setupSpeechPane() {
  const toggle   = document.getElementById('paneToggle');
  const pane     = document.getElementById('speechPane');
  const paneBody = document.getElementById('paneBody');
  const paneText = document.getElementById('paneText');

  toggle.addEventListener('click', () => {
    const collapsed = pane.classList.toggle('collapsed');
    toggle.textContent = collapsed ? '‹' : '›';
    state.paneUserCollapsed = collapsed;
  });

  paneBody.addEventListener('scroll', () => {
    clearTimeout(paneScrollTimer);
    paneScrollTimer = setTimeout(syncGridFromPane, 80);
  });

  paneText.addEventListener('click', e => {
    const span = e.target.closest('.seg-span');
    if (!span) return;
    const idx = parseInt(span.dataset.index, 10);
    setActiveSegment(idx);
  });
}

function setupPaneNav() {
  const prevBtn = document.getElementById('prevSeg');
  const nextBtn = document.getElementById('nextSeg');
  if (prevBtn) prevBtn.addEventListener('click', () => navigateSegment('prev'));
  if (nextBtn) nextBtn.addEventListener('click', () => navigateSegment('next'));
}

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  buildAllSegments();
  renderTopicPresets();
  renderYearSelector();
  setupKeywordInput();
  setupTooltip();
  setupSpeechPane();
  setupPaneNav();

  // Default: all-years view
  selectAllYears();

  // Default: activate שלום
  activateTopic('שלום');

  // Keyboard navigation
  const sortedSpeeches = [...SPEECHES].sort((a, b) => new Date(a.date) - new Date(b.date));
  document.addEventListener('keydown', (e) => {
    const inInput = document.activeElement === document.getElementById('keywordInput');

    if ((e.key === 'a' || e.key === 'A') && !inInput) {
      if (!state.allYears) selectAllYears();
      return;
    }

    if (e.key === 'Escape' && state.allYears) {
      const target = state.lastSpeechId || sortedSpeeches[sortedSpeeches.length - 1]?.id;
      if (target) selectYear(target);
      return;
    }

    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if (inInput || state.allYears) return;

    const idx  = sortedSpeeches.findIndex(s => s.id === state.selectedSpeechId);
    const next = e.key === 'ArrowRight' ? idx + 1 : idx - 1;
    if (next >= 0 && next < sortedSpeeches.length) selectYear(sortedSpeeches[next].id);
  });

  // Reflow on resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.selectedSpeechId || state.allYears) {
        renderGrid();
      }
    }, 120);
  });
});
