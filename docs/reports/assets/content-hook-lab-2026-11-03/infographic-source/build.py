"""Animation-style (flat cartoon) infographics for 4 blog drafts. Renders HTML -> PNG via Playwright."""
import json, subprocess, sys, os

OUT = os.path.dirname(os.path.abspath(__file__))

INK = "#111110"
GREEN = "#084734"
G50 = "#ECFDF5"
G100 = "#D1FAE5"
MINT = "#6EE7B7"
WARM = "#F6F5F4"
AMBER_BG = "#FBF1E0"
AMBER = "#A8741A"
AMBER_LINE = "#ECD29C"
SKIN = "#FFE1C4"

CSS = f"""
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{width:1200px;background:#FAFAF8;font-family:Pretendard,sans-serif;color:{INK};word-break:keep-all;overflow-wrap:break-word}}
.wrap{{padding:64px 64px 56px;position:relative;overflow:hidden}}
.dots{{position:absolute;inset:0;background-image:radial-gradient({G100} 2px,transparent 2px);background-size:28px 28px;opacity:.55;z-index:0}}
.z{{position:relative;z-index:1}}
.badge{{display:inline-block;background:{GREEN};color:#fff;font-weight:700;font-size:22px;padding:8px 18px;border-radius:999px;border:3px solid {INK};box-shadow:4px 4px 0 {INK}}}
h1{{font-size:56px;font-weight:800;letter-spacing:-1.6px;line-height:1.18;margin-top:22px}}
h1 em{{font-style:normal;color:{GREEN};background:linear-gradient(transparent 62%,{MINT} 62%)}}
.sub{{font-size:26px;font-weight:500;color:#615D59;margin-top:14px;line-height:1.45}}
.card{{background:#fff;border:3px solid {INK};border-radius:28px;box-shadow:7px 7px 0 {INK};padding:30px 32px}}
.card.g{{background:{G50}}}
.card.a{{background:{AMBER_BG}}}
.ct{{font-size:30px;font-weight:800;letter-spacing:-.6px;display:flex;align-items:center;gap:12px}}
.item{{display:flex;align-items:center;gap:16px;font-size:25px;font-weight:600;margin-top:18px;line-height:1.35}}
.ico{{flex:0 0 56px;height:56px;border:3px solid {INK};border-radius:16px;background:#fff;display:flex;align-items:center;justify-content:center}}
.foot{{margin-top:40px;display:flex;justify-content:space-between;align-items:center;font-size:20px;color:#615D59;font-weight:600}}
.pill{{display:flex;gap:16px;align-items:center;background:#fff;border:3px solid {INK};border-radius:999px;padding:14px 26px;font-size:24px;font-weight:700;box-shadow:4px 4px 0 {INK}}}
.num{{flex:0 0 40px;height:40px;border-radius:50%;background:{GREEN};color:#fff;font-weight:800;font-size:22px;display:flex;align-items:center;justify-content:center;border:3px solid {INK}}}
.step{{background:#fff;border:3px solid {INK};border-radius:22px;padding:18px 20px;font-size:23px;font-weight:700;text-align:center;line-height:1.35;box-shadow:4px 4px 0 {INK}}}
.arrow{{font-size:34px;font-weight:900;color:{INK};display:flex;align-items:center;justify-content:center}}
.note{{margin-top:30px;background:{GREEN};color:#fff;border:3px solid {INK};border-radius:24px;padding:22px 28px;font-size:27px;font-weight:700;box-shadow:6px 6px 0 {INK};line-height:1.4}}
.note b{{color:{MINT}}}
</style>
"""

# ---------- cartoon SVG parts ----------

def person(mood="happy", hair="#3B2A20", shirt=GREEN, w=170, extra=""):
    """Simple flat cartoon person, 170x210 viewbox."""
    brows = {
        "happy": f'<path d="M62 74 q8 -6 16 0 M92 74 q8 -6 16 0" stroke="{INK}" stroke-width="4" fill="none" stroke-linecap="round"/>',
        "worry": f'<path d="M62 76 l16 -6 M108 76 l-16 -6" stroke="{INK}" stroke-width="4" fill="none" stroke-linecap="round"/>',
        "tired": f'<path d="M62 76 h16 M92 76 h16" stroke="{INK}" stroke-width="4" fill="none" stroke-linecap="round"/>',
    }[mood]
    mouth = {
        "happy": f'<path d="M72 104 q13 14 26 0" stroke="{INK}" stroke-width="4" fill="#fff" stroke-linecap="round"/>',
        "worry": f'<path d="M73 110 q12 -9 24 0" stroke="{INK}" stroke-width="4" fill="none" stroke-linecap="round"/>',
        "tired": f'<path d="M74 108 h22" stroke="{INK}" stroke-width="4" fill="none" stroke-linecap="round"/>',
    }[mood]
    sweat = f'<path d="M128 62 q8 12 0 18 q-8 -6 0 -18z" fill="#9AD9F5" stroke="{INK}" stroke-width="3"/>' if mood in ("worry", "tired") else ""
    return f'''<svg width="{w}" height="{int(w*210/170)}" viewBox="0 0 170 210">
  <rect x="38" y="138" width="94" height="66" rx="30" fill="{shirt}" stroke="{INK}" stroke-width="4"/>
  <path d="M70 140 l15 18 l15 -18" fill="#fff" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>
  <circle cx="85" cy="88" r="46" fill="{SKIN}" stroke="{INK}" stroke-width="4"/>
  <path d="M40 84 q2 -46 45 -48 q44 2 46 48 q-12 -22 -46 -24 q-30 2 -45 24z" fill="{hair}" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>
  <circle cx="70" cy="88" r="5" fill="{INK}"/><circle cx="100" cy="88" r="5" fill="{INK}"/>
  <circle cx="60" cy="102" r="7" fill="#FFB4A8" opacity=".7"/><circle cx="110" cy="102" r="7" fill="#FFB4A8" opacity=".7"/>
  {brows}{mouth}{sweat}{extra}
</svg>'''

def icon(name, s=34):
    st = f'stroke="{INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"'
    p = {
        "book": f'<rect x="7" y="5" width="22" height="26" rx="3" fill="{MINT}" {st}/><path d="M12 5 v26" {st}/>',
        "calendar": f'<rect x="5" y="8" width="26" height="22" rx="4" fill="#fff" {st}/><path d="M5 15 h26 M12 4 v7 M24 4 v7" {st}/><rect x="11" y="20" width="5" height="4" fill="{GREEN}"/>',
        "people": f'<circle cx="12" cy="13" r="5" fill="{MINT}" {st}/><circle cx="24" cy="13" r="5" fill="#fff" {st}/><path d="M4 30 q8 -12 16 0 M16 30 q8 -12 16 0" fill="none" {st}/>',
        "laptop": f'<rect x="7" y="8" width="22" height="15" rx="2" fill="#fff" {st}/><path d="M3 28 h30 l-3 -5 h-24z" fill="{MINT}" {st}/>',
        "phone": f'<rect x="10" y="4" width="16" height="28" rx="4" fill="#fff" {st}/><path d="M16 27 h4" {st}/><rect x="13" y="9" width="10" height="12" rx="1" fill="{AMBER_LINE}"/>',
        "leave": f'<circle cx="13" cy="10" r="5" fill="#FFD4D0" {st}/><path d="M5 31 q0 -12 8 -12 q8 0 8 12" fill="#fff" {st}/><path d="M23 19 h10 M29 15 l4 4 l-4 4" fill="none" {st}/>',
        "cloudlock": f'<path d="M9 26 q-6 0 -6 -6 q0 -6 7 -6 q2 -7 9 -7 q8 0 9 8 q6 1 6 6 q0 5 -6 5z" fill="#fff" {st}/><rect x="14" y="17" width="9" height="7" rx="1.5" fill="{GREEN}" {st}/><path d="M16 17 v-2 q2.5 -3 5 0 v2" fill="none" {st}/>',
        "brain": f'<path d="M11 28 q-7 -2 -6 -9 q-3 -7 4 -10 q1 -6 9 -4 q6 -4 10 2 q7 1 5 9 q4 6 -2 10 q-1 5 -8 4 q-6 3 -12 -2z" fill="#FFD4D0" {st}/><path d="M18 8 v20" {st}/>',
        "video": f'<rect x="4" y="7" width="28" height="22" rx="5" fill="#fff" {st}/><path d="M15 13 l8 5 l-8 5z" fill="{GREEN}" {st}/>',
        "chat": f'<path d="M5 8 h26 v15 h-14 l-7 6 v-6 h-5z" fill="#fff" {st}/><path d="M11 15 h14" {st}/>',
        "clock": f'<circle cx="18" cy="18" r="13" fill="#fff" {st}/><path d="M18 10 v8 l6 4" {st}/>',
        "repeat": f'<path d="M8 15 q0 -8 10 -8 h8 M22 3 l4 4 l-4 4 M28 21 q0 8 -10 8 h-8 M14 33 l-4 -4 l4 -4" fill="none" {st}/>',
        "pc": f'<rect x="8" y="5" width="20" height="26" rx="3" fill="#fff" {st}/><path d="M13 11 h10 M13 16 h10" {st}/><circle cx="18" cy="25" r="2" fill="{GREEN}"/>',
        "camera": f'<rect x="4" y="10" width="20" height="16" rx="4" fill="#fff" {st}/><path d="M24 15 l8 -4 v14 l-8 -4z" fill="{MINT}" {st}/><circle cx="14" cy="18" r="4" fill="{GREEN}"/>',
        "mic": f'<rect x="12" y="4" width="12" height="18" rx="6" fill="{MINT}" {st}/><path d="M7 17 q0 9 11 9 q11 0 11 -9 M18 26 v6 M12 32 h12" fill="none" {st}/>',
        "wrench": f'<path d="M24 5 a8 8 0 0 0 -9 10 l-10 10 a3 3 0 0 0 5 5 l10 -10 a8 8 0 0 0 10 -9 l-5 5 l-4 -1 l-1 -4z" fill="#fff" {st}/>',
        "plug": f'<path d="M12 4 v8 M24 4 v8" {st}/><rect x="8" y="12" width="20" height="11" rx="3" fill="{MINT}" {st}/><path d="M18 23 v9" {st}/>',
        "check": f'<circle cx="18" cy="18" r="14" fill="{GREEN}" {st}/><path d="M11 18 l5 5 l9 -10" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
        "warn": f'<path d="M18 4 l15 26 h-30z" fill="#FDE68A" {st}/><path d="M18 13 v8 M18 25 v1" {st}/>',
        "magnifier": f'<circle cx="15" cy="15" r="10" fill="#fff" {st}/><path d="M22 22 l9 9" {st}/>',
        "tablet": f'<rect x="5" y="6" width="26" height="24" rx="4" fill="#fff" {st}/><path d="M15 13 l7 5 l-7 5z" fill="{GREEN}" {st}/>',
    }[name]
    return f'<svg width="{s}" height="{s}" viewBox="0 0 36 36">{p}</svg>'


def board(w=320, callouts=True):
    """Cartoon ClassIn Board on rolling stand (silver frame, black screen), camera on top, ceiling mic."""
    num = lambda x, y, n: f'<g><circle cx="{x}" cy="{y}" r="15" fill="{GREEN}" stroke="{INK}" stroke-width="3.5"/><text x="{x}" y="{y+6}" text-anchor="middle" font-family="Pretendard" font-weight="800" font-size="17" fill="#fff">{n}</text></g>' if callouts else ""
    return f'''<svg width="{w}" height="{int(w*360/320)}" viewBox="0 0 320 360">
  <path d="M160 0 v22" stroke="{INK}" stroke-width="4"/>
  <ellipse cx="160" cy="30" rx="18" ry="10" fill="{MINT}" stroke="{INK}" stroke-width="4"/>
  <rect x="142" y="50" width="36" height="18" rx="6" fill="#fff" stroke="{INK}" stroke-width="4"/>
  <circle cx="160" cy="59" r="5" fill="{GREEN}"/>
  <rect x="18" y="68" width="284" height="164" rx="10" fill="#D7D8D4" stroke="{INK}" stroke-width="4.5"/>
  <rect x="30" y="80" width="260" height="136" rx="4" fill="#1D1D1B"/>
  <path d="M52 112 q14 -14 28 0 t28 0 M52 140 h70 M52 166 q20 -10 40 0" stroke="{MINT}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".9"/>
  <path d="M182 168 l22 -38 l22 38 z" stroke="#fff" stroke-width="3.5" fill="none" opacity=".75" stroke-linejoin="round"/>
  <text x="160" y="228" text-anchor="middle" font-family="Pretendard" font-weight="700" font-size="9" fill="#77776F">Classin</text>
  <path d="M104 232 Q98 290 80 340 M216 232 Q222 290 240 340 M118 232 Q118 285 108 328 M202 232 Q202 285 212 328" stroke="#C9CAC5" stroke-width="10" stroke-linecap="round" fill="none"/>
  <path d="M104 232 Q98 290 80 340 M216 232 Q222 290 240 340 M118 232 Q118 285 108 328 M202 232 Q202 285 212 328" stroke="{INK}" stroke-width="2.5" stroke-linecap="round" fill="none" opacity=".5"/>
  <circle cx="80" cy="344" r="8" fill="#fff" stroke="{INK}" stroke-width="3.5"/><circle cx="240" cy="344" r="8" fill="#fff" stroke="{INK}" stroke-width="3.5"/>
  <circle cx="108" cy="332" r="7" fill="#fff" stroke="{INK}" stroke-width="3"/><circle cx="212" cy="332" r="7" fill="#fff" stroke="{INK}" stroke-width="3"/>
  {num(46, 202, 1)}{num(206, 58, 2)}{num(268, 318, 3)}
</svg>'''

def sparkle(x, y, s=34, color=MINT):
    return f'<svg style="position:absolute;left:{x}px;top:{y}px" width="{s}" height="{s}" viewBox="0 0 30 30"><path d="M15 2 q2 11 13 13 q-11 2 -13 13 q-2 -11 -13 -13 q11 -2 13 -13z" fill="{color}" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/></svg>'

def item2(ic, title, sub):
    return f'<div class="item"><div class="ico">{icon(ic)}</div><div style="display:flex;flex-direction:column;gap:2px"><span style="font-weight:800">{title}</span><span style="font-size:20px;font-weight:500;color:#615D59">{sub}</span></div></div>'

def item(ic, text):
    return f'<div class="item"><div class="ico">{icon(ic)}</div><div>{text}</div></div>'

def page(body):
    return f"<!doctype html><html><head><meta charset='utf-8'>{CSS}</head><body><div class='wrap'><div class='dots'></div><div class='z'>{body}</div></div></body></html>"

FOOT = '<div class="foot"><span>ClassIn Korea · 학원 수업 운영 인사이트</span><span>classin.co.kr</span></div>'

# ---------- A. TOFU 1: teacher leaves ----------
door_teacher = person("happy", hair="#5A3A28", shirt="#7FB3A0", w=190, extra=f'<rect x="120" y="150" width="34" height="44" rx="8" fill="#FDE68A" stroke="{INK}" stroke-width="4"/><path d="M128 150 q9 -14 18 0" fill="none" stroke="{INK}" stroke-width="4"/>')
A = page(f"""
<span class="badge">학원 운영 체크</span>
<h1>강사가 떠난 다음 날,<br><em>학원에 남는 것은?</em></h1>
<p class="sub">수업 자료가 강사 개인 기기에만 있으면, 강사가 떠날 때 자료와 콘텐츠, 학생까지 함께 떠날 수 있습니다.</p>
<div style="display:grid;grid-template-columns:1fr 210px 1fr;gap:22px;margin-top:44px;align-items:center">
  <div class="card g">
    <div class="ct">{icon('check',40)} 학원에 남는 것</div>
    {item2('book','교재','누구나 살 수 있는 출판 교재')}
    {item2('calendar','시간표','반·교실·요일 배정')}
    {item2('people','학생 명단','이름과 연락처')}
  </div>
  <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:6px">
    {door_teacher}
    <div style="font-size:21px;font-weight:700;text-align:center">"그동안<br>감사했습니다!"</div>
    {sparkle(0,10)}{sparkle(168,70,26,'#FDE68A')}
  </div>
  <div class="card a">
    <div class="ct">{icon('warn',40)} 함께 떠날 수 있는 것</div>
    {item2('laptop','학원 자료','강사 노트북 속 교안·문제지')}
    {item2('video','학원 콘텐츠','판서·수업 녹화')}
    {item2('leave','학생','강사를 따라 옮기는 학생')}
  </div>
</div>
<div style="margin-top:48px">
  <div style="font-size:32px;font-weight:800;letter-spacing:-.6px;margin-bottom:20px">오늘 바로 확인할 3가지</div>
  <div style="display:flex;flex-direction:column;gap:16px">
    <div class="pill"><div class="num">1</div>반별 교안이 학원 공용 공간에 있나요?</div>
    <div class="pill"><div class="num">2</div>지난 수업 판서를 다시 열어 볼 수 있나요?</div>
    <div class="pill"><div class="num">3</div>새 강사가 진도와 수업 기록을 바로 볼 수 있나요?</div>
  </div>
</div>
<div class="note" style="display:flex;gap:18px;align-items:center"><div style="flex:0 0 56px;height:56px;border:3px solid {INK};border-radius:16px;background:#fff;display:flex;align-items:center;justify-content:center">{icon('cloudlock',40)}</div><div>클래스인에서는 교안·판서·녹화가 <b>학원 클라우드</b>에 남고,<br>관리자가 계정·권한으로 열람을 관리합니다. 녹화에는 워터마크가 들어갑니다.</div></div>
{FOOT}
""")

# ---------- B. TOFU 2: absent student make-up ----------
tired = person("tired", hair="#2E2A26", shirt="#C9A46A", w=150)
happy = person("happy", hair="#2E2A26", shirt=GREEN, w=150)
B = page(f"""
<span class="badge">보강 운영</span>
<h1>결석생 보강,<br><em>강사가 매번 다시 설명하나요?</em></h1>
<p class="sub">결석생마다 따로 설명하면 같은 수업을 여러 번 하게 됩니다. 흐름을 바꾸면 강사의 일이 달라집니다.</p>
<div class="card a" style="margin-top:44px;display:grid;grid-template-columns:150px 1fr;gap:26px;align-items:center">
  <div>{tired}</div>
  <div>
    <div class="ct">{icon('repeat',40)} 지금 흔한 방식</div>
    <div style="display:grid;grid-template-columns:1fr 44px 1fr 44px 1fr;margin-top:20px;align-items:center">
      <div class="step">학생 결석</div><div class="arrow">→</div>
      <div class="step">강사가<br>시간을 따로 냄</div><div class="arrow">→</div>
      <div class="step">같은 설명<br>다시 하기</div>
    </div>
    <div style="margin-top:16px;font-size:23px;font-weight:700;color:{AMBER};display:flex;align-items:center;gap:10px">{icon('repeat',30)} 결석생이 생길 때마다 처음부터 반복</div>
  </div>
</div>
<div style="text-align:center;font-size:44px;font-weight:900;margin:14px 0">↓</div>
<div class="card g" style="display:grid;grid-template-columns:150px 1fr;gap:26px;align-items:center;position:relative">
  <div>{happy}</div>
  <div>
    <div class="ct">{icon('video',40)} 바꿔 볼 방식</div>
    <div style="display:grid;grid-template-columns:1fr 44px 1fr 44px 1fr;margin-top:20px;align-items:center">
      <div class="step">그날 수업<br>녹화</div><div class="arrow">→</div>
      <div class="step">결석생에게<br>다시보기 안내</div><div class="arrow">→</div>
      <div class="step">강사는<br>질문만 답하기</div>
    </div>
    <div style="margin-top:16px;font-size:23px;font-weight:700;color:{GREEN};display:flex;align-items:center;gap:10px">{icon('check',30)} 결석생도 그날 판서와 설명을 그대로</div>
  </div>
  {sparkle(1010,-14)}
</div>
<div class="note">보강은 '수업을 다시 하는 일'이 아니라<br><b>'그날 수업을 전하는 일'</b>로 바꿀 수 있습니다.</div>
{FOOT}
""")

# ---------- C. MOFU 1: 3 things when buying a board ----------
owner = person("worry", hair="#3B2A20", shirt="#31302E", w=170, extra=f'<g transform="translate(118,118) rotate(-12)"><circle cx="16" cy="16" r="15" fill="#fff" stroke="{INK}" stroke-width="4"/><path d="M27 27 l14 14" stroke="{INK}" stroke-width="6" stroke-linecap="round"/></g>')
def three(n, ic1, ic2, title, q, warn):
    return f'''<div class="card" style="display:flex;flex-direction:column;gap:14px">
  <div style="display:flex;align-items:center;justify-content:space-between"><div class="num" style="flex-basis:56px;height:56px;font-size:30px">{n}</div><div style="display:flex;gap:8px"><div class="ico">{icon(ic1)}</div><div class="ico">{icon(ic2)}</div></div></div>
  <div style="font-size:34px;font-weight:800;letter-spacing:-.8px">{title}</div>
  <div style="font-size:24px;font-weight:600;line-height:1.4">{q}</div>
  <div style="margin-top:auto;background:{AMBER_BG};border:3px dashed {AMBER};border-radius:16px;padding:12px 14px;font-size:21px;font-weight:600;color:#7A520F;line-height:1.4">{warn}</div>
</div>'''
boxes = "".join(f'<div style="display:flex;align-items:center;gap:10px;font-size:23px;font-weight:700"><span style="width:30px;height:30px;border:3px solid {INK};border-radius:8px;background:#fff;display:inline-block"></span>{t}</div>' for t in ["칠판 본체", "PC(OPS)", "카메라", "마이크", "벽걸이·스탠드", "설치", "소프트웨어", "사용 교육"])
C = page(f"""
<div style="display:grid;grid-template-columns:1fr 430px;align-items:end">
  <div><span class="badge">전자칠판 구매 가이드</span>
  <h1>전자칠판 사실 때<br><em>꼭 고려해야 할 3가지</em></h1>
  <p class="sub">화면 크기와 가격은 마지막에 비교해도<br>늦지 않습니다.</p></div>
  <div style="position:relative;height:330px">
    <div style="position:absolute;right:0;top:-20px">{board(300)}</div>
    <div style="position:absolute;left:0;bottom:-6px">{person("worry", hair="#3B2A20", shirt="#31302E", w=118, extra=f'<g transform="translate(118,118) rotate(-12)"><circle cx="16" cy="16" r="15" fill="#fff" stroke="{INK}" stroke-width="4"/><path d="M27 27 l14 14" stroke="{INK}" stroke-width="6" stroke-linecap="round"/></g>')}</div>
    {sparkle(96,4,28,'#FDE68A')}
  </div>
</div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:40px">
  {three(1,'pc','laptop','PC','수업 프로그램은 칠판 안 PC(OPS)에서 도나요, 노트북을 매번 연결하나요?','노트북 연결형이면 수업마다 연결 시간이 듭니다')}
  {three(2,'camera','mic','녹화','녹화용 카메라·마이크가 견적에 들어 있나요?','빠져 있으면 설치 뒤 따로 사고 연결해야 합니다')}
  {three(3,'wrench','plug','설치','벽걸이·스탠드, 전원·네트워크 위치를 설치 전에 봤나요?','설치 뒤에 바꾸면 재설치 비용이 생길 수 있습니다')}
</div>
<div class="card g" style="margin-top:36px">
  <div class="ct">{icon('magnifier',40)} 견적서에서 이 칸부터 확인하세요</div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px 18px;margin-top:20px">{boxes}</div>
</div>
{FOOT}
""")

# ---------- D. MOFU 2: compare make-up methods ----------
def cell(t, hi=False):
    bg = G50 if hi else "#fff"
    return f'<div style="background:{bg};border:3px solid {INK};border-radius:18px;padding:16px 14px;font-size:23px;font-weight:{800 if hi else 600};text-align:center;line-height:1.35;display:flex;align-items:center;justify-content:center">{t}</div>'
def rowlabel(ic, t):
    return f'<div style="display:flex;align-items:center;gap:10px;font-size:23px;font-weight:800">{icon(ic,34)}{t}</div>'
head = lambda t, hi=False: f'<div style="background:{GREEN if hi else WARM};color:{"#fff" if hi else INK};border:3px solid {INK};border-radius:18px;padding:16px 10px;font-size:25px;font-weight:800;text-align:center;box-shadow:4px 4px 0 {INK}">{t}</div>'
D = page(f"""
<span class="badge">보강 방식 비교</span>
<h1>결석생 보강,<br><em>3가지 방식 비교</em></h1>
<p class="sub">같은 보강이라도 방식에 따라 강사 시간과 학생이 받는 수업이 달라집니다.</p>
<div style="display:grid;grid-template-columns:200px repeat(3,1fr);gap:14px;margin-top:40px;align-items:stretch">
  <div></div>{head('따로 보강 수업')}{head('강사 개별 재설명')}{head('녹화 다시보기', True)}
  {rowlabel('clock','강사 시간')}{cell('교실·시간을 따로 확보')}{cell('결석생마다 반복')}{cell('질문 답변 중심', True)}
  {rowlabel('chat','받는 내용')}{cell('요약된 보강')}{cell('강사·날마다 다름')}{cell('그날 판서·설명 그대로', True)}
  {rowlabel('calendar','일정 맞추기')}{cell('학생·강사 모두 조율')}{cell('강사 일정에 맞춤')}{cell('학생이 편한 시간에', True)}
</div>
<div style="margin-top:40px;font-size:30px;font-weight:800;letter-spacing:-.6px">녹화 보강, 이렇게 시작합니다</div>
<div style="display:grid;grid-template-columns:1fr 40px 1fr 40px 1fr 40px 1fr;margin-top:18px;align-items:center">
  <div class="step">{icon('video',38)}<br>수업 녹화 켜기</div><div class="arrow">→</div>
  <div class="step">{icon('people',38)}<br>다시보기 권한</div><div class="arrow">→</div>
  <div class="step">{icon('phone',38)}<br>결석생 안내</div><div class="arrow">→</div>
  <div class="step">{icon('chat',38)}<br>질문 받기</div>
</div>
<div style="margin-top:28px;display:flex;align-items:center;gap:14px;font-size:22px;font-weight:600;color:#615D59">{icon('warn',34)} 실험·실습이나 1:1 피드백이 필요한 수업은 따로 보강하는 편이 더 맞을 수 있습니다.</div>
{FOOT}
""")

PAGES = {"a-tofu1-teacher-leaves": A, "b-tofu2-absent-makeup": B, "c-mofu1-board-3things": C, "d-mofu2-makeup-compare": D}
for name, html in PAGES.items():
    open(os.path.join(OUT, f"{name}.html"), "w", encoding="utf-8").write(html)
print("\n".join(PAGES))
