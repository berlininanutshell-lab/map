(function () {
  // --- teksty zależne od języka przeglądarki (domyślnie angielski) ---
  const LANG = (navigator.language || 'en').slice(0, 2);
  const TEXT = {
    en: { ph: 'Paste a link (Telegram, X, YouTube…)', bad: 'Unsupported link.' },
    pl: { ph: 'Wklej link (Telegram, X, YouTube…)', bad: 'Nieobsługiwany link.' },
    uk: { ph: 'Вставте посилання (Telegram, X, YouTube…)', bad: 'Непідтримуване посилання.' },
    ru: { ph: 'Вставьте ссылку (Telegram, X, YouTube…)', bad: 'Неподдерживаемая ссылка.' }
  };
  const t = TEXT[LANG] || TEXT.en;

  // --- rozpoznawanie linku -> co osadzić ---
  function parseVideoUrl(raw) {
    let u;
    try { u = new URL(String(raw).trim()); } catch { return null; }
    const host = u.hostname.replace(/^www\.|^m\./, '');
    const parts = u.pathname.split('/').filter(Boolean);

    // YouTube
    if (host === 'youtu.be' && parts[0])
      return { type: 'iframe', src: `https://www.youtube.com/embed/${parts[0]}`, h: 220 };
    if (host === 'youtube.com') {
      const id = u.searchParams.get('v') || (['shorts', 'embed', 'live'].includes(parts[0]) ? parts[1] : null);
      if (id) return { type: 'iframe', src: `https://www.youtube.com/embed/${id}`, h: 220 };
    }

    // Telegram: t.me/kanal/123 albo t.me/s/kanal/123
    if (host === 't.me' || host === 'telegram.me') {
      const p = parts[0] === 's' ? parts.slice(1) : parts;
      if (p.length >= 2 && /^\d+$/.test(p[1]))
        return { type: 'iframe', src: `https://t.me/${p[0]}/${p[1]}?embed=1&mode=tme&dark=1`, h: 420 };
    }

    // X / Twitter
    if (host === 'x.com' || host === 'twitter.com') {
      const i = parts.indexOf('status');
      if (i !== -1 && /^\d+$/.test(parts[i + 1] || ''))
        return { type: 'iframe', src: `https://platform.twitter.com/embed/Tweet.html?id=${parts[i + 1]}&theme=dark&dnt=true`, h: 420 };
    }

    // Vimeo
    if (host === 'vimeo.com' && /^\d+$/.test(parts[0] || ''))
      return { type: 'iframe', src: `https://player.vimeo.com/video/${parts[0]}`, h: 220 };

    // bezpośredni plik
    if (/\.(mp4|webm|ogg|mov)$/i.test(u.pathname))
      return { type: 'video', src: u.href, h: 220 };

    return null;
  }

  // --- UI ---
  const panel = document.createElement('div');
  panel.id = 'miniPlayer';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="mp-header">
      <span class="mp-title">Mini-player</span>
      <button type="button" class="mp-close" aria-label="Close player">×</button>
    </div>
    <form class="mp-form">
      <input class="mp-input" type="text" placeholder="${t.ph}" autocomplete="off" />
      <button type="submit">▶</button>
    </form>
    <div class="mp-error" hidden></div>
    <div class="mp-body"></div>`;
  document.body.appendChild(panel);

  const openBtn = document.createElement('button');
  openBtn.id = 'miniPlayerBtn';
  openBtn.type = 'button';
  openBtn.textContent = '▶ Video';
  document.body.appendChild(openBtn);

  const body = panel.querySelector('.mp-body');
  const input = panel.querySelector('.mp-input');
  const err = panel.querySelector('.mp-error');

  function clear() { body.innerHTML = ''; } // usuwa iframe = zatrzymuje wideo

  function play(raw) {
    err.hidden = true;
    const info = parseVideoUrl(raw);
    if (!info) {
      err.textContent = t.bad;
      err.hidden = false;
      return;
    }
    clear();
    let el;
    if (info.type === 'video') {
      el = document.createElement('video');
      el.controls = true; el.autoplay = true; el.playsInline = true;
      el.src = info.src;
    } else {
      el = document.createElement('iframe');
      el.src = info.src;
      el.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      el.allowFullscreen = true;
      el.referrerPolicy = 'strict-origin-when-cross-origin';
      el.loading = 'lazy';
    }
    el.style.height = info.h + 'px';
    body.appendChild(el);
  }

  panel.querySelector('.mp-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value.trim()) play(input.value);
  });
  openBtn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) input.focus();
  });
  panel.querySelector('.mp-close').addEventListener('click', () => {
    panel.hidden = true;
    clear();
  });

  // --- przeciąganie za nagłówek ---
  const header = panel.querySelector('.mp-header');
  let drag = null;
  header.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = panel.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    header.setPointerCapture(e.pointerId);
  });
  header.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const x = Math.min(Math.max(0, e.clientX - drag.dx), innerWidth - panel.offsetWidth);
    const y = Math.min(Math.max(0, e.clientY - drag.dy), innerHeight - 40);
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
    panel.style.right = panel.style.bottom = 'auto';
  });
  header.addEventListener('pointerup', () => { drag = null; });

  // --- API ---
  window.miniPlayer = {
    open(url) { panel.hidden = false; input.value = url; play(url); },
    parseVideoUrl
  };

  // --- przyciski ▶ Play (lista geolokalizacji i popupy na mapie) ---
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.mp-inline-btn[data-video-url]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    window.miniPlayer.open(btn.dataset.videoUrl);
  });
})();