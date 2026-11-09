"""Round-2 infographics (same flat-cartoon theme as drafts/infographics/build.py)."""
import os
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "content-hook-lab-2026-11-03", "infographic-source", "build.py")
code = open(SRC, encoding="utf-8").read().split("# ---------- A.")[0]
g = {"__file__": __file__}; exec(code, g); globals().update({k: v for k, v in g.items() if not k.startswith("__")})
OUT = os.path.dirname(os.path.abspath(__file__))
_icon = icon
def icon(name, s=34):
    st = f'stroke="{INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"'
    extra = {
        "folder": f'<path d="M4 10 q0 -3 3 -3 h8 l3 4 h11 q3 0 3 3 v13 q0 3 -3 3 h-22 q-3 0 -3 -3z" fill="{MINT}" {st}/>',
        "lock": f'<rect x="8" y="16" width="20" height="15" rx="3" fill="{GREEN}" {st}/><path d="M12 16 v-4 q6 -9 12 0 v4" fill="none" {st}/><circle cx="18" cy="23" r="2" fill="#fff"/>',
        "usb": f'<rect x="12" y="13" width="12" height="19" rx="3" fill="#fff" {st}/><rect x="14" y="4" width="8" height="9" fill="{AMBER_LINE}" {st}/><path d="M16 8 h1 M19 8 h1" {st}/>',
        "link": f'<path d="M15 21 l6 -6 M13 15 l-4 4 q-4 4 0 8 q4 4 8 0 l4 -4 M23 21 l4 -4 q4 -4 0 -8 q-4 -4 -8 0 l-4 4" fill="none" {st}/>',
        "key": f'<circle cx="12" cy="18" r="7" fill="#FDE68A" {st}/><path d="M19 18 h13 M27 18 v5 M31 18 v4" fill="none" {st}/>',
        "report": f'<rect x="7" y="4" width="22" height="28" rx="3" fill="#fff" {st}/><path d="M12 24 v-5 M18 24 v-9 M24 24 v-7" {st}/><path d="M12 10 h12" {st}/>',
        "list": f'<rect x="6" y="4" width="24" height="28" rx="4" fill="#fff" {st}/><path d="M11 12 l2 2 l4 -4 M11 21 l2 2 l4 -4 M20 12 h6 M20 21 h6" fill="none" {st}/>',
        "shield": f'<path d="M18 3 l12 5 v9 q0 10 -12 16 q-12 -6 -12 -16 v-9z" fill="{MINT}" {st}/><path d="M12 18 l4 4 l8 -9" fill="none" stroke="{INK}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
    }
    if name in extra: return f'<svg width="{s}" height="{s}" viewBox="0 0 36 36">{extra[name]}</svg>'
    return _icon(name, s)
g["icon"] = icon
def item2(ic, title, sub):
    return f'<div class="item"><div class="ico">{icon(ic)}</div><div style="display:flex;flex-direction:column;gap:2px"><span style="font-weight:800">{title}</span><span style="font-size:20px;font-weight:500;color:#615D59">{sub}</span></div></div>'
FOOT = '<div class="foot"><span>ClassIn Korea · 학원 수업 운영 인사이트</span><span>classin.co.kr</span></div>'
ICO = lambda ic, s=40, bg="#fff": f'<div style="flex:0 0 64px;height:64px;border:3px solid {INK};border-radius:18px;background:{bg};display:flex;align-items:center;justify-content:center">{icon(ic,s)}</div>'

# ---------- E. TOFU1: 교안이 나가는 길 ----------
def road(n, ic, title, sub):
    return f'''<div class="card a" style="display:flex;flex-direction:column;gap:12px">
  <div style="display:flex;align-items:center;justify-content:space-between"><div class="num" style="flex-basis:50px;height:50px;font-size:26px">{n}</div>{ICO(ic)}</div>
  <div style="font-size:29px;font-weight:800;letter-spacing:-.6px;line-height:1.25">{title}</div>
  <div style="font-size:22px;font-weight:600;color:#4A4743;line-height:1.4">{sub}</div></div>'''
leaving = person("happy", hair="#5A3A28", shirt="#7FB3A0", w=150, extra=f'<rect x="120" y="150" width="34" height="44" rx="8" fill="#FDE68A" stroke="{INK}" stroke-width="4"/><path d="M128 150 q9 -14 18 0" fill="none" stroke="{INK}" stroke-width="4"/>')
E = page(f"""
<div style="display:grid;grid-template-columns:1fr 200px;align-items:end">
<div><span class="badge">학원 자료 보안</span>
<h1>강사가 그만둘 때,<br><em>교안이 나가는 길 3가지</em></h1>
<p class="sub">자료가 학원이 관리할 수 없는 곳에 있으면, 강사와 함께 학원 밖으로 나갈 수 있습니다.</p></div>
<div style="position:relative">{leaving}{sparkle(130,0,28,'#FDE68A')}</div></div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:38px">
  {road(1,'usb','강사 개인<br>노트북·USB','학원 자료를 개인 기기에서 만들고 저장')}
  {road(2,'chat','카톡·메신저로<br>오간 자료','보낸 파일은 학원이 거둘 방법이 없음')}
  {road(3,'link','그대로 남은<br>계정·공유 링크','그만둔 뒤에도 자료가 계속 열림')}
</div>
<div style="text-align:center;font-size:44px;font-weight:900;margin:16px 0 8px">↓</div>
<div class="card g">
  <div class="ct">{icon('cloudlock',44)} 바꿀 구조: 교안은 학원에, 강사에게는 권한만</div>
  <div style="display:grid;grid-template-columns:1fr 44px 1fr 44px 1fr;margin-top:22px;align-items:center">
    <div class="step">{icon('folder',40)}<br>교안은 학원<br>공유 드라이브에</div><div class="arrow">→</div>
    <div class="step">{icon('key',40)}<br>강사에게는<br>담당 반 권한만</div><div class="arrow">→</div>
    <div class="step">{icon('lock',40)}<br>그만두는 날<br>권한만 거두기</div>
  </div>
</div>
<div class="note">계약서는 문제가 생긴 뒤의 도구입니다.<br>그 전에 <b>자료를 어디에 두고, 누구에게 어떤 권한을 줄지</b>부터 정하세요.</div>
<div style="margin-top:20px;display:flex;align-items:center;gap:12px;font-size:21px;font-weight:600;color:#615D59">{icon('warn',30)} 권한 설정으로 화면 촬영이나 이미 내려받은 파일까지 막을 수는 없습니다. 규정·계약과 함께 운영하세요.</div>
{FOOT}
""")

# ---------- F. TOFU2: 묻기 전에 먼저 ----------
parent = person("worry", hair="#2E2A26", shirt="#C9A46A", w=140)
owner = person("happy", hair="#3B2A20", shirt=GREEN, w=140, extra=f'<rect x="116" y="140" width="40" height="30" rx="5" fill="#fff" stroke="{INK}" stroke-width="4"/><path d="M128 151 l9 5 l-9 5z" fill="{GREEN}"/>')
def send(when, ic, title, sub):
    return f'''<div class="card" style="display:grid;grid-template-columns:150px 64px 1fr;gap:20px;align-items:center;padding:22px 28px">
  <div style="background:{GREEN};color:#fff;border:3px solid {INK};border-radius:999px;padding:10px 0;text-align:center;font-size:23px;font-weight:800">{when}</div>{ICO(ic)}
  <div><div style="font-size:28px;font-weight:800;letter-spacing:-.6px">{title}</div><div style="font-size:21px;font-weight:600;color:#4A4743;margin-top:4px;line-height:1.4">{sub}</div></div></div>'''
F = page(f"""
<span class="badge">학부모 상담</span>
<h1>학부모가 묻기 전에,<br><em>먼저 보내면 안심합니다</em></h1>
<div style="display:grid;grid-template-columns:140px 1fr 140px;gap:20px;align-items:center;margin-top:34px">
  <div>{parent}</div>
  <div style="display:flex;flex-direction:column;gap:14px">
    <div class="card a" style="padding:16px 22px;font-size:24px;font-weight:700;border-radius:22px">"우리 애 오늘 수업 어땠어요?"</div>
    <div class="card g" style="padding:16px 22px;font-size:24px;font-weight:700;border-radius:22px;text-align:right">"학부모님, 오늘 수업 기록 먼저 보내드려요"</div>
  </div>
  <div>{owner}</div>
</div>
<div style="font-size:32px;font-weight:800;letter-spacing:-.6px;margin:40px 0 18px">묻기 전에 먼저 보낼 3가지</div>
<div style="display:flex;flex-direction:column;gap:16px">
  {send('결석한 날','video','그날 수업 다시보기 안내','봤는지, 보강 과제를 냈는지까지 확인')}
  {send('매달 말','report','학생별 리포트','성적 화면 링크를 열어 PDF로 저장해 전달')}
  {send('상담 전','list','숙제·시험·수업 기록','숫자 대신 학부모가 알아듣는 말로 정리')}
</div>
<div class="note">먼저 말하려면 먼저 알아야 합니다.<br>관리자 화면에서 <b>빠진 수업 기록을 학부모보다 먼저</b> 찾으세요.</div>
{FOOT}
""")

# ---------- G. MOFU1: 권한 설정 4단계 ----------
def stepc(n, ic, title, path, sub):
    return f'''<div class="card" style="display:grid;grid-template-columns:58px 64px 1fr;gap:18px;align-items:center;padding:22px 26px">
  <div class="num" style="flex-basis:56px;width:56px;height:56px;font-size:28px">{n}</div>{ICO(ic)}
  <div><div style="font-size:28px;font-weight:800;letter-spacing:-.6px">{title}</div>
  <div style="display:inline-block;margin-top:6px;background:{G50};border:2px solid {GREEN};border-radius:10px;padding:3px 10px;font-size:19px;font-weight:700;color:{GREEN}">{path}</div>
  <div style="font-size:21px;font-weight:600;color:#4A4743;margin-top:6px;line-height:1.4">{sub}</div></div></div>'''
roles = "".join(f'<div style="display:flex;align-items:center;gap:8px;background:#fff;border:3px solid {INK};border-radius:999px;padding:8px 16px;font-size:20px;font-weight:700">{icon(i,24)}{t}</div>' for i,t in [("key","관리자"),("folder","컨텐츠 관리자"),("book","읽기 전용"),("lock","감추기")])
G = page(f"""
<div style="display:grid;grid-template-columns:1fr 300px;align-items:end">
<div><span class="badge">권한 설정 가이드</span>
<h1>교안·녹화본 유출 줄이는<br><em>권한 설정 4단계</em></h1></div>
<div style="position:relative;height:230px"><div style="position:absolute;right:20px;bottom:0">{person("happy", hair="#3B2A20", shirt="#31302E", w=170, extra=f'<g transform="translate(108,128)"><rect x="0" y="10" width="44" height="34" rx="6" fill="{GREEN}" stroke="{INK}" stroke-width="4"/><path d="M10 10 v-8 q12 -16 24 0 v8" fill="none" stroke="{INK}" stroke-width="4"/><circle cx="22" cy="27" r="4" fill="#fff"/></g>')}</div><div style="position:absolute;left:10px;top:20px">{ICO('folder',44,MINT)}</div><div style="position:absolute;left:60px;top:120px">{ICO('shield',44)}</div>{sparkle(250,0,30,'#FDE68A')}</div>
</div>
<div style="display:flex;flex-direction:column;gap:16px;margin-top:30px">
  {stepc(1,'folder','자료를 공유 드라이브에 모으기','[스토리지] > [공유 드라이브]','과목·학년·레벨별 폴더, 판서는 EDB 교안으로')}
  {stepc(2,'people','폴더마다 볼 사람 정하기','폴더 구성원 권한','아래 4가지 중 하나로 나누고 학기마다 다시 보기')}
  {stepc(3,'key','교사 권한은 담당 반만큼','[기관 관리] > [교사] > [교사 추가]','코스를 직접 만들 교사에게만 하위 계정 권한 추가')}
  {stepc(4,'lock','관리자 권한은 원장과 소수에게','[일반 설정]은 학원 전체에 적용','관리자 권한을 받는 사람을 최소로')}
</div>
<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:18px;align-items:center"><span style="font-size:21px;font-weight:800">공유 드라이브 권한</span>{roles}</div>
<div class="card a" style="margin-top:26px">
  <div class="ct">{icon('leave',40)} 강사가 그만두는 날</div>
  <div style="display:grid;grid-template-columns:1fr 36px 1fr 36px 1fr 36px 1fr;margin-top:18px;align-items:center">
    <div class="step" style="font-size:20px">하위 계정<br>권한 먼저 삭제</div><div class="arrow">→</div>
    <div class="step" style="font-size:20px">담임 교사<br>[코스 관리]에서 변경</div><div class="arrow">→</div>
    <div class="step" style="font-size:20px">공유 드라이브<br>구성원에서 제외</div><div class="arrow">→</div>
    <div class="step" style="font-size:20px">담당 수업<br>일정 정리</div>
  </div>
</div>
<div style="margin-top:20px;display:flex;align-items:center;gap:12px;font-size:21px;font-weight:600;color:#615D59">{icon('video',30)} 녹화는 교사 계정만 켤 수 있고, 녹화본에는 워터마크가 들어갑니다.</div>
{FOOT}
""")

# ---------- H. MOFU2: 수업 누수 없는 5가지 ----------
checker = person("happy", hair="#3B2A20", shirt="#31302E", w=150, extra=f'<g transform="translate(112,128)"><rect x="0" y="0" width="38" height="48" rx="5" fill="#fff" stroke="{INK}" stroke-width="4"/><path d="M8 14 l4 4 l8 -8 M8 32 l4 4 l8 -8" stroke="{GREEN}" stroke-width="4" fill="none" stroke-linecap="round"/></g>')
def chk(n, phase, ic, title, sub):
    return f'''<div class="card" style="display:grid;grid-template-columns:56px 100px 64px 1fr;gap:16px;align-items:center;padding:20px 26px">
  <div class="num" style="width:52px;height:52px;font-size:26px">{n}</div>
  <div style="background:{WARM};border:3px solid {INK};border-radius:999px;padding:6px 0;text-align:center;font-size:20px;font-weight:800">{phase}</div>{ICO(ic)}
  <div><div style="font-size:27px;font-weight:800;letter-spacing:-.6px">{title}</div><div style="font-size:21px;font-weight:600;color:#4A4743;margin-top:4px;line-height:1.4">{sub}</div></div></div>'''
H = page(f"""
<div style="display:grid;grid-template-columns:1fr 170px;align-items:end">
<div><span class="badge">원장 주간 점검</span>
<h1>수업 누수 없는 학원을 위한<br><em>5가지</em></h1>
<p class="sub">매주 같은 요일, 같은 순서로 보면 빠진 것을 학부모보다 먼저 찾습니다.</p></div>
<div style="position:relative">{checker}{sparkle(120,-6,28)}</div></div>
<div style="display:flex;flex-direction:column;gap:14px;margin-top:34px">
  {chk(1,'수업 전','calendar','이번 주 수업이 모두 열려 있나요?','수업 개설, 학생 배정, 자료·EDB 업로드')}
  {chk(2,'수업 전','key','계정과 권한에 문제가 없나요?','새 학생, 반 이동, 그만둔 강사 권한')}
  {chk(3,'수업 후','video','녹화와 다시보기가 끝까지 남았나요?','녹화·자료 업로드, 다시보기, 필기 저장')}
  {chk(4,'수업 후','list','숙제·시험이 마감까지 이어졌나요?','마감 일정, 제출·결과·피드백 기록')}
  {chk(5,'수업 후','people','결석생이 따라왔나요?','다시보기 시청, 보강 과제 제출')}
</div>
<div class="card g" style="margin-top:24px;display:flex;gap:20px;align-items:center">{ICO('report',40)}<div><div style="font-size:26px;font-weight:800">월말에는 통계 파일로 한 번 더</div><div style="font-size:21px;font-weight:600;color:#4A4743;margin-top:4px">수업일자·수업 시간·담당 교사·출석 인원을 반별로 비교</div></div></div>
<div class="note">강사를 평가하려는 것이 아니라 <b>빠진 것을 찾는 점검</b>입니다.<br>강사에게도 같은 기준을 미리 공유하세요.</div>
{FOOT}
""")

PAGES = {"e-tofu1-materials-leave": E, "f-tofu2-before-they-ask": F, "g-mofu1-permission-4steps": G, "h-mofu2-leak-free-5": H}
for name, html in PAGES.items():
    open(os.path.join(OUT, f"{name}.html"), "w", encoding="utf-8").write(html)
print(" ".join(PAGES))
