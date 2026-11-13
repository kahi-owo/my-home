(function () {
  'use strict';

  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-';
  const MAX_IMAGE = 10 * 1024 * 1024;
  const MAX_JSON = 900000;
  const IMAGE_CACHE = 'public, max-age=31536000, immutable';
  const RESERVED = ['admin'];
  const HOME = 'home';
  const OFFLINE_NOTE = 'Firebase가 연결되지 않아 이미지를 올릴 수 없습니다.\n\n대신 GitHub 저장소의 images 폴더에 그림 파일을 올린 뒤, 칸에 images/파일이름 을 적으면 됩니다.';

  let api;
  let draft;
  let saved;
  let fb = null;
  let user = null;
  let dirty = false;
  let root;
  let bodyEl;
  let statusEl;
  let saveBtn;
  let connected = false;
  const openSections = new Set(['basic']);

  const clone = o => JSON.parse(JSON.stringify(o));

  function h(tag, props, kids) {
    const el = document.createElement(tag);
    Object.keys(props || {}).forEach(k => {
      const v = props[k];
      if (v === false || v == null) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(kid => {
      if (kid == null) return;
      el.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    });
    return el;
  }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function setStatus(text, kind) {
    statusEl.textContent = text || '';
    statusEl.className = 'adm-status' + (kind ? ' ' + kind : '');
  }

  function changed() {
    dirty = true;
    api.apply(draft);
    setStatus('저장하지 않은 변경이 있습니다', 'warn');
  }

  function message(title, lines, actions) {
    bodyEl.textContent = '';
    saveBtn.hidden = true;
    bodyEl.appendChild(h('div', { class: 'adm-msg' }, [
      h('h3', { text: title }),
      ...(lines || []).map(t => h('p', { text: t })),
      h('div', { class: 'adm-row' }, actions || [])
    ]));
  }

  function button(text, onclick, cls) {
    return h('button', { type: 'button', class: 'adm-btn' + (cls ? ' ' + cls : ''), text: text, onclick: onclick });
  }

  async function connect() {
    const cfg = api.base.firebase || {};
    if (!cfg.apiKey || !cfg.projectId) {
      startOffline();
      return;
    }
    message('연결 중…', ['잠시만 기다려 주세요.']);
    try {
      const mods = await Promise.all(['app', 'auth', 'firestore', 'storage'].map(n => import(SDK + n + '.js')));
      const app = mods[0].initializeApp(cfg);
      fb = {
        authM: mods[1],
        dbM: mods[2],
        stM: mods[3],
        auth: mods[1].getAuth(app),
        db: mods[2].getFirestore(app),
        storage: mods[3].getStorage(app)
      };
      connected = true;
      fb.authM.onAuthStateChanged(fb.auth, onUser);
    } catch (e) {
      fb = null;
      message('연결하지 못했습니다', ['인터넷 연결을 확인한 뒤 다시 시도해 주세요.'], [
        button('다시 시도', connect, 'primary'),
        button('저장 없이 둘러보기', startOffline)
      ]);
    }
  }

  function startOffline() {
    fb = null;
    user = null;
    draft = api.get();
    saved = clone(draft);
    renderEditor();
  }

  function onUser(u) {
    user = u;
    if (!u) {
      message('관리자 로그인', ['사이트 주인의 구글 계정으로 로그인하면 편집할 수 있습니다.'], [
        button('Google 계정으로 로그인', login, 'primary')
      ]);
      return;
    }
    const want = String((api.base.admin || {}).email || '').toLowerCase();
    if (!want || String(u.email || '').toLowerCase() !== want) {
      message('편집 권한이 없는 계정입니다', [(u.email || '') + ' 계정으로는 편집할 수 없습니다.'], [
        button('다른 계정으로 로그인', logout, 'primary')
      ]);
      return;
    }
    loadDraft();
  }

  async function login() {
    try {
      await fb.authM.signInWithPopup(fb.auth, new fb.authM.GoogleAuthProvider());
    } catch (e) {
      const code = e && e.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      if (code === 'auth/unauthorized-domain') {
        alert('이 주소가 Firebase에 등록되지 않았습니다.\nFirebase 콘솔 → Authentication → 설정 → 승인된 도메인에 ' + location.hostname + ' 을 추가해 주세요.');
      } else if (code === 'auth/operation-not-allowed') {
        alert('Firebase 콘솔 → Authentication → 로그인 방법에서 Google을 사용 설정해 주세요.');
      } else if (code === 'auth/popup-blocked') {
        alert('브라우저가 로그인 창을 막았습니다. 팝업 차단을 풀고 다시 눌러 주세요.');
      } else {
        alert('로그인하지 못했습니다.\n' + (code || e));
      }
    }
  }

  function logout() {
    if (dirty && !confirm('저장하지 않은 변경이 사라집니다. 로그아웃할까요?')) return;
    revert();
    fb.authM.signOut(fb.auth);
  }

  async function loadDraft() {
    message('불러오는 중…', []);
    try {
      const snap = await fb.dbM.getDoc(fb.dbM.doc(fb.db, 'site', 'config'));
      const json = snap.exists() ? snap.data().json : '';
      if (json) {
        api.apply(JSON.parse(json));
        api.cache(json);
      }
    } catch (e) {}
    draft = api.get();
    saved = clone(draft);
    dirty = false;
    renderEditor();
  }

  async function save() {
    if (!fb || !user) {
      alert('Firebase가 연결되지 않아 서버에 저장할 수 없습니다.\n아래 "백업"에서 data.js 파일로 내려받아 보관할 수 있습니다.');
      return;
    }
    const json = JSON.stringify(draft);
    if (json.length > MAX_JSON) {
      alert('내용이 너무 깁니다. 글을 줄이거나 페이지를 나눠 주세요.');
      return;
    }
    saveBtn.disabled = true;
    setStatus('저장 중…');
    try {
      await fb.dbM.setDoc(fb.dbM.doc(fb.db, 'site', 'config'), { json: json, updatedAt: fb.dbM.serverTimestamp() });
      api.cache(json);
      saved = clone(draft);
      dirty = false;
      const t = new Date();
      setStatus('저장됨 ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'), 'ok');
    } catch (e) {
      const denied = e && e.code === 'permission-denied';
      setStatus('저장 실패', 'err');
      alert(denied
        ? '저장 권한이 없습니다. Firebase 콘솔의 Firestore 규칙이 게시됐는지 확인해 주세요.'
        : '저장하지 못했습니다.\n' + ((e && e.code) || e));
    }
    saveBtn.disabled = false;
  }

  function revert() {
    if (!saved) return;
    draft = clone(saved);
    dirty = false;
    api.apply(draft);
  }

  function pickFile() {
    return new Promise(resolve => {
      const input = h('input', { type: 'file', accept: 'image/*' });
      input.addEventListener('change', () => resolve(input.files[0] || null));
      input.click();
    });
  }

  async function upload(file) {
    if (!/^image\//.test(file.type)) {
      alert('그림 파일만 올릴 수 있습니다.');
      return '';
    }
    if (file.size > MAX_IMAGE) {
      alert('10MB 이하의 그림만 올릴 수 있습니다.');
      return '';
    }
    const m = file.name.match(/\.([a-z0-9]{1,5})$/i);
    const ext = m ? m[1].toLowerCase() : 'png';
    const path = 'uploads/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const ref = fb.stM.ref(fb.storage, path);
    await fb.stM.uploadBytes(ref, file, { contentType: file.type, cacheControl: IMAGE_CACHE });
    return fb.stM.getDownloadURL(ref);
  }

  async function uploadFlow(btn) {
    if (!fb || !user) {
      alert(OFFLINE_NOTE);
      return '';
    }
    const file = await pickFile();
    if (!file) return '';
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '올리는 중…';
    let url = '';
    try {
      url = await upload(file);
    } catch (e) {
      const code = e && e.code;
      alert(code === 'storage/unauthorized'
        ? '올릴 권한이 없습니다. Firebase 콘솔의 Storage 규칙이 게시됐는지 확인해 주세요.'
        : '그림을 올리지 못했습니다.\n' + (code || e));
    }
    btn.disabled = false;
    btn.textContent = label;
    return url;
  }

  function field(label, obj, key, opts) {
    opts = opts || {};
    const input = h(opts.area ? 'textarea' : 'input', {
      class: 'adm-input',
      type: opts.area ? null : 'text',
      placeholder: opts.placeholder,
      value: obj[key] || '',
      oninput: () => { obj[key] = input.value; changed(); }
    });
    return h('label', { class: 'adm-field' }, [h('span', { text: label }), input, opts.hint ? h('small', { text: opts.hint }) : null]);
  }

  function imageField(label, obj, key) {
    const thumb = h('img', { class: 'adm-thumb', alt: '' });
    const show = () => {
      thumb.hidden = !obj[key];
      if (obj[key]) thumb.src = obj[key];
    };
    const input = h('input', {
      class: 'adm-input',
      type: 'text',
      placeholder: '그림 주소 또는 images/파일이름',
      value: obj[key] || '',
      oninput: () => { obj[key] = input.value.trim(); show(); changed(); }
    });
    const up = button('올리기', async () => {
      const url = await uploadFlow(up);
      if (!url) return;
      obj[key] = url;
      input.value = url;
      show();
      changed();
    });
    show();
    return h('div', { class: 'adm-field' }, [
      h('span', { text: label }),
      h('div', { class: 'adm-row' }, [thumb, input, up])
    ]);
  }

  function rowTools(list, i, canDelete) {
    const move = d => {
      const j = i + d;
      if (j < 0 || j >= list.length) return;
      const t = list[i];
      list[i] = list[j];
      list[j] = t;
      changed();
      renderEditor();
    };
    return h('div', { class: 'adm-tools' }, [
      h('button', { type: 'button', class: 'adm-mini', text: '↑', 'aria-label': '위로', disabled: i === 0, onclick: () => move(-1) }),
      h('button', { type: 'button', class: 'adm-mini', text: '↓', 'aria-label': '아래로', disabled: i === list.length - 1, onclick: () => move(1) }),
      canDelete === false ? null : h('button', {
        type: 'button', class: 'adm-mini danger', text: '삭제',
        onclick: () => {
          if (!confirm('삭제할까요?')) return;
          list.splice(i, 1);
          changed();
          renderEditor();
        }
      })
    ]);
  }

  function listBlock(list, build, addLabel, make) {
    return h('div', {}, [
      ...list.map((item, i) => h('div', { class: 'adm-card' }, [...build(item, i), rowTools(list, i, item.id !== HOME)])),
      button(addLabel, () => {
        list.push(make());
        changed();
        renderEditor();
      }, 'add')
    ]);
  }

  function section(key, title, kids) {
    const d = h('details', { class: 'adm-sec', open: openSections.has(key) }, [h('summary', { text: title }), h('div', { class: 'adm-sec-body' }, kids)]);
    d.addEventListener('toggle', () => { if (d.open) openSections.add(key); else openSections.delete(key); });
    return d;
  }

  function uniqueId(want, self) {
    let id = String(want || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
    const taken = v => RESERVED.includes(v) || draft.pages.some(p => p !== self && p.id === v);
    if (!taken(id)) return id;
    let n = 2;
    while (taken(id + '-' + n)) n++;
    return id + '-' + n;
  }

  function pageCard(page) {
    const isHome = page.id === HOME;
    const idInput = h('input', {
      class: 'adm-input', type: 'text', value: page.id, disabled: isHome,
      onchange: () => {
        page.id = uniqueId(idInput.value, page);
        idInput.value = page.id;
        changed();
      }
    });
    const menu = h('input', {
      type: 'checkbox', checked: page.menu,
      onchange: () => { page.menu = menu.checked; changed(); }
    });
    return [
      field('메뉴에 보이는 이름', page, 'label'),
      h('label', { class: 'adm-field' }, [
        h('span', { text: '주소 이름 (영문·숫자)' }),
        idInput,
        h('small', { text: isHome ? '첫 화면은 주소를 바꿀 수 없습니다.' : '사이트 주소 뒤에 #/' + page.id + ' 로 열립니다.' })
      ]),
      h('label', { class: 'adm-check' }, [menu, '왼쪽 메뉴에 표시']),
      h('div', { class: 'adm-row' }, [
        button('내용 편집', () => openPageEditor(page), 'primary'),
        button('이 페이지 보기', () => api.go(page.id))
      ])
    ];
  }

  function colorField() {
    const input = h('input', { type: 'color', class: 'adm-color', value: /^#[0-9a-f]{6}$/i.test(draft.highlight) ? draft.highlight : '#b1c98d' });
    input.addEventListener('input', () => { draft.highlight = input.value; changed(); });
    if (window.ColorPicker) window.ColorPicker.attach(input, { getLang: () => 'ko' });
    return h('div', { class: 'adm-field' }, [h('span', { text: '포인트 색 (강조 글씨 배경)' }), input]);
  }

  function exportData() {
    const full = Object.assign({}, draft, { admin: api.base.admin || {}, firebase: api.base.firebase || {} });
    const blob = new Blob(['window.SITE = ' + JSON.stringify(full, null, 2) + ';\n'], { type: 'text/javascript' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'data.js' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function renderEditor() {
    const top = bodyEl.scrollTop;
    bodyEl.textContent = '';
    saveBtn.hidden = false;

    if (!fb) {
      bodyEl.appendChild(h('div', { class: 'adm-note' }, [
        h('strong', { text: 'Firebase가 아직 연결되지 않았습니다.' }),
        h('p', { text: '지금 고친 내용은 이 화면에서만 보이고 서버에 저장되지 않습니다. 이미지는 images/파일이름 으로 적어 주세요.' })
      ]));
    } else {
      bodyEl.appendChild(h('div', { class: 'adm-who' }, [h('span', { text: user.email }), button('로그아웃', logout)]));
    }

    bodyEl.appendChild(section('basic', '기본 정보', [
      field('사이트 제목 (브라우저 탭)', draft, 'title'),
      field('닉네임', draft, 'name'),
      field('한줄 소개', draft, 'desc'),
      imageField('프로필 그림', draft, 'avatar'),
      imageField('상단 헤더 그림', draft, 'header'),
      field('맨 아래 표시 이름', draft, 'footerName')
    ]));

    bodyEl.appendChild(section('pages', '메뉴 · 페이지', [
      listBlock(draft.pages, pageCard, '+ 페이지 추가', () => ({ id: uniqueId('page'), label: '새 페이지', menu: true, html: '<p>내용을 적어 보세요.</p>' }))
    ]));

    bodyEl.appendChild(section('socials', '소셜 링크', [
      listBlock(draft.socials, item => [
        field('이름', item, 'label'),
        field('주소', item, 'url', { placeholder: 'https://' })
      ], '+ 링크 추가', () => ({ label: '', url: '' }))
    ]));

    bodyEl.appendChild(section('banners', '배너', [
      h('h4', { text: '내 배너' }),
      listBlock(draft.myBanners, item => [imageField('배너 그림', item, 'img')], '+ 내 배너 추가', () => ({ img: '' })),
      field('내 배너를 누르면 복사될 주소', draft, 'bannerLink', { placeholder: '비워 두면 이 사이트 주소', hint: '방문자가 내 배너를 누르면 이 주소가 복사됩니다.' }),
      h('h4', { text: '이웃 배너' }),
      listBlock(draft.extBanners, item => [
        imageField('배너 그림', item, 'img'),
        field('누르면 이동할 주소', item, 'url', { placeholder: 'https://' })
      ], '+ 이웃 배너 추가', () => ({ img: '', url: '' }))
    ]));

    bodyEl.appendChild(section('look', '음악 · 색', [
      field('유튜브 주소', draft, 'musicId', { placeholder: 'https://youtu.be/…', hint: '비워 두면 음악 버튼이 사라집니다.' }),
      field('음악 버튼 모양', draft, 'musicIcon', { placeholder: '♪' }),
      colorField()
    ]));

    bodyEl.appendChild(section('backup', '백업', [
      h('p', { class: 'adm-hint', text: '현재 내용을 data.js 파일로 내려받습니다. GitHub 저장소의 data.js와 바꿔 올리면 기본값으로 쓰입니다.' }),
      button('data.js 내려받기', exportData)
    ]));

    bodyEl.scrollTop = top;
  }

  function openPageEditor(page) {
    const area = h('div', { class: 'adm-rich page-body', contenteditable: 'true' });
    area.innerHTML = page.html || '';
    const src = h('textarea', { class: 'adm-src', spellcheck: 'false', hidden: true });
    let srcMode = false;
    let range = null;

    const keep = () => {
      const sel = window.getSelection();
      range = sel.rangeCount && area.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    };
    const restore = () => {
      area.focus();
      if (!range) return;
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    };
    const cmd = (name, value) => {
      if (srcMode) return;
      area.focus();
      document.execCommand(name, false, value);
    };
    const insert = html => cmd('insertHTML', html);
    const selected = () => String(window.getSelection());
    const insertBlock = html => {
      if (srcMode) return;
      area.focus();
      const sel = window.getSelection();
      let node = sel.rangeCount && area.contains(sel.anchorNode) ? sel.anchorNode : null;
      while (node && node !== area && node.parentNode !== area) node = node.parentNode;
      if (node === area) node = null;
      const tpl = document.createElement('template');
      tpl.innerHTML = html;
      const last = tpl.content.lastChild;
      area.insertBefore(tpl.content, node ? node.nextSibling : null);
      const r = document.createRange();
      r.selectNodeContents(last);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    };

    const tools = [
      ['굵게', () => cmd('bold')],
      ['기울임', () => cmd('italic')],
      ['밑줄', () => cmd('underline')],
      ['취소선', () => cmd('strikeThrough')],
      ['큰 제목', () => cmd('formatBlock', 'H2')],
      ['작은 제목', () => cmd('formatBlock', 'H3')],
      ['본문', () => cmd('formatBlock', 'P')],
      ['인용', () => cmd('formatBlock', 'BLOCKQUOTE')],
      ['목록', () => cmd('insertUnorderedList')],
      ['구분선', () => cmd('insertHorizontalRule')],
      ['색 강조', () => insert('<span class="highlight-text">' + esc(selected() || '강조') + '</span>&nbsp;')],
      ['링크', () => {
        keep();
        const url = prompt('연결할 주소를 적어 주세요', 'https://');
        if (!url) return;
        restore();
        if (selected()) cmd('createLink', url);
        else insert('<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url) + '</a>');
      }],
      ['회색 상자', () => insertBlock('<div class="content-box"><p>내용</p></div><p><br></p>')],
      ['접는 목록', () => insertBlock('<details class="blocked-box" open><summary>제목</summary><ul><li>내용</li></ul></details><p><br></p>')],
      ['그림 올리기', async e => {
        keep();
        const url = await uploadFlow(e.currentTarget);
        if (!url) return;
        restore();
        insert('<img src="' + esc(url) + '" alt="">');
      }],
      ['그림 주소', () => {
        keep();
        const url = prompt('그림 주소 또는 images/파일이름', '');
        if (!url) return;
        restore();
        insert('<img src="' + esc(url.trim()) + '" alt="">');
      }],
      ['서식 지우기', () => cmd('removeFormat')]
    ];

    const bar = h('div', { class: 'adm-bar' }, tools.map(t => {
      const b = h('button', { type: 'button', class: 'adm-mini', text: t[0], onclick: t[1] });
      b.addEventListener('mousedown', e => e.preventDefault());
      return b;
    }));

    const toggleSrc = button('HTML로 보기', () => {
      srcMode = !srcMode;
      if (srcMode) src.value = area.innerHTML;
      else area.innerHTML = src.value;
      src.hidden = !srcMode;
      area.hidden = srcMode;
      bar.classList.toggle('off', srcMode);
      toggleSrc.textContent = srcMode ? '편집 화면으로' : 'HTML로 보기';
    });

    const close = () => modal.remove();
    const apply = () => {
      if (srcMode) area.innerHTML = src.value;
      area.querySelectorAll('details[open]').forEach(d => d.removeAttribute('open'));
      page.html = area.innerHTML;
      changed();
      api.go(page.id);
      close();
    };

    const modal = h('div', { class: 'adm-modal' }, [
      h('div', { class: 'adm-sheet' }, [
        h('div', { class: 'adm-sheet-head' }, [
          h('strong', { text: (page.label || page.id) + ' 내용 편집' }),
          toggleSrc
        ]),
        bar,
        h('div', { class: 'adm-sheet-body' }, [area, src]),
        h('div', { class: 'adm-sheet-foot' }, [
          button('취소', () => { if (confirm('편집한 내용을 버릴까요?')) close(); }),
          button('적용', apply, 'primary')
        ])
      ])
    ]);
    document.body.appendChild(modal);
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}
    area.focus();
  }

  function closeAdmin() {
    if (dirty && !confirm('저장하지 않은 변경이 사라집니다. 닫을까요?')) return;
    revert();
    if (draft) renderEditor();
    setStatus('');
    root.hidden = true;
    document.body.classList.remove('adm-open', 'adm-min');
    api.close();
  }

  function build() {
    statusEl = h('span', { class: 'adm-status' });
    saveBtn = button('저장', save, 'primary');
    bodyEl = h('div', { class: 'adm-body' });
    const fold = button('접기', () => {
      const min = root.classList.toggle('min');
      document.body.classList.toggle('adm-min', min);
      fold.textContent = min ? '편집기 열기' : '접기';
    });
    root = h('aside', { class: 'adm', 'aria-label': '사이트 편집기' }, [
      h('div', { class: 'adm-head' }, [h('strong', { text: '사이트 편집' }), h('div', { class: 'adm-row' }, [fold, button('닫기', closeAdmin)])]),
      bodyEl,
      h('div', { class: 'adm-foot' }, [statusEl, saveBtn])
    ]);
    document.body.appendChild(root);
    window.addEventListener('beforeunload', e => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  function start(a) {
    api = a;
    document.body.classList.add('adm-open');
    if (root) {
      root.hidden = false;
      root.classList.remove('min');
      if (!connected) connect();
      return;
    }
    build();
    const picker = document.createElement('script');
    picker.src = 'color-picker.js';
    picker.onload = picker.onerror = connect;
    document.body.appendChild(picker);
  }

  document.dispatchEvent(new CustomEvent('site-admin-ready', { detail: { start: start } }));
})();
