"""형광펜뉴스 공용 도구: 경로, 비밀값, 로그, Graph API 호출, KST 시간."""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(ROOT, "fonts")
LOG_PATH = os.path.join(ROOT, "log.json")
CONFIG_PATH = os.path.join(ROOT, "config.json")
OUT_DIR = os.path.join(ROOT, "out")
PENDING_DIR = os.path.join(ROOT, "pending")
HOME_DIR = os.path.join(os.path.expanduser("~"), ".hyeonggwangpen")
SECRETS_PATH = os.path.join(HOME_DIR, "secrets.env")
CARDS_REPO = os.path.join(HOME_DIR, "cards-repo")

KST = timezone(timedelta(hours=9))
GRAPH = "https://graph.facebook.com/v21.0"
SLOTS = ["07:40", "11:40", "13:40", "15:50", "17:40", "19:40", "21:40", "23:10"]


def now_kst():
    return datetime.now(KST)


def fmt_kst(dt):
    return dt.astimezone(KST).strftime("%Y-%m-%d %H:%M KST")


def parse_kst(s):
    """'YYYY-MM-DD HH:MM KST' 또는 ISO 문자열 → aware datetime."""
    s = s.replace(" KST", "").strip()
    try:
        return datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=KST)
    except ValueError:
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=KST)


def load_config():
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def load_secrets():
    vals = {}
    with open(SECRETS_PATH, encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                vals[k.strip()] = v.strip().strip("\"'")
    return vals


def load_log():
    if not os.path.exists(LOG_PATH):
        return {"posts": [], "runs": [], "corrections_pending": [], "followups_checked": []}
    with open(LOG_PATH, encoding="utf-8-sig") as f:
        log = json.load(f)
    for k in ("posts", "runs", "corrections_pending", "followups_checked"):
        log.setdefault(k, [])
    return log


def save_log(log):
    tmp = LOG_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(log, f, ensure_ascii=False, indent=2)
    os.replace(tmp, LOG_PATH)


class GraphError(Exception):
    def __init__(self, message, code=None, transient=False):
        super().__init__(message)
        self.code = code
        self.transient = transient


def graph(method, path, params=None, token=None):
    """Graph API 호출. 토큰은 절대 출력하지 않는다."""
    secrets = load_secrets()
    token = token or secrets.get("IG_PAGE_TOKEN") or secrets["IG_ACCESS_TOKEN"]
    params = dict(params or {})
    params["access_token"] = token
    url = f"{GRAPH}/{path.lstrip('/')}"
    data = None
    if method == "GET":
        url += "?" + urllib.parse.urlencode(params)
    else:
        data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(url, data=data, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            err = json.loads(e.read().decode()).get("error", {})
        except Exception:
            err = {}
        msg = err.get("message", f"HTTP {e.code}")
        transient = bool(err.get("is_transient")) or e.code >= 500 or err.get("code") in (1, 2, 4, 17, 32, 613)
        raise GraphError(msg, err.get("code"), transient) from None
    except (urllib.error.URLError, TimeoutError) as e:
        raise GraphError(f"network: {e}", transient=True) from None


def ig_user_id():
    return load_secrets()["IG_USER_ID"]


def retry(fn, waits=(120, 300), label="작업"):
    """실패하면 2분, 5분 뒤 두 번까지 다시 시도한다."""
    for i, wait in enumerate((0,) + tuple(waits)):
        if wait:
            print(f"[재시도] {label}: {wait // 60}분 뒤 다시 시도 ({i}/{len(waits)})", flush=True)
            time.sleep(wait)
        try:
            return fn()
        except GraphError as e:
            last = e
            print(f"[오류] {label}: {e}", flush=True)
    raise last
