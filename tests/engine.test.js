const assert = require('assert');
const E = require('../js/engine.js');
const base = () => ({ profile: { height: 179, weight: 77, birthYear: 2004, sex: 'M', level: 'intermediate', activity: 1.55 },
  dev: { chest: 2, triceps: 4 }, exSettings: {}, customExercises: [], sessions: [] });

// 1) 루틴 생성
let st = base();
const r = E.generateRoutine(st, { muscles: ['chest', 'triceps'], concept: 'hypertrophy', minutes: 60 }, new Date('2026-11-23'));
console.log('budget', r.budget);
r.items.forEach(i => console.log(i.muscle, i.exId, i.sets.length + 'x', i.sets[0].w + 'kg', i.range.join('-'), '|', i.reason));
assert(r.items[0].muscle === 'chest', 'weak muscle first');
assert(r.items[0].type === 'compound');

// 2) 상한 달성 → 증량
const bench = r.items.find(i => i.exId === 'bench') || r.items[0];
const w0 = bench.sets[0].w;
bench.sets.forEach(s => { s.r = bench.range[1]; s.done = true; });
st.sessions.push(r);
let p = E.prescribe(st, E.getEx(st, bench.exId), 'hypertrophy', new Date('2026-11-26'));
console.log('after top:', p.weight, p.targets, p.reason);
assert.strictEqual(p.weight, w0 + E.incOf(st, E.getEx(st, bench.exId)));

// 3) 범위 내 → 반복 +1
const r2 = JSON.parse(JSON.stringify(r)); r2.date = '2026-11-26T00:00:00Z';
r2.items.forEach(i => i.sets.forEach(s => { s.w = p.weight; s.r = 7; s.done = true; }));
st.sessions.push(r2);
p = E.prescribe(st, E.getEx(st, bench.exId), 'hypertrophy', new Date('2026-11-29'));
console.log('in range:', p.weight, p.targets, p.reason);
assert.deepStrictEqual(p.targets, [8, 8, 8, 8]);

// 4) 2회 연속 미달 → 디로드
for (const d of ['2026-11-29', '2026-12-02']) {
  const x = JSON.parse(JSON.stringify(r2)); x.date = d + 'T00:00:00Z'; x.id = d;
  x.items.forEach(i => i.sets.forEach(s => { s.w = p.weight; s.r = 4; }));
  st.sessions.push(x);
}
const pd = E.prescribe(st, E.getEx(st, bench.exId), 'hypertrophy', new Date('2026-12-05'));
console.log('deload:', pd.weight, pd.reason);
assert(pd.weight < p.weight);

// 5) 컨셉 변환
const pp = E.prescribe(st, E.getEx(st, bench.exId), 'pump', new Date('2026-12-05'));
console.log('pump convert:', pp.weight, pp.targets, pp.reason);
assert(pp.source === 'convert' && pp.weight < pd.weight);

for (const c of ['diet', 'stimulus', 'pump', 'strength']) {
  const x = E.generateRoutine(base(), { muscles: ['back', 'biceps'], concept: c, minutes: 60 });
  console.log(c, x.budget, x.items.map(i => `${i.superset || ''}${i.exId}:${i.sets.length}x${i.sets[0].r}@${i.sets[0].w}`).join(' '));
}
console.log('assess', E.assessDevelopment(st));
console.log('nutrition', E.nutrition(base().profile, 'diet', new Date('2026-11-23')));
console.log('recommend', E.recommend(st, new Date('2026-12-03')).map(x => x.preset.name + ':' + x.score.toFixed(2)).join(' '));
console.log('ALL PASS');
