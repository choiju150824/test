"""형광펜뉴스 카드 렌더러.

사용법:  python render.py post.json
결과:    out/<post_id>/01.png ... , preview.jpg(한눈에 보기), report.json(문제 목록)
문제가 하나라도 있으면 종료 코드 1. 글자 크기를 줄이지 않고 '문장을 줄이라'고 알려 준다.
"""
import json
import math
import os
import random
import re
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFont

from hgp_common import FONTS, OUT_DIR, load_config

W, H = 1080, 1350
ML, MR, MT, MB = 72, 72, 60, 52
CW = W - ML - MR
BG = (0xF4, 0xEF, 0xE4)
INK = (0x1A, 0x1A, 0x1A)
HL = (0xFF, 0xD8, 0x4D)
UP = (0xE5, 0x48, 0x3B)
DOWN = (0x2F, 0x5B, 0xD3)
MUTED = (0x6A, 0x66, 0x5E)
WHITE = (255, 255, 255)

FONT_FILES = {"black": "GothicA1-Black.ttf", "bold": "GothicA1-Bold.ttf", "hand": "Gaegu-Bold.ttf"}
_font_cache = {}
_notdef_cache = {}
_glyph_ok = {}


def glyph_sig(font, ch):
    im = Image.new("L", (64, 64))
    ImageDraw.Draw(im).text((8, 4), ch, font=font, fill=255)
    return im.tobytes()
EMOJI_RE = re.compile("[\U0001F000-\U0001FAFF☀-➿️‍]")

DEFAULT_LAYOUT = {
    "cover": "cover", "what": "top_text", "numbers": "top_visual", "scene": "center_visual",
    "context": "checklist", "final": "final", "define": "top_text", "metaphor": "center_visual",
    "case": "top_visual", "correction_cover": "cover", "correction_compare": "center_visual",
}


def F(kind, size):
    key = (kind, size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(os.path.join(FONTS, FONT_FILES[kind]), size)
    return _font_cache[key]


def color_of(name, default=INK):
    return {"up": UP, "down": DOWN, "ink": INK, "hl": HL, "muted": MUTED, "white": WHITE}.get(name or "", default)


class Card:
    def __init__(self, n, total, issues):
        self.n, self.total, self.issues = n, total, issues
        self.rng = random.Random(1000 + n)
        self.img = self._paper()
        self.d = ImageDraw.Draw(self.img)

    # ---------- 바탕 ----------
    def _paper(self):
        base = Image.new("RGB", (W, H), BG)
        noise = Image.effect_noise((W, H), 70).convert("RGB")
        textured = Image.blend(base, ImageChops.overlay(base, noise), 0.16)
        return textured.convert("RGBA")

    # ---------- 검사 ----------
    def issue(self, msg):
        self.issues.append(f"{self.n}장: {msg}")

    def check_glyphs(self, text, kind):
        font = F(kind, 40)
        if kind not in _notdef_cache:
            _notdef_cache[kind] = glyph_sig(font, "")
        for ch in set(text):
            if ch.isspace():
                continue
            if (kind, ch) not in _glyph_ok:
                _glyph_ok[(kind, ch)] = glyph_sig(font, ch) != _notdef_cache[kind]
            if not _glyph_ok[(kind, ch)]:
                self.issue(f"글꼴에 없는 글자 '{ch}' (깨져 보임)")
        if EMOJI_RE.search(text):
            self.issue("이모지 사용 금지")

    # ---------- 글자 ----------
    def text(self, xy, s, kind, size, fill=INK, anchor="la"):
        self.check_glyphs(s, kind)
        self.d.text(xy, s, font=F(kind, size), fill=fill, anchor=anchor)

    def wrap(self, s, kind, size, width):
        font = F(kind, size)
        lines, cur = [], ""
        for word in s.split(" "):
            cand = (cur + " " + word).strip()
            if font.getlength(cand) <= width:
                cur = cand
                continue
            if cur:
                lines.append(cur)
            cur = ""
            for ch in word:  # 단어 하나가 한 줄보다 길면 글자 단위로 자른다
                if font.getlength(cur + ch) > width and cur:
                    lines.append(cur)
                    cur = ""
                cur += ch
        if cur:
            lines.append(cur)
        return lines

    def paragraph(self, x, y, s, kind, size, width, fill=INK, gap=1.42, align="left"):
        lines = self.wrap(s, kind, size, width)
        lh = int(size * gap)
        for i, line in enumerate(lines):
            if align == "center":
                self.text((x + width / 2, y + i * lh), line, kind, size, fill, anchor="ma")
            else:
                self.text((x, y + i * lh), line, kind, size, fill)
        return len(lines) * lh

    # ---------- 손그림 요소 ----------
    def wobble_line(self, pts, fill=INK, width=6):
        self.d.line(pts, fill=fill, width=width, joint="curve")

    def highlight_band(self, x0, x1, top, bottom):
        r = self.rng
        pts = [(x0 - 6, top + r.randint(-2, 2)), (x1 + 6, top + r.randint(-3, 1)),
               (x1 + 3, bottom + r.randint(-1, 3)), (x0 - 4, bottom + r.randint(-2, 2))]
        self.d.polygon(pts, fill=HL)

    def scribble_circle(self, box, color=UP, width=5):
        x0, y0, x1, y1 = box
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        rx, ry = (x1 - x0) / 2 + 26, (y1 - y0) / 2 + 20
        pts = []
        start = self.rng.uniform(0, math.pi)
        for i in range(0, 75):
            t = start + i / 70 * 2 * math.pi * 1.06
            j = 1 + 0.035 * math.sin(i * 0.7) + self.rng.uniform(-0.01, 0.01)
            pts.append((cx + rx * j * math.cos(t), cy + ry * j * math.sin(t)))
        self.wobble_line(pts, color, width)

    def hand_arrow(self, start, end, color=INK, width=6):
        (sx, sy), (ex, ey) = start, end
        mx, my = (sx + ex) / 2 + (ey - sy) * 0.25, (sy + ey) / 2 - (ex - sx) * 0.25
        pts = []
        for i in range(21):
            t = i / 20
            pts.append(((1 - t) ** 2 * sx + 2 * (1 - t) * t * mx + t * t * ex,
                        (1 - t) ** 2 * sy + 2 * (1 - t) * t * my + t * t * ey))
        self.wobble_line(pts, color, width)
        ang = math.atan2(ey - pts[-3][1], ex - pts[-3][0])
        for da in (2.6, -2.6):
            self.wobble_line([(ex, ey), (ex + 30 * math.cos(ang + da), ey + 30 * math.sin(ang + da))], color, width)

    def checkbox(self, x, y, size, checked):
        self.d.rectangle([x, y, x + size, y + size], outline=INK, width=4, fill=WHITE)
        if checked:
            self.wobble_line([(x + size * 0.18, y + size * 0.52), (x + size * 0.42, y + size * 0.8),
                              (x + size * 1.05, y - size * 0.1)], UP, 7)

    # ---------- 붙이는 요소 ----------
    def paste_rotated(self, layer, x, y, angle):
        r = layer.rotate(angle, resample=Image.BICUBIC, expand=True)
        self.img.alpha_composite(r, (int(x - (r.width - layer.width) / 2), int(y - (r.height - layer.height) / 2)))

    def label_box(self, s, kind, size, fg, bg, border, pad=(22, 14)):
        self.check_glyphs(s, kind)
        font = F(kind, size)
        tw = font.getlength(s)
        asc, desc = font.getmetrics()
        bw, bh = int(tw + pad[0] * 2 + border * 2), int(asc + desc + pad[1] * 2 + border * 2)
        layer = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        ld.rectangle([0, 0, bw - 1, bh - 1], fill=INK if border else bg)
        ld.rectangle([border, border, bw - 1 - border, bh - 1 - border], fill=bg)
        ld.text((bw / 2, bh / 2), s, font=font, fill=fg, anchor="mm")
        return layer

    def kicker(self, s, x, y):
        layer = self.label_box(s, "bold", 32, WHITE, INK, 0)
        self.paste_rotated(layer, x, y, 2)  # 디자인(CSS) 기준 -2도 = 반시계 2도 = PIL rotate(+2)
        return layer.height

    def sticker(self, s, x, y, kind="bold", size=34, angle=None):
        layer = self.label_box(s, kind, size, INK, WHITE, 4)
        if angle is None:
            angle = self.rng.choice([-1, 1]) * self.rng.uniform(2, 6)
        if x + layer.width > W - MR + 10:
            self.issue(f"스티커 '{s}'가 오른쪽 여백을 넘음")
        self.paste_rotated(layer, x, y, angle)
        return layer.width, layer.height

    def handwriting(self, s, x, y, width=CW, size=46, align="left"):
        if not s:
            return 0
        lines = self.wrap(s, "hand", size, width)
        if len(lines) > 2:
            self.issue("손글씨 메모가 2줄을 넘음 (짧게)")
        layer = Image.new("RGBA", (int(width) + 20, int(size * 1.3 * len(lines)) + 20), (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)
        self.check_glyphs(s, "hand")
        for i, line in enumerate(lines):
            lx = 10 if align == "left" else layer.width - 10 - F("hand", size).getlength(line)
            ld.text((lx, 10 + i * size * 1.3), line, font=F("hand", size), fill=INK)
        self.paste_rotated(layer, x - 10, y - 10, self.rng.uniform(-3, 3))
        return layer.height

    # ---------- 머리·꼬리 ----------
    def header(self):
        font = F("bold", 28)
        self.text((ML, MT), "형광펜뉴스", "bold", 28)
        ux = ML + font.getlength("형광펜")
        asc = font.getmetrics()[0]
        self.d.rectangle([ML, MT + asc + 2, ux, MT + asc + 9], fill=HL)
        self.text((W - MR, MT - 6), f"{self.n} / {self.total}", "hand", 40, anchor="ra")
        return MT + 70

    def footer(self, s):
        lines = self.wrap(s, "bold", 24, CW)
        if len(lines) > 2:
            self.issue("하단 출처·고지 문구가 2줄을 넘음")
        lh = 32
        top = H - MB - lh * len(lines)
        for i, line in enumerate(lines):
            self.text((ML, top + i * lh + 4), line, "bold", 24, MUTED)
        return top - 24

    # ---------- 그림 ----------
    def visual(self, v, box, numbers=None):
        if not v:
            return
        x, y, w, h = box
        if isinstance(v, list):
            gap = 36
            weights = [float(it.get("weight", 1)) for it in v]
            avail = h - gap * (len(v) - 1)
            cy = y
            for it, wt in zip(v, weights):
                ih = avail * wt / sum(weights)
                self.visual(it, (x, cy, w, ih), numbers)
                cy += ih + gap
            return
        if h < v.get("min_h", 150):
            self.issue(f"그림 영역이 너무 좁음({int(h)}px) — 본문을 줄일 것")
            return
        t = v.get("type")
        fn = getattr(self, f"v_{t}", None)
        if not fn:
            self.issue(f"알 수 없는 그림 종류 '{t}'")
            return
        fn(v, x, y, w, h, numbers or [])

    def basis_note(self, s, x, y, w):
        if s:
            self.paragraph(x, y, s, "bold", 24, w, MUTED, 1.3)

    def panel(self, x0, y0, x1, y1, fill=WHITE, shadow=10):
        if shadow:
            self.d.rectangle([x0 + shadow, y0 + shadow, x1 + shadow, y1 + shadow], fill=INK)
        self.d.rectangle([x0, y0, x1, y1], fill=fill, outline=INK, width=4)

    def v_stats(self, v, x, y, w, h, _):
        """숫자 타일 2~3개를 한 줄로: [{label, value, unit, note, direction, hl}]"""
        items = v.get("items", [])[:3]
        if not items:
            self.issue("stats 항목이 없음")
            return
        gap = 28
        tw = (w - gap * (len(items) - 1) - 10) / len(items)
        vsize = 64 if len(items) == 3 else 76
        has_note = any(it.get("note") for it in items)
        th = min(h - 10, 40 + 30 + 14 + vsize + (40 if has_note else 0) + 30)
        ty = y + (h - 10 - th) / 2
        for i, it in enumerate(items):
            tx = x + i * (tw + gap)
            self.panel(tx, ty, tx + tw, ty + th, HL if it.get("hl") else WHITE)
            self.text((tx + 24, ty + 22), it.get("label", ""), "bold", 28)
            val, col = self._num_text(it)
            unit = it.get("unit", "")
            size = vsize
            while size > 44 and F("black", size).getlength(val) + F("bold", 32).getlength(unit) + 8 > tw - 40:
                size -= 4
            if F("black", size).getlength(val) + F("bold", 32).getlength(unit) + 8 > tw - 40:
                self.issue(f"숫자 타일 '{val}{unit}'이 칸보다 넓음")
            vy = ty + 22 + 30 + 18
            self.text((tx + 24, vy), val, "black", size, col)
            if unit:
                self.text((tx + 24 + F("black", size).getlength(val) + 6, vy + size * 0.42), unit, "bold", 32, col)
            if it.get("note"):
                self.text((tx + 24, vy + size + 14), it["note"], "bold", 24, MUTED)
                if F("bold", 24).getlength(it["note"]) > tw - 40:
                    self.issue(f"숫자 타일 메모 '{it['note']}'가 넓음")

    def v_facts(self, v, x, y, w, h, _):
        """한눈에 표: rows=[{k, v, color}] 최대 6줄"""
        rows = v.get("rows", [])
        if len(rows) > 6:
            self.issue("facts 표는 6줄까지")
            rows = rows[:6]
        title = v.get("title")
        row_h = max(64, min(92, (h - (70 if title else 0) - 30) / max(1, len(rows))))
        total_h = (70 if title else 0) + row_h * len(rows) + 30
        if total_h > h:
            self.issue("facts 표가 영역을 넘음 — 줄을 줄일 것")
        y0 = y + max(0, (h - total_h) / 2)
        self.panel(x, y0, x + w - 10, y0 + total_h)
        cy = y0 + 18
        if title:
            self.d.rectangle([x, y0, x + w - 10, y0 + 66], fill=INK)
            self.text((x + 28, y0 + 14), title, "bold", 32, WHITE)
            cy = y0 + 66 + 12
        kw = v.get("key_width", 300)
        for i, r in enumerate(rows):
            if i:
                self.d.line([(x + 24, cy - 4), (x + w - 34, cy - 4)], fill=(0xD9, 0xD3, 0xC6), width=2)
            self.text((x + 28, cy + row_h / 2 - 18), r.get("k", ""), "bold", 30, MUTED)
            val = r.get("v", "")
            col = color_of(r.get("color"), INK)
            if F("black", 36).getlength(val) > w - kw - 70:
                self.issue(f"facts 값 '{val}'이 칸보다 넓음")
            self.text((x + kw, cy + row_h / 2 - 22), val, "black", 36, col)
            cy += row_h

    def v_change(self, v, x, y, w, h, _):
        """전→후: {label, before:{label,value}, after:{label,value}, delta, direction}"""
        b, a = v.get("before", {}), v.get("after", {})
        ph = min(h - 20, 280)
        py = y + (h - 20 - ph) / 2 + (40 if v.get("label") else 0) / 2
        if v.get("label"):
            self.text((x, py - 54), v["label"], "bold", 32)
        bw = (w - 150) / 2
        col = color_of(v.get("direction"), UP)
        for i, side in enumerate((b, a)):
            px = x + i * (bw + 140)
            self.panel(px, py, px + bw, py + ph, HL if i == 1 else WHITE)
            self.text((px + bw / 2, py + 28), side.get("label", ""), "bold", 30, INK, anchor="ma")
            size = 84
            while size > 48 and F("black", size).getlength(side.get("value", "")) > bw - 40:
                size -= 4
            self.text((px + bw / 2, py + ph / 2 + 22), side.get("value", ""), "black", size, INK, anchor="mm")
            if side.get("note"):
                self.text((px + bw / 2, py + ph - 52), side["note"], "bold", 24, MUTED, anchor="ma")
        ax0, ax1 = x + bw + 34, x + bw + 116
        self.hand_arrow((ax0, py + ph / 2 - 30), (ax1, py + ph / 2 - 44), col, 7)
        if v.get("delta"):
            d = v["delta"]
            if v.get("direction") == "up" and not d.startswith("▲"):
                d = "▲" + d
            if v.get("direction") == "down" and not d.startswith("▼"):
                d = "▼" + d
            dw = F("black", 30).getlength(d) + 28
            cx0 = x + bw + 70 - dw / 2
            self.panel(cx0, py + ph / 2 + 4, cx0 + dw, py + ph / 2 + 56, WHITE, 0)
            self.text((cx0 + dw / 2, py + ph / 2 + 12), d, "black", 30, col, anchor="ma")

    def v_table(self, v, x, y, w, h, _):
        """표: columns=[..], rows=[[..]], widths=[비율], note"""
        cols = v.get("columns", [])
        rows = v.get("rows", [])
        widths = v.get("widths") or [1] * len(cols)
        tot = sum(widths)
        xs = [x + 24]
        for wd in widths[:-1]:
            xs.append(xs[-1] + (w - 58) * wd / tot)
        note_h = 44 if v.get("note") else 0
        row_h = max(56, min(80, (h - 70 - 16 - note_h) / max(1, len(rows))))
        total_h = 70 + row_h * len(rows) + 16
        if total_h + note_h > h:
            self.issue("표가 영역을 넘음 — 줄을 줄일 것")
        y0 = y + max(0, (h - total_h - note_h) / 2)
        self.panel(x, y0, x + w - 10, y0 + total_h)
        self.d.rectangle([x, y0, x + w - 10, y0 + 66], fill=INK)
        for cx, c in zip(xs, cols):
            self.text((cx, y0 + 16), c, "bold", 28, WHITE)
        cy = y0 + 66 + 8
        for ri, r in enumerate(rows):
            if ri % 2 == 1:
                self.d.rectangle([x + 4, cy - 4, x + w - 14, cy + row_h - 6], fill=(0xFB, 0xF4, 0xD9))
            for ci, (cx, cell) in enumerate(zip(xs, r)):
                lim = (xs[ci + 1] - cx - 14) if ci + 1 < len(xs) else (x + w - 34 - cx)
                kind = "black" if ci == 0 else "bold"
                if F(kind, 30).getlength(str(cell)) > lim:
                    self.issue(f"표 칸 '{cell}'이 너무 김")
                self.text((cx, cy + row_h / 2 - 22), str(cell), kind, 30)
            cy += row_h
        if v.get("note"):
            self.text((x, y0 + total_h + 18), v["note"], "bold", 24, MUTED)

    def v_icon(self, v, x, y, w, h, _):
        names = v.get("names") or [v.get("name", "document")]
        cap = v.get("label")
        cap_h = 80 if cap else 0
        size = min(h - cap_h, (w - 40 * (len(names) - 1)) / len(names), 460)
        total_w = size * len(names) + 40 * (len(names) - 1)
        for i, name in enumerate(names):
            cx = x + (w - total_w) / 2 + size / 2 + i * (size + 40)
            draw_icon(self, name, cx, y + (h - cap_h) / 2, size, v)
        if cap:
            lw = F("bold", 34).getlength(cap) + 52
            self.sticker(cap, x + (w - lw) / 2, y + h - cap_h + 6)

    def _num_text(self, num):
        val = str(num.get("value", ""))
        direction = num.get("direction")
        if direction == "up" and not val.startswith("▲"):
            val = "▲" + val
        if direction == "down" and not val.startswith("▼"):
            val = "▼" + val
        return val, color_of(direction, INK)

    def v_bignum(self, v, x, y, w, h, numbers):
        nums = v.get("numbers") or numbers
        if not nums:
            self.issue("bignum 그림에 숫자가 없음")
            return
        if len(nums) > 3:
            self.issue("핵심 수치는 3개까지")
        nums = nums[:3]
        row = h / len(nums)
        vsize = 120 if len(nums) == 1 else 104 if len(nums) == 2 else 96
        for i, num in enumerate(nums):
            ry = y + i * row + (row - vsize - 60) / 2
            self.text((x, ry), num.get("label", ""), "bold", 34, MUTED)
            val, col = self._num_text(num)
            unit = num.get("unit", "")
            vy = ry + 48
            self.text((x, vy), val, "black", vsize, col)
            vw = F("black", vsize).getlength(val)
            if unit:
                self.text((x + vw + 12, vy + vsize * 0.42), unit, "bold", 46, col)
                vw += 12 + F("bold", 46).getlength(unit)
            if vw > w:
                self.issue(f"숫자 '{val}{unit}'가 너무 길어 여백을 넘음")
            if i == 0 and v.get("circle", True):
                self.scribble_circle((x, vy + vsize * 0.1, x + vw, vy + vsize * 1.02))
            if num.get("basis"):
                self.text((x, vy + vsize + 18), "기준: " + num["basis"], "bold", 24, MUTED)

    def _scale(self, values):
        lo, hi = min(0, min(values)), max(0, max(values))
        return lo, (hi - lo) or 1

    def v_bars(self, v, x, y, w, h, _):
        items = v.get("items", [])
        if not items:
            self.issue("막대 차트에 항목이 없음")
            return
        vals = [float(it["value"]) for it in items]
        lo, span = self._scale(vals)
        note_h = 50 if v.get("basis") else 0
        if v.get("title"):
            self.text((x, y), v["title"], "bold", 34)
            y, h = y + 60, h - 60
        labw = min(300, max(F("bold", 30).getlength(it["label"]) for it in items) + 24)
        valw = max(F("black", 40).getlength(self._num_text(it)[0] if it.get("direction") else str(it.get("display", it["value"]))) for it in items) + 40
        barmax = w - labw - valw
        row = min(150, (h - note_h) / len(items))
        y = y + max(0, (h - note_h - row * len(items)) / 2)
        zero = x + labw + barmax * (-lo / span)
        for i, it in enumerate(items):
            ry = y + i * row
            th = row * 0.56
            self.text((x, ry + (th - 30) / 2), it["label"], "bold", 30)
            val = float(it["value"])
            length = barmax * abs(val) / span
            col = color_of(it.get("color") or it.get("direction"), INK)
            bx0, bx1 = (zero, zero + length) if val >= 0 else (zero - length, zero)
            self.d.rectangle([bx0, ry, max(bx1, bx0 + 3), ry + th], fill=col)
            disp = it.get("display", str(it["value"]))
            if it.get("direction"):
                disp = self._num_text({"value": disp, "direction": it["direction"]})[0]
            self.text((max(bx1, zero) + 14, ry + (th - 40) / 2 - 4), disp, "black", 40, col)
        self.d.line([(zero, y - 10), (zero, y + row * len(items) - row * 0.3)], fill=INK, width=4)
        self.basis_note(v.get("basis") and "기준: " + v["basis"], x, y + row * len(items) + 4, w)

    def v_columns(self, v, x, y, w, h, _):
        items = v.get("items", [])
        if not items:
            self.issue("세로 막대 차트에 항목이 없음")
            return
        vals = [float(it["value"]) for it in items]
        if min(vals) < 0:
            self.issue("세로 막대는 음수를 지원하지 않음 — bars 사용")
            return
        note_h = 50 if v.get("basis") else 0
        top_pad, bot_pad = 64, 56
        chart_h = h - note_h - top_pad - bot_pad
        n = len(items)
        slot = w / n
        cw = min(150, slot * 0.6)
        base_y = y + top_pad + chart_h
        mx = max(vals) or 1
        for i, it in enumerate(items):
            cx = x + slot * i + slot / 2
            ch = chart_h * float(it["value"]) / mx
            col = color_of(it.get("color") or it.get("direction"), INK)
            self.d.rectangle([cx - cw / 2, base_y - ch, cx + cw / 2, base_y], fill=col)
            disp = it.get("display", str(it["value"]))
            if it.get("direction"):
                disp = self._num_text({"value": disp, "direction": it["direction"]})[0]
            self.text((cx, base_y - ch - 50), disp, "black", 38, col, anchor="ma")
            self.text((cx, base_y + 14), it["label"], "bold", 28, INK, anchor="ma")
            if F("black", 38).getlength(disp) > slot - 8 or F("bold", 28).getlength(it["label"]) > slot - 8:
                self.issue(f"세로 막대 '{it['label']}'의 글자가 칸보다 넓음")
        self.d.line([(x, base_y), (x + w, base_y)], fill=INK, width=4)
        self.basis_note(v.get("basis") and "기준: " + v["basis"], x, base_y + bot_pad, w)

    def v_line(self, v, x, y, w, h, _):
        items = v.get("items", [])
        if len(items) < 2:
            self.issue("선 차트는 점이 2개 이상 필요")
            return
        vals = [float(it["value"]) for it in items]
        lo, span = self._scale(vals)
        note_h = 50 if v.get("basis") else 0
        top_pad, bot_pad, side = 64, 56, 60
        ch = h - note_h - top_pad - bot_pad
        base_y = y + top_pad + ch
        pts = []
        for i, it in enumerate(items):
            px = x + side + (w - 2 * side) * i / (len(items) - 1)
            py = base_y - ch * (float(it["value"]) - lo) / span
            pts.append((px, py))
        self.d.line([(x, base_y + ch * lo / span if lo else base_y), (x + w, base_y + ch * lo / span if lo else base_y)],
                    fill=INK, width=4)
        self.d.line(pts, fill=color_of(v.get("color"), UP), width=8, joint="curve")
        for (px, py), it in zip(pts, items):
            self.d.ellipse([px - 11, py - 11, px + 11, py + 11], fill=WHITE, outline=INK, width=4)
            self.text((px, py - 58), it.get("display", str(it["value"])), "black", 34, INK, anchor="ma")
            self.text((px, base_y + 14), it["label"], "bold", 26, INK, anchor="ma")
        self.basis_note(v.get("basis") and "기준: " + v["basis"], x, base_y + bot_pad, w)

    def v_versus(self, v, x, y, w, h, _):
        sides = [v.get("left", {}), v.get("right", {})]
        gap = 90
        cw = (w - gap) / 2
        icon_s = min(200, h * 0.3)
        has_icon = any(sd.get("icon") for sd in sides)
        text_h = max(len(self.wrap(sd.get("text", ""), "bold", 40, cw - 56)) for sd in sides) * int(40 * 1.38)
        card_h = 60 + (icon_s + 40 if has_icon else 0) + text_h + 40
        if card_h + 40 > h:
            self.issue("대비 카드 글자가 칸을 넘음 — 문장을 줄일 것")
        y = y + max(0, (h - card_h - 40) / 2)
        for i, side in enumerate(sides):
            cx = x + i * (cw + gap)
            self.panel(cx, y + 40, cx + cw - 10, y + 40 + card_h, HL if side.get("hl") else WHITE)
            ty = y + 100
            if side.get("icon"):
                draw_icon(self, side["icon"], cx + cw / 2, ty + icon_s / 2, icon_s, {})
            if has_icon:
                ty += icon_s + 40
            self.paragraph(cx + 28, ty, side.get("text", ""), "bold", 40, cw - 56, INK, 1.38)
            self.sticker(side.get("label", ""), cx + 18, y, size=38, angle=(4 if i == 0 else -4))
        self.text((x + w / 2, y + 40 + card_h / 2), "vs", "hand", 84, UP, anchor="mm")

    def v_checklist(self, v, x, y, w, h, _):
        items = [(it, True) if isinstance(it, str) else (it.get("text", ""), it.get("checked", True)) for it in v.get("items", [])]
        if len(items) > 4:
            self.issue("체크리스트는 4개까지")
        heights = [max(len(self.wrap(t, "bold", 44, w - 84)) * int(44 * 1.36), 64) + 44 for t, _ in items]
        total = sum(heights)
        if total > h:
            self.issue("체크리스트가 영역을 넘음 — 항목을 줄일 것")
        cy = y + max(0, (h - total) / 2)
        for (text, checked), ih in zip(items, heights):
            if len(text) > 30:
                self.issue(f"체크리스트 문장이 30자를 넘음: {text[:12]}…")
            self.checkbox(x, cy + 6, 50, checked)
            self.paragraph(x + 84, cy, text, "bold", 44, w - 84, INK, 1.36)
            cy += ih

    def v_timeline(self, v, x, y, w, h, _):
        items = v.get("items", [])
        if not items:
            return
        if v.get("compact"):
            n = len(items)
            col = w / n
            y = y + max(0, (h - 150) / 2)
            ly = y + 18
            self.d.line([(x + 16, ly), (x + col * (n - 1) + 16, ly)], fill=INK, width=4)
            for i, it in enumerate(items):
                cx = x + i * col
                self.d.ellipse([cx, ly - 16, cx + 32, ly + 16], fill=HL if i == 0 else WHITE, outline=INK, width=4)
                self.text((cx, ly + 34), it.get("date", ""), "black", 40)
                self.text((cx, ly + 88), it.get("text", ""), "bold", 32)
                if max(F("black", 40).getlength(it.get("date", "")), F("bold", 32).getlength(it.get("text", ""))) > col - 16:
                    self.issue(f"일정 '{it.get('date')}' 글자가 칸보다 넓음")
            if h < 150:
                self.issue("일정 영역이 좁음")
            return
        row = min(190, h / len(items))
        if row < 118:
            self.issue("일정 영역이 좁음 — 항목을 줄일 것")
        y = y + max(0, (h - row * len(items)) / 2)
        self.d.line([(x + 16, y + 24), (x + 16, y + row * (len(items) - 1) + 24)], fill=INK, width=4)
        for i, it in enumerate(items):
            ry = y + i * row
            self.d.ellipse([x, ry + 8, x + 32, ry + 40], fill=HL if i == 0 else WHITE, outline=INK, width=4)
            self.text((x + 64, ry), it.get("date", ""), "black", 46)
            used = self.paragraph(x + 64, ry + 64, it.get("text", ""), "bold", 38, w - 64, INK, 1.3)
            if 64 + used > row:
                self.issue("일정 설명이 길어 다음 항목과 겹침 — 줄일 것")


# ---------- 아이콘 (단색 플랫, 굵은 테두리) ----------
def draw_icon(card, name, cx, cy, s, v):
    d = card.d
    lw = max(5, int(s / 38))
    acc = color_of(v.get("accent"), HL)

    def R(x0, y0, x1, y1, fill=WHITE):
        d.rectangle([cx + x0 * s, cy + y0 * s, cx + x1 * s, cy + y1 * s], fill=fill, outline=INK, width=lw)

    def E(x0, y0, x1, y1, fill=WHITE):
        d.ellipse([cx + x0 * s, cy + y0 * s, cx + x1 * s, cy + y1 * s], fill=fill, outline=INK, width=lw)

    def P(pts, fill=WHITE):
        d.polygon([(cx + a * s, cy + b * s) for a, b in pts], fill=fill, outline=INK, width=lw)

    def L(pts, fill=INK, width=None):
        d.line([(cx + a * s, cy + b * s) for a, b in pts], fill=fill, width=width or lw, joint="curve")

    if name == "building":
        R(-0.3, -0.42, 0.3, 0.45)
        for r in range(4):
            for c in range(3):
                R(-0.22 + c * 0.16, -0.32 + r * 0.17, -0.13 + c * 0.16, -0.22 + r * 0.17, acc if (r + c) % 3 == 0 else WHITE)
        R(-0.07, 0.3, 0.07, 0.45, INK)
    elif name == "factory":
        P([(-0.45, 0.4), (-0.45, -0.05), (-0.25, -0.2), (-0.25, -0.05), (-0.05, -0.2), (-0.05, -0.05), (0.15, -0.2),
           (0.15, -0.05), (0.45, -0.05), (0.45, 0.4)])
        R(0.25, -0.45, 0.37, -0.05, acc)
        for i in range(3):
            R(-0.36 + i * 0.22, 0.1, -0.24 + i * 0.22, 0.24, acc)
        E(0.33, -0.62, 0.45, -0.5)
    elif name == "bank":
        P([(-0.45, -0.18), (0, -0.45), (0.45, -0.18)], acc)
        for i in range(4):
            R(-0.36 + i * 0.22, -0.12, -0.26 + i * 0.22, 0.3)
        R(-0.45, 0.3, 0.45, 0.4, INK)
    elif name == "document":
        P([(-0.3, -0.42), (0.14, -0.42), (0.3, -0.26), (0.3, 0.42), (-0.3, 0.42)])
        L([(0.14, -0.42), (0.14, -0.26), (0.3, -0.26)])
        for i in range(5):
            L([(-0.2, -0.2 + i * 0.11), (0.2 if i % 2 == 0 else 0.08, -0.2 + i * 0.11)])
        if v.get("stamp", True):
            E(0.02, 0.12, 0.28, 0.38, None)
            L([(0.08, 0.25), (0.14, 0.31), (0.23, 0.19)], UP)
    elif name == "gavel":
        P([(-0.35, -0.2), (-0.05, -0.45), (0.08, -0.3), (-0.22, -0.05)], acc)
        P([(-0.13, -0.27), (-0.04, -0.36), (0.36, 0.04), (0.27, 0.13)])
        R(-0.42, 0.3, 0.12, 0.42, INK)
        R(-0.33, 0.22, 0.03, 0.3)
    elif name == "scale":
        L([(0, -0.42), (0, 0.38)])
        L([(-0.38, -0.3), (0.38, -0.3)])
        R(-0.18, 0.38, 0.18, 0.44, INK)
        for sx in (-0.38, 0.38):
            L([(sx, -0.3), (sx - 0.14, 0.02)])
            L([(sx, -0.3), (sx + 0.14, 0.02)])
            P([(sx - 0.18, 0.02), (sx + 0.18, 0.02), (sx + 0.1, 0.1), (sx - 0.1, 0.1)], acc if sx < 0 else WHITE)
    elif name == "globe":
        E(-0.42, -0.42, 0.42, 0.42, acc)
        E(-0.18, -0.42, 0.18, 0.42, None)
        L([(-0.42, 0), (0.42, 0)])
        L([(-0.37, -0.2), (0.37, -0.2)])
        L([(-0.37, 0.2), (0.37, 0.2)])
        L([(0, -0.42), (0, 0.42)])
    elif name == "chip":
        for i in range(5):
            o = -0.24 + i * 0.12
            L([(o, -0.42), (o, -0.3)]); L([(o, 0.3), (o, 0.42)])
            L([(-0.42, o), (-0.3, o)]); L([(0.3, o), (0.42, o)])
        R(-0.3, -0.3, 0.3, 0.3, INK)
        R(-0.16, -0.16, 0.16, 0.16, acc)
    elif name == "ship":
        for i, col in enumerate([acc, UP, DOWN, WHITE]):
            R(-0.3 + i * 0.14, -0.12, -0.17 + i * 0.14, 0.06, col)
        R(-0.24, -0.28, -0.04, -0.12, WHITE)
        P([(-0.46, 0.06), (0.46, 0.06), (0.34, 0.3), (-0.36, 0.3)], INK)
        L([(-0.48, 0.4), (-0.3, 0.36), (-0.1, 0.4), (0.1, 0.36), (0.3, 0.4), (0.48, 0.36)], DOWN)
    elif name in ("person", "people"):
        offs = [0] if name == "person" else [-0.3, 0.3, 0]
        for i, o in enumerate(offs):
            k = 1 if name == "person" or i == 2 else 0.8
            E(o - 0.12 * k, -0.4 * k, o + 0.12 * k, -0.16 * k, acc if i == len(offs) - 1 else WHITE)
            P([(o - 0.24 * k, 0.4), (o - 0.2 * k, -0.06 * k), (o + 0.2 * k, -0.06 * k), (o + 0.24 * k, 0.4)],
              INK if i == len(offs) - 1 else WHITE)
    elif name == "coin":
        E(-0.4, -0.4, 0.4, 0.4, acc)
        E(-0.3, -0.3, 0.3, 0.3, None)
        sym = v.get("symbol", "₩")
        card.text((cx, cy), sym, "black", int(s * 0.38), INK, anchor="mm")
    elif name == "calendar":
        R(-0.4, -0.32, 0.4, 0.42)
        R(-0.4, -0.32, 0.4, -0.14, UP)
        for x in (-0.22, 0.22):
            L([(x, -0.42), (x, -0.24)])
        for r in range(3):
            for c in range(5):
                R(-0.32 + c * 0.13, -0.06 + r * 0.14, -0.24 + c * 0.13, 0.02 + r * 0.14, INK if (r, c) == (1, 3) else WHITE)
    elif name == "magnifier":
        E(-0.38, -0.38, 0.14, 0.14, acc)
        L([(0.1, 0.1), (0.4, 0.4)], INK, lw * 3)
    elif name == "house":
        P([(-0.42, -0.02), (0, -0.4), (0.42, -0.02)], acc)
        R(-0.32, -0.02, 0.32, 0.42)
        R(-0.08, 0.16, 0.08, 0.42, INK)
    elif name == "battery":
        R(-0.24, -0.36, 0.24, 0.44)
        R(-0.1, -0.44, 0.1, -0.36, INK)
        for i in range(3):
            R(-0.16, 0.26 - i * 0.2, 0.16, 0.36 - i * 0.2, acc)
    elif name in ("arrow_up", "arrow_down"):
        col = UP if name == "arrow_up" else DOWN
        sgn = -1 if name == "arrow_up" else 1
        P([(-0.14, -0.3 * sgn), (0.14, -0.3 * sgn), (0.14, 0.05 * sgn), (0.32, 0.05 * sgn), (0, 0.42 * sgn),
           (-0.32, 0.05 * sgn), (-0.14, 0.05 * sgn)], col)
    else:
        card.issue(f"알 수 없는 아이콘 '{name}'")


# ---------- 레이아웃 ----------
BODY_MAX_SENT, BODY_MAX_CHARS = 3, 34


def body_list(slide):
    body = slide.get("body") or []
    return [body] if isinstance(body, str) else body


def body_height(card, slide, size):
    return sum(len(card.wrap(s, "bold", size, CW)) * int(size * 1.42) + 12 for s in body_list(slide))


def body_block(card, slide, y, size=40):
    body = body_list(slide)
    if len(body) > BODY_MAX_SENT:
        card.issue(f"본문은 장당 {BODY_MAX_SENT}문장까지")
    for s in body:
        if len(s) > BODY_MAX_CHARS:
            card.issue(f"본문 문장이 {BODY_MAX_CHARS}자를 넘음({len(s)}자): {s[:14]}…")
    used = 0
    for s in body:
        used += card.paragraph(ML, y + used, s, "bold", size, CW) + 12
    return used


def headline_lines(card, slide, size=60):
    hl = slide.get("headline", "")
    if not hl:
        return []
    lines = hl if isinstance(hl, list) else card.wrap(hl, "black", size, CW)
    if len(lines) > 2:
        card.issue("장 헤드라인은 2줄까지")
    return lines


def headline_height(card, slide, size=60):
    n = len(headline_lines(card, slide, size))
    return n * int(size * 1.22) + (22 if n else 0)


def headline_block(card, slide, y, size=60):
    lines = headline_lines(card, slide, size)
    word = slide.get("hl", "")
    font = F("black", size)
    done = False
    for i, ln in enumerate(lines):
        ly = y + i * int(size * 1.22)
        if F("black", size).getlength(ln) > CW:
            card.issue(f"헤드라인 줄이 폭을 넘음: {ln}")
        if word and word in ln and not done:
            done = True
            x0 = ML + font.getlength(ln[: ln.index(word)])
            _, top, _, bottom = font.getbbox(word)
            gh = bottom - top
            card.highlight_band(x0, x0 + font.getlength(word), ly + top + gh * 0.58, ly + top + gh * 0.92)
        card.text((ML, ly), ln, "black", size)
    if word and not done:
        card.issue(f"헤드라인 형광펜 단어 '{word}'가 없음")
    return headline_height(card, slide, size)


def label_sticker(card, slide, y):
    if not slide.get("label"):
        return 0
    _, h = card.sticker(slide["label"], ML - 4, y, size=32, angle=card.rng.choice([-3, 3]))
    if slide.get("tag"):
        card.text((W - MR, y + 14), slide["tag"], "bold", 26, MUTED, anchor="ra")
    return h + 22


def render_cover(card, slide):
    y = card.header() + 34
    if slide.get("kicker"):
        y += card.kicker(slide["kicker"], ML, y) + 40
    title = slide.get("title", "")
    lines = title if isinstance(title, list) else title.split("\n")
    if len(lines) > 2:
        card.issue("표지 제목은 2줄까지")
    for ln in lines:
        if len(ln.replace(" ", "")) > 9:
            card.issue(f"표지 제목 줄이 9자를 넘음: {ln}")
    size = 132
    while size > 96 and max(F("black", size).getlength(ln) for ln in lines) > CW:
        size -= 4
    if max(F("black", size).getlength(ln) for ln in lines) > CW:
        card.issue("표지 제목이 96px에서도 폭을 넘음 — 제목을 줄일 것")
    hw = slide.get("highlight", "")
    font = F("black", size)
    found = False
    for i, ln in enumerate(lines):
        ly = y + i * int(size * 1.16)
        if hw and hw in ln and not found:
            found = True
            x0 = ML + font.getlength(ln[: ln.index(hw)])
            _, top, _, bottom = font.getbbox(hw)
            gh = bottom - top
            card.highlight_band(x0, x0 + font.getlength(hw), ly + top + gh * 0.58, ly + top + gh * 0.92)
        card.text((ML, ly), ln, "black", size)
    if hw and not found:
        card.issue(f"형광펜 단어 '{hw}'가 제목에 없음")
    y += len(lines) * int(size * 1.16) + 18
    sub = slide.get("sub", "")
    if len(sub) > 25:
        card.issue(f"표지 서브가 25자를 넘음({len(sub)}자)")
    if sub:
        if F("bold", 40).getlength(sub) > CW:
            card.issue("표지 서브가 한 줄을 넘음")
        card.text((ML, y), sub, "bold", 40)
        y += 76
    bottom = card.footer(slide["_footer"])
    hand_h = 100 if slide.get("handwriting") else 0
    card.visual(slide.get("visual"), (ML, y + 20, CW, bottom - y - 20 - hand_h), slide.get("numbers"))
    if slide.get("handwriting"):
        card.handwriting(slide["handwriting"], ML + CW * 0.35, bottom - hand_h + 30, CW * 0.65, 46, "right")


def render_inner(card, slide, order):
    """order: 'text_first' | 'visual_first' | 'hand_top'"""
    y = card.header() + 28
    y += label_sticker(card, slide, y)
    bottom = card.footer(slide["_footer"])
    hand = slide.get("handwriting")
    hand_h = 74 if hand else 0
    if order == "hand_top" and hand:
        card.handwriting(hand, ML, y - 6, CW, 46)
        y += hand_h
    y += headline_block(card, slide, y)
    bsize = 40
    if order == "visual_first":
        bh = body_height(card, slide, bsize)
        vis_h = bottom - y - bh - (hand_h if order != "hand_top" else 0) - 24
        card.visual(slide.get("visual"), (ML, y, CW, vis_h), slide.get("numbers"))
        by = y + vis_h + 20
        body_block(card, slide, by, bsize)
        if hand and order != "hand_top":
            card.handwriting(hand, ML + CW * 0.3, by + bh - 4, CW * 0.7, 46, "right")
    else:
        y += body_block(card, slide, y, bsize) + 18
        if hand and order != "hand_top":
            card.handwriting(hand, ML + CW * 0.3, bottom - hand_h, CW * 0.7, 46, "right")
            bottom -= hand_h
        card.visual(slide.get("visual"), (ML, y, CW, bottom - y - 8), slide.get("numbers"))


def render_top_text(card, slide):
    render_inner(card, slide, "text_first")


def render_top_visual(card, slide):
    render_inner(card, slide, "visual_first")


def render_center_visual(card, slide):
    render_inner(card, slide, "hand_top" if slide.get("handwriting") else "visual_first")


def render_checklist(card, slide):
    slide.setdefault("visual", {"type": "checklist", "items": []})
    render_inner(card, slide, "text_first")


def render_final(card, slide, cfg):
    y = card.header() + 28
    y += label_sticker(card, slide, y)
    full = cfg["disclaimer_full"]
    lines = card.wrap(full, "bold", 26, CW - 56)
    box_h = len(lines) * 38 + 56
    box_top = H - MB - box_h
    card.d.rectangle([ML, box_top, W - MR, H - MB], fill=WHITE, outline=INK, width=4)
    card.text((ML + 28, box_top + 22), "투자 유의", "black", 26)
    for i, ln in enumerate(lines):
        card.text((ML + 28, box_top + 22 + 40 + i * 38 - 6), ln, "bold", 26)
    box_top -= 32
    badge = slide.get("verify_text")
    if badge:
        bw = min(CW, F("bold", 26).getlength(badge) + 96)
        bh = 58
        by0 = box_top - bh
        card.panel(ML, by0, ML + bw - 8, box_top - 6, HL, 6)
        cx, cy = ML + 34, by0 + (bh - 6) / 2
        card.d.ellipse([cx - 16, cy - 16, cx + 16, cy + 16], fill=WHITE, outline=INK, width=3)
        card.wobble_line([(cx - 8, cy), (cx - 2, cy + 7), (cx + 10, cy - 8)], UP, 5)
        card.text((ML + 62, cy), badge, "bold", 26, INK, anchor="lm")
        if bw >= CW:
            card.issue("검증 배지 문구가 너무 김")
        box_top = by0 - 24
    srcs = slide.get("sources_text") or ""
    src_lines = card.wrap("출처: " + srcs, "bold", 24, CW) if srcs else []
    if len(src_lines) > 3:
        card.issue("출처가 3줄을 넘음 — 기관명만 남길 것")
    src_top = box_top - len(src_lines) * 34
    for i, ln in enumerate(src_lines):
        card.text((ML, src_top + i * 34), ln, "bold", 24, MUTED)
    y += headline_block(card, slide, y)
    y += body_block(card, slide, y, 40) + 10
    hand_h = 74 if slide.get("handwriting") else 0
    vis_bottom = src_top - 26 - hand_h
    card.visual(slide.get("visual"), (ML, y, CW, vis_bottom - y), slide.get("numbers"))
    if slide.get("handwriting"):
        card.handwriting(slide["handwriting"], ML + CW * 0.3, vis_bottom + 4, CW * 0.7, 46, "right")


LAYOUTS = {"cover": render_cover, "top_text": render_top_text, "top_visual": render_top_visual,
           "center_visual": render_center_visual, "checklist": render_checklist}


def post_id_of(post):
    if post.get("id"):
        return post["id"]
    run = post.get("run_at", "")[:10].replace("-", "")
    return f"{run}-{post.get('slot', '0000').replace(':', '')}"


def render(post, out_dir=None):
    cfg = load_config()
    slides = post["slides"]
    total = len(slides)
    issues = []
    pid = post_id_of(post)
    out_dir = out_dir or os.path.join(OUT_DIR, pid)
    os.makedirs(out_dir, exist_ok=True)
    src_names = " · ".join(s["name"] for s in post.get("sources", []) if s.get("name"))
    footer_src = post.get("footer_source") or src_names
    if not 2 <= total <= 10:
        issues.append(f"장 수 {total} — 인스타 캐러셀은 2~10장")
    prev_layout = None
    paths = []
    for i, slide in enumerate(slides, 1):
        card = Card(i, total, issues)
        role = slide.get("role", "")
        layout = slide.get("layout") or ("final" if i == total else DEFAULT_LAYOUT.get(role, "top_text"))
        if layout == prev_layout:
            card.issue(f"직전 장과 같은 레이아웃({layout}) — 바꿀 것")
        prev_layout = layout
        footer = slide.get("footer") or (f"출처: {footer_src} · " if footer_src else "") + cfg["disclaimer_short"]
        if layout != "final" and len(card.wrap(footer, "bold", 24, CW)) > 1:
            card.issue("하단 출처 줄이 2줄로 넘어감 — post.footer_source를 짧게 지정할 것")
        if cfg["disclaimer_short"] not in footer and layout != "final":
            card.issue("하단에 '정보 제공용 · 투자 권유 아님'이 없음")
        slide["_footer"] = footer
        slide.setdefault("sources_text", src_names)
        if layout == "final" and post.get("verification", {}).get("badge"):
            slide.setdefault("verify_text", post["verification"]["badge"])
        if layout == "final":
            render_final(card, slide, cfg)
        else:
            LAYOUTS[layout](card, slide)
        slide.pop("_footer", None)
        path = os.path.join(out_dir, f"{i:02d}.png")
        card.img.convert("RGB").save(path, "PNG", optimize=True)
        paths.append(path)
    # 한눈에 보기
    thumb_w = 360
    th = int(thumb_w * H / W)
    cols = 3
    rows = math.ceil(total / cols)
    sheet = Image.new("RGB", (cols * thumb_w + (cols + 1) * 16, rows * th + (rows + 1) * 16), (200, 200, 200))
    for i, p in enumerate(paths):
        im = Image.open(p).resize((thumb_w, th), Image.LANCZOS)
        sheet.paste(im, (16 + (i % cols) * (thumb_w + 16), 16 + (i // cols) * (th + 16)))
    sheet.save(os.path.join(out_dir, "preview.jpg"), quality=88)
    report = {"post_id": pid, "slides": paths, "issues": issues, "ok": not issues}
    with open(os.path.join(out_dir, "report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    return report


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    with open(sys.argv[1], encoding="utf-8") as f:
        post = json.load(f)
    rep = render(post)
    print(json.dumps(rep, ensure_ascii=False, indent=2))
    sys.exit(0 if rep["ok"] else 1)
