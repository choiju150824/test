/* 데이트길잡이 · 추천 엔진 (UI 없음). 장소 데이터는 source(카카오/데모)에서 주입 */
(function (root) {
  const D = typeof module !== 'undefined' && module.exports ? require('./data.js') : root.DATA;
  const { ACTIVITIES, CONCEPTS, TIMES, DUR, PLACE_OPTIONS, PLACE_RULES, HOURS, REGIONS, TRAIT_ACT, TRANSPORT } = D;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const uniq = (arr) => Array.from(new Set(arr));
  const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
  const fmt = (min) => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const dowOf = (date) => new Date(date + 'T12:00:00').getDay();
  const label = (list, id) => (D[list].find((x) => x.id === id) || { label: id }).label;
  const persons = (couple) => [couple.me, couple.partner].filter(Boolean);

  /* ---------- 거리 · 이동 ---------- */
  function haversine(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  // 직선거리 × 1.3(도로 우회) 기준 대략적인 이동시간
  function travel(a, b, mode) {
    const d = haversine(a, b) * 1.3;
    if (mode === 'walk' || d < 900) return { min: Math.max(1, Math.round(d / 75)), mode: 'walk', dist: Math.round(d) };
    if (mode === 'transit') return { min: Math.round(8 + d / 333), mode: 'transit', dist: Math.round(d) };
    return { min: Math.round(6 + d / 400), mode: 'car', dist: Math.round(d) };
  }

  /* ---------- 장소 태깅 ---------- */
  function hoursOf(text, kind) {
    const h = HOURS.find((r) => r.re.test(text)) || (kind === 'activity' ? { open: 600, close: 1260 } : { open: 660, close: 1320 });
    return { open: h.open, close: h.close, closed: h.closed || [], brk: h.brk || null };
  }

  function tagPlace(raw, kind, actType) {
    const text = (raw.category || '') + ' ' + (raw.name || '');
    const p = Object.assign({}, raw, { kind, actType: actType || null, tags: [], main: [], spicy: 0, price: 0, bar: false, chain: false,
      attrs: { quiet: 0, hot: 0, local: 0, view: 0, cheap: 0, pricey: 0 } });
    let price = 0;
    for (const r of PLACE_RULES) {
      if (!r.re.test(text)) continue;
      if (r.tags) p.tags.push(...r.tags);
      if (r.main) p.main.push(...r.main);
      if (r.spicy) p.spicy = Math.max(p.spicy, r.spicy);
      if (r.price) price = Math.max(price, r.price);
      if (r.bar) p.bar = true;
      if (r.a) for (const k in r.a) p.attrs[k] += r.a[k];
    }
    if (/\S+점$/.test((raw.name || '').trim()) && /\s/.test(raw.name || '')) { p.chain = true; p.attrs.local -= 0.6; p.attrs.hot -= 0.2; }
    if (p.tags.includes('spicyfood') && !p.spicy) p.spicy = 2;
    if (kind === 'activity') {
      const A = ACTIVITIES[actType] || {};
      p.main = []; p.bar = false;
      p.price = /방탈출/.test(text) ? 22000 : /공방|원데이|클래스/.test(text) ? 35000 : /보드/.test(text) ? 10000 : /전망대|타워/.test(text) ? 27000 : /팝업/.test(text) ? 0 : /미술관|박물관/.test(text) ? 10000 : (A.price || 0);
      p.indoor = /공원|산책|거리|숲|한강|강변|언덕|야경 명소/.test(text) ? false : /전망대|타워|몰|백화점|미술관|박물관|전시|갤러리|공방|방탈출|보드|클래스|소품|편집샵|팝업/.test(text) ? true : !!A.indoor;
      if (actType === 'nightview' || /전망대|루프탑/.test(text)) p.attrs.view += 1;
    } else {
      p.price = price || (kind === 'cafe' ? 7500 : 15000);
      p.indoor = !/루프탑|테라스/.test(text);
    }
    if (p.attrs.cheap > 0.5 && p.price > 20000) p.attrs.cheap = 0.2;
    p.tags = uniq(p.tags); p.main = uniq(p.main);
    p.reservable = p.attrs.pricey > 0 || p.attrs.quiet >= 1 || /오마카세|한정식|파인다이닝|스테이크|뷔페|코스|공방|원데이|클래스|방탈출/.test(text) ? 'likely'
      : (p.attrs.cheap >= 1 || /분식|국밥|백반|해장국|카페|공원|거리/.test(text)) ? 'no' : 'maybe';
    const rank = raw.rank == null ? 10 : raw.rank;
    p.waitLikely = (p.attrs.hot >= 0.5 && rank < 6) || (p.attrs.hot >= 1 && rank < 10);
    p.hours = hoursOf(text, kind);
    return p;
  }

  function isOpenAt(p, dow, start, dur) {
    const h = p.hours; if (!h) return true;
    if (h.closed.includes(dow)) return false;
    if (start < h.open || start + Math.min(dur, 60) > h.close) return false;
    if (h.brk && start >= h.brk[0] - 30 && start < h.brk[1]) return false;
    return true;
  }

  /* ---------- 사람별 만족도 ---------- */
  function personScore(person, p) {
    const pr = person.profile || {}; const T = new Set(pr.traits || []);
    let s = 0.5; const rs = [];
    const add = (v, text) => { s += v; if (text && v > 0) rs.push({ w: v, text }); };
    const a = p.attrs, k = p.kind, act = p.actType;
    if (T.has('active')) { if (act === 'experience') add(0.3, '활동적인 체험'); else if (act === 'walk' || act === 'shopping') add(0.1); if (k === 'cafe') add(-0.05); }
    if (T.has('relaxed')) { if (act === 'walk') add(0.2, '여유로운 산책'); if (k === 'cafe') add(0.15, '느긋하게 쉬어가기'); if (act === 'exhibit') add(0.1); if (act === 'experience') add(-0.1); }
    if (T.has('indoor')) add(p.indoor ? 0.12 : -0.15);
    if (T.has('outdoor')) add(!p.indoor ? 0.22 : -0.03, '야외에서 즐기기');
    if (T.has('photo')) { if (a.view > 0) add(0.2, '사진 잘 나오는 뷰'); if (act === 'exhibit') add(0.15, '사진 찍기 좋은 전시'); if (a.hot > 0) add(0.12, '감성 가득한 공간'); if (act === 'nightview') add(0.2, '인생샷 야경'); }
    if (T.has('noCrowd')) { if (a.hot > 0) add(-0.2 * Math.min(a.hot, 1.5)); if (p.waitLikely) add(-0.2); if (a.quiet > 0) add(0.15, '붐비지 않는 곳'); }
    if (T.has('foodie') && k === 'food' && (a.local > 0 || a.hot > 0)) add(0.15, '맛집 탐방');
    if (T.has('cafe') && k === 'cafe') add(0.15, '카페 투어');
    if (T.has('culture') && act === 'exhibit') add(0.3, '문화·예술 감성');
    if (T.has('night')) { if (act === 'nightview') add(0.3, '밤 데이트'); if (p.bar) add(0.1); }
    if (T.has('planner') && p.reservable === 'likely') add(0.08, '미리 예약하기 좋은 곳');
    if (T.has('spontaneous') && (act === 'walk' || act === 'shopping')) add(0.08, '즉흥적으로 둘러보기');
    const m = (pr.mbti || '').toUpperCase();
    if (m[0] === 'I' && a.quiet > 0) add(0.06);
    if (m[0] === 'E' && a.hot > 0) add(0.05);
    if (m[1] === 'N' && (act === 'exhibit' || act === 'experience')) add(0.05);
    if (m[1] === 'S' && a.local > 0) add(0.04);
    let dislikes = 0;
    if (k === 'food' || k === 'cafe') {
      for (const x of pr.likes || []) if (p.tags.includes(x) || p.main.includes(x)) add(0.22, `좋아하는 ${label('FOODS', x)}`);
      for (const x of pr.dislikes || []) if (p.tags.includes(x) || p.main.includes(x)) { add(-0.3); dislikes++; }
      const tol = pr.spicy == null ? 2 : pr.spicy;
      if (p.spicy > tol + 0) add(-0.25 * (p.spicy - tol));
      if (p.bar && !pr.drink) add(-0.6);
    }
    return { s, rs, dislikes };
  }

  /* ---------- 장소 점수 ---------- */
  function scorePlace(p, couple, req, ctx) {
    ctx = ctx || {};
    const ps = persons(couple);
    const allergy = uniq(ps.flatMap((x) => (x.profile && x.profile.allergies) || []));
    const hit = p.main.filter((x) => allergy.includes(x));
    if (hit.length) return { excluded: '알러지: ' + hit.map((x) => label('ALLERGENS', x)).join(', ') };
    if (p.bar && ps.some((x) => !(x.profile && x.profile.drink))) return { excluded: '음주 안 하는 분이 있어요' };
    if (req.excludeVisited && ctx.visited && ctx.visited.has(p.id)) return { excluded: '이미 가본 곳' };
    if (req.indoorOnly && !p.indoor) return { excluded: '우천 시 야외' };
    if (ctx.rejected && ctx.rejected.has(p.id)) return { excluded: '싫어요 받은 곳' };
    const F = new Set(req.filters || []);
    if (p.kind !== 'activity') {
      if (F.has('noWait') && p.waitLikely) return { excluded: '웨이팅 가능성 높음' };
      if (F.has('reservable') && p.reservable === 'no') return { excluded: '예약 어려움' };
    }
    if (F.has('parking') && p.parkingNearby === false) return { excluded: '근처 주차장 없음' };

    const each = ps.map((x) => Object.assign(personScore(x, p), { name: x.name }));
    const sv = each.map((e) => e.s);
    let score = ps.length > 1 ? 0.55 * Math.min(...sv) + 0.45 * (sv[0] + sv[1]) / 2 : sv[0];
    const reasons = [];
    // 사람별 이유 → 같은 이유면 '둘 다', 아니면 이름 표기
    const byText = {};
    each.forEach((e) => e.rs.forEach((r) => { (byText[r.text] = byText[r.text] || { w: 0, who: [] }).w += r.w; byText[r.text].who.push(e.name); }));
    for (const t in byText) {
      const b = byText[t];
      reasons.push({ w: b.w * 0.8, text: ps.length > 1 ? `${t} (${b.who.length > 1 ? '둘 다' : b.who[0]})` : t });
    }
    const a = p.attrs;
    const attrVal = (attr) => attr === 'wait' ? (p.waitLikely ? 1 : a.hot * 0.5) : a[attr];
    const opts = p.kind === 'food' ? req.foodOpts : p.kind === 'cafe' ? req.cafeOpts : [];
    for (const id of opts || []) {
      const o = PLACE_OPTIONS.find((x) => x.id === id); if (!o) continue;
      const v = attrVal(o.attr);
      if (v > 0) { const g = 0.35 * clamp(v, 0, 1.5); score += g; reasons.push({ w: g + 0.2, text: p.kind === 'cafe' ? o.reason.replace('맛집', '카페') : o.reason }); }
      else if (v < 0) score -= 0.15;
    }
    const C = CONCEPTS[req.concept];
    if (C) {
      for (const k in C.w) score += C.w[k] * clamp(a[k], -1, 1.5);
      if (p.actType && C.act[p.actType]) score += C.act[p.actType] * 0.5;
      if (req.concept === 'anniversary' && (a.view > 0 || a.pricey > 0)) reasons.push({ w: 0.25, text: '기념일 분위기 내기 좋은 곳' });
      if (req.concept === 'budget' && a.cheap > 0) reasons.push({ w: 0.25, text: '부담 없는 가격' });
    }
    if (req.indoorOnly && p.indoor) reasons.push({ w: 0.15, text: '비 와도 걱정 없는 실내' });
    const rank = p.rank == null ? 10 : p.rank;
    score += 0.15 * (1 - clamp(rank, 0, 15) / 15);
    if (F.has('reservable') && p.reservable === 'likely') { score += 0.1; reasons.push({ w: 0.2, text: '예약 가능성 높음' }); }
    if (p.parkingNearby && (F.has('parking') || couple.transport === 'car')) { score += 0.08; reasons.push({ w: 0.18, text: '근처 주차장 있음' }); }
    // 과거 후기 반영
    const pr = ctx.placeRating && ctx.placeRating[p.id];
    if (pr) { score += (pr - 3) * 0.2; if (pr >= 4) reasons.push({ w: 0.5, text: `지난번 별점 ★${pr.toFixed(1)}` }); }
    if (ctx.tagRating) {
      const tg = p.tags.map((t) => ctx.tagRating[t]).filter(Boolean);
      if (tg.length) { const avg = tg.reduce((x, y) => x + y, 0) / tg.length; score += (avg - 3) * 0.08; if (avg >= 4.3) reasons.push({ w: 0.22, text: '후기 좋았던 스타일' }); }
    }
    const dislikes = each.reduce((x, e) => x + e.dislikes, 0);
    reasons.sort((x, y) => y.w - x.w);
    return { score, reasons: reasons.map((r) => r.text), dislikes, per: each.map((e) => ({ name: e.name, s: +e.s.toFixed(2) })) };
  }

  /* ---------- 슬롯(시간표 뼈대) ---------- */
  function actAffinity(person, t) {
    let s = 0; for (const tr of (person.profile && person.profile.traits) || []) s += (TRAIT_ACT[tr] && TRAIT_ACT[tr][t]) || 0; return s;
  }
  function permutations(arr, k) {
    if (k === 0) return [[]];
    const out = [];
    arr.forEach((x, i) => permutations(arr.slice(0, i).concat(arr.slice(i + 1)), k - 1).forEach((p) => out.push([x].concat(p))));
    return out;
  }
  function slotDur(kind, actType) { return kind === 'activity' ? ACTIVITIES[actType].dur : DUR[kind]; }

  // 놀거리 유형을 두 사람의 만족도 합의 최솟값이 최대가 되도록 배치 (성향이 달라도 균형)
  function planSlots(req, couple) {
    const T = TIMES[req.time]; const ps = persons(couple);
    const kinds = T.slots.map((k) => (k === 'act' ? 'activity' : k));
    const nAct = kinds.filter((k) => k === 'activity').length;
    let types = (req.acts && req.acts.length ? req.acts : (CONCEPTS[req.concept] || CONCEPTS.healing).defaults).slice();
    if (req.indoorOnly) {
      types = types.map((t) => (t === 'walk' ? (types.includes('exhibit') ? 'shopping' : 'exhibit') : t));
      types = uniq(types);
    }
    const pool = types.length >= nAct ? types : uniq(types.concat(['exhibit', 'walk', 'shopping', 'experience'].filter((t) => !(req.indoorOnly && t === 'walk')))).slice(0, Math.max(nAct, types.length));
    const buffer = ps.some((p) => (p.profile.traits || []).includes('spontaneous')) ? 15 : 10;
    const start = toMin(T.start);
    const C = CONCEPTS[req.concept] || { act: {} };
    let best = null;
    for (const perm of permutations(pool, Math.min(nAct, pool.length))) {
      let t = start, ai = 0, ok = true, sA = 0, sB = 0, bonus = 0;
      const seq = kinds.map((k) => {
        let at = null;
        if (k === 'activity') { at = perm[ai++] || null; if (!at) return null; }
        const st = t; t += slotDur(k, at) + 15 + buffer;
        if (at && ACTIVITIES[at].minStart && st < ACTIVITIES[at].minStart) ok = false;
        if (at) { sA += actAffinity(ps[0], at); sB += ps[1] ? actAffinity(ps[1], at) : actAffinity(ps[0], at); bonus += C.act[at] || 0; if (req.acts && req.acts.includes(at)) bonus += 0.4; }
        return { kind: k, actType: at };
      }).filter(Boolean);
      if (!ok) continue;
      const val = Math.min(sA, sB) + 0.3 * (sA + sB) / 2 + bonus;
      if (!best || val > best.val) best = { val, seq };
    }
    if (!best) { // 야경 시간대가 안 맞으면 야경 제외 후 재시도
      if (pool.includes('nightview')) return planSlots(Object.assign({}, req, { acts: pool.filter((t) => t !== 'nightview') }), couple);
      best = { seq: kinds.filter((k) => k !== 'activity').map((k) => ({ kind: k, actType: null })) };
    }
    return { start, buffer, slots: best.seq };
  }

  /* ---------- 코스 조립 (빔 서치: 점수 - 이동시간 - 예산 초과) ---------- */
  function buildCourse(plan, cands, couple, req, ctx) {
    const dow = dowOf(req.date); const mode = couple.transport || 'transit';
    const scored = plan.slots.map((sl, i) => {
      const out = [], excluded = [];
      for (const p of cands[i] || []) {
        const r = scorePlace(p, couple, req, ctx);
        if (r.excluded) excluded.push({ name: p.name, why: r.excluded });
        else out.push(Object.assign({}, p, { score: r.score, reasons: r.reasons, dislikes: r.dislikes, per: r.per }));
      }
      out.sort((x, y) => y.score - x.score);
      return { list: out.slice(0, 14), excluded };
    });
    const W = 8; let beams = [{ items: [], t: plan.start, cost: 0, val: 0, used: new Set() }];
    const warnings = [];
    plan.slots.forEach((sl, i) => {
      const next = [];
      for (const b of beams) {
        const prev = b.items[b.items.length - 1];
        for (const c of scored[i].list) {
          if (b.used.has(c.id)) continue;
          const tr = prev ? travel(prev.place, c, mode) : { min: 0, mode: 'walk', dist: 0 };
          const arrive = b.t + (prev ? tr.min + plan.buffer : 0);
          const dur = slotDur(sl.kind, sl.actType);
          if (!isOpenAt(c, dow, arrive, dur)) continue;
          const cost = b.cost + c.price * 2;
          let v = c.score - tr.min * 0.012 - (tr.min > 40 ? 0.3 : 0);
          if (req.budget) v -= (Math.max(0, cost - req.budget) - Math.max(0, b.cost - req.budget)) / req.budget * 1.5;
          if (b.items.some((it) => it.kind === c.kind && c.kind !== 'activity' && it.place.tags.some((t) => ['korean', 'japanese', 'chinese', 'western', 'asian', 'meat', 'seafood'].includes(t) && c.tags.includes(t)))) v -= 0.3;
          const used = new Set(b.used); used.add(c.id);
          next.push({ items: b.items.concat([{ kind: sl.kind, actType: sl.actType, place: c, start: arrive, end: arrive + dur, travelIn: prev ? tr : null }]), t: arrive + dur, cost, val: b.val + v, used });
        }
      }
      if (!next.length) { warnings.push(`${slotLabel(sl)} 후보를 찾지 못해 건너뛰었어요`); return; }
      next.sort((x, y) => y.val - x.val); beams = next.slice(0, W);
    });
    const best = beams[0];
    const items = best.items.map((it, i) => {
      const nx = best.items[i + 1];
      return {
        kind: it.kind, actType: it.actType, start: it.start, end: it.end, cost: it.place.price * 2,
        travelNext: nx ? nx.travelIn : null,
        reason: oneLine(it.place, it, nx), place: slimPlace(it.place),
        alts: scored[i] ? scored[i].list.filter((c) => c.id !== it.place.id).slice(0, 8).map(slimPlace) : [],
      };
    });
    const excluded = Array.from(new Map(scored.flatMap((s) => s.excluded).map((e) => [e.name, e])).values());
    return { items, total: items.reduce((x, it) => x + it.cost, 0), warnings, excludedCount: excluded.length, excludedAllergy: excluded.filter((e) => e.why.startsWith('알러지')).slice(0, 5) };
  }

  function slotLabel(sl) { return sl.kind === 'food' ? '식당' : sl.kind === 'cafe' ? '카페' : ACTIVITIES[sl.actType].label; }
  function slimPlace(p) {
    return { id: p.id, name: p.name, category: p.category, lat: p.lat, lng: p.lng, url: p.url || '', phone: p.phone || '', address: p.address || '', demo: !!p.demo,
      kind: p.kind, actType: p.actType, tags: p.tags, main: p.main, price: p.price, indoor: p.indoor, reservable: p.reservable, waitLikely: p.waitLikely,
      parkingNearby: p.parkingNearby == null ? null : p.parkingNearby, hours: p.hours, reasons: (p.reasons || []).slice(0, 3), score: p.score == null ? 0 : +p.score.toFixed(3), attrs: p.attrs, spicy: p.spicy, bar: p.bar };
  }
  function oneLine(p) {
    const r = (p.reasons || []).slice(0, 2);
    if (!r.length) {
      if (p.kind === 'activity') r.push(`${ACTIVITIES[p.actType].label} 하기 좋은 곳`);
      else r.push('두 사람 모두 무난하게 즐길 메뉴', (p.rank != null && p.rank < 5) ? '근처 검색 상위 인기 장소' : '동선상 가까운 곳');
    }
    return r.join(' · ');
  }

  // 시간 재계산 (다시 추천 후)
  function retime(planObj, couple, req) {
    const mode = couple.transport || 'transit';
    const buffer = persons(couple).some((p) => (p.profile.traits || []).includes('spontaneous')) ? 15 : 10;
    let t = planObj.items.length ? planObj.items[0].start : 0;
    planObj.items.forEach((it, i) => {
      const prev = planObj.items[i - 1];
      if (prev) { const tr = travel(prev.place, it.place, mode); prev.travelNext = tr; t += tr.min + buffer; }
      const dur = it.end - it.start; it.start = t; it.end = t + dur; t = it.end;
      it.cost = it.place.price * 2;
    });
    if (planObj.items.length) planObj.items[planObj.items.length - 1].travelNext = null;
    planObj.total = planObj.items.reduce((x, it) => x + it.cost, 0);
    return planObj;
  }

  // 특정 장소만 다시 추천: 후보 중 동선(앞뒤 장소와의 거리) 고려해 다음 best
  function reroll(planObj, idx, couple, req, skipIds) {
    const it = planObj.items[idx]; const mode = couple.transport || 'transit';
    const used = new Set(planObj.items.map((x) => x.place.id).concat(skipIds || []));
    const prev = planObj.items[idx - 1], next = planObj.items[idx + 1];
    const dow = dowOf(req.date);
    const opts = it.alts.filter((c) => !used.has(c.id) && isOpenAt(c, dow, it.start, it.end - it.start)).map((c) => {
      let v = c.score;
      if (prev) v -= travel(prev.place, c, mode).min * 0.012;
      if (next) v -= travel(c, next.place, mode).min * 0.012;
      return { c, v };
    }).sort((a, b) => b.v - a.v);
    if (!opts.length) return false;
    const old = it.place; const pick = opts[0].c;
    it.alts = it.alts.filter((c) => c.id !== pick.id).concat([old]);
    it.place = pick; it.reason = oneLine(pick); it.rerolled = (it.rerolled || 0) + 1;
    retime(planObj, couple, req);
    return true;
  }

  /* ---------- 날씨 ---------- */
  // hourly: {time:[ISO], precipitation_probability:[], precipitation:[]}
  function rainRisk(hourly, date, startMin, endMin) {
    if (!hourly || !hourly.time) return null;
    let max = 0, mm = 0, n = 0;
    hourly.time.forEach((t, i) => {
      if (!t.startsWith(date)) return;
      const h = Number(t.slice(11, 13)) * 60;
      if (h + 59 < startMin || h > endMin) return;
      n++; max = Math.max(max, hourly.precipitation_probability[i] || 0); mm += (hourly.precipitation && hourly.precipitation[i]) || 0;
    });
    if (!n) return null;
    return { prob: max, mm: +mm.toFixed(1), rainy: max >= 50 || mm >= 1 };
  }

  /* ---------- AI 지역 추천 (컨셉 × 커플 성향 × 교통수단 점수화) ---------- */
  function recommendRegions(concept, couple, opt) {
    opt = opt || {}; const ps = persons(couple);
    const T = new Set(ps.flatMap((p) => p.profile.traits || []));
    const city = opt.city || null;
    const scored = REGIONS.filter((r) => !city || r.city === city).map((r) => {
      const why = [];
      let s = (r.s[concept] || 0.2) * 2;
      if (r.hl[concept]) why.push(r.hl[concept]);
      if (T.has('noCrowd')) { s -= r.crowd * 0.6; if (r.crowd <= 0.5) why.push('비교적 덜 붐벼요'); }
      if (T.has('photo')) { s += (r.s.photo || 0) * 0.4; if (!r.hl[concept] && r.hl.photo) why.push(r.hl.photo); }
      if (T.has('culture')) s += (r.s.culture || 0) * 0.4;
      if (T.has('foodie')) s += (r.s.food || 0) * 0.3;
      if (T.has('night')) s += (r.s.night || 0) * 0.3;
      if (T.has('indoor')) s += r.indoor * 0.3;
      if (T.has('outdoor')) s += (1 - r.indoor) * 0.3;
      if (couple.transport === 'car') { s += r.parking * 0.5; if (r.parking >= 0.6) why.push('주차가 비교적 편해요'); else s -= 0.2; }
      if (opt.rainy) { s += r.indoor * 0.6; if (r.indoor >= 0.7) why.push('실내 장소가 많아 비 와도 괜찮아요'); }
      if (opt.budget && opt.budget <= 50000) s += (r.s.budget || 0) * 0.4;
      if (opt.recent && opt.recent.includes(r.id)) s -= 0.5;
      if (!why.length) why.push(Object.values(r.hl)[0]);
      return { id: r.id, name: r.name, station: r.station, city: r.city, lat: r.lat, lng: r.lng, score: +s.toFixed(2), why: why.slice(0, 2) };
    }).sort((a, b) => b.score - a.score);
    return scored.slice(0, opt.n || 3);
  }

  /* ---------- 기념일 ---------- */
  function addDays(date, n) { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
  function upcomingAnniversaries(couple, today, within) {
    within = within == null ? 60 : within; const out = [];
    const push = (name, date) => { const d = daysBetween(today, date); if (d >= 0 && d <= within) out.push({ name, date, daysLeft: d }); };
    if (couple.startDate) {
      for (const n of [100, 200, 300, 500, 1000, 1500, 2000, 3000]) push(`${n}일`, addDays(couple.startDate, n - 1));
      const y0 = Number(couple.startDate.slice(0, 4));
      for (let y = 1; y <= 30; y++) push(`${y}주년`, (y0 + y) + couple.startDate.slice(4));
    }
    for (const a of couple.anniversaries || []) {
      if (!a.date) continue;
      if (a.yearly !== false) {
        const ty = Number(today.slice(0, 4));
        for (const y of [ty, ty + 1]) push(a.name, y + a.date.slice(4));
      } else push(a.name, a.date);
    }
    return out.sort((a, b) => a.daysLeft - b.daysLeft);
  }
  function dday(startDate, today) { return daysBetween(startDate, today) + 1; }

  /* ---------- 후기 → 추천 컨텍스트 ---------- */
  function reviewContext(courses) {
    const visited = new Set(), sums = {}, tagSums = {};
    for (const c of courses || []) {
      if (!c.review) continue;
      const plan = c.plans[c.active || 'A'];
      for (const it of plan.items) {
        visited.add(it.place.id);
        const rs = c.review.places && c.review.places[it.place.id];
        if (!rs) continue;
        const vals = Object.values(rs).filter((x) => x > 0); if (!vals.length) continue;
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        (sums[it.place.id] = sums[it.place.id] || []).push(avg);
        for (const t of it.place.tags || []) (tagSums[t] = tagSums[t] || []).push(avg);
      }
    }
    const mean = (o) => { const r = {}; for (const k in o) r[k] = o[k].reduce((a, b) => a + b, 0) / o[k].length; return r; };
    return { visited, placeRating: mean(sums), tagRating: mean(tagSums) };
  }

  /* ---------- 공유 코드 (deflate + base64url) ---------- */
  const b64 = {
    enc(bytes) { let s = ''; bytes.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
    dec(str) { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); },
  };
  async function pipe(bytes, Stream) {
    const s = new Blob([bytes]).stream().pipeThrough(new Stream('deflate-raw'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function encode(obj) {
    const raw = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream !== 'undefined') return 'z' + b64.enc(await pipe(raw, CompressionStream));
    return 'j' + b64.enc(raw);
  }
  async function decode(code) {
    code = (code || '').trim().replace(/^.*[#/]([zj][A-Za-z0-9_-]{10,})$/, '$1');
    const body = b64.dec(code.slice(1));
    const bytes = code[0] === 'z' ? await pipe(body, DecompressionStream) : body;
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  const E = { clamp, toMin, fmt, dowOf, haversine, travel, tagPlace, isOpenAt, personScore, scorePlace, planSlots, buildCourse, retime, reroll,
    rainRisk, recommendRegions, upcomingAnniversaries, dday, addDays, daysBetween, reviewContext, encode, decode, slotLabel, label };
  if (typeof module !== 'undefined' && module.exports) module.exports = E;
  else root.ENGINE = E;
})(this);
