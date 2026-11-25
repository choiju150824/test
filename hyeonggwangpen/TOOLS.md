# 형광펜뉴스 도구 사용법 (에디터용)

운영 규칙은 `prompt.md`. 이 문서는 그 규칙을 실행할 때 쓰는 스크립트 안내다.
모든 명령은 이 폴더(`hyeonggwangpen\`)에서 실행한다. 토큰 값은 절대 출력하지 않는다.

## 매 실행 순서
1. `python status.py` → `should_run`, `reasons`, 최근 7일 로그, 오늘 카테고리·기업 수, 직전 훅 3개, 정정 대기, 사후 관리 후보를 확인한다.
2. `should_run`이 false면: 사후 관리(`followup_candidate`)와 `python comments.py scan`만 하고 끝낸다.
3. 정정 대기가 있으면 정정 피드(3장)를 만든다. 게시 후 `python status.py correction done <media_id>`.
4. 아니면 소재 선정 → 사실 확인 → `posts\YYYYMMDD-HHMM.json` 작성 → `python render.py <json>` → PNG를 직접 열어 눈으로 검수 → 고칠 것 고친 뒤 → `python publish.py prepare <json>`.
5. 건너뛰면 `python status.py skip <slot> "<이유>"` 로 반드시 남긴다 (같은 회차 중복 실행 방지).
6. 사후 관리 결과: `python status.py followup <media_id> ok|correction_needed "<메모>"`.
   틀린 사실이면 `python status.py correction add <media_id> "<틀린 내용>" "<바른 내용>" "<출처 URL>"` 후 운영자 알림.

## 게시 모드
- `config.json`의 `confirm_mode: true`(지금): `prepare`가 검사·렌더 후 `pending\`에 넣고 윈도 알림을 띄운다. 운영자가 `python publish.py approve <post_id>`로 게시, `reject`로 버림. 준비 후 120분 지나면 승인 거부.
- `confirm_mode: false`: `prepare`가 회차 시각 + 0~6분까지 기다렸다가 바로 게시.
- `publish.py`는 게시 직전 로그를 다시 읽어 중복·90분·24시간 7개·카테고리·기업 제한을 재확인하고, 금지 표현·이모지·해시태그 수·캡션 고지·alt·checks 전부 pass·evidence를 검사한다. 하나라도 걸리면 게시하지 않고 로그 `runs`에 이유를 남긴다.
- 업로드: PNG → JPEG → GitHub `hyeonggwangpen-cards` 저장소 → 공개 주소 확인 → 이미지 컨테이너 → 캐러셀 컨테이너 → FINISHED 확인 → 게시. API 오류는 2분, 5분 뒤 재시도.

## 피드 JSON (prompt.md 13장 형식 + 렌더용 필드)
```json
{
  "run_at": "2026-11-25 15:52 KST", "slot": "15:50", "action": "post",
  "issue": "...", "category": "기업", "companies": ["..."],
  "slides": [
    {"n": 1, "role": "cover", "kicker": "기업명 · 11월 25일", "title": ["9자 이내", "9자 이내"], "highlight": "제목 속 단어",
     "sub": "25자 이내", "handwriting": "말 거는 투 한 줄", "visual": {"type": "icon", "names": ["building", "coin"]}, "alt": "..."},
    {"n": 2, "role": "what", "label": "무슨 일", "body": ["30자 이내 문장", "최대 2문장"], "visual": {...}, "alt": "..."}
  ],
  "caption": "prompt.md 9장 틀 그대로 (마지막에 '정보 제공용이며 투자 권유가 아닙니다.')",
  "hashtags": ["#형광펜뉴스", "...최대 5개"],
  "sources": [{"name": "언론사·기관명", "url": "...", "published": "YYYY-MM-DD"}],
  "evidence": [{"claim": "...", "url": "...", "quote": "...", "calc": ""}],
  "checks": {"숫자·날짜 일치": "pass", "...": "pass"},
  "log_entry": {"hook_type": "질문|대비|숫자|반전|비유"}
}
```
- `role` → 기본 레이아웃: cover=표지, what/define=글 위·그림 아래, numbers/case=그림 위·글 아래, scene/metaphor/correction_compare=그림 가운데, context=체크리스트, 마지막 장=고지 전문+출처 자동. 다른 틀을 쓰려면 `"layout"`에 `cover|top_text|top_visual|center_visual|checklist|final`.
- `label`: 장 위쪽 스티커 ("무슨 일", "숫자로 보면" 등). `tag`: 오른쪽 위 작은 회색 꼬리표 ("HD현대 · 정기선").
- `headline` + `hl`: 표지 외 장의 핵심 한 줄(60px, 2줄 이내)과 형광펜 단어.
- `body`: 최대 3문장, 문장당 34자 이내 (40px).
- `visual`은 하나(객체) 또는 여러 개(배열). 배열이면 위에서 아래로 쌓고, 각 항목의 `weight`로 높이 비율을 정한다.
- 예시: `posts61125-0740.json` (HD현대 정기선 회장 장내매수 계획, 시험 실행분)
- 하단 "출처 · 정보 제공용 · 투자 권유 아님"은 `sources`의 name으로 자동 생성. 마지막 장의 고지 전문은 `config.json`의 `disclaimer_full`.
- 손글씨(`handwriting`)는 한 장에 하나, 2줄 이내.

### visual 종류
| type | 필드 | 쓰는 곳 |
|---|---|---|
| `stats` | `items`: [{label, value, unit, note, direction, hl(노랑 타일)}] 2~3개 | 표지 숫자 요약, 핵심 수치 |
| `facts` | `title`, `rows`: [{k, v, color}] 최대 6줄, `key_width` | 공시·계약 조건 한눈에 |
| `change` | `label`, `before`/`after`: {label, value, note}, `delta`, `direction` | 지분율·실적 전→후 |
| `table` | `columns`, `rows`(2차원), `widths`(비율), `note` | 인물·종목·항목 목록 |
| `icon` | `name` 또는 `names`(여러 개), `label`(스티커), `symbol`(coin용 ₩ $), `accent`(up/down/hl) | 표지·무슨 일·비유 |
| `bignum` | `numbers`: [{label, value, unit, direction: up/down, basis}] 최대 3개, 첫 숫자에 손그림 동그라미 | 숫자 |
| `bars` | `items`: [{label, value(숫자), display, direction 또는 color}], `title`, `basis` (가로 막대, 음수 가능) | 비교 |
| `columns` | 위와 같음 (세로 막대, 음수 불가) | 연도별 추이 |
| `line` | `items`: [{label, value, display}], `color`, `basis` | 추이 |
| `versus` | `left`/`right`: {label, icon, text} | A vs B |
| `checklist` | `items`: ["문장", {"text", "checked": false}] 최대 4개 | 맥락·균형 |
| `timeline` | `items`: [{date, text}] | 다음 일정 |

아이콘: building, factory, bank, document, gavel, scale, globe, chip, ship, person, people, coin, calendar, magnifier, house, battery, arrow_up, arrow_down.
차트는 0 기준으로 실제 값에 비례해 그린다. `value`는 숫자, `display`는 화면에 쓸 글자("1.2조").
`direction`을 주면 ▲(빨강)/▼(파랑)가 자동으로 붙는다.

## 품질 필드 (publish.py가 강제)
- `candidates`: 비교한 후보 3개 이상 [{"issue", "score", "why", "first_seen"}] (post일 때)
- `review`: {"independent": true, "result": "pass", "notes": "..."}. 새 Agent 검수자가 원문과 대조한 결과.

## 캡션
- 틀은 prompt.md 9장, 예시는 `samples\caption_example.txt`.
- publish.py가 검사하는 것: 허용 아이콘(📌 💰 📊 🔎 🗓 ✅ ⚠️ 🏢 👤 🌏 💬 ⏰)만 쓸 것, 6개 이하, 줄 맨 앞에 하나씩. 카드 안에는 이모지 금지.

## 신뢰도 필드 (publish.py가 게시 전에 강제)
```json
"verification": {
  "verified_at": "2026-11-25 02:25 KST",
  "badge": "DART 공시 원문 확인 · 언론 4곳 교차",
  "primary": [{"name": "...보고서 (접수번호)", "url": "https://dart.fss.or.kr/...", "checked": "확인한 항목"}],
  "company_primary_urls": [],
  "conflicts": [{"what": "...", "resolution": "..."}],
  "excluded": ["1곳만 보도해 뺀 내용"],
  "freshness_override": "48시간이 지난 소식을 다룰 때만: 다룰 이유"
},
"footer_source": "DART 공시 원문 · 뉴스핌 외 언론 3곳",
"evidence": [{"key": "사실 묶음 이름", "tier": "primary|press", "url": "...", "claim": "...", "quote": "원문 문장", "calc": ""}]
```
- evidence 묶음(key)마다: 1차 출처 1건(tier=primary, 공시·거래소·정부·법원·SEC 도메인 또는 company_primary_urls) 또는 서로 다른 언론 도메인 2곳.
- 1차 출처가 하나도 없거나, 출처 충돌의 resolution이 비었거나, verified_at이 6시간 넘으면 게시 거부.
- 캡션에 `확인:` 줄 필수. 마지막 장에 `badge`가 검증 배지로 찍힌다.
- DART 원문 읽기: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=<접수번호>` 페이지의 node1 값(dcmNo, eleId, offset, length)으로
  `report/viewer.do?rcpNo=..&dcmNo=..&eleId=..&offset=..&length=..&dtd=dart4.xsd`를 장마다 읽는다.

## 렌더 검사
`render.py`는 `out\<post_id>\report.json`에 문제를 모은다 (글자 수 초과, 제목 폭 초과, 깨지는 글자, 이모지, 연속 같은 레이아웃, 그림 영역 부족 등). 문제가 있으면 종료 코드 1이고 `publish.py`는 게시를 거부한다. 글자 크기는 줄이지 말고 문장을 줄인다.
기계 검사 뒤에 반드시 `out\<post_id>\preview.jpg`와 각 PNG를 직접 열어 겹침·잘림을 눈으로 확인한다.

## 기타
- `python publish.py dryrun <json>`: 게시 없이 업로드·컨테이너 생성까지만 (연결 테스트).
- `python publish.py list`: 승인 대기 목록.
- 토큰: `~\.hyeonggwangpen\secrets.env`의 `IG_PAGE_TOKEN`(만료 없음)을 쓴다. 비밀번호 변경·앱 권한 해제 시 무효가 되니 `status.py`의 `api`가 fail이면 운영자에게 알린다.

## 자동 실행
- 작업 스케줄러 `\hyeonggwangpen\` 폴더에 8개 작업 (각 회차 14분 전 시작, 절전 중이면 깨움, 최대 50분).
- 각 작업은 `run_slot.ps1` → `claude -p` (지시문: `run_prompt.md`) 실행. 실행 기록은 `runs\YYYYMMDD-HHMM.log`.
- 허용 도구: Read/Write/Edit/Glob/Grep/WebSearch/WebFetch/Agent, Bash(python·curl·git·ls·cat·mkdir)만.
- `config.json`의 `confirm_mode`가 false면 바로 게시, true면 승인 대기.
- 끄기: `Get-ScheduledTask -TaskPath "\hyeonggwangpen\" | Disable-ScheduledTask`

## 쟁점 소개 피드 (prompt.md 2-2장)
갈리는 주제를 소개할 때만 `debate` 블록을 넣는다. 넣으면 publish.py가 아래를 검사한다.
```json
"debate": {
  "question": "여러분은 어느 쪽인가요?",
  "sides": [
    {"who": "금융위원회", "claim": "한쪽 논리 한 줄", "evidence_key": "side_a"},
    {"who": "OO투자자협회", "claim": "다른 쪽 논리 한 줄", "evidence_key": "side_b"}
  ]
}
```
- `who`: 이름 있는 기관·기업·단체·증권사. "일각·누리꾼·업계 관계자" 같은 익명 주체는 거부된다.
- `evidence_key`: 그 쪽의 발언·자료를 담은 evidence 묶음. 1차 출처나 언론 2곳 규칙은 그대로 적용된다.
- 양쪽 `claim` 길이 차이는 1.6배 이내. `question`은 '?'로 끝나고, 캡션에 그대로 들어가야 한다.
- 카드에서는 `versus`(left/right) 또는 `columns`로 양쪽을 같은 크기로 보여 준다. 마지막 본문 장의 headline으로 질문을 쓴다.
- 거부되는 표현: 충격·난리·분노·경악, 정당 이름, 좌파·우파, "~가 맞다/옳다/잘못됐다", 집단 조롱.
- 하루 2개까지, 직전 게시물도 쟁점이면 거부된다. 로그에는 `debate: true`로 남는다.
