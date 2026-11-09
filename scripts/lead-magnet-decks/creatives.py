#!/usr/bin/env python3
"""대표 리드마그넷의 4:5(1080×1350) 피드 광고 소재 HTML 을 만든다. PNG 는 qa.mjs --ad 로 찍는다.

    python3 scripts/lead-magnet-decks/creatives.py --out <dir> [--only slug ...]

변형 A(표지형): 표지 제목 + 자료 미리보기. 변형 B(장면형): 후킹 장의 장면·인용.
카피 규칙은 content.py 머리말과 같다(미검증 수치·가격·보장 금지, 장면은 예시).
"""
from __future__ import annotations

import argparse
import base64
import re
from pathlib import Path

from build import DECK_OPTS, MONO, OV, PICKS, Deck, deck_css, e, load_magnets, logo_data_uri, strip_tags, subset_font

AD_CSS = """
.ad{width:1080px;height:1350px;position:relative;overflow:hidden;background:var(--paper);word-break:keep-all;font-family:var(--sans);color:var(--ink)}
.ad .top{position:absolute;left:72px;right:72px;top:64px;display:flex;align-items:center;gap:14px;font:600 26px/1 var(--sans);color:var(--muted)}
.ad .top img{height:26px}.ad .top b{color:var(--ink);font-weight:700}
.ad .top .free{margin-left:auto;height:46px;padding:0 20px;border-radius:999px;background:var(--ink);color:var(--paper);display:inline-flex;align-items:center;font:700 22px/1 var(--sans)}
.ad h1{position:absolute;left:72px;right:72px;top:176px;font:800 var(--hs,104px)/1.14 var(--sans);letter-spacing:-.028em;text-wrap:balance}
.ad .sub{position:absolute;left:72px;right:120px;top:var(--subtop,520px);font:500 31px/1.5 var(--sans);letter-spacing:-.02em;color:var(--body)}
.ad .panel{position:absolute;left:72px;right:72px;bottom:190px;height:var(--ph,520px);background:var(--accent);border-radius:36px;overflow:hidden}
.ad .panel .sheet-stack{position:absolute;inset:70px 70px -40px 70px}
.ad .panel .mock.back{background:rgba(255,255,255,.18);border-color:transparent;box-shadow:none}
.ad .panel .mock.mid{background:rgba(255,255,255,.55);border-color:transparent}
.ad .panel .m-foot{display:none}
.ad .panel .mock.front{bottom:-60px}
.ad .panel .cover-stamp{right:34px;top:30px;width:150px;height:150px}
.ad .cta{position:absolute;left:72px;right:72px;bottom:64px;height:96px;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:0 18px 0 36px;border-radius:999px;background:var(--ink);color:var(--paper)}
.ad .cta .l{font:600 26px/1.3 var(--sans);color:rgba(250,250,248,.78)}
.ad .cta .r{height:66px;padding:0 30px;border-radius:999px;background:var(--accent);color:#fff;display:inline-flex;align-items:center;font:750 28px/1 var(--sans)}
.ad.ink{background:var(--slab);color:var(--on-slab)}
.ad.ink .top{color:var(--on-slab-muted)}.ad.ink .top b{color:var(--on-slab)}.ad.ink .top .free{background:var(--on-slab);color:var(--slab)}
.ad.ink .eb{position:absolute;left:72px;top:176px;font:650 30px/1.2 var(--sans);color:var(--sage)}
.ad.ink h1{top:236px;font-size:var(--hs,84px)}
.ad.ink em{background:none;color:var(--sage)}
.ad.ink .scenes2{position:absolute;left:72px;right:72px;top:var(--sctop,600px);bottom:200px;list-style:none;display:grid;gap:16px;align-content:stretch}
.ad.ink .scenes2 li{display:flex;flex-direction:column;justify-content:center;padding:24px 32px;border-radius:24px;background:var(--slab-2);border:1px solid var(--on-slab-hair)}
.ad.ink .scenes2 .q{font:650 22px/1 var(--sans);color:var(--sage)}
.ad.ink .scenes2 p{margin-top:12px;font:650 35px/1.38 var(--sans);letter-spacing:-.022em;color:var(--on-slab)}
.ad.ink .cta{background:var(--on-slab);color:var(--slab)}.ad.ink .cta .l{color:var(--muted)}
.ad .note{position:absolute;left:72px;right:72px;bottom:16px;font:500 21px/1.3 var(--sans);color:var(--muted);text-align:center}
.ad .cta{bottom:56px}
.ad.ink .scenes2.many p{font-size:29px;margin-top:6px}.ad.ink .scenes2.many li{padding:16px 28px}
.ad .panel .art-chat .m-row:nth-of-type(n+4){display:none}
.ad.ink .note{color:var(--on-slab-muted)}
"""


def ad_heading_size(title_html: str, width: int, top: int) -> int:
    lines = [strip_tags(x) for x in re.split(r"<br\s*/?>", title_html)]
    longest = max(len(x) for x in lines)
    return min(top, int(width / (longest * 0.9)))


def render_ads(slug: str, m: dict, magnets: dict, css: str, logo: str) -> dict[str, str]:
    ov = OV[slug]
    d = Deck(m, ov, magnets)
    d.cover()
    cover_body = d.slides[0]["body"]
    art = cover_body[cover_body.index('<div class="cover-art">'):]
    art_inner = art[len('<div class="cover-art">'):art.rindex("</div>")]
    n_slides = len(Deck(m, ov, magnets).build().slides)
    total = sum(len(s["items"]) for s in m["sections"])
    opts = DECK_OPTS.get(slug, {})
    meta = opts.get("ad_meta", f'{total}문항 자가진단') + f' · {n_slides}장 · {m["estimatedMinutes"]}분'
    cta_label = opts.get("ad_cta", f'{ov["short"]} 받기 →')
    title = ov["cover"]["title"]
    lines = len(re.split(r"<br\s*/?>", title))
    hs = ad_heading_size(title, 936, 112)
    subtop = 176 + int(hs * 1.14 * lines) + 34
    head = (f'<div class="top"><img src="{logo}" alt=""><b>ClassIn</b><span>원장 노트 No.{ov["no"]:02d}</span><span class="free">무료 자료</span></div>')
    cta = (f'<div class="cta"><span class="l">{e(meta)}</span><span class="r">{e(cta_label)}</span></div>')
    a = (f'<section class="ad" style="--hs:{hs}px;--subtop:{subtop}px;--ph:{1350 - 190 - subtop - 170}px">{head}<h1>{title}</h1>'
         f'<p class="sub">{e(ov["cover"]["sub"].split(". ")[0].rstrip(".") + ".")}</p>'
         f'<div class="panel">{art_inner}</div>{cta}<p class="note">제목의 장면과 미리보기 화면은 이해를 돕기 위한 예시입니다.</p></section>')
    h = ov["hook"]
    scenes = h.get("scenes") or [(t, q) for q, t in (h.get("qs") or [])][:4] or [(f"{x[0]} · {x[1]}", x[2]) for x in (h.get("nodes") or [])]
    scenes = scenes[:4] if h.get("qs") else scenes[:5] if h.get("nodes") else scenes[:3]
    mark = lambda q: ("✕ " if "보내면" in q else "✓ " if "바꾸면" in q else "") + q  # noqa: E731
    hs2 = ad_heading_size(h["title"], 936, 96)
    hl = len(re.split(r"<br\s*/?>", h["title"]))
    sctop = 236 + int(hs2 * 1.14 * hl) + 56
    sc = "".join(f'<li><div class="q">{e(mark(q))}</div><p>{e(t)}</p></li>' for q, t in scenes)
    note = opts.get("ad_note", "장면은 이해를 돕기 위한 예시입니다.")
    b = (f'<section class="ad ink" style="--hs:{hs2}px;--sctop:{sctop}px">{head}<div class="eb">{e(h["eyebrow"])}</div><h1>{h["title"]}</h1>'
         f'<ol class="scenes2{" many" if len(scenes) > 4 else ""}">{sc}</ol>{cta}<p class="note">{e(note)}</p></section>')
    out = {}
    for k, sec in (("a", a), ("b", b)):
        body = sec.replace("Classin", "ClassIn")
        pre = subset_font(strip_tags(body))
        mono = base64.b64encode(MONO.read_bytes()).decode()
        fonts = (f'@font-face{{font-family:"Pretendard";src:url(data:font/woff2;base64,{pre}) format("woff2");font-weight:100 900}}'
                 f'@font-face{{font-family:"Plex Mono";src:url(data:font/woff2;base64,{mono}) format("woff2");font-weight:500}}')
        out[k] = (f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>{e(m["title"])} 광고 {k.upper()}</title>'
                  f'<style>{fonts}{css}{AD_CSS}html,body{{margin:0;background:#E9E7E1}}</style></head><body>{body}</body></html>')
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", nargs="*")
    a = ap.parse_args()
    magnets = load_magnets()
    css = deck_css()
    logo = logo_data_uri()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    for slug in a.only or [s for s, _ in PICKS]:
        for k, html_text in render_ads(slug, magnets[slug], magnets, css, logo).items():
            p = out / f"ad-{slug}-{k}.html"
            p.write_text(html_text)
            print(p)


if __name__ == "__main__":
    main()
