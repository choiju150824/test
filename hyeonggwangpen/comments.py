"""형광펜뉴스 댓글 관리. 댓글에 답하지 않고, 숨기기만 한다.

  python comments.py scan [시간=72]     최근 게시물 댓글을 읽어 스팸 패턴은 자동 숨김, 나머지는 검토용으로 출력
  python comments.py hide <댓글ID> ...  지정한 댓글 숨김 (혐오·욕설·사칭 등 사람이 판단한 것)
"""
import json
import re
import sys
from datetime import timedelta

from hgp_common import GraphError, graph, ig_user_id, load_config, load_log, now_kst, parse_kst, save_log


def hide(cid):
    graph("POST", cid, {"hide": "true"})


def recent_media(hours):
    data = graph("GET", f"{ig_user_id()}/media", {"fields": "id,timestamp,permalink,comments_count", "limit": 25})
    now = now_kst()
    out = []
    for m in data.get("data", []):
        ts = parse_kst(m["timestamp"].replace("+0000", "+00:00"))
        if now - ts < timedelta(hours=hours):
            out.append(m)
    return out


def scan(hours):
    pats = [re.compile(p, re.I) for p in load_config()["hide_comment_patterns"]]
    hidden, review = [], []
    for m in recent_media(hours):
        if not m.get("comments_count"):
            continue
        res = graph("GET", f"{m['id']}/comments", {"fields": "id,text,username,timestamp,hidden", "limit": 100})
        for c in res.get("data", []):
            if c.get("hidden"):
                continue
            text = c.get("text", "")
            hit = next((p.pattern for p in pats if p.search(text)), None)
            if hit:
                try:
                    hide(c["id"])
                    hidden.append({"id": c["id"], "media_id": m["id"], "pattern": hit, "text": text[:80]})
                except GraphError as e:
                    review.append({"id": c["id"], "media_id": m["id"], "text": text, "error": str(e)})
            else:
                review.append({"id": c["id"], "media_id": m["id"], "user": c.get("username"), "text": text})
    if hidden:
        log = load_log()
        log["runs"].append({"time": now_kst().strftime("%Y-%m-%d %H:%M KST"), "slot": "", "status": "comments",
                            "reason": f"댓글 {len(hidden)}개 자동 숨김"})
        save_log(log)
    print(json.dumps({"comments_hidden": len(hidden), "hidden": hidden, "review": review,
                      "note": "review 목록은 답하지 말 것. 혐오·욕설·사칭은 hide, 사실 오류 지적은 숨기지 말고 사후 관리로 확인."},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    a = sys.argv[1:]
    if a and a[0] == "scan":
        scan(int(a[1]) if len(a) > 1 else 72)
    elif a and a[0] == "hide" and len(a) > 1:
        for cid in a[1:]:
            hide(cid)
            print(f"숨김: {cid}")
    else:
        print(__doc__)
        sys.exit(2)
