"""형광펜뉴스 실행 전 상태 확인과 로그 기록.

  python status.py                               지금 실행할 회차인지 + 로그 요약 (JSON)
  python status.py skip <slot> "<이유>"            건너뛴 회차를 로그에 남김
  python status.py followup <media_id> ok|correction_needed "<메모>"
  python status.py correction add <media_id> "<틀린 내용>" "<바른 내용>" "<출처 URL>"
  python status.py correction done <media_id>
"""
import json
import os
import sys
from datetime import timedelta

from hgp_common import (PENDING_DIR, SLOTS, GraphError, fmt_kst, graph, ig_user_id, load_log, now_kst, parse_kst,
                        save_log)


def slot_now(now):
    for s in SLOTS:
        hh, mm = map(int, s.split(":"))
        t = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if abs((now - t).total_seconds()) <= 15 * 60:
            return s
    return None


def summary():
    now = now_kst()
    log = load_log()
    today = now.strftime("%Y-%m-%d")
    posted = [p for p in log["posts"] if p.get("status") == "posted" and p.get("time")]
    recent7 = [p for p in posted if now - parse_kst(p["time"]) < timedelta(days=7)]
    times = sorted(parse_kst(p["time"]) for p in posted)
    last = times[-1] if times else None
    in24 = sum(1 for t in times if now - t < timedelta(hours=24))
    slot = slot_now(now)
    done_today = {r.get("slot") for r in log["runs"] if r.get("time", "").startswith(today)} | \
                 {p.get("slot") for p in posted if p.get("date") == today}
    reasons = []
    if not slot:
        reasons.append("회차 시각 ±15분이 아님")
    elif slot in done_today:
        reasons.append(f"오늘 {slot} 회차는 이미 로그에 있음")
    if last and now - last < timedelta(minutes=90):
        reasons.append(f"직전 게시 후 {int((now - last).total_seconds() // 60)}분 — 90분 이내")
    if in24 >= 8:
        reasons.append("24시간 안에 이미 8개")
    todays = [p for p in posted if p.get("date") == today]
    cat_count, comp_count = {}, {}
    for p in todays:
        cat_count[p.get("category", "")] = cat_count.get(p.get("category", ""), 0) + 1
        for c in p.get("companies", []):
            comp_count[c] = comp_count.get(c, 0) + 1
    checked = {f.get("media_id") for f in log["followups_checked"]}
    followup = next((p for p in reversed(posted)
                     if now - parse_kst(p["time"]) < timedelta(hours=48) and p.get("media_id") not in checked), None)
    pending = sorted(os.listdir(PENDING_DIR)) if os.path.isdir(PENDING_DIR) else []
    try:
        acct = graph("GET", ig_user_id(), {"fields": "username,media_count"})
        api = f"ok (@{acct.get('username')})"
    except (GraphError, KeyError, OSError) as e:
        api = f"fail: {e}"
    return {
        "now": fmt_kst(now),
        "slot": slot or "",
        "should_run": not reasons and api.startswith("ok"),
        "reasons": reasons,
        "api": api,
        "corrections_pending": log["corrections_pending"],
        "posts_last_24h": in24,
        "last_post": fmt_kst(last) if last else "",
        "today_categories": cat_count,
        "today_companies": comp_count,
        "today_glossary": cat_count.get("용어", 0),
        "last3_hook_types": [p.get("hook_type", "") for p in posted[-3:]],
        "recent_7d": [{k: p.get(k) for k in ("date", "slot", "issue", "category", "companies", "hook_type", "media_id",
                                             "permalink")} for p in recent7],
        "followup_candidate": followup and {k: followup.get(k) for k in ("media_id", "issue", "time", "sources", "permalink")},
        "pending_approvals": pending,
    }


def main(a):
    log = load_log()
    now = fmt_kst(now_kst())
    if not a:
        print(json.dumps(summary(), ensure_ascii=False, indent=2))
        return 0
    if a[0] == "skip" and len(a) >= 3:
        log["runs"].append({"time": now, "slot": a[1], "status": "skipped", "reason": a[2]})
    elif a[0] == "followup" and len(a) >= 3:
        log["followups_checked"].append({"media_id": a[1], "result": a[2], "note": a[3] if len(a) > 3 else "", "time": now})
    elif a[0] == "correction" and a[1:2] == ["add"] and len(a) >= 6:
        log["corrections_pending"].append({"media_id": a[2], "wrong": a[3], "right": a[4], "source": a[5], "added": now})
    elif a[0] == "correction" and a[1:2] == ["done"] and len(a) >= 3:
        log["corrections_pending"] = [c for c in log["corrections_pending"] if c.get("media_id") != a[2]]
    else:
        print(__doc__)
        return 2
    save_log(log)
    print("기록함")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv[1:]))
