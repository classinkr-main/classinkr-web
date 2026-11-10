"""2027 학원 운영 계획 템플릿 — 템플릿·도구형(입력 → 한 장 요약 자동 생성 → 복사). 레퍼런스: 노션·워크북 템플릿.
입력값은 브라우저에만 저장. 숫자 목표는 학원 기록으로 채우게 두고, 예시에 실적·보장 숫자를 넣지 않는다.
"""

PAPER = ('<svg class="deco" style="right:200px;top:150px;width:720px;height:800px" viewBox="0 0 720 800" aria-hidden="true">'
         '<rect x="120" y="70" width="520" height="680" rx="22" fill="#111" transform="rotate(6 380 410)"/>'
         '<rect x="80" y="40" width="520" height="680" rx="22" fill="#fff" stroke="#111" stroke-width="4"/>'
         '<rect x="80" y="40" width="520" height="96" rx="22" fill="#C6F36B" stroke="#111" stroke-width="4"/>'
         '<text x="120" y="102" font-family="Archivo" font-weight="800" font-size="40" fill="#111">2027 PLAN</text>'
         + "".join(f'<rect x="120" y="{180 + i * 92}" width="44" height="44" rx="10" fill="{"#0B7A52" if i < 3 else "none"}" stroke="#111" stroke-width="3"/>'
                   f'<rect x="186" y="{190 + i * 92}" width="{300 - (i % 3) * 60}" height="12" rx="6" fill="#111"/>'
                   f'<rect x="186" y="{212 + i * 92}" width="{220 - (i % 2) * 70}" height="10" rx="5" fill="rgba(17,17,17,.25)"/>' for i in range(6))
         + '<path d="M131 202 l9 9 l17 -19" stroke="#fff" stroke-width="5" fill="none"/><path d="M131 294 l9 9 l17 -19" stroke="#fff" stroke-width="5" fill="none"/><path d="M131 386 l9 9 l17 -19" stroke="#fff" stroke-width="5" fill="none"/>'
         '<circle cx="600" cy="660" r="70" fill="#C6F36B" stroke="#111" stroke-width="4"/><text x="600" y="676" text-anchor="middle" font-family="Archivo" font-weight="800" font-size="44" fill="#111">8칸</text></svg>')

TABS = 8


def tab(i):
    return dict(tabs=TABS, tab=i)


DECK = dict(
    slug="academy-2027-operation-planner",
    theme="planner",
    title="2027 학원 운영 계획 템플릿",
    series="운영 계획 템플릿",
    short="2027 학원 운영 계획 템플릿",
    stage="MOFU",
    format="템플릿·도구",
    desc="8칸을 채우면 2027년 운영 계획 한 장 요약이 자동으로 만들어지는 템플릿. 돌아보기·목표·반과 강사·결석/보강 정책·학부모 소통 캘린더·디지털 전환·리스크.",
    slides=[
        dict(L="cover", tag="ClassIn 운영 계획 템플릿 · 2027", size=170,
             title="2027년,<br><em>한 장</em>으로<br>계획합니다",
             sub="여덟 칸을 채우면 마지막 장에 운영 계획 한 장 요약이 자동으로 만들어집니다. 복사해서 실장·강사와 바로 공유하세요.",
             meta=[("형식", "입력형 템플릿 · 8칸"), ("소요", "약 40분"), ("결과", "한 장 요약 · 복사·인쇄")],
             deco=PAPER),
        dict(L="steps", kicker="HOW TO USE", size=88, title="쓰는 법은 <em>세 가지</em>", last_hl=True,
             lead="입력한 내용은 이 브라우저에만 저장되고 어디에도 전송되지 않습니다. 인쇄하면 빈 양식으로 손으로도 씁니다.",
             items=[("순서대로 채우기", "01 돌아보기부터 07 리스크까지 차례로 채웁니다. 모르는 칸은 비워 두고 넘어가도 됩니다."),
                    ("한 장 요약 확인", "08장에 입력한 내용이 자동으로 모입니다. 빈 칸은 ‘아직 비어 있습니다’로 표시됩니다."),
                    ("복사해서 공유", "‘한 장 요약 복사’를 눌러 메신저·메일에 붙여 넣고, 1월 첫 회의 안건으로 씁니다.")]),
        dict(L="stats", label="계획 전에 볼 숫자 세 개", title="2027년 계획은 <em>이 숫자들</em> 위에서 세웁니다",
             items=[("−3.4<small>%</small>", "유·초·중등 학생 수<br>1년 새 감소(2026)", "교육부·KEDI 2026 교육기본통계", False),
                    ("60.4<small>만 원</small>", "사교육 참여학생<br>1인당 월평균, 역대 최고", "국가데이터처·교육부 2025 사교육비조사", True),
                    ("2027 고3", "2028 대입 개편<br>첫 적용 학년(현 고2)", "통합형 수능·내신 5등급 · 교육부 확정안", False)],
             source="숫자 해설은 ‘2027 학원 운영 리포트’에 있습니다."),
        dict(L="form", no="01", kicker="돌아보기", title="2026년, 무엇이 잘 됐고 무엇이 아쉬웠나", cols=2,
             fields=[dict(id="good1", label="잘 된 것 ①", ph="예: 중2 수학반 재등록 문의가 늘었다"),
                     dict(id="bad1", label="아쉬운 것 ①", ph="예: 시험 기간 보강이 몰려 강사 두 명이 지쳤다"),
                     dict(id="good2", label="잘 된 것 ②", ph="예: 여름 특강 정원이 찼다"),
                     dict(id="bad2", label="아쉬운 것 ②", ph="예: 학부모 안내가 단톡방·문자로 흩어졌다"),
                     dict(id="good3", label="잘 된 것 ③", ph="예: 새 강사가 두 달 만에 자리 잡았다"),
                     dict(id="bad3", label="아쉬운 것 ③", ph="예: 거리 때문에 못 온 문의를 놓쳤다"),
                     dict(id="time", label="원장 시간을 가장 많이 쓴 일", type="chips", options=["보강 일정", "학부모 상담", "자료 준비", "강사 채용", "홍보", "행정"]),
                     dict(id="retro_one", label="한 줄 회고", ph="예: 수업은 좋았는데, 수업 밖 일에 너무 많이 썼다")],
             **tab(0)),
        dict(L="form", no="02", kicker="목표", title="2027년 목표는 <em>세 개</em>까지만", cols=1,
             lead="목표가 셋을 넘으면 아무것도 끝나지 않습니다. 숫자는 우리 학원 기록으로 채우세요.",
             fields=[dict(id="g1", label="목표 1", ph="예: 재등록 상담을 기록 근거로 진행하기"),
                     dict(id="g2", label="목표 2", ph="예: 고2 대상 2028 체제 설명회 열기"),
                     dict(id="g3", label="목표 3", ph="예: 한 반 녹화·복습 파일럿 시작"),
                     dict(id="gm", label="무엇을 보면 됐다고 할까요?", type="area", ph="예: 분기마다 재등록 상담 기록 수, 보강 횟수, 설명회 참석자 수를 본다")],
             **tab(1)),
        dict(L="table_form", no="03", kicker="반·강사", title="반과 강사, 내년에 <em>바꿀 점</em>", id="cls", rows=6,
             cols=["반", "과목·학년", "담당 강사", "정원", "2027년 바꿀 점"], **tab(2),
             ph=["A반", "수학 · 중2", "김○○", "12", "녹화·복습 파일럿 반으로"]),
        dict(L="form", no="04", kicker="정책", title="결석·보강·복습, <em>원칙</em>을 먼저 정합니다", cols=2,
             lead="원칙이 없으면 보강은 요청이 오는 대로 늘어납니다. 학원 전체가 같은 원칙으로 안내하세요.",
             fields=[dict(id="absent", label="결석하면", type="chips", options=["수업 다시보기 배정", "개별 보강", "클리닉 참여", "자료만 전달"]),
                     dict(id="review", label="복습은", type="chips", options=["수업 녹화 공유", "오답 노트", "주간 과제", "따로 없음"]),
                     dict(id="share", label="학부모 공유 주기", type="chips", options=["매주", "2주마다", "매월", "시험 뒤"]),
                     dict(id="exc", label="예외 원칙", type="area", ph="예: 시험 2주 전에는 질문 클리닉만 대면으로 연다")],
             **tab(3)),
        dict(L="months", no="05", kicker="학부모 소통 캘린더", title="열두 달, 학부모와 <em>언제</em> 이야기할까",
             lead="달마다 한 줄씩. 비어 있는 달이 학부모가 학원 소식을 못 듣는 달입니다.", **tab(4),
             ph={1: "예비 중1·고1 반 시작", 2: "새 학기 반 편성 안내", 3: "첫 4주 근황", 4: "중간고사 대비", 5: "시험 결과 상담", 6: "기말고사 대비·여름 특강 안내",
                 7: "기말 결과·방학 계획", 8: "2학기 반 편성", 9: "수시 원서 시즌 안내", 10: "중간고사 대비·중3 고입 상담", 11: "겨울방학 특강 안내", 12: "재등록·내년 계획"}),
        dict(L="form", no="06", kicker="디지털 전환", title="무엇을, 어느 반부터, <em>언제</em>", cols=2,
             lead="처음부터 전체를 바꾸지 않습니다. 보통 3~4개월, 기관이 넓으면 6개월~1년을 봅니다.",
             fields=[dict(id="dx", label="시작할 것", type="chips", options=["수업 녹화·다시보기", "교안 표준화", "온라인 숙제·시험", "하이브리드 반", "운영 기록 한곳에"]),
                     dict(id="pilot", label="파일럿 반", ph="예: 중2 수학 A반"),
                     dict(id="when", label="시작 시기·담당", ph="예: 3월 첫 주 · 김○○ 실장"),
                     dict(id="judge", label="계속할지 판단할 기준", type="area", ph="예: 4주 동안 다시보기 배정이 매주 돌았는가, 강사가 혼자 녹화를 켤 수 있는가")],
             **tab(5)),
        dict(L="form", no="07", kicker="리스크", title="막히면 <em>이렇게</em> 합니다", cols=2,
             lead="일어나면 그때 정하는 것이 아니라, 미리 한 줄씩 적어 둡니다.",
             fields=[dict(id="r1", label="강사가 갑자기 비면", type="area", ph="예: 같은 과목 교안으로 대체 강사가 수업, 학부모에게 당일 안내"),
                     dict(id="r2", label="문을 닫아야 하면", type="area", ph="예: 같은 시간 원격 수업으로 전환, 숙제는 같은 반에 게시"),
                     dict(id="r3", label="학생 수가 줄면", type="area", ph="예: 반 통합 기준과 하이브리드 반 검토 시점"),
                     dict(id="r4", label="입시 제도 질문이 몰리면", type="area", ph="예: 학년별 안내문 두 벌, 겨울방학 전 설명회")],
             **tab(6)),
        dict(L="summary", kicker="08 · 한 장 요약 (자동)", title="2027 운영 계획서", cols=4,
             header=[("org", "학원명", "예: ○○수학학원"), ("who", "작성", "예: 원장 ○○○ · 12월")],
             cells=[("한 줄 회고", "retro_one,chips:time", "01장 한 줄 회고"),
                    ("2027 목표", "g1@①,g2@②,g3@③,gm@기준:", "02장 목표 세 개"),
                    ("반·강사에서 바꿀 점", "clsr0c4@①,clsr1c4@②,clsr2c4@③,clsr3c4@④", "03장 반·강사 표"),
                    ("결석·보강·복습 원칙", "chips:absent,chips:review,chips:share", "04장 원칙"),
                    ("학부모 소통 캘린더", "m1@1월,m2@2월,m3@3월,m4@4월,m5@5월,m6@6월,m7@7월,m8@8월,m9@9월,m10@10월,m11@11월,m12@12월", "05장 열두 달", {"wide": True, "sep": " · "}),
                    ("디지털 전환", "chips:dx,pilot,when,judge", "06장 시작할 것·파일럿 반"),
                    ("리스크 대비", "r1,r2,r3,r4", "07장 대비책")]),
        dict(L="cta", dark=True, title="계획을 들고 오시면,<br><em>첫 90일</em>을 같이 짭니다",
             sub="한 장 요약을 복사해 상담에 붙여 주세요. 파일럿 반과 시작 시기에 맞춰 첫 90일 일정을 함께 정합니다.",
             pri_k="계획서를 들고 오시면",
             acts=[("01", "한 장 요약을 붙여 넣고 파일럿 반과 첫 90일을 함께 정합니다", "계획으로 상담", "/contact#contact-form", "cta_contact"),
                   ("02", "파일럿 첫 90일을 주차별로 나눈 로드맵", "90일 로드맵", "/resources/classin-90-day-adoption-roadmap", "cta_roadmap"),
                   ("03", "계획 속 숫자의 배경, 2027 학원 운영 리포트", "리포트 보기", "/materials/lead-magnets/insight/academy-operations-report-2027.html", "cta_report")],
             honest="입력한 내용은 이 브라우저에만 저장되며 ClassIn으로 전송되지 않습니다. 상담에서 공유할지는 원장님이 정합니다."),
        dict(L="back", about="ClassIn은 전자칠판 판서, 수업 녹화, 교안, 숙제·시험, 운영 데이터를 한 흐름으로 묶는 학원 수업 운영 시스템입니다. 서울 목동 쇼룸에서 우리 학원 수업으로 직접 확인할 수 있습니다."),
    ],
)
