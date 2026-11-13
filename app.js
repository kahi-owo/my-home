(function () {
  'use strict';

  const BASE = window.SITE && typeof window.SITE === 'object' ? window.SITE : {};
  const CACHE_KEY = 'site-config';
  const CREDIT = 'Made by Wizvixen';
  const HOME = 'home';
  const SCROLL_SHOW = 300;
  const $ = id => document.getElementById(id);

  let state;
  let current = HOME;
  let shownKey = '';
  let playing = false;
  let adminOn = false;
  let adminLoading = false;
  let adminStart = null;

  const clone = o => JSON.parse(JSON.stringify(o));

  function store(action, value) {
    try {
      if (action === 'get') return localStorage.getItem(CACHE_KEY);
      if (action === 'set') localStorage.setItem(CACHE_KEY, value);
      if (action === 'del') localStorage.removeItem(CACHE_KEY);
    } catch (e) {}
    return null;
  }

  function normalize(src) {
    src = src && typeof src === 'object' ? src : {};
    const text = (k, d) => typeof src[k] === 'string' ? src[k] : (typeof BASE[k] === 'string' ? BASE[k] : d);
    const list = k => clone(Array.isArray(src[k]) ? src[k] : (Array.isArray(BASE[k]) ? BASE[k] : []))
      .filter(v => v && typeof v === 'object');
    const site = {
      title: text('title', 'My Home'),
      name: text('name', ''),
      desc: text('desc', ''),
      avatar: text('avatar', ''),
      header: text('header', ''),
      footerName: text('footerName', ''),
      highlight: text('highlight', '#b1c98d'),
      musicId: text('musicId', ''),
      musicIcon: text('musicIcon', '♪'),
      bannerLink: text('bannerLink', ''),
      pages: list('pages'),
      socials: list('socials'),
      myBanners: list('myBanners'),
      extBanners: list('extBanners')
    };
    site.pages = site.pages.filter(p => typeof p.id === 'string' && p.id);
    if (!site.pages.some(p => p.id === HOME)) {
      site.pages.unshift({ id: HOME, label: 'Home', menu: false, html: '' });
    }
    return site;
  }

  function videoId(v) {
    v = String(v || '').trim();
    const m = v.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/);
    if (m) return m[1];
    return /^[\w-]{11}$/.test(v) ? v : '';
  }

  function fill(box, items, build) {
    box.textContent = '';
    items.forEach(item => {
      const node = build(item);
      if (node) box.appendChild(node);
    });
  }

  function bannerImg(src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.loading = 'lazy';
    return img;
  }

  function copyBanner() {
    const link = state.bannerLink || location.origin + location.pathname;
    const done = () => alert('링크가 복사되었습니다!\n' + link);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(done).catch(() => prompt('아래 주소를 복사하세요', link));
    } else {
      prompt('아래 주소를 복사하세요', link);
    }
  }

  function render() {
    document.title = state.title || 'Home';

    const header = $('main-header');
    header.hidden = !state.header;
    if (state.header && $('headerImg').getAttribute('src') !== state.header) $('headerImg').src = state.header;

    $('avatar').style.backgroundImage = state.avatar ? 'url("' + state.avatar.replace(/["\\\n]/g, '') + '")' : 'none';
    $('siteName').textContent = state.name;
    $('siteDesc').textContent = state.desc;

    fill($('menu'), state.pages.filter(p => p.menu), p => {
      const a = document.createElement('a');
      a.href = '#/' + p.id;
      a.className = 'menu-item' + (p.id === current ? ' active' : '');
      a.textContent = p.label || p.id;
      return a;
    });

    const socials = state.socials.filter(s => s.label || s.url);
    $('socialBox').hidden = !socials.length;
    fill($('socials'), socials, s => {
      const a = document.createElement('a');
      a.href = s.url || '#';
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'social-link';
      a.textContent = s.label || s.url;
      return a;
    });

    const mine = state.myBanners.filter(b => b.img);
    const ext = state.extBanners.filter(b => b.img);
    $('bannerBox').hidden = !mine.length && !ext.length;
    fill($('myBanners'), mine, b => {
      const a = document.createElement('a');
      a.href = '#';
      a.addEventListener('click', e => { e.preventDefault(); copyBanner(); });
      a.appendChild(bannerImg(b.img));
      return a;
    });
    fill($('extBanners'), ext, b => {
      const a = document.createElement('a');
      if (b.url) {
        a.href = b.url;
        a.target = '_blank';
        a.rel = 'noopener';
      }
      a.appendChild(bannerImg(b.img));
      return a;
    });

    if (/^#[0-9a-f]{6}$/i.test(state.highlight)) {
      document.documentElement.style.setProperty('--highlight-bg', state.highlight);
    }

    const btn = $('musicPlayBtn');
    btn.hidden = !videoId(state.musicId);
    if (!playing) btn.textContent = state.musicIcon || '♪';

    const year = new Date().getFullYear();
    $('footer').textContent = '© ' + year + ' ' + (state.footerName || state.title) + '. All rights reserved. ' + CREDIT;

    showPage(false);
  }

  function showPage(jump) {
    const main = $('main-content');
    const page = state.pages.find(p => p.id === current);
    const html = page ? String(page.html || '') : '<p>페이지를 찾을 수 없습니다.</p>';
    const key = current + '\n' + html;
    if (key !== shownKey) {
      const sameId = shownKey.split('\n')[0] === current;
      shownKey = key;
      const body = document.createElement('div');
      body.className = 'page-body' + (sameId ? '' : ' fade-in-up');
      body.innerHTML = html;
      main.textContent = '';
      main.appendChild(body);
    }
    document.querySelectorAll('.menu-item').forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === '#/' + current);
    });
    if (jump) window.scrollTo(0, 0);
  }

  function loadRemote() {
    const fb = BASE.firebase || {};
    if (!fb.projectId || !fb.apiKey) return;
    const url = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(fb.projectId) +
      '/databases/(default)/documents/site/config?key=' + encodeURIComponent(fb.apiKey);
    fetch(url)
      .then(res => {
        if (res.status === 404) return { missing: true };
        return res.ok ? res.json() : null;
      })
      .then(data => {
        if (!data || adminOn) return;
        if (data.missing) {
          if (store('get')) {
            store('del');
            state = normalize(null);
            render();
          }
          return;
        }
        const json = data.fields && data.fields.json && data.fields.json.stringValue;
        if (!json || json === store('get')) return;
        const next = normalize(JSON.parse(json));
        store('set', json);
        state = next;
        render();
      })
      .catch(() => {});
  }

  const api = {
    base: BASE,
    get: () => clone(state),
    apply: site => { state = normalize(site); render(); },
    cache: json => store('set', json),
    close: () => {
      adminOn = false;
      if (!state.pages.some(p => p.id === current)) current = HOME;
      location.hash = '#/' + current;
    },
    go: id => { location.hash = '#/' + id; }
  };

  function openAdmin() {
    if (adminOn || adminLoading) return;
    if (adminStart) {
      adminOn = true;
      adminStart(api);
      return;
    }
    adminLoading = true;
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'admin.css';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = 'admin.js';
    js.onerror = () => { adminLoading = false; };
    document.body.appendChild(js);
  }

  document.addEventListener('site-admin-ready', e => {
    adminLoading = false;
    adminStart = e.detail.start;
    adminOn = true;
    adminStart(api);
  });

  function route() {
    const hash = location.hash;
    if (hash === '#admin') {
      openAdmin();
      showPage(false);
      return;
    }
    current = decodeURIComponent(hash.replace(/^#\/?/, '')) || HOME;
    showPage(true);
  }

  function setupTheme() {
    const toggle = $('modeToggle');
    let saved = null;
    try { saved = localStorage.getItem('theme'); } catch (e) {}
    if (saved === 'dark') {
      document.body.setAttribute('data-theme', 'dark');
      toggle.checked = true;
    }
    toggle.addEventListener('change', () => {
      const theme = toggle.checked ? 'dark' : 'light';
      document.body.setAttribute('data-theme', theme);
      try { localStorage.setItem('theme', theme); } catch (e) {}
    });
  }

  function setupMusic() {
    const btn = $('musicPlayBtn');
    const player = $('music-player');
    btn.addEventListener('click', () => {
      const id = videoId(state.musicId);
      if (!playing && id) {
        player.src = 'https://www.youtube.com/embed/' + id + '?autoplay=1&mute=0&loop=1&playlist=' + id + '&controls=0';
        playing = true;
        btn.textContent = 'II';
      } else {
        player.src = '';
        playing = false;
        btn.textContent = state.musicIcon || '♪';
      }
    });
  }

  function setupChrome() {
    const side = $('leftSidebar');
    $('sidebarToggle').addEventListener('click', () => side.classList.toggle('active'));
    side.addEventListener('click', e => {
      if (e.target.closest('a')) side.classList.remove('active');
    });
    const top = $('scrollToTopBtn');
    window.addEventListener('scroll', () => top.classList.toggle('show', window.scrollY > SCROLL_SHOW));
    top.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  let cached = null;
  try { cached = JSON.parse(store('get')); } catch (e) {}
  state = normalize(cached);

  setupTheme();
  setupMusic();
  setupChrome();
  if (location.hash !== '#admin') {
    current = decodeURIComponent(location.hash.replace(/^#\/?/, '')) || HOME;
  }
  render();
  window.addEventListener('hashchange', route);
  if (location.hash === '#admin') openAdmin();
  loadRemote();
})();
