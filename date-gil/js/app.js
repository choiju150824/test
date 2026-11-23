/* 데이트길잡이 · UI */
(function () {
  const D = window.DATA, E = window.ENGINE, S = window.SOURCES;
  const KEY = 'dategil-v1';
  const AVATARS = ['🐰', '🐻', '🐱', '🐶', '🦊', '🐼', '🐥', '🐹', '🐨', '🐸'];
  const KIND_EMOJI = { food: '🍽️', cafe: '☕' };
  const MODE = { walk: '🚶 도보', transit: '🚇 대중교통', car: '🚗 차로' };
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];

  /* ---------- 상태 ---------- */
  const blank = () => ({ me: null, partner: null, couple: { startDate: '', anniversaries: [], transport: 'transit', budget: 100000, city: '서울' },
    courses: [], settings: { kakaoKey: '', notify: false }, notified: {}, draft: null });
  let state;
  try { state = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { state = blank(); }
  const ui = { form: null, step: 0, regionTab: 'input', recs: null, calMonth: null, calDay: null, busy: false, votes: {}, sharedData: null };
  const APP = { s: state, u: ui };
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('저장 공간이 부족해요. 오래된 사진을 정리해주세요 🥲'); }
  }

  /* ---------- 유틸 ---------- */
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const won = (n) => (n >= 10000 ? (n / 10000).toFixed(n % 10000 ? 1 : 0).replace('.0', '') + '만원' : n ? n.toLocaleString() + '원' : '무료');
  const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const uid = () => Math.random().toString(36).slice(2, 10);
  const getPath = (p) => p.split('.').reduce((o, k) => (o == null ? o : o[k]), APP);
  const setPath = (p, v) => { const ks = p.split('.'); const last = ks.pop(); const o = ks.reduce((o, k) => (o[k] = o[k] == null ? {} : o[k]), APP); o[last] = v; };
  const baseUrl = () => location.href.split('#')[0];
  const fmtDate = (d) => { const x = new Date(d + 'T12:00:00'); return `${x.getMonth() + 1}월 ${x.getDate()}일 (${DOW[x.getDay()]})`; };
  const couple = () => ({ me: state.me, partner: state.partner, transport: state.couple.transport, startDate: state.couple.startDate, anniversaries: state.couple.anniversaries });
  const actEmoji = (it) => it.kind === 'activity' ? D.ACTIVITIES[it.actType].emoji : KIND_EMOJI[it.kind];
  const stars = (path, val, size) => `<div class="stars ${size || ''}">${[1, 2, 3, 4, 5].map((n) => `<button data-action="star" data-path="${path}" data-val="${n}" class="${n <= (val || 0) ? 'on' : ''}">★</button>`).join('')}</div>`;

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), 2600);
  }
  function modal(html) { $('#modalBox').innerHTML = html; $('#modal').classList.remove('hidden'); }
  function closeModal() { $('#modal').classList.add('hidden'); }

  // 칩: data-path에 값 저장 (multi면 배열 토글)
  function chip(path, val, text, o) {
    o = o || {}; const cur = getPath(path);
    const on = o.multi ? (cur || []).includes(val) : cur === val;
    return `<button class="chip ${on ? 'on' : ''} ${o.cls || ''}" data-action="pick" data-path="${path}" data-val="${esc(val)}" ${typeof val === 'number' ? 'data-num="1"' : ''} ${o.multi ? 'data-multi="1"' : ''} ${o.toggle ? 'data-toggle="1"' : ''}>${o.emoji ? `<span>${o.emoji}</span>` : ''}${esc(text)}</button>`;
  }
  const chips = (path, list, o) => `<div class="chips">${list.map((x) => chip(path, x.id, x.label, Object.assign({ emoji: x.emoji }, o))).join('')}</div>`;

  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); toast(msg || '복사했어요 📋'); }
    catch (e) { modal(`<h3>아래 내용을 복사해주세요</h3><textarea class="codebox" readonly>${esc(text)}</textarea><button class="btn" data-action="close">닫기</button>`); }
  }
  async function shareLink(title, text, url) {
    if (navigator.share) { try { await navigator.share({ title, text, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    copy(`${text}\n${url}`, '링크를 복사했어요. 카톡에 붙여넣어 보내주세요 💌');
  }
  let kakaoShareReady = null;
  function loadKakaoShare(key) {
    if (kakaoShareReady) return kakaoShareReady;
    kakaoShareReady = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';
      s.onload = () => { try { if (!window.Kakao.isInitialized()) window.Kakao.init(key); res(window.Kakao); } catch (e) { rej(e); } };
      s.onerror = () => { kakaoShareReady = null; rej(new Error('kakao sdk')); };
      document.head.appendChild(s);
    });
    return kakaoShareReady;
  }
  async function kakaoShare(title, text, url) {
    const key = state.settings.kakaoKey;
    if (key && location.protocol.startsWith('http')) {
      try {
        const K = await loadKakaoShare(key);
        K.Share.sendDefault({ objectType: 'text', text: `${title}\n\n${text}`.slice(0, 200), link: { mobileWebUrl: url, webUrl: url }, buttonTitle: '코스 보기' });
        return;
      } catch (e) { /* 도메인 미등록 등 → 일반 공유로 */ }
    }
    shareLink(title, text, url);
  }

  /* ---------- 라우팅 ---------- */
  const routes = { home, welcome, profile, connect, invite, coupleSettings, create, generating, course, courses, calendar, review, settings, shared, votes, surprise };
  function route() {
    const [name, ...rest] = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
    const arg = rest.join('/');
    const publicRoutes = ['shared', 'surprise', 'invite', 'votes'];
    if (!state.me && !publicRoutes.includes(name) && name !== 'welcome' && name !== 'profile') { location.hash = '#/welcome'; return; }
    const fn = routes[name] || home;
    const r = fn(arg);
    const html = r && r.then ? null : r;
    document.body.dataset.route = name;
    document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.go === '#/' + (name === 'course' || name === 'create' || name === 'generating' ? 'courses' : name)));
    $('.tabbar').classList.toggle('hidden', !state.me || ['welcome', 'generating', 'shared', 'surprise'].includes(name) || (name === 'profile' && !state.me));
    if (html != null) { $('#view').innerHTML = html; afterRender(name, arg); }
    else r.then((h) => { $('#view').innerHTML = h; afterRender(name, arg); });
  }
  const go = (h) => { if (location.hash === h) route(); else location.hash = h; window.scrollTo(0, 0); };
  window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
  const rerender = () => { const y = window.scrollY; route(); window.scrollTo(0, y); };

  /* ---------- 가입 / 프로필 ---------- */
  function welcome() {
    if (!ui.form || !ui.form.isNew) ui.form = { isNew: true, name: '', emoji: '🐰', profile: { mbti: '', traits: [], allergies: [], dislikes: [], likes: [], spicy: 2, drink: true } };
    return `<section class="hero">
      <div class="hero-emoji">💑</div>
      <h1>데이트길잡이</h1>
      <p>뻔한 코스 말고,<br/><b>우리 둘</b> 취향을 합친 데이트 코스</p>
    </section>
    <div class="card">
      <h3>내 이름(닉네임)</h3>
      <input class="input" data-bind="u.form.name" value="${esc(ui.form.name)}" placeholder="예: 지민" maxlength="10" />
      <h3 class="mt">내 캐릭터</h3>
      <div class="chips">${AVATARS.map((a) => chip('u.form.emoji', a, '', { emoji: a, cls: 'avatar' })).join('')}</div>
    </div>
    <button class="btn big" data-action="welcome-next">시작하기 →</button>
    <p class="center sub">이미 연인에게 초대 링크를 받았다면, 가입 후 연결 화면에서 코드를 입력하세요.</p>`;
  }

  function profileForm(f) {
    return `
      <div class="card"><h3>🧠 MBTI <span class="sub">(선택)</span></h3>
        <div class="chips small">${D.MBTI.map((m) => chip('u.form.profile.mbti', m, m, { toggle: true })).join('')}</div></div>
      <div class="card"><h3>💫 데이트 성향 <span class="sub">여러 개 선택</span></h3>${chips('u.form.profile.traits', D.TRAITS, { multi: true })}</div>
      <div class="card warn-card"><h3>⚠️ 알러지 재료</h3><p class="sub">주메뉴로 쓰는 곳은 코스에서 아예 빼요</p>${chips('u.form.profile.allergies', D.ALLERGENS, { multi: true })}</div>
      <div class="card"><h3>😖 싫어하는 음식·재료</h3><p class="sub">많이 들어가는 곳은 순위를 낮춰요</p>${chips('u.form.profile.dislikes', D.FOODS.concat(D.ALLERGENS.filter((a) => ['pork', 'beef', 'chicken', 'tomato', 'squid'].includes(a.id))), { multi: true })}</div>
      <div class="card"><h3>😍 좋아하는 음식·재료</h3>${chips('u.form.profile.likes', D.FOODS, { multi: true })}</div>
      <div class="card"><h3>🌶️ 맵기</h3><div class="chips">${D.SPICY.map((s, i) => chip('u.form.profile.spicy', i, s, { emoji: ['🥛', '🌱', '🌶️', '🔥', '🌋'][i] })).join('')}</div></div>
      <div class="card"><h3>🍷 음주</h3><div class="chips">${chip('u.form.profile.drink', 'yes', '마셔요', { emoji: '🍻' })}${chip('u.form.profile.drink', 'no', '안 마셔요', { emoji: '🧃' })}</div></div>`;
  }
  function profile() {
    if (!ui.form || ui.form.isNew === undefined || (!ui.form.isNew && !ui.form.editing)) {
      const me = state.me; if (!me) { go('#/welcome'); return ''; }
      ui.form = { editing: true, isNew: false, name: me.name, emoji: me.emoji, profile: JSON.parse(JSON.stringify(me.profile)) };
    }
    const f = ui.form;
    if (typeof f.profile.drink === 'boolean') f.profile.drink = f.profile.drink ? 'yes' : 'no';
    return `<header class="page-head"><h2>${f.isNew ? '내 취향 알려주기' : '내 프로필'}</h2><p class="sub">탭해서 고르기만 하면 돼요</p></header>
      ${!f.isNew ? `<div class="card"><h3>이름</h3><input class="input" data-bind="u.form.name" value="${esc(f.name)}" maxlength="10"/>
        <div class="chips mt">${AVATARS.map((a) => chip('u.form.emoji', a, '', { emoji: a, cls: 'avatar' })).join('')}</div></div>` : ''}
      ${profileForm(f)}
      <button class="btn big sticky" data-action="profile-save">${f.isNew ? '다음: 연인과 연결 →' : '저장하기'}</button>`;
  }

  /* ---------- 연인 연결 (초대 코드) ---------- */
  async function myInvite() {
    return E.encode({ t: 'inv', me: state.me, couple: state.couple, at: Date.now() });
  }
  async function connect() {
    const code = await myInvite();
    const link = `${baseUrl()}#/invite/${code}`;
    ui.myInvite = { code, link };
    const p = state.partner;
    return `<header class="page-head"><h2>💞 연인과 연결</h2><p class="sub">서로의 코드를 주고받으면 두 사람 취향을 합쳐서 추천해요</p></header>
      ${p ? `<div class="card couple-card"><div class="pair"><span>${state.me.emoji}</span><span class="heart">💗</span><span>${esc(p.emoji)}</span></div>
        <p><b>${esc(p.name)}</b>님과 연결되어 있어요</p><p class="sub">상대가 프로필을 바꿨다면 새 코드를 다시 받아 입력하면 업데이트돼요</p></div>` : ''}
      <div class="card">
        <h3>1. 내 초대 코드 보내기</h3>
        <p class="sub">링크를 카톡으로 보내면 연인이 바로 연결할 수 있어요</p>
        <div class="row"><button class="btn" data-action="invite-share">💌 초대 링크 보내기</button><button class="btn ghost" data-action="invite-copy">코드 복사</button></div>
      </div>
      <div class="card">
        <h3>2. 연인 코드 입력</h3>
        <textarea class="codebox" id="partnerCode" placeholder="연인에게 받은 코드나 링크를 붙여넣어 주세요"></textarea>
        <button class="btn" data-action="partner-connect">연결하기</button>
      </div>
      ${!p ? `<button class="btn ghost big" data-action="go" data-to="#/home">나중에 할게요</button>` : `<button class="btn ghost" data-action="partner-unlink">연결 해제</button>`}`;
  }
  async function acceptInvite(code) {
    let d; try { d = await E.decode(code); } catch (e) { toast('코드를 읽지 못했어요. 전체를 복사했는지 확인해주세요'); return false; }
    if (!d || d.t !== 'inv' || !d.me) { toast('초대 코드가 아니에요'); return false; }
    if (state.me && d.me.id === state.me.id) { toast('내 코드예요! 연인의 코드를 입력해주세요 😅'); return false; }
    const wasNew = !state.partner || state.partner.id !== d.me.id;
    state.partner = d.me;
    const c = d.couple || {};
    if (!state.couple.startDate && c.startDate) state.couple.startDate = c.startDate;
    if (c.anniversaries) for (const a of c.anniversaries) if (!state.couple.anniversaries.some((x) => x.name === a.name && x.date === a.date)) state.couple.anniversaries.push(a);
    save();
    return wasNew ? 'new' : 'update';
  }
  function invite(code) {
    ui.pendingInvite = code;
    if (!state.me) {
      return `<section class="hero"><div class="hero-emoji">💌</div><h1>연인이 초대했어요!</h1><p>먼저 내 프로필을 만들면 바로 연결돼요</p></section>
        <button class="btn big" data-action="go" data-to="#/welcome">프로필 만들기 →</button>`;
    }
    return `<section class="hero"><div class="hero-emoji">💌</div><h1>초대 코드를 받았어요</h1></section>
      <button class="btn big" data-action="invite-accept">연결하기 💗</button>`;
  }
  function replyModal(name) {
    modal(`<div class="center"><div class="hero-emoji">🎉</div><h3>${esc(name)}님과 연결됐어요!</h3>
      <p class="sub">상대 앱에도 내 취향이 들어가도록<br/>내 코드를 답장으로 보내주세요</p>
      <button class="btn" data-action="invite-share">💌 내 코드 답장 보내기</button>
      <button class="btn ghost" data-action="close-home">다음에</button></div>`);
  }

  function coupleSettings() {
    const c = state.couple;
    return `<header class="page-head"><h2>💑 커플 정보</h2></header>
      <div class="card"><h3>💗 사귄 날</h3><input class="input" type="date" data-bind="s.couple.startDate" data-save="1" value="${esc(c.startDate)}"/>
        <p class="sub">100일·주년 기념일을 자동으로 챙겨드려요</p></div>
      <div class="card"><h3>🎂 기념일</h3>
        ${(c.anniversaries || []).map((a, i) => `<div class="row between list-row"><span>🎉 ${esc(a.name)} <span class="sub">${esc(a.date.slice(5).replace('-', '/'))} 매년</span></span><button class="icon-btn" data-action="anniv-del" data-i="${i}">✕</button></div>`).join('') || '<p class="sub">아직 없어요</p>'}
        <div class="row mt"><input class="input" id="annName" placeholder="예: 지민 생일" maxlength="14"/><input class="input" id="annDate" type="date"/></div>
        <button class="btn ghost" data-action="anniv-add">+ 기념일 추가</button></div>
      <div class="card"><h3>🚦 주로 이동하는 방법</h3>${chips('s.couple.transport', Object.entries(D.TRANSPORT).map(([id, t]) => ({ id, label: t.label, emoji: t.emoji })))}</div>
      <div class="card"><h3>💸 평소 데이트 예산 (2인)</h3>${chips('s.couple.budget', D.BUDGETS)}</div>
      <div class="card"><h3>📍 주 활동 지역</h3><div class="chips">${['서울', '부산'].map((x) => chip('s.couple.city', x, x)).join('')}</div></div>`;
  }

  /* ---------- 홈 ---------- */
  function home() {
    const me = state.me, p = state.partner, c = state.couple;
    const an = E.upcomingAnniversaries(couple(), today(), 14);
    const saved = state.courses.filter((x) => x.saved).sort((a, b) => b.req.date.localeCompare(a.req.date));
    const toReview = saved.filter((x) => !x.review && x.req.date <= today());
    const upcoming = saved.filter((x) => x.req.date >= today()).sort((a, b) => a.req.date.localeCompare(b.req.date));
    return `<section class="home-head">
        <div class="pair big">${me.emoji}<span class="heart beat">💗</span>${p ? esc(p.emoji) : '<span class="ghost-av">?</span>'}</div>
        <div class="names">${esc(me.name)} ${p ? '& ' + esc(p.name) : ''}</div>
        ${c.startDate ? `<div class="dday">우리 만난 지 <b>${E.dday(c.startDate, today())}</b>일째</div>` : `<button class="link" data-action="go" data-to="#/coupleSettings">💗 사귄 날 입력하기</button>`}
      </section>
      ${an.map((a) => `<div class="banner"><div><b>🎉 ${esc(a.name)}</b> ${a.daysLeft ? `D-${a.daysLeft}` : '오늘!'} <span class="sub">${fmtDate(a.date)}</span></div>
        <button class="btn small" data-action="anniv-course" data-date="${a.date}">기념일 코스 짜기</button></div>`).join('')}
      ${!p ? `<div class="card invite-card" data-action="go" data-to="#/connect"><b>💌 연인과 연결하기</b><p class="sub">두 사람 취향을 합쳐야 진짜 맞춤 코스가 나와요</p></div>` : ''}
      <button class="btn huge" data-action="new-course">✨ 새 데이트 코스 만들기</button>
      ${toReview.length ? `<h2>✍️ 후기를 남겨주세요</h2>${toReview.slice(0, 2).map(courseCard).join('')}` : ''}
      ${upcoming.length ? `<h2>📅 다가오는 데이트</h2>${upcoming.slice(0, 3).map(courseCard).join('')}` : ''}
      ${!saved.length ? `<div class="empty"><div>🗺️</div><p>아직 저장된 코스가 없어요<br/>첫 데이트 코스를 만들어볼까요?</p></div>` : ''}
      ${!state.settings.kakaoKey ? `<p class="sub center mt">지금은 <b>데모 모드</b>예요 (예시 장소). 설정에서 카카오 키를 넣으면 실제 장소로 추천해요.</p>` : ''}`;
  }
  function courseCard(c) {
    const plan = c.plans[c.active || 'A'];
    return `<div class="card course-card" data-action="go" data-to="#/course/${c.id}">
      <div class="row between"><b>${esc(c.title)}</b><span class="sub">${fmtDate(c.req.date)}</span></div>
      <div class="mini-route">${plan.items.map((it) => `<span>${actEmoji(it)} ${esc(it.place.name.replace(' (예시)', ''))}</span>`).join('<i>›</i>')}</div>
      <div class="row between sub"><span>${D.TIMES[c.req.time].label} · ${won(plan.total)}</span>${c.review ? `<span>⭐ ${avgRating(c.review)}</span>` : ''}</div></div>`;
  }
  const avgRating = (r) => { const v = [r.me && r.me.rating, r.partner && r.partner.rating].filter(Boolean); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '-'; };

  /* ---------- 코스 만들기 (4단계) ---------- */
  function nextWeekday(dow) { const d = new Date(today() + 'T12:00:00'); const add = (dow - d.getDay() + 7) % 7 || 7; return E.addDays(today(), add); }
  function newDraft(preset) {
    return Object.assign({ area: '', center: null, date: nextWeekday(6), time: 'afternoon', concept: 'healing', budget: state.couple.budget || 100000,
      foodOpts: [], cafeOpts: [], acts: [], filters: state.couple.transport === 'car' ? ['parking'] : [], excludeVisited: true, aiConcept: 'healing' }, preset || {});
  }
  function create() {
    const d = state.draft || (state.draft = newDraft());
    const steps = ['어디서', '언제', '어떤 데이트', '세부 옵션'];
    const st = ui.step;
    let body = '';
    if (st === 0) {
      const popular = D.REGIONS.filter((r) => r.city === (state.couple.city || '서울')).slice(0, 10);
      body = `<div class="seg">${['input', 'ai'].map((t) => `<button class="${ui.regionTab === t ? 'on' : ''}" data-action="region-tab" data-tab="${t}">${t === 'input' ? '📍 직접 입력' : '🤖 AI 지역 추천'}</button>`).join('')}</div>
        ${ui.regionTab === 'input' ? `<div class="card"><h3>지역명 또는 지하철역</h3>
          <input class="input" data-bind="s.draft.area" data-clear-center="1" value="${esc(d.area)}" placeholder="예: 성수, 강남역, 연남동"/>
          <p class="sub mt">자주 가는 곳</p><div class="chips">${popular.map((r) => chip('s.draft.area', r.name, r.name)).join('')}</div></div>`
        : `<div class="card"><h3>어떤 컨셉으로 갈까요?</h3>${chips('s.draft.aiConcept', Object.entries(D.CONCEPTS).map(([id, c]) => ({ id, label: c.label, emoji: c.emoji })))}
          <button class="btn mt" data-action="ai-regions">🤖 우리에게 맞는 지역 찾기</button></div>
          ${ui.recs ? ui.recs.map((r, i) => `<div class="card rec-card ${d.area === r.name ? 'picked' : ''}" data-action="pick-region" data-i="${i}">
            <div class="row between"><b>${['🥇', '🥈', '🥉'][i]} ${esc(r.name)}</b><span class="sub">${esc(r.station)}</span></div>
            <ul class="why">${r.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>`).join('') : ''}`}`;
    } else if (st === 1) {
      const opts = [['오늘', today()], ['내일', E.addDays(today(), 1)], ['이번 토', nextWeekday(6)], ['이번 일', nextWeekday(0)], ['다음 토', E.addDays(nextWeekday(6), 7)]];
      body = `<div class="card"><h3>📅 날짜</h3><div class="chips">${opts.map(([l, v]) => chip('s.draft.date', v, l)).join('')}</div>
          <input class="input mt" type="date" data-bind="s.draft.date" data-rerender="1" value="${d.date}"/><p class="sub">${fmtDate(d.date)}</p></div>
        <div class="card"><h3>⏰ 시간대</h3><div class="chips grid2">${Object.entries(D.TIMES).map(([id, t]) => chip('s.draft.time', id, `${t.label} ${t.sub}`, { emoji: t.emoji })).join('')}</div></div>`;
    } else if (st === 2) {
      body = `<div class="card"><h3>🎨 컨셉</h3><div class="chips grid2">${Object.entries(D.CONCEPTS).map(([id, c]) => chip('s.draft.concept', id, c.label, { emoji: c.emoji })).join('')}</div></div>
        <div class="card"><h3>💸 2인 예산</h3>${chips('s.draft.budget', D.BUDGETS)}</div>`;
    } else {
      body = `<div class="card"><h3>🍽️ 식당은 이런 곳</h3>${chips('s.draft.foodOpts', D.PLACE_OPTIONS, { multi: true })}</div>
        <div class="card"><h3>☕ 카페는 이런 곳</h3>${chips('s.draft.cafeOpts', D.PLACE_OPTIONS.map((o) => Object.assign({}, o, { label: o.label.replace('맛집', '카페') })), { multi: true })}</div>
        <div class="card"><h3>🎡 놀거리</h3><p class="sub">안 고르면 컨셉과 성향에 맞춰 골라드려요</p>${chips('s.draft.acts', Object.entries(D.ACTIVITIES).map(([id, a]) => ({ id, label: a.label, emoji: a.emoji })), { multi: true })}</div>
        <div class="card"><h3>✅ 꼭 필요한 조건</h3>${chips('s.draft.filters', D.FILTERS, { multi: true })}
          <p class="sub">웨이팅·예약 여부는 카테고리 기반 추정이에요</p>
          <label class="switch mt"><input type="checkbox" data-action="toggle" data-path="s.draft.excludeVisited" ${d.excludeVisited ? 'checked' : ''}/><span></span> 이미 가본 곳 제외</label></div>`;
    }
    return `<header class="page-head"><div class="steps">${steps.map((s, i) => `<span class="${i === st ? 'on' : i < st ? 'done' : ''}">${i < st ? '✓' : i + 1}</span>`).join('<i></i>')}</div>
        <h2>${['어디서 만날까요? 📍', '언제 만날까요? 📅', '어떤 데이트를 할까요? 💭', '조금만 더 알려주세요 🙏'][st]}</h2></header>
      ${body}
      <div class="row sticky-bar">
        ${st > 0 ? `<button class="btn ghost" data-action="step" data-d="-1">← 이전</button>` : `<button class="btn ghost" data-action="go" data-to="#/home">취소</button>`}
        ${st < 3 ? `<button class="btn grow" data-action="step" data-d="1">다음 →</button>` : `<button class="btn grow" data-action="make">✨ 코스 만들기</button>`}
      </div>`;
  }

  function generating() {
    return `<section class="loading"><div class="loader">${state.me.emoji}<span class="heart beat">💗</span>${state.partner ? esc(state.partner.emoji) : '🐾'}</div>
      <p id="loadMsg">두 사람 취향을 섞는 중...</p></section>`;
  }

  function getSource() { return state.settings.kakaoKey ? S.kakaoSource(state.settings.kakaoKey) : S.demoSource(); }

  async function makeCourse() {
    const d = state.draft; if (!d) return;
    go('#/generating');
    const msgs = ['두 사람 취향을 섞는 중...', '알러지 재료 걸러내는 중...', '동선 짜는 중...', '날씨 확인하는 중...'];
    let mi = 0; const iv = setInterval(() => { const m = $('#loadMsg'); if (m) m.textContent = msgs[++mi % msgs.length]; }, 900);
    try {
      let src = getSource(); let center = d.center; let fellBack = false;
      try { center = center || await src.geocode(d.area); }
      catch (e) {
        if (!src.demo) { toast(e.message + ' → 데모 모드로 보여드릴게요'); src = S.demoSource(); fellBack = true; center = await src.geocode(d.area); }
        else throw e;
      }
      const req = { date: d.date, time: d.time, concept: d.concept, budget: d.budget, foodOpts: d.foodOpts, cafeOpts: d.cafeOpts, acts: d.acts, filters: d.filters,
        excludeVisited: d.excludeVisited, center: { lat: center.lat, lng: center.lng }, areaName: d.area };
      const ctx = E.reviewContext(state.courses);
      const A = await S.generate(src, req, couple(), ctx);
      if (!A.items.length) throw new Error('조건에 맞는 장소를 찾지 못했어요. 지역이나 조건을 바꿔보세요');
      let weather = { unavailable: true };
      try {
        const w = await S.fetchWeather(center.lat, center.lng, d.date);
        if (!w.unavailable) {
          const risk = E.rainRisk(w.hourly, d.date, A.items[0].start, A.items[A.items.length - 1].end);
          weather = Object.assign({ tmin: w.tmin, tmax: w.tmax }, risk || {});
        }
      } catch (e) { weather = { error: true }; }
      let B = null;
      if (weather.rainy) B = await S.generate(src, Object.assign({}, req, { indoorOnly: true }), couple(), ctx);
      const c = { id: uid(), createdAt: Date.now(), title: `${d.area} ${D.CONCEPTS[d.concept].emoji} ${D.CONCEPTS[d.concept].label} 데이트`, area: d.area, req,
        weather, plans: { A, B }, active: weather.rainy && B && B.items.length ? 'B' : 'A', votes: {}, saved: false, demo: src.demo || fellBack };
      state.courses = state.courses.filter((x) => x.saved); // 저장 안 한 이전 결과는 정리
      state.courses.push(c); save();
      go('#/course/' + c.id);
    } catch (e) {
      console.error(e); toast(e.message || '코스를 만들지 못했어요'); ui.step = 3; go('#/create');
    } finally { clearInterval(iv); }
  }

  /* ---------- 결과 화면 ---------- */
  const findCourse = (id) => state.courses.find((c) => c.id === id);
  function course(id) {
    const c = findCourse(id); if (!c) return `<div class="empty"><div>🤔</div><p>코스를 찾을 수 없어요</p></div>`;
    const plan = c.plans[c.active] || c.plans.A;
    const w = c.weather || {};
    const hasAllergy = [state.me, state.partner].some((p) => p && p.profile.allergies && p.profile.allergies.length);
    const isPast = c.req.date <= today();
    const votedBy = c.votedBy ? `<span class="sub">${esc(c.votedBy)}님 투표 반영됨</span>` : '';
    return `<header class="page-head course-head">
        <button class="back" data-action="go" data-to="#/courses">‹</button>
        <h2>${esc(c.title)}</h2>
        <p class="sub">${fmtDate(c.req.date)} · ${D.TIMES[c.req.time].label} · ${MODE[state.couple.transport].split(' ')[0]} ${votedBy}</p>
      </header>
      ${c.demo ? `<div class="notice">🧪 데모 모드: 실제 장소가 아닌 <b>예시 장소</b>예요. 설정에서 카카오 JavaScript 키를 넣으면 실제 장소로 추천해요.</div>` : ''}
      ${weatherCard(c, w)}
      ${c.plans.B || w.rainy ? `<div class="seg">${['A', 'B'].map((k) => `<button class="${c.active === k ? 'on' : ''}" data-action="plan" data-id="${c.id}" data-k="${k}">${k === 'A' ? '🌤️ 기본 플랜' : '☔ 우천 플랜B (실내)'}</button>`).join('')}</div>`
        : `<button class="link right" data-action="plan" data-id="${c.id}" data-k="B">☔ 비 오면? 실내 플랜B 보기</button>`}
      <div id="map" class="map"></div>
      ${hasAllergy || plan.items.some((it) => it.kind !== 'activity') ? `<div class="notice warn">⚠️ 메뉴 성분은 방문 전 매장에 확인해주세요${plan.excludedAllergy && plan.excludedAllergy.length ? `<br/><span class="sub">알러지 때문에 ${plan.excludedAllergy.map((x) => esc(x.name.replace(' (예시)', ''))).join(', ')} 등은 제외했어요</span>` : ''}</div>` : ''}
      ${(plan.warnings || []).map((x) => `<div class="notice">${esc(x)}</div>`).join('')}
      <div class="timeline">${plan.items.map((it, i) => timelineItem(c, it, i)).join('')}</div>
      <div class="card total"><div class="row between"><span>💸 예상 비용 (2인)</span><b>${won(plan.total)}</b></div>
        ${c.req.budget ? `<div class="bar"><div style="width:${Math.min(100, plan.total / c.req.budget * 100)}%" class="${plan.total > c.req.budget ? 'over' : ''}"></div></div><p class="sub">예산 ${won(c.req.budget)} ${plan.total > c.req.budget ? '· 조금 초과해요' : '안에서 짰어요'}</p>` : ''}
        <p class="sub">놀거리·쇼핑 비용은 대략적인 추정이에요</p></div>
      <div class="actions">
        <button class="btn ${c.saved ? 'ghost' : ''}" data-action="save-course" data-id="${c.id}">${c.saved ? '💾 저장됨' : '💾 코스 저장'}</button>
        <button class="btn" data-action="share-vote" data-id="${c.id}">💌 연인에게 공유 · 투표</button>
        <button class="btn kakao" data-action="kakao-share" data-id="${c.id}">💬 카카오톡 공유</button>
        <button class="btn" data-action="surprise-make" data-id="${c.id}">🎁 서프라이즈 모드</button>
        <button class="btn ghost" data-action="import-votes">📥 투표 결과 받기</button>
        ${isPast ? `<button class="btn" data-action="go" data-to="#/review/${c.id}">✍️ 데이트 후기 쓰기</button>` : ''}
        ${c.saved ? `<button class="btn ghost danger" data-action="del-course" data-id="${c.id}">삭제</button>` : ''}
      </div>`;
  }
  function weatherCard(c, w) {
    if (w.unavailable) return `<div class="weather">📆 날씨 예보는 16일 이내 날짜만 확인할 수 있어요</div>`;
    if (w.error || w.prob == null) return `<div class="weather">🌥️ 날씨 정보를 불러오지 못했어요</div>`;
    const icon = w.rainy ? '☔' : w.prob >= 30 ? '🌥️' : '☀️';
    return `<div class="weather ${w.rainy ? 'rainy' : ''}">${icon} 강수확률 최대 ${w.prob}% · ${w.tmin}~${w.tmax}℃
      ${w.rainy ? '<br/><b>비 소식이 있어 실내 위주 플랜B를 먼저 보여드려요</b>' : ''}</div>`;
  }
  function timelineItem(c, it, i) {
    const p = it.place;
    const v = c.votes && c.votes[p.id];
    const h = p.hours;
    const hrs = h ? (h.open === 0 && h.close >= 1440 ? '상시 개방' : `보통 ${E.fmt(h.open)}~${E.fmt(h.close)}${h.closed.length ? ` · ${h.closed.map((x) => DOW[x]).join('')} 휴무` : ''}`) : '';
    const badges = [];
    if (p.parkingNearby) badges.push('🅿️ 근처 주차장');
    if (p.kind !== 'activity' && p.reservable === 'likely') badges.push('📅 예약 가능성↑');
    if (p.kind !== 'activity' && p.waitLikely) badges.push('⏳ 웨이팅 가능성');
    if (!p.indoor) badges.push('🌳 야외');
    const label = it.kind === 'activity' ? D.ACTIVITIES[it.actType].label : it.kind === 'food' ? '식당' : '카페';
    const mapUrl = p.demo ? '' : `https://map.kakao.com/link/map/${encodeURIComponent(p.name)},${p.lat},${p.lng}`;
    const toUrl = p.demo ? '' : `https://map.kakao.com/link/to/${encodeURIComponent(p.name)},${p.lat},${p.lng}`;
    return `<div class="tl-item ${v === -1 ? 'disliked' : ''}">
      <div class="tl-time">${E.fmt(it.start)}<span>${E.fmt(it.end)}</span></div>
      <div class="tl-dot">${i + 1}</div>
      <div class="tl-card">
        <div class="row between"><span class="kind">${actEmoji(it)} ${label}</span><span class="cost">${won(it.cost)}</span></div>
        <h3>${esc(p.name)}${p.demo ? ' <span class="badge">예시</span>' : ''}</h3>
        <p class="reason">💡 ${esc(it.reason)}</p>
        ${p.category ? `<p class="sub">${esc(p.category.split(' > ').slice(-2).join(' · '))}${hrs ? ` · ${hrs} <span class="q">(확인 필요)</span>` : ''}</p>` : ''}
        ${badges.length ? `<div class="badges">${badges.map((b) => `<span>${b}</span>`).join('')}</div>` : ''}
        ${v ? `<div class="vote-tag">${v === 1 ? '👍 연인이 좋대요' : '👎 연인이 별로래요 → 다시 추천해볼까요?'}</div>` : ''}
        <div class="tl-actions">
          <button class="pill" data-action="reroll" data-id="${c.id}" data-i="${i}">🔁 다시 추천</button>
          ${mapUrl ? `<a class="pill" href="${mapUrl}" target="_blank" rel="noopener">🗺️ 지도</a><a class="pill" href="${toUrl}" target="_blank" rel="noopener">🧭 길찾기</a>` : ''}
          ${p.url ? `<a class="pill" href="${esc(p.url)}" target="_blank" rel="noopener">📅 예약·정보</a>` : ''}
          ${!p.demo ? `<a class="pill" href="https://map.naver.com/p/search/${encodeURIComponent(p.name)}" target="_blank" rel="noopener">N 예약 찾기</a>` : ''}
          ${p.phone ? `<a class="pill" href="tel:${esc(p.phone)}">📞</a>` : ''}
        </div>
      </div></div>
      ${it.travelNext ? `<div class="tl-move">${MODE[it.travelNext.mode]} 약 ${it.travelNext.min}분 <span class="sub">(${(it.travelNext.dist / 1000).toFixed(1)}km)</span></div>` : ''}`;
  }

  /* ---------- 지도 ---------- */
  function svgMap(items) {
    const pts = items.map((it) => it.place);
    const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
    const minLa = Math.min(...lats), maxLa = Math.max(...lats), minLn = Math.min(...lngs), maxLn = Math.max(...lngs);
    const W = 340, H = 200, pad = 28;
    const sx = (ln) => pad + ((ln - minLn) / ((maxLn - minLn) || 1e-6)) * (W - 2 * pad);
    const sy = (la) => H - pad - ((la - minLa) / ((maxLa - minLa) || 1e-6)) * (H - 2 * pad);
    const xy = pts.map((p) => [sx(p.lng), sy(p.lat)]);
    return `<svg viewBox="0 0 ${W} ${H}" class="svgmap"><rect width="${W}" height="${H}" rx="18" fill="#FFF3E8"/>
      ${[1, 2, 3].map((i) => `<line x1="0" y1="${i * H / 4}" x2="${W}" y2="${i * H / 4}" stroke="#F6E2D3" />`).join('')}
      <polyline points="${xy.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#FF8FA3" stroke-width="3" stroke-dasharray="6 5" stroke-linecap="round"/>
      ${xy.map(([x, y], i) => `<g><circle cx="${x}" cy="${y}" r="12" fill="#FF6F87" stroke="#fff" stroke-width="3"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#fff">${i + 1}</text></g>`).join('')}
      <text x="${W - 10}" y="${H - 10}" text-anchor="end" font-size="10" fill="#B89B8C">대략적인 동선 미리보기</text></svg>`;
  }
  async function drawMap(c) {
    const el = $('#map'); if (!el) return;
    const plan = c.plans[c.active] || c.plans.A;
    if (!plan.items.length) { el.classList.add('hidden'); return; }
    if (!state.settings.kakaoKey || c.demo) { el.innerHTML = svgMap(plan.items); return; }
    try {
      const k = await S.loadKakaoSdk(state.settings.kakaoKey);
      el.innerHTML = '';
      const map = new k.maps.Map(el, { center: new k.maps.LatLng(plan.items[0].place.lat, plan.items[0].place.lng), level: 5 });
      const bounds = new k.maps.LatLngBounds(); const path = [];
      plan.items.forEach((it, i) => {
        const pos = new k.maps.LatLng(it.place.lat, it.place.lng); path.push(pos); bounds.extend(pos);
        new k.maps.CustomOverlay({ map, position: pos, yAnchor: 1, content: `<div class="kmarker"><b>${i + 1}</b>${esc(it.place.name)}</div>` });
      });
      new k.maps.Polyline({ map, path, strokeWeight: 4, strokeColor: '#FF6F87', strokeOpacity: 0.85, strokeStyle: 'shortdash' });
      map.setBounds(bounds, 40, 40, 40, 40);
    } catch (e) { el.innerHTML = svgMap(plan.items); }
  }

  /* ---------- 코스 목록 ---------- */
  function courses() {
    const list = state.courses.filter((c) => c.saved).sort((a, b) => b.req.date.localeCompare(a.req.date));
    const last = state.courses.find((c) => !c.saved);
    return `<header class="page-head"><h2>🗺️ 내 코스</h2></header>
      <button class="btn big" data-action="new-course">✨ 새 코스 만들기</button>
      ${last ? `<h2>방금 만든 코스 <span class="sub">(저장 전)</span></h2>${courseCard(last)}` : ''}
      <h2>저장한 코스</h2>
      ${list.length ? list.map(courseCard).join('') : `<div class="empty"><div>📭</div><p>저장한 코스가 없어요</p></div>`}`;
  }

  /* ---------- 캘린더 ---------- */
  function calendar() {
    const m = ui.calMonth || today().slice(0, 7);
    const [y, mo] = m.split('-').map(Number);
    const first = new Date(y, mo - 1, 1).getDay(); const days = new Date(y, mo, 0).getDate();
    const byDate = {};
    state.courses.filter((c) => c.saved).forEach((c) => (byDate[c.req.date] = byDate[c.req.date] || []).push(c));
    const an = {}; E.upcomingAnniversaries(couple(), `${m}-01`, 31).forEach((a) => { if (a.date.startsWith(m)) an[a.date] = a.name; });
    const cells = [];
    for (let i = 0; i < first; i++) cells.push('<div></div>');
    for (let d = 1; d <= days; d++) {
      const ds = `${m}-${String(d).padStart(2, '0')}`; const cs = byDate[ds] || [];
      const photo = cs.map((c) => c.review && c.review.photos && c.review.photos[0]).find(Boolean);
      cells.push(`<button class="cal-day ${ds === today() ? 'today' : ''} ${ui.calDay === ds ? 'sel' : ''} ${cs.length ? 'has' : ''}" data-action="cal-day" data-d="${ds}"
        ${photo ? `style="background-image:url(${photo})"` : ''}><span>${d}</span>${cs.length && !photo ? `<i>${cs.some((c) => c.review) ? '💗' : '📍'}</i>` : ''}${an[ds] ? '<em>🎉</em>' : ''}</button>`);
    }
    const sel = ui.calDay; const selCs = sel ? byDate[sel] || [] : [];
    return `<header class="page-head"><h2>📔 데이트 캘린더</h2></header>
      <div class="card cal">
        <div class="row between"><button class="icon-btn" data-action="cal-move" data-d="-1">‹</button><b>${y}년 ${mo}월</b><button class="icon-btn" data-action="cal-move" data-d="1">›</button></div>
        <div class="cal-grid head">${DOW.map((d) => `<div>${d}</div>`).join('')}</div>
        <div class="cal-grid">${cells.join('')}</div>
      </div>
      ${sel ? `<h2>${fmtDate(sel)} ${an[sel] ? `🎉 ${esc(an[sel])}` : ''}</h2>
        ${selCs.length ? selCs.map(memoryCard).join('') : `<div class="empty small"><p>이날은 데이트 기록이 없어요</p></div>`}` : `<p class="sub center">날짜를 눌러 추억을 확인해보세요</p>`}`;
  }
  function memoryCard(c) {
    const r = c.review;
    const names = [state.me, state.partner].filter(Boolean);
    return `<div class="card memory">
      <div class="row between"><b>${esc(c.title)}</b><button class="link" data-action="go" data-to="#/course/${c.id}">코스 보기</button></div>
      ${r ? `${r.photos && r.photos.length ? `<div class="photos">${r.photos.map((p) => `<img src="${p}" alt=""/>`).join('')}</div>` : ''}
        ${['me', 'partner'].map((who, i) => r[who] && (r[who].rating || r[who].text) && names[i] ? `<div class="quote"><span>${esc(names[i].emoji)} ${esc(names[i].name)}</span> <span class="star-txt">${'★'.repeat(r[who].rating || 0)}</span><p>${esc(r[who].text || '')}</p></div>` : '').join('')}
        <button class="btn ghost small" data-action="go" data-to="#/review/${c.id}">후기 수정</button>`
      : `<button class="btn small" data-action="go" data-to="#/review/${c.id}">✍️ 후기 남기기</button>`}
    </div>`;
  }

  /* ---------- 후기 ---------- */
  function review(id) {
    const c = findCourse(id); if (!c) return '';
    if (!ui.form || ui.form.reviewOf !== id) ui.form = { reviewOf: id, r: JSON.parse(JSON.stringify(c.review || { me: { rating: 0, text: '' }, partner: { rating: 0, text: '' }, places: {}, photos: [] })) };
    const r = ui.form.r; const plan = c.plans[c.active] || c.plans.A;
    const ppl = [['me', state.me], ['partner', state.partner]].filter(([, p]) => p);
    return `<header class="page-head"><button class="back" data-action="go" data-to="#/course/${c.id}">‹</button><h2>✍️ 오늘 데이트 어땠어요?</h2><p class="sub">${esc(c.title)} · ${fmtDate(c.req.date)}</p></header>
      ${ppl.map(([who, p]) => `<div class="card"><h3>${esc(p.emoji)} ${esc(p.name)}의 별점</h3>${stars(`u.form.r.${who}.rating`, r[who].rating, 'big')}
        <input class="input mt" data-bind="u.form.r.${who}.text" value="${esc(r[who].text)}" placeholder="한 줄 후기" maxlength="60"/></div>`).join('')}
      <div class="card"><h3>📍 장소별 별점 <span class="sub">(다음 추천에 반영돼요)</span></h3>
        ${plan.items.map((it) => `<div class="place-rate"><span>${actEmoji(it)} ${esc(it.place.name)}</span>
          ${ppl.map(([who, p]) => `<div class="row"><span class="sub who">${esc(p.emoji)}</span>${stars(`u.form.r.places.${it.place.id}.${who}`, ((r.places || {})[it.place.id] || {})[who], 'small')}</div>`).join('')}</div>`).join('')}</div>
      <div class="card"><h3>📸 사진</h3>
        <div class="photos edit">${(r.photos || []).map((p, i) => `<div class="ph"><img src="${p}" alt=""/><button data-action="photo-del" data-i="${i}">✕</button></div>`).join('')}
          <label class="ph add">＋<input type="file" accept="image/*" multiple id="photoInput" hidden/></label></div>
        <p class="sub">사진은 이 기기에만 저장돼요 (자동으로 작게 줄여요)</p></div>
      <button class="btn big sticky" data-action="review-save" data-id="${c.id}">💗 추억 저장하기</button>`;
  }
  function shrink(file) {
    return new Promise((res, rej) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const s = Math.min(1, 720 / Math.max(img.width, img.height));
        const cv = document.createElement('canvas'); cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
        res(cv.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = rej; img.src = url;
    });
  }

  /* ---------- 공유 · 투표 · 서프라이즈 ---------- */
  function compactCourse(c) {
    const plan = c.plans[c.active] || c.plans.A;
    return { id: c.id, title: c.title, date: c.req.date, time: c.req.time, total: plan.total,
      items: plan.items.map((it) => ({ id: it.place.id, n: it.place.name, k: it.kind, a: it.actType, s: it.start, e: it.end, c: it.cost, r: it.reason, u: it.place.url, la: +it.place.lat.toFixed(5), ln: +it.place.lng.toFixed(5), d: it.place.demo ? 1 : 0, m: it.travelNext ? [it.travelNext.mode, it.travelNext.min] : null })) };
  }
  async function shareVote(c) {
    const code = await E.encode({ t: 'course', from: state.me.name, c: compactCourse(c) });
    const url = `${baseUrl()}#/shared/${code}`;
    shareLink('데이트 코스 투표 💌', `${state.me.name}님이 ${fmtDate(c.req.date)} 데이트 코스를 짰어요! 장소마다 좋아요/싫어요를 눌러주세요 💗`, url);
  }
  async function shared(code) {
    let d; try { d = await E.decode(code); } catch (e) { return `<div class="empty"><div>😢</div><p>링크가 손상됐어요</p></div>`; }
    if (d.t !== 'course') return `<div class="empty"><p>코스 링크가 아니에요</p></div>`;
    ui.sharedData = d; ui.votes = ui.votes || {};
    const c = d.c;
    return `<section class="hero small"><div class="hero-emoji">💌</div><h1>${esc(d.from)}님이 짠 데이트 코스</h1><p>${fmtDate(c.date)} · ${D.TIMES[c.time].label}</p></section>
      <p class="center sub">마음에 드는 곳엔 👍, 별로인 곳엔 👎를 눌러주세요</p>
      <div class="timeline">${c.items.map((it, i) => `<div class="tl-item"><div class="tl-time">${E.fmt(it.s)}<span>${E.fmt(it.e)}</span></div><div class="tl-dot">${i + 1}</div>
        <div class="tl-card"><span class="kind">${it.k === 'activity' ? D.ACTIVITIES[it.a].emoji + ' ' + D.ACTIVITIES[it.a].label : KIND_EMOJI[it.k] + (it.k === 'food' ? ' 식당' : ' 카페')}</span>
          <h3>${esc(it.n)}</h3><p class="reason">💡 ${esc(it.r)}</p>
          <div class="vote-row"><button class="vote ${ui.votes[it.id] === 1 ? 'on' : ''}" data-action="vote" data-id="${esc(it.id)}" data-v="1">👍 좋아요</button>
          <button class="vote no ${ui.votes[it.id] === -1 ? 'on' : ''}" data-action="vote" data-id="${esc(it.id)}" data-v="-1">👎 별로예요</button>
          ${it.u ? `<a class="pill" href="${esc(it.u)}" target="_blank" rel="noopener">정보</a>` : ''}</div></div></div>
        ${it.m ? `<div class="tl-move">${MODE[it.m[0]]} 약 ${it.m[1]}분</div>` : ''}`).join('')}</div>
      <div class="card"><h3>내 이름</h3><input class="input" id="voterName" value="${esc(state.me ? state.me.name : '')}" placeholder="이름"/></div>
      <button class="btn big" data-action="vote-send">💌 투표 결과 보내기</button>`;
  }
  async function votes(code) {
    let d; try { d = await E.decode(code); } catch (e) { return `<div class="empty"><p>링크가 손상됐어요</p></div>`; }
    if (d.t !== 'votes') return `<div class="empty"><p>투표 링크가 아니에요</p></div>`;
    const c = findCourse(d.courseId);
    if (!c) return `<div class="empty"><div>🤔</div><p>이 기기에 해당 코스가 없어요<br/>코스를 만든 기기에서 열어주세요</p></div>`;
    c.votes = d.votes; c.votedBy = d.by; c.saved = true; save();
    const n = Object.values(d.votes).filter((v) => v === -1).length;
    setTimeout(() => { toast(`${d.by}님의 투표를 반영했어요${n ? ` · 별로인 곳 ${n}곳` : ''}`); go('#/course/' + c.id); }, 50);
    return '';
  }
  function surpriseMake(c) {
    const plan = c.plans[c.active] || c.plans.A; const first = plan.items[0];
    modal(`<h3>🎁 서프라이즈 모드</h3><p class="sub">연인에게는 <b>만날 시간과 장소만</b> 보여줘요. 나머지 코스는 비밀!</p>
      <div class="card inner"><b>${fmtDate(c.req.date)} ${E.fmt(first.start)}</b><br/>📍 ${esc(first.place.name)} 앞</div>
      <input class="input" id="surpriseMsg" placeholder="한마디 (예: 편한 신발 신고 와!)" maxlength="40"/>
      <button class="btn" data-action="surprise-send" data-id="${c.id}">💌 비밀 초대장 보내기</button>
      <button class="btn ghost" data-action="close">닫기</button>`);
  }
  async function surprise(code) {
    let d; try { d = await E.decode(code); } catch (e) { return `<div class="empty"><p>링크가 손상됐어요</p></div>`; }
    if (d.t !== 'surprise') return `<div class="empty"><p>초대장 링크가 아니에요</p></div>`;
    const left = E.daysBetween(today(), d.date);
    const url = d.demo ? '' : `https://map.kakao.com/link/to/${encodeURIComponent(d.place.n)},${d.place.la},${d.place.ln}`;
    return `<section class="surprise">
      <div class="envelope">💌</div>
      <h1>${esc(d.from)}님의 비밀 데이트 초대장</h1>
      <div class="dday-big">${left > 0 ? `D-${left}` : left === 0 ? '오늘!' : '지난 데이트'}</div>
      <div class="card inner center"><p class="sub">만나는 시간</p><h2>${fmtDate(d.date)} ${esc(d.time)}</h2>
        <p class="sub mt">만나는 곳</p><h2>📍 ${esc(d.place.n)}</h2>${d.msg ? `<p class="msg">“${esc(d.msg)}”</p>` : ''}</div>
      ${url ? `<a class="btn big" href="${url}" target="_blank" rel="noopener">🧭 길찾기</a>` : ''}
      <p class="sub center">나머지 코스는 그날의 비밀이에요 🤫</p></section>`;
  }

  /* ---------- 설정 ---------- */
  function settings() {
    const s = state.settings;
    return `<header class="page-head"><h2>⚙️ 설정</h2></header>
      <div class="card list">
        <button class="list-row" data-action="edit-profile">${state.me.emoji} 내 프로필 · 취향 수정 <i>›</i></button>
        <button class="list-row" data-action="go" data-to="#/connect">💞 연인 연결 ${state.partner ? `<span class="sub">(${esc(state.partner.name)})</span>` : '<span class="sub">(미연결)</span>'} <i>›</i></button>
        <button class="list-row" data-action="go" data-to="#/coupleSettings">💑 커플 정보 · 기념일 · 예산 <i>›</i></button>
      </div>
      <div class="card"><h3>🔔 기념일 알림</h3><p class="sub">기념일 2주 전부터 앱을 열면 알려드려요 (기기 알림 허용 시 알림도 보내요)</p>
        <label class="switch"><input type="checkbox" data-action="notify-toggle" ${s.notify ? 'checked' : ''}/><span></span> 알림 받기</label></div>
      <div class="card"><h3>🗺️ 카카오 JavaScript 키</h3>
        <p class="sub">넣으면 실제 장소(카카오맵)로 추천하고 지도·카톡 공유가 켜져요. 없으면 데모 모드(예시 장소)로 동작해요.</p>
        <input class="input" data-bind="s.settings.kakaoKey" data-save="1" value="${esc(s.kakaoKey)}" placeholder="developers.kakao.com → 내 애플리케이션 → JavaScript 키"/>
        <p class="sub">카카오 개발자 콘솔 → 플랫폼 → Web에 이 앱 주소(${esc(location.origin)})를 등록해야 해요.</p></div>
      <div class="card"><h3>💾 백업</h3><div class="row"><button class="btn ghost" data-action="backup">내보내기</button><label class="btn ghost">불러오기<input type="file" accept="application/json" id="restoreInput" hidden/></label></div></div>
      <button class="btn ghost danger" data-action="reset">모든 데이터 초기화</button>
      <p class="sub center">데이트길잡이 v1 · 데이터는 이 기기에만 저장돼요</p>`;
  }

  /* ---------- 기념일 알림 ---------- */
  async function checkAnniversaryNotice() {
    if (!state.me || !state.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    for (const a of E.upcomingAnniversaries(couple(), today(), 14)) {
      const key = a.name + a.date; if (state.notified[key]) continue;
      const body = `${a.name}까지 ${a.daysLeft ? `D-${a.daysLeft}` : '오늘!'} 기념일 코스를 미리 짜볼까요? 💝`;
      try {
        const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
        if (reg) reg.showNotification('데이트길잡이', { body, icon: 'icon.svg', tag: key }); else new Notification('데이트길잡이', { body });
        state.notified[key] = Date.now(); save();
      } catch (e) { /* 무시 */ }
    }
  }

  /* ---------- 렌더 후 처리 ---------- */
  function afterRender(name, arg) {
    if (name === 'course') { const c = findCourse(arg); if (c) drawMap(c); }
    const pi = $('#photoInput');
    if (pi) pi.onchange = async () => {
      const r = ui.form.r; r.photos = r.photos || [];
      for (const f of Array.from(pi.files).slice(0, 6 - r.photos.length)) { try { r.photos.push(await shrink(f)); } catch (e) { toast('사진을 읽지 못했어요'); } }
      rerender();
    };
    const ri = $('#restoreInput');
    if (ri) ri.onchange = async () => {
      try { const j = JSON.parse(await ri.files[0].text()); if (!j.me) throw 0; Object.keys(state).forEach((k) => delete state[k]); Object.assign(state, blank(), j); save(); toast('불러왔어요'); go('#/home'); }
      catch (e) { toast('백업 파일이 아니에요'); }
    };
  }

  /* ---------- 이벤트 ---------- */
  document.addEventListener('input', (e) => {
    const el = e.target; const p = el.dataset.bind; if (!p) return;
    setPath(p, el.value);
    if (el.dataset.clearCenter) state.draft.center = null;
    if (el.dataset.save || p.startsWith('s.')) save();
    if (el.dataset.rerender) rerender();
  });

  const actions = {
    go: (el) => go(el.dataset.to),
    close: () => closeModal(),
    'close-home': () => { closeModal(); go('#/home'); },
    pick: (el) => {
      const { path, multi, toggle, num } = el.dataset; const v = num ? Number(el.dataset.val) : el.dataset.val;
      let cur = getPath(path);
      if (multi) { cur = cur || []; cur = cur.includes(v) ? cur.filter((x) => x !== v) : cur.concat([v]); }
      else cur = toggle && cur === v ? '' : v;
      setPath(path, cur);
      // 좋아함/싫어함은 동시에 선택 불가
      const other = { 'u.form.profile.likes': 'u.form.profile.dislikes', 'u.form.profile.dislikes': 'u.form.profile.likes' }[path];
      if (other && cur.includes(v)) setPath(other, (getPath(other) || []).filter((x) => x !== v));
      if (path === 's.draft.area') state.draft.center = null;
      if (path === 's.draft.aiConcept') { state.draft.concept = v; ui.recs = null; }
      save(); rerender();
    },
    star: (el) => { setPath(el.dataset.path, Number(el.dataset.val)); rerender(); },
    toggle: (el) => { setPath(el.dataset.path, el.checked); save(); },
    'welcome-next': () => {
      if (!ui.form.name.trim()) return toast('이름을 입력해주세요');
      go('#/profile');
    },
    'profile-save': () => {
      const f = ui.form; if (!f.name || !f.name.trim()) return toast('이름을 입력해주세요');
      const prof = Object.assign({}, f.profile, { drink: f.profile.drink !== 'no' && f.profile.drink !== false });
      if (f.isNew) state.me = { id: uid(), name: f.name.trim(), emoji: f.emoji, profile: prof };
      else Object.assign(state.me, { name: f.name.trim(), emoji: f.emoji, profile: prof });
      const wasNew = f.isNew; ui.form = null; save();
      if (wasNew && ui.pendingInvite) return go('#/invite/' + ui.pendingInvite);
      if (wasNew) return go('#/connect');
      toast('저장했어요 💗' + (state.partner ? ' 연인에게 새 코드를 보내면 상대 앱에도 반영돼요' : '')); go('#/settings');
    },
    'edit-profile': () => { ui.form = null; go('#/profile'); },
    'invite-share': async () => { const code = await myInvite(); closeModal(); shareLink('데이트길잡이 커플 연결 💌', `${state.me.name}님이 데이트길잡이에서 연결을 요청했어요! 링크를 열거나 코드를 입력해주세요\n코드: ${code}`, `${baseUrl()}#/invite/${code}`); },
    'invite-copy': async () => copy(await myInvite(), '코드를 복사했어요'),
    'partner-connect': async () => {
      const v = $('#partnerCode').value; if (!v.trim()) return toast('코드를 붙여넣어 주세요');
      const r = await acceptInvite(v);
      if (r === 'new') replyModal(state.partner.name); else if (r === 'update') { toast(`${state.partner.name}님 프로필을 업데이트했어요`); rerender(); }
    },
    'invite-accept': async () => {
      const r = await acceptInvite(ui.pendingInvite); ui.pendingInvite = null;
      if (r) { history.replaceState(null, '', '#/home'); route(); if (r === 'new') replyModal(state.partner.name); else toast('프로필을 업데이트했어요'); }
    },
    'partner-unlink': () => { if (confirm('연결을 해제할까요?')) { state.partner = null; save(); rerender(); } },
    'anniv-add': () => {
      const n = $('#annName').value.trim(), d = $('#annDate').value;
      if (!n || !d) return toast('이름과 날짜를 입력해주세요');
      state.couple.anniversaries.push({ name: n, date: d, yearly: true }); save(); rerender();
    },
    'anniv-del': (el) => { state.couple.anniversaries.splice(Number(el.dataset.i), 1); save(); rerender(); },
    'anniv-course': (el) => { state.draft = newDraft({ date: el.dataset.date, concept: 'anniversary', aiConcept: 'anniversary', time: 'evening' }); ui.step = 0; ui.recs = null; save(); go('#/create'); },
    'new-course': () => { state.draft = newDraft(state.draft && state.draft.area ? { area: state.draft.area } : {}); ui.step = 0; ui.recs = null; save(); go('#/create'); },
    'region-tab': (el) => { ui.regionTab = el.dataset.tab; rerender(); },
    'ai-regions': () => {
      const d = state.draft;
      ui.recs = E.recommendRegions(d.aiConcept, couple(), { city: state.couple.city, budget: d.budget, recent: state.courses.filter((c) => c.saved).slice(-3).map((c) => (D.REGIONS.find((r) => r.name === c.area) || {}).id) });
      rerender();
    },
    'pick-region': (el) => { const r = ui.recs[Number(el.dataset.i)]; state.draft.area = r.name; state.draft.center = null; state.draft.concept = state.draft.aiConcept; save(); rerender(); },
    step: (el) => {
      const n = ui.step + Number(el.dataset.d);
      if (ui.step === 0 && n > 0 && !state.draft.area.trim()) return toast('지역을 입력하거나 추천에서 골라주세요');
      ui.step = Math.max(0, Math.min(3, n)); go('#/create');
    },
    make: () => makeCourse(),
    plan: async (el) => {
      const c = findCourse(el.dataset.id); const k = el.dataset.k;
      if (k === 'B' && !c.plans.B) {
        toast('실내 위주 플랜B를 만드는 중...');
        let src = c.demo ? S.demoSource() : getSource();
        try { c.plans.B = await S.generate(src, Object.assign({}, c.req, { indoorOnly: true }), couple(), E.reviewContext(state.courses)); }
        catch (e) { return toast('플랜B를 만들지 못했어요'); }
      }
      c.active = k; save(); rerender();
    },
    reroll: (el) => {
      const c = findCourse(el.dataset.id); const plan = c.plans[c.active] || c.plans.A;
      const rejected = Object.entries(c.votes || {}).filter(([, v]) => v === -1).map(([id]) => id);
      const oldId = plan.items[Number(el.dataset.i)].place.id;
      if (!E.reroll(plan, Number(el.dataset.i), couple(), c.req, rejected)) return toast('근처에 다른 후보가 없어요 🥲');
      if (c.votes) delete c.votes[oldId];
      save(); rerender(); toast('다른 곳으로 바꿨어요 🔁');
    },
    'save-course': (el) => { const c = findCourse(el.dataset.id); c.saved = true; save(); rerender(); toast('코스를 저장했어요 💾 캘린더에서도 볼 수 있어요'); },
    'del-course': (el) => { if (!confirm('이 코스를 삭제할까요?')) return; state.courses = state.courses.filter((c) => c.id !== el.dataset.id); save(); go('#/courses'); },
    'share-vote': (el) => { const c = findCourse(el.dataset.id); c.saved = true; save(); shareVote(c); },
    'kakao-share': async (el) => {
      const c = findCourse(el.dataset.id); c.saved = true; save();
      const plan = c.plans[c.active] || c.plans.A;
      const text = `${fmtDate(c.req.date)}\n` + plan.items.map((it, i) => `${i + 1}. ${E.fmt(it.start)} ${it.place.name}`).join('\n');
      const code = await E.encode({ t: 'course', from: state.me.name, c: compactCourse(c) });
      kakaoShare(c.title, text, `${baseUrl()}#/shared/${code}`);
    },
    'import-votes': () => modal(`<h3>📥 투표 결과 받기</h3><p class="sub">연인이 보낸 투표 링크를 붙여넣거나, 링크를 직접 열어도 돼요</p>
      <textarea class="codebox" id="voteCode"></textarea><button class="btn" data-action="import-votes-go">반영하기</button><button class="btn ghost" data-action="close">닫기</button>`),
    'import-votes-go': () => { const v = $('#voteCode').value.trim(); const m = v.match(/([zj][A-Za-z0-9_-]{10,})\s*$/); if (!m) return toast('링크를 확인해주세요'); closeModal(); go('#/votes/' + m[1]); },
    'surprise-make': (el) => surpriseMake(findCourse(el.dataset.id)),
    'surprise-send': async (el) => {
      const c = findCourse(el.dataset.id); c.saved = true; c.surprise = true; save();
      const first = (c.plans[c.active] || c.plans.A).items[0];
      const code = await E.encode({ t: 'surprise', from: state.me.name, date: c.req.date, time: E.fmt(first.start), demo: first.place.demo, msg: $('#surpriseMsg').value.trim(),
        place: { n: first.place.name, la: +first.place.lat.toFixed(5), ln: +first.place.lng.toFixed(5) } });
      closeModal();
      shareLink('비밀 데이트 초대장 💌', `${state.me.name}님이 비밀 데이트 초대장을 보냈어요!`, `${baseUrl()}#/surprise/${code}`);
    },
    vote: (el) => { const id = el.dataset.id, v = Number(el.dataset.v); ui.votes[id] = ui.votes[id] === v ? 0 : v; rerender(); },
    'vote-send': async () => {
      const d = ui.sharedData; const by = ($('#voterName').value || '연인').trim();
      const v = {}; for (const k in ui.votes) if (ui.votes[k]) v[k] = ui.votes[k];
      if (!Object.keys(v).length) return toast('하나 이상 투표해주세요');
      const code = await E.encode({ t: 'votes', courseId: d.c.id, by, votes: v });
      shareLink('데이트 코스 투표 결과 💗', `${by}님의 투표 결과예요! 링크를 열면 코스에 반영돼요`, `${baseUrl()}#/votes/${code}`);
    },
    'review-save': (el) => {
      const c = findCourse(el.dataset.id); const r = ui.form.r;
      if (!r.me.rating && !(r.partner && r.partner.rating)) return toast('별점을 하나 이상 남겨주세요');
      c.review = r; c.saved = true; ui.form = null; save();
      toast('추억을 저장했어요 💗 다음 추천에 반영할게요'); ui.calDay = c.req.date; ui.calMonth = c.req.date.slice(0, 7); go('#/calendar');
    },
    'photo-del': (el) => { ui.form.r.photos.splice(Number(el.dataset.i), 1); rerender(); },
    'cal-day': (el) => { ui.calDay = el.dataset.d; rerender(); },
    'cal-move': (el) => {
      const [y, m] = (ui.calMonth || today().slice(0, 7)).split('-').map(Number); const d = new Date(y, m - 1 + Number(el.dataset.d), 1);
      ui.calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; ui.calDay = null; rerender();
    },
    'notify-toggle': async (el) => {
      state.settings.notify = el.checked;
      if (el.checked && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
      save(); checkAnniversaryNotice();
    },
    backup: () => {
      const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `dategil-backup-${today()}.json`; a.click();
    },
    reset: () => { if (confirm('정말 모든 데이터를 지울까요? 되돌릴 수 없어요.')) { localStorage.removeItem(KEY); location.hash = '#/welcome'; location.reload(); } },
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]'); if (!el) return;
    if (el.tagName === 'INPUT' && el.type === 'checkbox' && el.dataset.action !== 'toggle' && el.dataset.action !== 'notify-toggle') return;
    if (el.tagName === 'LABEL') return;
    const fn = actions[el.dataset.action]; if (!fn) return;
    if (el.tagName === 'A') return;
    if (el.tagName !== 'INPUT') e.preventDefault();
    fn(el, e);
  });
  document.addEventListener('click', (e) => { const t = e.target.closest('.tabbar button'); if (t) { if (t.dataset.go === '#/calendar') ui.calDay = ui.calDay || today(); go(t.dataset.go); } });
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  route();
  checkAnniversaryNotice();
})();
