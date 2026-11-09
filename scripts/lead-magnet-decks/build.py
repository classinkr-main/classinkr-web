#!/usr/bin/env python3
"""ClassIn 원장 노트 — 16:9 HTML 리드마그넷 덱 생성기.

    python3 scripts/lead-magnet-decks/build.py                 # 16종 전부, 기본 테마
    python3 scripts/lead-magnet-decks/build.py --theme t-ink   # 테마 지정
    python3 scripts/lead-magnet-decks/build.py --only academy-system-checklist --out /tmp/x

정본: 문항·점수·플랜·스크립트 = data/lead-magnets.json, 표지·후킹 = content.py.
결과: public/materials/lead-magnets/decks/<slug>.html (글꼴까지 넣은 단일 파일) + index.html
"""
from __future__ import annotations

import argparse
import base64
import html
import io
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
from content import COPY_FIX, DECK_OPTS, EXTRAS, OV, PICKS, SCENE_NOTE  # noqa: E402

DATA = ROOT / "data" / "lead-magnets.json"
OUT = ROOT / "public" / "materials" / "lead-magnets" / "decks"
PRETENDARD = ROOT / "node_modules" / "pretendard" / "dist" / "web" / "variable" / "woff2" / "PretendardVariable.woff2"
MONO = HERE / "assets" / "IBMPlexMono-Medium-latin.woff2"
LOGO = ROOT / "public" / "images" / "quotes" / "classin-logo.png"
SITE = "https://classin.co.kr"
STAGE_KO = {"TOFU": "진단", "MOFU": "설계", "BOFU": "검증"}
REPLAY_DECKS = {"parent-replay-retention-script-kit", "classroom-recording-replay-setup-guide", "online-class-timing-check"}
SOURCE_NOTE = {"night-online-class-remote-academy-guide": "근거: 학원의 설립·운영 및 과외교습에 관한 법률 제24조, 교육지원청 안내. 지역·시점에 따라 다를 수 있어 관할 교육지원청 확인이 우선입니다."}

e = html.escape


def utm(path: str, slug: str, content: str) -> str:
    sep = "&" if "?" in path else "?"
    if "#" in path:
        base, frag = path.split("#", 1)
        return f"{SITE}{base}{sep}utm_source=lead_magnet&utm_medium=deck&utm_campaign={slug}&utm_content={content}#{frag}"
    return f"{SITE}{path}{sep}utm_source=lead_magnet&utm_medium=deck&utm_campaign={slug}&utm_content={content}"


def parse_band(rng: str) -> tuple[int, int]:
    nums = [int(x) for x in re.findall(r"\d+", rng)]
    return (nums[0], nums[1]) if len(nums) >= 2 else (nums[0], nums[0])


def strip_tags(s: str) -> str:
    return re.sub(r"<[^>]+>", "", s)


def _units(text: str) -> float:
    u = 0.0
    for ch in text:
        if "\uac00" <= ch <= "\ud7a3":
            u += 0.9
        elif ch == " ":
            u += 0.27
        elif ch in ",.?!·“”‘’\"'":
            u += 0.32
        elif ch.isdigit() or ch.isupper():
            u += 0.62
        else:
            u += 0.54
    return u


def cover_size(title_html: str, width: int = 930) -> int:
    """표지 제목이 칸(약 930px) 안에서 줄마다 한 줄로 들어가는 가장 큰 크기."""
    lines = [strip_tags(x) for x in re.split(r"<br\s*/?>", title_html)]
    size = min(136, int(width / max(_units(x) for x in lines)))
    if len(lines) >= 3:
        size = min(size, 116)
    return max(size, 72)


def fix_copy(x):
    """COPY_FIX 를 문자열 전체에 적용한 사본을 돌려준다(정본 JSON 은 그대로)."""
    if isinstance(x, str):
        for a, b in COPY_FIX.items():
            x = x.replace(a, b)
        return x
    if isinstance(x, list):
        return [fix_copy(v) for v in x]
    if isinstance(x, dict):
        return {k: fix_copy(v) for k, v in x.items()}
    return x


def load_magnets() -> dict:
    return {m["slug"]: fix_copy(m) for m in json.loads(DATA.read_text())}


STAGE_ORDER = {"TOFU": 0, "MOFU": 1, "BOFU": 2}


def next_magnet(slug: str, magnets: dict) -> str | None:
    """다음 자료: 관련 자료 중 퍼널 단계가 한 칸 뒤인 것을 먼저 고른다. 결정 단계는 쇼룸 키트로."""
    rel = [r for r in ((magnets[slug].get("pdfGuide") or {}).get("relatedMagnets") or []) if r in OV and r != slug]
    here = STAGE_ORDER[OV[slug]["stage"]]
    later = [r for r in rel if STAGE_ORDER[OV[r]["stage"]] > here]
    if later:
        return later[0]
    if here == 2 and slug != "showroom-demo-readiness-kit":
        return "showroom-demo-readiness-kit"
    return rel[0] if rel else None


# ───────────────────────── 슬라이드 조각 ─────────────────────────
class Deck:
    def __init__(self, m: dict, ov: dict, all_magnets: dict):
        self.m, self.ov, self.all = m, ov, all_magnets
        self.slides: list[dict] = []
        self.slug = m["slug"]

    def add(self, cls: str, body: str, sect: str = "", foot: str = "", ink: bool = False, sunken: bool = False):
        self.slides.append(dict(cls=cls, body=body, sect=sect, foot=foot, ink=ink, sunken=sunken))

    # 표지
    def cover(self):
        m, ov = self.m, self.ov
        c = ov["cover"]
        stamp = c.get("stamp")
        sec0 = m["sections"][0]
        art = c.get("art", "check")
        total = sum(len(s["items"]) for s in m["sections"])
        if art == "calc":
            rows = (m.get("worksheet") or {}).get("rows", [])[:5]
            mock_rows = "".join(
                f'<div class="m-row"><span>{e(r["label"])}</span><span class="num" style="margin-left:auto;color:var(--faint)">__분</span></div>'
                for r in rows if not r.get("highlight"))
            front = f'''<div class="mock front"><div class="m-head"><span>Worksheet</span><span>강사 1명 · 주당</span></div>
              <div class="m-title">{e((m.get("worksheet") or {}).get("title", "계산표"))}</div>{mock_rows}
              <div class="m-foot"><div><div class="num" style="font-size:16px;letter-spacing:.08em;color:var(--muted);margin-bottom:10px">연간 절감 시간</div><div class="m-score">??<small>시간</small></div></div>
              <div class="m-bands"><i class="on"></i><i class="on"></i><i></i><i></i></div></div></div>'''
        elif art == "chat":
            ss = (m.get("scriptSamples") or [])[:2]
            bub = "".join(
                f'<div class="m-row" style="display:block;border:0;padding:0;margin-top:18px"><div class="num" style="font-size:15px;letter-spacing:.08em;color:var(--muted);text-transform:uppercase;margin-bottom:10px">{e(s["scenario"].split(" — ")[0][:22])}</div>'
                f'<div style="background:var(--accent-soft);border-radius:16px 16px 16px 4px;padding:18px 20px;font:500 19px/1.5 var(--sans);color:var(--ink)">{e(s["good"][:92])}…</div></div>'
                for s in ss)
            front = f'''<div class="mock front art-chat"><div class="m-head"><span>Message Kit</span><span>복사해서 사용</span></div>
              <div class="m-title">결석·복습·상담 메시지</div>{bub}</div>'''
        elif art == "steps":
            rows = "".join(
                f'<div class="m-step"><span class="st">{e(a)}</span><span>{e(b)}</span></div>' for a, b in c["steps"])
            front = f'''<div class="mock front"><div class="m-head"><span>Roadmap</span><span>{len(c["steps"])}단계</span></div>
              <div class="m-title">{e(ov["series"])}, 이 순서로</div><div class="m-steps">{rows}</div>
              <div class="m-foot"><div class="ex">첫 단계 범위는 상담에서 우리 학원 조건으로 좁힙니다</div></div></div>'''
        elif art == "profile":
            groups = [("과목", ["국어", "영어", "수학", "과학"], 1), ("규모", ["단일 지점", "지점 2~4곳", "5곳 이상"], 0), ("병목", ["보강", "녹화", "교안", "상담"], 2)]
            chips = "".join(
                f'<div class="m-grp"><span class="gk">{e(k)}</span><div>' + "".join(f'<i class="{"on" if j == on else ""}">{e(v)}</i>' for j, v in enumerate(vs)) + "</div></div>"
                for k, vs, on in groups)
            front = f'''<div class="mock front"><div class="m-head"><span>Profile</span><span>3줄 브리프</span></div>
              <div class="m-title">우리 학원 프로필</div>{chips}
              <div class="m-foot"><div class="ex">→ 조건이 닮은 익명 사례부터 봅니다</div></div></div>'''
        elif art == "timeline":
            st = EXTRAS.get("classin-pre-adoption-questions-checklist", {}).get("before_cta", [{}])[0].get("steps", [])
            rows = "".join(f'<div class="m-step"><span class="st">{e(t)}분</span><span>{e(a)}</span></div>' for t, a, _ in st)
            front = f'''<div class="mock front"><div class="m-head"><span>Showroom</span><span>30분</span></div>
              <div class="m-title">목동 쇼룸 30분</div><div class="m-steps">{rows}</div>
              <div class="m-foot"><div class="ex">가져오실 것: 대표 수업 1개 · 교실 사진 · 반복 업무 3개</div></div></div>'''
        elif art == "scope":
            b = EXTRAS[self.slug]["after_hook"][0]
            yes = "".join(f"<li>{e(x)}</li>" for x in b["yes"][1][:4])
            no = "".join(f"<li>{e(x.split('(')[0])}</li>" for x in b["no"][1][:4])
            front = f'''<div class="mock front"><div class="m-head"><span>Honest scope</span><span>계약 전 확인</span></div>
              <div class="m-title">맡는 것과 나누는 것</div><div class="m-scope"><div><b>ClassIn이 맡는 것</b><ul class="y">{yes}</ul></div><div><b>지금 시스템과 나누는 것</b><ul>{no}</ul></div></div>
              <div class="m-foot"><div class="ex">나머지 질문 43개는 자체평가로</div></div></div>'''
        else:
            items = sec0["items"][:3]
            rows = "".join(
                f'<div class="m-row{" on" if i in (0, 2) else ""}"><span class="b"></span><span>{e(it)}</span></div>'
                for i, it in enumerate(items))
            nb = len(m["scoreBands"])
            bands = "".join(f'<i class="{"on" if i == 1 else ""}"></i>' for i in range(nb))
            lo1, hi1 = parse_band(m["scoreBands"][min(1, nb - 1)]["range"])
            ex = (lo1 + hi1) // 2
            front = f'''<div class="mock front"><div class="m-head"><span>Section 01</span><span>{len(sec0["items"])}문항</span></div>
              <div class="m-title">{e(sec0["title"])}</div>{rows}
              <div class="m-foot"><div><div class="ex">예시 결과 · {e(m["scoreBands"][min(1, nb - 1)]["label"])}</div><div class="m-score">{ex}<small> / {total}</small></div></div><div class="m-bands">{bands}</div></div></div>'''
        stamp_html = f'<div class="cover-stamp"><div><b>{e(stamp[0])}</b>{stamp[1]}</div></div>' if stamp else ""
        audience = m["audience"].split(",")[0:3]
        aud = "·".join(a.strip() for a in audience)
        if len(aud) > 22:
            aud = aud[:22].rstrip("·, ") + " 등"
        body = f'''<div class="cover-main">
            <div><div class="kicker"><span class="no">No.{ov["no"]:02d}</span><span class="ko">{e(ov["series"])}</span><span>· {e(m["formatLabel"].split(" + ")[0])}</span></div>
            <h1 class="display" style="--cover-size:{cover_size(c["title"])}px">{c["title"]}</h1>
            <p class="lead">{e(c["sub"])}</p></div>
            <dl class="meta"><div><dt>Format</dt><dd>{e(m["formatLabel"])}</dd></div><div><dt>Time</dt><dd>{m["estimatedMinutes"]}분</dd></div><div><dt>For</dt><dd>{e(aud)}</dd></div></dl>
          </div>
          <div class="cover-art">{stamp_html}<div class="sheet-stack"><div class="mock back"></div><div class="mock mid"></div>{front}</div></div>'''
        self.add("s-cover", body, sect="", foot='<span class="src">ClassIn Korea · 목동 쇼룸 상담팀이 만든 원장용 실무 자료</span><span class="tag">classin.co.kr</span>')

    # 후킹
    def hook(self):
        h = self.ov["hook"]
        kind = h["kind"]
        eyebrow = f'<div class="eyebrow">{e(h["eyebrow"])}</div>'
        title = f'<h2 class="statement">{h["title"]}</h2>'
        after = f'<p class="after">{e(h["after"])}</p>' if h.get("after") else ""
        foot = f'<span class="src">{SCENE_NOTE}</span><span class="tag">Why it matters</span>'
        if kind == "flow":
            n = len(h["nodes"])
            nodes = "".join(
                f'<div class="node{"" if leak else " ok"}"><div class="dot">{i + 1:02d}</div>{"<span class=leak>!</span>" if leak else ""}'
                f'<div class="stage">{e(st)}</div><div class="what">{e(what)}</div><div class="where">{e(where)}</div></div>'
                for i, (st, what, where, leak) in enumerate(h["nodes"]))
            body = f'{eyebrow}{title}<div class="flow" style="--n:{n}">{nodes}</div>{after}'
            if not any(x[3] for x in h["nodes"]):
                foot = '<span class="src">단계와 범위는 학원 구성에 따라 다르며, 상담에서 확인합니다.</span><span class="tag">Why it matters</span>'
        elif kind == "scenes":
            sc = "".join(f'<li><div class="q">{e(q)}</div><p>{e(p)}</p></li>' for q, p in h["scenes"])
            body = f'{eyebrow}{title}<ol class="scenes">{sc}</ol>{after}'
        elif kind == "qwall":
            qs = "".join(f'<div class="q">{e(q)}<small>{e(t)}</small></div>' for q, t in h["qs"])
            body = f'{eyebrow}{title}<div class="qwall">{qs}</div>{after}'
            foot = '<span class="src">질문은 상담 현장에서 자주 나오는 유형을 정리한 것입니다.</span><span class="tag">Why it matters</span>'
        elif kind == "estimate":
            lines = "".join(
                f'<div class="qr {cls}"><span>{e(a)}</span><span class="st">{e(b)}</span></div>' for a, b, cls in h["lines"])
            body = f'''<div style="display:grid;grid-template-columns:1fr 760px;gap:110px;height:100%;align-items:center">
              <div>{eyebrow}<h2 class="statement" style="font-size:88px">{h["title"]}</h2><p class="lead" style="margin-top:40px">{e(h["body"])}</p></div>
              <div class="quote-mock"><div class="qh"><span>예시 견적서</span><span>교실 1개</span></div>{lines}
              <div class="small" style="margin-top:22px">‘빠짐·확인 필요’ 칸이 따로 사야 하거나 사람이 손으로 이어야 하는 부분입니다.</div></div></div>'''
            foot = '<span class="src">예시 견적서는 비교 단위를 설명하기 위한 가상 구성이며, 실제 견적은 교실 구성에 따라 상담에서 확정합니다.</span><span class="tag">Why it matters</span>'
        elif kind == "compare":
            mk = {"y": '<i class="mk y"></i>', "p": '<i class="mk p"></i>', "n": '<i class="mk"></i>'}
            lab = {"y": "한 흐름", "p": "따로 연결", "n": "범위 밖"}
            ths = "".join(f'<th class="{"me" if i == len(h["cols"]) - 1 else ""}">{e(c)}</th>' for i, c in enumerate(h["cols"]))
            trs = "".join(
                "<tr><th>" + e(r) + "</th>" + "".join(
                    f'<td class="{"me" if i == len(v) - 1 else ""}">{mk[x]}{lab[x]}</td>' for i, x in enumerate(v)) + "</tr>"
                for r, v in h["rows"])
            body = f'{eyebrow}<h2 class="h2" style="margin-top:22px">{h["title"]}</h2><table class="cmp"><thead><tr><th></th>{ths}</tr></thead><tbody>{trs}</tbody></table>'
            foot = f'<span class="src">{e(h["legend"])}</span>'
        elif kind == "bound":
            y, n = h["yes"], h["no"]
            body = f'''{eyebrow}<h2 class="h2" style="margin-top:22px">{h["title"]}</h2>
              <div class="bound"><div class="col"><div class="k">{e(y[0])}</div><ul>{"".join(f"<li>{e(x)}</li>" for x in y[1])}</ul></div>
              <div class="col no"><div class="k">{e(n[0])}</div><ul>{"".join(f"<li>{e(x)}</li>" for x in n[1])}</ul></div></div>'''
            foot = f'<span class="src">{e(h["note"])}</span>'
        else:
            raise ValueError(kind)
        self.add("s-hook", body, sect="왜 이 자료인가", foot=foot, ink=h.get("ink", False))

    # 이 자료로 얻는 것
    def inside(self):
        m = self.m
        pg = m.get("pdfGuide") or {}
        opts = DECK_OPTS.get(self.slug, {})
        deliv = "".join(f'<li><span class="num">{i + 1:02d}</span><span>{e(d)}</span></li>' for i, d in enumerate(opts.get("deliverables", m["deliverables"])[:5]))
        how = "".join(f"<li>{e(x)}</li>" for x in opts.get("how", pg.get("howToUse") or [])[:3])
        total = sum(len(s["items"]) for s in m["sections"])
        chips = (f'<span class="chip"><span class="num">{total}</span>문항</span>'
                 f'<span class="chip"><span class="num">{len(m["sections"])}</span>개 영역</span>'
                 f'<span class="chip"><span class="num">{m["estimatedMinutes"]}</span>분</span>'
                 '<span class="chip">결과는 이 브라우저에만 저장</span>')
        body = f'''<div><div class="eyebrow mono">Inside · 이 자료로 얻는 것</div>
            <h2 class="h2" style="font-size:{56 if len(pg.get("outcome") or m["summary"]) < 60 else 46}px">{e(pg.get("outcome") or m["summary"])}</h2>
            <ol class="deliv">{deliv}</ol></div>
          <div><div class="eyebrow mono">How to use · 쓰는 법</div>
            <ol class="howto">{how}</ol>
            <div class="chips">{chips}</div>
            <p class="hint">칸을 누르면 체크됩니다. 인쇄(PDF)하면 빈 칸으로 나와 손으로도 쓸 수 있습니다.</p></div>'''
        self.add("s-inside", body, sect="이 자료 사용법")

    # 이야기(storyGuide)
    def story(self):
        sg = self.m.get("storyGuide")
        if not sg:
            return
        beats = "".join(f"<li>{e(b)}</li>" for b in sg["beats"][:5])
        tsize = 60 if len(sg["title"]) > 30 else 70
        if len(sg["body"]) > 220 or sum(len(b) for b in sg["beats"]) > 300:
            body = f'''<div style="max-width:1500px"><div class="eyebrow mono">Story · {e(sg["eyebrow"])}</div><h2 class="h1" style="font-size:{tsize}px;margin-top:22px">{e(sg["title"])}</h2>
                <p class="txt" style="margin-top:36px;font-size:27px;max-width:1400px">{e(sg["body"])}</p><div class="takeaway">{e(sg["takeaway"])}</div></div>'''
            self.add("s-story solo", body, sect="한눈에 보기")
            body = f'''<div style="grid-column:1/-1"><div class="eyebrow mono">Key points · 핵심 {len(sg["beats"][:5])}줄</div><ol class="beats two" style="margin-top:30px">{beats}</ol></div>'''
            self.add("s-story solo", body, sect="한눈에 보기", foot=f'<span class="src">{e(SOURCE_NOTE.get(self.slug, ""))}</span>' if SOURCE_NOTE.get(self.slug) else "")
            return
        body = f'''<div><div class="eyebrow mono">Story · {e(sg["eyebrow"])}</div><h2 class="h1" style="font-size:{tsize}px;margin-top:22px">{e(sg["title"])}</h2>
            <p class="txt" style="margin-top:34px;font-size:25px">{e(sg["body"])}</p></div>
          <div><ol class="beats">{beats}</ol><div class="takeaway">{e(sg["takeaway"])}</div></div>'''
        self.add("s-story", body, sect="한눈에 보기")

    # 자가진단
    def checklists(self):
        secs = self.m["sections"]
        n = len(secs)
        for si, s in enumerate(secs):
            k = len(s["items"])
            avg = sum(len(x) for x in s["items"]) / k
            tot = sum(len(x) for x in s["items"])
            cls = "two" if k >= 7 else ("dense tight" if (k == 6 and avg > 52) or tot > 300 else "dense" if k == 6 else "")
            items = "".join(
                f'<li><button class="chk" type="button" data-item="{si}-{ii}" data-sec="{si}" aria-pressed="false"><span class="box" aria-hidden="true"></span><span class="t">{e(it)}</span></button></li>'
                for ii, it in enumerate(s["items"]))
            title = s["title"]
            total = sum(len(x["items"]) for x in secs)
            body = f'''<aside class="rail"><div class="secno"><b>{si + 1:02d}</b><span>/ {n:02d}</span></div>
                <h2 class="h2{" long" if len(title) > 14 else ""}">{e(title)}</h2><p class="txt{" long" if len(s["description"]) > 95 else ""}">{e(s["description"])}</p>
                <div class="tally"><span class="num"><b data-sec-count="{si}">0</b> / {k}</span><span class="bar"><i data-sec-bar="{si}"></i></span><span class="lbl">예</span></div>
                <div class="rail-total"><span>전체 <b data-total>0</b> / {total}</span><span data-band-label data-empty="체크 전">체크 전</span></div></aside>
              <ol class="items {cls}">{items}</ol>'''
            self.add("s-check", body, sect="",
                     foot='<span class="src">‘예’라고 답할 수 있는 칸만 누르세요. 애매하면 비워 둡니다.</span><span class="tag">Self check</span>')

    def flags(self):
        rf = self.m.get("redFlags") or []
        if not rf:
            return
        li = "".join(
            f'<li><button class="flag" type="button" data-flag="{i}" aria-pressed="false"><span class="mk" aria-hidden="true">!</span><span class="t">{e(x)}</span></button></li>'
            for i, x in enumerate(rf[:6]))
        body = f'''<div><div class="eyebrow mono">Red flags</div><h2 class="h2" style="margin-top:22px">점수와 별개로,<br>이 중 하나라도 맞다면<br><em>먼저 짚고</em> 가세요.</h2>
            <p class="txt" style="margin-top:30px">해당하는 줄을 누르세요. 표시한 레드 플래그는 뒤의 ‘상담용 한 장’에 그대로 옮겨져, 상담에서 가장 먼저 다룹니다.</p></div>
          <ol class="flags">{li}</ol>'''
        self.add("s-flags", body, sect="레드 플래그", foot='<span class="src">레드 플래그는 도입을 막는 신호가 아니라, 상담에서 먼저 풀 주제입니다.</span><span class="tag">Red flags</span>')

    def score(self):
        m = self.m
        bands = m["scoreBands"]
        secs = m["sections"]
        total = sum(len(x["items"]) for x in secs)
        bar = "".join(f'<i data-band="{i}" style="flex:1"></i>' for i in range(len(bands)))
        bl = "".join(f'<li data-band="{i}"><span class="rg">{e(b["range"])}</span><span class="lb">{e(b["label"])}</span></li>' for i, b in enumerate(bands))
        subs = ""
        if len(secs) >= 2:
            subs = "".join(
                f'<li><div class="sb-h"><span>{e(x["title"])}</span><span class="num" data-sub-num="{i}">0/{len(x["items"])}</span></div><div class="sb"><i data-sub-bar="{i}"></i></div></li>'
                for i, x in enumerate(secs))
            subs = f'<div class="subs-h">영역별</div><ol class="subs{" two" if len(secs) > 5 else ""}">{subs}</ol>'
        body = f'''<div><div class="eyebrow mono">Result · 우리 학원 점수</div>
            <div class="score-big"><b data-total>0</b><span>/ {total}</span></div>
            <div class="score-state muted" data-band-label data-empty="아직 체크하지 않았습니다">아직 체크하지 않았습니다</div>
            <p class="txt band-desc" data-band-desc data-empty="앞 장의 문항에서 ‘예’인 칸을 누르면 점수와 구간이 바로 계산됩니다."></p>
            <div class="score-actions"><a class="btn-primary" href="{e(utm("/showroom", self.slug, "score"))}" target="_blank" rel="noopener">이 결과로 시연 예약 →</a><button class="copy-btn" type="button" data-copy-result>결과 복사하기</button></div>
            <p class="print-note small" style="margin-top:20px">인쇄본: ‘예’ 개수를 세어 오른쪽 구간에 표시하세요.</p></div>
          <div class="bands"><div class="band-bar">{bar}<div class="marker hidden"><span><b data-total>0</b>점</span></div></div>
            <ol class="band-chips" style="--n:{len(bands)}">{bl}</ol>{subs}</div>'''
        self.add("s-score", body, sect="결과", foot='<span class="src">점수는 합격선이 아니라, 어디부터 손볼지 정하는 출발점입니다.</span><span class="tag">Your result</span>')

    def consult(self):
        """상담용 한 장: 점수·약한 영역·체크한 레드 플래그·준비물이 자동으로 채워진다."""
        m = self.m
        opts = DECK_OPTS.get(self.slug, {})
        total = sum(len(x["items"]) for x in m["sections"])
        ev = m.get("expertVoice")
        q = (ev["comment"] if ev else (m.get("pdfGuide") or {}).get("expertNote", ""))
        sents = re.split(r"(?<=[.!?])\s+", q.strip())
        line = sents[0]
        for sent in sents[1:]:
            if len(line) + len(sent) > 120:
                break
            line = f"{line} {sent}"
        prep = "".join(f"<li>{e(x)}</li>" for x in m["consultationPrep"][:4])
        has_flags = bool(m.get("redFlags"))
        flag_box = (f'''<div class="cs-box"><div class="cs-k">체크한 레드 플래그</div><ul class="cs-flags" data-flag-list data-empty="표시한 레드 플래그가 없습니다."><li class="empty">표시한 레드 플래그가 없습니다.</li></ul></div>''' if has_flags else "")
        body = f'''<div class="cs-left"><div class="eyebrow mono">Consult sheet · 상담용 한 장</div>
            <h2 class="h2" style="margin-top:18px">체크한 결과가<br><em>상담 메모</em>로 채워졌습니다.</h2>
            <div class="cs-sum"><div><span class="cs-k">총점</span><b class="num"><span data-total>0</span> / {total}</b></div><div><span class="cs-k">구간</span><b data-band-label data-empty="체크 전">체크 전</b></div></div>
            <div class="cs-k" style="margin-top:28px">{e(opts.get("fix_title", "먼저 손볼 곳 3"))}</div>
            <ol class="fix" data-fix-list><li><span class="num">01</span><div><b>가장 낮은 영역</b><p>체크를 마치면, 낮은 영역의 비어 있는 첫 문항이 여기에 정리됩니다.</p></div></li><li><span class="num">02</span><div><b>두 번째 영역</b><p>인쇄본에서는 낮은 영역을 직접 적어 보세요.</p></div></li><li><span class="num">03</span><div><b>세 번째 영역</b><p>이 세 줄이 상담에서 가장 먼저 확인할 질문이 됩니다.</p></div></li></ol></div>
          <div class="cs-right">{flag_box}
            <div class="cs-box"><div class="cs-k">상담 때 챙겨 오면 좋은 것</div><ul class="cs-prep">{prep}</ul></div>
            <p class="cs-voice">“{e(line)}”<span>목동 쇼룸 상담팀</span></p>
            <div class="score-actions"><button class="btn-primary" type="button" data-copy-sheet>실장님께 보낼 요약 복사</button><a class="copy-btn" href="{e(utm("/contact#contact-form", self.slug, "consult_sheet"))}" target="_blank" rel="noopener">이 한 장으로 상담 신청 →</a></div></div>'''
        self.add("s-consult", body, sect="상담용 한 장", foot='<span class="src">이 장의 내용은 이 브라우저에서만 만들어지며, 복사하기 전까지 어디에도 전송되지 않습니다.</span><span class="tag">Consult sheet</span>')

    def worksheet(self):
        ws = self.m.get("worksheet")
        if not ws:
            return
        cols = ws["columns"]
        calc = self.slug == "academy-resource-reduction-calculator"
        if calc:
            cols = ["지금", "목표", "줄일 시간"]
            head = "".join(f'<th class="c">{e(c)} <span class="unit">분/주</span></th>' for c in cols)
            trs = ""
            ri = 0
            for r in ws["rows"]:
                if r.get("highlight"):
                    trs += f'<tr class="hl"><td>{e(r["label"])}</td><td><output data-sum="0">-</output></td><td><output data-sum="1">-</output></td><td><output data-sum="d">-</output></td></tr>'
                else:
                    trs += (f'<tr data-diff><td>{e(r["label"])}</td>'
                            f'<td><input inputmode="decimal" data-col="0" data-w="r{ri}c0" aria-label="{e(r["label"])} 현재(분)" placeholder="0"></td>'
                            f'<td><input inputmode="decimal" data-col="1" data-w="r{ri}c1" aria-label="{e(r["label"])} 도입 후(분)" placeholder="0"></td>'
                            f'<td><output>-</output></td></tr>')
                    ri += 1
            body = f'''<div><div class="eyebrow mono">Worksheet · 직접 채우는 계산표</div><h2 class="h2" style="margin-top:22px;font-size:56px">{e(ws["title"])}</h2>
                <table class="ws" data-unit="min"><thead><tr><th>반복 업무</th>{head}</tr></thead><tbody>{trs}</tbody></table></div>
              <div class="calc"><div class="row"><span>강사 수</span><input inputmode="numeric" data-w="teachers" aria-label="강사 수" placeholder="0"></div>
                <div class="box"><div class="k">월 절감 시간 · 학원 전체</div><div class="v"><span data-month>-</span><small>시간</small></div></div>
                <div class="box"><div class="k">연 절감 시간 · 학원 전체</div><div class="v"><span data-year>-</span><small>시간</small></div></div>
                <div class="row" style="font-weight:500;font-size:20px;color:var(--muted)"><span>하루 8시간 근무로 환산하면</span><span><b class="num" data-days style="color:var(--ink);font-size:26px">-</b> 일</span></div>
                <p class="calc-note">원장님이 입력한 숫자로만 계산한 값입니다. ClassIn의 효과 수치가 아닙니다.</p>
                <p class="formula">{e(ws.get("formula", ""))}</p></div>'''
            self.add("s-sheet", body, sect="계산표", foot=f'<span class="src">{e(ws.get("note", ""))}</span><span class="tag">Worksheet</span>')
            return
        # 텍스트 워크시트(반별 기본값 표 · 4주 시험 운영표 · 도구 고르기)
        if len(cols) == 1 and len(ws["rows"]) > 7:
            cards = "".join(
                f'<div class="wc{" hl" if r.get("highlight") else ""}"><div class="l">{e(r["label"])}<span class="h">{e(r.get("hint", ""))}</span></div>'
                f'<input data-w="t{ri}c0" aria-label="{e(r["label"])} {e(cols[0])}" placeholder="{e(cols[0])}"></div>'
                for ri, r in enumerate(ws["rows"]))
            body = f'''<div style="grid-column:1/-1"><div class="eyebrow mono">Worksheet · 직접 채우는 표</div><h2 class="h2" style="margin-top:18px;font-size:52px">{e(ws["title"])}</h2>
                <div class="wsgrid">{cards}</div></div>'''
            note = " ".join(x for x in [ws.get("formula", ""), ws.get("note", "")] if x)
            self.add("s-sheet s-sheet-text", body, sect="워크시트", foot=f'<span class="src">{e(note)}</span>')
            return
        wide = len(cols) >= 3
        head = "".join(f'<th>{e(c)}</th>' for c in cols)
        trs = ""
        for ri, r in enumerate(ws["rows"]):
            hint = f'<span class="hint">{e(r["hint"])}</span>' if r.get("hint") else ""
            cells = "".join(f'<td><input data-w="t{ri}c{ci}" aria-label="{e(r["label"])} {e(c)}"></td>' for ci, c in enumerate(cols))
            trs += f'<tr class="{"hl" if r.get("highlight") else ""}"><td style="width:{"34%" if wide else "46%"}">{e(r["label"])}{hint}</td>{cells}</tr>'
        intro = f'<p class="txt" style="font-size:22px;margin-top:16px;max-width:1500px">{e(ws.get("intro", ""))}</p>' if ws.get("intro") and len(ws["rows"]) <= 7 else ""
        body = f'''<div style="grid-column:1/-1"><div class="eyebrow mono">Worksheet · 직접 채우는 표</div><h2 class="h2" style="margin-top:18px;font-size:52px">{e(ws["title"])}</h2>{intro}
            <table class="ws text">{"<thead><tr><th>항목</th>" + head + "</tr></thead>"}<tbody>{trs}</tbody></table></div>'''
        note = " ".join(x for x in [ws.get("formula", ""), ws.get("note", "")] if x)
        self.add("s-sheet s-sheet-text", body, sect="워크시트", foot=f'<span class="src">{e(note)}</span>')

    def cases(self):
        cc = self.m.get("caseCards") or []
        if not cc:
            return
        chunks = [cc[i:i + 3] for i in range(0, len(cc), 3)]
        for ci, ch in enumerate(chunks):
            cards = ""
            for c in ch:
                q = c.get("quote", "")
                qt, who = (q.rsplit(" — ", 1) + [""])[:2] if " — " in q else (q, "")
                cards += f'''<article class="case"><div class="lb"><span>{e(c["profile"].split(" · ")[0])}</span><span>익명 사례</span></div>
                  <div class="nm">{e(c["label"])}</div><div class="pf">{e(c["profile"])}</div>
                  <div class="row"><b>Before</b><p>{e(c["challenge"])}</p></div><div class="row after"><b>After</b><p>{e(c["change"])}</p></div>
                  {f"<q>{e(qt)}</q><div class='small' style='margin-top:8px'>{e(who)}</div>" if qt else ""}</article>'''
            title = "우리와 닮은 학원은<br>이렇게 <em>시작했습니다.</em>" if ci == 0 else "조건이 다른 학원의<br><em>다른 시작점</em>"
            body = f'<div class="eyebrow mono">Cases · 익명 사례</div><h2 class="h2" style="margin-top:18px">{title}</h2><div class="cases" style="--n:{len(ch)}">{cards}</div>'
            self.add("s-cases", body, sect="사례", foot='<span class="src">학원명은 일부를 가렸고, 정량 성과 수치는 싣지 않았습니다. 운영 변화는 고객 인터뷰 기준입니다.</span><span class="tag">Cases</span>')

    def scripts(self):
        ss = self.m.get("scriptSamples") or []
        if not ss:
            return
        longest = max(len(x["good"]) + len(x.get("avoid", "")) + len(x.get("why", "")) for x in ss)
        size = 2 if longest > 240 else 3
        chunks = [ss[i:i + size] for i in range(0, len(ss), size)]
        for ci, ch in enumerate(chunks):
            cards = ""
            for si, s in enumerate(ch):
                sid = f"sc-{ci}-{si}"
                scen = s["scenario"]
                head, _, sub = scen.partition(" — ")
                cards += f'''<article class="script"><div class="sc">{e(sub or "상황")}</div><div class="ttl">{e(head)}</div>
                  <div class="bubble has-cp" id="{sid}" data-text="{e(s["good"])}"><button class="cp" type="button" data-copy="{sid}">복사</button>{e(s["good"])}</div>
                  {f'<div class="avoid"><b>Avoid</b>{e(s["avoid"])}</div>' if s.get("avoid") else ""}
                  {f'<p class="why">{e(s["why"])}</p>' if s.get("why") else ""}</article>'''
            t0 = DECK_OPTS.get(self.slug, {}).get("scripts_title", "링크만 보내지 말고,<br><em>언제까지 무엇을</em> 함께 보냅니다.")
            title = t0 if ci == 0 else "상황마다 쓸 문장을,<br><em>미리 정해 둡니다.</em>"
            body = f'<div class="eyebrow mono">Scripts · 바로 복사해 쓰는 메시지{f" ({ci + 1}/{len(chunks)})" if len(chunks) > 1 else ""}</div><h2 class="h2" style="margin-top:18px">{title}</h2><div class="scripts{" roomy" if len(ch) == 2 and longest <= 300 else ""}" style="--n:{len(ch)}">{cards}</div>'
            extra = " 열람 여부를 감시처럼 전달하지 않습니다." if self.slug in REPLAY_DECKS else ""
            self.add("s-scripts", body, sect="메시지 스크립트", foot=f'<span class="src">[대괄호]는 우리 학원 정보로 바꿔 쓰세요.{extra}</span><span class="tag">Scripts</span>')

    def plan(self):
        ap = self.m["actionPlan"]
        n = len(ap)
        days = ap[-1]["day"]
        span = re.findall(r"\d+", days)
        span_txt = f"{span[-1]}일" if span else ""
        many = n > 4
        longest = max(len(a["title"]) + sum(len(t) for t in a["tasks"][:3]) for a in ap)
        steps = "".join(
            f'<div class="step"><div class="day">{e(a["day"])}</div><div class="tt">{e(a["title"])}</div><ul>{"".join(f"<li>{e(t)}</li>" for t in a["tasks"][:(2 if many else 3)])}</ul></div>'
            for a in ap)
        cols = n if n <= 5 else 3
        cls = "plan" + (" dense" if longest > 140 or many else "") + (" many" if many else "")
        body = f'''<div class="eyebrow mono">Action plan · 실행 플랜</div><h2 class="h2" style="margin-top:18px">읽고 끝내지 않도록,<br><em>{e(span_txt)} 안에</em> 할 일만 남겼습니다.</h2>
          <div class="{cls}" style="--n:{cols}">{steps}</div>'''
        self.add("s-plan", body, sect="실행 플랜", foot='<span class="src">일정은 예시입니다. 우리 학원 달력에 맞춰 당기거나 늘려도 됩니다.</span><span class="tag">Action plan</span>')

    def cta(self):
        m, ov = self.m, self.ov
        c = ov["cta"]
        pg = m.get("pdfGuide") or {}
        nxt = next_magnet(self.slug, self.all)
        rel = [nxt] if nxt else []
        so = DECK_OPTS.get(self.slug, {}).get("showroom", ("우리 수업으로 시연 예약하기", "대표 수업 자료를 가져오시면 판서·녹화·다시보기를 그대로 확인합니다."))
        acts = [f'''<a class="act primary" href="{e(utm("/showroom", self.slug, "cta_showroom"))}" target="_blank" rel="noopener"><div><div class="k">목동 쇼룸 · 30분</div><div class="t">{e(so[0])}</div><div class="d">{e(so[1])}</div></div><span class="go">→</span></a>''',
                f'''<a class="act" href="{e(utm("/contact#contact-form", self.slug, "cta_contact"))}" target="_blank" rel="noopener"><div><div class="k">도입 상담</div><div class="t">결과 해석·견적 상담 받기</div><div class="d">체크 결과로 쇼룸·데모·견적 범위를 함께 정리합니다.</div></div><span class="go">→</span></a>''']
        if rel:
            r = self.all[rel[0]]
            rov = OV.get(rel[0], {})
            acts.append(f'''<a class="act" href="{e(utm("/resources/" + rel[0], self.slug, "cta_next"))}" target="_blank" rel="noopener"><div><div class="k">다음 자료 · No.{rov.get("no", 0):02d}</div><div class="t">{e(r["title"])}</div><div class="d">{e(r["formatLabel"])}</div></div><span class="go">→</span></a>''')
        body = f'''<div style="display:flex;flex-direction:column"><div class="eyebrow mono">Next step · 다음 한 걸음</div>
            <h2 class="display" style="font-size:{min(104, cover_size(c["title"], 790))}px">{c["title"]}</h2><p class="lead">{e(c["sub"])}</p>
            <p class="honest">가격·견적은 교실 수와 장비, 요금제에 따라 상담에서 확정합니다. 결제·정산, 오프라인 출입·출석 관리는 지금 쓰는 시스템과 역할을 나눕니다. ClassIn은 수업 전·중·후 흐름을 맡습니다.</p></div>
          <div class="acts">{"".join(acts)}</div>'''
        self.add("s-cta", body, sect="다음 단계", foot='<span class="src">ClassIn Korea · 서울 목동 쇼룸</span><span class="tag">classin.co.kr</span>', ink=True)

    def extras(self, where: str):
        for x in EXTRAS.get(self.slug, {}).get(where, []):
            k = x["kind"]
            eyebrow = f'<div class="eyebrow mono">{e(x["eyebrow"])}</div>'
            title = f'<h2 class="h2" style="margin-top:18px">{x["title"]}</h2>'
            foot = f'<span class="src">{e(x.get("note", ""))}</span>' if x.get("note") else ""
            if k == "beforeafter":
                rows = "".join(
                    f'<div class="ba-row"><div class="ba-k">{e(t)}</div><div class="ba-b">{e(b)}</div><div class="ba-ar">→</div><div class="ba-a">{e(a)}</div></div>'
                    for t, b, a in x["rows"])
                path = '<li class="sep" aria-hidden="true">→</li>'.join(f'<li class="pill"><span class="num">{i + 1:02d}</span>{e(p)}</li>' for i, p in enumerate(x["path"]))
                body = f'''<div style="grid-column:1/-1">{eyebrow}{title}
                    <div class="ba"><div class="ba-head"><span></span><span>Before</span><span></span><span>After</span></div>{rows}</div>
                    <div class="ba-path"><b>시작은</b><ol>{path}</ol></div></div>'''
                self.add("s-ba", body, sect="전환 전과 후", foot=foot)
            elif k == "tco":
                def col(c):
                    blocks = "".join(f'<div class="tb {st}" style="flex:{fl}">{e(t)}</div>' for t, fl, st in c[1])
                    return f'<div class="tcol"><div class="tl">{e(c[0])}</div><div class="tstack">{blocks}</div></div>'
                body = f'''<div>{eyebrow}{title}<p class="lead" style="margin-top:34px;font-size:30px">견적서에 찍히는 금액만 비교하면 칠판 단품이 싸 보입니다. 하지만 그 사이를 사람이 매주 손으로 잇는 시간도 운영비입니다. 다음 장의 계산표가 그 시간을 숫자로 만듭니다.</p></div>
                    <div class="tco">{col(x["left"])}{col(x["right"])}</div>'''
                self.add("s-tco", body, sect="비교 단위", foot=foot)
            elif k == "bound":
                y, n = x["yes"], x["no"]
                body = f'''<div style="grid-column:1/-1">{eyebrow}{title}
                  <div class="bound"><div class="col"><div class="k">{e(y[0])}</div><ul>{"".join(f"<li>{e(i)}</li>" for i in y[1])}</ul></div>
                  <div class="col no"><div class="k">{e(n[0])}</div><ul>{"".join(f"<li>{e(i)}</li>" for i in n[1])}</ul></div></div></div>'''
                self.add("s-bound", body, sect="정직한 범위", foot=foot)
            elif k == "timeline":
                steps = "".join(
                    f'<li><div class="tm">{e(t)}<small>분</small></div><div class="tt">{e(a)}</div><p>{e(b)}</p></li>' for t, a, b in x["steps"])
                body = f'''<div style="grid-column:1/-1">{eyebrow}{title}<ol class="tline">{steps}</ol></div>'''
                self.add("s-tline", body, sect="쇼룸 30분", foot=foot)

    def build(self):
        opts = DECK_OPTS.get(self.slug, {})
        self.cover()
        self.hook()
        self.extras("after_hook")
        self.inside()
        self.story()
        self.extras("pre_check")
        if opts.get("worksheet_first"):
            self.worksheet()
        if opts.get("scripts_first"):
            self.scripts()
        self.checklists()
        self.flags()
        self.score()
        self.consult()
        if not opts.get("worksheet_first"):
            self.worksheet()
        self.cases()
        if not opts.get("scripts_first"):
            self.scripts()
        self.plan()
        self.extras("before_cta")
        self.cta()
        return self


def logo_data_uri() -> str:
    try:
        from PIL import Image
        im = Image.open(LOGO)
        im.thumbnail((120, 60))
        buf = io.BytesIO()
        im.save(buf, "PNG", optimize=True)
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:  # noqa: BLE001
        return "data:image/png;base64," + base64.b64encode(LOGO.read_bytes()).decode()


_FONT_CACHE: dict[str, str] = {}
_HANGUL = re.compile(r"([\uac00-\ud7a3][\uac00-\ud7a3\s·,.()?!~]*[\uac00-\ud7a3)]|[\uac00-\ud7a3])")


LABEL_CLASSES = {"kicker", "tag", "m-head", "lb", "sc", "qh", "k", "rg", "day", "who", "avoid", "meta", "ex"}
VOID = {"img", "input", "br", "meta", "hr", "link", "source", "wbr"}


def wrap_kr(markup: str) -> str:
    """모노 라벨 안의 한글 덩어리만 <span class="kr"> 로 감싼다(라벨의 넓은 자간을 한글에서 풀기 위해).
    그리드·플렉스 컨테이너의 텍스트를 쪼개지 않도록 라벨 요소 하위의 텍스트에만 적용한다."""
    out, stack = [], []
    for part in re.split(r"(<[^>]+>)", markup):
        if part.startswith("</"):
            name = part[2:-1].strip().lower()
            while stack:
                if stack.pop()[0] == name:
                    break
            out.append(part)
        elif part.startswith("<"):
            mt = re.match(r"<([a-zA-Z0-9]+)", part)
            if mt and not part.endswith("/>") and mt.group(1).lower() not in VOID:
                mc = re.search(r'class="([^"]*)"', part)
                stack.append((mt.group(1).lower(), set(mc.group(1).split()) if mc else set()))
            out.append(part)
        else:
            part = re.sub(r"\bClassin\b", "ClassIn", part)
            lab = any((c & LABEL_CLASSES) or ("eyebrow" in c and "mono" in c) or t in ("th", "dt") for t, c in stack)
            out.append(_HANGUL.sub(r'<span class="kr">\1</span>', part) if lab and part.strip() else part)
    return "".join(out)


def subset_font(text: str) -> str:
    from fontTools import subset
    from fontTools.ttLib import TTFont
    chars = set(text) | set(chr(c) for c in range(0x20, 0x7F)) | set("…·“”‘’→←↑↓●◐○—–※①②③④⑤″′×")
    key = "".join(sorted(chars))
    if key in _FONT_CACHE:
        return _FONT_CACHE[key]
    font = TTFont(str(PRETENDARD))
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=[ord(c) for c in chars])
    sub.subset(font)
    buf = io.BytesIO()
    font.flavor = "woff2"
    font.save(buf)
    b64 = base64.b64encode(buf.getvalue()).decode()
    _FONT_CACHE[key] = b64
    return b64


def render(deck: Deck, theme: str, css: str, js: str, logo: str, embed_fonts: bool = True) -> str:
    m, ov = deck.m, deck.ov
    N = len(deck.slides)
    frames = []
    for i, s in enumerate(deck.slides):
        cls = s["cls"] + (" ink" if s["ink"] else "") + (" sunken" if s["sunken"] else "")
        mast = (f'<header class="mast"><span class="brand"><img src="{logo}" alt="">ClassIn<small>원장 노트 No.{ov["no"]:02d}</small></span>'
                f'<span class="sect">{e(s["sect"])}</span><span class="pg">{i + 1:02d}<i>/</i>{N:02d}</span></header>')
        foot = f'<footer class="foot">{s["foot"]}</footer>' if s["foot"] else ""
        frames.append(f'<div class="frame" id="s{i + 1}"><section class="slide {cls}" aria-label="{i + 1} / {N}">{mast}<div class="body">{s["body"]}</div>{foot}</section></div>')
    secs = {str(i): dict(title=s["title"], n=len(s["items"]), items=s["items"]) for i, s in enumerate(m["sections"])}
    bands = []
    for b in m["scoreBands"]:
        lo, hi = parse_band(b["range"])
        bands.append(dict(min=lo, max=hi, label=b["label"], desc=b["description"]))
    data = dict(title=m["title"], max=sum(len(s["items"]) for s in m["sections"]), sections=secs, bands=bands)
    body = wrap_kr("".join(frames))
    font_css = ""
    if embed_fonts:
        text = strip_tags(body) + json.dumps(data, ensure_ascii=False) + m["title"] + "체크와 입력을 모두 지웠습니다결과를 복사했습니다. 상담 메신저에 붙여 넣으세요문구를 복사했습니다복사하지 못했습니다. 길게 눌러 직접 복사해 주세요이 영역은 모두 체크했습니다. 다음 영역으로 넘어가세요.체크를 시작하면 가장 약한 영역이 여기에 나타납니다.아직 체크하지 않았습니다발표 모드스크롤 모드인쇄·PDF처음부터 다시이전다음상담 예약"
        pre = subset_font(text)
        mono = base64.b64encode(MONO.read_bytes()).decode()
        font_css = (f'@font-face{{font-family:"Pretendard";src:url(data:font/woff2;base64,{pre}) format("woff2");font-weight:100 900;font-display:block}}'
                    f'@font-face{{font-family:"Plex Mono";src:url(data:font/woff2;base64,{mono}) format("woff2");font-weight:500;font-display:block}}')
    title = f'{m["title"]} · ClassIn 원장 노트 No.{ov["no"]:02d}'
    desc = ov["cover"]["sub"]
    ui = (f'<div class="progress"></div><div class="toast" role="status" aria-live="polite"></div>'
          f'<nav class="ui" aria-label="덱 조작"><button type="button" data-act="prev" class="only-present" aria-label="이전">←</button><span class="count only-present">01 / {N:02d}</span>'
          f'<button type="button" data-act="next" class="only-present" aria-label="다음">→</button>'
          f'<button type="button" data-act="mode" class="hide-sm" title="발표 모드와 스크롤 모드 전환">⇅ 보기</button>'
          f'<button type="button" data-act="print" class="hide-sm" title="16:9 PDF로 저장">PDF</button>'
          f'<button type="button" data-act="reset" class="hide-sm" title="체크·입력 지우기">↺</button>'
          f'<a class="cta-mini" href="{e(utm("/showroom", deck.slug, "ui_bar"))}" target="_blank" rel="noopener">상담 예약</a></nav>')
    return f'''<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{e(title)}</title><meta name="description" content="{e(desc)}"><meta name="robots" content="noindex">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta name="theme-color" content="#1A1917">
<style>{font_css}{css}</style></head>
<body class="{theme} mode-present"><main class="deck" data-slug="{e(deck.slug)}">{body}</main>{ui}
<script type="application/json" id="lm-data">{json.dumps(data, ensure_ascii=False).replace("</", "<\\/")}</script>
<script>{js}</script></body></html>'''


EXTRA_CSS = """
.s-areas .body{display:grid;grid-template-columns:1fr 760px;gap:110px}
.subs{list-style:none;margin-top:48px;display:grid;gap:22px}
.subs .sb-h{display:flex;justify-content:space-between;gap:20px;font:600 24px/1.3 var(--sans);letter-spacing:-.02em}
.subs .sb-h .num{font-size:21px;color:var(--muted)}
.subs .sb{margin-top:12px;height:14px;border-radius:7px;background:var(--skeleton);overflow:hidden}
.subs .sb i{display:block;height:100%;width:0;background:var(--ink);border-radius:7px;transition:width .4s}
.fix{list-style:none;margin-top:30px;display:grid;gap:14px}
.fix li{display:grid;grid-template-columns:52px 1fr;gap:12px;padding:24px 26px;border-radius:18px;background:var(--sheet);border:1px solid var(--hair)}
.fix li .num{font-size:20px;color:var(--accent);padding-top:4px}
.fix b{display:block;font:700 25px/1.3 var(--sans);letter-spacing:-.02em}
.fix p{margin-top:8px;font:450 21px/1.5 var(--sans);color:var(--body);letter-spacing:-.012em}
.fix.is-empty li{border-style:dashed;background:transparent}
.s-sheet-text .body{display:block}
.t-bento .subs .sb i{background:var(--accent)}
.t-bento .fix li{border:0}
.t-ink .subs .sb i{background:var(--accent)}
.display,.h1,.h2,.statement{text-wrap:balance}
.txt,.lead,.chk .t{text-wrap:pretty}
"""


INDEX_CSS = """
/* 시리즈 서가: 퍼널 3단(진단·설계·검증) 선반 위에 16:9 표지를 진열한다. 종이·먹·초록 하나. */
:root{--bg:#F9F8F5;--sheet:#FFFFFF;--ink:#111110;--body:#31302E;--muted:#615D59;--line:rgba(17,17,16,.12);--accent:#0B7A52;--accent-ink:#FAFAF8;--chip:#F0EEE8;
  --sans:"Pretendard",-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;--mono:"Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#1A1917;--sheet:#23221F;--ink:#FAFAF8;--body:rgba(250,250,248,.78);--muted:rgba(250,250,248,.6);--line:rgba(250,250,248,.14);--accent:#8FC4AC;--accent-ink:#1A1917;--chip:#2C2B27;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#1A1917;--sheet:#23221F;--ink:#FAFAF8;--body:rgba(250,250,248,.78);--muted:rgba(250,250,248,.6);--line:rgba(250,250,248,.14);--accent:#8FC4AC;--accent-ink:#1A1917;--chip:#2C2B27;color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased;word-break:keep-all}
.wrap{max-width:1240px;margin:0 auto;padding-block:40px 80px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.top{display:flex;align-items:center;gap:12px;font:600 15px/1 var(--sans);color:var(--muted)}
.top img{height:16px;width:auto}
.top b{color:var(--ink)}
h1{margin:28px 0 0;font:800 clamp(34px,6vw,64px)/1.12 var(--sans);letter-spacing:-.03em;text-wrap:balance}
h1 em{font-style:normal;color:var(--accent)}
.intro{margin:18px 0 0;max-width:66ch;font:450 17px/1.65 var(--sans);color:var(--body)}
.facts{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}
.facts span{display:inline-flex;align-items:center;height:32px;padding:0 12px;border-radius:999px;background:var(--chip);font:600 13.5px/1 var(--sans);color:var(--body)}
.picks{margin-top:44px;padding:22px;border-radius:20px;background:var(--sheet);border:1px solid var(--line)}
.picks h2,.stage h2{margin:0;font:750 22px/1.3 var(--sans);letter-spacing:-.02em}
.picks p.sub,.stage p.sub{margin:6px 0 0;font:450 15px/1.55 var(--sans);color:var(--muted)}
.pgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:18px}
.stages{display:grid;gap:44px;margin-top:52px}
.stage-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;padding-bottom:14px;border-bottom:1.5px solid var(--ink)}
.stage-head .k{font:500 13px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(var(--cols,4),minmax(0,1fr));gap:22px 18px;margin-top:18px}
.grid.lead-wide>.card:first-child{grid-column:span 2}
.grid.lead-wide>.card:first-child .meta .t{font-size:20px}
.card{display:flex;flex-direction:column;min-width:0;text-decoration:none;color:inherit;border-radius:14px}
.card:focus-visible{outline:3px solid var(--accent);outline-offset:4px}
.thumb{position:relative;aspect-ratio:16/9;max-width:100%;border-radius:12px;overflow:hidden;border:1px solid var(--line);background:var(--chip);transition:transform .2s}
.thumb img{display:block;width:100%;height:100%;object-fit:cover}
.card:hover .thumb{transform:translateY(-3px)}
.no{position:absolute;left:10px;top:10px;height:24px;padding:0 9px;border-radius:999px;background:#111110;color:#FAFAF8;font:500 12px/24px var(--mono)}
.meta{margin-top:12px;display:flex;flex-direction:column;gap:5px}
.meta .t{font:700 17px/1.35 var(--sans);letter-spacing:-.015em}
.meta .h{font:500 14.5px/1.5 var(--sans);color:var(--body)}
.meta .f{font:500 13px/1.5 var(--sans);color:var(--muted)}
.pick-why{margin-top:6px;font:500 13.5px/1.5 var(--sans);color:var(--accent)}
.how{margin-top:56px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.how div{padding:18px 20px;border-radius:16px;border:1px solid var(--line)}
.how b{display:block;font:700 16px/1.3 var(--sans)}
.how p{margin:8px 0 0;font:450 14.5px/1.6 var(--sans);color:var(--body)}
.note{margin-top:28px;font:450 13px/1.6 var(--sans);color:var(--muted);max-width:80ch}
@media (max-width:1000px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.grid.lead-wide>.card:first-child{grid-column:span 2}}
@media (max-width:760px){.pgrid,.how,.grid{grid-template-columns:1fr}.grid.lead-wide>.card:first-child{grid-column:auto}.picks{padding:16px}}
@media (prefers-reduced-motion:reduce){.thumb{transition:none}}
"""


def build_index(magnets: dict, out: Path, logo: str, artifact: bool = False) -> str:
    order = sorted(OV, key=lambda s: OV[s]["no"])
    stages = [("TOFU", "진단", "문제를 먼저 보게 하는 자료", "Awareness"), ("MOFU", "설계", "해법을 비교하고 숫자로 정리하는 자료", "Consideration"),
              ("BOFU", "검증", "결정 전 리스크를 지우는 자료", "Decision")]

    def card(slug, why=""):
        m, ov = magnets[slug], OV[slug]
        hook = strip_tags(ov["cover"]["title"].replace("<br>", " "))
        n_slides = len(Deck(m, ov, magnets).build().slides)
        return (f'<a class="card" href="{slug}.html"><div class="thumb"><img src="thumbs/{slug}.webp" alt="{e(hook)} 표지" loading="lazy" width="960" height="540"><span class="no">No.{ov["no"]:02d}</span></div>'
                f'<div class="meta"><span class="t">{e(m["title"])}</span><span class="h">{e(hook)}</span>'
                f'<span class="f">{e(m["formatLabel"])} · {m["estimatedMinutes"]}분 · {n_slides}장</span>'
                f'{f"<span class=pick-why>{e(why)}</span>" if why else ""}</div></a>')

    picks = "".join(card(s, why) for s, why in PICKS)
    sec = ""
    for key, ko, sub, en in stages:
        cards = "".join(card(s) for s in order if OV[s]["stage"] == key)
        cnt = sum(1 for s in order if OV[s]["stage"] == key)
        sec += (f'<section class="stage"><div class="stage-head"><div><h2>{ko} · {cnt}종</h2><p class="sub">{sub}</p></div><span class="k">{en}</span></div>'
                f'<div class="grid{" lead-wide" if cnt == 7 else ""}" style="--cols:{5 if cnt == 5 else 4}">{cards}</div></section>')
    body = f'''<div class="wrap">
<div class="top"><img src="{logo}" alt=""><b>ClassIn Korea</b><span>원장 노트 시리즈</span></div>
<h1>원장님이 직접 체크하고,<br><em>우리 수업으로</em> 확인하는 16권</h1>
<p class="intro">ClassIn 리드마그넷을 16:9 인터랙티브 덱으로 다시 만들었습니다. 칸을 누르면 점수와 약한 영역이 바로 계산되고, 계산표는 우리 학원 숫자로 채워집니다. 폰에서는 세로 카드로 다시 흘러가고, 데스크톱에서는 발표 화면과 16:9 PDF로 씁니다.</p>
<div class="facts"><span>16권 · {sum(len(Deck(magnets[s], OV[s], magnets).build().slides) for s in order)}장</span><span>자가진단 점수 자동 계산</span><span>모바일 세로 보기</span><span>16:9 PDF 저장</span><span>상담 링크 UTM 포함</span></div>
<section class="picks"><h2>캠페인 대표 3권</h2><p class="sub">블라인드 심사에서 ‘스크롤을 멈추고 폼까지 채울 자료’로 고른 단계별 1권씩입니다.</p><div class="pgrid">{picks}</div></section>
<div class="stages">{sec}</div>
<div class="how"><div><b>발표 모드</b><p>←·→ 키나 화면 아래 단추로 넘깁니다. 상담 화면 공유와 설명회에 그대로 씁니다.</p></div>
<div><b>스크롤·모바일</b><p>폭이 좁으면 자동으로 세로 카드가 됩니다. 메타·인스타 광고에서 들어온 원장님이 폰에서 바로 체크합니다.</p></div>
<div><b>PDF</b><p>조작 막대의 PDF 단추로 16:9 PDF를 저장합니다. 체크 칸은 빈 칸으로 나와 손으로도 씁니다.</p></div></div>
<p class="note">사례 학원명은 일부를 가렸고, 가격·국내 도입 수·성과 수치는 싣지 않았습니다. 장면은 이해를 돕기 위한 예시입니다. 체크와 입력은 보는 사람의 브라우저에만 저장됩니다.</p>
</div>'''
    pre = subset_font(strip_tags(body) + "원장 노트 시리즈")
    mono = base64.b64encode(MONO.read_bytes()).decode()
    fonts = (f'@font-face{{font-family:"Pretendard";src:url(data:font/woff2;base64,{pre}) format("woff2");font-weight:100 900;font-display:swap}}'
             f'@font-face{{font-family:"Plex Mono";src:url(data:font/woff2;base64,{mono}) format("woff2");font-weight:500;font-display:swap}}')
    head = ('<title>ClassIn 원장 노트</title><meta name="claude:viewport-fit-sides" content="cover">'
            f'<style>{fonts}{INDEX_CSS}</style>')
    if artifact:
        return head + body
    return (f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
            f'<meta name="robots" content="noindex">{head}</head><body>{body}</body></html>')


def make_thumbs(src_dir: Path, out: Path):
    from PIL import Image
    (out / "thumbs").mkdir(parents=True, exist_ok=True)
    for slug in OV:
        src = src_dir / f"{slug}-01.png"
        if src.exists():
            im = Image.open(src).convert("RGB").resize((960, 540), Image.LANCZOS)
            im.save(out / "thumbs" / f"{slug}.webp", "WEBP", quality=80, method=6)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--theme", default="t-paper")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--suffix", default="")
    ap.add_argument("--no-fonts", action="store_true")
    ap.add_argument("--thumbs-from", help="qa.mjs 스크린샷 폴더(<slug>-01.png)에서 표지 썸네일을 만든다")
    ap.add_argument("--index", action="store_true", help="index.html(시리즈 서가)도 만든다")
    ap.add_argument("--artifact-index", help="아티팩트용 index 조각을 이 경로에 쓴다")
    a = ap.parse_args()
    magnets = load_magnets()
    css = (HERE / "assets" / "deck.css").read_text() + EXTRA_CSS
    js = (HERE / "assets" / "deck.js").read_text()
    logo = logo_data_uri()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    slugs = a.only or sorted(OV, key=lambda s: OV[s]["no"])
    for slug in slugs:
        d = Deck(magnets[slug], OV[slug], magnets).build()
        html_text = render(d, a.theme, css, js, logo, embed_fonts=not a.no_fonts)
        p = out / f"{slug}{a.suffix}.html"
        p.write_text(html_text)
        print(f"{p.relative_to(ROOT) if p.is_relative_to(ROOT) else p}  {len(d.slides)} slides  {len(html_text) // 1024} KB")
    if a.thumbs_from:
        make_thumbs(Path(a.thumbs_from), out)
    if a.index:
        (out / "index.html").write_text(build_index(magnets, out, logo))
        print(out / "index.html")
    if a.artifact_index:
        Path(a.artifact_index).write_text(build_index(magnets, out, logo, artifact=True))


if __name__ == "__main__":
    main()
