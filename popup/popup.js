// Popup：只负责渲染和把按钮点击翻译成 message。
// 不在这里存状态——状态只存 Service Worker + chrome.storage。

const FOCUS_MS = 25 * 60 * 1000;
const STORAGE_QUOTA_KEY = 'quotaState';
const SETTINGS_KEY = 'settings';
const DEFAULT_SETTINGS = {
  lockscreenBg: 'transparent',
  autoStartNextFocus: true,
  whiteNoiseEnabled: true,
  chimeEnabled: true,
  theme: 'default'
};

// 状态 → 小怪兽的映射（仅 monster 主题下用）
const MONSTER_BY_STATE = {
  IDLE:     'happy',
  FOCUSING: 'calm',
  BREAKING: 'angry',
  PAUSED:   'calm'
};

const els = {
  phaseLabel: document.getElementById('phase-label'),
  timer: document.getElementById('timer'),
  btnPrimary: document.getElementById('btn-primary'),
  btnSkip: document.getElementById('btn-skip'),
  btnReset: document.getElementById('btn-reset'),
  quota: document.getElementById('quota'),
  hint: document.getElementById('hint'),
  bgSelect: document.getElementById('bg-select'),
  autoStart: document.getElementById('auto-start'),
  whiteNoise: document.getElementById('white-noise'),
  chime: document.getElementById('chime'),
  themeSelect: document.getElementById('theme-select'),
  monster: document.getElementById('monster')
};

let currentTheme = 'default';

let currentState = null;
let currentQuota = null;
let tickHandle = null;

function formatMs(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function computeRemaining(state) {
  if (!state) return FOCUS_MS;
  if (state.state === 'FOCUSING' || state.state === 'BREAKING') {
    return Math.max(0, state.endTime - Date.now());
  }
  if (state.state === 'PAUSED') {
    return state.pausedRemaining ?? 0;
  }
  return FOCUS_MS;
}

function renderMonster() {
  if (currentTheme !== 'monster' || !currentState) {
    els.monster.removeAttribute('src');
    return;
  }
  const kind = MONSTER_BY_STATE[currentState.state] || 'happy';
  els.monster.src = chrome.runtime.getURL(`themes/monster/${kind}.svg`);
}

function applyTheme(theme) {
  currentTheme = theme;
  document.body.classList.toggle('theme-monster', theme === 'monster');
  renderMonster();
}

function renderQuota() {
  if (!currentQuota) {
    els.quota.textContent = '今日剩 -/-';
    return;
  }
  const { remaining, limit } = currentQuota;
  els.quota.textContent = `今日剩 ${remaining}/${limit}`;
  els.quota.classList.toggle('exhausted', remaining <= 0);
}

function render() {
  if (!currentState) return;
  const { state, phase } = currentState;

  els.timer.textContent = formatMs(computeRemaining(currentState));
  els.phaseLabel.className = 'phase-label';

  // 休息阶段不允许跳过——这是强制休息的核心。专注阶段允许跳过（提前结束）。
  const isBreakPhase = state === 'BREAKING' || (state === 'PAUSED' && phase === 'break');

  if (state === 'IDLE') {
    els.phaseLabel.textContent = '准备开始';
    els.btnPrimary.textContent = '开始专注';
    els.btnPrimary.dataset.action = 'start';
    els.btnSkip.disabled = true;
    els.hint.textContent = '按时停下来，比多做一轮重要。';
  } else if (state === 'FOCUSING') {
    els.phaseLabel.textContent = '专注中';
    els.phaseLabel.classList.add('focusing');
    els.btnPrimary.textContent = '暂停';
    els.btnPrimary.dataset.action = 'pause';
    els.btnSkip.disabled = false;
    els.hint.textContent = '一次只做一件事。';
  } else if (state === 'BREAKING') {
    els.phaseLabel.textContent = '休息中';
    els.phaseLabel.classList.add('breaking');
    els.btnPrimary.textContent = '暂停';
    els.btnPrimary.dataset.action = 'pause';
    els.btnSkip.disabled = true;
    els.hint.textContent = '切到任意网页，在锁屏上加时或等休息结束。';
  } else if (state === 'PAUSED') {
    els.phaseLabel.textContent = phase === 'focus' ? '专注已暂停' : '休息已暂停';
    els.phaseLabel.classList.add('paused');
    els.btnPrimary.textContent = '继续';
    els.btnPrimary.dataset.action = 'resume';
    els.btnSkip.disabled = isBreakPhase;
    els.hint.textContent = '暂停时间不计入计时。';
  }

  renderQuota();
  renderMonster();
}

async function send(type) {
  try {
    const next = await chrome.runtime.sendMessage({ type });
    if (next && !next.error) {
      currentState = next;
      render();
    }
  } catch (e) {
    console.error('send failed', type, e);
  }
}

async function refresh() {
  try {
    const [state, quota] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_STATE' }),
      chrome.runtime.sendMessage({ type: 'GET_QUOTA' })
    ]);
    currentState = state;
    currentQuota = quota;
    render();
  } catch (e) {
    // Service Worker 可能刚休眠被唤醒，重试一次
    setTimeout(refresh, 100);
  }
}

function startTicking() {
  if (tickHandle) clearInterval(tickHandle);
  tickHandle = setInterval(() => {
    if (!currentState) return;
    if (currentState.state === 'FOCUSING' || currentState.state === 'BREAKING') {
      els.timer.textContent = formatMs(computeRemaining(currentState));
    }
  }, 250);
}

els.btnPrimary.addEventListener('click', () => {
  const action = els.btnPrimary.dataset.action;
  const map = { start: 'START', pause: 'PAUSE', resume: 'RESUME' };
  if (map[action]) send(map[action]);
});

els.btnSkip.addEventListener('click', () => send('SKIP'));
els.btnReset.addEventListener('click', () => send('RESET'));

// —— 锁屏背景设置 ——
async function loadSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
}

(async () => {
  const settings = await loadSettings();
  els.bgSelect.value = settings.lockscreenBg;
  els.autoStart.checked = !!settings.autoStartNextFocus;
  els.whiteNoise.checked = !!settings.whiteNoiseEnabled;
  els.chime.checked = !!settings.chimeEnabled;
  els.themeSelect.value = settings.theme;
  applyTheme(settings.theme);
})();

async function patchSettings(patch) {
  const settings = await loadSettings();
  await chrome.storage.local.set({
    [SETTINGS_KEY]: { ...settings, ...patch }
  });
}

els.bgSelect.addEventListener('change', () =>
  patchSettings({ lockscreenBg: els.bgSelect.value })
);
els.autoStart.addEventListener('change', () =>
  patchSettings({ autoStartNextFocus: els.autoStart.checked })
);
els.whiteNoise.addEventListener('change', () =>
  patchSettings({ whiteNoiseEnabled: els.whiteNoise.checked })
);
els.chime.addEventListener('change', () =>
  patchSettings({ chimeEnabled: els.chime.checked })
);
els.themeSelect.addEventListener('change', () => {
  applyTheme(els.themeSelect.value);
  patchSettings({ theme: els.themeSelect.value });
});

// 双击配额文字 = 重置今日配额（测试用隐藏手势）
els.quota.addEventListener('dblclick', async () => {
  try {
    const q = await chrome.runtime.sendMessage({ type: 'RESET_QUOTA' });
    if (q) {
      currentQuota = q;
      renderQuota();
      els.hint.textContent = '今日配额已重置。';
    }
  } catch (e) {
    console.error('reset quota failed', e);
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'STATE_UPDATE') {
    currentState = msg.state;
    render();
  }
});

// 配额在锁屏里被消耗时，popup 如果开着也要实时更新
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STORAGE_QUOTA_KEY]) return;
  chrome.runtime.sendMessage({ type: 'GET_QUOTA' }).then((q) => {
    currentQuota = q;
    renderQuota();
  }).catch(() => {});
});

refresh();
startTicking();
