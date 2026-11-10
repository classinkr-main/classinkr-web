#!/usr/bin/env python3
"""ClassIn Insight 시리즈 — 체크리스트가 아닌 형식(리포트·요약집·가이드·테스트·템플릿·브리핑)의 16:9 HTML 덱 생성기.

    python3 scripts/lead-magnet-decks/insight/engine.py            # decks/*.py 전부
    python3 scripts/lead-magnet-decks/insight/engine.py --only consult-closing-guide --out /tmp/x

덱 내용은 insight/decks/<slug>.py 의 DECK(dict). 레이아웃 이름은 아래 R(렌더러 표)의 키.
결과: public/materials/lead-magnets/insight/<slug>.html (글꼴·이미지까지 넣은 단일 파일)
"""
from __future__ import annotations

import argparse
import base64
import importlib.util
import io
import json
import re
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from build import ROOT, e, image_data_uri, logo_data_uri, strip_tags, subset_font, utm  # noqa: E402

OUT = ROOT / "public" / "materials" / "lead-magnets" / "insight"
FONTS = HERE / "fonts"
GF = "https://raw.githubusercontent.com/google/fonts/main/ofl/"
FONT_SRC = {
    "Black Han Sans": ("BlackHanSans-Regular.ttf", "blackhansans/BlackHanSans-Regular.ttf", "400"),
    "Anton": ("Anton-Regular.ttf", "anton/Anton-Regular.ttf", "400"),
    "Hahmlet": ("Hahmlet[wght].ttf", "hahmlet/Hahmlet%5Bwght%5D.ttf", "100 900"),
    "Archivo": ("Archivo[wdth,wght].ttf", "archivo/Archivo%5Bwdth,wght%5D.ttf", "100 900"),
}
THEME_FONTS = {
    "report": ["Anton", "Black Han Sans", "Archivo"], "summit": ["Archivo"], "guide": ["Hahmlet"],
    "play": ["Black Han Sans", "Anton"], "planner": ["Archivo"], "brief": ["Archivo"],
}


def font_face(name: str, text: str) -> str:
    """구글 폰트 원본(OFL)을 내려받아 이 덱에 쓰인 글자만 남겨 woff2 data URI 로 넣는다."""
    from fontTools import subset
    from fontTools.ttLib import TTFont
    fn, path, weight = FONT_SRC[name]
    src = FONTS / fn
    if not src.exists():
        FONTS.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(GF + path, src)
    chars = set(text) | set(chr(c) for c in range(0x20, 0x7F)) | set("·…“”‘’→←%")
    font = TTFont(str(src))
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=[ord(c) for c in chars])
    sub.subset(font)
    buf = io.BytesIO()
    font.flavor = "woff2"
    font.save(buf)
    stretch = "font-stretch:62.5% 125%;" if name == "Archivo" else ""
    return (f'@font-face{{font-family:"{name}";src:url(data:font/woff2;base64,{base64.b64encode(buf.getvalue()).decode()}) format("woff2");'
            f'font-weight:{weight};{stretch}font-display:block}}')


def H(s: str) -> str:
    """덱 원고의 HTML 조각(이미 이스케이프된 <em>, <br>, <b>)을 그대로 쓴다."""
    return s


# ───────────────────────── 레이아웃 렌더러 ─────────────────────────
# 각 함수는 (body_html, opts) 를 돌려준다. opts: cls(추가 클래스), dark(bool), deco(슬라이드 장식 html), foot(각주)

def cover(s, d):
    meta = "".join(f"<div><b>{e(k)}</b>{e(v)}</div>" for k, v in s.get("meta", []))
    body = (f'<div class="series-tag">{H(s.get("tag", ""))}</div>'
            f'<h1 class="disp title" style="--cover-size:{s.get("size", 150)}px">{H(s["title"])}</h1>'
            f'<p class="lead sub">{H(s.get("sub", ""))}</p><div class="meta">{meta}</div>')
    return body, dict(cls="cover", deco=s.get("deco", ""), dark=s.get("dark", False))


def toc(s, d):
    items = "".join(f'<div class="it"><span class="n">{e(n)}</span><div><b>{e(k)}</b><span>{e(t)}</span></div></div>' for n, k, t in s["items"])
    return f'<h2 class="disp h1" style="font-size:{s.get("size", 150)}px">{H(s.get("title", "목차"))}</h2><div class="list">{items}</div>', dict(cls="toc", deco=s.get("deco", ""), dark=s.get("dark", False))


def opener(s, d):
    tags = "".join(f"<span>{e(t)}</span>" for t in s.get("tags", []))
    body = (f'<h2 class="disp on">{H(s["title"])}</h2>'
            + (f'<p class="subcap">{H(s["sub"])}</p>' if s.get("sub") else "")
            + (f'<div class="tags">{tags}</div>' if tags else ""))
    deco = f'<div class="slabbox"></div><div class="bign">{e(s.get("no", ""))}</div>' + s.get("deco", "")
    if s.get("stat"):
        deco += f'<div class="ostat"><b>{H(s["stat"][0])}</b><span>{H(s["stat"][1])}</span></div>'
    return body, dict(cls="opener", deco=deco)


def editorial(s, d):
    paras = "".join(f'<p class="txt">{H(p)}</p>' for p in s["paras"])
    sign = ""
    if s.get("sign"):
        n, r = s["sign"]
        sign = f'<div class="sign"><i>C</i><div>{e(n)}<small>{e(r)}</small></div></div>'
    ilist = ""
    if s.get("items"):
        ilist = '<ol class="ilist">' + "".join(f'<li><span>{i + 1:02d}</span>{H(x)}</li>' for i, x in enumerate(s["items"])) + "</ol>"
    body = (f'<div class="lcol"><span class="label">{e(s.get("label", "FOREWORD"))}</span><h2 class="disp big" style="margin-top:40px">{H(s["big"])}</h2>{ilist}</div>'
            f'<div class="copy">{paras}{sign}</div>')
    return body, dict(cls="edit", deco='<div class="lefts"></div>')


def findings(s, d):
    rows = "".join(f'<div class="r"><span class="n">{i + 1}</span><span class="t">{e(t)}</span><span class="d">{H(x)}</span></div>' for i, (t, x) in enumerate(s["rows"]))
    return f'<h2 class="disp h1">{H(s["title"])}</h2><div class="ftable">{rows}</div>', dict(cls="findings", dark=s.get("dark", True), deco=s.get("deco", ""), foot=s.get("source", ""))


def stats(s, d):
    items = "".join(f'<div class="stat{" hl" if hl else ""}"><div class="v">{H(v)}</div><div class="l">{H(l)}</div><div class="s">{H(sr)}</div></div>' for v, l, sr, hl in s["items"])
    body = ((f'<span class="label">{e(s["label"])}</span>' if s.get("label") else "")
            + f'<h2 class="h2" style="margin-top:24px;max-width:1500px">{H(s["title"])}</h2>'
            + (f'<p class="lead" style="margin-top:20px;max-width:1500px">{H(s["lead"])}</p>' if s.get("lead") else "")
            + f'<div class="row" style="--n:{len(s["items"])}">{items}</div>')
    return body, dict(cls="stats", foot=s.get("source", ""), deco=s.get("deco", ""))


def _bars(items, maxv=None, unit="%"):
    maxv = maxv or max(v for _, v, *_ in items) * 1.12
    out = ""
    for it in items:
        lab, v = it[0], it[1]
        hl = len(it) > 2 and it[2]
        disp = it[3] if len(it) > 3 else f"{v:g}{unit}"
        w = v / maxv * 100
        out += f'<div class="bar{" hl" if hl else ""}"><div class="bl"><span>{e(lab)}</span></div><div class="bt"><i style="width:{w:.1f}%"></i><b style="left:calc({w:.1f}% + 14px)">{e(disp)}</b></div></div>'
    return out


def _cols(items, maxv=None, unit="%"):
    maxv = maxv or max(v for _, v, *_ in items) * 1.08
    out = ""
    for it in items:
        lab, v = it[0], it[1]
        hl = len(it) > 2 and it[2]
        disp = it[3] if len(it) > 3 else f"{v:g}{unit}"
        out += f'<div class="col{" hl" if hl else ""}"><b>{e(disp)}</b><i style="height:{v / maxv * 100:.1f}%"></i><span>{e(lab)}</span></div>'
    return out


def chart(s, d):
    kind = s.get("kind", "bars")
    inner = _bars(s["items"], s.get("max"), s.get("unit", "%")) if kind == "bars" else _cols(s["items"], s.get("max"), s.get("unit", "%"))
    n_it = len(s["items"])
    wrap = "bars" if kind == "bars" else ("cols dense dense2" if n_it > 9 else "cols dense" if n_it > 6 else "cols")
    co = f'<div class="callout">{H(s["callout"])}</div>' if s.get("callout") else ""
    card = f'<div class="chartcard"><div class="ct">{H(s["chart_title"])}</div>{co}<div class="{wrap}">{inner}</div></div>'
    left = ((f'<span class="label" style="align-self:flex-start">{e(s["label"])}</span>' if s.get("label") else "")
            + f'<h2 class="disp h1" style="font-size:{s.get("size", 84)}px">{H(s["title"])}</h2>'
            + "".join(f'<p class="txt">{H(p)}</p>' for p in s.get("paras", [])))
    body = f'<div class="split"><div class="l">{left}</div><div>{card}</div></div>'
    return body, dict(cls="chart", foot=s.get("source", ""), dark=s.get("dark", False), deco=s.get("deco", ""))


def spotlight(s, d):
    q = s["quote"]
    right = (f'<div style="display:flex;flex-direction:column;justify-content:center;gap:24px"><h2 class="disp h1" style="color:var(--on-slab)">{H(s["title"])}</h2>'
             + "".join(f'<p class="txt">{H(p)}</p>' for p in s.get("paras", [])) + "</div>")
    left = (f'<div class="qbox"><div class="k">{e(q["k"])}</div><p>“{H(q["text"])}”</p>'
            f'<div class="who">{e(q["who"])}<small>{e(q["role"])}</small></div></div>')
    return f'<div class="g2" style="height:100%;align-items:center">{left}{right}</div>', dict(cls="spot", dark=True, deco=s.get("deco", ""), foot=s.get("source", ""))


def takeaways(s, d):
    cards = "".join(f'<div class="tkc"><span class="no">{i + 1}</span><div class="tt">{e(t)}</div><div class="dd">{H(x)}</div></div>' for i, (t, x) in enumerate(s["items"]))
    return (f'<h2 class="disp h1">{H(s["title"])}</h2><div class="tkgrid" style="--n:{len(s["items"])}">{cards}</div>',
            dict(cls="tk", deco='<div class="band"></div>' + s.get("deco", "")))


def pse(s, d):
    blocks = ""
    for t, a, b, c in s["blocks"]:
        blocks += (f'<div class="rw"><b>과제</b><span><strong>{e(t)}</strong>{H(a)}</span></div>'
                   f'<div class="rw"><b>해결</b><span>{H(b)}</span></div>'
                   f'<div class="rw"><b>{e(s.get("third", "효과"))}</b><span>{H(c)}</span></div>')
    shot = ""
    if s.get("shot"):
        src, cap = s["shot"][0], s["shot"][1]
        crop = s["shot"][2] if len(s["shot"]) > 2 else None
        uri, w, h = image_data_uri(src, crop=crop, max_w=1200)
        shot = f'<figure class="shot"><img src="{uri}" width="{w}" height="{h}" alt="{e(cap)}"><figcaption>{e(cap)}</figcaption></figure>'
    btn = f'<a class="pill-btn" href="{e(utm(s["btn"][1], d["slug"], s["btn"][2]))}" target="_blank" rel="noopener">{e(s["btn"][0])} →</a>' if s.get("btn") else ""
    left = (f'<div style="display:flex;flex-direction:column"><span class="ey">{e(s["eyebrow"])}</span><h2 class="h2">{H(s["title"])}</h2>'
            f'<div class="sumk"><i></i>{e(s.get("sumk", "핵심 요약"))}</div><div class="rows">{blocks}</div>'
            + (f'<div class="ask"><b>우리 학원은?</b><span>{H(s["ask"])}</span></div>' if s.get("ask") else "") + f'{btn}</div>')
    return left + shot, dict(cls="pse", foot=s.get("source", ""))


def dialogue(s, d):
    ls = "".join(f'<div class="ln{" b" if w2 == "b" else ""}"><div class="who">{e(who)}</div><div class="say">{H(t)}{f"<small>{H(nt)}</small>" if nt else ""}</div></div>'
                 for who, w2, t, nt in s["lines"])
    a = s["aside"]
    aside = f'<div class="aside"><div class="k">{e(a["k"])}</div>' + (f'<p>{H(a["p"])}</p>' if a.get("p") else "") + ("<ul>" + "".join(f"<li>{H(x)}</li>" for x in a.get("li", [])) + "</ul>" if a.get("li") else "") + "</div>"
    left = f'<div><span class="kicker">{e(s["kicker"])}</span><h2 class="h2" style="margin-top:14px">{H(s["title"])}</h2><div class="lines">{ls}</div></div>'
    close = f'<div class="closecard"><div class="k">이 대화의 클로징 한 문장</div><p>{H(s["close"])}</p></div>' if s.get("close") else ""
    return left + f'<div class="asides">{aside}{close}</div>', dict(cls="dlg", foot=s.get("source", ""), deco=s.get("deco", ""))


def matrix(s, d):
    n = len(s["stages"])
    hd = '<div class="hd c0"></div>' + "".join(f'<div class="hd">{e(x)}</div>' for x in s["stages"])
    rows = "".join(f'<div class="rl">{e(lab)}</div>' + "".join(f'<div class="cl">{H(c)}</div>' for c in cells) for lab, cells in s["rows"])
    body = (f'<span class="kicker">{e(s.get("kicker", ""))}</span><h2 class="h2" style="margin-top:14px;max-width:1500px">{H(s["title"])}</h2>'
            f'<div class="mtx" style="--n:{n}">{hd}{rows}</div>')
    return body, dict(cls="matrix", foot=s.get("source", ""))


def dodont(s, d):
    do = "".join(f"<li>{H(x)}</li>" for x in s["do"])
    no = "".join(f"<li>{H(x)}</li>" for x in s["dont"])
    body = (f'<span class="kicker">{e(s.get("kicker", ""))}</span><h2 class="h2" style="margin-top:14px">{H(s["title"])}</h2>'
            f'<div class="dd2"><div class="c"><div class="k">{e(s.get("dok", "이렇게 말합니다"))}</div><ul>{do}</ul></div>'
            f'<div class="c no"><div class="k">{e(s.get("nok", "이 말은 피합니다"))}</div><ul>{no}</ul></div></div>')
    return body, dict(cls="dodont", foot=s.get("source", ""))


def questions(s, d):
    qs = "".join(f'<div class="qc"><span class="n">{i + 1:02d}</span><div class="q">{H(q)}</div><div class="w">{H(w)}</div></div>' for i, (q, w) in enumerate(s["items"]))
    body = (f'<span class="kicker">{e(s.get("kicker", ""))}</span><h2 class="h2" style="margin-top:14px">{H(s["title"])}</h2>'
            f'<div class="qs" style="--n:{s.get("cols", 3)}">{qs}</div>')
    return body, dict(cls="questions", foot=s.get("source", ""))


def beforeafter(s, d):
    rows = "".join(f'<div class="r"><span class="k">{e(k)}</span><span class="b">{H(b)}</span><span class="ar">→</span><span class="a">{H(a)}</span></div>' for k, b, a in s["rows"])
    body = (f'<span class="kicker">{e(s.get("kicker", ""))}</span><h2 class="h2" style="margin-top:14px">{H(s["title"])}</h2>'
            f'<div class="ba">{rows}</div>')
    return body, dict(cls="beforeafter", foot=s.get("source", ""))


def steps(s, d):
    it = s["items"]
    st = "".join(f'<div class="st{" last" if i == len(it) - 1 and s.get("last_hl", True) else ""}"><b>{e(t)}</b><p>{H(x)}</p></div>' for i, (t, x) in enumerate(it))
    body = (f'<span class="kicker">{e(s.get("kicker", ""))}</span><h2 class="disp h1" style="margin-top:14px;font-size:{s.get("size", 84)}px">{H(s["title"])}</h2>'
            + (f'<p class="lead" style="margin-top:18px">{H(s["lead"])}</p>' if s.get("lead") else "")
            + f'<div class="steps" style="--n:{len(it)}">{st}</div>')
    return body, dict(cls="stepsl", foot=s.get("source", ""), dark=s.get("dark", False))


def screen(s, d):
    uri, w, h = image_data_uri(s["img"], crop=s.get("crop"), max_w=1300)
    pins = "".join(f'<span class="pin" style="left:{x}%;top:{y}%">{i + 1}</span>' for i, (x, y, _) in enumerate(s["pins"]))
    leg = "".join(f'<li><span class="pin">{i + 1}</span><span>{H(t)}</span></li>' for i, (_, _, t) in enumerate(s["pins"]))
    body = (f'<div><span class="kicker">{e(s.get("kicker", "실제 화면"))}</span><h2 class="h2" style="margin-top:14px">{H(s["title"])}</h2><ol class="legend">{leg}</ol></div>'
            f'<div><div class="shotw"><img src="{uri}" width="{w}" height="{h}" alt="{e(s["cap"])}">{pins}</div><p class="small" style="margin-top:12px">{e(s["cap"])}</p></div>')
    return body, dict(cls="scr", foot=s.get("source", "사이트에 공개된 실제 화면입니다. 이름·카메라 화면은 원본에서 흐림 처리되어 있습니다."))


def quiz_q(s, d):
    opts = "".join(f'<button type="button" class="opt" data-q="{s["id"]}" data-t="{t}" aria-pressed="false"><span class="k">{"ABCD"[i]}</span><span>{H(x)}</span></button>'
                   for i, (x, t) in enumerate(s["options"]))
    dots = '<div class="qdots" aria-hidden="true">' + "".join(f'<i data-qdot="q{i + 1}"{" class=cur" if i + 1 == s["n"] else ""}></i>' for i in range(d["quiz"]["n"])) + "</div>"
    body = (f'<div class="qhead"><div class="qn">Q{s["n"]:02d}<small> / {d["quiz"]["n"]:02d}</small></div>{dots}</div><h2 class="h2 qt">{H(s["q"])}</h2>'
            f'<div class="opts">{opts}</div><p class="qhint">가장 가까운 하나를 고르세요. 고르면 다음 장으로 넘어갑니다. 진행 <span class="num" data-qprog>0 / {d["quiz"]["n"]}</span></p>')
    return body, dict(cls="quiz", deco=s.get("deco", ""))


def quiz_result(s, d):
    types = d["quiz"]["types"]
    bars = "".join(f'<div class="rb"><span>{e(t["plain"])}</span><span class="t"><i data-rbar="{t["key"]}" style="background:{t["color"]}"></i></span><span class="v" data-rval="{t["key"]}">-</span></div>' for t in types)
    left = (f'<div><span class="kicker">RESULT · 우리 학원 운영 유형</span><h2 class="disp rtype" data-r="name" data-empty="아직 고르지 않았습니다">아직 고르지 않았습니다</h2>'
            f'<p class="lead" style="margin-top:20px" data-r="desc" data-empty="앞 장의 10문항에서 하나씩 고르면 유형이 바로 나옵니다."></p>'
            f'<div class="rbars">{bars}</div><div class="btnrow"><a class="btn acc" data-consult href="{e(utm("/contact#contact-form", d["slug"], "quiz_result"))}" target="_blank" rel="noopener">이 결과로 상담 받기 →</a>'
            f'<button class="btn line" type="button" data-copy-quiz>결과 복사하기</button></div></div>')
    right = (f'<div class="rcard" data-result><div class="k">강점</div><p data-r="strength" data-empty="-">-</p><div class="k">놓치기 쉬운 것</div><p data-r="risk" data-empty="-">-</p>'
             f'<div class="k">이번 달 할 일 세 가지</div><div class="todo" data-r="todo" data-empty="<p>결과가 나오면 유형별 할 일이 여기에 나옵니다.</p>"><p>결과가 나오면 유형별 할 일이 여기에 나옵니다.</p></div>'
             f'<div class="nx"><div class="k">함께 보면 좋은 자료</div><p data-r="next" data-empty="-">-</p></div></div>')
    return left + right, dict(cls="result")


def quiz_types(s, d):
    cards = "".join(f'<div class="tyc" style="background:{t["color"]}"><span class="tl">TYPE {"ABCD"[i]}</span><div class="tn">{H(t["name"])}</div><p>{H(t["desc"])}</p><div class="em">{H(t["one"])}</div>'
                    + (f'<div class="lk">{H(t["link"])}</div>' if t.get("link") else "") + "</div>"
                    for i, t in enumerate(d["quiz"]["types"]))
    return f'<span class="kicker">{e(s.get("kicker", "4가지 유형"))}</span><h2 class="h2" style="margin-top:14px">{H(s["title"])}</h2><div class="types">{cards}</div>', dict(cls="qtypes")


def _tabs(s):
    if not s.get("tabs"):
        return ""
    return '<div class="tab">' + "".join(f'<span class="{"on" if i == s.get("tab", 0) else ""}">{i + 1:02d}</span>' for i in range(s["tabs"])) + "</div>"


def form(s, d):
    out = ""
    for f in s["fields"]:
        kind = f.get("type", "text")
        wide = " wide" if f.get("wide") else ""
        hint = f'<span class="h">{H(f["hint"])}</span>' if f.get("hint") else ""
        if kind == "area":
            ctl = f'<textarea data-f="{f["id"]}" id="f-{f["id"]}" placeholder="{e(f.get("ph", ""))}"></textarea>'
        elif kind == "chips":
            ctl = '<div class="chips2">' + "".join(f'<button type="button" class="chip2" data-c="{f["id"]}:{e(o)}" aria-pressed="false">{e(o)}</button>' for o in f["options"]) + "</div>"
        else:
            ctl = f'<input data-f="{f["id"]}" id="f-{f["id"]}" placeholder="{e(f.get("ph", ""))}">'
        out += f'<div class="fld{wide}"><label for="f-{f["id"]}">{e(f["label"])}</label>{hint}{ctl}</div>'
    ncol = s.get("cols", 2)
    rows_t, cur = [], []
    for f in s["fields"]:
        if f.get("wide") or ncol == 1:
            if cur:
                rows_t.append(cur)
                cur = []
            rows_t.append([f])
            continue
        cur.append(f)
        if len(cur) == ncol:
            rows_t.append(cur)
            cur = []
    if cur:
        rows_t.append(cur)
    tpl = " ".join("minmax(0,1fr)" if any(x.get("type") == "area" for x in r) else "auto" for r in rows_t)
    body = (f'<div style="display:flex;align-items:center;gap:28px"><span class="num" style="font-size:112px;line-height:.9;color:var(--acc-text)">{e(s["no"])}</span>'
            f'<div><span class="kicker">{e(s.get("kicker", ""))}</span><h2 class="h2" style="margin-top:8px">{H(s["title"])}</h2></div></div>'
            + (f'<p class="txt" style="margin-top:14px;max-width:1500px">{H(s["lead"])}</p>' if s.get("lead") else "")
            + f'<div class="fgrid" style="--n:{ncol};grid-template-rows:{tpl}">{out}</div>')
    return body, dict(cls="form", deco=_tabs(s))


def table_form(s, d):
    cols = s["cols"]
    th = "".join(f"<th>{e(c)}</th>" for c in cols)
    trs = ""
    for ri in range(s["rows"]):
        trs += "<tr>" + "".join(f'<td><input data-f="{s["id"]}r{ri}c{ci}" aria-label="{e(c)} {ri + 1}" placeholder="{e(s.get("ph", [""] * len(cols))[ci] if ri == 0 else "")}"></td>' for ci, c in enumerate(cols)) + "</tr>"
    body = (f'<div style="display:flex;align-items:center;gap:28px"><span class="num" style="font-size:112px;line-height:.9;color:var(--acc-text)">{e(s["no"])}</span>'
            f'<div><span class="kicker">{e(s.get("kicker", ""))}</span><h2 class="h2" style="margin-top:8px">{H(s["title"])}</h2></div></div>'
            + (f'<p class="txt" style="margin-top:14px;max-width:1500px">{H(s["lead"])}</p>' if s.get("lead") else "")
            + f'<table class="ttbl"><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table>')
    return body, dict(cls="form", deco=_tabs(s))


def months(s, d):
    ms = "".join(f'<div class="mo"><b>{m}월</b><input data-f="m{m}" aria-label="{m}월 계획" placeholder="{e(s.get("ph", {}).get(m, ""))}"></div>' for m in range(1, 13))
    body = (f'<div style="display:flex;align-items:center;gap:28px"><span class="num" style="font-size:112px;line-height:.9;color:var(--acc-text)">{e(s["no"])}</span>'
            f'<div><span class="kicker">{e(s.get("kicker", ""))}</span><h2 class="h2" style="margin-top:8px">{H(s["title"])}</h2></div></div>'
            + (f'<p class="txt" style="margin-top:14px;max-width:1500px">{H(s["lead"])}</p>' if s.get("lead") else "")
            + f'<div class="months">{ms}</div>')
    return body, dict(cls="form", deco=_tabs(s))


def summary(s, d):
    cells = ""
    for c in s["cells"]:
        k, keys, emp = c[0], c[1], c[2]
        o = c[3] if len(c) > 3 else {}
        cells += (f'<div class="sm{" wide" if o.get("wide") else ""}"><div class="k">{e(k)}</div>'
                  f'<div class="v empty" data-sum="{keys}" data-empty="{e(emp)}"{f" data-sep={chr(34)}{e(o[chr(115)+chr(101)+chr(112)])}{chr(34)}" if o.get("sep") else ""}>{e(emp)}</div></div>')
    hdr = ""
    if s.get("header"):
        hdr = '<div class="sumhdr">' + "".join(f'<label><span>{e(lab)}</span><input data-f="{fid}" placeholder="{e(ph)}"></label>' for fid, lab, ph in s["header"]) + "</div>"
    body = (f'<div class="sumtop"><div><span class="kicker">{e(s.get("kicker", ""))}</span><h2 class="h2" style="margin-top:14px">{H(s["title"])}</h2></div>{hdr}</div>'
            f'<div class="summary" style="--n:{s.get("cols", 3)}">{cells}</div><div class="btnrow"><button class="btn acc" type="button" data-copy-plan>한 장 요약 복사</button>'
            f'<a class="btn line" href="{e(utm("/contact#contact-form", d["slug"], "plan_summary"))}" target="_blank" rel="noopener">이 계획으로 상담 받기 →</a></div>')
    return body, dict(cls="sumsl")


def cta(s, d):
    """주 행동 하나(큰 카드) + 보조 행동 둘(목록). 덱마다 첫 행동을 가장 부담이 적은 다음 단계로 둔다."""
    acts = s["acts"]
    ic, desc, label, href, uc = acts[0]
    pri = (f'<a class="pri" href="{e(utm(href, d["slug"], uc))}" target="_blank" rel="noopener"><span class="k">{e(s.get("pri_k", "추천 다음 단계"))}</span>'
           f'<b>{H(desc)}</b><span class="go">{e(label)} →</span></a>')
    sec = "".join(f'<a class="sec" href="{e(utm(h, d["slug"], u))}" target="_blank" rel="noopener"><span class="n">{i + 2:02d}</span><span class="d">{H(ds)}</span><span class="go">{e(lb)} →</span></a>'
                  for i, (_, ds, lb, h, u) in enumerate(acts[1:]))
    body = (f'<div class="cta2"><div class="l"><h2 class="disp h1">{H(s["title"])}</h2>' + (f'<p class="lead">{H(s["sub"])}</p>' if s.get("sub") else "")
            + f'<p class="honest">{H(s.get("honest", ""))}</p></div><div class="r">{pri}<div class="secs">{sec}</div></div></div>')
    return body, dict(cls="cta", dark=s.get("dark", False), deco=s.get("deco", ""))


def back(s, d):
    body = f'<div class="about"><b>ClassIn Korea</b><p>{H(s["about"])}</p></div>'
    deco = f'<div class="logo-big"><img src="{d["logo"]}" alt="">ClassIn</div>'
    return body, dict(cls="back", dark=True, deco=deco)


def free(s, d):
    return s["html"], dict(cls=s.get("cls", ""), dark=s.get("dark", False), deco=s.get("deco", ""), foot=s.get("source", ""))


def compare(s, d):
    cols = s.get("cols", ["우리 학원 2025", "우리 학원 2026", "메모"])
    th = "<th>지표</th><th>전국 참고값</th>" + "".join(f"<th>{e(c)}</th>" for c in cols)
    trs = ""
    for ri, (lab, nat, src) in enumerate(s["rows"]):
        trs += (f'<tr><th scope="row">{H(lab)}</th><td class="nat"><b>{H(nat)}</b><small>{H(src)}</small></td>'
                + "".join(f'<td><input data-f="{s["id"]}r{ri}c{ci}" aria-label="{e(strip_tags(lab))} {e(c)}" placeholder="{e(s.get("ph", {}).get((ri, ci), ""))}"></td>' for ci, c in enumerate(cols)) + "</tr>")
    body = (f'<span class="kicker">{e(s.get("kicker", ""))}</span><h2 class="h2" style="margin-top:14px;max-width:1600px">{H(s["title"])}</h2>'
            + (f'<p class="lead" style="margin-top:14px;max-width:1500px">{H(s["lead"])}</p>' if s.get("lead") else "")
            + f'<table class="cmp"><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table>')
    return body, dict(cls="comparel", foot=s.get("source", ""))


def columns(s, d):
    n = len(s["items"])
    cards = ""
    for it in s["items"]:
        tg, ti, bd = it[0], it[1], it[2]
        hl = len(it) > 3 and it[3]
        ft = it[4] if len(it) > 4 else ""
        cards += (f'<div class="cx{" hl" if hl else ""}"><span class="tg">{H(tg)}</span><div class="ti">{H(ti)}</div><div class="bd">{H(bd)}</div>'
                  + (f'<div class="ft">{H(ft)}</div>' if ft else "") + "</div>")
    body = (f'<span class="kicker">{e(s.get("kicker", ""))}</span><h2 class="h2" style="margin-top:14px;max-width:1600px">{H(s["title"])}</h2>'
            + (f'<p class="lead" style="margin-top:16px;max-width:1500px">{H(s["lead"])}</p>' if s.get("lead") else "")
            + f'<div class="colsx" style="--n:{n}">{cards}</div>')
    return body, dict(cls="columns", foot=s.get("source", ""), dark=s.get("dark", False), deco=s.get("deco", ""))


def stack(s, d):
    rows = ""
    for lab, note, segs in s["rows"]:
        total = sum(v for _, v, *_ in segs)
        n = len(segs)
        sg = ""
        for i, it in enumerate(segs):
            name, v = it[0], it[1]
            hl = len(it) > 2 and it[2]
            mix = 92 - int(i / max(1, n - 1) * 70) if not hl else 100
            sg += (f'<div class="sg{" hl" if hl else ""}{" dk" if mix > 55 else ""}" style="flex:{v / total * 100:.2f};--mix:{mix}%">'
                   f'<span>{e(name)}</span><b>{v:g}%</b></div>')
        rows += f'<div class="sr"><div class="rl"><span>{H(lab)}</span><small>{H(note)}</small></div><div class="bar2">{sg}</div></div>'
    body = (f'<span class="kicker">{e(s.get("kicker", ""))}</span><h2 class="h2" style="margin-top:14px;max-width:1600px">{H(s["title"])}</h2>'
            + (f'<p class="lead" style="margin-top:16px;max-width:1500px">{H(s["lead"])}</p>' if s.get("lead") else "")
            + f'<div class="stk">{rows}</div>'
            + (f'<div class="stk-note">{H(s["note"])}</div>' if s.get("note") else ""))
    return body, dict(cls="stackl", foot=s.get("source", ""), deco=s.get("deco", ""))


def donut(s, d):
    import math
    r, sw = 205, 78
    c = 2 * math.pi * r
    off = 0.0
    arcs = ""
    leg = ""
    for i, it in enumerate(s["items"]):
        lab, v = it[0], it[1]
        hl = len(it) > 2 and it[2]
        sub = it[3] if len(it) > 3 else ""
        ln = c * v / 100
        col = "var(--bar-hl)" if hl else "var(--bar)"
        arcs += (f'<circle cx="280" cy="280" r="{r}" fill="none" stroke="{col}" stroke-width="{sw}" '
                 f'stroke-dasharray="{ln - 4:.1f} {c - ln + 4:.1f}" stroke-dashoffset="{-off:.1f}" transform="rotate(-90 280 280)"/>')
        off += ln
        leg += f'<li class="{"hl" if hl else ""}"><i style="background:{col}"></i><span><b>{e(lab)}</b>{H(sub)}</span><em class="num">{v:g}%</em></li>'
    svg = f'<svg viewBox="0 0 560 560" aria-hidden="true"><circle cx="280" cy="280" r="{r}" fill="none" stroke="var(--track)" stroke-width="{sw}"/>{arcs}</svg>'
    center = f'<div class="dc"><b class="num">{H(s.get("center", ""))}</b><span>{H(s.get("center_sub", ""))}</span></div>'
    left = ((f'<span class="kicker">{e(s["kicker"])}</span>' if s.get("kicker") else "")
            + f'<h2 class="disp h1" style="margin-top:14px;font-size:{s.get("size", 84)}px">{H(s["title"])}</h2>'
            + "".join(f'<p class="txt">{H(p)}</p>' for p in s.get("paras", [])))
    body = f'<div class="dn"><div class="l">{left}</div><div class="r"><div class="dw">{svg}{center}</div><ul class="dl">{leg}</ul></div></div>'
    return body, dict(cls="donut", foot=s.get("source", ""), dark=s.get("dark", False), deco=s.get("deco", ""))


R = dict(cover=cover, toc=toc, opener=opener, editorial=editorial, findings=findings, stats=stats, chart=chart, spotlight=spotlight,
         takeaways=takeaways, pse=pse, dialogue=dialogue, matrix=matrix, dodont=dodont, questions=questions, beforeafter=beforeafter,
         steps=steps, screen=screen, quiz_q=quiz_q, quiz_result=quiz_result, quiz_types=quiz_types, form=form, table_form=table_form,
         months=months, summary=summary, cta=cta, back=back, free=free,
         columns=columns, stack=stack, donut=donut, compare=compare)


def render_deck(d: dict, css: str, js: str) -> str:
    d["logo"] = logo_data_uri()
    frames = []
    N = len(d["slides"])
    for i, s in enumerate(d["slides"]):
        body, o = R[s["L"]](s, d)
        dark = " dark" if o.get("dark") else ""
        mast = (f'<header class="mast"><span class="brand"><img src="{d["logo"]}" alt="">ClassIn</span><span class="series">{e(d["series"])}</span>'
                f'<span class="pg">{i + 1:02d}</span></header>') if s["L"] not in ("cover",) or True else ""
        foot = o.get("foot") or ""
        foot_html = f'<footer class="foot"><span class="sq"></span><span>{H(foot)}</span><span class="rule"></span><span>{e(d["short"])}</span></footer>'
        frames.append(f'<div class="frame" id="s{i + 1}"><section class="slide {o.get("cls", "")}{dark}" aria-label="{i + 1} / {N}">{o.get("deco", "")}{mast}'
                      f'<div class="body">{body}</div>{foot_html}</section></div>')
    html_body = "".join(frames)
    data = dict(title=d["title"])
    if d.get("quiz"):
        data["quiz"] = dict(n=d["quiz"]["n"], types=[{k: t[k] for k in ("key", "plain", "name", "desc", "strength", "risk", "next", "todo", "color")} for t in d["quiz"]["types"]])
    text = strip_tags(html_body) + json.dumps(data, ensure_ascii=False) + d["title"] + "입력과 선택을 모두 지웠습니다문구를 복사했습니다결과를 복사했습니다계획 요약을 복사했습니다. 실장님·강사님께 공유하세요아직 비어 있습니다문항을 먼저 골라 주세요복사하지 못했습니다. 길게 눌러 직접 복사해 주세요"
    if d.get("quiz"):
        text += "".join(strip_tags(t[k]) for t in d["quiz"]["types"] for k in ("name", "desc", "strength", "risk", "next", "todo"))
    fonts = f'@font-face{{font-family:"Pretendard";src:url(data:font/woff2;base64,{subset_font(text)}) format("woff2");font-weight:100 900;font-display:block}}'
    for fn in THEME_FONTS[d["theme"]]:
        fonts += font_face(fn, text)
    N2 = len(frames)
    ui = (f'<div class="progress"></div><div class="toast" role="status" aria-live="polite"></div>'
          f'<nav class="ui" aria-label="덱 조작"><button type="button" data-act="prev" class="only-present" aria-label="이전">←</button><span class="count only-present">01 / {N2:02d}</span>'
          f'<button type="button" data-act="next" class="only-present" aria-label="다음">→</button><button type="button" data-act="mode" class="hide-sm">⇅ 보기</button>'
          f'<button type="button" data-act="print" class="hide-sm">PDF</button><button type="button" data-act="reset" class="hide-sm" title="입력 지우기">↺</button>'
          f'<a class="cta-mini" href="{e(utm("/contact#contact-form", d["slug"], "ui_bar"))}" target="_blank" rel="noopener">상담 신청</a></nav>')
    title = f'{d["title"]} · ClassIn {d["series"]}'
    return (f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
            f'<title>{e(title)}</title><meta name="description" content="{e(d["desc"])}"><meta name="robots" content="noindex">'
            f'<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(d["desc"])}">'
            f'<style>{fonts}{css}</style></head><body class="th-{d["theme"]} mode-present"><main class="deck" data-slug="{e(d["slug"])}">{html_body}</main>{ui}'
            f'<script type="application/json" id="ins-data">{json.dumps(data, ensure_ascii=False).replace("</", "<\\/")}</script><script>{js}</script></body></html>')


# ───────────────────────── 시리즈 서가(index.html) ─────────────────────────
# 블라인드 심사로 고른 대표 3종(slug, 고른 이유). 심사 기록: docs/reports/lead-magnet-decks/2026-11-10-insight-r2.md
PICKS: list[tuple[str, str]] = [
    ("academy-2027-operation-planner", "두 심사 순위 합산 1위. 11~12월 계획 시즌에 맞고, 직접 쓴 계획서가 남아 ‘계획 들고 상담’으로 가장 자연스럽게 이어집니다."),
    ("academy-operations-report-2027", "공식 통계로 여는 유입용 대표 자료(디자인 심사 2위). 지적된 표현 오류를 원문으로 바로잡고, 우리 학원 숫자 비교표를 더했습니다."),
    ("parent-consult-closing-guide", "원장 심사 1위. 재등록 상담에서 이번 주에 바로 쓰는 말과 반론 대응을 담아, ‘기록이 필요하다’는 결론으로 이어집니다."),
]
REF = {"report": "HubSpot State of Sales", "brief": "검색 데이터 가이드북", "summit": "Dreamforce 핵심요약집",
       "guide": "Sales Closing Guide", "play": "리드 마그넷 유형: 퀴즈·진단", "planner": "리드 마그넷 유형: 템플릿·도구"}
ORDER = ["academy-operations-report-2027", "2028-admissions-reform-brief", "academy-briefing-summary",
         "parent-consult-closing-guide", "academy-operation-type-test", "academy-2027-operation-planner"]

INDEX_CSS = """
:root{--bg:#0E0F0E;--card:#171917;--ink:#F4F2EA;--mute:rgba(244,242,234,.62);--line:rgba(244,242,234,.14);--acc:#A8E6BE}
*{box-sizing:border-box;margin:0;padding:0}html,body{background:var(--bg);color:var(--ink)}
body{font-family:"Pretendard",-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;word-break:keep-all;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.wrap{max-width:1280px;margin:0 auto;padding:56px 24px 96px}
.top{display:flex;align-items:center;gap:10px;font:700 15px/1 inherit;color:var(--mute)}.top img{height:18px}.top b{color:var(--ink)}
h1{margin-top:44px;font-weight:850;font-size:clamp(34px,5.4vw,68px);line-height:1.12;letter-spacing:-.035em}h1 em{font-style:normal;color:var(--acc)}
.intro{margin-top:20px;max-width:760px;font-size:18px;line-height:1.7;color:var(--mute)}
.facts{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px}.facts span{padding:8px 14px;border:1px solid var(--line);border-radius:999px;font-size:14px;color:var(--mute)}
h2{font-size:24px;font-weight:800;letter-spacing:-.02em}.sub{margin-top:6px;color:var(--mute);font-size:15px;line-height:1.6}
section{margin-top:64px}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin-top:22px}
.card{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden;transition:transform .2s,border-color .2s}
.card:hover{transform:translateY(-4px);border-color:rgba(168,230,190,.5)}
.thumb{position:relative;aspect-ratio:16/9;background:#000}.thumb img{display:block;width:100%;height:100%;object-fit:cover}
.thumb .fm{position:absolute;left:12px;top:12px;padding:6px 10px;border-radius:999px;background:rgba(14,15,14,.82);font-size:12px;font-weight:700;color:var(--acc)}
.meta{display:flex;flex-direction:column;gap:6px;padding:16px 18px 18px}
.meta .t{font-size:18px;font-weight:800;letter-spacing:-.02em}.meta .d{font-size:14px;line-height:1.6;color:var(--mute)}
.meta .f{margin-top:4px;font-size:13px;color:var(--mute)}.meta .why{margin-top:6px;padding-top:10px;border-top:1px solid var(--line);font-size:13.5px;line-height:1.55;color:var(--acc)}
.picks .grid .card{border-color:rgba(168,230,190,.4)}
.how{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:64px}.how div{padding:20px;border:1px solid var(--line);border-radius:16px}.how b{font-size:16px}.how p{margin-top:8px;font-size:14px;line-height:1.65;color:var(--mute)}
.note{margin-top:40px;font-size:13px;line-height:1.7;color:var(--mute)}
.back{display:inline-block;margin-top:28px;font-size:14px;color:var(--acc)}
@media (max-width:900px){.grid,.how{grid-template-columns:1fr}.wrap{padding:36px 16px 80px}}
"""


def build_index(decks: list[dict]) -> str:
    by = {d["slug"]: d for d in decks}

    def card(slug, why=""):
        d = by[slug]
        return (f'<a class="card" href="{slug}.html"><div class="thumb"><img src="thumbs/{slug}.webp" alt="{e(d["title"])} 표지" loading="lazy" width="960" height="540">'
                f'<span class="fm">{e(d["format"])}</span></div><div class="meta"><span class="t">{e(d["title"])}</span><span class="d">{e(d["desc"])}</span>'
                f'<span class="f">{len(d["slides"])}장 · 참고 {e(REF[d["theme"]])}</span>' + (f'<span class="why">{e(why)}</span>' if why else "") + "</div></a>")

    picks = "".join(card(s, w) for s, w in PICKS if s in by)
    rest = "".join(card(s) for s in ORDER if s in by)
    n_slides = sum(len(d["slides"]) for d in decks)
    body = f"""<div class="wrap">
<div class="top"><img src="{logo_data_uri()}" alt=""><b>ClassIn Korea</b><span>Insight 시리즈</span></div>
<h1>체크리스트 말고,<br><em>여섯 가지 형식</em>으로</h1>
<p class="intro">리포트·데이터 브리핑·설명회 요약집·대화형 가이드·진단 테스트·계획 템플릿. 형식마다 디자인 언어를 따로 잡은 16:9 발표형 리드마그넷입니다. 통계는 공식 원문에서 확인한 값만, 해석은 ‘ClassIn 해석’으로 나눠 적었습니다.</p>
<div class="facts"><span>{len(decks)}종 · {n_slides}장</span><span>공식 통계 출처 표기</span><span>퀴즈 자동 채점</span><span>템플릿 한 장 요약 자동 생성</span><span>모바일 세로 보기</span><span>16:9 PDF</span></div>
{f'<section class="picks"><h2>대표 3종</h2><p class="sub">블라인드 심사(원장 관점·디자인 디렉터 관점)에서 고른 캠페인용 3종입니다.</p><div class="grid">{picks}</div></section>' if picks else ""}
<section><h2>전체 {len(decks)}종</h2><p class="sub">형식이 다르면 읽는 이유도 다릅니다. 인지 단계는 리포트·브리핑·테스트, 고려 단계는 요약집·가이드·템플릿부터.</p><div class="grid">{rest}</div></section>
<div class="how"><div><b>발표 모드</b><p>←·→ 키나 아래 조작 막대로 넘깁니다. 설명회·상담 화면 공유에 그대로 씁니다.</p></div>
<div><b>모바일</b><p>폭이 좁으면 슬라이드가 세로 카드로 다시 흘러갑니다. 광고로 들어온 원장님이 폰에서 바로 읽고 풉니다.</p></div>
<div><b>입력과 개인정보</b><p>퀴즈 답과 템플릿 입력은 보는 사람의 브라우저에만 저장되고 어디에도 전송되지 않습니다.</p></div></div>
<p class="note">통계: 국가데이터처·교육부 2025 사교육비조사, 교육부·KEDI 2026 교육기본통계, KEDI 교육통계서비스 사설학원 현황, 통계청 장래인구추계, 교육부 2028 대입제도 개편 확정안·고교학점제 안착 지원 대책, 대교협 2027·2028학년도 시행계획. 대화·장면은 이해를 돕기 위한 예시이며, 가격·도입 수·성과 보장 표현은 싣지 않았습니다.</p>
<a class="back" href="../decks/index.html">← 원장 노트 시리즈 16권(체크리스트·워크시트)</a>
</div>"""
    font = subset_font(strip_tags(body))
    return (f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
            f'<title>ClassIn Insight 시리즈</title><meta name="robots" content="noindex">'
            f'<style>@font-face{{font-family:"Pretendard";src:url(data:font/woff2;base64,{font}) format("woff2");font-weight:100 900;font-display:swap}}{INDEX_CSS}</style>'
            f'</head><body>{body}</body></html>')


def make_thumbs(src_dir: Path, out: Path, slugs: list[str]):
    from PIL import Image
    (out / "thumbs").mkdir(parents=True, exist_ok=True)
    for slug in slugs:
        src = src_dir / f"{slug}-01.png"
        if src.exists():
            Image.open(src).convert("RGB").resize((960, 540), Image.LANCZOS).save(out / "thumbs" / f"{slug}.webp", "WEBP", quality=80, method=6)


def load(slug_file: Path) -> dict:
    spec = importlib.util.spec_from_file_location(slug_file.stem.replace("-", "_"), slug_file)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.DECK


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--thumbs-from", help="qa.mjs 스크린샷 폴더(<slug>-01.png)에서 표지 썸네일을 만든다")
    ap.add_argument("--index", action="store_true", help="index.html(시리즈 서가)도 만든다")
    a = ap.parse_args()
    css = (HERE / "insight.css").read_text()
    # 모바일 블록은 맨 뒤로(데스크톱 다듬기가 덮지 않게)
    js = (HERE / "insight.js").read_text()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    files = sorted((HERE / "decks").glob("*.py"))
    decks = []
    for f in files:
        if f.stem.startswith("_"):
            continue
        d = load(f)
        decks.append(d)
        if a.only and d["slug"] not in a.only:
            continue
        html_text = render_deck(d, css, js)
        p = out / f"{d['slug']}.html"
        p.write_text(html_text)
        print(f"{p}  {len(d['slides'])} slides  {len(html_text) // 1024} KB")
    if a.thumbs_from:
        make_thumbs(Path(a.thumbs_from), out, [d["slug"] for d in decks])
    if a.index:
        (out / "index.html").write_text(build_index(decks))
        print(out / "index.html")


if __name__ == "__main__":
    main()
