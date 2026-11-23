/* 루틴 생성 · 점진적 과부하 · 분석 엔진 (UI 없음, 순수 함수) */
(function (root) {
  const D = typeof module !== 'undefined' && module.exports ? require('./data.js') : root.DATA;
  const { MUSCLES, EXERCISES, CONCEPTS, STANDARDS, LEVELS } = D;

  const DAY = 86400000;
  // 발달도(1~5) → 볼륨 배분 배수. 약한 부위일수록 더 많은 세트.
  const DEV_FACTOR = { 1: 1.5, 2: 1.25, 3: 1.0, 4: 0.8, 5: 0.65 };
  // 발달도별 주간 목표 세트 [최소, 최대]
  const WEEKLY_TARGET = { 1: [14, 20], 2: [12, 18], 3: [10, 16], 4: [8, 12], 5: [6, 10] };

  /* ---------- 기본 헬퍼 ---------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const devOf = (state, m) => (state.dev && state.dev[m]) || 3;

  function allExercises(state) {
    return EXERCISES.concat(state.customExercises || []);
  }
  function getEx(state, id) {
    return allExercises(state).find((e) => e.id === id);
  }
  function exSetting(state, id) {
    return (state.exSettings && state.exSettings[id]) || {};
  }
  function incOf(state, ex) {
    const s = exSetting(state, ex.id);
    return s.inc > 0 ? s.inc : ex.inc;
  }
  function minWeight(ex, inc) {
    if (ex.min != null) return ex.min;
    if (ex.equip === 'bodyweight') return 0;
    if (ex.equip === 'barbell') return 20;
    if (ex.equip === 'dumbbell') return 2;
    return inc;
  }
  function roundW(state, ex, w) {
    const inc = incOf(state, ex);
    const r = Math.round(w / inc) * inc;
    return Math.max(minWeight(ex, inc), +r.toFixed(2));
  }

  // 맨몸 종목은 체중 + 추가중량을 실제 부하로 사용
  const loadOf = (ex, w, bw) => (ex.equip === 'bodyweight' ? bw + w : w);
  // Epley 공식 1RM 추정
  function e1rm(load, reps) {
    if (!(reps > 0) || !(load > 0)) return 0;
    return reps === 1 ? load : load * (1 + reps / 30);
  }
  // 목표 반복수 + RIR 로 수행 가능한 무게
  const weightForReps = (oneRm, reps, rir) => oneRm / (1 + (reps + rir) / 30);

  /* ---------- 기록 조회 ---------- */
  function finishedSessions(state) {
    return (state.sessions || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  // 특정 종목의 과거 수행 기록 (최신순). 완료한 세트만.
  function history(state, exId) {
    const out = [];
    for (const s of finishedSessions(state)) {
      for (const it of s.items) {
        if (it.exId !== exId) continue;
        const done = it.sets.filter((x) => x.done && x.r > 0);
        if (done.length) out.push({ session: s, item: it, sets: done });
      }
    }
    return out;
  }

  function bestE1rm(state, ex, entry) {
    const bw = state.profile.weight;
    return Math.max(0, ...entry.sets.map((s) => e1rm(loadOf(ex, s.w, bw), s.r)));
  }

  /* ---------- 점진적 과부하 처방 ---------- */
  /*
   * 더블 프로그레션:
   *  1) 같은 컨셉으로 수행한 직전 기록이 있으면
   *     - 모든 세트가 반복 상한 달성 → 증량, 반복은 하한부터 다시
   *     - 모든 세트가 하한 이상     → 같은 무게, 세트별 +1회
   *     - 하한 미달                → 같은 무게 재도전, 2회 연속 미달이면 10% 디로드
   *     - 21일 이상 공백           → 10% 보정
   *  2) 다른 컨셉 기록만 있으면 추정 1RM 으로 환산
   *  3) 기록이 없으면 체중·숙련도 기반 초기 추정
   */
  function prescribe(state, ex, conceptKey, now = new Date()) {
    const C = CONCEPTS[conceptKey];
    const type = ex.type;
    const range = C.reps[type];
    const nSets = C.sets[type];
    const rest = C.rest[type];
    const inc = incOf(state, ex);
    const bw = state.profile.weight;
    const hist = history(state, ex.id);
    const same = hist.filter((h) => h.session.concept === conceptKey);
    const isBW = ex.equip === 'bodyweight';

    let weight, targets, reason, source;

    if (same.length) {
      const last = same[0];
      const topW = Math.max(...last.sets.map((s) => s.w));
      const working = last.sets.filter((s) => s.w === topW);
      const reps = working.map((s) => s.r);
      const planned = last.item.sets.length;
      const completedAll = working.length >= Math.min(planned, nSets);
      const minR = Math.min(...reps);
      const fmt = `${topW}kg × ${reps.join('/')}`;

      if (completedAll && minR >= range[1]) {
        weight = topW + inc;
        targets = Array(nSets).fill(range[0]);
        reason = `지난 기록 ${fmt} — 모든 세트 상한(${range[1]}회) 달성 → +${inc}kg 증량`;
        source = 'up';
      } else if (minR >= range[0]) {
        weight = topW;
        targets = Array.from({ length: nSets }, (_, i) => Math.min(range[1], (reps[i] ?? reps[reps.length - 1]) + 1));
        reason = `지난 기록 ${fmt} — 같은 무게로 세트당 +1회 도전`;
        source = 'reps';
      } else {
        const prev = same[1];
        const prevFailed = prev && Math.max(...prev.sets.map((s) => s.w)) >= topW &&
          Math.min(...prev.sets.filter((s) => s.w === Math.max(...prev.sets.map((x) => x.w))).map((s) => s.r)) < range[0];
        if (prevFailed) {
          weight = topW * 0.9;
          targets = Array(nSets).fill(range[0] + 1);
          reason = `2회 연속 하한(${range[0]}회) 미달 → 10% 디로드 후 다시 쌓기`;
          source = 'deload';
        } else {
          weight = topW;
          targets = Array(nSets).fill(range[0]);
          reason = `지난 기록 ${fmt} — 하한 미달, 같은 무게로 재도전`;
          source = 'retry';
        }
      }
      const gap = (now - new Date(last.session.date)) / DAY;
      if (gap > 21) {
        weight *= 0.9;
        reason += ` · ${Math.floor(gap)}일 공백으로 10% 보정`;
      }
    } else if (hist.length) {
      const oneRm = Math.max(...hist.slice(0, 3).map((h) => bestE1rm(state, ex, h)));
      const load = weightForReps(oneRm, range[0], C.rir) * C.intensity;
      weight = isBW ? load - bw : load;
      targets = Array(nSets).fill(range[0]);
      reason = `다른 컨셉 기록의 추정 1RM ${oneRm.toFixed(1)}kg 기준으로 ${range[0]}회용 무게 환산`;
      source = 'convert';
    } else {
      const st = exSetting(state, ex.id);
      targets = Array(nSets).fill(range[0]);
      if (st.startWeight > 0) {
        weight = st.startWeight;
        reason = '설정한 시작 무게 사용';
      } else if (isBW) {
        weight = 0;
        reason = '맨몸으로 시작 — 모든 세트 상한 달성 시 중량 추가';
      } else {
        const lv = (LEVELS[state.profile.level] || LEVELS.intermediate).factor;
        // ratio 는 'RIR 2 로 10회' 기준 → 추정 1RM
        const oneRm = bw * ex.ratio * lv * (1 + 12 / 30);
        weight = weightForReps(oneRm, range[0], C.rir) * C.intensity;
        reason = '첫 수행: 체중·숙련도 기반 추정치. 첫 세트 후 무게를 조정하세요';
      }
      source = 'new';
    }

    weight = roundW(state, ex, Math.max(0, weight));
    return { weight, targets, range, sets: nSets, rest, reason, source };
  }

  /* ---------- 종목 점수 (컨셉·숙련도·선호도) ---------- */
  function recentUse(state, exId, n = 4) {
    return finishedSessions(state).slice(0, n).some((s) => s.items.some((i) => i.exId === exId));
  }

  function scoreEx(state, ex, conceptKey) {
    const C = CONCEPTS[conceptKey];
    const p = C.pref;
    const st = exSetting(state, ex.id);
    let s = 0;
    s += p.compound * (ex.type === 'compound' ? 1 : 0);
    s += (p.stim * (ex.stim - 3)) / 2;
    s += (p.pump * (ex.pump - 3)) / 2;
    s -= (p.fatigue * (ex.fatigue - 2)) / 2;
    if (ex.main && p.compound >= 3) s += 1.5;
    if (st.fav) s += 2.5;
    // 같은 종목을 꾸준히 해야 점진적 과부하가 쌓이므로 최근 수행 종목 우대
    if (recentUse(state, ex.id)) s += 1.5;
    if (state.profile.level === 'beginner') {
      if (ex.equip === 'machine' || ex.equip === 'cable') s += 0.75;
      if (ex.fatigue >= 5) s -= 2;
    }
    if (ex.fatigue >= 5 && conceptKey !== 'strength') s -= 1; // 데드/스쿼트는 근력일 외엔 후순위
    return s;
  }

  function candidates(state, muscle, conceptKey, exclude = new Set()) {
    return allExercises(state)
      .filter((e) => e.muscle === muscle && !exSetting(state, e.id).excluded && !exclude.has(e.id))
      .map((e) => ({ ex: e, score: scoreEx(state, e, conceptKey) }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.ex);
  }

  /* ---------- 루틴 생성 ---------- */
  function setBudget(conceptKey, minutes) {
    const C = CONCEPTS[conceptKey];
    const avgRest = (C.rest.compound + C.rest.isolation) / 2;
    let sec = minutes * 60 - 8 * 60; // 워밍업 8분
    if (C.cardio) sec -= 20 * 60;
    let budget = sec / (40 + avgRest);
    if (C.superset) budget *= 1.35; // 슈퍼세트는 휴식을 공유
    return clamp(Math.round(budget), 6, 32);
  }

  function makeItem(state, ex, conceptKey, nSets, now) {
    const p = prescribe(state, ex, conceptKey, now);
    const n = nSets || p.sets;
    const targets = Array.from({ length: n }, (_, i) => p.targets[i] ?? p.targets[p.targets.length - 1]);
    return {
      exId: ex.id,
      muscle: ex.muscle,
      type: ex.type,
      range: p.range,
      rest: p.rest,
      reason: p.reason,
      source: p.source,
      sets: targets.map((t) => ({ w: p.weight, r: t, target: t, done: false })),
    };
  }

  function generateRoutine(state, { muscles, concept, minutes = 60 }, now = new Date()) {
    const C = CONCEPTS[concept];
    const budget = setBudget(concept, minutes);

    // 약한 부위 우선 (우선순위 원칙), 같은 발달도면 큰 근육 먼저
    const ordered = muscles.slice().sort((a, b) => devOf(state, a) - devOf(state, b) || MUSCLES[b].size - MUSCLES[a].size);
    const weights = ordered.map((m) => MUSCLES[m].size * DEV_FACTOR[devOf(state, m)]);
    const total = weights.reduce((a, b) => a + b, 0);

    const used = new Set();
    const items = [];
    ordered.forEach((m, idx) => {
      const dev = devOf(state, m);
      const cap = dev <= 2 ? 14 : dev >= 4 ? 8 : 10;
      let remaining = clamp(Math.round((budget * weights[idx]) / total), 2, cap);
      const pool = candidates(state, m, concept, used).map((ex) => ({ ex, score: scoreEx(state, ex, concept) }));
      const picked = [];
      const patterns = new Set();
      while (remaining > 0 && pool.length) {
        // 이미 고른 움직임 패턴과 겹치면 감점 → 다양한 각도로 자극
        pool.forEach((c) => { c.adj = c.score - (c.ex.pattern && patterns.has(c.ex.pattern) ? 3 : 0); });
        pool.sort((a, b) => b.adj - a.adj);
        const ex = pool.shift().ex;
        if (ex.pattern) patterns.add(ex.pattern);
        const per = C.sets[ex.type];
        let n = Math.min(remaining, per);
        if (n < 2 && picked.length) {
          const last = picked[picked.length - 1];
          if (last.n < C.sets[last.ex.type]) last.n += n;
          break;
        }
        picked.push({ ex, n });
        used.add(ex.id);
        remaining -= n;
      }
      // 자극위주: 고립 → 다관절 (선피로), 그 외: 다관절 → 고립
      picked.sort((a, b) => {
        const ca = a.ex.type === 'compound' ? 0 : 1, cb = b.ex.type === 'compound' ? 0 : 1;
        return concept === 'stimulus' ? cb - ca : ca - cb;
      });
      picked.forEach(({ ex, n }) => items.push(makeItem(state, ex, concept, n, now)));
    });

    if (C.superset) assignSupersets(items);
    if (concept === 'pump') items.forEach((it) => { if (it.type === 'isolation') it.sets[it.sets.length - 1].drop = true; });

    const notes = [C.tip];
    if (C.technique) notes.push(C.technique);
    if (concept === 'stimulus') notes.push('선피로 기법: 고립 종목으로 타깃 근육을 먼저 지치게 한 뒤 다관절 종목을 수행합니다.');
    if (C.cardio) notes.push(C.cardio);

    const first = items.find((i) => i.type === 'compound') || items[0];
    const warmup = first && first.sets[0].w > 0
      ? { exId: first.exId, sets: [[0.5, 10], [0.7, 5], [0.85, 2]].map(([p, r]) => ({ w: roundW(state, getEx(state, first.exId), first.sets[0].w * p), r })) }
      : null;

    return {
      id: 's' + now.getTime(),
      date: now.toISOString(),
      concept,
      muscles,
      minutes,
      budget,
      items,
      notes,
      warmup,
    };
  }

  // 다른 근육끼리 짝지어 슈퍼세트(A1/A2) 지정
  function assignSupersets(items) {
    const free = items.map((_, i) => i);
    let label = 0;
    while (free.length > 1) {
      const a = free.shift();
      const j = free.findIndex((k) => items[k].muscle !== items[a].muscle);
      if (j < 0) break;
      const b = free.splice(j, 1)[0];
      const L = String.fromCharCode(65 + label++);
      items[a].superset = L + '1';
      items[b].superset = L + '2';
    }
    // 짝지은 항목이 붙어 있도록 재정렬
    const order = items.slice().sort((x, y) => {
      const kx = x.superset || 'Z', ky = y.superset || 'Z';
      return kx < ky ? -1 : kx > ky ? 1 : 0;
    });
    items.splice(0, items.length, ...order);
  }

  /* ---------- 직접 기록 모드 ---------- */
  function emptySession(state, concept, now = new Date()) {
    return { id: 's' + now.getTime(), date: now.toISOString(), concept, muscles: [], items: [], notes: sessionNotes(concept), manual: true };
  }
  function sessionNotes(concept) {
    const C = CONCEPTS[concept];
    return [C.tip, C.technique, C.cardio].filter(Boolean);
  }
  // 이전 세션의 종목 구성을 그대로 가져오되, 무게/반복은 새로 처방
  function repeatSession(state, prev, concept, now = new Date()) {
    const s = emptySession(state, concept, now);
    for (const it of prev.items) {
      const ex = getEx(state, it.exId);
      if (ex) s.items.push(makeItem(state, ex, concept, Math.max(it.sets.length, CONCEPTS[concept].sets[ex.type]), now));
    }
    return s;
  }
  // 세션 안에서 첫 다관절 종목 기준 워밍업 세트
  function warmupFor(state, session) {
    const first = session.items.find((i) => i.type === 'compound' && i.sets[0] && i.sets[0].w >= 20);
    if (!first) return null;
    const ex = getEx(state, first.exId);
    return { exId: first.exId, sets: [[0.5, 10], [0.7, 5], [0.85, 2]].map(([p, r]) => ({ w: roundW(state, ex, first.sets[0].w * p), r })) };
  }
  // 세션 컨셉 변경: 아직 한 세트도 안 한 종목만 다시 처방
  function changeConcept(state, session, concept, now = new Date()) {
    session.concept = concept;
    session.notes = sessionNotes(concept);
    session.items = session.items.map((it) => {
      if (it.sets.some((x) => x.done)) return it;
      const ex = getEx(state, it.exId);
      if (!ex) return it;
      const n = makeItem(state, ex, concept, null, now);
      n.superset = it.superset;
      return n;
    });
  }

  /* ---------- 종목 검색 ---------- */
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function chosung(str) {
    return Array.from(str).map((ch) => {
      const c = ch.charCodeAt(0) - 0xac00;
      return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch;
    }).join('');
  }
  const norm = (s) => String(s).toLowerCase().replace(/\s+/g, '');
  const isChoOnly = (q) => q.length > 0 && Array.from(q).every((ch) => CHO.includes(ch));

  // 최근·자주 한 종목 순위 (최근 10세션 빈도 + 최신성)
  function usageScore(state) {
    const score = {};
    finishedSessions(state).slice(0, 20).forEach((s, k) => {
      s.items.forEach((it) => { score[it.exId] = (score[it.exId] || 0) + 1 + (20 - k) / 20; });
    });
    return score;
  }

  function searchExercises(state, { q = '', muscle = '', equip = '' } = {}) {
    const nq = norm(q);
    const cho = isChoOnly(nq);
    const usage = usageScore(state);
    return allExercises(state)
      .filter((e) => (!muscle || e.muscle === muscle) && (!equip || e.equip === equip))
      .map((e) => {
        if (!nq) return { ex: e, rank: 0 };
        const name = norm(e.name);
        let rank = -1;
        if (name.startsWith(nq)) rank = 3;
        else if (name.includes(nq)) rank = 2;
        else if (norm(e.alias || '').includes(nq) || norm(MUSCLES[e.muscle]?.name || '') === nq) rank = 1;
        else if (cho && chosung(name).includes(nq)) rank = 1.5;
        return { ex: e, rank };
      })
      .filter((x) => x.rank >= 0)
      .sort((a, b) => b.rank - a.rank || (usage[b.ex.id] || 0) - (usage[a.ex.id] || 0) || (b.ex.main ? 1 : 0) - (a.ex.main ? 1 : 0))
      .map((x) => x.ex);
  }

  function recentExercises(state, n = 12) {
    const usage = usageScore(state);
    return Object.keys(usage).sort((a, b) => usage[b] - usage[a]).map((id) => getEx(state, id)).filter(Boolean).slice(0, n);
  }

  function lastRecord(state, exId) {
    const h = history(state, exId)[0];
    return h ? { date: h.session.date, sets: h.sets } : null;
  }

  function alternatives(state, session, item) {
    const inSession = new Set(session.items.map((i) => i.exId));
    return candidates(state, item.muscle, session.concept, inSession);
  }

  /* ---------- 분석 ---------- */
  function weeklyVolume(state, now = new Date()) {
    const vol = Object.fromEntries(Object.keys(MUSCLES).map((m) => [m, 0]));
    for (const s of state.sessions || []) {
      if (now - new Date(s.date) > 7 * DAY) continue;
      for (const it of s.items) {
        const ex = getEx(state, it.exId);
        if (!ex) continue;
        const n = it.sets.filter((x) => x.done).length;
        vol[ex.muscle] += n;
        (ex.secondary || []).forEach((m) => { if (m in vol) vol[m] += n * 0.5; });
      }
    }
    return vol;
  }

  function weeklyTarget(state, m) {
    return WEEKLY_TARGET[devOf(state, m)];
  }

  function lastTrained(state, m) {
    for (const s of finishedSessions(state)) {
      if (s.items.some((it) => it.muscle === m && it.sets.some((x) => x.done))) return new Date(s.date);
    }
    return null;
  }

  // 회복 상태·주간 볼륨 부족분·약점 여부로 오늘 할 부위 프리셋 추천
  function recommend(state, now = new Date()) {
    const vol = weeklyVolume(state, now);
    const scoreMuscle = (m) => {
      const lt = lastTrained(state, m);
      const hours = lt ? (now - lt) / 3600000 : 999;
      const ready = Math.min(hours / MUSCLES[m].recovery, 1.5);
      const [lo, hi] = weeklyTarget(state, m);
      const deficit = Math.max(0, (lo + hi) / 2 - vol[m]);
      return { m, ready, deficit, score: (ready < 1 ? -2 : ready) + deficit / 8 + (3 - devOf(state, m)) * 0.25 };
    };
    const ranked = D.PRESETS.slice(0, 5).map((p) => {
      const parts = p.muscles.map(scoreMuscle);
      const blocked = parts.filter((x) => x.ready < 1).map((x) => x.m);
      return { preset: p, score: parts.reduce((a, b) => a + b.score, 0) / parts.length, blocked };
    }).sort((a, b) => b.score - a.score);
    return ranked;
  }

  // 근력 기준표 기반 발달도 자동 평가
  function assessDevelopment(state) {
    const bw = state.profile.weight;
    const out = {};
    for (const [m, std] of Object.entries(STANDARDS)) {
      let best = 0, bestEx = null;
      for (const id of std.ex) {
        const ex = getEx(state, id);
        for (const h of history(state, id)) {
          const v = bestE1rm(state, ex, h);
          if (v > best) { best = v; bestEx = id; }
        }
      }
      if (!best) continue;
      const ratio = best / bw;
      const level = clamp(std.t.filter((t) => ratio >= t).length, 1, 5);
      out[m] = { level, ratio, e1rm: best, ex: bestEx };
    }
    return out;
  }

  // 종목별 진행 추이 (오래된 순)
  function progressSeries(state, exId) {
    const ex = getEx(state, exId);
    return history(state, exId).reverse().map((h) => ({
      date: h.session.date,
      concept: h.session.concept,
      e1rm: +bestE1rm(state, ex, h).toFixed(1),
      top: Math.max(...h.sets.map((s) => s.w)),
      volume: h.sets.reduce((a, s) => a + loadOf(ex, s.w, state.profile.weight) * s.r, 0),
      sets: h.sets.map((s) => `${s.w}×${s.r}`).join(', '),
    }));
  }

  function ageOf(profile, now = new Date()) {
    return now.getFullYear() - profile.birthYear;
  }

  function nutrition(profile, conceptKey, now = new Date()) {
    const { height: h, weight: w } = profile;
    const age = ageOf(profile, now);
    const bmi = w / ((h / 100) ** 2);
    const bmr = 10 * w + 6.25 * h - 5 * age + (profile.sex === 'F' ? -161 : 5); // Mifflin-St Jeor
    const tdee = bmr * (profile.activity || 1.55);
    return {
      age, bmi, bmr, tdee,
      bulk: tdee + 300,
      cut: tdee - 500,
      maintain: tdee,
      protein: [1.6 * w, 2.2 * w],
      today: conceptKey === 'diet' ? tdee - 500 : tdee + 300,
    };
  }

  const ENGINE = {
    allExercises, getEx, incOf, roundW, e1rm, weightForReps, history, prescribe, scoreEx, candidates,
    generateRoutine, makeItem, alternatives, emptySession, repeatSession, warmupFor, changeConcept,
    searchExercises, recentExercises, lastRecord, chosung, setBudget, weeklyVolume, weeklyTarget, lastTrained, recommend,
    assessDevelopment, progressSeries, nutrition, ageOf, DEV_FACTOR, WEEKLY_TARGET,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = ENGINE;
  else root.ENGINE = ENGINE;
})(typeof window !== 'undefined' ? window : globalThis);
