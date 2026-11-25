"""형광펜뉴스 게시 스크립트.

  python publish.py prepare post.json   검사 → 렌더 → (확인 모드면) 대기열에 넣고 알림 / (자동 모드면) 바로 게시
  python publish.py approve <post_id>   대기 중인 피드를 게시 (확인 모드에서 운영자가 허락할 때)
  python publish.py reject <post_id>    대기 중인 피드를 버림
  python publish.py list                대기 중인 피드 목록
  python publish.py dryrun post.json    업로드와 컨테이너 생성까지만 하고 게시는 하지 않음 (연결 테스트)
"""
import json
import os
import random
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from datetime import timedelta

from PIL import Image

import render as R
from hgp_common import (CARDS_REPO, PENDING_DIR, GraphError, fmt_kst, graph, ig_user_id, load_config, load_log,
                        now_kst, parse_kst, retry, save_log)

BANNED = [
    r"매수\s*(하세요|추천|타이밍)", r"매도\s*(하세요|추천|타이밍)", r"지금\s*사야", r"수혜주", r"주목할\s*종목", r"목표\s*주?가",
    r"무조건", r"수익\s*보장", r"원금\s*보장", r"폭락\s*온다", r"역대급", r"미친\s*(듯|수준|상승|폭등|급등)", r"리딩\s*방", r"오픈\s*채팅",
    r"DM\s*(주세요|문의)", r"프로필\s*링크", r"텔레그램", r"오를\s*것", r"떨어질\s*것", r"사야\s*할",
]
EMOJI_RE = R.EMOJI_RE
CAPTION_DISCLAIMER = "정보 제공용이며 투자 권유가 아닙니다."
PRIMARY_DOMAINS = ("dart.fss.or.kr", "kind.krx.co.kr", "data.krx.co.kr", "krx.co.kr", "sec.gov", "go.kr", "bok.or.kr",
                   "fss.or.kr", "federalreserve.gov", "scourt.go.kr", "courtlistener.com", "europa.eu")


def domain_of(url):
    from urllib.parse import urlparse
    host = urlparse(url or "").netloc.lower()
    return host[4:] if host.startswith("www.") else host


def is_primary(ev, allowed_extra=()):
    d = domain_of(ev.get("url", ""))
    return ev.get("tier") == "primary" and (any(d == p or d.endswith("." + p) for p in PRIMARY_DOMAINS)
                                            or d in allowed_extra)


def verify_evidence(post):
    """신뢰도 규칙: 1차 출처 원문 1건 이상 + 모든 사실은 1차 출처 또는 서로 다른 언론 2곳."""
    errs = []
    ver = post.get("verification") or {}
    extra = tuple(domain_of(u) for u in ver.get("company_primary_urls", []))  # 회사 IR·보도자료 등 공식 원문
    evid = post.get("evidence") or []
    if not any(is_primary(e, extra) for e in evid):
        errs.append("1차 출처(공시·거래소·정부·법원·SEC·회사 공식 발표) 원문 근거가 없음")
    groups = {}
    for e in evid:
        if not e.get("key"):
            errs.append(f"evidence에 key(사실 묶음 이름)가 없음: {e.get('claim', '')[:20]}")
            continue
        if not e.get("quote"):
            errs.append(f"evidence '{e['key']}'에 원문 문장(quote)이 없음")
        groups.setdefault(e["key"], []).append(e)
    for key, evs in groups.items():
        if any(is_primary(e, extra) for e in evs):
            continue
        press = {domain_of(e.get("url")) for e in evs if e.get("url")}
        if len(press) < 2:
            errs.append(f"사실 '{key}': 1차 출처도 없고 언론 2곳 교차 확인도 안 됨")
    for c in ver.get("conflicts", []):
        if not c.get("resolution"):
            errs.append(f"출처 충돌 미해결: {c.get('what', '')}")
    if not ver.get("verified_at"):
        errs.append("verification.verified_at(확인 시각)이 없음")
    elif now_kst() - parse_kst(ver["verified_at"]) > timedelta(hours=6):
        errs.append("확인한 지 6시간이 넘음 — 1차 출처(정정·철회 여부)를 다시 확인할 것")
    return errs


DEBATE_BANNED = [
    r"충격", r"난리", r"분노", r"폭발", r"참사", r"발칵", r"경악", r"개미(는|들은)", r"틀딱", r"좌파", r"우파", r"좌빨", r"빨갱이",
    r"토착왜구", r"매국", r"국민의힘", r"민주당", r"조국혁신당", r"개혁신당", r"진보당", r"보수\s*진영", r"진보\s*진영",
    r"(이|가)\s*맞다", r"잘못(됐|되었)다", r"옳다", r"말도\s*안\s*(되|돼)", r"당연히", r"일각에서는", r"누리꾼", r"네티즌",
]
ANON_WHO = re.compile(r"일각|누리꾼|네티즌|익명|일부\s*(사람|투자자)|업계\s*관계자")


def check_debate(post, log, now):
    """쟁점 소개 피드: 양쪽 다 이름 있는 주체·근거, 비슷한 분량, 열린 질문, 편들기·정치 구도 금지, 하루 2개·연속 금지."""
    d = post.get("debate")
    if not d:
        return []
    errs = []
    sides = d.get("sides") or []
    keys = {e.get("key") for e in post.get("evidence") or []}
    if len(sides) < 2:
        errs.append("쟁점: debate.sides가 2개 미만 — 양쪽 논리를 모두 소개할 것")
    for i, sd in enumerate(sides, 1):
        who = (sd.get("who") or "").strip()
        if not who or ANON_WHO.search(who):
            errs.append(f"쟁점: {i}번째 쪽의 주체(who)가 없거나 익명 — 기관·기업·단체 이름을 붙일 것")
        if not (sd.get("claim") or "").strip():
            errs.append(f"쟁점: {i}번째 쪽의 논리(claim)가 비어 있음")
        if sd.get("evidence_key") not in keys:
            errs.append(f"쟁점: {i}번째 쪽의 evidence_key가 evidence에 없음")
    lens = [len(sd.get("claim") or "") for sd in sides]
    if len(lens) >= 2 and min(lens) and max(lens) / min(lens) > 1.6:
        errs.append("쟁점: 양쪽 논리 분량 차이가 큼 — 비슷하게 맞출 것")
    q = (d.get("question") or "").strip()
    cap = full_caption(post)
    if not q.endswith("?"):
        errs.append("쟁점: debate.question(열린 질문, '?'로 끝남)이 없음")
    elif q not in cap:
        errs.append("쟁점: 열린 질문이 캡션에 없음")
    texts = [cap] + [json.dumps(s, ensure_ascii=False) for s in post.get("slides", [])]
    for pat in DEBATE_BANNED:
        m = next((re.search(pat, t) for t in texts if re.search(pat, t)), None)
        if m:
            errs.append(f"쟁점: 편들기·자극·정치 구도 표현 '{m.group(0)}'")
    posted = [p for p in log["posts"] if p.get("status") == "posted" and p.get("time")]
    today = now.strftime("%Y-%m-%d")
    if sum(1 for p in posted if p.get("date") == today and p.get("debate")) >= 2:
        errs.append("쟁점 피드는 하루 2개까지 — 오늘은 이미 2개")
    if posted and posted[-1].get("debate"):
        errs.append("쟁점 피드를 연달아 두 회차 올릴 수 없음")
    return errs


def notify(title, text):
    """윈도 알림 풍선. 실패해도 게시 흐름은 멈추지 않는다."""
    ps = (
        "Add-Type -AssemblyName System.Windows.Forms;"
        "$n=New-Object System.Windows.Forms.NotifyIcon;$n.Icon=[System.Drawing.SystemIcons]::Information;"
        f"$n.BalloonTipTitle='{title.replace(chr(39), '')}';$n.BalloonTipText='{text.replace(chr(39), '')}';"
        "$n.Visible=$true;$n.ShowBalloonTip(15000);Start-Sleep 16;$n.Dispose()"
    )
    try:
        subprocess.Popen(["powershell", "-NoProfile", "-WindowStyle", "Hidden", "-Command", ps],
                         creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except Exception as e:
        print(f"[알림 실패] {e}")


CAPTION_ICONS = ["📌", "💰", "📊", "🔎", "🗓", "✅", "⚠", "🏢", "👤", "🌏", "💬", "⏰"]
MAX_CAPTION_ICONS = 6


def check_caption_icons(cap):
    """캡션 아이콘: 허용 목록만, 6개 이하, 줄 맨 앞에만."""
    errs = []
    count = 0
    joiners = ("\ufe0f", "\u200d")
    for line in cap.split("\n"):
        stripped = line.strip()
        found = [m.group(0) for m in EMOJI_RE.finditer(stripped) if m.group(0) not in joiners]
        for f in found:
            if f not in CAPTION_ICONS:
                errs.append(f"허용되지 않은 캡션 아이콘 '{f}'")
        if found:
            count += len(found)
            if len(found) > 1 or not any(stripped.startswith(i) for i in CAPTION_ICONS):
                errs.append(f"아이콘은 줄 맨 앞에 하나만: {stripped[:20]}")
    if count > MAX_CAPTION_ICONS:
        errs.append(f"캡션 아이콘 {count}개 — {MAX_CAPTION_ICONS}개 이하")
    return errs


def full_caption(post):
    cap = post.get("caption", "").strip()
    tags = [t for t in post.get("hashtags", []) if t not in cap]
    if tags:
        cap += "\n\n" + " ".join(tags)
    return cap


# ---------- 검사 ----------
def validate(post, log, now):
    errs = []
    action = post.get("action")
    if action not in ("post", "correction", "glossary"):
        errs.append(f"action이 게시용이 아님: {action}")
    for k, v in (post.get("checks") or {}).items():
        if not str(v).lower().startswith("pass"):
            errs.append(f"검수 실패 항목: {k} = {v}")
    if not post.get("checks"):
        errs.append("checks(검수 결과)가 비어 있음")
    if action in ("post", "correction"):
        cands = post.get("candidates") or []
        if action == "post" and len(cands) < 3:
            errs.append("candidates(후보 3개 이상과 점수)가 없음 — 소재를 비교해서 골랐다는 기록 필요")
        rv = post.get("review") or {}
        if not rv.get("independent") or str(rv.get("result", "")).lower() != "pass":
            errs.append("독립 검수(review.independent=true, result=pass)가 없음")
    if not post.get("evidence"):
        errs.append("evidence(근거)가 비어 있음")
    elif action in ("post", "correction"):
        errs += verify_evidence(post)
    if not post.get("sources"):
        errs.append("sources(출처)가 비어 있음")
    elif action in ("post", "correction"):
        dates = []
        for src in post["sources"]:
            try:
                dates.append(parse_kst(src.get("published", "") + " 00:00"))
            except ValueError:
                errs.append(f"출처 날짜 형식 오류: {src.get('name')}")
        override = (post.get("verification") or {}).get("freshness_override", "").strip()
        stale = bool(dates) and now - max(dates) > timedelta(hours=72)
        if stale and not override:
            errs.append("최신성: 48시간이 지난 소식 — 그래도 다룰 만하면 verification.freshness_override에 이유를 적을 것")
        if stale and override:
            today = now.strftime("%Y-%m-%d")
            if any(p.get("date") == today and p.get("stale") for p in log["posts"]):
                errs.append("최신성: 오래된 소식 예외는 하루 1개까지 — 오늘은 이미 사용함")
    cap = full_caption(post)
    if len(cap) > 2200:
        errs.append(f"캡션 {len(cap)}자 — 2,200자 초과")
    tags = re.findall(r"#\S+", cap)
    if len(tags) > 5:
        errs.append(f"해시태그 {len(tags)}개 — 5개 초과")
    if "#형광펜뉴스" not in tags:
        errs.append("#형광펜뉴스 해시태그 없음")
    if action in ("post", "correction") and "확인:" not in cap:
        errs.append("캡션에 '확인:' 줄(무엇을 원문으로 확인했는지)이 없음")
    if CAPTION_DISCLAIMER not in cap:
        errs.append(f"캡션에 '{CAPTION_DISCLAIMER}' 문구 없음")
    texts = [cap] + [json.dumps(s, ensure_ascii=False) for s in post.get("slides", [])]
    for t in texts[1:]:
        if EMOJI_RE.search(t):
            errs.append("카드에 이모지 사용")
            break
    errs += check_caption_icons(cap)
    errs += check_debate(post, log, now)
    for pat in BANNED:
        for t in texts:
            m = re.search(pat, t)
            if m:
                errs.append(f"금지 표현 '{m.group(0)}'")
                break
    for s in post.get("slides", []):
        if not s.get("alt"):
            errs.append(f"{s.get('n')}장 대체 텍스트(alt) 없음")
    # 로그 규칙
    posted = [p for p in log["posts"] if p.get("status") == "posted" and p.get("time")]
    times = sorted(parse_kst(p["time"]) for p in posted)
    if times and now - times[-1] < timedelta(minutes=90):
        errs.append(f"직전 게시({fmt_kst(times[-1])})와 90분 이내")
    if sum(1 for t in times if now - t < timedelta(hours=24)) >= 8:
        errs.append("최근 24시간에 이미 8개 게시")
    today = now.strftime("%Y-%m-%d")
    slot = post.get("slot")
    for p in posted:
        if p.get("date") == today and p.get("slot") == slot:
            errs.append(f"오늘 {slot} 회차는 이미 게시됨")
        if p.get("issue") and p.get("issue") == post.get("issue") and now - parse_kst(p["time"]) < timedelta(days=7):
            errs.append("같은 이슈가 최근 7일 안에 이미 게시됨")
    todays = [p for p in posted if p.get("date") == today]
    if action == "post":
        if sum(1 for p in todays if p.get("category") == post.get("category")) >= 2:
            errs.append(f"오늘 '{post.get('category')}' 카테고리는 이미 2개")
        for c in post.get("companies", []):
            if any(c in p.get("companies", []) for p in todays):
                errs.append(f"오늘 '{c}' 기업은 이미 다룸")
    if action == "glossary" and any(p.get("category") == "용어" for p in todays):
        errs.append("용어 카드는 하루 1개까지")
    return errs


# ---------- 업로드 ----------
def git(*args):
    r = subprocess.run(["git", "-C", CARDS_REPO, *args], capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} 실패: {r.stderr.strip()}")
    return r.stdout


def upload_images(pid, pngs, cfg):
    dest = os.path.join(CARDS_REPO, pid)
    os.makedirs(dest, exist_ok=True)
    names = []
    for p in pngs:
        name = os.path.splitext(os.path.basename(p))[0] + ".jpg"
        Image.open(p).convert("RGB").save(os.path.join(dest, name), "JPEG", quality=95, subsampling=0)
        names.append(name)
    git("pull", "-q", "--rebase", "origin", "main")
    git("add", pid)
    if git("status", "--porcelain").strip():
        git("-c", "user.name=hyeonggwangpen-bot", "-c", "user.email=choiju150824@users.noreply.github.com",
            "commit", "-q", "-m", f"cards {pid}")
        git("push", "-q", "origin", "main")
    urls = [f"{cfg['raw_base']}/{pid}/{n}" for n in names]
    deadline = time.time() + 180
    for u in urls:
        while True:
            try:
                with urllib.request.urlopen(urllib.request.Request(u, method="HEAD"), timeout=20) as r:
                    if r.status == 200:
                        break
            except Exception:
                pass
            if time.time() > deadline:
                raise RuntimeError(f"이미지 공개 주소가 열리지 않음: {u}")
            time.sleep(8)
    return urls


# ---------- 인스타 ----------
def create_container(url, alt):
    ig = ig_user_id()
    params = {"image_url": url, "is_carousel_item": "true"}
    if alt:
        params["alt_text"] = alt[:1000]
    try:
        return graph("POST", f"{ig}/media", params)["id"]
    except GraphError as e:
        if "alt_text" in str(e):
            params.pop("alt_text")
            return graph("POST", f"{ig}/media", params)["id"]
        raise


def wait_ready(cid, timeout=300):
    end = time.time() + timeout
    while time.time() < end:
        st = graph("GET", cid, {"fields": "status_code,status"})
        code = st.get("status_code")
        if code == "FINISHED":
            return
        if code in ("ERROR", "EXPIRED"):
            raise GraphError(f"컨테이너 상태 {code}: {st.get('status')}")
        time.sleep(5)
    raise GraphError("컨테이너가 5분 안에 준비되지 않음", transient=True)


def build_carousel(post, urls):
    alts = [s.get("alt", "") for s in post["slides"]]
    children = []
    for u, a in zip(urls, alts):
        cid = retry(lambda: create_container(u, a), label="이미지 컨테이너")
        children.append(cid)
    for cid in children:
        retry(lambda: wait_ready(cid), label="이미지 준비")
    car = retry(lambda: graph("POST", f"{ig_user_id()}/media", {
        "media_type": "CAROUSEL", "children": ",".join(children), "caption": full_caption(post)})["id"],
        label="캐러셀 컨테이너")
    retry(lambda: wait_ready(car), label="캐러셀 준비")
    return car


def publish_now(post, pngs, cfg, delay=True):
    pid = R.post_id_of(post)
    log = load_log()
    now = now_kst()
    errs = validate(post, log, now)  # 게시 직전 중복 재확인
    if errs:
        raise RuntimeError("게시 직전 검사 실패: " + " / ".join(errs))
    if delay and re.fullmatch(r"\d\d:\d\d", post.get("slot", "")):
        hh, mm = map(int, post["slot"].split(":"))
        target = now.replace(hour=hh, minute=mm, second=0, microsecond=0) + timedelta(seconds=random.randint(0, 360))
        wait = (target - now_kst()).total_seconds()
        if 0 < wait < 3600:
            print(f"[대기] {int(wait)}초 뒤 게시 (회차 시각 + 0~6분)", flush=True)
            time.sleep(wait)
    urls = upload_images(pid, pngs, cfg)
    car = build_carousel(post, urls)
    mid = retry(lambda: graph("POST", f"{ig_user_id()}/media_publish", {"creation_id": car})["id"], label="게시")
    info = {}
    try:
        info = graph("GET", mid, {"fields": "permalink,timestamp"})
    except GraphError:
        pass
    t = now_kst()
    entry = dict(post.get("log_entry") or {})
    entry.update({
        "date": t.strftime("%Y-%m-%d"), "slot": post.get("slot", ""), "issue": post.get("issue", ""),
        "category": post.get("category", ""), "companies": post.get("companies", []),
        "hook_type": entry.get("hook_type", ""), "status": "posted", "media_id": mid,
        "permalink": info.get("permalink", ""), "time": fmt_kst(t), "post_id": pid,
        "sources": post.get("sources", []),
        "stale": bool((post.get("verification") or {}).get("freshness_override")),
        "debate": bool(post.get("debate")),
    })
    log = load_log()
    log["posts"].append(entry)
    save_log(log)
    print(json.dumps({"published": {"media_id": mid, "time": fmt_kst(t), "permalink": info.get("permalink", "")}},
                     ensure_ascii=False, indent=2))
    return mid


def log_run(post, status, reason):
    log = load_log()
    log["runs"].append({"time": fmt_kst(now_kst()), "slot": post.get("slot", ""), "post_id": R.post_id_of(post),
                        "issue": post.get("issue", ""), "status": status, "reason": reason})
    save_log(log)


# ---------- 명령 ----------
def cmd_prepare(path, dry=False):
    cfg = load_config()
    with open(path, encoding="utf-8") as f:
        post = json.load(f)
    pid = R.post_id_of(post)
    if not dry:
        errs = validate(post, load_log(), now_kst())
        if errs:
            log_run(post, "skipped", " / ".join(errs))
            print("[중단] 검사 실패:\n- " + "\n- ".join(errs))
            return 1
    rep = R.render(post)
    if not rep["ok"]:
        if not dry:
            log_run(post, "skipped", "렌더 문제: " + " / ".join(rep["issues"]))
        print("[중단] 렌더 문제:\n- " + "\n- ".join(rep["issues"]))
        return 1
    out_dir = os.path.dirname(rep["slides"][0])
    with open(os.path.join(out_dir, "post.json"), "w", encoding="utf-8") as f:
        json.dump(post, f, ensure_ascii=False, indent=2)
    if dry:
        urls = upload_images(f"test/{pid}", rep["slides"], cfg)
        car = build_carousel(post, urls)
        print(f"[드라이런 성공] 캐러셀 컨테이너 {car} 준비 완료 — 게시하지 않음 (24시간 뒤 자동 만료)")
        return 0
    if cfg.get("confirm_mode", True):
        dest = os.path.join(PENDING_DIR, pid)
        os.makedirs(dest, exist_ok=True)
        with open(os.path.join(dest, "pending.json"), "w", encoding="utf-8") as f:
            json.dump({"post_id": pid, "prepared_at": fmt_kst(now_kst()), "out_dir": out_dir,
                       "slides": rep["slides"]}, f, ensure_ascii=False, indent=2)
        log_run(post, "pending", "확인 모드: 운영자 승인 대기")
        notify("형광펜뉴스 승인 대기", f"{post.get('slot', '')} 회차: {post.get('issue', '')[:40]}")
        print(f"[확인 대기] {pid}\n미리보기: {os.path.join(out_dir, 'preview.jpg')}\n"
              f"승인: python publish.py approve {pid}\n거절: python publish.py reject {pid}")
        return 0
    try:
        publish_now(post, rep["slides"], cfg)
    except Exception as e:
        log_run(post, "failed", str(e))
        notify("형광펜뉴스 게시 실패", str(e)[:100])
        print(f"[게시 실패] {e}")
        return 1
    return 0


def load_pending(pid):
    with open(os.path.join(PENDING_DIR, pid, "pending.json"), encoding="utf-8") as f:
        pend = json.load(f)
    with open(os.path.join(pend["out_dir"], "post.json"), encoding="utf-8") as f:
        return pend, json.load(f)


def cmd_approve(pid):
    cfg = load_config()
    pend, post = load_pending(pid)
    age = now_kst() - parse_kst(pend["prepared_at"])
    if age > timedelta(minutes=cfg.get("approve_within_minutes", 120)):
        print(f"[거절] 준비한 지 {int(age.total_seconds() // 60)}분 지남 — 내용이 낡았을 수 있어 게시하지 않음")
        return 1
    try:
        publish_now(post, pend["slides"], cfg, delay=False)
    except Exception as e:
        log_run(post, "failed", str(e))
        print(f"[게시 실패] {e}")
        return 1
    shutil.rmtree(os.path.join(PENDING_DIR, pid), ignore_errors=True)
    return 0


def cmd_reject(pid):
    _, post = load_pending(pid)
    log_run(post, "rejected", "운영자가 거절")
    shutil.rmtree(os.path.join(PENDING_DIR, pid), ignore_errors=True)
    print(f"[거절] {pid}")
    return 0


def cmd_list():
    if not os.path.isdir(PENDING_DIR):
        print("대기 중인 피드 없음")
        return 0
    items = sorted(os.listdir(PENDING_DIR))
    for pid in items:
        pend, post = load_pending(pid)
        print(f"{pid}  준비 {pend['prepared_at']}  {post.get('issue', '')}\n   미리보기: {os.path.join(pend['out_dir'], 'preview.jpg')}")
    if not items:
        print("대기 중인 피드 없음")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    a = sys.argv[1:]
    if not a:
        print(__doc__)
        sys.exit(2)
    cmd = a[0]
    if cmd == "prepare" and len(a) == 2:
        sys.exit(cmd_prepare(a[1]))
    if cmd == "dryrun" and len(a) == 2:
        sys.exit(cmd_prepare(a[1], dry=True))
    if cmd == "approve" and len(a) == 2:
        sys.exit(cmd_approve(a[1]))
    if cmd == "reject" and len(a) == 2:
        sys.exit(cmd_reject(a[1]))
    if cmd == "list":
        sys.exit(cmd_list())
    print(__doc__)
    sys.exit(2)
