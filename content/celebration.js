// 7 天连续按时休息的庆祝全屏覆盖层。
// 由 Service Worker 在休息结束后、命中里程碑时注入。
//
// 设计要点：
// 1. Shadow DOM 隔离，不被页面 CSS 污染。
// 2. Love monster 尺寸占屏幕高度 ~70%，居中，带脉冲心跳动画。
// 3. 飘散的小爱心做背景装饰。
// 4. 点击任意处关闭；若无交互 6 秒后自动淡出。
// 5. 只读展示，不阻塞扩展其他流程（下一番茄照常自动启动）。

(() => {
  if (window.__tomatoLoveInjected) return;
  window.__tomatoLoveInjected = true;

  const LOVE_URL = chrome.runtime.getURL('themes/monster/love.svg');

  const host = document.createElement('div');
  host.id = '__tomato-love-host';
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'closed' });

  shadow.innerHTML = `
    <style>
      :host, * { box-sizing: border-box; }
      .overlay {
        position: fixed; inset: 0;
        background: radial-gradient(ellipse at center,
                      rgba(255, 182, 202, 0.96) 0%,
                      rgba(212, 42, 85, 0.92) 100%);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Helvetica Neue', sans-serif;
        color: #fff;
        animation: fadeIn 0.4s ease-out;
        overflow: hidden;
        cursor: pointer;
      }
      .overlay.is-leaving {
        animation: fadeOut 0.45s ease-in forwards;
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes fadeOut {
        from { opacity: 1; }
        to   { opacity: 0; }
      }

      .banner {
        font-size: 15px;
        letter-spacing: 6px;
        color: rgba(255,255,255,0.85);
        text-transform: uppercase;
        margin-bottom: 10px;
        text-shadow: 0 2px 8px rgba(122, 42, 58, 0.4);
      }
      .title {
        font-size: 44px;
        font-weight: 700;
        margin-bottom: 6px;
        letter-spacing: 2px;
        text-shadow: 0 2px 14px rgba(122, 42, 58, 0.45);
      }
      .subtitle {
        font-size: 16px;
        color: rgba(255,255,255,0.9);
        margin-bottom: 32px;
        letter-spacing: 1px;
      }

      .monster-stage {
        position: relative;
        width: min(62vh, 60vw);
        height: min(62vh, 60vw);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .monster {
        width: 100%;
        height: 100%;
        display: block;
        animation: pulse 1.1s ease-in-out infinite alternate;
        filter: drop-shadow(0 18px 36px rgba(122, 42, 58, 0.45));
      }
      @keyframes pulse {
        0%   { transform: scale(1)    rotate(-2deg); }
        100% { transform: scale(1.06) rotate(2deg); }
      }

      .hint {
        margin-top: 28px;
        font-size: 12px;
        letter-spacing: 2px;
        color: rgba(255,255,255,0.75);
      }

      /* —— 飘散的爱心装饰 —— */
      .hearts {
        position: absolute; inset: 0;
        pointer-events: none;
        overflow: hidden;
      }
      .heart {
        position: absolute;
        bottom: -60px;
        font-size: 28px;
        color: #fff;
        opacity: 0.85;
        animation: float linear infinite;
        will-change: transform, opacity;
      }
      @keyframes float {
        0%   { transform: translateY(0) rotate(0deg); opacity: 0; }
        10%  { opacity: 1; }
        100% { transform: translateY(-110vh) rotate(360deg); opacity: 0; }
      }
    </style>

    <div class="overlay" id="overlay">
      <div class="hearts" id="hearts"></div>
      <div class="banner">ACHIEVEMENT UNLOCKED</div>
      <div class="title">🏅 徽章解锁 ·love monster</div>
      <div class="subtitle">连续 7 天都按时休息，做得好！</div>
      <div class="monster-stage">
        <img class="monster" src="${LOVE_URL}" alt="love monster" />
      </div>
      <div class="hint">点击任意处关闭 · 6 秒后自动消失</div>
    </div>
  `;

  document.documentElement.appendChild(host);

  const $overlay = shadow.getElementById('overlay');
  const $hearts = shadow.getElementById('hearts');

  // 生成一批飘散的爱心
  const HEART_GLYPHS = ['♥', '❤', '💗', '💖', '💕'];
  for (let i = 0; i < 22; i++) {
    const h = document.createElement('span');
    h.className = 'heart';
    h.textContent = HEART_GLYPHS[i % HEART_GLYPHS.length];
    const left = Math.random() * 100;
    const duration = 4 + Math.random() * 4;
    const delay = Math.random() * 4;
    const size = 18 + Math.random() * 36;
    h.style.left = `${left}%`;
    h.style.fontSize = `${size}px`;
    h.style.animationDuration = `${duration}s`;
    h.style.animationDelay = `${delay}s`;
    h.style.opacity = `${0.55 + Math.random() * 0.45}`;
    $hearts.appendChild(h);
  }

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    $overlay.classList.add('is-leaving');
    setTimeout(() => {
      if (host.isConnected) host.remove();
      window.__tomatoLoveInjected = false;
    }, 460);
  }

  $overlay.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  }, { once: true });

  setTimeout(close, 6000);
})();
