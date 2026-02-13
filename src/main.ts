// MCU Practice - Main Application
// Live evaluation, speed-based scoring, auto-submit on correct

import { generateQuestion, getAvailableTopics, ALL_TOPICS, TOPIC_LABELS, type Question, type QuestionTopic } from './engine/generator';
import { checkAnswer } from './engine/evaluator';
import { loadStats, recordAnswer, getLevelProgress, resetStats, formatTime, type Stats } from './engine/gamification';
import './style.css';

// ─── STATE ──────────────────────────────────────────────────────────────

interface LiveResult {
  value: number | null;
  error: string | null;
  isCorrect: boolean;
}

interface CompletedResult {
  xpGained: number;
  streakBonus: number;
  timeBonus: number;
  leveledUp: boolean;
  solveTimeMs: number;
  finalValue: number;
}

interface AppState {
  currentQuestion: Question | null;
  stats: Stats;
  selectedTopics: QuestionTopic[] | 'all';
  showHint: boolean;
  showDashboard: boolean;
  showAnswer: boolean;
  showCheatsheet: boolean;
  // Live evaluation
  liveResult: LiveResult | null;
  // Completed (auto-submitted) result
  completed: CompletedResult | null;
  // Timer
  timerStart: number | null; // timestamp when first keystroke happened
  currentInput: string;      // preserve input across renders
}

const state: AppState = {
  currentQuestion: null,
  stats: loadStats(),
  selectedTopics: 'all',
  showHint: false,
  showDashboard: false,
  showAnswer: false,
  showCheatsheet: false,
  liveResult: null,
  completed: null,
  timerStart: null,
  currentInput: '',
};

// Track elapsed time for display
let timerInterval: ReturnType<typeof setInterval> | null = null;

// ─── HELPERS ────────────────────────────────────────────────────────────

function toBin8(n: number): string {
  return (n & 0xFF).toString(2).padStart(8, '0');
}

function toHex(n: number): string {
  return '0x' + (n & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function simpleMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`{3}c\n([\s\S]*?)`{3}/g, '<pre class="code-block">$1</pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

function startTimer(): void {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    const el = document.getElementById('timer-display');
    if (el && state.timerStart) {
      const elapsed = Date.now() - state.timerStart;
      el.textContent = formatTime(elapsed);
    }
  }, 100);
}

function stopTimer(): void {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ─── LIVE EVALUATION ────────────────────────────────────────────────────

function evaluateLive(inputValue: string): void {
  const q = state.currentQuestion;
  if (!q || state.completed) return;

  state.currentInput = inputValue;
  const trimmed = inputValue.trim();

  if (!trimmed) {
    state.liveResult = null;
    updateLiveDisplay();
    return;
  }

  // Start timer on first non-empty input
  if (!state.timerStart) {
    state.timerStart = Date.now();
    startTimer();
  }

  let result: LiveResult;

  if (q.isReadState) {
    // Parse hex/binary/decimal answer
    let userValue: number | null = null;
    const cleaned = trimmed.toLowerCase().replace(/\s/g, '');

    if (cleaned.startsWith('0x')) {
      userValue = parseInt(cleaned, 16);
    } else if (cleaned.startsWith('0b')) {
      userValue = parseInt(cleaned.substring(2), 2);
    } else if (/^[01]{8}$/.test(cleaned)) {
      userValue = parseInt(cleaned, 2);
    } else if (/^\d+$/.test(cleaned)) {
      userValue = parseInt(cleaned, 10);
    }

    if (userValue === null || isNaN(userValue)) {
      result = { value: null, error: null, isCorrect: false };
    } else {
      userValue &= 0xFF;
      result = { value: userValue, error: null, isCorrect: userValue === q.expectedValue };
    }
  } else {
    // Evaluate C-style code
    try {
      const check = checkAnswer(trimmed, q.register, q.initialValue, q.expectedValue);
      result = {
        value: check.userResult,
        error: check.error || null,
        isCorrect: check.correct,
      };
    } catch {
      result = { value: null, error: null, isCorrect: false };
    }
  }

  state.liveResult = result;
  updateLiveDisplay();

  // Auto-submit if correct
  if (result.isCorrect) {
    handleAutoSubmit();
  }
}

function handleAutoSubmit(): void {
  if (!state.currentQuestion || state.completed || !state.timerStart) return;

  const solveTimeMs = Date.now() - state.timerStart;
  stopTimer();

  const q = state.currentQuestion;
  const result = recordAnswer(state.stats, q.difficulty, q.topic, solveTimeMs);

  state.completed = {
    xpGained: result.xpGained,
    streakBonus: result.streakBonus,
    timeBonus: result.timeBonus,
    leveledUp: result.leveledUp,
    solveTimeMs,
    finalValue: q.expectedValue,
  };

  // Re-render to show completed state
  render();
}

function updateLiveDisplay(): void {
  const liveContainer = document.getElementById('live-result');
  if (!liveContainer) return;

  const q = state.currentQuestion!;
  const res = state.liveResult;

  if (!res || res.value === null) {
    // Show initial register state
    liveContainer.innerHTML = renderBitDisplay(q.initialValue, q.register);
    liveContainer.className = 'live-result';
    return;
  }

  if (res.error) {
    liveContainer.innerHTML = renderBitDisplay(q.initialValue, q.register);
    liveContainer.className = 'live-result';
    return;
  }

  // Show evaluated result with highlighting
  const isCorrect = res.isCorrect;
  liveContainer.innerHTML = renderBitDisplay(
    res.value,
    `${q.register} = ${toHex(res.value)}`,
    undefined,
    isCorrect
  );
  liveContainer.className = `live-result ${isCorrect ? 'live-correct' : 'live-active'}`;
}

// ─── RENDER ─────────────────────────────────────────────────────────────

function render(): void {
  const app = document.getElementById('app')!;
  app.innerHTML = `
    ${renderHeader()}
    <main class="main-content">
      ${state.showDashboard ? renderDashboard() : renderPractice()}
    </main>
    ${state.showCheatsheet ? renderCheatsheet() : ''}
  `;
  attachEventListeners();
}

function renderHeader(): string {
  const progress = getLevelProgress(state.stats);

  return `
    <header class="app-header">
      <div class="header-left">
        <h1 class="app-title">
          <span class="title-icon">⚡</span>
          MCU Practice
        </h1>
        <nav class="header-nav">
          <button class="nav-btn ${!state.showDashboard ? 'active' : ''}" id="nav-practice">Practice</button>
          <button class="nav-btn ${state.showDashboard ? 'active' : ''}" id="nav-dashboard">Dashboard</button>
        </nav>
      </div>
      <div class="header-stats">
        <div class="stat-pill level-pill">
          <span class="stat-label">LVL</span>
          <span class="stat-value">${state.stats.level}</span>
        </div>
        <div class="xp-bar-container">
          <div class="xp-bar-fill" style="width: ${progress.percent}%"></div>
          <span class="xp-bar-text">${progress.current} / ${progress.needed} XP</span>
        </div>
        <div class="stat-pill streak-pill ${state.stats.currentStreak >= 3 ? 'on-fire' : ''}">
          <span class="stat-label">🔥</span>
          <span class="stat-value">${state.stats.currentStreak}</span>
        </div>
      </div>
    </header>
  `;
}

function renderTopicSelector(): string {
  const available = getAvailableTopics(state.stats.level);
  const isAll = state.selectedTopics === 'all';

  return `
    <div class="topic-selector">
      <div class="topic-selector-label">Topics:</div>
      <div class="topic-chips">
        <button class="topic-chip ${isAll ? 'active' : ''}" data-topic="all">
          🎲 All / Random
        </button>
        ${ALL_TOPICS.map(t => {
    const unlocked = available.includes(t);
    const selected = !isAll && (state.selectedTopics as QuestionTopic[]).includes(t);
    return `
            <button 
              class="topic-chip ${selected ? 'active' : ''} ${!unlocked ? 'locked' : ''}"
              data-topic="${t}"
              ${!unlocked ? 'disabled title="Unlock at higher level"' : ''}
            >
              ${!unlocked ? '🔒 ' : ''}${TOPIC_LABELS[t]}
            </button>
          `;
  }).join('')}
      </div>
    </div>
  `;
}

function renderBitDisplay(value: number, label: string, highlightBits?: number[], isCorrect?: boolean): string {
  const bits = toBin8(value);
  return `
    <div class="bit-display ${isCorrect ? 'bit-display-correct' : ''}">
      <div class="bit-display-label">${escapeHtml(label)}</div>
      <div class="bit-display-row">
        ${bits.split('').map((b, i) => {
    const bitIdx = 7 - i;
    const isHighlight = highlightBits?.includes(bitIdx);
    return `
            <div class="bit-cell ${b === '1' ? 'bit-on' : 'bit-off'} ${isHighlight ? 'bit-highlight' : ''}">
              <div class="bit-value">${b}</div>
              <div class="bit-index">${bitIdx}</div>
            </div>
          `;
  }).join('')}
      </div>
    </div>
  `;
}

function renderPractice(): string {
  const q = state.currentQuestion;
  if (!q) {
    return `
      <div class="practice-start">
        ${renderTopicSelector()}
        <button class="btn btn-primary btn-large" id="btn-start">
          ⚡ Start Practicing
        </button>
      </div>
    `;
  }

  return `
    <div class="practice-view">
      ${renderTopicSelector()}
      <div class="question-card">
        <div class="question-header">
          <span class="question-topic-tag">${TOPIC_LABELS[q.topic]}</span>
          <div class="question-header-right">
            <span class="timer" id="timer-display">${state.timerStart ? formatTime(Date.now() - state.timerStart) : '—'}</span>
            <span class="question-difficulty">
              ${'★'.repeat(Math.min(5, Math.ceil(q.difficulty / 2)))}${'☆'.repeat(5 - Math.min(5, Math.ceil(q.difficulty / 2)))}
            </span>
          </div>
        </div>
        <div class="question-prompt">${simpleMarkdown(q.prompt)}</div>
        ${state.showHint ? `<div class="hint-box">💡 ${escapeHtml(q.hint)}</div>` : ''}
      </div>

      <div id="live-result" class="live-result">
        ${renderBitDisplay(q.initialValue, q.register)}
      </div>

      ${!state.completed ? renderInputSection(q) : renderCompletedSection()}
    </div>
  `;
}

function renderInputSection(q: Question): string {
  return `
    <div class="answer-section">
      ${q.isReadState ? `
        <div class="input-group">
          <label class="input-label">Your answer (hex or binary):</label>
          <input type="text" id="answer-input" class="code-input" 
                 placeholder="e.g. 0xAB or 10101011" autocomplete="off" spellcheck="false" 
                 value="${escapeHtml(state.currentInput)}" />
        </div>
      ` : `
        <div class="input-group">
          <label class="input-label">Your code:</label>
          <textarea id="answer-input" class="code-input code-textarea" 
                    placeholder="e.g. ${escapeHtml(q.register)} |= (1<<3);" 
                    rows="3" autocomplete="off" spellcheck="false">${escapeHtml(state.currentInput)}</textarea>
        </div>
      `}
      <div class="answer-actions">
        <button class="btn btn-secondary" id="btn-hint" ${state.showHint ? 'disabled' : ''}>
          💡 Hint
        </button>
        <button class="btn btn-secondary" id="btn-cheatsheet">
          📋 Cheatsheet
        </button>
      </div>
    </div>
  `;
}

function renderCompletedSection(): string {
  const r = state.completed!;
  const q = state.currentQuestion!;
  const solveTimeStr = formatTime(r.solveTimeMs);

  // Speed rating
  const seconds = r.solveTimeMs / 1000;
  let speedLabel: string;
  let speedClass: string;
  if (seconds < 3) {
    speedLabel = '⚡ LIGHTNING';
    speedClass = 'speed-lightning';
  } else if (seconds < 6) {
    speedLabel = '🔥 BLAZING';
    speedClass = 'speed-blazing';
  } else if (seconds < 12) {
    speedLabel = '✨ QUICK';
    speedClass = 'speed-quick';
  } else if (seconds < 30) {
    speedLabel = '✓ SOLVED';
    speedClass = 'speed-normal';
  } else {
    speedLabel = '✓ SOLVED';
    speedClass = 'speed-slow';
  }

  return `
    <div class="result-card result-correct">
      <div class="result-header">
        <div class="speed-badge ${speedClass}">${speedLabel}</div>
        <div class="solve-time">${solveTimeStr}</div>
      </div>
      <div class="result-xp">
        <span class="xp-gain">+${r.xpGained} XP</span>
        ${r.timeBonus > 0 ? `<span class="xp-time-bonus">⏱ +${r.timeBonus} speed bonus</span>` : ''}
        ${r.streakBonus > 0 ? `<span class="xp-streak-bonus">🔥 +${r.streakBonus} streak</span>` : ''}
      </div>
      ${r.leveledUp ? '<div class="level-up-banner">🎉 Level Up!</div>' : ''}
      ${renderBitDisplay(r.finalValue, `${q.register} (result)`)}
    </div>

    <div class="next-section">
      ${state.showAnswer ? `
        <div class="sample-answer-box">
          <div class="sample-answer-label">Sample Answer:</div>
          <pre class="code-block">${escapeHtml(q.sampleAnswer || 'N/A')}</pre>
        </div>
      ` : `
        <button class="btn btn-secondary" id="btn-show-answer">
          👁 Show Sample Answer
        </button>
      `}
      <button class="btn btn-primary btn-large" id="btn-next">
        Next Question →
      </button>
      <div class="next-hint">Press <kbd>Enter</kbd> or <kbd>Space</kbd> for next question</div>
    </div>
  `;
}

function renderDashboard(): string {
  const s = state.stats;
  const progress = getLevelProgress(s);


  return `
    <div class="dashboard">
      <div class="dashboard-grid">
        <div class="dash-card dash-card-level">
          <div class="dash-card-title">Level</div>
          <div class="dash-card-value dash-level">${s.level}</div>
          <div class="xp-bar-container xp-bar-large">
            <div class="xp-bar-fill" style="width: ${progress.percent}%"></div>
            <span class="xp-bar-text">${progress.current} / ${progress.needed} XP</span>
          </div>
          <div class="dash-card-sub">Total XP: ${s.xp}</div>
        </div>

        <div class="dash-card">
          <div class="dash-card-title">Questions</div>
          <div class="dash-card-value">${s.totalQuestions}</div>
          <div class="dash-card-sub">${s.correctAnswers} correct</div>
        </div>

        <div class="dash-card">
          <div class="dash-card-title">Speed</div>
          <div class="dash-card-value">${s.fastestTime > 0 ? formatTime(s.fastestTime) : '—'}</div>
          <div class="dash-card-sub">Fastest solve</div>
          <div class="dash-card-sub">${s.averageTime > 0 ? `Avg: ${formatTime(s.averageTime)}` : ''}</div>
        </div>

        <div class="dash-card">
          <div class="dash-card-title">Streaks</div>
          <div class="dash-card-value">🔥 ${s.currentStreak}</div>
          <div class="dash-card-sub">Best: ${s.bestStreak}</div>
        </div>
      </div>

      <div class="topic-breakdown">
        <h3>Topic Breakdown</h3>
        <div class="topic-stats-grid">
          ${ALL_TOPICS.map(t => {
    const ts = s.topicStats[t];
    const pct = ts ? Math.round((ts.correct / ts.total) * 100) : 0;
    const total = ts?.total || 0;
    return `
              <div class="topic-stat-row">
                <span class="topic-stat-name">${TOPIC_LABELS[t]}</span>
                <div class="topic-stat-bar-bg">
                  <div class="topic-stat-bar-fill" style="width: ${pct}%"></div>
                </div>
                <span class="topic-stat-pct">${total > 0 ? `${pct}%` : '—'}</span>
                <span class="topic-stat-count">${total} done</span>
              </div>
            `;
  }).join('')}
        </div>
      </div>

      <div class="dashboard-actions">
        <button class="btn btn-danger" id="btn-reset-stats">Reset All Stats</button>
      </div>
    </div>
  `;
}

function renderCheatsheet(): string {
  return `
    <div class="cheatsheet-overlay" id="cheatsheet-overlay">
      <div class="cheatsheet-panel">
        <div class="cheatsheet-header">
          <h2>Bit Manipulation Cheatsheet</h2>
          <button class="cheatsheet-close" id="btn-close-cheatsheet">✕</button>
        </div>
        <div class="cheatsheet-content">
          <div class="cheat-section">
            <h3>Set entire register (hex)</h3>
            <pre class="code-block">REGISTER = 0xFF;  // all HIGH
REGISTER = 0x00;  // all LOW</pre>
          </div>
          <div class="cheat-section">
            <h3>Set bits (using bit shift)</h3>
            <pre class="code-block">REGISTER = (1&lt;&lt;3);           // only bit 3
REGISTER = (1&lt;&lt;0)|(1&lt;&lt;2);   // bits 0 and 2</pre>
          </div>
          <div class="cheat-section">
            <h3>Set bit(s) without affecting others</h3>
            <pre class="code-block">REGISTER |= (1&lt;&lt;3);          // set bit 3
REGISTER |= (1&lt;&lt;0)|(1&lt;&lt;2);  // set bits 0 & 2</pre>
          </div>
          <div class="cheat-section">
            <h3>Clear bit(s) without affecting others</h3>
            <pre class="code-block">REGISTER &= ~(1&lt;&lt;3);              // clear bit 3
REGISTER &= ~((1&lt;&lt;0)|(1&lt;&lt;2));   // clear bits 0 & 2</pre>
          </div>
          <div class="cheat-section">
            <h3>Toggle bit(s)</h3>
            <pre class="code-block">REGISTER ^= (1&lt;&lt;3);          // toggle bit 3
REGISTER ^= (1&lt;&lt;0)|(1&lt;&lt;2);  // toggle bits 0 & 2</pre>
          </div>
          <div class="cheat-section">
            <h3>Using named bits</h3>
            <pre class="code-block">UCSR0B = (1&lt;&lt;RXEN0)|(1&lt;&lt;TXEN0);  // named bits
DDRA = 0xFF;                        // data direction</pre>
          </div>
          <div class="cheat-section">
            <h3>Operators</h3>
            <table class="cheat-table">
              <tr><td><code>|</code></td><td>Bitwise OR</td></tr>
              <tr><td><code>&</code></td><td>Bitwise AND</td></tr>
              <tr><td><code>^</code></td><td>Bitwise XOR</td></tr>
              <tr><td><code>~</code></td><td>Bitwise NOT (complement)</td></tr>
              <tr><td><code>&lt;&lt;</code></td><td>Left shift</td></tr>
              <tr><td><code>&gt;&gt;</code></td><td>Right shift</td></tr>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ─── EVENT HANDLING ─────────────────────────────────────────────────────

function attachEventListeners(): void {
  // Navigation
  document.getElementById('nav-practice')?.addEventListener('click', () => {
    state.showDashboard = false;
    render();
  });

  document.getElementById('nav-dashboard')?.addEventListener('click', () => {
    state.showDashboard = true;
    render();
  });

  // Start / Next question
  document.getElementById('btn-start')?.addEventListener('click', generateNext);
  document.getElementById('btn-next')?.addEventListener('click', generateNext);

  // Hint
  document.getElementById('btn-hint')?.addEventListener('click', () => {
    state.showHint = true;
    render();
    focusInput();
  });

  // Cheatsheet
  document.getElementById('btn-cheatsheet')?.addEventListener('click', () => {
    state.showCheatsheet = true;
    render();
  });
  document.getElementById('btn-close-cheatsheet')?.addEventListener('click', () => {
    state.showCheatsheet = false;
    render();
  });
  document.getElementById('cheatsheet-overlay')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'cheatsheet-overlay') {
      state.showCheatsheet = false;
      render();
    }
  });

  // Show answer
  document.getElementById('btn-show-answer')?.addEventListener('click', () => {
    state.showAnswer = true;
    render();
  });

  // Live evaluation on input
  const input = document.getElementById('answer-input') as HTMLInputElement | HTMLTextAreaElement;
  if (input) {
    input.addEventListener('input', () => {
      evaluateLive(input.value);
    });
    // Restore cursor position after render
    const len = input.value.length;
    input.setSelectionRange(len, len);
    setTimeout(() => input.focus(), 10);
  }

  // Global keyboard shortcuts
  // When completed: Enter or Space advances to next question
  if (state.completed) {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        // Don't capture if user is focused on a button or cheatsheet is open
        if (state.showCheatsheet) return;
        const active = document.activeElement;
        if (active && (active.tagName === 'BUTTON' || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
          // Let buttons handle their own clicks, but Enter on the page should advance
          if (active.tagName !== 'BUTTON') return;
        }
        e.preventDefault();
        generateNext();
      }
    };
    document.addEventListener('keydown', handler);
    // Store handler so we can clean up (will be replaced on next render)
    (window as any).__mcuKeyHandler = handler;
  } else {
    // Clean up old handler
    if ((window as any).__mcuKeyHandler) {
      document.removeEventListener('keydown', (window as any).__mcuKeyHandler);
      (window as any).__mcuKeyHandler = null;
    }
  }

  // Topic chips
  document.querySelectorAll('.topic-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const topic = (chip as HTMLElement).dataset.topic;
      if (!topic) return;

      if (topic === 'all') {
        state.selectedTopics = 'all';
      } else {
        const t = topic as QuestionTopic;
        if (state.selectedTopics === 'all') {
          state.selectedTopics = [t];
        } else {
          const idx = state.selectedTopics.indexOf(t);
          if (idx >= 0) {
            state.selectedTopics.splice(idx, 1);
            if (state.selectedTopics.length === 0) {
              state.selectedTopics = 'all';
            }
          } else {
            state.selectedTopics.push(t);
          }
        }
      }
      render();
    });
  });

  // Reset stats
  document.getElementById('btn-reset-stats')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset all stats? This cannot be undone.')) {
      state.stats = resetStats();
      render();
    }
  });
}

function focusInput(): void {
  setTimeout(() => {
    const input = document.getElementById('answer-input') as HTMLInputElement;
    if (input) {
      input.focus();
      const len = input.value.length;
      input.setSelectionRange(len, len);
    }
  }, 50);
}

function generateNext(): void {
  stopTimer();
  // Clean up keyboard handler
  if ((window as any).__mcuKeyHandler) {
    document.removeEventListener('keydown', (window as any).__mcuKeyHandler);
    (window as any).__mcuKeyHandler = null;
  }
  state.currentQuestion = generateQuestion(state.selectedTopics, state.stats.level);
  state.liveResult = null;
  state.completed = null;
  state.showHint = false;
  state.showAnswer = false;
  state.timerStart = null;
  state.currentInput = '';
  render();
  focusInput();
}

// ─── INIT ───────────────────────────────────────────────────────────────

render();

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration failed, that's ok in dev
    });
  });
}
