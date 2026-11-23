/* 데이트길잡이 · 정적 데이터 (선택지, 장소 태깅 규칙, 지역 DB, 데모 템플릿) */
(function (root) {
  const TRAITS = [
    { id: 'active', label: '활동적', emoji: '🏃' },
    { id: 'relaxed', label: '여유로운', emoji: '🛋️' },
    { id: 'indoor', label: '실내파', emoji: '🏠' },
    { id: 'outdoor', label: '야외파', emoji: '🌳' },
    { id: 'planner', label: '계획형', emoji: '📋' },
    { id: 'spontaneous', label: '즉흥형', emoji: '🎲' },
    { id: 'photo', label: '사진 좋아함', emoji: '📸' },
    { id: 'noCrowd', label: '혼잡 싫어함', emoji: '🙅' },
    { id: 'foodie', label: '맛집 탐방', emoji: '🍽️' },
    { id: 'cafe', label: '카페 투어', emoji: '☕' },
    { id: 'culture', label: '문화·예술', emoji: '🎨' },
    { id: 'night', label: '밤 데이트', emoji: '🌙' },
  ];

  const MBTI = ['ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP', 'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'];

  const ALLERGENS = [
    { id: 'crustacean', label: '갑각류(새우·게)', emoji: '🦐' },
    { id: 'shellfish', label: '조개류', emoji: '🦪' },
    { id: 'fish', label: '생선', emoji: '🐟' },
    { id: 'squid', label: '오징어·문어', emoji: '🦑' },
    { id: 'peanut', label: '땅콩', emoji: '🥜' },
    { id: 'nut', label: '견과류', emoji: '🌰' },
    { id: 'dairy', label: '우유·유제품', emoji: '🥛' },
    { id: 'egg', label: '달걀', emoji: '🥚' },
    { id: 'wheat', label: '밀(글루텐)', emoji: '🌾' },
    { id: 'buckwheat', label: '메밀', emoji: '🍜' },
    { id: 'soy', label: '대두', emoji: '🫘' },
    { id: 'peach', label: '복숭아', emoji: '🍑' },
    { id: 'tomato', label: '토마토', emoji: '🍅' },
    { id: 'pork', label: '돼지고기', emoji: '🐷' },
    { id: 'beef', label: '소고기', emoji: '🐮' },
    { id: 'chicken', label: '닭고기', emoji: '🐔' },
  ];

  const FOODS = [
    { id: 'korean', label: '한식', emoji: '🍚' },
    { id: 'japanese', label: '일식', emoji: '🍣' },
    { id: 'chinese', label: '중식', emoji: '🥟' },
    { id: 'western', label: '양식', emoji: '🍝' },
    { id: 'asian', label: '동남아', emoji: '🍜' },
    { id: 'meat', label: '고기', emoji: '🥩' },
    { id: 'seafood', label: '해산물', emoji: '🦞' },
    { id: 'sashimi', label: '회·초밥', emoji: '🍱' },
    { id: 'offal', label: '곱창·내장', emoji: '🔥' },
    { id: 'lamb', label: '양고기', emoji: '🐑' },
    { id: 'noodle', label: '면 요리', emoji: '🍜' },
    { id: 'pasta', label: '파스타', emoji: '🍝' },
    { id: 'spicyfood', label: '매운 음식', emoji: '🌶️' },
    { id: 'cheese', label: '치즈', emoji: '🧀' },
    { id: 'cilantro', label: '고수', emoji: '🌿' },
    { id: 'mushroom', label: '버섯', emoji: '🍄' },
    { id: 'brunch', label: '브런치', emoji: '🥞' },
    { id: 'bread', label: '빵', emoji: '🥐' },
    { id: 'dessert', label: '디저트', emoji: '🍰' },
    { id: 'coffee', label: '커피', emoji: '☕' },
    { id: 'tea', label: '차', emoji: '🍵' },
  ];

  const SPICY = ['못 먹어요', '순한맛', '보통', '매운맛 좋아', '아주 매운맛!'];

  const TRANSPORT = {
    walk: { label: '도보', emoji: '🚶', radius: 1200 },
    transit: { label: '대중교통', emoji: '🚇', radius: 3000 },
    car: { label: '자차', emoji: '🚗', radius: 5000 },
  };

  const BUDGETS = [
    { id: 30000, label: '~3만원' }, { id: 50000, label: '~5만원' }, { id: 100000, label: '~10만원' },
    { id: 150000, label: '~15만원' }, { id: 200000, label: '~20만원' }, { id: 0, label: '상관없음' },
  ];

  /* 컨셉: 장소 속성 가중치 · 놀거리 기본 유형 */
  const CONCEPTS = {
    healing: { label: '힐링', emoji: '🌿', w: { quiet: 0.25, hot: -0.1, view: 0.1 }, act: { walk: 0.3, exhibit: 0.15, experience: -0.05 }, defaults: ['walk', 'exhibit'] },
    activity: { label: '액티비티', emoji: '🎯', w: { hot: 0.05 }, act: { experience: 0.35, shopping: 0.1, walk: 0.05 }, defaults: ['experience', 'shopping'] },
    anniversary: { label: '기념일', emoji: '💝', w: { quiet: 0.2, pricey: 0.15, view: 0.25, cheap: -0.15 }, act: { nightview: 0.3, exhibit: 0.15, experience: 0.1 }, defaults: ['exhibit', 'nightview'] },
    budget: { label: '저예산', emoji: '🪙', w: { cheap: 0.35, pricey: -0.4, local: 0.1 }, act: { walk: 0.3, exhibit: 0.05, shopping: -0.1 }, defaults: ['walk', 'exhibit'] },
    photo: { label: '인생샷', emoji: '📸', w: { hot: 0.2, view: 0.25 }, act: { exhibit: 0.25, nightview: 0.2, walk: 0.05 }, defaults: ['exhibit', 'nightview'] },
    night: { label: '야경·밤', emoji: '🌙', w: { view: 0.2 }, act: { nightview: 0.4, walk: 0.1 }, defaults: ['nightview', 'walk'] },
    culture: { label: '문화생활', emoji: '🎨', w: { quiet: 0.1 }, act: { exhibit: 0.4, experience: 0.15 }, defaults: ['exhibit', 'experience'] },
    food: { label: '맛집 투어', emoji: '😋', w: { local: 0.15, hot: 0.15 }, act: { walk: 0.15, shopping: 0.1 }, defaults: ['walk', 'shopping'] },
  };

  /* 시간대 → 슬롯 템플릿 */
  const TIMES = {
    lunch: { label: '점심', emoji: '🌤️', sub: '11:30~', start: '11:30', slots: ['food', 'act', 'cafe'] },
    afternoon: { label: '오후', emoji: '☀️', sub: '13:30~', start: '13:30', slots: ['act', 'cafe', 'act', 'food'] },
    evening: { label: '저녁', emoji: '🌆', sub: '17:30~', start: '17:30', slots: ['food', 'act', 'cafe'] },
    allday: { label: '하루 종일', emoji: '🌈', sub: '11:30~', start: '11:30', slots: ['food', 'act', 'cafe', 'act', 'food', 'act'] },
  };

  const DUR = { food: 80, cafe: 60 };

  /* 식당·카페 옵션 → 장소 속성 */
  const PLACE_OPTIONS = [
    { id: 'quiet', label: '조용한', emoji: '🤫', attr: 'quiet', reason: '조용하게 대화하기 좋은 곳' },
    { id: 'sns', label: 'SNS 핫플', emoji: '✨', attr: 'hot', reason: 'SNS에서 핫한 곳' },
    { id: 'waiting', label: '웨이팅 맛집', emoji: '⏳', attr: 'wait', reason: '줄 서서 먹는 인기 맛집' },
    { id: 'local', label: '로컬', emoji: '🏘️', attr: 'local', reason: '현지인이 찾는 로컬 맛집' },
    { id: 'view', label: '뷰 맛집', emoji: '🌇', attr: 'view', reason: '뷰가 좋은 곳' },
    { id: 'value', label: '가성비', emoji: '💰', attr: 'cheap', reason: '가성비 좋은 곳' },
  ];

  const FILTERS = [
    { id: 'noWait', label: '웨이팅 없음', emoji: '🙆' },
    { id: 'parking', label: '주차 가능', emoji: '🅿️' },
    { id: 'reservable', label: '예약 가능', emoji: '📅' },
  ];

  /* 놀거리 유형 */
  const ACTIVITIES = {
    exhibit: { label: '전시/팝업', emoji: '🖼️', indoor: true, dur: 90, price: 15000, queries: ['전시', '팝업스토어', '미술관', '갤러리'] },
    walk: { label: '산책', emoji: '🌳', indoor: false, dur: 60, price: 0, queries: ['공원', '산책로', '거리'] },
    experience: { label: '체험', emoji: '🧩', indoor: true, dur: 100, price: 25000, queries: ['공방', '방탈출', '보드게임카페', '원데이클래스'] },
    shopping: { label: '쇼핑', emoji: '🛍️', indoor: true, dur: 75, price: 0, queries: ['소품샵', '편집샵', '쇼핑몰'] },
    nightview: { label: '야경', emoji: '🌃', indoor: false, dur: 50, price: 0, minStart: 17 * 60 + 20, queries: ['전망대', '야경', '루프탑'], indoorQueries: ['전망대', '스카이라운지'] },
  };

  /* 사람 성향 → 놀거리 유형 선호 */
  const TRAIT_ACT = {
    active: { experience: 0.35, shopping: 0.1, walk: 0.1 },
    relaxed: { walk: 0.25, exhibit: 0.15, experience: -0.1 },
    indoor: { exhibit: 0.15, experience: 0.15, shopping: 0.15, walk: -0.2, nightview: -0.05 },
    outdoor: { walk: 0.3, nightview: 0.15 },
    photo: { exhibit: 0.2, nightview: 0.25 },
    culture: { exhibit: 0.35 },
    night: { nightview: 0.35 },
    spontaneous: { walk: 0.1, shopping: 0.1 },
    noCrowd: { shopping: -0.1, walk: 0.05 },
  };

  /*
   * 장소 태깅 규칙: 카카오 category_name("음식점 > 한식 > 해물,생선 > 조개") + 장소명에 정규식 적용
   * main: 주메뉴 재료(알러지 제외 판단), tags: 취향 매칭, spicy: 0~4, price: 1인 예상가, a: 속성 가중치
   */
  const R = (re, o) => Object.assign({ re: new RegExp(re) }, o);
  const PLACE_RULES = [
    R('한식', { tags: ['korean'] }),
    R('일식|일본', { tags: ['japanese'] }),
    R('중식|중화|중국', { tags: ['chinese'], main: ['wheat'], price: 15000 }),
    R('양식|이탈리|프랑스|레스토랑|비스트로', { tags: ['western'], price: 28000, a: { hot: 0.3 } }),
    R('아시아음식|태국|베트남|인도|쌀국수', { tags: ['asian'] }),
    R('삼겹살|돼지|족발|보쌈|돈까스|돈가스|순대국', { main: ['pork'], tags: ['meat'], price: 20000, a: { quiet: -0.6 } }),
    R('소고기|한우|갈비|샤브|설렁탕|곰탕', { main: ['beef'], tags: ['meat'], price: 35000 }),
    R('육류,고기', { tags: ['meat'], a: { quiet: -0.4 } }),
    R('스테이크', { main: ['beef'], tags: ['meat', 'western'], price: 55000, a: { pricey: 1, quiet: 0.5 } }),
    R('치킨|닭요리|닭갈비|찜닭|삼계탕|닭강정', { main: ['chicken'], price: 16000, a: { quiet: -0.4, cheap: 0.3 } }),
    R('곱창|막창|대창|순대', { tags: ['offal'], price: 22000, a: { local: 0.6, quiet: -0.6 } }),
    R('양꼬치|양고기|램', { main: ['lamb'], tags: ['lamb', 'chinese'], price: 22000 }),
    R('해물,생선|해산물|수산|생선구이|아구|복어', { main: ['fish', 'shellfish'], tags: ['seafood'], price: 30000, a: { local: 0.3 } }),
    R('조개|굴|전복|홍합|가리비', { main: ['shellfish'], tags: ['seafood'], price: 30000 }),
    R('대게|꽃게|킹크랩|게장|게,대게|랍스터|새우|가재', { main: ['crustacean'], tags: ['seafood'], price: 45000 }),
    R('낙지|쭈꾸미|주꾸미|오징어|문어', { main: ['squid'], tags: ['seafood', 'spicyfood'], spicy: 3, price: 18000 }),
    R('(^|[> ])회([ ,]|$)|횟집|참치|사시미|초밥|스시|오마카세', { main: ['fish'], tags: ['sashimi', 'japanese', 'seafood'], price: 35000 }),
    R('오마카세|파인다이닝|코스요리', { price: 90000, a: { pricey: 1.2, quiet: 1, hot: 0.3 } }),
    R('이탈리안|파스타', { main: ['wheat'], tags: ['pasta', 'western'], price: 25000, a: { hot: 0.5 } }),
    R('피자', { main: ['wheat', 'dairy'], tags: ['cheese', 'western'], price: 20000 }),
    R('토마토', { main: ['tomato'] }),
    R('프랑스|프렌치', { price: 60000, a: { quiet: 1, pricey: 1 } }),
    R('브런치', { main: ['egg', 'wheat'], tags: ['brunch'], price: 20000, a: { hot: 1 } }),
    R('베이커리|제과|빵|도넛|크로와상', { main: ['wheat'], tags: ['bread'], price: 9000, a: { hot: 0.5 } }),
    R('디저트|케이크|마카롱|아이스크림|빙수|와플', { main: ['dairy', 'egg'], tags: ['dessert'], price: 10000, a: { hot: 0.6 } }),
    R('빙수', { main: ['dairy'] }),
    R('커피|카페|로스터리', { tags: ['coffee'], price: 7000 }),
    R('찻집|전통찻집|티룸|티하우스', { tags: ['tea'], price: 9000, a: { quiet: 1 } }),
    R('북카페|책방', { a: { quiet: 1.2, hot: 0.2 } }),
    R('테마카페', { a: { hot: 0.6 } }),
    R('국수|칼국수|우동|라멘|라면|파스타', { main: ['wheat'], tags: ['noodle'] }),
    R('냉면|막국수|메밀|소바', { main: ['buckwheat'], tags: ['noodle'], price: 13000, a: { local: 0.4 } }),
    R('짬뽕|마라|훠궈', { tags: ['spicyfood'], spicy: 3 }),
    R('마라', { main: ['peanut'], spicy: 4, a: { hot: 0.4 } }),
    R('태국', { main: ['peanut', 'crustacean'], tags: ['cilantro'], spicy: 2, price: 18000, a: { hot: 0.4 } }),
    R('베트남|쌀국수', { main: ['beef'], tags: ['cilantro', 'noodle'], price: 14000 }),
    R('인도|커리|카레', { main: ['dairy'], tags: ['spicyfood'], spicy: 2, price: 16000 }),
    R('떡볶이|분식', { main: ['wheat'], tags: ['spicyfood'], spicy: 2, price: 10000, a: { cheap: 1, quiet: -0.5, hot: 0.2 } }),
    R('엽기|불닭|닭발|매운|실비', { tags: ['spicyfood'], spicy: 4 }),
    R('두부|순두부|콩국수', { main: ['soy'], tags: ['korean'], price: 11000 }),
    R('순두부', { spicy: 2 }),
    R('한정식|한식뷔페|정식', { tags: ['korean'], price: 35000, a: { quiet: 1, pricey: 0.6 } }),
    R('국밥|해장국|백반|기사식당|노포|순대국|감자탕', { tags: ['korean'], price: 11000, a: { local: 1.2, cheap: 1, hot: -0.4, quiet: -0.3 } }),
    R('버섯', { tags: ['mushroom'] }),
    R('치즈', { main: ['dairy'], tags: ['cheese'] }),
    R('패스트푸드|햄버거|버거', { main: ['wheat'], price: 12000, a: { cheap: 0.6, local: -0.5 } }),
    R('뷔페', { price: 50000, a: { pricey: 0.5 } }),
    R('루프탑|뷰|전망|한강|리버|스카이|오션|바다', { a: { view: 1.2, hot: 0.4 } }),
    R('술집|호프|요리주점|이자카야|일본식주점|포차|와인바|칵테일|펍|맥주', { bar: true, price: 25000 }),
    R('와인바|칵테일', { a: { quiet: 0.6, hot: 0.5 } }),
    R('시장', { a: { local: 1, cheap: 0.5 } }),
  ];

  /* 일반적인 영업시간 추정 (카카오 공식 API는 영업시간을 제공하지 않음 → 카테고리 기준 추정, 화면에 '확인 필요' 표기) */
  const H = (re, open, close, o) => Object.assign({ re: new RegExp(re), open: open * 60, close: close * 60 }, o || {});
  const HOURS = [
    H('미술관|박물관', 10, 18, { closed: [1] }),
    H('갤러리|전시', 11, 19, { closed: [1] }),
    H('팝업', 11, 20),
    H('공원|산책|거리|숲|한강', 0, 24),
    H('전망대|타워|스카이', 10, 22),
    H('야경|관광,명소', 0, 24),
    H('방탈출|보드', 11, 23.5),
    H('공방|원데이|클래스', 11, 20),
    H('쇼핑몰|백화점|아울렛', 10.5, 22),
    H('소품|편집샵|팝업', 11, 21),
    H('술집|호프|주점|이자카야|포차|와인바|칵테일|펍', 17, 26),
    H('브런치', 9, 16),
    H('베이커리|제과', 8, 21),
    H('카페|커피|디저트|찻집', 10, 22),
    H('국밥|해장국|기사식당', 6, 22),
    H('한정식|파인다이닝|오마카세|프랑스|스테이크', 11.5, 22, { brk: [15 * 60, 17 * 60 + 30] }),
    H('음식점', 11, 22),
  ];

  /*
   * 지역 DB (컨셉 기반 지역 추천용). s: 컨셉 적합도 0~1, crowd: 혼잡도, indoor: 실내 비중, parking: 주차 편의
   * hl: 컨셉별 추천 이유
   */
  const REGIONS = [
    { id: 'seongsu', name: '성수', station: '성수역', city: '서울', lat: 37.5446, lng: 127.0559, s: { photo: 0.9, food: 0.8, culture: 0.8, activity: 0.6, anniversary: 0.5, healing: 0.4, budget: 0.4, night: 0.4 }, crowd: 0.9, indoor: 0.7, parking: 0.3,
      hl: { photo: '감성 카페와 팝업스토어가 골목마다 있어 사진 찍을 곳이 많아요', culture: '주마다 바뀌는 팝업·전시가 가장 많은 동네예요', food: '요즘 뜨는 맛집이 몰려 있어요' } },
    { id: 'seoulforest', name: '서울숲', station: '서울숲역', city: '서울', lat: 37.5444, lng: 127.0374, s: { healing: 0.9, photo: 0.7, budget: 0.7, activity: 0.5, culture: 0.4, food: 0.6 }, crowd: 0.5, indoor: 0.2, parking: 0.6,
      hl: { healing: '넓은 숲길을 걷고 바로 옆 성수 카페로 이어져요', budget: '공원 산책은 무료라 예산을 아낄 수 있어요' } },
    { id: 'yeonnam', name: '연남동', station: '홍대입구역', city: '서울', lat: 37.5627, lng: 126.9256, s: { food: 0.9, healing: 0.6, photo: 0.7, budget: 0.7, activity: 0.5 }, crowd: 0.8, indoor: 0.5, parking: 0.2,
      hl: { food: '골목마다 개성 있는 작은 식당이 많아요', healing: '경의선숲길을 따라 걷기 좋아요' } },
    { id: 'mangwon', name: '망원', station: '망원역', city: '서울', lat: 37.556, lng: 126.91, s: { healing: 0.7, budget: 0.9, food: 0.7, night: 0.5 }, crowd: 0.5, indoor: 0.4, parking: 0.3,
      hl: { budget: '망원시장 덕분에 가성비 데이트가 가능해요', healing: '한강공원이 가까워 노을 보며 걷기 좋아요' } },
    { id: 'ikseon', name: '익선동', station: '종로3가역', city: '서울', lat: 37.5743, lng: 126.9898, s: { photo: 0.9, food: 0.7, anniversary: 0.5, culture: 0.5, night: 0.4 }, crowd: 0.8, indoor: 0.6, parking: 0.2,
      hl: { photo: '한옥 골목이 예뻐 커플 사진이 잘 나와요' } },
    { id: 'euljiro', name: '을지로', station: '을지로3가역', city: '서울', lat: 37.5663, lng: 126.991, s: { food: 0.8, night: 0.7, budget: 0.6, culture: 0.4 }, crowd: 0.6, indoor: 0.7, parking: 0.3,
      hl: { night: '노포와 숨은 바가 많아 밤 데이트에 좋아요', food: '오래된 노포 맛집이 많아요' } },
    { id: 'bukchon', name: '북촌·삼청동', station: '안국역', city: '서울', lat: 37.5826, lng: 126.983, s: { healing: 0.8, culture: 0.9, photo: 0.8, anniversary: 0.6 }, crowd: 0.6, indoor: 0.4, parking: 0.3,
      hl: { culture: '갤러리와 미술관이 걸어서 이어져요', healing: '한옥 골목을 천천히 걷기 좋아요' } },
    { id: 'seochon', name: '서촌', station: '경복궁역', city: '서울', lat: 37.58, lng: 126.97, s: { healing: 0.8, culture: 0.8, food: 0.6, budget: 0.5 }, crowd: 0.4, indoor: 0.5, parking: 0.3,
      hl: { healing: '사람이 덜 붐비고 조용한 골목이 많아요', culture: '작은 갤러리와 책방이 많아요' } },
    { id: 'hannam', name: '한남동', station: '한강진역', city: '서울', lat: 37.5345, lng: 127.001, s: { anniversary: 0.9, culture: 0.7, food: 0.8, photo: 0.6 }, crowd: 0.5, indoor: 0.7, parking: 0.5,
      hl: { anniversary: '분위기 좋은 레스토랑이 많아 기념일에 딱이에요', culture: '미술관과 디자인 쇼룸이 가까워요' } },
    { id: 'haebangchon', name: '해방촌', station: '녹사평역', city: '서울', lat: 37.543, lng: 126.987, s: { night: 0.9, photo: 0.7, anniversary: 0.6, food: 0.6 }, crowd: 0.5, indoor: 0.5, parking: 0.2,
      hl: { night: '언덕 위 루프탑에서 남산타워 야경이 보여요' } },
    { id: 'jamsil', name: '잠실·석촌호수', station: '잠실역', city: '서울', lat: 37.511, lng: 127.1, s: { activity: 0.9, night: 0.8, anniversary: 0.7, photo: 0.6, healing: 0.5 }, crowd: 0.8, indoor: 0.8, parking: 0.8,
      hl: { activity: '놀이공원·아쿠아리움 등 할 거리가 많아요', night: '호수 산책 + 타워 전망대 야경 코스가 가능해요' } },
    { id: 'songridan', name: '송리단길', station: '송파나루역', city: '서울', lat: 37.51, lng: 127.108, s: { food: 0.8, photo: 0.7, healing: 0.5 }, crowd: 0.6, indoor: 0.6, parking: 0.5,
      hl: { food: '석촌호수 옆 아기자기한 맛집 거리예요' } },
    { id: 'yeouido', name: '여의도', station: '여의나루역', city: '서울', lat: 37.527, lng: 126.933, s: { night: 0.8, healing: 0.7, activity: 0.6, budget: 0.6 }, crowd: 0.6, indoor: 0.5, parking: 0.7,
      hl: { night: '한강 야경과 공원 산책을 함께 즐겨요', healing: '탁 트인 한강공원에서 쉬어가기 좋아요' } },
    { id: 'mullae', name: '문래', station: '문래역', city: '서울', lat: 37.515, lng: 126.895, s: { culture: 0.7, budget: 0.7, photo: 0.6, activity: 0.5 }, crowd: 0.3, indoor: 0.6, parking: 0.4,
      hl: { culture: '철공소 사이 작업실·공방이 이색적이에요', budget: '붐비지 않고 물가도 착한 편이에요' } },
    { id: 'sinsa', name: '신사 가로수길', station: '신사역', city: '서울', lat: 37.5207, lng: 127.023, s: { food: 0.7, anniversary: 0.7, photo: 0.6, activity: 0.4 }, crowd: 0.7, indoor: 0.7, parking: 0.6,
      hl: { anniversary: '세련된 레스토랑과 쇼핑을 한 번에', photo: '감각적인 매장 외관이 많아요' } },
    { id: 'daehakro', name: '대학로', station: '혜화역', city: '서울', lat: 37.5822, lng: 127.0019, s: { activity: 0.8, culture: 0.9, budget: 0.8 }, crowd: 0.6, indoor: 0.8, parking: 0.4,
      hl: { activity: '방탈출·보드게임 카페가 밀집해 있어요', culture: '소극장 연극을 보고 낙산공원까지 걸을 수 있어요' } },
    { id: 'gwangalli', name: '광안리', station: '광안역', city: '부산', lat: 35.1532, lng: 129.1186, s: { night: 0.9, healing: 0.7, photo: 0.8, food: 0.6 }, crowd: 0.7, indoor: 0.4, parking: 0.5,
      hl: { night: '광안대교 야경을 보며 해변을 걸어요' } },
    { id: 'haeundae', name: '해운대', station: '해운대역', city: '부산', lat: 35.1631, lng: 129.1635, s: { anniversary: 0.8, activity: 0.7, night: 0.7, healing: 0.7 }, crowd: 0.7, indoor: 0.5, parking: 0.6,
      hl: { anniversary: '오션뷰 레스토랑이 많아 특별한 날에 좋아요' } },
    { id: 'jeonpo', name: '전포 카페거리', station: '전포역', city: '부산', lat: 35.1555, lng: 129.064, s: { photo: 0.8, food: 0.7, budget: 0.6 }, crowd: 0.6, indoor: 0.7, parking: 0.3,
      hl: { photo: '개성 있는 카페가 줄지어 있어요' } },
  ];

  /* 데모 모드(카카오 키 없음)용 예시 장소 템플릿. 실제 장소가 아니므로 화면에 '예시'로 표기 */
  const DEMO = {
    food: [
      ['소담 한정식', '음식점 > 한식 > 한정식'], ['골목 국밥집', '음식점 > 한식 > 해장국'], ['연기 삼겹살', '음식점 > 한식 > 육류,고기 > 삼겹살'],
      ['한우 다이닝 소', '음식점 > 한식 > 육류,고기 > 소고기'], ['바다 횟집', '음식점 > 일식 > 회'], ['스시 하루', '음식점 > 일식 > 초밥,롤'],
      ['오마카세 결', '음식점 > 일식 > 일식집'], ['라멘 이치', '음식점 > 일식 > 일본식라면'], ['트라토리아 봄', '음식점 > 양식 > 이탈리안'],
      ['화덕피자 공방', '음식점 > 양식 > 피자'], ['스테이크 하우스 온', '음식점 > 양식 > 스테이크,립'], ['브런치 모닝', '음식점 > 양식 > 브런치'],
      ['홍콩 반점', '음식점 > 중식 > 중화요리'], ['마라 연구소', '음식점 > 중식 > 중화요리'], ['방콕 키친', '음식점 > 아시아음식 > 태국음식'],
      ['포 하노이', '음식점 > 아시아음식 > 베트남음식'], ['칼국수 명가', '음식점 > 한식 > 국수 > 칼국수'], ['메밀 막국수', '음식점 > 한식 > 냉면'],
      ['꽃게 한상', '음식점 > 한식 > 해물,생선 > 게,대게'], ['조개구이 포차', '음식점 > 한식 > 해물,생선 > 조개'], ['엽떡 분식', '음식점 > 분식 > 떡볶이'],
      ['순두부 하우스', '음식점 > 한식 > 두부전문점'], ['루프탑 그릴 하늘', '음식점 > 양식 > 레스토랑'], ['곱창 골목', '음식점 > 한식 > 곱창,막창'],
      ['치킨 앤 비어', '음식점 > 치킨'], ['와인바 달빛', '음식점 > 술집 > 와인바'], ['쭈꾸미 불판', '음식점 > 한식 > 해물,생선 > 쭈꾸미'],
      ['카레 하우스', '음식점 > 아시아음식 > 인도음식'], ['돈까스 정', '음식점 > 일식 > 돈까스,우동'], ['한강뷰 레스토랑 리버', '음식점 > 양식 > 레스토랑'],
      ['기사식당 백반', '음식점 > 한식 > 백반'], ['버섯 샤브', '음식점 > 한식 > 샤브샤브'],
    ],
    cafe: [
      ['조용한 북카페 책방', '음식점 > 카페 > 북카페'], ['루프탑 카페 구름', '음식점 > 카페'], ['디저트 아틀리에', '음식점 > 카페 > 디저트카페'],
      ['베이커리 밀', '음식점 > 간식 > 제과,베이커리'], ['로스터리 원두', '음식점 > 카페 > 커피전문점'], ['한옥 찻집 다온', '음식점 > 카페 > 전통찻집'],
      ['빙수 하우스', '음식점 > 카페 > 디저트카페 > 빙수'], ['체인카페 예시점', '음식점 > 카페 > 커피전문점'], ['감성 카페 무드', '음식점 > 카페 > 테마카페'],
      ['뷰 카페 리버사이드', '음식점 > 카페'],
    ],
    exhibit: [['시립미술관 분관', '문화,예술 > 문화시설 > 미술관'], ['팝업스토어 위크', '가정,생활 > 팝업스토어'], ['사진 갤러리 빛', '문화,예술 > 문화시설 > 갤러리'], ['미디어아트 전시관', '문화,예술 > 문화시설 > 전시관']],
    walk: [['근린공원 숲길', '여행 > 공원 > 도시근린공원'], ['카페거리 산책로', '여행 > 관광,명소 > 거리'], ['강변 산책로', '여행 > 공원 > 한강공원']],
    experience: [['반지 공방 둘', '가정,생활 > 공방'], ['향수 공방 숨', '가정,생활 > 공방'], ['방탈출 미스터리', '스포츠,레저 > 방탈출카페'], ['보드게임카페 주사위', '음식점 > 카페 > 테마카페 > 보드카페'], ['도자기 원데이클래스', '교육,학문 > 원데이클래스']],
    shopping: [['소품샵 오늘', '가정,생활 > 소품샵'], ['편집샵 셀렉트', '가정,생활 > 편집샵'], ['복합쇼핑몰', '가정,생활 > 쇼핑몰']],
    nightview: [['스카이 전망대', '여행 > 관광,명소 > 전망대'], ['야경 명소 언덕', '여행 > 관광,명소'], ['루프탑 야경 스팟', '여행 > 관광,명소']],
    parking: [['공영주차장 A', '교통,수송 > 주차장'], ['공영주차장 B', '교통,수송 > 주차장'], ['민영주차장 C', '교통,수송 > 주차장']],
  };

  const DATA = { TRAITS, MBTI, ALLERGENS, FOODS, SPICY, TRANSPORT, BUDGETS, CONCEPTS, TIMES, DUR, PLACE_OPTIONS, FILTERS, ACTIVITIES, TRAIT_ACT, PLACE_RULES, HOURS, REGIONS, DEMO };
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  else root.DATA = DATA;
})(this);
