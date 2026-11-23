const assert = require('assert');
const E = require('../js/engine.js');
const S = require('../js/sources.js');

const person = (name, profile) => ({ id: name, name, profile: Object.assign({ traits: [], allergies: [], dislikes: [], likes: [], spicy: 2, drink: true }, profile) });
const couple = {
  me: person('지민', { traits: ['active', 'photo'], allergies: ['crustacean'], likes: ['pasta'], spicy: 1, drink: false, mbti: 'ENFP' }),
  partner: person('도윤', { traits: ['relaxed', 'noCrowd', 'culture'], dislikes: ['cilantro', 'offal'], likes: ['sashimi'], spicy: 3, drink: true, mbti: 'ISTJ' }),
  transport: 'transit', startDate: '2025-12-01', anniversaries: [{ name: '지민 생일', date: '2000-12-05' }],
};

(async () => {
  // 1) 태깅: 카테고리 → 주메뉴 재료
  const crab = E.tagPlace({ id: 'c', name: '꽃게 한상', category: '음식점 > 한식 > 해물,생선 > 게,대게', lat: 37.5, lng: 127 }, 'food');
  assert(crab.main.includes('crustacean'), 'crab main');
  const pasta = E.tagPlace({ id: 'p', name: '트라토리아 봄', category: '음식점 > 양식 > 이탈리안', lat: 37.5, lng: 127 }, 'food');
  assert(pasta.tags.includes('pasta') && pasta.main.includes('wheat'));
  const hwe = E.tagPlace({ id: 'h', name: '바다 횟집', category: '음식점 > 일식 > 회', lat: 37.5, lng: 127 }, 'food');
  assert(hwe.tags.includes('sashimi'), 'sashimi tag');
  const hall = E.tagPlace({ id: 'x', name: '회관 식당', category: '음식점 > 한식', lat: 37.5, lng: 127 }, 'food');
  assert(!hall.tags.includes('sashimi'), '회관 ≠ 회');
  const bar = E.tagPlace({ id: 'b', name: '와인바 달빛', category: '음식점 > 술집 > 와인바', lat: 37.5, lng: 127 }, 'food');
  assert(bar.bar);

  // 2) 알러지 주메뉴 → 제외, 음주 안하는 사람 → 바 제외, 싫어하는 재료 → 감점
  const req = { date: '2026-11-28', time: 'lunch', concept: 'healing', budget: 100000, foodOpts: ['quiet'], cafeOpts: [], acts: ['walk', 'experience'], filters: [] };
  assert(E.scorePlace(crab, couple, req).excluded.startsWith('알러지'));
  assert(E.scorePlace(bar, couple, req).excluded);
  const pho = E.tagPlace({ id: 'v', name: '포 하노이', category: '음식점 > 아시아음식 > 베트남음식', lat: 37.5, lng: 127 }, 'food');
  const plain = E.tagPlace({ id: 'k', name: '칼국수 명가', category: '음식점 > 한식 > 국수 > 칼국수', lat: 37.5, lng: 127 }, 'food');
  const sp = E.scorePlace(pho, couple, req), sk = E.scorePlace(plain, couple, req);
  assert(!sp.excluded && sp.dislikes === 1 && sp.score < sk.score, 'dislike lowers rank');
  console.log('pasta reasons:', E.scorePlace(pasta, couple, req).reasons);

  // 3) 영업시간: 미술관 월요일 휴관, 브레이크타임
  const museum = E.tagPlace({ id: 'm', name: '시립미술관', category: '문화,예술 > 문화시설 > 미술관', lat: 0, lng: 0 }, 'activity', 'exhibit');
  assert(!E.isOpenAt(museum, 1, 14 * 60, 90) && E.isOpenAt(museum, 2, 14 * 60, 90));
  const hj = E.tagPlace({ id: 'j', name: '소담 한정식', category: '음식점 > 한식 > 한정식', lat: 0, lng: 0 }, 'food');
  assert(!E.isOpenAt(hj, 3, 15 * 60 + 30, 80) && E.isOpenAt(hj, 3, 12 * 60, 80));

  // 4) 슬롯: 성향이 다른 두 사람 → 활동(지민) + 산책(도윤) 둘 다 배치
  const plan = E.planSlots(Object.assign({}, req, { time: 'allday', acts: ['walk', 'experience', 'nightview'] }), couple);
  const types = plan.slots.filter((s) => s.kind === 'activity').map((s) => s.actType);
  console.log('allday slots:', plan.slots.map((s) => s.actType || s.kind).join(' → '));
  assert(types.includes('experience') && (types.includes('walk') || types.includes('exhibit')), 'balanced');
  assert(types[types.length - 1] === 'nightview', 'nightview last (evening)');
  const lunchPlan = E.planSlots(Object.assign({}, req, { acts: ['nightview'] }), couple);
  assert(!lunchPlan.slots.some((s) => s.actType === 'nightview'), 'no nightview at lunch');

  // 5) 데모 소스로 전체 코스 생성
  const src = S.demoSource();
  const center = await src.geocode('성수');
  const fullReq = Object.assign({}, req, { time: 'allday', center, areaName: '성수', acts: ['walk', 'experience', 'nightview'] });
  const c = await S.generate(src, fullReq, couple, {});
  c.items.forEach((it) => console.log(E.fmt(it.start), it.place.name, '|', it.reason, '|', it.cost, it.travelNext ? `→ ${it.travelNext.min}분` : ''));
  console.log('total', c.total, 'excluded', c.excludedCount, c.excludedAllergy);
  assert(c.items.length >= 5, 'course built');
  assert(c.items.every((it) => !it.place.main.includes('crustacean')), 'no allergen');
  assert(c.items.every((it) => !it.place.bar), 'no bar');
  for (let i = 1; i < c.items.length; i++) assert(c.items[i].start >= c.items[i - 1].end, 'chronological');

  // 6) 우천 플랜B: 실내만
  const b = await S.generate(src, Object.assign({}, fullReq, { indoorOnly: true }), couple, {});
  assert(b.items.every((it) => it.place.indoor), 'plan B indoor');

  // 7) 다시 추천
  const planObj = { items: c.items, total: c.total };
  const before = planObj.items[0].place.id;
  assert(E.reroll(planObj, 0, couple, fullReq));
  assert(planObj.items[0].place.id !== before);

  // 8) 가본 곳 제외 + 과거 별점
  const ctx = E.reviewContext([{ plans: { A: { items: c.items } }, review: { places: { [c.items[2].place.id]: { me: 5, partner: 5 } } } }]);
  assert(ctx.visited.has(c.items[2].place.id));
  const c2 = await S.generate(src, Object.assign({}, fullReq, { excludeVisited: true }), couple, ctx);
  const visitedIds = new Set(c.items.map((x) => x.place.id));
  assert(c2.items.every((it) => !visitedIds.has(it.place.id)), 'visited excluded');

  // 9) 날씨
  const hourly = { time: ['2026-11-28T11:00', '2026-11-28T15:00', '2026-11-28T20:00'], precipitation_probability: [10, 70, 20], precipitation: [0, 1.2, 0] };
  assert(E.rainRisk(hourly, '2026-11-28', 11 * 60, 17 * 60).rainy);
  assert(!E.rainRisk(hourly, '2026-11-28', 19 * 60, 21 * 60).rainy);

  // 10) 지역 추천
  const recs = E.recommendRegions('night', Object.assign({}, couple, { transport: 'car' }));
  console.log('regions:', recs.map((r) => `${r.name}(${r.score}) ${r.why.join(' / ')}`));
  assert.strictEqual(recs.length, 3);

  // 11) 기념일 (2주 전)
  const an = E.upcomingAnniversaries(couple, '2026-11-23', 14);
  console.log('anniv:', an);
  assert(an.some((a) => a.name === '1주년' && a.daysLeft === 8));
  assert(an.some((a) => a.name === '지민 생일' && a.date === '2026-12-05'));
  assert.strictEqual(E.dday('2025-12-01', '2025-12-01'), 1);

  // 12) 공유 코드 왕복
  const obj = { hello: '안녕 데이트', n: [1, 2, 3] };
  const code = await E.encode(obj);
  assert.deepStrictEqual(await E.decode(code), obj);
  assert.deepStrictEqual(await E.decode('https://x.y/#/shared/' + code), obj);

  console.log('\n✅ all tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
