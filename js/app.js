/* GROW 앱 UI */
(function () {
  const { MUSCLES, PRESETS, CONCEPTS, DEV_LABELS, LEVELS, EQUIP } = DATA;
  const E = ENGINE;
  const KEY = 'grow_v1';
  const DAY = 86400000;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtSec = (s) => (s >= 60 ? `${Math.floor(s / 60)}분${s % 60 ? ' ' + (s % 60) + '초' : ''}` : `${s}초`);
  const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const fmtDate = (d) => { const x = new Date(d); return `${x.getMonth() + 1}/${x.getDate()} (${'일월화수목금토'[x.getDay()]})`; };
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };

  /* ---------- 상태 ---------- */
  const defaults = () => ({
    profile: { height: 179, weight: 77, birthYear: 2004, sex: 'M', level: 'intermediate', activity: 1.55 },
    dev: Object.fromEntries(Object.keys(MUSCLES).map((m) => [m, 3])),
    exSettings: {},
    customExercises: [],
    sessions: [],
    active: null,
    ui: { muscles: [], concept: 'hypertrophy', minutes: 60 },
  });
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s) {
        const d = defaults();
        return { ...d, ...s, profile: { ...d.profile, ...s.profile }, dev: { ...d.dev, ...s.dev }, ui: { ...d.ui, ...s.ui } };
      }
    } catch (e) { /* 손상된 데이터는 무시 */ }
    return defaults();
  }
  let state = load();
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));

  let tab = ['today','history','progress','settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'today';
  let progressEx = null;

  /* ---------- 공통 UI ---------- */
  function toast(msg, ms = 2200) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.add('hidden'), ms);
  }
  function openModal(html) { $('#modalBox').innerHTML = html; $('#modal').classList.remove('hidden'); }
  function closeModal() { $('#modal').classList.add('hidden'); $('#modalBox').innerHTML = ''; }
  const exName = (id) => { const e = E.getEx(state, id); return e ? e.name : '(삭제된 종목)'; };

  function render() {
    document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const v = $('#view');
    if (tab === 'today') v.innerHTML = state.active ? viewSession() : viewPlanner();
    if (tab === 'history') v.innerHTML = viewHistory();
    if (tab === 'progress') v.innerHTML = viewProgress();
    if (tab === 'settings') v.innerHTML = viewSettings();
    if (tab === 'progress') bindChart();
    renderTop();
  }
  function renderTop() {
    const p = state.profile;
    if (state.active) {
      const sec = Math.floor((Date.now() - new Date(state.active.date)) / 1000);
      $('#topInfo').innerHTML = `<b>운동 중</b> · ${clock(sec)}`;
    } else {
      $('#topInfo').textContent = `${p.height}cm · ${p.weight}kg · ${E.ageOf(p)}세`;
    }
  }
  setInterval(() => { if (state.active) renderTop(); }, 1000);

  /* ---------- 오늘 운동: 시작 화면 ---------- */
  function viewPlanner() {
    const ui = state.ui;
    const now = new Date();
    const C = CONCEPTS[ui.concept];

    const concepts = Object.entries(CONCEPTS).map(([k, c]) =>
      `<button class="concept ${ui.concept === k ? 'on' : ''}" data-action="concept" data-c="${k}">
        <div class="t">${c.emoji} ${c.name}</div><div class="d">${c.desc}</div></button>`).join('');

    const recent = state.sessions.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3);
    const recentCards = recent.map((s) => {
      const names = s.items.map((it) => exName(it.exId));
      return `<div class="card"><div class="row between"><div class="grow" style="min-width:0">
          <b>${fmtDate(s.date)}</b> <span class="badge">${CONCEPTS[s.concept].emoji} ${CONCEPTS[s.concept].name}</span>
          <div class="sub ellipsis">${esc(names.slice(0, 4).join(' · '))}${names.length > 4 ? ` 외 ${names.length - 4}개` : ''}</div></div>
          <button class="btn small ghost" data-action="repeat" data-id="${esc(s.id)}">이 구성으로</button></div></div>`;
    }).join('');

    const intro = state.sessions.length ? '' : `<div class="card accent"><b>환영합니다! 👋</b>
      <div class="sub" style="margin-top:4px">운동을 시작하고 종목을 검색해서 추가하세요. 추가하는 순간 지난 기록을 바탕으로
      <b>오늘 들 무게와 목표 반복수</b>가 자동으로 채워집니다. 첫 기록은 체중·경력 기반 추정치이니 첫 세트 후 조정하세요.</div></div>`;

    return `${intro}
      <h2>오늘의 컨셉</h2>
      <div class="concepts">${concepts}</div>
      <div class="sub" style="margin:8px 2px 14px">다관절 ${C.reps.compound.join('~')}회 · 고립 ${C.reps.isolation.join('~')}회 · RIR ${C.rirText} ·
        휴식 ${fmtSec(C.rest.compound)}/${fmtSec(C.rest.isolation)} · 템포 ${C.tempo}</div>
      <button class="btn block" data-action="start-empty">＋ 운동 시작하기</button>
      <div class="sub" style="text-align:center;margin-top:6px">종목을 직접 검색해서 추가 · 무게/반복 자동 처방</div>
      ${recent.length ? `<h2>최근 운동 다시 하기</h2>${recentCards}` : ''}
      <details class="card auto-box" ${ui.autoOpen ? 'open' : ''} data-details="autoOpen">
        <summary><b>🤖 자동 루틴 추천</b> <span class="sub">부위·발달도·회복 상태 기반</span></summary>
        ${viewAutoRoutine(now)}
      </details>`;
  }

  function viewAutoRoutine(now) {
    const ui = state.ui;
    const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
    const rec = state.sessions.length ? E.recommend(state, now)[0] : null;
    const presets = PRESETS.map((p, i) =>
      `<button class="chip ${sameSet(p.muscles, ui.muscles) ? 'on' : ''}" data-action="apply-preset" data-p="${i}">${esc(p.name)}</button>`).join('');
    const muscles = Object.entries(MUSCLES).map(([k, m]) => {
      const lt = E.lastTrained(state, k);
      const d = lt ? Math.floor((now - lt) / DAY) : null;
      const dev = state.dev[k] || 3;
      return `<button class="muscle-btn ${ui.muscles.includes(k) ? 'on' : ''}" data-action="toggle-muscle" data-m="${k}">
        <b>${m.name}</b><span class="dots" title="발달도 ${dev}/5">${'●'.repeat(dev)}${'○'.repeat(5 - dev)}</span>
        <div class="meta">${d === null ? '기록 없음' : d === 0 ? '오늘 운동함' : d + '일 전'}</div></button>`;
    }).join('');
    const mins = [45, 60, 75, 90].map((m) =>
      `<button class="${ui.minutes === m ? 'on' : ''}" data-action="minutes" data-v="${m}">${m}분</button>`).join('');
    return `${rec ? `<div class="sub" style="margin-top:10px">오늘 추천: <b>${esc(rec.preset.name)}</b>
        ${rec.blocked.length ? '(일부 회복 중: ' + rec.blocked.map((m) => MUSCLES[m].name).join(', ') + ')' : '(회복 완료)'}</div>` : ''}
      <div class="chips" style="margin:10px 0">${presets}</div>
      <div class="muscle-grid">${muscles}</div>
      <div class="sub" style="margin:6px 0 10px">● = 근육 발달도. 약한 부위가 먼저, 더 많은 세트로 배치됩니다.</div>
      <div class="seg">${mins}</div>
      <div class="sub" style="margin:6px 0 10px">약 ${E.setBudget(ui.concept, ui.minutes)}세트 · 생성 후 종목 교체/추가/삭제 자유</div>
      <button class="btn ghost block" data-action="generate" ${ui.muscles.length ? '' : 'disabled'}>
        ${ui.muscles.length ? '추천 루틴으로 시작' : '부위를 선택하세요'}</button>`;
  }

  /* ---------- 오늘 운동: 진행 ---------- */
  function viewSession() {
    const s = state.active;
    const C = CONCEPTS[s.concept];
    const total = s.items.reduce((a, it) => a + it.sets.length, 0);
    const done = s.items.reduce((a, it) => a + it.sets.filter((x) => x.done).length, 0);
    const vol = s.items.reduce((a, it) => a + it.sets.filter((x) => x.done).reduce((b, x) => b + x.w * x.r, 0), 0);
    const muscles = [...new Set(s.items.map((it) => it.muscle))];
    const wu = E.warmupFor(state, s);

    const warm = wu
      ? `<div class="card"><h3>🔥 워밍업 · ${esc(exName(wu.exId))}</h3>
          <div class="sub">가벼운 유산소 5분 후 → ${wu.sets.map((x) => `${x.w}kg×${x.r}`).join(' → ')} → 본 세트</div></div>`
      : '';
    const conceptOpts = Object.entries(CONCEPTS).map(([k, c]) => `<option value="${k}" ${k === s.concept ? 'selected' : ''}>${c.emoji} ${c.name}</option>`).join('');

    return `<div class="card">
        <div class="session-head"><div>
          <select class="concept-select" data-action-change="concept-change" aria-label="컨셉 변경">${conceptOpts}</select>
          <div style="margin-top:6px">${muscles.map((m) => `<span class="badge accent">${MUSCLES[m]?.name || ''}</span>`).join('') || '<span class="sub">종목을 추가하세요</span>'}</div>
        </div><div style="text-align:right"><b style="font-size:20px">${done}/${total}</b><div class="sub">세트</div></div></div>
        <div class="sub" style="margin-top:8px">템포 ${C.tempo} · RIR ${C.rirText} · 볼륨 ${Math.round(vol).toLocaleString()}kg</div>
        <ul class="notes" style="padding-left:18px;margin:8px 0 0">${s.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      </div>
      ${warm}
      ${s.items.length ? s.items.map(itemCard).join('') : `<div class="card empty">아직 추가한 종목이 없습니다.<br>아래 버튼으로 종목을 검색해서 추가하세요.</div>`}
      <button class="btn ${s.items.length ? 'ghost' : ''} block" data-action="add-ex" style="margin-top:6px">🔍 종목 검색해서 추가</button>
      <div class="row" style="margin-top:12px">
        <button class="btn danger" data-action="cancel-session">취소</button>
        <button class="btn block grow" data-action="finish">운동 완료 · 기록 저장</button>
      </div>`;
  }

  function itemCard(it, i) {
    const ex = E.getEx(state, it.exId) || { name: '(삭제된 종목)', equip: '' };
    const isBW = ex.equip === 'bodyweight';
    const C = CONCEPTS[state.active.concept];
    const doneN = it.sets.filter((x) => x.done).length;
    const rows = it.sets.map((st, j) => `
      <tr class="${st.done ? 'done' : ''}">
        <td class="set-no">${j + 1}</td>
        <td><div class="stepper">
          <button data-action="w-step" data-i="${i}" data-j="${j}" data-d="-1">−</button>
          <input data-field="w" data-i="${i}" data-j="${j}" inputmode="decimal" value="${st.w}">
          <button data-action="w-step" data-i="${i}" data-j="${j}" data-d="1">+</button></div></td>
        <td><div class="stepper">
          <button data-action="r-step" data-i="${i}" data-j="${j}" data-d="-1">−</button>
          <input class="reps" data-field="r" data-i="${i}" data-j="${j}" inputmode="numeric" value="${st.r}">
          <button data-action="r-step" data-i="${i}" data-j="${j}" data-d="1">+</button></div>
          <span class="target">목표 ${st.target}회</span>${st.drop ? '<span class="drop-tag">+ 드롭세트 -20%×2</span>' : ''}</td>
        <td><button class="check ${st.done ? 'on' : ''}" data-action="toggle-set" data-i="${i}" data-j="${j}" aria-label="세트 완료">✓</button></td>
      </tr>`).join('');

    return `<div class="card ex-card ${doneN === it.sets.length ? 'complete' : ''}">
      <div class="row between"><div class="ex-title">${it.superset ? `<span class="badge ss">${it.superset}</span>` : ''}${esc(ex.name)}</div>
        <span class="sub">${doneN}/${it.sets.length}</span></div>
      <div class="ex-meta">${MUSCLES[it.muscle]?.name || ''} · ${it.type === 'compound' ? '다관절' : '고립'} · 목표 ${it.range[0]}~${it.range[1]}회 ·
        휴식 ${it.superset && it.superset.endsWith('1') ? '없이 ' + it.superset[0] + '2로' : fmtSec(it.rest)} · RIR ${C.rirText}</div>
      <div class="reason ${it.source}">${esc(it.reason)}</div>
      <table class="sets"><thead><tr><th>세트</th><th>${isBW ? '추가중량(kg)' : '무게(kg)'}</th><th>반복</th><th>완료</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="ex-actions">
        <button class="btn small ghost" data-action="set-add" data-i="${i}">세트 +</button>
        <button class="btn small ghost" data-action="set-del" data-i="${i}">세트 −</button>
        <button class="btn small ghost" data-action="swap" data-i="${i}">⇄ 교체</button>
        <button class="btn small ghost" data-action="move-up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="btn small ghost" data-action="remove-ex" data-i="${i}">삭제</button>
      </div></div>`;
  }

  /* ---------- 휴식 타이머 ---------- */
  const rest = { end: 0, total: 0, id: null, alerted: false };
  let audioCtx = null;
  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((t) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
        g.gain.setValueAtTime(0.25, audioCtx.currentTime + t);
        o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + 0.15);
      });
    } catch (e) { /* 오디오 미지원 */ }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }
  function startRest(sec) {
    rest.total = sec; rest.end = Date.now() + sec * 1000; rest.alerted = false;
    $('#restBar').classList.remove('hidden', 'over');
    clearInterval(rest.id);
    rest.id = setInterval(tickRest, 250);
    tickRest();
  }
  function tickRest() {
    const left = Math.ceil((rest.end - Date.now()) / 1000);
    if (left <= 0 && !rest.alerted) { rest.alerted = true; beep(); $('#restBar').classList.add('over'); }
    $('#restTime').textContent = left >= 0 ? clock(left) : '+' + clock(-left);
    $('#restFill').style.width = Math.min(100, (1 - Math.max(0, left) / rest.total) * 100) + '%';
    if (left < -90) stopRest();
  }
  function stopRest() { clearInterval(rest.id); $('#restBar').classList.add('hidden'); }

  /* ---------- 세션 조작 ---------- */
  function generate() {
    const { muscles, concept, minutes } = state.ui;
    state.active = E.generateRoutine(state, { muscles, concept, minutes });
    save(); render(); window.scrollTo(0, 0);
  }

  function setField(i, j, field, value) {
    const it = state.active.items[i];
    const st = it.sets[j];
    if (field === 'w') {
      const v = Math.max(0, +num(value).toFixed(2));
      // 이후 미완료 세트에도 같은 무게 적용 (드롭 이후 등 수동 수정 편의)
      for (let k = j; k < it.sets.length; k++) if (k === j || !it.sets[k].done) it.sets[k].w = v;
    } else {
      st.r = Math.max(0, Math.round(num(value)));
    }
    save();
  }

  function toggleSet(i, j) {
    const it = state.active.items[i];
    const st = it.sets[j];
    st.done = !st.done;
    save(); render();
    if (!st.done) return;
    const allDone = it.sets.every((x) => x.done);
    if (it.superset && it.superset.endsWith('1')) {
      toast(`바로 ${it.superset[0]}2 진행 →`);
      return;
    }
    if (allDone && st.r >= it.range[1]) toast('🔥 상한 달성! 다음엔 증량됩니다');
    startRest(it.rest);
  }

  function finish() {
    const s = state.active;
    const done = s.items.reduce((a, it) => a + it.sets.filter((x) => x.done).length, 0);
    if (!done) {
      if (confirm('완료한 세트가 없습니다. 기록하지 않고 종료할까요?')) { state.active = null; save(); render(); }
      return;
    }
    if (!confirm('운동을 마치고 기록을 저장할까요?')) return;
    // PR 체크 (저장 전 기존 최고 추정 1RM 과 비교)
    const bw = state.profile.weight;
    const prs = [];
    for (const it of s.items) {
      const ex = E.getEx(state, it.exId);
      if (!ex) continue;
      const load = (w) => (ex.equip === 'bodyweight' ? bw + w : w);
      const best = Math.max(0, ...it.sets.filter((x) => x.done).map((x) => E.e1rm(load(x.w), x.r)));
      const prev = Math.max(0, ...E.history(state, it.exId).flatMap((h) => h.sets.map((x) => E.e1rm(load(x.w), x.r))));
      if (best > 0 && prev > 0 && best > prev + 0.01) prs.push(`${ex.name}: 추정 1RM ${prev.toFixed(1)} → ${best.toFixed(1)}kg`);
    }
    s.items = s.items.filter((it) => it.sets.some((x) => x.done));
    s.items.forEach((it) => { it.sets = it.sets.filter((x) => x.done); });
    s.muscles = [...new Set(s.items.map((it) => it.muscle))];
    s.endedAt = new Date().toISOString();
    state.sessions.push(s);
    state.active = null;
    save(); stopRest(); render();
    const vol = s.items.reduce((a, it) => a + it.sets.reduce((b, x) => b + x.w * x.r, 0), 0);
    const mins = Math.round((new Date(s.endedAt) - new Date(s.date)) / 60000);
    openModal(`<h2 style="margin-top:0">수고하셨습니다! 💪</h2>
      <div class="kv"><div><b>${done}</b><span>세트</span></div><div><b>${Math.round(vol).toLocaleString()}</b><span>총 볼륨(kg)</span></div><div><b>${mins}분</b><span>운동 시간</span></div></div>
      ${prs.length ? `<h3 style="margin-top:16px">🏆 신기록</h3><ul class="notes">${prs.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      <p class="sub">다음 세션에서 같은 컨셉을 선택하면 오늘 기록을 바탕으로 무게/반복이 자동 조정됩니다.</p>
      <button class="btn block" data-action="close-modal">확인</button>`);
  }

  function swapModal(i) {
    const s = state.active;
    const it = s.items[i];
    const alts = E.alternatives(state, s, it);
    if (!alts.length) return toast('교체 가능한 종목이 없습니다');
    openModal(`<h2 style="margin-top:0">⇄ ${esc(exName(it.exId))} 교체</h2>
      ${alts.map((ex) => {
        const p = E.prescribe(state, ex, s.concept);
        return `<button class="pick" data-action="pick-swap" data-i="${i}" data-id="${esc(ex.id)}"><b>${esc(ex.name)}</b>
          <div class="sub">${ex.type === 'compound' ? '다관절' : '고립'} · ${p.weight}kg × ${p.targets[0]}회 · ${esc(p.reason)}</div></button>`;
      }).join('')}
      <button class="btn ghost block" data-action="close-modal">닫기</button>`);
  }

  /* ---------- 종목 검색/추가 ---------- */
  let addUI = { q: '', muscle: '', equip: '', creating: false };
  function addModal() {
    addUI = { q: '', muscle: '', equip: '', creating: false };
    openModal(`<div class="add-head">
        <div class="row between"><h2 style="margin:0">종목 추가</h2><button class="btn small" data-action="close-modal">완료</button></div>
        <input class="input" id="addSearch" placeholder="검색: 벤치, 랫풀, ㅅㅋㅌ, squat …" autocomplete="off" enterkeyhint="search">
        <div class="chips scroll" id="addMuscles"></div>
        <div class="chips scroll" id="addEquip"></div>
      </div>
      <div id="addList"></div>`);
    renderAddFilters();
    renderAddList();
    const inp = $('#addSearch');
    inp.oninput = () => { addUI.q = inp.value; addUI.creating = false; renderAddList(); };
    if (!matchMedia('(pointer: coarse)').matches) inp.focus();
  }
  function renderAddFilters() {
    const chip = (k, v, label) => `<button class="chip ${addUI[k] === v ? 'on' : ''}" data-action="add-filter" data-k="${k}" data-v="${v}">${label}</button>`;
    $('#addMuscles').innerHTML = chip('muscle', '', '전체 부위') + Object.entries(MUSCLES).map(([k, m]) => chip('muscle', k, m.name)).join('');
    $('#addEquip').innerHTML = chip('equip', '', '전체 장비') + Object.entries(EQUIP).map(([k, n]) => chip('equip', k, n)).join('');
  }
  function exRow(ex, inSession) {
    const added = inSession.has(ex.id);
    const last = E.lastRecord(state, ex.id);
    const p = E.prescribe(state, ex, state.active.concept);
    const lastTxt = last ? `지난 ${fmtDate(last.date)}: ${last.sets.map((x) => `${x.w}×${x.r}`).join(', ')}` : '첫 기록';
    return `<button class="pick ex-row ${added ? 'added' : ''}" data-action="pick-add" data-id="${esc(ex.id)}">
      <div class="row between"><b>${added ? '✓ ' : ''}${esc(ex.name)}</b>
        <span class="badge">${MUSCLES[ex.muscle]?.name || ''} · ${EQUIP[ex.equip] || ''}</span></div>
      <div class="sub">${esc(lastTxt)} → <span class="next">오늘 ${p.weight}kg × ${p.targets[0]}회</span></div></button>`;
  }
  function renderAddList() {
    const box = $('#addList');
    if (!box) return;
    if (addUI.creating) return renderCreateForm(box);
    const inSession = new Set(state.active.items.map((x) => x.exId));
    const filtered = addUI.q || addUI.muscle || addUI.equip;
    let html = '';
    if (!filtered) {
      const recent = E.recentExercises(state, 10);
      if (recent.length) html += `<h3 class="list-h">⏱ 최근 · 자주 한 종목</h3>` + recent.map((e) => exRow(e, inSession)).join('');
      html += Object.entries(MUSCLES).map(([m, info]) => {
        const list = E.searchExercises(state, { muscle: m });
        return list.length ? `<h3 class="list-h">${info.name}</h3>` + list.map((e) => exRow(e, inSession)).join('') : '';
      }).join('');
    } else {
      const list = E.searchExercises(state, addUI);
      html += list.length
        ? `<div class="sub" style="margin:8px 2px">${list.length}개 종목</div>` + list.slice(0, 80).map((e) => exRow(e, inSession)).join('')
        : '<div class="empty">검색 결과가 없습니다.</div>';
    }
    html += `<button class="btn ghost block" data-action="create-open" style="margin-top:10px">＋ ${addUI.q ? `'${esc(addUI.q)}' ` : ''}새 종목 직접 만들기</button>`;
    box.innerHTML = html;
  }
  function renderCreateForm(box) {
    const muscleOpts = Object.entries(MUSCLES).map(([k, m]) => `<option value="${k}" ${k === (addUI.muscle || 'chest') ? 'selected' : ''}>${m.name}</option>`).join('');
    const equipOpts = Object.entries(EQUIP).map(([k, n]) => `<option value="${k}" ${k === (addUI.equip || 'machine') ? 'selected' : ''}>${n}</option>`).join('');
    box.innerHTML = `<div class="card"><h3>새 종목 만들기</h3>
      <label class="field">종목 이름<input id="nxName" value="${esc(addUI.q)}" placeholder="예: 스미스 머신 슈러그"></label>
      <div class="grid2">
        <label class="field">주동근<select id="nxMuscle">${muscleOpts}</select></label>
        <label class="field">유형<select id="nxType"><option value="compound">다관절</option><option value="isolation">고립</option></select></label>
        <label class="field">장비<select id="nxEquip">${equipOpts}</select></label>
        <label class="field">증량 단위(kg)<input id="nxInc" inputmode="decimal" value="2.5"></label>
      </div>
      <label class="field">시작 무게(kg, 선택)<input id="nxStart" inputmode="decimal" placeholder="비우면 맨몸/최소 무게"></label>
      <div class="row"><button class="btn ghost" data-action="create-cancel">취소</button>
        <button class="btn grow" data-action="create-save">만들고 추가</button></div></div>`;
  }
  function createCustom({ name, muscle, type, equip, inc, start }) {
    const id = 'c_' + Date.now();
    const ex = { id, name, custom: true, muscle, type, equip, ratio: 0, inc: inc || 2.5, stim: 4, pump: 4,
      fatigue: type === 'compound' ? 3 : 1, secondary: [], alias: '' };
    state.customExercises.push(ex);
    if (start > 0) state.exSettings[id] = { startWeight: start };
    return ex;
  }

  /* ---------- 기록 ---------- */
  function viewHistory() {
    const list = state.sessions.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    if (!list.length) return '<div class="empty">아직 기록이 없습니다.<br>오늘 운동 탭에서 첫 루틴을 시작해 보세요!</div>';
    return `<h2>운동 기록 (${list.length}회)</h2>` + list.map((s) => {
      const C = CONCEPTS[s.concept];
      const sets = s.items.reduce((a, it) => a + it.sets.length, 0);
      const vol = s.items.reduce((a, it) => a + it.sets.reduce((b, x) => b + x.w * x.r, 0), 0);
      const mins = s.endedAt ? Math.round((new Date(s.endedAt) - new Date(s.date)) / 60000) : null;
      return `<div class="card"><details><summary class="list-item" style="list-style:none;cursor:pointer">
          <div><b>${fmtDate(s.date)}</b> <span class="badge">${C.emoji} ${C.name}</span>
          <div class="sub">${s.muscles.map((m) => MUSCLES[m].name).join(' · ')}</div></div>
          <div style="text-align:right"><b>${sets}세트</b><div class="sub">${Math.round(vol).toLocaleString()}kg${mins ? ' · ' + mins + '분' : ''}</div></div>
        </summary>
        <table class="data" style="margin-top:10px"><tbody>${s.items.map((it) =>
          `<tr><td>${esc(exName(it.exId))}</td><td>${it.sets.map((x) => `${x.w}×${x.r}`).join(', ')}</td></tr>`).join('')}</tbody></table>
        <button class="btn small danger" style="margin-top:10px" data-action="del-session" data-id="${esc(s.id)}">기록 삭제</button>
      </details></div>`;
    }).join('');
  }

  /* ---------- 성장 분석 ---------- */
  function viewProgress() {
    const vol = E.weeklyVolume(state);
    const maxScale = 24;
    const volRows = Object.entries(MUSCLES).map(([m, info]) => {
      const [lo, hi] = E.weeklyTarget(state, m);
      const v = vol[m];
      const st = v < lo ? ['low', '부족'] : v > hi ? ['high', '과다'] : ['ok', '적정'];
      return `<div class="vol-row" title="${info.name}: ${v}세트 (목표 ${lo}~${hi})"><div>${info.name}</div>
        <div class="vol-track"><div class="vol-band" style="left:${(lo / maxScale) * 100}%;width:${((hi - lo) / maxScale) * 100}%"></div>
        <div class="vol-fill" style="width:${Math.min(100, (v / maxScale) * 100)}%"></div></div>
        <div class="status ${st[0]}">${+v.toFixed(1)} · ${st[1]}</div></div>`;
    }).join('');

    const withHist = E.allExercises(state).filter((e) => E.history(state, e.id).length);
    if (!progressEx || !withHist.some((e) => e.id === progressEx)) progressEx = withHist[0]?.id || null;
    const series = progressEx ? E.progressSeries(state, progressEx) : [];

    const assess = E.assessDevelopment(state);
    const assessRows = Object.entries(assess).map(([m, a]) =>
      `<tr><td>${MUSCLES[m].name}</td><td>${esc(exName(a.ex))}</td><td>${a.e1rm.toFixed(1)}kg (${a.ratio.toFixed(2)}×체중)</td><td><b>${a.level}</b> ${DEV_LABELS[a.level]}</td><td class="muted">현재 ${state.dev[m]}</td></tr>`).join('');

    return `<h2>주간 볼륨 (최근 7일)</h2>
      <div class="card">${volRows}
        <div class="sub" style="margin-top:8px">회색 구간 = 발달도에 따른 주간 목표 세트. 보조근은 0.5세트로 집계됩니다.</div></div>
      <h2>종목별 성장</h2>
      ${withHist.length ? `<div class="card">
        <select class="input" data-action-change="progress-ex">${withHist.map((e) =>
          `<option value="${esc(e.id)}" ${e.id === progressEx ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>
        <h3 style="margin-top:12px">추정 1RM (kg)</h3>
        ${lineChart(series)}
        <table class="data" style="margin-top:10px"><thead><tr><th>날짜</th><th>컨셉</th><th>세트</th><th>1RM</th></tr></thead>
        <tbody>${series.slice().reverse().map((p) => `<tr><td>${fmtDate(p.date)}</td><td>${CONCEPTS[p.concept].name}</td><td>${p.sets}</td><td>${p.e1rm}</td></tr>`).join('')}</tbody></table>
      </div>` : '<div class="card empty">운동 기록이 쌓이면 종목별 성장 그래프가 표시됩니다.</div>'}
      <h2>근력 기준 발달도 평가</h2>
      <div class="card">${assessRows ? `<table class="data"><thead><tr><th>부위</th><th>기준 종목</th><th>추정 1RM</th><th>평가</th><th></th></tr></thead><tbody>${assessRows}</tbody></table>
        <button class="btn small" style="margin-top:10px" data-action="apply-assess">평가 결과를 발달도에 적용</button>`
        : '<div class="sub">벤치프레스·스쿼트·오버헤드프레스·바벨로우·랫풀다운·RDL·힙쓰러스트·EZ바컬·클로즈그립벤치 기록이 생기면 체중 대비 근력으로 발달도를 자동 평가합니다.</div>'}</div>`;
  }

  // 단일 시계열 라인 차트 (SVG) + 호버 툴팁
  function lineChart(series) {
    if (series.length < 2) return '<div class="sub" style="padding:20px 0">2회 이상 기록되면 그래프가 표시됩니다.</div>';
    const W = 560, H = 220, L = 40, R = 46, T = 14, B = 28;
    const xs = series.map((p) => new Date(p.date).getTime());
    const ys = series.map((p) => p.e1rm);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    let y0 = Math.min(...ys), y1 = Math.max(...ys);
    const padY = Math.max(2, (y1 - y0) * 0.15);
    y0 = Math.max(0, Math.floor((y0 - padY) / 5) * 5); y1 = Math.ceil((y1 + padY) / 5) * 5;
    const X = (t) => L + ((t - x0) / (x1 - x0 || 1)) * (W - L - R);
    const Y = (v) => T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B);
    const ticks = [0, 1, 2, 3].map((k) => y0 + ((y1 - y0) * k) / 3);
    const pts = series.map((p, k) => [X(xs[k]), Y(p.e1rm)]);
    const path = pts.map((p, k) => (k ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('');
    const last = pts[pts.length - 1];
    const fmtD = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };
    window.__chart = { pts, series };
    return `<div class="chart-wrap" id="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="추정 1RM 추이">
      ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" stroke="#383836" stroke-width="1"/>
        <text x="${L - 6}" y="${Y(t) + 4}" fill="#8d8c84" font-size="11" text-anchor="end">${Math.round(t)}</text>`).join('')}
      <text x="${L}" y="${H - 8}" fill="#8d8c84" font-size="11">${fmtD(x0)}</text>
      <text x="${W - R}" y="${H - 8}" fill="#8d8c84" font-size="11" text-anchor="end">${fmtD(x1)}</text>
      <path d="${path}" fill="none" stroke="#3987e5" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#3987e5" stroke="#1a1a19" stroke-width="2"/>`).join('')}
      <text x="${last[0] + 8}" y="${last[1] + 4}" fill="#f0efec" font-size="12" font-weight="700">${series[series.length - 1].e1rm}</text>
      <line id="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="#c3c2b7" stroke-width="1" stroke-dasharray="3 3" visibility="hidden"/>
      <circle id="hoverDot" r="6" fill="#3987e5" stroke="#f0efec" stroke-width="2" visibility="hidden"/>
      <rect id="hit" x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent"/>
    </svg><div class="tooltip hidden" id="tip"></div></div>`;
  }
  function bindChart() {
    const wrap = $('#chart');
    if (!wrap || !window.__chart) return;
    const svg = wrap.querySelector('svg'), tip = $('#tip'), cross = $('#cross'), dot = $('#hoverDot');
    const { pts, series } = window.__chart;
    const move = (ev) => {
      const e = ev.touches ? ev.touches[0] : ev;
      const r = svg.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 560;
      let k = 0;
      pts.forEach((p, i) => { if (Math.abs(p[0] - x) < Math.abs(pts[k][0] - x)) k = i; });
      const [px, py] = pts[k], p = series[k];
      cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.setAttribute('visibility', 'visible');
      tip.innerHTML = `<b>${fmtDate(p.date)}</b> · ${CONCEPTS[p.concept].name}<br>1RM ${p.e1rm}kg · 최고 ${p.top}kg<br><span class="muted">${p.sets}</span>`;
      tip.style.left = Math.min(Math.max((px / 560) * r.width, 70), r.width - 70) + 'px';
      tip.style.top = (py / 220) * r.height + 'px';
      tip.classList.remove('hidden');
    };
    const leave = () => { tip.classList.add('hidden'); cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); };
    const hit = $('#hit');
    hit.addEventListener('mousemove', move);
    hit.addEventListener('touchstart', move, { passive: true });
    hit.addEventListener('touchmove', move, { passive: true });
    hit.addEventListener('mouseleave', leave);
  }

  /* ---------- 설정 ---------- */
  function viewSettings() {
    const p = state.profile;
    const n = E.nutrition(p, state.ui.concept);
    const devRows = Object.entries(MUSCLES).map(([m, info]) => `
      <div class="dev-row"><div>${info.name}</div>
        <input type="range" min="1" max="5" step="1" value="${state.dev[m]}" data-dev="${m}">
        <div class="lbl" id="devl-${m}">${DEV_LABELS[state.dev[m]]}</div></div>`).join('');

    const exGroups = Object.entries(MUSCLES).map(([m, info]) => {
      const list = E.allExercises(state).filter((e) => e.muscle === m);
      return `<details class="group"><summary>${info.name} <span class="sub">(${list.length})</span></summary>
        <div class="ex-setting sub"><div>종목</div><div>증량kg</div><div>시작kg</div><div>⭐</div><div>제외</div></div>
        ${list.map((e) => {
          const s = state.exSettings[e.id] || {};
          const custom = e.custom ? ` <button class="tog" data-action="del-custom" data-id="${esc(e.id)}" title="삭제">🗑</button>` : '';
          return `<div class="ex-setting ${s.excluded ? 'off' : ''}"><div class="nm">${esc(e.name)}${custom}</div>
            <input inputmode="decimal" data-exset="inc" data-id="${esc(e.id)}" placeholder="${e.inc}" value="${s.inc || ''}">
            <input inputmode="decimal" data-exset="startWeight" data-id="${esc(e.id)}" placeholder="자동" value="${s.startWeight || ''}">
            <button class="tog" data-action="ex-fav" data-id="${esc(e.id)}">${s.fav ? '⭐' : '☆'}</button>
            <button class="tog" data-action="ex-excl" data-id="${esc(e.id)}">${s.excluded ? '🚫' : '✅'}</button></div>`;
        }).join('')}</details>`;
    }).join('');

    const muscleOpts = Object.entries(MUSCLES).map(([k, m]) => `<option value="${k}">${m.name}</option>`).join('');
    return `<h2>프로필</h2>
      <div class="card"><div class="grid2">
        <label class="field">키 (cm)<input data-profile="height" inputmode="decimal" value="${p.height}"></label>
        <label class="field">체중 (kg)<input data-profile="weight" inputmode="decimal" value="${p.weight}"></label>
        <label class="field">출생년도<input data-profile="birthYear" inputmode="numeric" value="${p.birthYear}"></label>
        <label class="field">성별<select data-profile="sex"><option value="M" ${p.sex === 'M' ? 'selected' : ''}>남성</option><option value="F" ${p.sex === 'F' ? 'selected' : ''}>여성</option></select></label>
        <label class="field">운동 경력<select data-profile="level">${Object.entries(LEVELS).map(([k, l]) => `<option value="${k}" ${p.level === k ? 'selected' : ''}>${l.name}</option>`).join('')}</select></label>
        <label class="field">활동량<select data-profile="activity">${[[1.375, '주 1~3회'], [1.55, '주 3~5회'], [1.725, '주 6~7회']].map(([v, t]) => `<option value="${v}" ${p.activity == v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      </div></div>
      <div class="card"><h3>영양 가이드 (${n.age}세 기준 추정)</h3>
        <div class="kv">
          <div><b>${n.bmi.toFixed(1)}</b><span>BMI</span></div>
          <div><b>${Math.round(n.bmr)}</b><span>기초대사량 kcal</span></div>
          <div><b>${Math.round(n.tdee)}</b><span>유지 칼로리 kcal</span></div>
          <div><b>${Math.round(n.bulk)}</b><span>근성장(린벌크) kcal</span></div>
          <div><b>${Math.round(n.cut)}</b><span>다이어트 kcal</span></div>
          <div><b>${Math.round(n.protein[0])}~${Math.round(n.protein[1])}g</b><span>단백질/일</span></div>
        </div>
        <div class="sub" style="margin-top:8px">Mifflin-St Jeor 공식 기반 추정치입니다. 2주간 체중 변화를 보며 ±200kcal씩 조정하세요. 린벌크는 주당 체중 0.25~0.5% 증가가 목표.</div></div>

      <h2>부위별 근육 발달도</h2>
      <div class="card">${devRows}
        <div class="sub" style="margin-top:8px">약함으로 설정한 부위는 루틴 앞쪽에 배치되고 세트가 최대 1.5배까지 늘어납니다. 발달한 부위는 유지 볼륨으로 줄어듭니다. 성장 탭에서 기록 기반 자동 평가도 가능합니다.</div></div>

      <h2>종목 설정</h2>
      <div class="card"><div class="sub">⭐ 즐겨찾기 = 루틴에 우선 포함 · 제외 = 루틴에 안 나옴 · 증량 단위와 첫 시작 무게를 직접 지정할 수 있습니다.</div>${exGroups}</div>

      <h2>나만의 종목 추가</h2>
      <div class="card">
        <label class="field">종목 이름<input id="cxName" placeholder="예: 스미스 머신 인클라인 프레스"></label>
        <div class="grid2">
          <label class="field">주동근<select id="cxMuscle">${muscleOpts}</select></label>
          <label class="field">유형<select id="cxType"><option value="compound">다관절</option><option value="isolation">고립</option></select></label>
          <label class="field">장비<select id="cxEquip"><option value="machine">머신</option><option value="cable">케이블</option><option value="barbell">바벨</option><option value="dumbbell">덤벨(한 손)</option><option value="bodyweight">맨몸</option></select></label>
          <label class="field">증량 단위(kg)<input id="cxInc" inputmode="decimal" value="2.5"></label>
        </div>
        <label class="field">시작 무게(kg)<input id="cxStart" inputmode="decimal" placeholder="첫 루틴에 사용할 무게"></label>
        <button class="btn" data-action="add-custom">추가</button>
      </div>

      <h2>데이터</h2>
      <div class="card row wrap">
        <button class="btn ghost" data-action="export">백업 내보내기</button>
        <label class="btn ghost" style="display:inline-block">백업 불러오기<input type="file" accept="application/json" id="importFile" hidden></label>
        <button class="btn danger" data-action="reset">전체 초기화</button>
      </div>
      <div class="sub" style="text-align:center;margin:16px 0">데이터는 이 기기의 브라우저에만 저장됩니다. 정기적으로 백업하세요.</div>`;
  }

  /* ---------- 이벤트 ---------- */
  document.addEventListener('click', (ev) => {
    const tabBtn = ev.target.closest('[data-tab]');
    if (tabBtn) { tab = tabBtn.dataset.tab; render(); window.scrollTo(0, 0); return; }
    if (ev.target.id === 'modal') return closeModal();
    const el = ev.target.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    const i = +el.dataset.i, j = +el.dataset.j;
    const s = state.active;
    const ui = state.ui;

    switch (a) {
      case 'toggle-muscle': {
        const m = el.dataset.m;
        ui.muscles = ui.muscles.includes(m) ? ui.muscles.filter((x) => x !== m) : ui.muscles.concat(m);
        break;
      }
      case 'apply-preset': ui.muscles = PRESETS[+el.dataset.p].muscles.slice(); break;
      case 'concept': ui.concept = el.dataset.c; break;
      case 'minutes': ui.minutes = +el.dataset.v; break;
      case 'generate': return generate();
      case 'w-step': {
        const ex = E.getEx(state, s.items[i].exId);
        const inc = ex ? E.incOf(state, ex) : 2.5;
        setField(i, j, 'w', Math.max(0, s.items[i].sets[j].w + inc * +el.dataset.d));
        break;
      }
      case 'r-step': setField(i, j, 'r', s.items[i].sets[j].r + +el.dataset.d); break;
      case 'toggle-set': return toggleSet(i, j);
      case 'set-add': {
        const sets = s.items[i].sets;
        const lastSet = sets[sets.length - 1] || { w: 0, r: s.items[i].range[0], target: s.items[i].range[0] };
        sets.push({ w: lastSet.w, r: lastSet.target, target: lastSet.target, done: false });
        break;
      }
      case 'set-del': if (s.items[i].sets.length > 1) s.items[i].sets.pop(); break;
      case 'move-up': if (i > 0) [s.items[i - 1], s.items[i]] = [s.items[i], s.items[i - 1]]; break;
      case 'remove-ex': if (confirm(`${exName(s.items[i].exId)} 을(를) 삭제할까요?`)) s.items.splice(i, 1); break;
      case 'swap': return swapModal(i);
      case 'pick-swap': {
        const old = s.items[i];
        const it = E.makeItem(state, E.getEx(state, el.dataset.id), s.concept, old.sets.length);
        it.superset = old.superset;
        s.items[i] = it;
        closeModal();
        break;
      }
      case 'add-ex': return addModal();
      case 'pick-add': {
        // 모달은 열어둔 채 연속 추가
        const ex = E.getEx(state, el.dataset.id);
        if (s.items.some((x) => x.exId === ex.id)) return toast('이미 추가된 종목입니다');
        s.items.push(E.makeItem(state, ex, s.concept));
        save(); render(); renderAddList();
        return toast(`✓ ${ex.name} 추가`);
      }
      case 'add-filter':
        addUI[el.dataset.k] = addUI[el.dataset.k] === el.dataset.v ? '' : el.dataset.v;
        addUI.creating = false;
        renderAddFilters(); renderAddList();
        return;
      case 'create-open': addUI.creating = true; return renderAddList();
      case 'create-cancel': addUI.creating = false; return renderAddList();
      case 'create-save': {
        const name = $('#nxName').value.trim();
        if (!name) return toast('종목 이름을 입력하세요');
        const ex = createCustom({ name, muscle: $('#nxMuscle').value, type: $('#nxType').value, equip: $('#nxEquip').value,
          inc: num($('#nxInc').value), start: num($('#nxStart').value) });
        s.items.push(E.makeItem(state, ex, s.concept));
        addUI.creating = false;
        save(); render(); renderAddList();
        return toast(`✓ ${name} 만들고 추가`);
      }
      case 'start-empty':
        state.active = E.emptySession(state, ui.concept);
        save(); render(); window.scrollTo(0, 0);
        return addModal();
      case 'repeat': {
        const prev = state.sessions.find((x) => x.id === el.dataset.id);
        if (!prev) return;
        state.active = E.repeatSession(state, prev, ui.concept);
        save(); render(); window.scrollTo(0, 0);
        return toast(`${CONCEPTS[ui.concept].name} 기준으로 무게/반복을 새로 처방했습니다`);
      }
      case 'finish': return finish();
      case 'cancel-session':
        if (!confirm('진행 중인 루틴을 취소할까요? (기록되지 않습니다)')) return;
        state.active = null; stopRest();
        break;
      case 'rest-add': rest.end += 15000; rest.total += 15; rest.alerted = false; $('#restBar').classList.remove('over'); return;
      case 'rest-skip': return stopRest();
      case 'close-modal': closeModal(); break;
      case 'del-session':
        if (!confirm('이 기록을 삭제할까요?')) return;
        state.sessions = state.sessions.filter((x) => x.id !== el.dataset.id);
        break;
      case 'apply-assess': {
        const res = E.assessDevelopment(state);
        Object.entries(res).forEach(([m, r]) => { state.dev[m] = r.level; });
        toast('발달도가 업데이트되었습니다');
        break;
      }
      case 'ex-fav': case 'ex-excl': {
        const id = el.dataset.id;
        const st = (state.exSettings[id] = state.exSettings[id] || {});
        if (a === 'ex-fav') st.fav = !st.fav; else st.excluded = !st.excluded;
        break;
      }
      case 'add-custom': {
        const name = $('#cxName').value.trim();
        if (!name) return toast('종목 이름을 입력하세요');
        createCustom({ name, muscle: $('#cxMuscle').value, type: $('#cxType').value, equip: $('#cxEquip').value,
          inc: num($('#cxInc').value), start: num($('#cxStart').value) });
        toast(`${name} 추가됨`);
        break;
      }
      case 'del-custom':
        if (!confirm('이 종목을 삭제할까요? (기존 기록의 이름은 표시되지 않습니다)')) return;
        state.customExercises = state.customExercises.filter((x) => x.id !== el.dataset.id);
        break;
      case 'export': {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `grow-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        return;
      }
      case 'reset':
        if (!confirm('모든 기록과 설정을 삭제합니다. 계속할까요?')) return;
        state = defaults();
        stopRest();
        break;
      default: return;
    }
    save(); render();
  });

  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.dataset.field && state.active) {
      // 다시 그리지 않음: 입력 직후 ✓ 탭이 사라진 버튼에 떨어지는 문제 방지
      const i = +t.dataset.i, j = +t.dataset.j;
      setField(i, j, t.dataset.field, t.value);
      const sets = state.active.items[i].sets;
      document.querySelectorAll(`input[data-field="${t.dataset.field}"][data-i="${i}"]`).forEach((inp) => {
        inp.value = sets[+inp.dataset.j][t.dataset.field];
      });
      return;
    }
    if (t.dataset.profile) {
      const k = t.dataset.profile;
      state.profile[k] = ['sex', 'level'].includes(k) ? t.value : num(t.value);
      save(); render(); return;
    }
    if (t.dataset.dev) { state.dev[t.dataset.dev] = +t.value; save(); return; }
    if (t.dataset.exset) {
      const st = (state.exSettings[t.dataset.id] = state.exSettings[t.dataset.id] || {});
      st[t.dataset.exset] = num(t.value) || undefined;
      save(); return;
    }
    if (t.dataset.actionChange === 'progress-ex') { progressEx = t.value; render(); return; }
    if (t.dataset.actionChange === 'concept-change' && state.active) {
      E.changeConcept(state, state.active, t.value);
      state.ui.concept = t.value;
      save(); render();
      toast(`${CONCEPTS[t.value].name} 컨셉으로 변경 · 시작 전 종목은 다시 처방됨`);
      return;
    }
    if (t.id === 'importFile' && t.files[0]) {
      t.files[0].text().then((txt) => {
        try {
          const data = JSON.parse(txt);
          if (!data.profile || !Array.isArray(data.sessions)) throw new Error('형식 오류');
          if (!confirm(`기록 ${data.sessions.length}개를 불러옵니다. 현재 데이터는 덮어씌워집니다.`)) return;
          localStorage.setItem(KEY, JSON.stringify(data));
          state = load(); render(); toast('불러오기 완료');
        } catch (e) { toast('올바른 백업 파일이 아닙니다'); }
      });
    }
  });
  // 발달도 슬라이더 라벨 실시간 갱신
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.dataset.dev) $('#devl-' + t.dataset.dev).textContent = DEV_LABELS[+t.value];
  });
  // 입력칸 터치 시 전체 선택 → 바로 숫자 입력
  // 접이식 영역 열림 상태 기억 (toggle 이벤트는 버블링되지 않아 캡처 사용)
  document.addEventListener('toggle', (ev) => {
    const k = ev.target.dataset && ev.target.dataset.details;
    if (k) { state.ui[k] = ev.target.open; save(); }
  }, true);
  document.addEventListener('focusin', (ev) => { if (ev.target.dataset && ev.target.dataset.field) ev.target.select(); });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  render();
})();
