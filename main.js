// ── Custom Cursor ──────────────────────────────────────────────────────────

const _cursor = document.getElementById('custom-cursor');
document.addEventListener('mousemove', e => {
  _cursor.style.left = e.clientX + 'px';
  _cursor.style.top  = e.clientY + 'px';
});

// ── Constants ──────────────────────────────────────────────────────────────

const CHUNK_SIZE        = 3;
const CUSTOM_COLOR      = '#9ea0a4';
const CELL_ASPECT       = 4;
const COLS_PER_SPEECH   = 1;   // one column per speech in all-years view
const ALL_YEARS_CELL_PX = 6;   // target cell height in all-years view (drives segsPerCell)

const HOPE_DATA = [
  { year: 2009, count: 4  },
  { year: 2011, count: 9  },
  { year: 2012, count: 0  },
  { year: 2013, count: 6  },
  { year: 2014, count: 2  },
  { year: 2015, count: 5  },
  { year: 2016, count: 11 },
  { year: 2017, count: 3  },
  { year: 2018, count: 3  },
  { year: 2020, count: 0  },
  { year: 2023, count: 1  },
  { year: 2024, count: 1  },
  { year: 2025, count: 1  },
];

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
  return new Set(text.split(WORD_SPLIT).filter(Boolean).map(w => w.toLowerCase()));
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

function isMobile() { return window.innerWidth <= 800; }

function closeDrawer() {
  const pane = document.getElementById('speechPane');
  pane.classList.remove('pane-overlay-open');
  document.body.classList.remove('pane-overlay-open');
}

function openPaneOverlay() {
  const pane = document.getElementById('speechPane');
  pane.classList.add('pane-overlay-open');
  document.body.classList.add('pane-overlay-open');
}

function initSwipeNavigation() {
  const stage = document.getElementById('archiveStage');
  if (!stage) return;
  const sorted = [...SPEECHES].sort((a, b) => new Date(a.date) - new Date(b.date));
  let touchStartX = 0;

  stage.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });

  stage.addEventListener('touchend', e => {
    if (!isMobile() || !state.selectedSpeechId || state.allYears) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) < 50) return; // too short
    const idx = sorted.findIndex(s => s.id === state.selectedSpeechId);
    const next = dx < 0 ? sorted[idx + 1] : sorted[idx - 1];
    if (next) selectYear(next.id);
  }, { passive: true });
}

function renderYearSelector() {
  const container = document.getElementById('yearSelector');
  // Append oldest first → displays left-to-right, matching the grid column order
  const sorted = [...SPEECHES].sort((a, b) => new Date(a.date) - new Date(b.date));

  sorted.forEach(speech => {
    const btn = document.createElement('button');
    btn.className = 'year-btn';
    btn.dataset.id = speech.id;
    btn.textContent = speech.date.slice(0, 4);
    btn.dataset.short = "'" + speech.date.slice(2, 4);
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
  state.lastSpeechId     = state.selectedSpeechId;
  state.allYears         = true;
  state.selectedSpeechId = null;
  activeSegmentIndex     = null;

  document.body.classList.add('view-all');
  document.querySelectorAll('.year-btn').forEach(btn => btn.classList.remove('active'));
  if (isMobile()) closeDrawer(); else setPaneCollapsed(true);

  renderGrid();
}

function selectYear(speechId) {
  state.allYears         = false;
  state.selectedSpeechId = speechId;
  activeSegmentIndex     = null;

  document.body.classList.remove('view-all');
  document.querySelectorAll('.year-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.id === speechId);
  });

  if (isMobile()) {
    closeDrawer(); // ensure pane is closed when switching years
    renderGrid();
    renderSpeechPane();
    syncTopicButtons();
  } else {
    const paneOpening = !state.paneUserCollapsed;
    if (paneOpening) {
      setPaneCollapsed(false);
      // Pre-fade the current grid so the CSS reflow from removing view-all is invisible,
      // then rebuild after the pane transition finishes (0.28s).
      const container = document.getElementById('gridContainer');
      container.style.opacity = '0';
      setTimeout(() => renderGrid(), 310);
    } else {
      renderGrid();
    }
  }
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
    container.style.transition = '';
    requestAnimationFrame(() => { container.style.opacity = '1'; });
  };

  clearTimeout(pendingGridRebuild);
  if (container.children.length > 0) {
    container.style.opacity = '0';
    pendingGridRebuild = setTimeout(rebuild, 150);
  } else {
    rebuild();
  }
}

function buildSingleYearGrid(container) {
  document.body.classList.remove('view-all');
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
  document.body.classList.add('view-all');
  const sortedSpeeches = [...SPEECHES].sort((a, b) => new Date(a.date) - new Date(b.date));
  const maxCount   = Math.max(...Array.from(segmentsCache.values()).map(s => s.length));
  const stage = document.getElementById('archiveStage');
  const containerH = Math.max(200,
    container.clientHeight ||
    container.parentElement?.clientHeight ||
    stage?.clientHeight ||
    window.innerHeight - 150
  );

  const CELL_GAP_PX   = 1;
  const targetRows    = Math.max(10, Math.floor(containerH / ALL_YEARS_CELL_PX));
  const segsPerCell   = Math.max(1, Math.ceil(maxCount / targetRows));
  const cellH         = Math.max(3, Math.floor((containerH - (targetRows - 1) * CELL_GAP_PX) / targetRows));
  allYearsSegsPerCell = segsPerCell;

  container.innerHTML = '';

  // Append oldest first → left-to-right
  sortedSpeeches.forEach(speech => {
    const segs     = segmentsCache.get(speech.id) || [];
    const numCells = Math.ceil(segs.length / segsPerCell);

    const colEl = document.createElement('div');
    colEl.className = 'speech-column';
    colEl.dataset.speechId = speech.id;

    const cellsEl = document.createElement('div');
    cellsEl.className = 'column-cells';

    for (let ci = 0; ci < numCells; ci++) {
      const firstSeg = segs[ci * segsPerCell];
      const cell     = document.createElement('div');
      cell.className         = 'cell';
      cell.dataset.speechId  = speech.id;
      cell.dataset.cellIndex = ci;
      cell.style.height      = `${cellH}px`;

      cell.addEventListener('click', () => {
        if (isMobile()) {
          selectYear(speech.id);
        } else {
          state.selectedSpeechId = speech.id;
          renderSpeechPane();
          syncTopicButtons();
          scrollPaneToSegment(firstSeg.index);
        }
      });

      cellsEl.appendChild(cell);
    }

    colEl.appendChild(cellsEl);

    // Hover: highlight column cells + matching year label
    colEl.addEventListener('mouseenter', () => {
      colEl.classList.add('col-hover');
      const btn = document.querySelector(`.year-btn[data-id="${speech.id}"]`);
      if (btn) btn.classList.add('col-hover');
    });
    colEl.addEventListener('mouseleave', () => {
      colEl.classList.remove('col-hover');
      const btn = document.querySelector(`.year-btn[data-id="${speech.id}"]`);
      if (btn) btn.classList.remove('col-hover');
    });

    container.appendChild(colEl);
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
      // Build hit map: cellIndex → { topics: Map<label,count>, customHits: number }
      const buckets = new Map();
      segments.forEach(seg => {
        const ci = Math.floor(seg.index / allYearsSegsPerCell);
        if (!buckets.has(ci)) buckets.set(ci, { topics: new Map(), customHits: 0 });
        const b = buckets.get(ci);
        activeTopicDefs.forEach(t => {
          if (t.terms.some(term => seg.keywords.includes(term)))
            b.topics.set(t.label, (b.topics.get(t.label) || 0) + 1);
        });
        if (hasCustom) {
          const w = wordSet(seg.text);
          if (state.customKeywords.some(kw => w.has(kw))) b.customHits++;
        }
      });


      // Color each cell by matched active topics (gradient if multiple)
      document.querySelectorAll(`.cell[data-speech-id="${speechId}"]`).forEach(cell => {
        cell.classList.remove('lit');
        cell.style.background = cell.style.borderColor = cell.style.boxShadow = '';

        const bucket = buckets.get(parseInt(cell.dataset.cellIndex));
        if (!bucket) return;

        const matchedTopics = activeTopicDefs.filter(t => bucket.topics.has(t.label));
        const customHits    = bucket.customHits;

        if (matchedTopics.length === 0 && customHits === 0) return;

        cell.classList.add('lit');
        const colors = matchedTopics.map(t => t.color);
        if (customHits > 0) colors.push(CUSTOM_COLOR);

        const numTopics   = matchedTopics.length + (customHits > 0 ? 1 : 0);
        const [r, g, b]   = colors.length === 1 ? hexToRgb(colors[0]) : blendColors(colors);
        const bgAlpha     = numTopics === 1 ? 0.72 : 0.90;
        const borderAlpha = numTopics === 1 ? 0.80 : 0.95;
        const glowAlpha   = numTopics === 1 ? 0.25 : 0.45;
        const glowSize    = numTopics === 1 ? 5    : 12;

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

        const bgAlpha     = termHits === 1 ? 0.75 : termHits <= 3 ? 0.92 : 1.0;
        const borderAlpha = termHits === 1 ? 0.90 : termHits <= 3 ? 1.0  : 1.0;
        const glowAlpha   = termHits === 1 ? 0.45 : termHits <= 3 ? 0.65 : 0.85;
        const glowSize    = termHits === 1 ? 10   : termHits <= 3 ? 18   : 28;

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
    btn.innerHTML     = `<span class="btn-label">${topic.label}</span><span class="btn-count">○</span>`;
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
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
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

function buildTooltipHtml(seg, allSegments, bucketSize = 1) {
  const CONTEXT = 2;
  const parts = [];
  // Show context before + the full bucket + context after
  const bucketEnd = Math.min(seg.index + bucketSize - 1, allSegments.length - 1);
  const from = Math.max(0, seg.index - CONTEXT);
  const to   = Math.min(allSegments.length - 1, bucketEnd + CONTEXT);

  for (let i = from; i <= to; i++) {
    const s = allSegments[i];
    if (i >= seg.index && i <= bucketEnd) {
      parts.push(`<span class="ctx-focus">${highlightText(s.text)}</span>`);
    } else {
      parts.push(`<span class="ctx-dim">${escapeHtml(s.text)}</span>`);
    }
  }
  return parts.join(' ');
}

function attachCellTooltip(cell, seg, allSegments, bucketSize = 1) {
  cell.addEventListener('mouseenter', () => {
    tooltip.el.innerHTML = buildTooltipHtml(seg, allSegments, bucketSize);

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

// ── Scrollytelling ─────────────────────────────────────────────────────────

let currentStoryStep    = -1;
let cellBuildTimers     = [];
let explorerRevealing   = false; // blocks observer during reveal transition
let pendingGridRebuild  = null;  // cancellable renderGrid setTimeout id

const SPEECH_ID = 'netanyahu-unga-2023';

function setStoryYearActive(id) {
  document.querySelectorAll('.year-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.id === id);
  });
}

const STORY_STEPS = [
  // 0: Cover — grid empty, just the title screen
  () => {
    cancelCellBuild();
    hideStoryTooltip();
    hideSpeechTextOverlay();
    state.activeTopics.clear();
    state.allYears         = false;
    state.selectedSpeechId = null;
    document.getElementById('gridContainer').innerHTML = '';
    document.getElementById('emptyState').hidden = true;
    setStoryYearActive(null);
  },

  // 1: Dense scrolling text — the raw speech words
  () => {
    cancelCellBuild();
    hideStoryTooltip();
    state.activeTopics.clear();
    document.getElementById('gridContainer').innerHTML = '';
    showSpeechTextOverlay(SPEECH_ID);
    setStoryYearActive(SPEECH_ID);
  },

  // 2: Words transform into cells — crossfade text → barcode
  () => {
    clearTimeout(pendingGridRebuild);
    hideStoryTooltip();
    state.activeTopics.clear();
    state.selectedSpeechId = SPEECH_ID;
    state.allYears = false;
    setStoryYearActive(SPEECH_ID);
    const container = document.getElementById('gridContainer');
    buildSingleYearGrid(container);
    applyIllumination();
    container.style.opacity = '1';
    // Start all cells invisible
    container.querySelectorAll('.cell:not(.cell--blank)').forEach(cell => {
      cell.style.animation = 'none';
      cell.style.opacity   = '0';
    });
    // Fade out text, then animate cells in; show story tooltip once complete
    hideSpeechTextOverlay();
    setTimeout(() => animateCellBuild(container, () => showStoryTooltip(container)), 350);
  },

  // 3: Illuminate שלום
  () => {
    hideStoryTooltip();
    demoSegCursor = 0;
    cancelCellBuild();
    resetCellAnimations();
    setStoryYearActive(SPEECH_ID);
    state.activeTopics.clear();
    activateTopic('Peace');
  },

  // 4: Add conflict topics
  () => {
    setStoryYearActive(SPEECH_ID);
    activateTopic('War');
    activateTopic('Terror');
    activateTopic('Iran');
  },

  // 5: All topics on one speech (2023)
  () => {
    clearTimeout(pendingGridRebuild);
    setStoryYearActive(SPEECH_ID);
    const container = document.getElementById('gridContainer');

    if (state.selectedSpeechId !== SPEECH_ID) {
      // Scrolling back from step 6 (2025) — rebuild 2023 grid with animation
      state.activeTopics.clear();
      state.selectedSpeechId = SPEECH_ID;
      state.allYears = false;
      buildSingleYearGrid(container);
      container.querySelectorAll('.cell:not(.cell--blank)').forEach(cell => {
        cell.style.animation = 'none';
        cell.style.opacity   = '0';
      });
      ALL_TOPICS.forEach(t => activateTopic(t.label));
      animateCellBuild(container);
    } else {
      // Scrolling forward from step 4 — just activate remaining topics
      ALL_TOPICS.forEach(t => activateTopic(t.label));
    }
  },

  // 6: Switch to 2025 speech — peace + conflict topics, build animation
  () => {
    clearTimeout(pendingGridRebuild);
    hideHopeChart();
    const SPEECH_2025 = 'netanyahu-unga-2025';
    setStoryYearActive(SPEECH_2025);
    state.activeTopics.clear();
    state.selectedSpeechId = SPEECH_2025;
    state.allYears = false;
    const container = document.getElementById('gridContainer');
    buildSingleYearGrid(container);
    // Freeze cells invisible, apply topic colors, then animate columns in
    container.querySelectorAll('.cell:not(.cell--blank)').forEach(cell => {
      cell.style.animation = 'none';
      cell.style.opacity   = '0';
    });
    ['Peace', 'War', 'Iran', 'Terror'].forEach(label => activateTopic(label));
    animateCellBuild(container);
  },

  // 7: Hope line chart — show decline across all years
  () => {
    cancelCellBuild();
    setStoryYearActive(null);
    state.activeTopics.clear();
    if (!state.allYears) selectAllYears();
    showHopeChart(false);
  },

  // 8: Overlay Iran line on the hope chart
  () => {
    cancelCellBuild();
    setStoryYearActive(null);
    state.activeTopics.clear();
    if (!state.allYears) selectAllYears();
    showHopeChart(true);
  },

  // 9: Transition to all-years, clear topics
  () => {
    cancelCellBuild();
    hideHopeChart();
    setStoryYearActive(null);
    state.activeTopics.clear();
    selectAllYears();
  },

  // 10: Hide chart, all years all topics
  () => {
    hideHopeChart();
    ALL_TOPICS.forEach(t => activateTopic(t.label));
  },

  // 11: CTA — no vis change, just the button
  () => {},
];

// Compute per-year segment counts for a topic, keyed to HOPE_DATA years
function computeTopicYearData(topicLabel) {
  const topic = ALL_TOPICS.find(t => t.label === topicLabel);
  if (!topic) return HOPE_DATA.map(d => ({ year: d.year, count: 0 }));
  const countByYear = new Map();
  SPEECHES.forEach(speech => {
    const year = parseInt(speech.date.slice(0, 4));
    const segs = segmentsCache.get(speech.id) || [];
    countByYear.set(year, segs.filter(seg =>
      topic.terms.some(term => seg.keywords.includes(term))
    ).length);
  });
  return HOPE_DATA.map(d => ({ year: d.year, count: countByYear.get(d.year) || 0 }));
}

// Catmull-Rom → cubic bezier smooth path (tension 0–1, lower = straighter)
function smoothPath(pts, tension = 0.4) {
  if (pts.length < 2) return '';
  const n = pts.length;
  const clamp = i => Math.max(0, Math.min(n - 1, i));
  let d = `M ${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[clamp(i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[clamp(i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6 * tension;
    const cp1y = p1.y + (p2.y - p0.y) / 6 * tension;
    const cp2x = p2.x - (p3.x - p1.x) / 6 * tension;
    const cp2y = p2.y - (p3.y - p1.y) / 6 * tension;
    d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

// Smoothly reposition the hope line between two sets of y-coordinates
function morphHopeLine(el, fromPts, toPts, baseline, ms, onComplete) {
  const hopeLine = el.querySelector('.hope-line');
  const hopeArea = el.querySelector('.hope-area');
  if (!hopeLine) { onComplete?.(); return; }

  const ease = t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  const x0   = fromPts[0].x.toFixed(2);
  const xN   = fromPts[fromPts.length - 1].x.toFixed(2);
  const t0   = performance.now();

  (function frame(now) {
    const p   = ease(Math.min((now - t0) / ms, 1));
    const pts = fromPts.map((fp, i) => ({ ...fp, y: fp.y + (toPts[i].y - fp.y) * p }));
    const d   = smoothPath(pts);
    hopeLine.setAttribute('d', d);
    if (hopeArea) hopeArea.setAttribute('d', `${d} L ${xN},${baseline} L ${x0},${baseline} Z`);
    el.querySelectorAll('.hope-dot').forEach((dot, i) => dot.setAttribute('cy', pts[i].y.toFixed(2)));
    p < 1 ? requestAnimationFrame(frame) : onComplete?.();
  })(t0);
}

function showHopeChart(withIran = false, _direct = false) {
  const el        = document.getElementById('hopeChart');
  const container = document.getElementById('gridContainer');

  // Capture transition state BEFORE we mutate visibility
  const wasShowing = !el.hidden && !!el.querySelector('.hope-line');
  const hadIran    = !el.hidden && !!el.querySelector('.iran-line');
  const prevHopePoints = el._hopePoints || null;

  container.style.opacity = '0';
  el.hidden = false;

  // Fixed viewBox — SVG scales to container via CSS width:100%
  const VW = 800;
  const VH = 310;
  const PAD = { top: 100, right: 50, bottom: 10, left: 50 };
  const chartW = VW - PAD.left - PAD.right;
  const chartH = VH - PAD.top  - PAD.bottom;
  const xStep   = chartW / (HOPE_DATA.length - 1);

  // Shared y-scale so both lines are proportional to each other
  const hopeMax  = Math.max(...HOPE_DATA.map(d => d.count));
  const iranData = withIran ? computeTopicYearData('Iran') : null;
  const iranMax  = iranData ? Math.max(...iranData.map(d => d.count)) : 0;
  const sharedMax = Math.max(hopeMax, iranMax);

  const yScale = v => chartH - (v / sharedMax) * chartH;

  const hopePoints = HOPE_DATA.map((d, i) => ({
    x: PAD.left + i * xStep,
    y: PAD.top  + yScale(d.count),
    ...d,
  }));
  el._hopePoints = hopePoints;
  const iranPoints = iranData ? iranData.map((d, i) => ({
    x: PAD.left + i * xStep,
    y: PAD.top  + yScale(d.count),
    ...d,
  })) : null;

  const hopePathD = smoothPath(hopePoints);
  const iranPathD = iranPoints ? smoothPath(iranPoints) : null;
  const pathLen   = VW * 4;
  const baseline  = PAD.top + chartH;

  // Smart transition: morph existing hope line instead of rebuilding from scratch
  if (!_direct && wasShowing && prevHopePoints) {
    if (withIran && !hadIran) {
      // Step 7→8: fade annotations, morph hope down to shared-scale positions, then rebuild with Iran
      el.querySelectorAll('.ann-el, .ann-label, .ann-count')
        .forEach(n => { n.style.transition = 'opacity 0.3s ease'; n.style.opacity = '0'; });
      morphHopeLine(el, prevHopePoints, hopePoints, baseline, 650,
        () => showHopeChart(withIran, true));
      return;
    }
    if (!withIran && hadIran) {
      // Step 8→7: fade Iran elements, then morph hope back up, then rebuild without Iran
      el.querySelectorAll('.iran-line, .iran-area, .iran-dot, .line-label--iran, .ann-el, .ann-label, .ann-count')
        .forEach(n => { n.style.transition = 'opacity 0.3s ease'; n.style.opacity = '0'; });
      setTimeout(() => morphHopeLine(el, prevHopePoints, hopePoints, baseline, 550,
        () => showHopeChart(withIran, true)), 300);
      return;
    }
  }


  // Annotation helpers
  const ANN_LINE = 52;

  // Above-point annotation: big count + narrative label + dashed stub
  function annotation(pt, narrative, color, anchor = 'middle') {
    const ly = pt.y - ANN_LINE;
    return `
      <line x1="${pt.x}" y1="${pt.y - 7}" x2="${pt.x}" y2="${ly + 4}"
        stroke="${color}" stroke-width="1" stroke-dasharray="3 4" stroke-linecap="round"
        opacity="0" class="ann-el"/>
      <text x="${pt.x}" y="${ly - 4}" text-anchor="${anchor}"
        style="fill:${color}" class="ann-label" opacity="0">${narrative}</text>
      <text x="${pt.x}" y="${ly - 22}" text-anchor="${anchor}"
        style="fill:${color}" class="ann-count" opacity="0">${pt.count}×</text>`;
  }

  // Below-baseline annotation for zero points
  function zeroAnnotation(pt, narrative, color) {
    return `
      <circle cx="${pt.x}" cy="${pt.y}" r="5" fill="none"
        stroke="${color}" stroke-width="1.5" opacity="0" class="ann-el"/>
      <text x="${pt.x}" y="${(pt.y + 22).toFixed(2)}" text-anchor="middle"
        style="fill:${color}" class="ann-label" opacity="0">${narrative}</text>`;
  }

  // Key story points
  const hope2016  = hopePoints.find(p => p.year === 2016);
  const hope2020  = hopePoints.find(p => p.year === 2020);
  const iranPeak  = iranPoints ? iranPoints.reduce((a, b) => b.count > a.count ? b : a) : null;

  // Visible dots for each data point
  function dots(pts, color, cls) {
    return pts.map(p =>
      `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="3.5"
        fill="${color}" class="${cls}" opacity="0"/>`
    ).join('');
  }

  // Invisible wider hit-area columns (full chart height) for easy hovering
  function hitAreas(pts) {
    return pts.map((p, i) => {
      const half = (i === 0 ? 0 : (pts[i].x - pts[i - 1].x) / 2);
      const x = p.x - half;
      const w = half + (i === pts.length - 1 ? 0 : (pts[i + 1].x - pts[i].x) / 2);
      return `<rect x="${x.toFixed(2)}" y="${PAD.top}" width="${w.toFixed(2)}" height="${chartH}"
        fill="transparent" data-i="${i}" class="chart-hit"/>`;
    }).join('');
  }

  const lastHope = hopePoints[hopePoints.length - 1];
  const lastIran = iranPoints ? iranPoints[iranPoints.length - 1] : null;

  el.innerHTML = `<svg viewBox="0 0 ${VW} ${VH}" width="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="hopeAreaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#b0aaee" stop-opacity="0.12"/>
        <stop offset="100%" stop-color="#b0aaee" stop-opacity="0"/>
      </linearGradient>
      ${iranPathD ? `<linearGradient id="iranAreaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#c42820" stop-opacity="0.10"/>
        <stop offset="100%" stop-color="#c42820" stop-opacity="0"/>
      </linearGradient>` : ''}
    </defs>
    <path d="${hopePathD} L ${lastHope.x.toFixed(2)},${baseline} L ${hopePoints[0].x.toFixed(2)},${baseline} Z"
      fill="url(#hopeAreaGrad)"/>
    <path d="${hopePathD}" fill="none" stroke="#b0aaee" stroke-width="2"
      stroke-linejoin="round"
      stroke-dasharray="${pathLen}" stroke-dashoffset="${pathLen}" class="hope-line"/>
    ${dots(hopePoints, '#b0aaee', 'hope-dot')}
    ${!withIran
      ? `${annotation(hope2016, 'last peak', '#b0aaee')}
         ${zeroAnnotation(hope2020, 'vanishes', 'rgba(176,170,238,0.5)')}`
      : `${annotation(hope2016, 'last peak', '#b0aaee')}
         <text x="${(lastHope.x + 8).toFixed(2)}" y="${lastHope.y.toFixed(2)}"
           dominant-baseline="middle" class="line-label line-label--hope" opacity="0">hope</text>`}
    ${iranPathD ? `
    <path d="${iranPathD} L ${lastIran.x.toFixed(2)},${baseline} L ${iranPoints[0].x.toFixed(2)},${baseline} Z"
      fill="url(#iranAreaGrad)" opacity="0" class="iran-area"/>
    <path d="${iranPathD}" fill="none" stroke="#c42820" stroke-width="2"
      stroke-linejoin="round"
      stroke-dasharray="${pathLen}" stroke-dashoffset="${pathLen}" class="iran-line"/>
    ${dots(iranPoints, '#c42820', 'iran-dot')}
    ${annotation(iranPeak, 'iran peaks', '#c42820')}
    <text x="${(lastIran.x + 8).toFixed(2)}" y="${lastIran.y.toFixed(2)}"
      dominant-baseline="middle" class="line-label line-label--iran" opacity="0">iran</text>
    ` : ''}
    ${hitAreas(hopePoints)}
  </svg>`;

  // Tooltip div (HTML overlay inside #hopeChart)
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  el.appendChild(tip);

  // Wire up hover interactions on hit areas
  const svg     = el.querySelector('svg');
  const tipDots = el.querySelectorAll('.hope-dot, .iran-dot');

  el.querySelectorAll('.chart-hit').forEach(rect => {
    const i = parseInt(rect.dataset.i);
    const hp = hopePoints[i];
    const ip = iranPoints ? iranPoints[i] : null;

    rect.addEventListener('mouseenter', () => {
      // Highlight dots at this column
      tipDots.forEach(d => d.classList.remove('chart-dot--active'));
      el.querySelectorAll(`.hope-dot:nth-of-type(${i + 1}), .iran-dot:nth-of-type(${i + 1})`);
      // Build tooltip content
      tip.innerHTML = `<span class="chart-tip-year">${hp.year}</span>` +
        `<span class="chart-tip-row" style="color:#b0aaee">hope — ${hp.count}×</span>` +
        (ip ? `<span class="chart-tip-row" style="color:#c42820">iran — ${ip.count}×</span>` : '');
      tip.hidden = false;
    });

    rect.addEventListener('mousemove', () => {
      const chartRect = el.getBoundingClientRect();
      const svgRect   = svg.getBoundingClientRect();
      // map viewBox x to screen x for dot position
      const scaleX    = svgRect.width  / VW;
      const scaleY    = svgRect.height / VH;
      const dotScreenX = svgRect.left + hp.x * scaleX - chartRect.left;
      const dotScreenY = svgRect.top  + hp.y * scaleY - chartRect.top;
      tip.style.left = `${dotScreenX - tip.offsetWidth / 2}px`;
      tip.style.top  = `${dotScreenY - tip.offsetHeight - 14}px`;
    });

    rect.addEventListener('mouseleave', () => {
      tip.hidden = true;
    });
  });

  svg.addEventListener('mouseleave', () => { tip.hidden = true; });

  requestAnimationFrame(() => {
    const hopeLine = el.querySelector('.hope-line');
    const iranLine = el.querySelector('.iran-line');

    if (_direct) {
      // Post-morph rebuild: hope already in position, reveal immediately
      hopeLine.style.strokeDashoffset = '0';
      hopeLine.style.transition = 'none';
      el.querySelectorAll('.hope-dot').forEach(d => { d.style.opacity = '1'; });
      if (iranLine) {
        // Animate only the Iran line drawing in
        setTimeout(() => {
          iranLine.style.strokeDashoffset = '0';
          const iranArea = el.querySelector('.iran-area');
          if (iranArea) iranArea.style.opacity = '1';
          el.querySelectorAll('.iran-dot').forEach(d => { d.style.opacity = '1'; });
        }, 80);
        setTimeout(() => {
          el.querySelectorAll('.line-label, .ann-el, .ann-label, .ann-count')
            .forEach(n => { n.style.opacity = '1'; });
        }, 1000);
      } else {
        setTimeout(() => {
          el.querySelectorAll('.ann-el, .ann-label, .ann-count').forEach(n => { n.style.opacity = '1'; });
        }, 200);
      }
    } else {
      // Fresh build: animate hope line drawing in
      hopeLine.style.strokeDashoffset = '0';
      if (iranLine) {
        setTimeout(() => {
          iranLine.style.strokeDashoffset = '0';
          const iranArea = el.querySelector('.iran-area');
          if (iranArea) iranArea.style.opacity = '1';
          el.querySelectorAll('.iran-dot').forEach(d => { d.style.opacity = '1'; });
        }, 800);
        setTimeout(() => {
          el.querySelectorAll('.line-label').forEach(n => { n.style.opacity = '1'; });
        }, 1800);
      } else {
        setTimeout(() => {
          el.querySelectorAll('.ann-el, .ann-label, .ann-count').forEach(n => { n.style.opacity = '1'; });
        }, 1100);
      }
      // Fade in hope dots after line draws
      setTimeout(() => {
        el.querySelectorAll('.hope-dot').forEach(d => { d.style.opacity = '1'; });
      }, 1200);
    }
  });
}

function hideHopeChart() {
  const el = document.getElementById('hopeChart');
  el.hidden = true;
  el.innerHTML = '';
  document.getElementById('gridContainer').style.opacity = '';
}

function buildOverlayHtml(text) {
  const COLORS = ['#5868c0', '#b0aaee', '#f9bc29', '#e07830', '#e04020', '#c42820'];
  return text.split(' ').map(word => {
    if (!word.trim() || Math.random() > 0.03) return escapeHtml(word);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    return `<span class="word-hl" style="background:${color}">${escapeHtml(word)}</span>`;
  }).join(' ');
}

function showSpeechTextOverlay(speechId) {
  const overlay = document.getElementById('speechTextOverlay');
  const speech  = SPEECHES.find(s => s.id === speechId);
  if (!overlay || !speech) return;
  // Repeat text 4× for density + seamless infinite scroll loop
  const block = buildOverlayHtml(speech.text) + '<br><br>';
  overlay.innerHTML = `<div class="overlay-text">${block.repeat(4)}</div>`;
  requestAnimationFrame(() => overlay.classList.add('visible'));
}

function hideSpeechTextOverlay() {
  const overlay = document.getElementById('speechTextOverlay');
  if (!overlay) return;
  overlay.classList.remove('visible');
  setTimeout(() => { overlay.innerHTML = ''; }, 750);
}

function goToStep(n) {
  if (n === currentStoryStep) return;
  currentStoryStep = n;
  document.body.dataset.storyStep = n;
  if (STORY_STEPS[n]) STORY_STEPS[n]();
}

function cancelCellBuild() {
  cellBuildTimers.forEach(id => clearTimeout(id));
  cellBuildTimers = [];
}

function resetCellAnimations() {
  document.querySelectorAll('.cell').forEach(cell => {
    cell.style.animation = '';
    cell.style.opacity   = '';
  });
}

function animateCellBuild(container, onComplete) {
  cancelCellBuild();
  const cols = Array.from(container.querySelectorAll('.speech-column'));

  // Reset all cells to invisible
  cols.forEach(col => {
    col.querySelectorAll('.cell:not(.cell--blank)').forEach(cell => {
      cell.style.animation = 'none';
      cell.style.opacity   = '0';
    });
  });

  // Force reflow
  container.offsetHeight; // eslint-disable-line

  // Stagger reveal by column (barcode scanner effect)
  const COL_DELAY = 38; // ms between columns
  cols.forEach((col, ci) => {
    const cells  = Array.from(col.querySelectorAll('.cell:not(.cell--blank)'));
    const delay  = ci * COL_DELAY;
    const isLast = ci === cols.length - 1;
    cellBuildTimers.push(setTimeout(() => {
      cells.forEach(cell => {
        cell.style.animation  = '';
        cell.style.opacity    = '';
        cell.style.animationName          = 'cellBuildReveal';
        cell.style.animationDuration      = '0.35s';
        cell.style.animationDelay         = '0ms';
        cell.style.animationFillMode      = 'both';
        cell.style.animationTimingFunction = 'ease';
      });
      // Fire callback after the last column's cells have finished animating
      if (isLast && onComplete) setTimeout(onComplete, 400);
    }, delay));
  });
}

let storyFocusCell  = null;
let demoSegCursor   = 0;
let demoContainer   = null;

// Four evenly-spread positions across the speech
const DEMO_SEG_PCTS = [0.15, 0.38, 0.58, 0.78];

function showStoryTooltipAt(container, segments, segIdx) {
  if (!tooltip.el) return;

  const seg = segments[segIdx];
  if (!seg) return;

  const cell = container.querySelector(
    `.cell[data-speech-id="${SPEECH_ID}"][data-index="${seg.index}"]`
  );
  if (!cell) return;

  // Clear previous focus ring
  if (storyFocusCell) storyFocusCell.classList.remove('cell--story-focus');
  storyFocusCell = cell;
  cell.classList.add('cell--story-focus');

  // Build tooltip: context words + annotation
  tooltip.el.innerHTML =
    buildTooltipHtml(seg, segments) +
    `<div class="tooltip-story-note">3 words → 1 cell</div>`;
  tooltip.el.style.borderColor = '';

  // Measure then position
  tooltip.el.style.visibility = 'hidden';
  tooltip.el.classList.add('visible');
  const th = tooltip.el.offsetHeight;
  const tw = tooltip.el.offsetWidth;
  tooltip.el.style.visibility = '';

  const rect   = cell.getBoundingClientRect();
  const margin = 10;
  const vw     = window.innerWidth;

  let top  = rect.top - th - margin;
  if (top < 8) top = rect.bottom + margin;
  let left = rect.left + rect.width / 2 - tw / 2;
  left = Math.max(8, Math.min(left, vw - tw - 8));

  tooltip.el.style.top  = top  + 'px';
  tooltip.el.style.left = left + 'px';
}

function showStoryTooltip(container) {
  const segments = segmentsCache.get(SPEECH_ID);
  if (!segments || segments.length === 0) return;
  demoContainer = container;
  const segIdx = Math.floor(segments.length * DEMO_SEG_PCTS[demoSegCursor]);
  showStoryTooltipAt(container, segments, segIdx);
}

function navigateDemoSeg(dir) {
  const segments = segmentsCache.get(SPEECH_ID);
  if (!segments || !demoContainer) return;
  demoSegCursor = (demoSegCursor + dir + DEMO_SEG_PCTS.length) % DEMO_SEG_PCTS.length;
  const segIdx = Math.floor(segments.length * DEMO_SEG_PCTS[demoSegCursor]);
  showStoryTooltipAt(demoContainer, segments, segIdx);
}

function hideStoryTooltip() {
  if (tooltip.el) {
    tooltip.el.classList.remove('visible');
    tooltip.el.style.borderColor = '';
  }
  if (storyFocusCell) {
    storyFocusCell.classList.remove('cell--story-focus');
    storyFocusCell = null;
  }
}

function initScrollytelling() {
  const steps = document.querySelectorAll('[data-step]');
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Track each step's current intersection ratio so we can always activate
  // the most-visible step — works correctly in both scroll directions.
  const ratios = new Map();
  steps.forEach(step => ratios.set(step, 0));

  const thresholds = Array.from({ length: 21 }, (_, i) => i * 0.05);

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      ratios.set(entry.target, entry.intersectionRatio);
      entry.target.classList.toggle('step-active', entry.isIntersecting);
    });

    // Find the step with the highest visibility
    let bestEl = null, bestRatio = 0;
    ratios.forEach((ratio, el) => {
      if (ratio > bestRatio) { bestRatio = ratio; bestEl = el; }
    });

    if (bestEl && bestRatio > 0 && !explorerRevealing) {
      const n = parseInt(bestEl.dataset.step, 10);
      goToStep(prefersReduced && n === 2 ? 3 : n);
    }
  }, { threshold: thresholds });

  steps.forEach(step => observer.observe(step));

  // On mobile, IntersectionObserver can misbehave with the sticky-vis overlay
  // layout. Use a scroll listener as the authoritative step detector instead.
  if (isMobile()) {
    const allSteps = [...steps];
    let rafPending = false;
    window.addEventListener('scroll', () => {
      if (rafPending || explorerRevealing) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        const mid = window.innerHeight / 2;
        let bestEl = null, bestDist = Infinity;
        allSteps.forEach(el => {
          const r = el.getBoundingClientRect();
          const stepCenter = r.top + r.height / 2;
          const dist = Math.abs(stepCenter - mid);
          if (dist < bestDist) { bestDist = dist; bestEl = el; }
        });
        if (bestEl) {
          const n = parseInt(bestEl.dataset.step, 10);
          goToStep(prefersReduced && n === 2 ? 3 : n);
        }
      });
    }, { passive: true });
  }

  // Segment demo nav (step 2)
  const segNavPrev = document.getElementById('segNavPrev');
  const segNavNext = document.getElementById('segNavNext');
  if (segNavPrev) segNavPrev.addEventListener('click', () => navigateDemoSeg(-1));
  if (segNavNext) segNavNext.addEventListener('click', () => navigateDemoSeg(1));

  // Explorer button
  const btn = document.getElementById('enterExplorer');
  if (btn) btn.addEventListener('click', revealExplorer);

  // Mobile backdrop — tap to close pane overlay
  document.getElementById('drawerBackdrop')?.addEventListener('click', closeDrawer);

  // Mobile burger button — open reading pane as overlay
  document.getElementById('readerBtn')?.addEventListener('click', () => {
    renderSpeechPane();
    syncTopicButtons();
    openPaneOverlay();
  });

  // Pane header tap on mobile — close the overlay
  document.querySelector('.pane-header')?.addEventListener('click', (e) => {
    if (!isMobile()) return;
    if (e.target.closest('.pane-nav, .nav-btn')) return;
    closeDrawer();
  });

  // Back to story button
  const backBtn = document.getElementById('backToStory');
  if (backBtn) backBtn.addEventListener('click', () => {
    if (!state.allYears) {
      // Specific year → go to All view
      selectAllYears();
    } else {
      // All view → go back to cover
      document.body.classList.remove('explorer-mode');
      document.body.classList.remove('view-all');
      currentStoryStep = -1;
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  });
}

function revealExplorer() {
  hideHopeChart();
  explorerRevealing = true;

  // Disable scroll-snap so the browser doesn't snap back to step 0
  // when the layout shifts during the animation
  document.documentElement.style.scrollSnapType = 'none';

  // Phase 1: animate text column out, chart panel expands
  document.body.classList.add('explorer-entering');

  // Phase 2: after animation settles, switch to static explorer layout
  setTimeout(() => {
    document.body.classList.remove('explorer-entering');
    document.body.classList.add('explorer-mode');
    document.documentElement.style.scrollSnapType = '';

    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    // Set up state without triggering premature renderGrid calls
    state.activeTopics.clear();
    ALL_TOPICS.forEach(t => state.activeTopics.add(t.label));
    state.lastSpeechId     = state.selectedSpeechId;
    state.allYears         = true;
    state.selectedSpeechId = null;
    activeSegmentIndex     = null;
    document.body.classList.add('view-all');
    document.querySelectorAll('.year-btn').forEach(btn => btn.classList.remove('active'));
    if (isMobile()) closeDrawer(); else setPaneCollapsed(true);
    syncTopicButtons();

    explorerRevealing = false;
    // Single render after layout reflows
    setTimeout(() => renderGrid(), 80);
  }, 480);
}

// ── Cover decoration ────────────────────────────────────────────────────────

function buildCoverDecoration() {
  const container = document.getElementById('coverGrid');
  if (!container) return;

  const sortedSpeeches = [...SPEECHES].sort((a, b) => new Date(a.date) - new Date(b.date));

  sortedSpeeches.forEach(speech => {
    const segments = segmentsCache.get(speech.id);
    if (!segments || segments.length === 0) return;

    const col = document.createElement('div');
    col.className = 'cover-col';

    // Group segments into ~90 cells per column for dense texture
    const TARGET_CELLS = 90;
    const segsPerCell  = Math.max(1, Math.ceil(segments.length / TARGET_CELLS));

    for (let i = 0; i < segments.length; i += segsPerCell) {
      const group = segments.slice(i, i + segsPerCell);
      const cell  = document.createElement('div');
      cell.className = 'cover-cell';

      // Collect all topic colors matching this cell group
      const matchedColors = [];
      const seenTopics    = new Set();
      group.forEach(seg => {
        ALL_TOPICS.forEach(topic => {
          if (!seenTopics.has(topic.label) && topic.terms.some(term => seg.keywords.includes(term))) {
            seenTopics.add(topic.label);
            matchedColors.push(topic.color);
          }
        });
      });

      if (matchedColors.length > 0) {
        const [r, g, b] = matchedColors.length === 1
          ? hexToRgb(matchedColors[0])
          : blendColors(matchedColors);
        cell.classList.add('lit');
        cell.style.background = buildBackground(matchedColors, 0.72);
        cell.style.boxShadow  = `0 0 5px rgba(${r},${g},${b},0.35)`;
        // Randomise pulse timing per cell for organic feel
        cell.style.setProperty('--pulse-dur',   `${3 + Math.random() * 3}s`);
        cell.style.setProperty('--pulse-delay', `${Math.random() * 4}s`);
      }

      col.appendChild(cell);
    }

    container.appendChild(col);
  });
}

// ── Speech text loading ─────────────────────────────────────────────────────

function cleanSpeechText(raw) {
  const lines = raw.split(/\r?\n/);
  const result = [];
  let started = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!started) {
      if (!line) continue;
      // Skip known header patterns
      if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}/.test(line)) continue;       // date
      if (/^(Transcription|Prime Minister|PM Netanyahu|Speech at|United Nations|General Assembly)/i.test(line)) continue;
      if (/[\u0590-\u05FF]/.test(line)) continue;                            // Hebrew
      if (line.split(/\s+/).length < 5) continue;                           // very short line
      started = true;
    }

    // Stop at footer markers
    if (/[\u0590-\u05FF]/.test(line)) break;
    if (/^(PAGE\s*$|HEAD OF|E-MAIL:|Tel:\s*\+|Fax:)/.test(line)) break;

    // Skip inline editorial inserts
    if (/^(Promoted:|Keep Watching|Related Articles)/i.test(line)) continue;

    result.push(line);
  }

  return result.join(' ')
    .replace(/\s+/g, ' ')
    .replace(/^["\u201c\u201d]+/, '')   // strip leading smart/straight quotes
    .trim();
}

async function loadSpeechTexts() {
  await Promise.all(SPEECHES.map(async speech => {
    const year = speech.id.slice(-4);
    try {
      const res = await fetch(`Data/${year}.txt`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.text();
      const cleaned = cleanSpeechText(raw);
      if (cleaned.length > 100) speech.text = cleaned; // only override if we got real content
    } catch (e) {
      console.warn(`Could not load Data/${year}.txt, using embedded text`, e);
    }
  }));
}

// ── Init ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadSpeechTexts();
  buildAllSegments();
  buildCoverDecoration();
  renderTopicPresets();
  renderYearSelector();
  setupKeywordInput();
  setupTooltip();
  setupSpeechPane();
  setupPaneNav();

  // Start in scrollytelling story mode
  initScrollytelling();
  initSwipeNavigation();

  // Keyboard navigation (explorer mode only)
  const sortedSpeeches = [...SPEECHES].sort((a, b) => new Date(a.date) - new Date(b.date));
  document.addEventListener('keydown', (e) => {
    if (!document.body.classList.contains('explorer-mode')) return;
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

  // ── Session restore ───────────────────────────────────────────────────────

  // Save position before leaving
  window.addEventListener('beforeunload', () => {
    if (document.body.classList.contains('explorer-mode')) {
      sessionStorage.setItem('storyPosition', 'explorer');
    } else if (currentStoryStep > 0) {
      sessionStorage.setItem('storyPosition', String(currentStoryStep));
    } else {
      sessionStorage.removeItem('storyPosition');
    }
  });

  // Restore position on load
  const savedPosition = sessionStorage.getItem('storyPosition');
  if (savedPosition === 'explorer') {
    revealExplorer();
  } else if (savedPosition) {
    const step = parseInt(savedPosition, 10);
    const target = document.querySelector(`[data-step="${step}"]`);
    if (target) target.scrollIntoView({ behavior: 'instant' });
  }
});
