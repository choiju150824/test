/* 운동 데이터베이스 · 컨셉 정의 · 근력 기준표 */
(function (root) {
  // size: 근육 크기(볼륨 배분 가중치), recovery: 권장 회복 시간(시간)
  const MUSCLES = {
    chest:      { name: '가슴',     size: 3,   recovery: 48, group: '상체' },
    back:       { name: '등',       size: 3,   recovery: 48, group: '상체' },
    shoulders:  { name: '어깨',     size: 2,   recovery: 48, group: '상체' },
    traps:      { name: '승모',     size: 1,   recovery: 48, group: '상체' },
    biceps:     { name: '이두',     size: 1.5, recovery: 36, group: '팔' },
    triceps:    { name: '삼두',     size: 1.5, recovery: 36, group: '팔' },
    quads:      { name: '대퇴사두', size: 3,   recovery: 72, group: '하체' },
    hamstrings: { name: '햄스트링', size: 2,   recovery: 72, group: '하체' },
    glutes:     { name: '둔근',     size: 2,   recovery: 72, group: '하체' },
    calves:     { name: '종아리',   size: 1,   recovery: 36, group: '하체' },
    forearms:   { name: '전완',     size: 1,   recovery: 36, group: '팔' },
    abs:        { name: '복근',     size: 1,   recovery: 24, group: '코어' },
  };

  const PRESETS = [
    { name: '가슴+삼두', muscles: ['chest', 'triceps'] },
    { name: '등+이두',   muscles: ['back', 'biceps'] },
    { name: '어깨',      muscles: ['shoulders', 'traps'] },
    { name: '하체',      muscles: ['quads', 'hamstrings', 'glutes', 'calves'] },
    { name: '팔',        muscles: ['biceps', 'triceps'] },
    { name: '밀기(Push)', muscles: ['chest', 'shoulders', 'triceps'] },
    { name: '당기기(Pull)', muscles: ['back', 'biceps', 'traps'] },
    { name: '상체',      muscles: ['chest', 'back', 'shoulders', 'biceps', 'triceps'] },
    { name: '전신',      muscles: ['chest', 'back', 'shoulders', 'quads', 'hamstrings'] },
  ];

  /*
   * ratio  : 중급자 기준 '10회 가능한 무게' / 체중 (덤벨은 한 손 기준, 맨몸은 추가중량)
   * inc    : 기본 증량 단위(kg)
   * stim   : 자극(마인드-머슬) 적합도 1~5
   * pump   : 펌핑 적합도 1~5
   * fatigue: 전신 피로도 1~5 (다이어트/짧은 휴식에 부적합한 정도)
   * min    : 최소 무게 (바벨은 빈 봉 20kg)
   */
  const E = (id, name, muscle, type, equip, ratio, inc, stim, pump, fatigue, secondary = [], extra = {}) =>
    ({ id, name, muscle, type, equip, ratio, inc, stim, pump, fatigue, secondary, ...extra });

  const EXERCISES = [
    // 가슴
    E('bench',        '바벨 벤치프레스',         'chest', 'compound',  'barbell',  0.85, 2.5, 3, 2, 4, ['triceps', 'shoulders']),
    E('incline_db',   '인클라인 덤벨 프레스',     'chest', 'compound',  'dumbbell', 0.30, 2,   4, 3, 3, ['shoulders', 'triceps']),
    E('incline_bb',   '인클라인 바벨 프레스',     'chest', 'compound',  'barbell',  0.70, 2.5, 3, 2, 4, ['shoulders', 'triceps']),
    E('db_bench',     '덤벨 벤치프레스',         'chest', 'compound',  'dumbbell', 0.33, 2,   4, 3, 3, ['triceps']),
    E('chest_press',  '체스트 프레스 머신',       'chest', 'compound',  'machine',  0.80, 5,   4, 4, 2, ['triceps']),
    E('dips',         '딥스',                   'chest', 'compound',  'bodyweight', 0, 2.5,  3, 3, 3, ['triceps']),
    E('cable_fly',    '케이블 크로스오버',        'chest', 'isolation', 'cable',    0.15, 2.5, 5, 5, 1),
    E('pec_deck',     '펙덱 플라이',             'chest', 'isolation', 'machine',  0.60, 5,   5, 5, 1),
    E('db_fly',       '덤벨 플라이',             'chest', 'isolation', 'dumbbell', 0.15, 2,   4, 3, 2),
    // 등
    E('pullup',       '풀업(턱걸이)',            'back', 'compound',  'bodyweight', 0, 2.5,  3, 3, 3, ['biceps']),
    E('lat_pulldown', '랫 풀다운',               'back', 'compound',  'cable',    0.75, 5,   4, 4, 2, ['biceps']),
    E('bb_row',       '바벨 로우',               'back', 'compound',  'barbell',  0.75, 2.5, 3, 3, 4, ['biceps', 'traps']),
    E('db_row',       '원암 덤벨 로우',          'back', 'compound',  'dumbbell', 0.38, 2,   4, 3, 2, ['biceps']),
    E('seated_row',   '시티드 케이블 로우',       'back', 'compound',  'cable',    0.70, 5,   4, 4, 2, ['biceps', 'traps']),
    E('tbar_row',     'T바 로우',                'back', 'compound',  'machine',  0.60, 5,   3, 3, 3, ['biceps', 'traps']),
    E('straight_pd',  '스트레이트 암 풀다운',     'back', 'isolation', 'cable',    0.30, 2.5, 5, 5, 1),
    E('deadlift',     '컨벤셔널 데드리프트',      'back', 'compound',  'barbell',  1.40, 5,   2, 1, 5, ['hamstrings', 'glutes', 'traps']),
    // 어깨
    E('ohp',          '오버헤드 프레스',          'shoulders', 'compound',  'barbell',  0.50, 2.5, 3, 2, 4, ['triceps']),
    E('db_shoulder',  '덤벨 숄더 프레스',         'shoulders', 'compound',  'dumbbell', 0.24, 2,   4, 3, 3, ['triceps']),
    E('shoulder_m',   '숄더 프레스 머신',         'shoulders', 'compound',  'machine',  0.50, 5,   4, 4, 2, ['triceps']),
    E('lateral',      '사이드 레터럴 레이즈',     'shoulders', 'isolation', 'dumbbell', 0.10, 1,   5, 5, 1),
    E('cable_lateral','케이블 레터럴 레이즈',     'shoulders', 'isolation', 'cable',    0.07, 1.25,5, 5, 1),
    E('rear_delt',    '리어 델트 플라이 머신',     'shoulders', 'isolation', 'machine',  0.40, 5,   5, 4, 1),
    E('face_pull',    '페이스 풀',               'shoulders', 'isolation', 'cable',    0.30, 2.5, 4, 4, 1, ['traps']),
    // 승모
    E('shrug',        '덤벨 슈러그',             'traps', 'isolation', 'dumbbell', 0.40, 2,   4, 4, 1),
    // 이두
    E('bb_curl',      'EZ바 컬',                 'biceps', 'isolation', 'barbell',  0.35, 2.5, 3, 4, 1, [], { min: 10 }),
    E('db_curl',      '덤벨 컬',                 'biceps', 'isolation', 'dumbbell', 0.15, 2,   4, 4, 1),
    E('hammer',       '해머 컬',                 'biceps', 'isolation', 'dumbbell', 0.16, 2,   3, 4, 1),
    E('incline_curl', '인클라인 덤벨 컬',         'biceps', 'isolation', 'dumbbell', 0.12, 2,   5, 4, 1),
    E('cable_curl',   '케이블 컬',               'biceps', 'isolation', 'cable',    0.30, 2.5, 4, 5, 1),
    E('preacher',     '프리처 컬 머신',           'biceps', 'isolation', 'machine',  0.35, 2.5, 5, 4, 1),
    // 삼두
    E('close_bench',  '클로즈그립 벤치프레스',     'triceps', 'compound',  'barbell', 0.70, 2.5, 3, 2, 3, ['chest']),
    E('pushdown',     '케이블 푸시다운',          'triceps', 'isolation', 'cable',   0.35, 2.5, 4, 5, 1),
    E('oh_ext',       '오버헤드 케이블 익스텐션',  'triceps', 'isolation', 'cable',   0.30, 2.5, 5, 4, 1),
    E('skull',        '라잉 트라이셉스 익스텐션',  'triceps', 'isolation', 'barbell', 0.35, 2.5, 4, 3, 1, [], { min: 10 }),
    // 대퇴사두
    E('squat',        '바벨 백스쿼트',            'quads', 'compound',  'barbell',  1.10, 5,  3, 2, 5, ['glutes', 'hamstrings']),
    E('leg_press',    '레그 프레스',             'quads', 'compound',  'machine',  2.20, 10, 4, 3, 3, ['glutes']),
    E('hack_squat',   '핵 스쿼트',               'quads', 'compound',  'machine',  1.00, 5,  4, 3, 4, ['glutes']),
    E('bulgarian',    '불가리안 스플릿 스쿼트',    'quads', 'compound',  'dumbbell', 0.20, 2,  4, 3, 3, ['glutes']),
    E('leg_ext',      '레그 익스텐션',            'quads', 'isolation', 'machine',  0.60, 5,  5, 5, 1),
    // 햄스트링
    E('rdl',          '루마니안 데드리프트',       'hamstrings', 'compound',  'barbell', 0.90, 5, 4, 2, 4, ['glutes', 'back']),
    E('lying_curl',   '라잉 레그 컬',             'hamstrings', 'isolation', 'machine', 0.45, 5, 5, 4, 1),
    E('seated_curl',  '시티드 레그 컬',           'hamstrings', 'isolation', 'machine', 0.50, 5, 5, 4, 1),
    // 둔근
    E('hip_thrust',   '바벨 힙 쓰러스트',         'glutes', 'compound',  'barbell', 1.10, 5,   4, 3, 3, ['hamstrings']),
    E('hip_abd',      '힙 어브덕션 머신',          'glutes', 'isolation', 'machine', 0.70, 5,   5, 5, 1),
    E('kickback',     '케이블 킥백',              'glutes', 'isolation', 'cable',   0.15, 2.5, 5, 4, 1),
    // 종아리
    E('calf_stand',   '스탠딩 카프 레이즈',        'calves', 'isolation', 'machine', 1.00, 5, 4, 5, 1),
    E('calf_seated',  '시티드 카프 레이즈',        'calves', 'isolation', 'machine', 0.50, 5, 5, 5, 1),
    // 복근
    E('cable_crunch', '케이블 크런치',            'abs', 'isolation', 'cable',      0.50, 5,   5, 4, 1),
    E('leg_raise',    '행잉 레그 레이즈',          'abs', 'isolation', 'bodyweight', 0,    2.5, 4, 3, 1),
    E('ab_wheel',     '앱 롤아웃',               'abs', 'isolation', 'bodyweight', 0,    2.5, 4, 3, 2),

    // ---- 확장 종목 ----
    // 가슴
    E('decline_bb',     '디클라인 바벨 프레스',      'chest', 'compound',  'barbell',  0.85, 2.5, 3, 2, 3, ['triceps'], { pattern: 'flat' }),
    E('smith_bench',    '스미스 머신 벤치프레스',     'chest', 'compound',  'machine',  0.75, 2.5, 3, 3, 3, ['triceps'], { pattern: 'flat' }),
    E('smith_incline',  '스미스 인클라인 프레스',     'chest', 'compound',  'machine',  0.65, 2.5, 4, 3, 3, ['shoulders'], { pattern: 'incline' }),
    E('incline_press_m','인클라인 체스트 프레스 머신', 'chest', 'compound',  'machine',  0.70, 5,   4, 4, 2, ['shoulders'], { pattern: 'incline' }),
    E('incline_db_fly', '인클라인 덤벨 플라이',       'chest', 'isolation', 'dumbbell', 0.13, 2,   4, 3, 1, [], { pattern: 'fly' }),
    E('high_cable_fly', '하이 케이블 플라이',         'chest', 'isolation', 'cable',    0.15, 2.5, 5, 5, 1, [], { pattern: 'fly' }),
    E('low_cable_fly',  '로우 케이블 플라이',         'chest', 'isolation', 'cable',    0.12, 2.5, 5, 5, 1, [], { pattern: 'fly' }),
    E('pushup',         '푸시업',                   'chest', 'compound',  'bodyweight', 0,  2.5, 3, 4, 2, ['triceps'], { pattern: 'flat' }),
    E('db_pullover',    '덤벨 풀오버',               'chest', 'isolation', 'dumbbell', 0.30, 2,   4, 3, 1, ['back'], { pattern: 'pullover' }),
    // 등
    E('chinup',         '친업',                     'back', 'compound',  'bodyweight', 0,  2.5, 3, 3, 3, ['biceps'], { pattern: 'vertical' }),
    E('close_pulldown', '클로즈그립 랫 풀다운',       'back', 'compound',  'cable',    0.70, 5,   4, 4, 2, ['biceps'], { pattern: 'vertical' }),
    E('pulldown_m',     '머신 랫 풀다운',            'back', 'compound',  'machine',  0.70, 5,   4, 4, 2, ['biceps'], { pattern: 'vertical' }),
    E('single_pulldown','원암 케이블 풀다운',         'back', 'compound',  'cable',    0.25, 2.5, 5, 4, 1, ['biceps'], { pattern: 'vertical' }),
    E('row_m',          '시티드 로우 머신',          'back', 'compound',  'machine',  0.65, 5,   4, 4, 2, ['biceps', 'traps'], { pattern: 'horizontal' }),
    E('pendlay',        '펜들레이 로우',             'back', 'compound',  'barbell',  0.70, 2.5, 3, 2, 4, ['biceps', 'traps'], { pattern: 'horizontal' }),
    E('chest_sup_row',  '체스트 서포티드 덤벨 로우',   'back', 'compound',  'dumbbell', 0.30, 2,   5, 4, 1, ['biceps'], { pattern: 'horizontal' }),
    E('meadows',        '메도우스 로우',             'back', 'compound',  'barbell',  0.40, 2.5, 4, 3, 2, ['biceps'], { pattern: 'horizontal', min: 5 }),
    E('back_ext',       '백 익스텐션',               'back', 'compound',  'bodyweight', 0,  2.5, 4, 3, 2, ['glutes', 'hamstrings'], { pattern: 'extension' }),
    E('rack_pull',      '랙 풀',                    'back', 'compound',  'barbell',  1.50, 5,   2, 1, 4, ['traps', 'glutes'], { pattern: 'hinge' }),
    E('cable_pullover', '로프 케이블 풀오버',         'back', 'isolation', 'cable',    0.30, 2.5, 5, 5, 1, [], { pattern: 'pullover' }),
    // 어깨
    E('arnold',         '아놀드 프레스',             'shoulders', 'compound',  'dumbbell', 0.20, 2,    4, 3, 2, ['triceps'], { pattern: 'press' }),
    E('smith_ohp',      '스미스 오버헤드 프레스',     'shoulders', 'compound',  'machine',  0.45, 2.5,  3, 3, 3, ['triceps'], { pattern: 'press' }),
    E('lateral_m',      '레터럴 레이즈 머신',         'shoulders', 'isolation', 'machine',  0.35, 5,    5, 5, 1, [], { pattern: 'lateral' }),
    E('upright_row',    '업라이트 로우',             'shoulders', 'compound',  'barbell',  0.40, 2.5,  4, 4, 2, ['traps'], { pattern: 'upright' }),
    E('front_raise',    '프론트 레이즈',             'shoulders', 'isolation', 'dumbbell', 0.10, 1,    4, 4, 1, [], { pattern: 'front' }),
    E('rear_delt_db',   '벤트오버 리어 델트 레이즈',   'shoulders', 'isolation', 'dumbbell', 0.08, 1,    5, 4, 1, [], { pattern: 'rear' }),
    E('rev_cable_fly',  '케이블 리버스 플라이',       'shoulders', 'isolation', 'cable',    0.07, 1.25, 5, 4, 1, [], { pattern: 'rear' }),
    // 승모
    E('bb_shrug',       '바벨 슈러그',               'traps', 'isolation', 'barbell',  1.00, 5, 3, 3, 2, [], { pattern: 'shrug' }),
    E('shrug_m',        '슈러그 머신',               'traps', 'isolation', 'machine',  1.00, 5, 4, 4, 1, [], { pattern: 'shrug' }),
    E('farmer',         '파머스 워크',               'traps', 'compound',  'dumbbell', 0.45, 2, 2, 3, 3, ['forearms'], { pattern: 'carry' }),
    // 이두
    E('bb_curl_straight','스트레이트 바벨 컬',        'biceps', 'isolation', 'barbell',  0.38, 2.5,  3, 4, 1, [], { pattern: 'curl', min: 10 }),
    E('spider_curl',    '스파이더 컬',               'biceps', 'isolation', 'dumbbell', 0.11, 2,    5, 4, 1, [], { pattern: 'short' }),
    E('conc_curl',      '컨센트레이션 컬',           'biceps', 'isolation', 'dumbbell', 0.12, 2,    5, 4, 1, [], { pattern: 'short' }),
    E('bayesian',       '베이지안 케이블 컬',         'biceps', 'isolation', 'cable',    0.12, 1.25, 5, 4, 1, [], { pattern: 'stretch' }),
    E('rope_hammer',    '로프 해머 컬',              'biceps', 'isolation', 'cable',    0.30, 2.5,  3, 5, 1, ['forearms'], { pattern: 'hammer' }),
    // 삼두
    E('rope_pushdown',  '로프 푸시다운',             'triceps', 'isolation', 'cable',    0.30, 2.5,  5, 5, 1, [], { pattern: 'pushdown' }),
    E('single_pushdown','원암 케이블 푸시다운',       'triceps', 'isolation', 'cable',    0.12, 1.25, 5, 4, 1, [], { pattern: 'pushdown' }),
    E('db_oh_ext',      '덤벨 오버헤드 익스텐션',     'triceps', 'isolation', 'dumbbell', 0.28, 2,    4, 4, 1, [], { pattern: 'overhead' }),
    E('tri_kickback',   '덤벨 킥백',                 'triceps', 'isolation', 'dumbbell', 0.08, 1,    5, 4, 1, [], { pattern: 'kick' }),
    E('dips_m',         '딥스 머신',                 'triceps', 'compound',  'machine',  0.80, 5,    3, 4, 2, ['chest'], { pattern: 'dip' }),
    E('bench_dips',     '벤치 딥스',                 'triceps', 'compound',  'bodyweight', 0,  2.5,  3, 4, 1, ['chest'], { pattern: 'dip' }),
    E('jm_press',       'JM 프레스',                 'triceps', 'compound',  'barbell',  0.50, 2.5,  4, 3, 2, ['chest'], { pattern: 'press' }),
    // 전완
    E('wrist_curl',     '리스트 컬',                 'forearms', 'isolation', 'barbell',  0.30, 2.5, 4, 5, 1, [], { pattern: 'flex', min: 10 }),
    E('rev_wrist_curl', '리버스 리스트 컬',           'forearms', 'isolation', 'barbell',  0.15, 2.5, 4, 5, 1, [], { pattern: 'ext', min: 10 }),
    E('reverse_curl',   '리버스 컬',                 'forearms', 'isolation', 'barbell',  0.25, 2.5, 3, 4, 1, ['biceps'], { pattern: 'hammer', min: 10 }),
    // 대퇴사두
    E('front_squat',    '프론트 스쿼트',             'quads', 'compound',  'barbell',  0.85, 5,   4, 2, 5, ['glutes'], { pattern: 'squat' }),
    E('smith_squat',    '스미스 스쿼트',             'quads', 'compound',  'machine',  0.90, 5,   4, 3, 4, ['glutes'], { pattern: 'squat' }),
    E('goblet',         '고블릿 스쿼트',             'quads', 'compound',  'dumbbell', 0.35, 2,   4, 3, 3, ['glutes'], { pattern: 'squat' }),
    E('pendulum',       '펜듈럼 스쿼트',             'quads', 'compound',  'machine',  0.80, 5,   5, 4, 3, ['glutes'], { pattern: 'squat' }),
    E('vsquat',         '브이 스쿼트 머신',          'quads', 'compound',  'machine',  1.00, 5,   4, 3, 3, ['glutes'], { pattern: 'squat' }),
    E('lunge',          '덤벨 런지',                 'quads', 'compound',  'dumbbell', 0.22, 2,   4, 3, 3, ['glutes'], { pattern: 'lunge' }),
    E('walking_lunge',  '워킹 런지',                 'quads', 'compound',  'dumbbell', 0.20, 2,   4, 4, 3, ['glutes'], { pattern: 'lunge' }),
    E('step_up',        '스텝업',                   'quads', 'compound',  'dumbbell', 0.20, 2,   4, 3, 2, ['glutes'], { pattern: 'lunge' }),
    E('sissy',          '시시 스쿼트',               'quads', 'isolation', 'bodyweight', 0,  2.5, 5, 4, 1, [], { pattern: 'ext' }),
    // 햄스트링
    E('standing_curl',  '스탠딩 원레그 컬',           'hamstrings', 'isolation', 'machine',  0.20, 2.5, 5, 4, 1, [], { pattern: 'curl' }),
    E('db_rdl',         '덤벨 루마니안 데드리프트',    'hamstrings', 'compound',  'dumbbell', 0.40, 2,   4, 3, 3, ['glutes'], { pattern: 'hinge' }),
    E('sl_rdl',         '싱글레그 RDL',              'hamstrings', 'compound',  'dumbbell', 0.25, 2,   5, 3, 2, ['glutes'], { pattern: 'hinge' }),
    E('good_morning',   '굿모닝',                   'hamstrings', 'compound',  'barbell',  0.50, 2.5, 4, 2, 3, ['glutes', 'back'], { pattern: 'hinge' }),
    E('nordic',         '노르딕 햄스트링 컬',         'hamstrings', 'isolation', 'bodyweight', 0,  2.5, 5, 3, 2, [], { pattern: 'curl' }),
    // 둔근
    E('glute_bridge',   '바벨 글루트 브릿지',          'glutes', 'compound',  'barbell', 1.00, 5,    4, 4, 2, ['hamstrings'], { pattern: 'thrust' }),
    E('hip_thrust_m',   '힙 쓰러스트 머신',          'glutes', 'compound',  'machine', 1.00, 5,    5, 4, 2, ['hamstrings'], { pattern: 'thrust' }),
    E('sumo_dl',        '스모 데드리프트',           'glutes', 'compound',  'barbell', 1.40, 5,    2, 1, 5, ['quads', 'back'], { pattern: 'hinge' }),
    E('pull_through',   '케이블 풀스루',             'glutes', 'compound',  'cable',   0.40, 2.5,  4, 3, 2, ['hamstrings'], { pattern: 'hinge' }),
    E('cable_abd',      '케이블 힙 어브덕션',         'glutes', 'isolation', 'cable',   0.08, 1.25, 5, 4, 1, [], { pattern: 'abd' }),
    // 종아리
    E('lp_calf',        '레그프레스 카프 레이즈',     'calves', 'isolation', 'machine',  1.50, 10, 4, 5, 1, [], { pattern: 'straight' }),
    E('smith_calf',     '스미스 카프 레이즈',         'calves', 'isolation', 'machine',  1.00, 5,  4, 5, 1, [], { pattern: 'straight' }),
    E('single_calf',    '덤벨 싱글 카프 레이즈',      'calves', 'isolation', 'dumbbell', 0.15, 2,  5, 5, 1, [], { pattern: 'straight' }),
    // 복근
    E('crunch',         '크런치',                   'abs', 'isolation', 'bodyweight', 0,    2.5, 4, 4, 1, [], { pattern: 'flex' }),
    E('decline_situp',  '디클라인 싯업',             'abs', 'isolation', 'bodyweight', 0,    2.5, 3, 3, 1, [], { pattern: 'flex' }),
    E('ab_crunch_m',    '앱 크런치 머신',            'abs', 'isolation', 'machine',    0.50, 5,   5, 4, 1, [], { pattern: 'flex' }),
    E('hanging_knee',   '행잉 니 레이즈',            'abs', 'isolation', 'bodyweight', 0,    2.5, 4, 3, 1, [], { pattern: 'hip' }),
    E('lying_leg_raise','라잉 레그 레이즈',           'abs', 'isolation', 'bodyweight', 0,    2.5, 4, 3, 1, [], { pattern: 'hip' }),
    E('russian_twist',  '러시안 트위스트',           'abs', 'isolation', 'bodyweight', 0,    2.5, 3, 3, 1, [], { pattern: 'rotation' }),
    E('woodchop',       '케이블 우드찹',             'abs', 'isolation', 'cable',      0.20, 2.5, 4, 3, 1, [], { pattern: 'rotation' }),
  ];

  // 검색용 영문명/별칭 (공백 무시 부분일치 + 초성 검색과 함께 사용)
  const ALIAS = {
    bench: 'bench press 벤치 플랫벤치', incline_db: 'incline dumbbell press 인덤', incline_bb: 'incline bench press 인클벤치',
    db_bench: 'dumbbell bench press 덤벤', chest_press: 'chest press machine', dips: 'dips', cable_fly: 'cable crossover fly',
    pec_deck: 'pec deck fly 펙덱 버터플라이', db_fly: 'dumbbell fly', pullup: 'pull up pullup 턱걸이', lat_pulldown: 'lat pulldown 랫풀',
    bb_row: 'barbell row 바벨로우 벤트오버로우', db_row: 'one arm dumbbell row 덤벨로우', seated_row: 'seated cable row 케이블로우',
    tbar_row: 't-bar row 티바로우', straight_pd: 'straight arm pulldown 암풀다운', deadlift: 'deadlift 데드 컨벤',
    ohp: 'overhead press ohp military press 밀프 밀리터리프레스', db_shoulder: 'dumbbell shoulder press 덤숄프', shoulder_m: 'shoulder press machine',
    lateral: 'lateral raise 사레레 사이드레이즈', cable_lateral: 'cable lateral raise 케사레', rear_delt: 'rear delt fly reverse pec deck 리버스펙덱',
    face_pull: 'face pull', shrug: 'dumbbell shrug', bb_curl: 'ez bar curl 이지바컬', db_curl: 'dumbbell curl 덤컬', hammer: 'hammer curl',
    incline_curl: 'incline dumbbell curl', cable_curl: 'cable curl', preacher: 'preacher curl 프리쳐', close_bench: 'close grip bench press 클벤',
    pushdown: 'tricep pushdown 푸쉬다운 케이블푸시다운', oh_ext: 'overhead tricep extension', skull: 'skull crusher lying tricep extension 스컬크러셔',
    squat: 'back squat 스쿼트 백스쿼트', leg_press: 'leg press 레그프레스', hack_squat: 'hack squat', bulgarian: 'bulgarian split squat 불스',
    leg_ext: 'leg extension 레그익스텐션', rdl: 'romanian deadlift rdl 루마니안', lying_curl: 'lying leg curl', seated_curl: 'seated leg curl',
    hip_thrust: 'hip thrust 힙쓰러스트 힙트러스트', hip_abd: 'hip abduction 어브덕션 아웃타이', kickback: 'cable kickback glute',
    calf_stand: 'standing calf raise 카프', calf_seated: 'seated calf raise', cable_crunch: 'cable crunch', leg_raise: 'hanging leg raise',
    ab_wheel: 'ab wheel rollout 롤아웃', decline_bb: 'decline bench press', smith_bench: 'smith bench press', smith_incline: 'smith incline press',
    incline_press_m: 'incline chest press machine', high_cable_fly: 'high cable fly', low_cable_fly: 'low cable fly', pushup: 'push up 팔굽혀펴기',
    db_pullover: 'dumbbell pullover', chinup: 'chin up', close_pulldown: 'close grip pulldown v grip', pulldown_m: 'machine pulldown',
    row_m: 'seated row machine', pendlay: 'pendlay row', chest_sup_row: 'chest supported row', meadows: 'meadows row landmine',
    back_ext: 'back extension hyperextension 하이퍼익스텐션', rack_pull: 'rack pull', cable_pullover: 'cable pullover rope', arnold: 'arnold press',
    smith_ohp: 'smith overhead press', lateral_m: 'lateral raise machine', upright_row: 'upright row', front_raise: 'front raise',
    rear_delt_db: 'bent over rear delt raise', rev_cable_fly: 'reverse cable fly', bb_shrug: 'barbell shrug', shrug_m: 'shrug machine',
    farmer: 'farmers walk carry', bb_curl_straight: 'barbell curl', spider_curl: 'spider curl', conc_curl: 'concentration curl',
    bayesian: 'bayesian cable curl', rope_hammer: 'rope hammer curl', rope_pushdown: 'rope pushdown', single_pushdown: 'single arm pushdown',
    db_oh_ext: 'dumbbell overhead extension', tri_kickback: 'tricep kickback', dips_m: 'dip machine', bench_dips: 'bench dips',
    jm_press: 'jm press', wrist_curl: 'wrist curl', rev_wrist_curl: 'reverse wrist curl', reverse_curl: 'reverse curl',
    front_squat: 'front squat', smith_squat: 'smith squat', goblet: 'goblet squat', pendulum: 'pendulum squat', vsquat: 'v squat',
    lunge: 'dumbbell lunge', walking_lunge: 'walking lunge', step_up: 'step up', sissy: 'sissy squat', standing_curl: 'standing leg curl',
    db_rdl: 'dumbbell rdl', sl_rdl: 'single leg rdl', good_morning: 'good morning', nordic: 'nordic curl', glute_bridge: 'glute bridge',
    hip_thrust_m: 'hip thrust machine', sumo_dl: 'sumo deadlift', pull_through: 'cable pull through', cable_abd: 'cable hip abduction',
    lp_calf: 'leg press calf raise', smith_calf: 'smith calf raise', single_calf: 'single leg calf raise', crunch: 'crunch',
    decline_situp: 'decline sit up 윗몸일으키기', ab_crunch_m: 'ab crunch machine', hanging_knee: 'hanging knee raise',
    lying_leg_raise: 'lying leg raise', russian_twist: 'russian twist', woodchop: 'cable woodchop',
  };
  EXERCISES.forEach((e) => { e.alias = ALIAS[e.id] || ''; });

  const EQUIP = { barbell: '바벨', dumbbell: '덤벨', machine: '머신', cable: '케이블', bodyweight: '맨몸' };

  /*
   * 컨셉별 처방 파라미터
   * reps: [하한, 상한] (더블 프로그레션 범위)
   * rir : 남겨둘 반복 수 (Reps In Reserve)
   * intensity: 같은 반복 범위 대비 무게 보정 (자극위주는 템포가 느려서 가볍게)
   * pref: 종목 선택 시 가중치 (compound=다관절 선호, stim/pump=적합도 선호, fatigue=피로 패널티)
   */
  const CONCEPTS = {
    hypertrophy: {
      name: '근성장', emoji: '💪',
      desc: '6~15회 범위, 실패 1~2회 전까지. 다관절 → 고립 순서로 기계적 장력 극대화.',
      reps: { compound: [6, 10], isolation: [10, 15] },
      sets: { compound: 4, isolation: 3 },
      rest: { compound: 150, isolation: 90 },
      rir: 1.5, rirText: '1~2', tempo: '2-0-1 (내릴 때 2초)',
      intensity: 1.0,
      pref: { compound: 3, stim: 1, pump: 0, fatigue: 0 },
      tip: '매 세션 무게 또는 반복수 중 하나는 늘리는 것이 목표입니다.',
    },
    strength: {
      name: '근력', emoji: '🏋️',
      desc: '저반복 고중량. 주요 다관절 종목 위주, 충분한 휴식.',
      reps: { compound: [3, 6], isolation: [8, 12] },
      sets: { compound: 5, isolation: 3 },
      rest: { compound: 210, isolation: 120 },
      rir: 2, rirText: '2', tempo: '컨트롤 하강, 폭발적 상승',
      intensity: 1.0,
      pref: { compound: 5, stim: 0, pump: 0, fatigue: -0.5 },
      tip: '실패 지점까지 가지 말고 폼이 무너지기 전에 끊으세요.',
    },
    diet: {
      name: '다이어트', emoji: '🔥',
      desc: '근손실 방지 + 칼로리 소모. 슈퍼세트·짧은 휴식, 마무리 유산소.',
      reps: { compound: [8, 12], isolation: [12, 20] },
      sets: { compound: 3, isolation: 3 },
      rest: { compound: 75, isolation: 45 },
      rir: 2, rirText: '1~3', tempo: '2-0-1',
      intensity: 1.0,
      pref: { compound: 2, stim: 0, pump: 1, fatigue: 1.5 },
      superset: true,
      cardio: '마무리 유산소: 인클라인 트레드밀 (경사 10~12%, 5~6km/h) 20분 또는 사이클 인터벌 15분',
      tip: '감량기에도 무게는 최대한 유지하는 것이 근손실 방지의 핵심입니다.',
    },
    stimulus: {
      name: '자극위주', emoji: '🎯',
      desc: '느린 이완 템포와 수축 정지로 타깃 근육에 집중. 머신/케이블 위주.',
      reps: { compound: [8, 12], isolation: [12, 15] },
      sets: { compound: 3, isolation: 3 },
      rest: { compound: 90, isolation: 75 },
      rir: 1, rirText: '1', tempo: '3-1-1-1 (3초 이완 · 1초 정지 · 1초 수축 · 1초 쥐어짜기)',
      intensity: 0.85,
      pref: { compound: 0, stim: 4, pump: 1, fatigue: 1 },
      technique: '최대 수축 지점에서 1초 쥐어짜기. 반동 금지.',
      tip: '무게보다 타깃 근육의 느낌이 우선입니다. 보조근이 개입되면 무게를 줄이세요.',
    },
    pump: {
      name: '펌핑위주', emoji: '🩸',
      desc: '고반복·짧은 휴식으로 대사 스트레스 극대화. 마지막 세트 드롭세트.',
      reps: { compound: [12, 15], isolation: [15, 25] },
      sets: { compound: 3, isolation: 4 },
      rest: { compound: 60, isolation: 35 },
      rir: 0.5, rirText: '0~1', tempo: '1-0-1 (끊김 없이 연속)',
      intensity: 1.0,
      pref: { compound: 0, stim: 1, pump: 4, fatigue: 1.5 },
      technique: '마지막 세트: 실패 후 무게 -20% 로 2회 드롭세트.',
      tip: '근육이 꽉 찬 느낌이 목표. 휴식 시간을 엄격히 지키세요.',
    },
  };

  // 움직임 패턴: 한 부위 안에서 같은 패턴이 겹치지 않도록 다양성 확보
  const PATTERNS = {
    shrug: 'shrug', bench: 'flat', db_bench: 'flat', chest_press: 'flat', dips: 'dip', incline_db: 'incline', incline_bb: 'incline',
    cable_fly: 'fly', pec_deck: 'fly', db_fly: 'fly',
    pullup: 'vertical', lat_pulldown: 'vertical', bb_row: 'horizontal', db_row: 'horizontal', seated_row: 'horizontal',
    tbar_row: 'horizontal', straight_pd: 'pullover', deadlift: 'hinge',
    ohp: 'press', db_shoulder: 'press', shoulder_m: 'press', lateral: 'lateral', cable_lateral: 'lateral', rear_delt: 'rear', face_pull: 'rear',
    bb_curl: 'curl', db_curl: 'curl', cable_curl: 'curl', hammer: 'hammer', incline_curl: 'stretch', preacher: 'short',
    close_bench: 'press', pushdown: 'pushdown', oh_ext: 'overhead', skull: 'overhead',
    squat: 'squat', leg_press: 'squat', hack_squat: 'squat', bulgarian: 'lunge', leg_ext: 'ext',
    rdl: 'hinge', lying_curl: 'curl', seated_curl: 'curl', hip_thrust: 'thrust', hip_abd: 'abd', kickback: 'kick',
    calf_stand: 'straight', calf_seated: 'bent', cable_crunch: 'flex', leg_raise: 'hip', ab_wheel: 'anti',
  };
  // 메인 리프트: 근성장/근력 컨셉에서 우선 배치 (점진적 과부하 추적의 기준)
  const MAIN = ['bench', 'lat_pulldown', 'bb_row', 'ohp', 'squat', 'rdl', 'hip_thrust', 'close_bench'];
  EXERCISES.forEach((e) => { e.pattern = e.pattern || PATTERNS[e.id]; e.main = MAIN.includes(e.id); });

  // 근력 기준표: e1RM / 체중 이 각 값 이상이면 발달도 +1 (1~5단계)
  const STANDARDS = {
    chest:      { ex: ['bench'],             t: [0.6, 0.85, 1.1, 1.35, 1.6] },
    back:       { ex: ['bb_row', 'lat_pulldown'], t: [0.55, 0.75, 0.95, 1.15, 1.35] },
    shoulders:  { ex: ['ohp'],               t: [0.4, 0.55, 0.7, 0.85, 1.0] },
    quads:      { ex: ['squat'],             t: [0.8, 1.1, 1.4, 1.75, 2.1] },
    hamstrings: { ex: ['rdl', 'deadlift'],   t: [0.9, 1.2, 1.5, 1.85, 2.2] },
    glutes:     { ex: ['hip_thrust'],        t: [0.9, 1.3, 1.7, 2.1, 2.5] },
    biceps:     { ex: ['bb_curl'],           t: [0.3, 0.42, 0.55, 0.65, 0.8] },
    triceps:    { ex: ['close_bench'],       t: [0.5, 0.7, 0.9, 1.1, 1.3] },
  };

  const DEV_LABELS = ['', '매우 약함', '약함', '보통', '발달', '매우 발달'];
  const LEVELS = { beginner: { name: '초급 (1년 미만)', factor: 0.65 }, intermediate: { name: '중급 (1~3년)', factor: 1.0 }, advanced: { name: '상급 (3년 이상)', factor: 1.3 } };

  const DATA = { MUSCLES, PRESETS, EXERCISES, CONCEPTS, STANDARDS, DEV_LABELS, LEVELS, EQUIP };
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  else root.DATA = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
