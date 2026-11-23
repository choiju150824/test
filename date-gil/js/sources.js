/* 데이트길잡이 · 데이터 소스 (카카오 로컬 / 데모) + 날씨 + 코스 생성 파이프라인 */
(function (root) {
  const node = typeof module !== 'undefined' && module.exports;
  const D = node ? require('./data.js') : root.DATA;
  const E = node ? require('./engine.js') : root.ENGINE;

  /* ---------- 공통: 검색 키워드 ---------- */
  const FOOD_KW = { quiet: ['한정식', '파인다이닝', '오마카세'], sns: ['브런치', '파스타'], waiting: ['맛집'], local: ['노포', '국밥', '백반'], view: ['루프탑', '뷰 레스토랑'], value: ['분식', '국수', '가성비'] };
  const CAFE_KW = { quiet: ['북카페', '찻집'], sns: ['디저트카페', '베이커리'], waiting: ['디저트'], local: ['로스터리'], view: ['루프탑 카페', '뷰 카페'], value: ['카페'] };
  const LIKE_KW = { korean: '한식', japanese: '일식', chinese: '중식', western: '양식', asian: '쌀국수', meat: '고기', seafood: '해산물', sashimi: '초밥', offal: '곱창', lamb: '양꼬치', noodle: '국수', pasta: '파스타', spicyfood: '매운', cheese: '피자', brunch: '브런치' };
  const CAFE_LIKE_KW = { bread: '베이커리', dessert: '디저트', tea: '찻집', coffee: '로스터리' };
  const ACT_OK = {
    exhibit: /미술관|박물관|전시|갤러리|팝업|문화/, walk: /공원|거리|산책|숲|관광|명소|한강|호수|둘레길|강변/,
    experience: /공방|방탈출|보드|클래스|체험|레저|원데이/, shopping: /소품|편집샵|쇼핑|백화점|몰|잡화|패션|서점/,
    nightview: /전망|야경|명소|타워|루프탑|관광/,
  };
  const JUNK = /부동산|병원|의원|약국|학원|은행|주차장|교통|아파트|빌딩|회사|기업|공공기관|주유소|숙박|모텔|호텔|교회|성당/;

  /* ---------- 데모 소스: 실제 장소가 아닌 '예시' 장소를 좌표 주변에 결정적으로 생성 ---------- */
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function demoSource() {
    return {
      demo: true,
      async geocode(q) {
        const r = D.REGIONS.find((x) => q.includes(x.name.split('·')[0]) || q.includes(x.station.replace('역', '')) || x.name.includes(q.replace(/역$/, '')));
        return r ? { lat: r.lat, lng: r.lng, name: q } : { lat: 37.5446, lng: 127.0559, name: q, guessed: true };
      },
      async search({ query, hint, lat, lng, radius }) {
        const list = D.DEMO[hint === 'parking' ? 'parking' : hint] || [];
        const kw = (query || '').split(' ').pop();
        const area = Math.round(lat * 1000) + ',' + Math.round(lng * 1000);
        const rot = hash(area + (query || '')) % Math.max(1, list.length);
        let pick = list.slice(rot).concat(list.slice(0, rot));
        if (kw && hint !== 'parking') {
          const m = list.filter(([n, c]) => (n + c).includes(kw));
          if (m.length) pick = m.concat(pick.filter((x) => !m.includes(x)));
        }
        return pick.slice(0, 15).map(([name, category]) => {
          const h = hash(area + name);
          const ang = (h % 360) * Math.PI / 180, dist = 120 + (h >>> 9) % Math.min(radius || 1200, 1300);
          return {
            id: 'demo-' + h.toString(36), name, category, demo: true,
            lat: lat + (dist * Math.cos(ang)) / 111000, lng: lng + (dist * Math.sin(ang)) / (111000 * Math.cos(lat * Math.PI / 180)),
            url: '', phone: '', address: '데모 모드 예시 장소',
          };
        });
      },
    };
  }

  /* ---------- 카카오 소스 (Maps JS SDK services 라이브러리) ---------- */
  let sdkPromise = null;
  function loadKakaoSdk(appKey) {
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
      if (root.kakao && root.kakao.maps && root.kakao.maps.services) return resolve(root.kakao);
      const s = document.createElement('script');
      s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&libraries=services&autoload=false`;
      s.onload = () => root.kakao.maps.load(() => resolve(root.kakao));
      s.onerror = () => { sdkPromise = null; reject(new Error('카카오 지도 SDK를 불러오지 못했어요. 앱 키와 등록된 도메인을 확인해주세요.')); };
      document.head.appendChild(s);
    });
    return sdkPromise;
  }
  function kakaoSource(appKey) {
    let places = null;
    const ready = async () => { const k = await loadKakaoSdk(appKey); places = places || new k.maps.services.Places(); return k; };
    const conv = (d, i) => ({ id: 'k' + d.id, kakaoId: d.id, name: d.place_name, category: d.category_name, group: d.category_group_code, lat: +d.y, lng: +d.x,
      url: d.place_url, phone: d.phone, address: d.road_address_name || d.address_name, rank: i });
    return {
      demo: false,
      async geocode(q) {
        const k = await ready();
        return new Promise((res, rej) => places.keywordSearch(q, (data, status) => {
          if (status === k.maps.services.Status.OK && data.length) res({ lat: +data[0].y, lng: +data[0].x, name: q, label: data[0].place_name });
          else rej(new Error(`'${q}' 위치를 찾지 못했어요`));
        }));
      },
      async search({ query, group, lat, lng, radius }) {
        const k = await ready();
        const opt = { location: new k.maps.LatLng(lat, lng), radius: Math.min(radius || 2000, 20000), sort: k.maps.services.SortBy.ACCURACY, size: 15 };
        if (group) opt.category_group_code = group;
        return new Promise((res) => {
          const cb = (data, status) => res(status === k.maps.services.Status.OK ? data.map(conv) : []);
          if (query) places.keywordSearch(query, cb, opt); else places.categorySearch(group, cb, opt);
        });
      },
    };
  }

  /* ---------- 날씨 (Open-Meteo, 키 불필요, 16일 이내 예보) ---------- */
  async function fetchWeather(lat, lng, date) {
    const days = E.daysBetween(new Date().toISOString().slice(0, 10), date);
    if (days < 0 || days > 15) return { unavailable: true };
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&hourly=precipitation_probability,precipitation,temperature_2m&timezone=Asia%2FSeoul&start_date=${date}&end_date=${date}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('weather ' + res.status);
    const j = await res.json();
    const temps = (j.hourly.temperature_2m || []).filter((x) => x != null);
    return { hourly: j.hourly, tmin: Math.round(Math.min(...temps)), tmax: Math.round(Math.max(...temps)) };
  }

  /* ---------- 코스 생성 파이프라인 ---------- */
  async function gather(source, req, couple, plan) {
    const center = req.center; const radius = D.TRANSPORT[couple.transport || 'transit'].radius;
    const area = req.areaName || '';
    const cache = new Map();
    const q = async (args) => {
      const key = JSON.stringify(args);
      if (!cache.has(key)) cache.set(key, source.search(Object.assign({ lat: center.lat, lng: center.lng, radius }, args)).catch(() => []));
      return cache.get(key);
    };
    const ps = [couple.me, couple.partner].filter(Boolean);
    const likes = Array.from(new Set(ps.flatMap((p) => p.profile.likes || [])));
    let lots = null;
    if ((req.filters || []).includes('parking') || couple.transport === 'car') {
      lots = await q({ group: 'PK6', hint: 'parking' });
    }
    const out = [];
    for (const sl of plan.slots) {
      let reqs = [];
      if (sl.kind === 'food') {
        reqs.push({ group: 'FD6', hint: 'food' });
        for (const o of req.foodOpts || []) for (const kw of FOOD_KW[o] || []) reqs.push({ query: `${area} ${kw}`, group: 'FD6', hint: 'food' });
        for (const l of likes) if (LIKE_KW[l]) reqs.push({ query: `${area} ${LIKE_KW[l]}`, group: 'FD6', hint: 'food' });
        if (!(req.foodOpts || []).length) reqs.push({ query: `${area} 맛집`, group: 'FD6', hint: 'food' });
      } else if (sl.kind === 'cafe') {
        reqs.push({ group: 'CE7', hint: 'cafe' });
        for (const o of req.cafeOpts || []) for (const kw of CAFE_KW[o] || []) reqs.push({ query: `${area} ${kw}`, hint: 'cafe' });
        for (const l of likes) if (CAFE_LIKE_KW[l]) reqs.push({ query: `${area} ${CAFE_LIKE_KW[l]}`, hint: 'cafe' });
      } else {
        const A = D.ACTIVITIES[sl.actType];
        for (const kw of (req.indoorOnly && A.indoorQueries) || A.queries) reqs.push({ query: `${area} ${kw}`, hint: sl.actType });
      }
      reqs = reqs.slice(0, 8);
      const seen = new Map();
      const results = await Promise.all(reqs.map(q));
      results.forEach((list) => list.forEach((p, i) => {
        const prev = seen.get(p.id);
        if (!prev || i < prev.rank) seen.set(p.id, Object.assign({}, p, { rank: Math.min(i, prev ? prev.rank : 99) }));
      }));
      const tagged = [];
      for (const p of seen.values()) {
        const text = (p.category || '') + ' ' + p.name;
        if (!source.demo) {
          if (JUNK.test(p.category || '')) continue;
          if (sl.kind === 'food' && (/카페|간식/.test(p.category) || p.group === 'CE7')) continue;
          if (sl.kind === 'cafe' && !(p.group === 'CE7' || /카페|베이커리|제과|디저트|찻집/.test(p.category))) continue;
          if (sl.kind === 'cafe' && /보드|방탈출/.test(p.category)) continue;
          if (sl.kind === 'activity' && !ACT_OK[sl.actType].test(text)) continue;
          if (sl.kind === 'activity' && p.group === 'FD6' && !/보드|방탈출|테마카페/.test(text)) continue;
        }
        const t = E.tagPlace(p, sl.kind, sl.actType);
        if (lots) t.parkingNearby = lots.length ? lots.some((l) => E.haversine(l, t) < 350) : false;
        tagged.push(t);
      }
      out.push(tagged);
    }
    return out;
  }

  async function generate(source, req, couple, ctx) {
    const plan = E.planSlots(req, couple);
    const cands = await gather(source, req, couple, plan);
    const course = E.buildCourse(plan, cands, couple, req, ctx);
    course.slots = plan.slots;
    return course;
  }

  const S = { demoSource, kakaoSource, loadKakaoSdk, fetchWeather, generate };
  if (node) module.exports = S;
  else root.SOURCES = S;
})(this);
