"""우리 학원 운영 유형 테스트 — 퀴즈·진단형(10문항 → 4유형). 레퍼런스: Salesforce '리드 마그넷 유형: 퀴즈·진단'.
유형은 운영 병목을 고르는 재미용 진단이며 평가·등급이 아니다. 결과마다 다음 자료 하나로 잇는다.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from build import e, utm  # noqa: E402

SLUG = "academy-operation-type-test"


def nx(label, path, key):
    return f'<a href="{e(utm(path, SLUG, "result_" + key))}" target="_blank" rel="noopener">{e(label)} →</a>'


def ul(*xs):
    return "<ul>" + "".join(f"<li>{x}</li>" for x in xs) + "</ul>"


TYPES = [
    dict(key="A", plain="에이스 중심형", name="에이스<br>중심형", color="#FF7A59", one="“그 선생님 반이라서 보내요”",
         desc="잘 가르치는 강사 한두 명이 학원을 끌고 갑니다. 수업 품질은 높지만, 그 품질이 사람에게 모여 있습니다.",
         strength="학부모가 강사를 믿고, 입소문이 강합니다. 이미 ‘잘 되는 수업’의 모범이 학원 안에 있습니다.",
         risk="에이스가 쉬거나 떠나면 반 전체가 흔들립니다. 판서·자료·노하우가 개인 파일에만 있습니다.",
         todo=ul("에이스의 대표 수업 한 편을 판서·자료째 정리해 공유 폴더에 둡니다", "다른 강사가 그 수업을 한 번 참관하고, 같은 순서로 한 번 해 봅니다", "상담 멘트를 ‘그 선생님’이 아니라 ‘우리 학원 수업 방식’으로 바꿉니다"),
         next=nx("강사 온보딩·교안 표준화 SOP", "/resources/teacher-edb-onboarding-sop-kit", "A"),
         link=nx("교안 표준화 SOP", "/resources/teacher-edb-onboarding-sop-kit", "A_card")),
    dict(key="B", plain="도구 탐색형", name="도구<br>탐색형", color="#5B8CFF", one="“그 링크 어디 있었죠?”",
         desc="칠판, 화상 수업, 숙제 앱, 단톡방을 두루 써 봤습니다. 도구는 많은데 기록은 흩어져 있습니다.",
         strength="새 도구를 시도하는 데 거부감이 없고, 필요한 기능은 이미 대부분 갖추고 있습니다.",
         risk="링크 공유·업로드·안내 문자에 실장과 강사의 손이 계속 들어갑니다. 상담 때 근거를 모으기 어렵습니다.",
         todo=ul("지금 쓰는 도구를 한 장에 적고, 도구마다 사람 손이 드는 일을 표시합니다", "학부모에게 보내는 링크를 한 곳으로 모읍니다", "한 반만 골라 수업·숙제·기록을 한 흐름으로 돌려 봅니다"),
         next=nx("수업 운영 누수 진단표", "/resources/academy-system-checklist", "B"),
         link=nx("운영 누수 진단표", "/resources/academy-system-checklist", "B_card")),
    dict(key="C", plain="밀착 관리형", name="밀착<br>관리형", color="#F2B600", one="“이번 주말도 보강이에요”",
         desc="결석생 보강과 질문 응대까지 끝까지 챙깁니다. 그만큼 수업 밖 일이 강사 시간을 잡아먹습니다.",
         strength="학생 한 명 한 명을 놓치지 않습니다. 학부모가 ‘꼼꼼한 학원’으로 기억합니다.",
         risk="보강이 늘수록 강사의 주말과 다음 수업 준비 시간이 줄어듭니다. 지친 강사가 먼저 떠납니다.",
         todo=ul("지난 4주 보강 횟수와 걸린 시간을 적어 봅니다", "보강 기준을 정해, 질문이 남은 학생만 대면으로 봅니다", "한 반 수업을 녹화해 결석생에게 다시보기를 먼저 배정합니다"),
         next=nx("녹화→복습 배포 5단계 가이드", "/resources/classroom-recording-replay-setup-guide", "C"),
         link=nx("녹화→복습 가이드", "/resources/classroom-recording-replay-setup-guide", "C_card")),
    dict(key="D", plain="확장 준비형", name="확장<br>준비형", color="#2DD4A0", one="“대기 명단이 길어요”",
         desc="교실은 꽉 찼고, 더 받고 싶은 학생이 있습니다. 넓히려면 공간과 사람이 먼저 걸립니다.",
         strength="수요가 확인된 수업이 있습니다. 확장의 근거를 이미 갖고 있습니다.",
         risk="교실과 강사를 늘리는 방식만으로는 속도가 느리고 고정비가 커집니다.",
         todo=ul("대기 학생 수와 거리 때문에 놓친 문의를 한 달 동안 셉니다", "인기 반 하나를 골라 온라인 자리를 몇 개 붙일지 정합니다", "교실 증설과 온라인 한 칸의 비용·시간을 나란히 적어 봅니다"),
         next=nx("온라인, 지금 열어도 될까요? 3분 판단표", "/resources/online-class-timing-check", "D"),
         link=nx("온라인 3분 판단표", "/resources/online-class-timing-check", "D_card")),
]

Q = [
    ("강사 한 명이 갑자기 <em>2주</em> 쉰다면,<br>가장 먼저 드는 걱정은?",
     [("밀린 진도를 보강으로 메울 일정", "C"), ("그 반 학부모들이 흔들릴 것 같다", "A"), ("대신 들어갈 강사가 없어 반을 못 연다", "D"), ("수업 자료가 어디 있는지부터 찾아야 한다", "B")]),
    ("지난주 실장님 시간을<br>가장 많이 쓴 일은?",
     [("링크·자료 업로드와 안내 문자", "B"), ("결석생 보강 일정 잡기", "C"), ("특정 강사 반 상담·문의 응대", "A"), ("대기 학생 상담과 반 편성", "D")]),
    ("학부모가 가장 <em>자주</em> 묻는 말은?",
     [("“자리 나면 연락 주실 수 있나요?”", "D"), ("“그 선생님 수업 계속 들을 수 있나요?”", "A"), ("“빠진 수업은 어떻게 하나요?”", "C"), ("“숙제는 어디서 확인하나요?”", "B")]),
    ("새 강사를 들일 때<br>가장 <em>걱정되는</em> 것은?",
     [("보강·클리닉까지 맡길 수 있을까", "C"), ("에이스만큼 가르칠 수 있을까", "A"), ("새 반을 맡길 만큼 빨리 자리 잡을까", "D"), ("쓰는 도구를 다 익힐 수 있을까", "B")]),
    ("수업 <em>녹화</em>는<br>지금 어떻게 하나요?",
     [("찍긴 하는데 파일이 여기저기 흩어져 있다", "B"), ("결석생이 생길 때만 급하게 찍는다", "C"), ("거의 안 한다. 교실 수업이 전부다", "D"), ("잘하는 강사 몇 명만 개인적으로 찍는다", "A")]),
    ("올해 가장 <em>아쉬웠던</em> 순간은?",
     [("상담 오신 분을 자리가 없어 돌려보낸 때", "D"), ("잘하던 강사가 그만둔 때", "A"), ("도구를 바꾸느라 한 달이 날아간 때", "B"), ("시험 기간 보강이 몰린 때", "C")]),
    ("원장님 하루에서<br>가장 <em>부족한</em> 시간은?",
     [("수업 준비 시간", "C"), ("데이터를 한곳에서 보는 시간", "B"), ("강사 관리와 면담 시간", "A"), ("새 반·새 지점을 구상할 시간", "D")]),
    ("학부모 상담에서<br>꺼내는 <em>근거</em>는?",
     [("담당 강사의 말과 인상", "A"), ("성적표와 대기 현황", "D"), ("보강·출결 기록", "C"), ("여러 앱에서 모은 캡처", "B")]),
    ("온라인 수업에 대한<br>지금 생각은?",
     [("보강용으로만 쓰면 좋겠다", "C"), ("교실 밖 학생까지 받으려면 필요하다", "D"), ("이미 쓰는 도구가 많아 하나 더는 부담", "B"), ("에이스 수업만 온라인으로 열어 볼까", "A")]),
    ("내년 이맘때<br>가장 <em>바라는</em> 모습은?",
     [("도구 하나로 정리된 운영", "B"), ("누가 가르쳐도 같은 수업 품질", "A"), ("정원을 늘린 수업", "D"), ("보강 없는 주말", "C")]),
]

BLOBS = ('<div class="deco blob" style="right:120px;top:140px;width:360px;height:360px;background:#FF7A59;display:grid;place-items:center;font:400 120px/1 Anton;color:#141414">A</div>'
         '<div class="deco blob" style="right:420px;top:420px;width:260px;height:260px;background:#5B8CFF;border-radius:50%;display:grid;place-items:center;font:400 96px/1 Anton;color:#141414">B</div>'
         '<div class="deco blob" style="right:90px;top:560px;width:330px;height:300px;background:#FFD43B;border-radius:60% 40% 30% 70%/60% 30% 70% 40%;display:grid;place-items:center;font:400 110px/1 Anton;color:#141414">C</div>'
         '<div class="deco blob" style="right:520px;top:150px;width:150px;height:150px;background:#2DD4A0;border-radius:28px;transform:rotate(18deg);display:grid;place-items:center;font:400 72px/1 Anton;color:#141414">D</div>'
         '<svg class="deco" style="right:200px;top:330px;width:120px;height:120px" viewBox="0 0 120 120" aria-hidden="true"><path d="M60 8 L72 48 L112 60 L72 72 L60 112 L48 72 L8 60 L48 48 Z" fill="#141414"/></svg>')
MINI = ('<div class="deco blob" style="right:-170px;top:380px;width:300px;height:300px;background:{c};opacity:.9"></div>')
COLS = ["#FF7A59", "#5B8CFF", "#FFD43B", "#2DD4A0"]

slides = [
    dict(L="cover", tag="ClassIn 3분 진단 테스트", size=150,
         title="우리 학원은<br><em>어떤 유형</em>일까?",
         sub="10문항, 3분. 운영 습관으로 알아보는 우리 학원 유형 네 가지와, 유형별로 먼저 손볼 한 가지.",
         meta=[("형식", "퀴즈·진단 · 10문항"), ("소요", "3분"), ("결과", "4가지 유형 + 다음 자료 추천")],
         deco=BLOBS),
    dict(L="steps", kicker="HOW TO PLAY", size=88, title="정답은 없습니다. <em>지금 모습</em>대로 고르세요", last_hl=True,
         lead="고른 답은 이 브라우저에만 저장됩니다. 다시 하려면 아래 ↺ 버튼을 누르세요.",
         items=[("10문항, 하나씩", "문항마다 가장 가까운 보기 하나를 고릅니다. 고르면 다음 장으로 넘어갑니다."),
                ("결과는 바로", "마지막 장에서 우리 학원 유형과 네 유형의 비율이 함께 나옵니다."),
                ("다음 한 걸음", "유형마다 먼저 손볼 한 가지와 맞는 자료를 추천합니다.")]),
]
for i, (q, opts) in enumerate(Q):
    slides.append(dict(L="quiz_q", id=f"q{i + 1}", n=i + 1, q=q, options=opts, deco=MINI.format(c=COLS[i % 4])))
slides += [
    dict(L="quiz_result"),
    dict(L="quiz_types", kicker="4 TYPES", title="네 가지 유형, 한눈에"),
    dict(L="cta", pri_k="결과를 들고 오시면", title="유형을 알았다면,<br><em>한 반</em>부터 바꿔 봅니다",
         sub="결과를 복사해 상담에 가져오시면 우리 학원 유형에 맞춰 첫 파일럿 범위를 함께 정합니다.",
         acts=[("01", "결과와 함께 오시면 유형에 맞춘 상담으로 시작합니다", "결과로 상담", "/contact#contact-form", "cta_contact"),
               ("02", "가져온 교안으로 30분 동안 직접 수업해 보는 쇼룸", "쇼룸 예약", "/showroom", "cta_showroom"),
               ("03", "다른 학원 원장님들이 설명회에서 고른 고민 네 가지", "설명회 요약집", "/materials/lead-magnets/insight/academy-briefing-summary.html", "cta_summary")],
         honest="재미로 보는 진단입니다. 유형은 평가나 등급이 아니며, 학원은 대개 두세 유형이 섞여 있습니다."),
    dict(L="back", about="ClassIn은 전자칠판 판서, 수업 녹화, 교안, 숙제·시험, 운영 데이터를 한 흐름으로 묶는 학원 수업 운영 시스템입니다. 서울 목동 쇼룸에서 우리 학원 수업으로 직접 확인할 수 있습니다."),
]

DECK = dict(
    slug=SLUG,
    theme="play",
    title="우리 학원 운영 유형 테스트",
    series="3분 진단 테스트",
    short="우리 학원 운영 유형 테스트",
    stage="TOFU",
    format="퀴즈·진단",
    desc="10문항, 3분. 운영 습관으로 알아보는 우리 학원 유형(에이스 중심형·도구 탐색형·밀착 관리형·확장 준비형)과 유형별로 먼저 손볼 한 가지.",
    quiz=dict(n=len(Q), types=TYPES),
    slides=slides,
)
