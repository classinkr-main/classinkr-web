# 공개 사이트 디자인 언어 — 편집 지면 · OS판

기준 시점: 2026-10-26 (HEAD `4c9e509c` + 미커밋 작업 트리). 고급화 개정 2026-10-28 (브랜치 `design/p1-visual` `e44cd161`)
상태: **V1–V9 A 확정(2026-10-27) · V10–V18 A 확정(2026-10-28), 둘 다 운영자 승인. 이 문서에 V10–V18 A 반영 2026-10-28. P0·P1 커밋 완료(`design/p1-visual`, 미푸시). 다음 단계는 H → P2-0 → P2(§7).**
범위: 공개 셸(`.site`). `/admin`·`/checkout`·`/receipt`는 제외하고, 모든 단계의 수용 조건은 "어드민 무변경"이다.

관련 문서
- [공개 사이트 전수 점검·모션 디벨롭 기획](./public-site-audit-motion-plan-2026-10-26.md) — 코드 점검(P0·P1·P2)과 모션 기획. 이 문서는 그 §5(모션)를 디자인 전반으로 넓힌 후속이다. 그 문서의 결정 D1–D8은 여기서 **감사 D#**으로 부른다.
- [공개 사이트 고급화 기획](./public-site-premium-elevation-2026-10-28.md) — 이 방향 위에서 해상도를 올리는 후속. 결정 V10–V18(2026-10-28 전부 A 승인), 결정 없이 채택한 변경, 규칙 개정 대조표(§5), 정직성 핫픽스 H(§7), 사실 확인 기록(§13). 이 문서는 그 결과를 반영했다.
- 상세 스펙 7종: [public-site-design-language-2026-10-26/](./public-site-design-language-2026-10-26/) (§10 목록)
- 시안 캔버스(비공개 artifact): https://claude.ai/artifact/QShWLdYRgZCZTy957gHtyx — 「편집 지면 V1–V9」 보드 15장, 「고급화 V10–V18」 보드 8장
- 현행 디자인 정본: [DESIGN.md](../../DESIGN.md). §8의 변경 중 P0 몫(토큰·사실 정정·배지·결정 로그)은 P0에서 반영하고, 나머지 절은 각 구현 PR이 고친다.

---

## 1. 요약

- **방향은 「편집 지면 · OS판」이다.** 학원 원장이 읽는 잘 편집된 교육 전문지에, 수업 OS의 상태 표기(● ○ –)와 정직한 화면 도판을 접목했다. 2026-10-28 고급화 개정(V10–V18 A)은 방향을 그대로 두고, 한 번 더 빼고 더 정밀하게 한다.
- **홈은 11지면 목차.** Hero · LogoBar 띠 · 01 선언 · 02 공감 · 부록 진단표 · Manifesto · 03 흐름 · 04 화면 · 05 기록 · 06 확신 · FinalCTA + 푸터. 한 지면에 한 주장이다(V10-A).
- **면은 4장, 한 종이.** paper `#F9F8F5` · sheet `#FFFFFF` · sunken `#F3F2EE` · 먹 면 `#1A1917`. 글자 먹 `#111110`은 그대로 두고 면과 글자를 나눈다(V15-A). paper가 기본이고 sunken은 3역할(도해·부록·FinalCTA), 먹은 Manifesto 1 + 푸터, sheet는 섹션 지면이 아니라 물건(Frame·plate·요금·사진 있는 카드·표·폼)에만 쓴다.
- **그린과 둥근 모서리는 누를 수 있는 것에만.** 그린 `#084734`는 링크·버튼·포커스와 현재 위치에 쓰고 면을 칠하지 않는다(그린 채움은 primary 버튼 1개). 제목·섹션 머리 안 그린은 0이고(V12-A), 그 밖의 비상호작용 그린 표지는 뷰포트당 2개 이하다. 반경은 0·6·원형 셋뿐이다: 물건은 r0, 컨트롤과 떠 있는 층은 r6, 필터 칩·상태 점·스위치 썸은 원형(V14-A). 민트 `#ECFDF5`·`#D1FAE5`는 공개 화면에서 0이다.
- **서체는 Pretendard 하나.** 자체 호스팅, 세리프 0, 모노는 시스템 스택(코드·쿠폰 입력만). 제목은 600으로 크게 쓰되 가볍게, 화면 제목의 700은 Manifesto 한 곳(V13-A, OG 이미지 제목은 C28 예외). 명조는 인용·Manifesto 문구가 확정된 뒤 다시 본다(V18-A).
- **섹션은 괘선과 여백으로 나눈다.** Act 머리의 1px 먹선(masthead), 그 아래 왼쪽 레일의 폴리오·먹 라벨, 64rem 이상 12칸 그리드, 공개 h1/h2 가운데 정렬 0. 그림자 0(떠 있는 레이어만 예외), 섹션 배경 처리는 plain 하나.
- **정지한 지면, 잉크 한 획.** Hero는 첫 프레임부터 인쇄된 상태이고, 첫 화면의 움직임은 한 박자(`--motion-beat` 240ms) 뒤 잉크 밑줄 색 한 획(`--motion-slow` 900ms)뿐이다(V17-A). 홈 무한 루프 0, 자동 진행 0, 카운트업 0, 선 긋기(stroke-dashoffset) 0. 홈 서사 모먼트는 4개(상한 6)이고 각각 한 번만 재생한다. reduced-motion이면 완성 상태로 멈춘다.
- **숫자와 이미지는 정직하게.** 화면 수치는 출처 있는 것만(`lib/facts.ts` + 각주), 도판 라벨은 출처 장부 `data/image-credits.json`에서 만든다(라벨 6종 그대로). 출처를 확인할 수 없는 도판은 싣지 않고 라벨도 짐작해 달지 않는다. 흰 화면 캡처는 sunken 매트 위에 둔다(V16-A). 목업은 "예시 화면" 점선 태그.
- **새 의존성 0.** 토큰 정본은 `app/styles/tokens.css` 한 파일, CSS 밖 소비처(OG·viewport·global-error)는 손으로 적은 미러 `lib/design-tokens.ts` 하나를 테스트로 대조한다.

## 2. 왜 바꾸나 (현재 상태)

감사 문서와 스펙 작업 중 코드에서 확인한 것만 적는다.

- 파스텔 그린 채움 면(`#ECFDF5`)·그린 글로우·글래스·그라데이션 텍스트·ping 배지가 섞여 있어 운영자 취향(채움 지양·아웃라인 강조·그린은 액센트만)과 어긋난다.
- 무한 루프가 많다: LogoBar 마키, Hero 다크 영상, 모바일 CTA 펄스, ai-report 점멸·웨이브폼. 정지 수단이 없는 72초 무음 루프 영상도 있다.
- `#A39E98`을 본문·플레이스홀더 글자에 쓴다(흰 바탕 2.54:1, AA 미달).
- Pretendard를 jsDelivr에서 렌더 차단 방식으로 받는다.
- 홈 Hero 도판(`hero-dashboard.webp`)은 alt("Classin Education Dashboard")와 내용(어두운 교실의 지구 그림)이 다르다.
- 차트가 클라이언트 전용 Recharts라 JS가 없으면 빈다. 가공 '지역 평균' 선과 '예시' 표기 없는 수치가 있다.
- z-index가 리터럴로 흩어져 있다(`z-50`·`z-[120]`·`z-[60]`). 쿠키 배너가 Dialog 위로 올라간다.

P1 뒤(2026-10-28) 사실 확인에서 더한 것. 자세한 근거는 [고급화 기획 §2·§7·§13](./public-site-premium-elevation-2026-10-28.md).

- 홈이 18섹션(+ 띠 2) + 푸터이고 지면 바뀜이 약 17회, 1440 길이가 18,406px이다. '흩어진 도구를 한 흐름으로' 계열 주장이 다섯 섹션 이상(Hero·EntitySummary·SolutionOverview·SatisfyingClass·Comparison)에 나오고, 인용은 13개(사례 6 + 후기 벽 7)다.
- 운영 Hero H1은 토큰을 쓰지 않아 800(`font-extrabold`) + 900(`font-black`)이다.
- 홈 무한·자동 루프가 4개 남아 있다: LogoBar 마키, CaseStudies 8.5초 자동 넘김(스펙은 수동), 챗봇 ping·앰비언트 글로우.
- 출처 없는 수치·과장 문구·블러만 된 개인정보 캡처가 운영 화면에 있다(§7 H).

## 3. 방향을 고른 과정

세 방향을 같은 문장·같은 해상도로 그려 브랜드·엔지니어링·전환 3렌즈로 심사했다(캔버스 "방향 3안 비교 · 1차 기록" 보드).

| 안 | 이름 | 한 줄 | 심사 평균 |
|---|---|---|---|
| A | 편집 지면 Editorial Paper | 교육 전문지 한 권 | **7.8** |
| B | 수업 OS 계기판 Instrument | 종이 위 정밀 계기 | 6.0 |
| C | 살아있는 판서 Living Board | 페이지 전체가 보드 한 장 | 6.2 |

세 렌즈 모두 A를 골랐다. 최종안은 A를 기반으로 B에서 4개(모양 상태 점 ● ○ –, ○→● 1회 점등, '예시 화면' 표기, 속도 아이콘 Gauge), C에서 4개(실제 화면에만 주석, 모바일 48px 단일 격자, `--fg/--surface/--line` 토큰 어휘, 단색 브랜드 마크)를 가져왔다. 1차안의 "머리 괘선 긋기 모션"과 "MaruBuri 세리프 인용"은 최종판에서 뺐다(정적 괘선, V2-A).

## 4. 원칙

1. **값은 한 파일.** 디자인 토큰 선언은 `app/styles/tokens.css`에만 둔다.
2. **스코프는 클래스 하나.** 공개 셸 표지는 `site` 클래스이고, 공개 규칙은 모두 `:where(.site)`(특이도 0)로 시작한다. 어드민에는 닿지 않는다.
3. **유틸 이름 = 변수 이름.** `bg-surface-*`, `text-fg-*`, `border-line-*`. 먹 지면은 `surface-ink` 클래스로만 칠하고, 그 안에서 같은 이름이 밝은 값으로 다시 정의된다.
4. **기본값이 이긴다.** 브레이크포인트·간격은 Tailwind 기본값만 쓴다. 새 spacing·크기 토큰은 만들지 않는다.
5. **조작할 수 있는 것만 경계가 진하고 모서리가 둥글다.** 입력·line 버튼·칩·스위치 테두리는 `--line-control #8A857F`(sheet 위 3.66:1, paper 위 3.44:1, V15-A · 2026-10-28), 나머지 구획선은 hair `rgba(17,17,16,.08)`. 반경도 컨트롤과 떠 있는 층에만 준다(V14-A).
6. **움직임은 의미가 있을 때 한 번.** 모션은 opacity·색·2px 이동과 누름 scale .98뿐이다(누름 scale은 V17-A · 2026-10-28). height·padding·box-shadow 애니메이션과 `transition-all`은 쓰지 않는다. 반응은 즉각, 퇴장은 여운이 있게 한다.
7. **가드는 래칫.** 새 위반은 0, 기존 위반은 줄기만 한다(`scripts/check-design-tokens.mjs` 확장).
8. **측정한 뒤 다음 단계.** 라우트 단위 PR, 기준선 14일, 미리 합의한 되돌림 트리거(§7).

## 5. 운영자 결정 V1–V18

방향 문서의 결정은 V(visual)로 번호를 매긴다. 감사 문서의 D1–D8과 섞이지 않게 하기 위해서다. 운영자가 2026-10-27에 V1–V9를, 2026-10-28에 V10–V18을 모두 **A**로 승인했다. 확정 기록은 [DESIGN.md §9 결정 로그](../../DESIGN.md)에 있다. 아래 '대안' 열은 표에 적힌 전환 조건(V1 LCP 악화 등)이 생길 때만 다시 본다.

| # | 질문 | 기본안 A | 대안 | A를 권하는 이유 |
|---|---|---|---|---|
| V1 | Pretendard 로딩 | 자체 호스팅(`public/fonts/pretendard-1.3.9/`, woff2 92조각, 라틴 preload 1개, 1년 캐시) | B 시스템 폰트 우선(애플 기기 0바이트, 라틴 일부 SF) | 타이포가 곧 브랜드라 기기 간 동일성이 우선. iPhone 4G LCP를 전후로 재고 나빠지면 B로 전환(비용 0) |
| V2 | 인용 세리프 | 세리프 없음, 인용은 Pretendard 500 | B Noto Serif KR(인용만, 300KB 예산) · C MaruBuri 서브셋 | 0바이트. B는 시안 비교 칸에서만 확인 |
| V3 | 홈 Hero | 지면 표지: paper, 7/5 분할, 오른쪽 EDB 판서 실제 화면 캡처, 영상 없음, LCP = H1 | B 현행 sticky 다크 영상 + 스크림 | LCP·가독성·모바일 첫 화면 CTA. 극적 대비는 Manifesto 먹 지면이 맡음 |
| V4 | 배경 리듬·공감 Act | 서사 먹은 Manifesto 1곳 + Footer. ProblemCost는 정성 장부 6행(수치 0). 지면은 V10-A로 paper(sheet는 섹션 지면이 아니다) | B 다크 꼭짓점 5곳 | 다크가 하나여야 전환점이 선다 |
| V5 | FinalCTA | sunken 띠 + 이중 괘선 + primary 52 + 텍스트 링크 | B 먹 패널 + 채움 버튼 | 먹 위 채움 버튼 논쟁을 "먹 위 채움 0"으로 해소 |
| V6 | 아이콘 획 | 1.5px, DPR1 화면은 2px | B 1.75px | 16px 인라인이 흐리면 B |
| V7 | 카드·배경 애니메이션 | 항상 정지. 링크 카드 hover는 경계 진하게 + 화살표 2px | B 대표 카드 conic 테두리 빛 1회 | 테두리 빛은 'AI 분석 중' 클리셰, 거부된 그라데이션 하이라이트 |
| V8 | 입력 필드 | 박스형(sheet + 1px `--line-control` `#8A857F` + r6, 높이 44/48). 색 값은 V15-A로 바뀌었다 | B 밑줄형 | 40~50대에게 "여기에 쓰는 칸" 인지가 가장 분명 |
| V9 | Hero 배지 | 삭제하고 Kicker('수업 시스템 OS')로 대체. Kicker의 16×2 그린 바는 V12-A로 없앴다 | B 아웃라인 pill 1개 | 위계 장치가 하나로 준다. 비상호작용 pill 0 |

V3 보충(V11-A로 교체 · 2026-10-28): Hero 오른쪽 5칸에는 출처를 확인한 실제 화면 캡처만 둔다. 캡처가 커밋되기 전에는 **무도판 비대칭 표지**로 둔다. H1을 왼쪽 1–9칸에 크게 짜고, 덱과 CTA 두 개는 오른쪽 8–12칸, H1 마지막 줄 아래에 둔다. 도판은 0이고 LCP는 H1이다. 현재 도판(`hero-dashboard.webp`)은 내린다. 현재 도판과 옛 시안의 대체 도판(`writing-experience-classroom.webp`)은 **출처가 확인되지 않았으므로** 어떤 라벨도 짐작해 달지 않는다. 출처는 출처 장부 1차 검증에서 확인한다. 같은 이미지 파일은 페이지당 1회만 쓴다(배경·포스터 포함). 수용 기준은 '캡처가 커밋되기 전까지 Hero 안 `[data-figure]`·`[data-frame]` = 0'이다. 출처를 확인한 캡처가 커밋되면 V3-A 7/5 분할로 바꾼다.

### V10–V18 (2026-10-28 운영자 승인, 전부 A)

시안은 캔버스 「고급화 V10–V18」 페이지에 있다. 대안·보드·닿는 규칙은 [고급화 기획 §3](./public-site-premium-elevation-2026-10-28.md)에 있고, 규칙의 지금·바뀌는 것 대조는 같은 문서 §5에 있다. 값은 §6과 각 상세 스펙이 정본으로 따른다.

| # | 질문 | 선택 A | 근거 한 줄 |
|---|---|---|---|
| V10 | 홈을 몇 지면으로 편집할까 | **11지면 목차**: Hero · LogoBar 띠(paper + hair) · 01 선언 · 02 공감(정성 장부) · 부록 진단표(sunken) · Manifesto(먹) · 03 흐름(OS 지도, sunken) · 04 화면(영역 캡처 1장 + 매트 Frame + CTA 띠) · 05 기록 · 06 확신(비교표) · FinalCTA(sunken) + Footer(먹). 빠짐: EraVision · KeyUseCases(→SW) · DashboardPreview · ScienceBased(→각주 단 블로그 글) · SatisfyingClass. 합침: CaseStudies + TestimonialWall + GlobalScale + Outcomes → 05 기록. 1440 약 11,400px(게이트 ≤11,500), 지면 바뀜 6 | 같은 주장이 다섯 섹션에 나오면 원장은 확신이 아니라 조급함으로 읽는다. 결정 CTA는 지금 5곳(Hero `hero_demo` · Comparison `comparison_demo` · FinalCTA `final_consultation` · 헤더 · 모바일 플로팅)을 그대로 두고, 04 화면 Section 안 마지막 요소로 확인 CTA 띠(line cta) 1개를 더한다(별도 Section·`data-surface` 없음) |
| V11 | EDB 판서 캡처 전 홈 첫 화면 | **무도판 비대칭 표지**: H1 1–9칸, 덱·CTA 두 개 8–12칸, 도판 0, LCP = H1. 출처 확인된 캡처가 커밋되면 V3-A 7/5. 위 V3 보충 문장을 바꾼다 | 출처를 확인할 수 없는 도판에는 정직 라벨을 달 수 없다(imagery 원칙 2). 따뜻한 종이 위 크게 짠 한국어 제목 하나가 가장 자신 있는 표지다 |
| V12 | 섹션 머리(Kicker)에 그린을 남길까 | **바 없음, 먹 라벨**: 1px 먹 masthead 아래 레일에 폴리오 13/500 회색 + 라벨 13/600 먹. 섹션 머리 그린 0 | 짧은 대시 + 색 라벨은 템플릿 eyebrow다. 그린을 누를 수 있는 것에만 남겨야 신호가 선다. 좌측 2px 바는 C21 세 곳(비교표 Classin 열 · `/pricing` 선택 가이드 행 · 세로 목차 현재 항목)에 그대로 남는다 |
| V13 | 큰 제목의 굵기 | **제목 600, Manifesto만 700**: poster 700, display·h1·h2·h3 600, numeral 600(비례 숫자). h1 56px. 14px 이하 600은 라벨·폼 라벨·버튼·'예시' 태그만 | 크게 쓰되 가볍게, 크게 소리 내는 곳은 Manifesto 하나 |
| V14 | 모서리를 얼마나 둥글게 | **누를 수 있는 것만 둥글게**: 카드·도판·표·띠·IconFrame·도해 노드 r0. 버튼·입력·스위치 트랙·Dialog·드롭다운·토스트·모바일 메뉴 r6. 필터 칩·상태 점·스위치 썸 원형. 값은 0·6·원형 셋 | hair 테두리 r12 흰 카드는 'AI가 만든 느낌' 그 자체다. 둥근 것이 '누를 수 있음'을 뜻하면 반경이 정보가 된다 |
| V15 | 종이 흰색과 먹 지면 색 | **웜 아이보리 + 인쇄 먹**: paper `#F9F8F5` · sunken `#F3F2EE` · skeleton `#EFEEE9` · line-control `#8A857F` · 먹 면 `#1A1917`. 글자 `#111110`·masthead `#111110` 유지. 사진 흰점 = paper | 지면·띠·사진 흰점이 같은 온도여야 화면이 한 권으로 묶인다. 순흑에 가까운 큰 먹 면은 꺼진 화면처럼 보인다 |
| V16 | 흰 화면 캡처를 흰 지면 위에 | **매트**: 40rem 이상에서 sunken 여백판 20px(64rem 이상 32px), 캡처는 1px hair + r0, 그림자 0. 40rem 미만은 매트 없이 전폭 | 민트 패널이 빠지면 흰 캡처가 붙여 넣은 스크린샷처럼 보인다. 매트는 그림자·색 없이 '보여 주는 물건'으로 세운다 |
| V17 | 첫 화면과 서사 모먼트의 움직임 | **인쇄된 표지 + 잉크 템포**: Hero 진입 애니메이션 0, 240ms 뒤 '학원의 시스템으로' 밑줄 색만 900ms. 서사 모먼트 `--motion-slow` 900ms `--ease-fade`. hover 진입 160 · 이탈 320ms. Dialog·메뉴는 닫힐 때도 160ms 페이드 | 잡지 표지는 등장하지 않고 이미 인쇄되어 있다. 반응은 즉각, 퇴장은 여운. 느린 곡선은 서사에만 |
| V18 | 명조 디스플레이 서체를 지금 다시 열까 | **지금은 Pretendard 하나**(V2-A 유지). 인용 4개·Manifesto 문구가 확정된 뒤 같은 보드로 재판정 | 바이트가 아니라 시점 문제다. 문구가 바뀌는 동안 서브셋을 계속 다시 만들어야 한다 |

## 6. 요소별 핵심 규격

값의 정본은 각 상세 스펙이다. 여기에는 결정에 필요한 것만 옮긴다.

### 6-1. 타이포그래피 ([typography.md](./public-site-design-language-2026-10-26/typography.md))
- Pretendard Variable 하나. 400/500/600/700. 굵기는 V13-A(2026-10-28): poster 700(Manifesto 한 곳), display·h1·h2·h3 600, numeral 600. 14px 이하에서 600은 label·폼 라벨·버튼·'예시' 태그에만 쓴다(래칫).
- 글자 크기 토큰 15종(이름·개수 그대로): poster · display · h1 · h2 · h3 · body-l · body · article · ui · caption · note · label · folio · numeral · quote.
- `text-display`(40→72/600)는 Hero H1 전용, `text-poster`(48→104/700)는 Manifesto 전용. `text-h1`은 `clamp(2.25rem, 1.75rem + 2.1vw, 3.5rem)`(36→56px)으로 키워 굵기 대신 크기로 위계를 잡는다. FinalCTA 제목은 h2에 `text-h1`, 시뮬레이터 결과 금액은 `text-h2`(요금 카드에는 금액이 없다, 2026-10-28).
- 본문 16/1.75, 덱 17→19, 읽기 폭 38em.
- 자간(고급화 2026-10-28)은 0이 아니라 줄인 음수다. 데스크톱 poster·display −0.035 · h1 −0.03 · h2 −0.025 · h3 −0.01 · num −0.02em, 모바일(width < 40rem) poster −0.025 · display −0.022 · h1 −0.018 · h2 −0.014 · h3 −0.006 · num −0.015em. 이 표가 정본이고, 표 밖 값과 −0.035em보다 좁은 자간은 쓰지 않는다(2026-10-28). `globals.css`의 h1–h4 모바일 `letter-spacing:0 !important`는 P2 첫 커밋에서 어드민 전용 셀렉터로 옮긴다(어드민 diff 0). 그 전에는 어떤 자간 토큰도 모바일에서 효과가 없다.
- 강조는 한 지면에 하나다. 구절 강조는 굵기 대비나 잉크 밑줄(C25)만 쓴다. h1–h3·display·poster 안 그린은 0이고, 본문의 그린 구절도 금지한다(밑줄 없는 링크와 구분되지 않음). `heading-accent` 가드는 아직 없으므로 P2에서 warn 래칫으로 새로 만든다.
- 잉크 밑줄: `text-decoration: underline 2px` 하나(줄바꿈마다 붙음, nowrap 금지).
- Kicker(V12-A · 2026-10-28)는 1px 먹 masthead 아래 레일에 폴리오 13/500 `#615D59` → 12px → 라벨 13/600 `#111110`이다. 바는 없다. 먹 위 색은 C01 토큰이 자동으로 바꾼다. Act·장 머리 전용이고, 홈은 Hero 1(라벨 '수업 시스템 OS'만) + Act 01–06. ChapterHead는 masthead → 레일 Kicker + 본문 H2 → 덱 순서다.
- 숫자 글리프: 표·가격·폴리오·날짜만 `tabular-nums`이고, `text-numeral`은 어디서나 비례 숫자다(tabular-nums 없음). 카운트업 0.
- 0바이트 조판 마감: PullQuote 여는 따옴표는 `text-indent: −0.45em`으로 매단다. 한글 사이 가운뎃점은 공백 없이('전·중·후'). ss05·cv12·ss03은 Pretendard 자체 호스팅(C04) 뒤 실제 전송되는 woff2에서 확인하고 보드에서 이득이 보일 때만 켠다. `font-feature-settings` 목록은 변수 하나에서만 관리한다.
- 장문(블로그·P5): 레일 목차, standfirst, 바이라인(작성자 · 날짜), measure 646px. 그린 굵은 요약문 대신 mark(600 + 2px 밑줄, 섹션당 1). 교열 기준 1쪽(띄어쓰기 '수밖에'·'안 됩니다', 본문 '-습니다', 과장어 목록, H2 ≤24자·덱 ≤60자), 가드는 warn 래칫이고 인용 데이터는 제외한다.
- OG 이미지는 Pretendard 정적 OTF(Regular·Bold)를 Node 런타임에서 읽어 그린다. 정적 OTF가 둘뿐이라 OG 이미지 제목은 700이다(V13 굵기 규칙의 C28 예외). 정적 경로 `assets/fonts/pretendard-static/`은 아직 없고 C28 구현 때 만든다.

### 6-2. 색·표면 ([surfaces.md](./public-site-design-language-2026-10-26/surfaces.md))
- 색 토큰 20개: `--surface-{paper #F9F8F5, sheet #FFFFFF, sunken #F3F2EE, ink #1A1917, skeleton #EFEEE9, scrim}`, `--fg-{ink #111110, body #31302E, muted #615D59, placeholder #78736D, faint #A39E98(장식 전용), accent #084734, …}`, `--line-{hair .08, strong .16, ink, control #8A857F, link}`. 지면·먹 값은 V15-A(2026-10-28)다. 글자 `--fg-ink`와 masthead는 `#111110` 그대로이고, 면 `--surface-ink`만 `#1A1917`이다(`.surface-ink` 안 sheet도 같은 값).
- 밝은 지면(paper·sunken·skeleton)은 R≥G≥B, R−B 4–7로 맞춘다. sheet `#FFFFFF`·글자·선 회색은 이 규칙에서 뺀다.
- 대비(WCAG 2.x): paper 위 ink 17.79 · body 12.41 · muted 6.14 · placeholder 4.42 · line-control 3.44 · accent 10.08 · hover 11.53. sunken 위 muted 5.82 · line-control 3.26 · accent 9.56. sheet 위 line-control 3.66 · placeholder 4.70. 먹 `#1A1917` 위 글자 16.81 · 본문(.72) 9.14 · muted(.56) 6.00 · 세이지 8.92.
- `#A39E98`은 글자 금지(장식선·비활성 표시만).
- 먹 지면(`surface-ink`) 위 재정의: 글자 `#FAFAF8`, 본문 /.72, 액센트·hover 세이지 `#8FC4AC`, 링크 밑줄 `rgb(143 196 172 / .6)`, 오류 `#E89A94`. 먹 위 컨트롤 0(채움 버튼도, 푸터 뉴스레터 line 버튼도 없음).
- 그린 상태값(고급화 2026-10-28): hover `#073D2D`(밝아지지 않고 짙어진다). 밝은 지면 selection `rgb(8 71 52 / .14)` + 글자 `#111110`(합성 `#D7DFDA` 위 13.9:1). 먹 위 selection은 세이지 알파 + 글자 `#FAFAF8`이고, `site-base.css`가 selection 글자를 `#111110`으로 고정하므로 `.surface-ink ::selection` 재정의가 필요하다. 'OKLCH L ≤ .36'(밝은 지면)·'C ≤ .07'(먹 위) 규칙은 글자·채움 상태값에만 적용한다(selection·밑줄 합성색 제외). 공개 CSS에서 `#6EE7B7`·`#D1FAE5`·`#065C41`은 0이다. 기본색 `#084734`는 유지하고 어드민 민트는 건드리지 않는다.
- 그린 배급: 비상호작용 그린 표지(잉크 밑줄 · ● 묶음 · 좌측 2px 바 · 차트 강조 계열 · 인용 여는 따옴표)는 뷰포트당 2개 이하, 그린 채움은 primary 1개다. 카드 범주·사례 지역 라벨은 `text-fg-muted`이고, 표 그룹 머리·'추천' 라벨·OS 지도 버스 라벨('수업 시스템 OS') 같은 비상호작용 라벨도 먹(`text-fg-ink`)이나 muted로 쓴다(그린 0). 링크·버튼·포커스·index-tab은 세지 않는다. 소스 가드는 섹션당 개수로 근사하고, 뷰포트 개수는 검증 하네스 스크린샷으로 확인한다.
- 헤어라인: `--line-w-hair` 1px, 2dppx 이상 .5px + α .14, 먹 위 .5px + α .20, `prefers-contrast: more`에서 1px + α .32(대비 2dppx hair 1.35 · 고대비 2.09), 고대비의 `--line-strong`은 `#8A857F`(= `--line-control`). masthead·조작 경계·2px 바는 그대로다. iPhone 실기기로 검수한다.
- 그림자는 `--shadow-deep` 하나, 떠 있는 레이어(Dialog·드롭다운·토스트·모바일 메뉴)만.
- 모눈은 도해 figure 자체 바탕으로 페이지당 1개(48px, 40rem 이상 56px).
- 지면 배정(V10-A): paper가 기본이다. sunken은 페이지마다 도해(페이지당 1)·부록·FinalCTA 3역할만 쓰고 연속은 금지한다(홈은 03 흐름 OS 지도·진단표·FinalCTA, ai-report는 Pipeline 도해만 sunken이고 나머지 paper). 먹은 Manifesto 1 + 푸터. sheet는 섹션 지면에서 빼고(Section surface 값에서 제외, `[data-surface=sheet]` = 0) Frame·plate·요금·사진 있는 카드·폼·표 같은 물건에만 쓴다. 글만 있는 카드는 열린 단이고, `/pricing` 안내 박스는 상자 없이 위 hair + 안내문이다(CO-9). CTA는 sheet 카드가 아니라 FinalCTA 문법(sunken + `rule-double`)이다. 홈 인접 지면 바뀜은 6회 이하.
- 홈 시퀀스: Hero(paper) → LogoBar 띠(paper + 위아래 hair) → 01 선언(paper) → 02 공감(paper) → 부록 진단표(sunken) → Manifesto(먹) → 03 흐름 OS 지도(sunken) → 04 화면(paper) → 05 기록(paper) → 06 확신 비교표(paper) → FinalCTA(sunken) → Footer(먹).

### 6-3. 카드·모션 ([cards_motion.md](./public-site-design-language-2026-10-26/cards_motion.md))
- 카드 8종: 열린 단(column) · 수치 · 인용 · 사례 · 요금 · 목차 행 · Frame · CTA 띠. 반경 r0(V14-A · 2026-10-28, 요금 Plan 카드 포함), 그림자 0. 공유 `card.tsx`의 legacy family는 바이트 그대로 둔다.
- 상자 줄이기: 글만 있는 카드(인덱스·후기·가치)는 열린 단이다. 채움·상자 없이 위 hair 괘선 + 32/48 간격, 64rem 이상에서 단 사이 세로 hair(`card.tsx` 공개 family `column`). sheet 상자는 Frame·plate·요금·사진 있는 사례·폼·표에만 쓴다. 링크 단은 화살표를 늘 보이고 히트 영역은 단 전체로 잡는다.
- 링크 카드·목차 행·FAQ 행·링크 단의 hover: 경계 hair→strong + 화살표 2px. 진입 160ms, 이탈 320ms(V17-A): 기본 `duration-(--motion-base)` + `hover:duration-(--motion-fast)` `focus-visible:duration-(--motion-fast)`이고, 카드·FilterChip·아이콘 전이 모두 같다. 눌림은 scale .98(누름 0ms, 뗌 320ms). 그 밖은 변하지 않는다.
- 홈 사례는 3건을 정적으로 배치한다(64rem 이상 3열, 모바일 세로, dl 4칸: 학원 유형·지역·도입 구성·운영 기간). 캐러셀은 4건 이상인 목록 지면에서만 수동 넘김으로 쓴다. 인용은 4개 이하이고, 운영 명사 1개와 바뀐 행동 1개가 있어야 고른다. 별표 마스킹 바이라인 금지(서술형 익명이나 실명), 동의 행이 없으면 렌더하지 않는다. 그린 채움 대표 후기 패널은 삭제한다.
- LogoBar(X16 개정): 숫자 없이 공개 동의를 받은 이름만 가나다순으로 싣는다('외 N곳' 0). 동의 기관이 6곳 미만이면 렌더하지 않는다. 지면은 paper 띠 + 위아래 hair.
- 홈 서사 모먼트(`data-moment`, 상한 6): ① Hero 잉크 밑줄 색(지연 `--motion-beat`, `--motion-slow` `--ease-fade`, 정본 cards_motion §3-14 `ink-fade`, 다른 페이지는 Reveal 전이) ② Manifesto 두 줄 스크롤 스크럽 ③ 03 흐름 OS 지도 노드 ○→● 색 전이(opacity가 아니라 border-color·background-color, `--motion-slow` `--ease-fade`, 02 공감 장부 6행과 같은 이름·같은 순서, 80ms 간격, 1회, reduced·no-JS에서는 ● 6개 완성 상태) ⑤ 06 확신 비교표 Classin 열 좌측 바. ④ 차트 모먼트는 DashboardPreview가 V10에서 홈을 떠나므로 홈에서 0이다(규칙은 다른 페이지용으로 남는다). 홈 모먼트는 넷이고 `[data-moment]` 게이트 = 4다. opacity·색 모먼트는 모두 `--motion-slow` `--ease-fade`이고, 순차 지연은 `calc(var(--seq,0) * var(--motion-beat))`다.
- Hero 진입 애니메이션 0(V17-A). 첫 뷰포트의 움직임은 잉크 밑줄 하나다. `hero-soft-enter`는 download·docs 사용처까지 지운다.
- 시간: 조작 응답 `--motion-fast` 160ms, 이탈·뗌 `--motion-base` 320ms, 서사 모먼트·Reveal·잉크 밑줄·도판 현상 `--motion-slow` 900ms(700ms에서 바뀜), 지연 `--motion-beat` 240ms. 리터럴 ms 대신 이 토큰을 쓴다. 컨트롤은 `--motion-slow`를 쓰지 않는다(입력 오류 테두리 페이드는 `--motion-base`). 곡선: tokens.css에 이미 있는 `--ease-soft cubic-bezier(.22,1,.36,1)`·`--ease-drift`에 `--ease-fade cubic-bezier(.33,1,.68,1)`를 더한다. `--focus-offset` 2px도 같은 PR에서 더한다.
- 오버레이: Dialog·scrim·메뉴·드롭다운·토스트는 닫힐 때도 160ms 페이드로 빠진다.
- 페이지 이동: 공개 셸의 페이지 이동 모션은 0이다(AppChrome 공개 분기에서 RouteTransition 래퍼 제거, 어드민 `tone=admin`은 그대로). 느린 이동은 300ms 뒤 숨쉬는 스켈레톤(`--animate-skeleton`: `skeleton-breathe` 1↔.7, 2.4s, `--ease-drift`)이 받는다. 동작 줄이기 스피너의 `skeleton-blink`(1↔.4, 1.6s)와는 keyframes를 나눈다(정의처 system §3-4/§13-3). 버튼 진행 상태는 300ms를 넘을 때만 표시하고 폭을 고정한다.
- 진행 괘선: 자동 진행 괘선만 금지한다. 긴 글(블로그·docs)은 헤더 하단 hair 위 1px 읽기 괘선(CSS 스크롤 타임라인, 지원 브라우저만) 1개를 허용하고, ReadingProgress 3px JS 막대는 삭제한다(z 표에서도 뺀다).
- Reveal: 마운트 때 이미 화면 안이면 무장하지 않는다. reduced-motion·IO 미지원도 무장하지 않는다. 새 모먼트(점등·도판 현상)도 같은 무장을 따른다.
- SolutionOverview 탭은 수동이고 자동 진행 0. 지금 CaseStudies의 8.5초 자동 넘김은 P3에서 정적 배치로 바뀐다.

### 6-4. 아이콘 ([icons.md](./public-site-design-language-2026-10-26/icons.md))
- lucide-react 하나. Classin 고유 사물(전자칠판·수업 도구 26종·가이드 4종)만 Lucide 규격으로 직접 그려 등록한다.
- 획 `--stroke-pen` 1.5px(DPR1 2px), 크기 16/20/24/32만, IconFrame 40/48(투명 바탕, 1px hair, r0 · V14-A 2026-10-28).
- 기본색은 글자 상속, 단독 아이콘은 `--fg-muted`. 그린 아이콘은 활성 IconFrame·추천 요금제 Check·완료 표지에만, 한 화면에 한 그룹까지.
- Sparkles 퇴역(AI는 글자 'AI'). 타일·채움 원·그라데이션·이모지 금지. 순서는 번호, 상태는 ● ○ –.
- 상태 점의 off→on 색 전이(○→●)는 닫힌 목록 두 곳에서만 허용한다: `.os-node .status-dot`과 `.success-panel .status-dot`(폼 성공 패널, 클래스 이름은 controls 소유). 꺼진 점 ○는 border-color `var(--line-control)` + background transparent다.
- 도해(OS 지도·LatencyProof·절차 도해)는 1.5px 펜 선, 13px 라벨, 노드는 r0에 윤곽 1.5px(`--stroke-pen`) `--line-control`(정보 경계, C23)로 그린다. 아이콘 원은 금지한다(P3).
- 브랜드 마크는 벡터 원본과 단색화 승인 전까지 보류.

### 6-5. 이미지·도판 ([imagery.md](./public-site-design-language-2026-10-26/imagery.md))
- 출처 라벨 6종: `사진 · {제공처}` / `예시 연출` / `AI 생성 이미지`(분위기 컷만, 제품·UI·얼굴 금지) / `제품 렌더` / `실제 화면 · YYYY.MM 캡처` / 목업은 Frame 안 점선 태그 `예시 화면`. 종류는 6종 그대로이고 '출처 확인 중' 같은 새 종류는 만들지 않는다.
- 출처 장부(고급화 2026-10-28): 라벨은 호출부 prop이 아니라 `data/image-credits.json`(file · family · kind · credit · origin · consentDocId · verifiedAt · frozenBy)에서 만든다. Figure/Frame은 id 하나만 받는다. 코드 목업 Frame도 장부에 kind 'mock' 행(id)으로 등록하고 목업 컴포넌트를 자식으로 받는다('예시 화면' 점선 태그 유지). `verifiedAt`이 없는 새 도판은 빌드를 실패시키고, 기존 도판은 라우트 PR마다 교체하거나 텍스트로 대체한다(래칫). render 라벨에는 선택 필드 `screen:{date}`('화면: 실제 화면 · YYYY.MM 캡처')를 더한다. 출처를 확인하지 않은 도판에는 어떤 라벨도 짐작해 달지 않는다. git 이력과 생성 스크립트 파일명은 근거 자료로만 쓴다.
- 1차 검증 대상: `hero-dashboard` · `writing-*` · `space-*` · `camera-*` · `culture/*` · ScienceBased 초상. 렌더되는 HW 이미지 21개 중 5개는 `scripts/generate-hw-images.ts` 출력과 이름이 같고(git상 3개는 Gemini 생성), 16개는 출처 기록이 없다. About 스톡 6장(culture 3 + partnership 3)은 커밋 `cd9803d2`가 classin.com 공식 사진(사용 허락)으로 기록하므로 그 근거를 장부에 적는다.
- `/checkout`이 쓰는 이미지 4파일(`lib/billing/hardware-catalog.ts`의 space-s75-seminar · space-s86-classroom · camera-dual-premium-blended · hero-board-stand)은 `frozenBy:'checkout'`으로 삭제·덮어쓰기를 막는다(파일 존재·해시 테스트). 그중 space-s75·s86은 생성 스크립트 출력명과 같아 라벨·교체는 운영자가 정하고, 공개 페이지에서는 장부 검증 전 사용을 멈춘다.
- Frame(V16-A · 2026-10-28): capture·mock Frame은 40rem 이상에서 sunken 매트(20px, 64rem 이상 32px) 안에 1px hair를 두른 캡처로 놓는다. 캡처는 r0, 그림자 0, 제목줄·창틀 없음. 40rem 미만은 매트 없이 전폭 캡처. mock의 점선 '예시 화면' 태그는 그대로다. 민트 패널 위 배치는 폐기한다.
- 캡션: 64rem 이상에서 12칸 전폭이 아닌 도판은 캡션을 여백 칸(10–12)에 아래 맞춤으로 둔다(설명 60자 이하, 출처 라벨 13/500 먹). 제품 장(P4)과 /about에만 쓰고 홈은 대상이 아니다. 그 밖은 도판 아래 1px hair 뒤 왼쪽 설명 + 오른쪽 출처.
- 큰 도판은 풀블리드가 아니라 콘텐츠 폭 plate다: max-w-page 1200 안, 16:9 / 모바일 4:5 아트 디렉션, r0, 위에 글자 없음, AVIF ≤200KB/1200w. 예산은 홈 0 · SW ≤1 · HW ≤2 · 블로그 글 표지 1이고 `data-plate`로 센다. 크기 3단: L(plate) · M(2열 584 · Hero 480) · S(여백 120~282). 풀블리드 퇴역 대상은 HW `BigBackdrop`과 `FullWidthPointSection` 둘이고, 콘텐츠 이미지의 `sizes="100vw"`는 0이다. 같은 이미지 파일은 페이지당 1회(배경·포스터 포함).
- 도판 3계열(현장·사물·화면) 빛 레시피. 공개 도판 평균 휘도 100/255 이상(HW 먹 장 OPS 1장만 예외). 보드 화면 속 우주·자연 배경, 시네마틱 다크 키, 네온 유리 컷은 금지한다. 대체가 오기 전에 빈 Frame을 두지 않고 텍스트 단·사양표·도해로 무게를 유지한다.
- 화면 도판 2종: 전체 캡처(1920×1200, 페이지당 1)와 영역 캡처(720×450 CSS px, DPR2 → 1440×900). 라이트 테마, 한국어 시드 데이터, 창틀·커서·알림·딤 0. 도판 속 UI 본문 글자는 64rem 이상에서 렌더 10px 이상. 기존 `use-cases/generated/*-source.png`는 실제 캡처인지 확인하기 전에는 쓰지 않는다.
- 제품 도판: 16:10 무봉 판 1색(sunken 값), 좌상 키 라이트 하나, '제품 렌더' 라벨, r0. CSS 그림자 규칙(X05)은 그대로이고, '제품 렌더' 자산 안에 구운 접지 그림자 1개(α ≤ .18, 띄움 0, 색 후광·림 라이트·반사 바닥 0)만 이미지 내용으로 허용한다. HW 먹 장은 AllInOne 하나이고 그 안에 제품 한 컷(P4).
- 그레이딩: 사진마다 장부의 neutralPatch로 중립 패치 WB를 먼저 한 뒤 공통 그레이드를 건다. 흰점은 `--surface-paper` 값과 같게, 세트 R−B 폭 4 이하, 업스케일 0. 제품 판 합성은 밝은 판 = sunken 값, 먹 장 = surface-ink 값, 새 파일명. 스크립트는 저장소 의존성 밖에서 실행한다.
- 현상: decode 전 도판만 opacity로 차오르고, 액자·캡션·출처 라벨은 즉시 보인다. 캐시된 도판은 페이드 0. scale·clip-path·mask·와이프는 금지한다.
- 사람: 식별 가능한 얼굴은 페이지당 1개 이하이고 consentDocId가 필수다. 이니셜 원 아바타는 금지한다.
- 차트는 서버 SVG(공개 화면 Recharts import 0). 등장은 opacity 순차 하나.
- 비율: 화면 캡처 16:10, 사례 사진 3:2, 인물 4:5. 4:3 폐기.
- SW 히어로 영상은 이미 쿼드러닝 클립(1080p)이고 스톡은 포스터뿐이다(페이지에 두 번). 클립 권리를 장부에서 확인한 뒤 포스터를 지정 프레임(posterAt)에서 뽑아 사진과 같은 그레이드를 건다. 권리가 없으면 텍스트 히어로로 둔다(P4).
- 개인정보는 `--surface-skeleton` 토큰 값의 단색 블록으로 가린다(블러 금지). 블러만 된 `admin-dashboard-source-2.webp`(휴대폰 번호·닉네임, IP 노출, 정적 랜딩 `/l/*`가 사용)와 `admin-dashboard-source-1`(홈·SW)은 단색 마스킹 캡처로 바꾼다(H, 고급화 기획 §7).
- 미참조 이미지 65개(약 25.9MB)와 `*-generated-v3` 변형 정리는 별도 커밋(P2). 스캔에는 정적 랜딩 `public/l/*`(`app/l/[slug]/route.ts`가 서빙)와 `scripts/generate-segment-landings.mjs`의 참조를 반드시 넣고, `/checkout` 동결 4파일은 뺀다.

### 6-6. 컨트롤 ([controls.md](./public-site-design-language-2026-10-26/controls.md))
- 버튼 변형 3개(default · line · ghost=텍스트 링크), 크기 3개(md 44 · cta 52 · icon-md 44×44). 반경: 버튼·입력(V8)·스위치 트랙·Dialog·드롭다운·토스트·모바일 메뉴는 r6, 필터 칩·상태 점·스위치 썸은 원형, 그 밖은 r0(V14-A · 2026-10-28). 반경 가드는 허용목록 방식이고, `rounded-full` 허용은 필터 칩·상태 점·스위치 썸과 chatbot 파트 합의 전까지 기존 챗봇 런처뿐이다(스위치 트랙 제외).
- CTA 라벨 사전 `lib/cta.ts`: 결정 '도입 상담 신청'(primary), 확인 '쇼룸 방문 예약'(line), 알아보기 '운영 진단표 받기'·'도입 자료 보기'(텍스트 링크). CTA 컴포넌트는 ctaId만 받고 자유 문자열 라벨 prop은 없다. ctaId는 기존 값을 유지하고 기존 `trackingButton`·`button` 추적 키를 그대로 매핑한다(14일 비교 연속성). 상담 CTA에 '무료'·한정·마감은 0, 결정 CTA는 뷰포트당 1개, '파일럿'은 버튼 아래 13px 한 줄. 라벨 문구는 P2-0에서 운영자 확인 뒤 확정한다.
- 헤더 버튼 무게는 쇼룸 line과 상담 primary 둘에만 주고, 로그인·다운로드는 13px 텍스트로 낮춘다.
- 포커스는 `2px solid --fg-accent`를 보증 규칙 하나로(먹 위 자동 세이지 `#8FC4AC`). offset은 `var(--focus-offset)`이다: 글 링크·link-body·link-quiet·푸터 링크는 3px + radius 2px, 입력은 테두리 accent 전환 위에 링을 −1px로 겹쳐 한 선으로, 그 밖은 2px(고급화 2026-10-28). 색·두께·셀렉터 4개는 그대로다. 입력 글자 16px 하한도 보증 규칙.
- 탭·내비 활성: 탭마다 2px 막대 opacity 0→1(160ms), 글자 15/500 고정. 움직이는 인디케이터 없음.
- 좌측 2px 바는 세 곳만: Comparison Classin 열, /pricing 선택 행, 세로 목차 현재 항목. 토스트 상태선 폐기.
- 스위치: 트랙 r6, 채움 없음(1.5px 테두리 + 원형 썸 이동). 체크·라디오는 네이티브 20px + accent-color.
- 모바일 플로팅 CTA는 아웃라인(글래스·펄스·그림자 0). 쿠키 배너가 열리면 플로팅 CTA·챗봇 런처는 숨김.
- 떠 있는 크롬 예산: 뷰포트당 떠 있는 요소는 1개다. 흐름 안 결정 CTA가 보이면 모바일 플로팅 CTA를 숨긴다. 챗봇 런처의 쉬는 상태는 sheet + 1px 먹 아웃라인 원형, 그림자·알림 점 0(chatbot 파트 합의 뒤). 375에서 본문 겹침 0.
- 푸터는 읽기 전용 판권면이다(상호·대표자·주소·사업자등록번호·통신판매업 신고번호·고객센터·개인정보 보호책임자·쇼룸 행, 운영자가 준 값만 렌더). 먹 위 컨트롤 0. 뉴스레터는 텍스트 링크로 두고, 별도 폼에서 체크 안 된 수신 동의 체크박스로 받는다. '동의한 것으로 간주' 문구는 0. © 연도는 KST 실행 연도.
- 문의 지면(P5): 폼 위 '문의하시면 이렇게 진행됩니다' 3행, 제출 뒤 같은 문구의 성공 패널(`.success-panel`, 제목 포커스, ● 1개 점등, 다음 순서 ●○○). 리드 성공 토스트 0, '상담 방식'(쇼룸·화상·방문)은 선택 필드, 전환 이벤트 발화 위치는 그대로.
- 손끝 마감: 그린 펜촉 캐럿, 탭 하이라이트 제거, `scrollbar-gutter: stable`(Radix 스크롤 잠금과의 이중 여백은 Windows Chrome·Edge에서 실측하고, 생기면 공개 변형에서만 보정).
- 새로 정한 것: StateBlock(404·오류·빈 상태), 스킵 링크 + 단일 `<main>`, 푸터 판권면, Breadcrumb·Pagination 한 줄 규격.

### 6-7. 레이아웃·레이어·토큰 배선 ([system.md](./public-site-design-language-2026-10-26/system.md))
- 브레이크포인트: Tailwind 기본(sm 40 · md 48 · lg 64 · xl 80rem). 원시 CSS는 범위 문법만.
- 거터 16 / 24 / 48, page 1296 → 콘텐츠 1200, 글 칼럼 45rem, 문단 38em.
- 그리드(고급화 2026-10-28): 64rem 이상은 12칸(칸 약 78, 간격 24). 레일 1–3(Kicker·목차·짧은 주), 본문 4–12(제목 max-w-heading, 덱 34em, 본문 38em), 여백 10–12(본문이 4–9일 때 캡션·출처). 도판·카드 그리드·표는 1–12나 4–12에 둔다. 64rem 미만은 1열 왼쪽 정렬이다. 공개 섹션의 h1/h2 가운데 정렬은 금지한다(StateBlock·Dialog 제외). Kicker와 H2의 위 맞춤은 ±4px까지 허용한다(text-box-trim은 점진 적용).
- 섹션 리듬: base 64/96 · act 80/128 · band 40/48. 헤더 높이 76/80 고정.
- z 토큰: subnav 30 · header 40 · floating 42 · chatbot 44 · consent 46 · skiplink 60 (+ 공유 기본값 Dialog 50 · 토스트 9999).
- 새 CSS 파일 3개(`app/styles/{tokens,utilities,site-base}.css`)와 `globals.css`의 `@import` 3줄. 새 공개 규칙은 `globals.css`에 쓰지 않는다.
- 새 파일 9개, 테스트 4개, 새 의존성 0.
- 사실 레지스트리(system §5-5 개정): company-facts §3 값을 `lib/facts.ts`에 등록한다(source 'EEO 공식 소개(classin.com)', asOf '2026-06'). 홈에는 160+개국 · 5,000만+ 교육자·학습자 · 월 3,000만+ 수업을 싣고, 같은 뷰포트에 13px 각주 '¹ EEO 공식 소개(classin.com) 기준 … 국내 도입 실적이 아닙니다'를 단다. 6만+ 기관 · 2억+ 누적은 About에만. 수치가 3개 이상인 행은 각주 번호를 둔다(C24 범위 안).
- 정직 지면 규칙(새 규칙, 고급화 2026-10-28): 체크아웃과 요금 시뮬레이터(`/pricing/simulator`, `/pricing/simulator/krw`) 밖 공개 화면의 금액은 0이고(`/pricing` 카드에도 금액 없음, 현행과 같음) 견적 구성표 `QuoteAnatomy`(● 기본 / ○ 선택 / – 상담 확인, 영업이 확인한 행만)로 대신한다. 전환 지면의 약속 문구(응답 시간·처리 기간)는 측정하거나 운영이 확인한 값만 쓴다. 얼굴·도판 글자·휘도 하한은 §6-5.
- 가드(P2 신설 5개, 모두 warn 래칫): `heading-accent` · `radius-allowlist`(반경 허용목록) · `text-center-heading`(공개 h1/h2 `text-center`) · `hype-words`(과장어, 인용 데이터 제외) · `small-semibold`(`text-caption`·`text-note`와 `font-semibold`, 폼 라벨·'예시' 예외).

## 7. 구현 순서와 측정

| 단계 | 내용 | 크기 | 화면 변화 |
|---|---|---|---|
| **P0 배선** (커밋 완료) | tokens/utilities/site-base CSS, 토큰 미러 + 테스트, tw-merge, `site` 스코프(AppChrome·Dialog 5곳·토스트), 가드 베이스라인, `lib/format.ts`, DESIGN.md 사실 정정 | M | 정지 화면 0 (iOS 브라우저 크롬 색만). 예외: 동작 줄이기 off 에서 /docs·/l/test1–3 의 Reveal 등장 동작이 조금 바뀜(끝 상태 같음) |
| **P1 빼기 + 보증** (커밋 완료) | 포커스·입력 16px 보증, z 이관 7곳, 스킵 링크 + 중첩 main 정리, 글로우·ping·shimmer·hover scale·backdrop-filter·그라데이션 텍스트 제거, 헤더 높이 고정 | M | 있음 |
| **H 정직성·개인정보 핫픽스** | 디자인 브랜치와 별개로 main에서 진행(별도 세션). SW·홈·About의 금지·근거 없는 숫자 삭제(SW '2,400+ 도입 학원'·'150+ 지원 국가'·1,560,000시간 플랩 카운터·3x·−67%·98%·200+ 기업 고객 등, About '6개 지사'는 운영 확인 뒤 유지 또는 삭제), Manifesto '안 됩니다'·ProblemCost '수밖에' 교정, 블러만 된 개인정보 캡처 교체, 푸터 등 '간주' 동의 문구·`/contact` '답변 평균 대기 시간: 2시간 이내' 삭제, 문서의 Hero 'AI 생성 이미지' 라벨 지시 삭제, `/checkout` 이미지 4파일 동결 가드. 목록 전체는 [고급화 기획 §7](./public-site-premium-elevation-2026-10-28.md) | — | 있음(문구·수치 삭제) |
| **P2-0 결정 기록** | ~~V10–V18 기록(DESIGN.md §9)·V3 보충 교체 반영·시안 보드~~ 완료(2026-10-28). 남은 것: 보드의 iPhone 실기기 + Windows 1366×768 DPR1 확인, 출처 장부 1차 검증 담당자 지정, CTA 라벨 3개·화상 상담 운영 가능 여부 확인 | — | 0 |
| **P2 프리미티브·셸** | 첫 커밋: `globals.css` h1–h4 모바일 `letter-spacing:0 !important` 어드민 전용 이관. 토큰 PR 하나: 자간 표, 굵기(V13), h1 56, 지면·먹 값(V15), 그린 상태값, 헤어라인, 반경 허용목록(V14), `--motion-slow` 900ms·`--motion-beat`·`--ease-fade`·`--focus-offset`(V17). Pretendard 자체 호스팅(C04, V1-A) 뒤 OpenType 기능 확인. 프리미티브: Section(12칸, 공개 surface에서 sheet 제외), 사실 레지스트리(EEO 각주) + Numeral, Button·Input·index-tab·ChapterHead/Kicker(V12)·Card(family column/case/plan)·Figure/Frame(id API, 매트 V16, plate, 여백 캡션, `data-figure`)·TocRow. `lib/cta.ts`, `data/image-credits.json` + 가드 래칫, public/images 정리. 셸: 헤더(로그인·다운로드 강등)·푸터 판권면·뉴스레터 명시 동의 폼·Dialog 퇴장·지연 스켈레톤·공개 RouteTransition 제거·캐럿·탭·거터·도판 현상·포커스 오프셋·떠 있는 크롬 예산, global-error. 가드 5종(warn 래칫, §6-7) | L | 있음 |
| **P3 홈** | V10 11지면 목차와 지면 배정(paper 기본, sunken 3, 먹 1). Hero 무도판 표지(V11) + 정지 지면·잉크 한 획(V17) → EDB 캡처 커밋 시 V3-A. 01 선언, 02 공감 장부 → 03 흐름 ○→● 콜백, 04 화면(영역 캡처 1장 + 매트 + Section 안 마지막 확인 CTA 띠 1, line cta), 05 기록(사례 서류 3 + 인용 4 + EEO 각주 수치 한 줄, 감사 D4 동의 선행), 06 확신 비교표, FinalCTA 왼쪽 정렬. 사례 사진 3장(대구·천안·대치) 한 빛 보정, 도해 작도 기준. 서사 모먼트 1개 = 커밋 1개 | L | 있음 |
| **P4 제품** | 라우트 단위 PR. SW: 히어로 클립(권리 확인 시) 포스터 교체 또는 텍스트 히어로, KeyUseCases 영역 캡처(매트), 여백 캡션. HW: 제품 판 도판(제조사 원본 렌더·CAD, 막히면 스튜디오 1일), AllInOne 먹 장 OPS 한 컷(HW 먹 장은 AllInOne 하나), ValueAnchor는 paper로 옮기고 `surface-ink`·하드코딩 bg 삭제, AICamera는 paper 위 밝은 판, plate ≤2, 사양표 조판(단위 열·tabular·그룹 행·'제조사 사양 기준' 각주), 끝에 견적 구성표. 시네마틱 다크 렌더·우주 화면 퇴역(대체 전 빈 Frame 0) | L | 있음 |
| **P5 콘텐츠·전환** | 라우트 단위 PR. `/pricing` 견적 구성표 + 상단 카드 3→2장, `/contact` 절차 3행·정적 지도·serif 0 + 5개 폼 성공 패널, 블로그 장문 사다리 + 1px 읽기 괘선(블로그 세션 렌더러 커밋 뒤), About EEO 수치 각주 행·스톡 정리(장부 근거 기록 뒤), OG·카카오 공유 카드(C28 안에서 paper·먹 제목·Kicker 라벨), 현장 촬영 12컷(동의 학원 1곳), V18 명조 재판정 보드(문구 동결 뒤). 정적 랜딩 `/l/*`는 백로그 | M | 있음 |

순서 규칙
- 순서는 H → P2-0 → P2 → P3 → P4 → P5다. H는 감사 W0 핫픽스 뒤, P2 전에 main에서 디자인 브랜치와 별개로 진행한다.
- DESIGN.md §9 V10–V18 기록은 끝났다(2026-10-28). 출처 장부 담당·CTA 라벨 확인 전에는 Figure 가드·CTA 사전 PR을 머지하지 않는다.
- P2 첫 커밋은 `globals.css`의 h1–h4 모바일 `letter-spacing:0 !important`를 어드민 전용 셀렉터로 옮기는 것이다(어드민 diff 0). 그 다음에 `tokens.css`의 (width < 40rem) 자간 재정의를 줄인 음수 표로 바꾸고 375·390 computed letter-spacing을 확인한다.
- V15 토큰 PR은 `surface-ink`에 붙은 하드코딩 bg(`Footer.tsx`·`FinalCTA.tsx`의 `bg-[#111110]`, Hero, `sw/page.tsx` 두 곳, `BlogPageClient.tsx`)와 `surface-ink` 없이 `bg-[#111110]`인 `Manifesto.tsx`를 같은 PR에서 정리한다. 그래야 토큰 값이 실제로 반영된다. `ValueAnchor.tsx`는 먹 장이 아니므로 P4-HW에서 paper로 옮기며 `surface-ink`와 하드코딩 bg를 함께 지운다. `lib/design-tokens.ts` 미러, `global-error.tsx`, `opengraph-image.tsx`, `layout.tsx` viewport theme-color, 대비 테스트도 같은 커밋에서 바꾼다.
- OpenType 기능(ss05·cv12·ss03)은 Pretendard 자체 호스팅(C04) 뒤에만 확인한다.
- P3 홈 첫 커밋은 V10 목차를 따른다. 삭제 섹션의 내용은 SW·블로그로 옮겨 색인을 유지한다(KeyUseCases → SW, ScienceBased → 각주 단 블로그 글).
- `#A39E98`은 hex→hex로 치환하지 않는다. Footer·SW·HW 다크 구간을 `surface-ink`로 옮긴 **뒤에** hex→토큰으로만 바꾼다(먹 위에서 `#615D59`로 바꾸면 2.90:1로 떨어진다).
- 출처를 확인한 도판은 대체 도판이 들어간 뒤에만 뺀다. 출처를 확인하지 못한 도판은 라우트 PR에서 교체하거나 텍스트로 대체하고(빈 Frame 0), Hero의 현 도판은 V11 무도판 표지로 내린다.
- 블로그 장문 사다리(P5)는 블로그 세션의 렌더러 커밋 뒤에 착지한다.
- `app/globals.css`·`MobileFloatingCTA.tsx`는 다른 세션이 작업 트리에서 고치고 있다. 그 변경이 들어간 뒤에 시작한다.
- 감사 W0 핫픽스(동의 모드·추적 수정)를 먼저 배포한다. 동의율이 바뀌면 지표 표본이 바뀌기 때문이다.

단계 게이트
- H: 소스 정규식은 쓰지 않는다('3x'가 `text-3xl`에 걸리고, 카운트업은 SSR에서 0, '-67%'는 ASCII). 하이드레이션 뒤 렌더 텍스트를 브라우저 도구로 검사해 대상 문자열 0건. `/admin` 스크린샷 차이 0, `/checkout` 이미지 4파일 존재. 문서의 Hero 'AI 생성 이미지' 라벨 지시 0건.
- P2-0: 운영자 선택이 DESIGN.md §9에 V10–V18로 기록됨.
- P2: `tests/design/surface-contrast.test.ts` 기준을 조작 경계 ≥3.2 · muted ≥5.5(밝은 지면) · 먹 위 읽는 글자 ≥4.5로 올려 통과. 375·1440 computed style이 토큰 값과 일치(자간 0 아님). `/admin`·`/checkout` 스크린샷 차이 0. 세리프 woff2 0, Pretendard 조각 세트 동일(자체 호스팅 뒤 같은 출처로 이동). Lighthouse 모바일 3회 중앙값 LCP 악화 <0.3s, CLS ≤0.05. axe 0건. 포커스 스크린샷 8종에서 이중·삼중선 0.
- P3: 홈 1440 길이 ≤11,500px, 375 ≤16,000px. `[data-surface]` 11 + 푸터(04 화면 CTA 띠는 세지 않음), `[data-surface=sheet]` 0 · sunken ≤3 · ink 1, 지면 바뀜 ≤6. `[data-moment]` 4. '한 흐름' 주장 ≤2회. Lighthouse LCP 요소 = H1. 배포 14일 뒤 홈 경유 리드가 기준선 대비 −10% 미만.
- P4: HW 먹 장 외 도판 평균 휘도 ≥100. 장부 미검증 도판 0. HW `[data-surface=ink]` = 1, plate 예산 준수. 모든 render 행 origin 확인.
- P5: `/contact` font-serif 0 · iframe 0. 리드 성공 토스트 0, 전환 이벤트 수 배포 전후 동일. 뉴스레터 동의 체크박스 기본 off · 동의 기록 저장. 7일 `/contact` 제출 −10% 미만. 블로그 본문 max-width ≤646px.

측정
- 검수 기기(P2-0부터 상시): 모든 보드와 게이트를 iPhone 실기기와 Windows Chrome 1366×768 DPR1(ClearType) 두 환경에서 본다. computed style·뷰포트별 개수·`/admin` 픽셀 비교는 저장소 의존성 밖 브라우저 도구(gstack browse)로 돌리고, 새 devDependency는 0이다.
- 기준선: P1 배포 전 14일(W0 핫픽스 배포 뒤 시작).
- 지표: CTA 클릭률(`client_events` 비율만, 분석 동의자만 적재됨), 리드 제출 일별 건수(`leads`·`showroom_bookings`), Lighthouse 모바일 3회 중앙값(LCP·CLS)과 INP. 운영 DB 집계는 `tmp/` 읽기 전용 스크립트를 운영자가 실행한다.
- 되돌림 트리거(하나라도 생기면 해당 PR revert): 라우트 리드 제출 7일 합계 10% 이상 감소 · 랩 LCP +0.3s 이상 · CLS 0.05 초과 · `/admin` 스크린샷 차이 발생. 기능 플래그는 두지 않는다.

## 8. DESIGN.md 변경 요약

P0 PR에서 토큰·사실을, 각 구현 PR에서 해당 절을 같은 커밋으로 고친다. 상세는 [system.md §10](./public-site-design-language-2026-10-26/system.md)과 요소 스펙의 "DESIGN.md 반영안" 절.

1. 머리말 아래 "적용 범위" 블록: 절마다 `[public]`·`[admin]`·`[공통]`, 토큰마다 `in force`·`target`·`retired` 배지.
2. 사실 정정: 폰트(Inter → Pretendard Variable), `#A39E98` 용도(텍스트 금지, 플레이스홀더는 `#78736D`), 대비 수치(보조 텍스트 6.53:1, 그린 CTA 10.71:1). P2 토큰 PR에서 V15 값 기준으로 다시 고친다(paper 위 muted 6.14 · accent 10.08).
3. §2 토큰 표를 20색 + 먹 재정의로 교체. 값은 V15-A(paper `#F9F8F5` · sunken `#F3F2EE` · skeleton `#EFEEE9` · line-control `#8A857F` · 먹 면 `#1A1917`)와 그린 상태값(hover `#073D2D`, 먹 위 세이지 `#8FC4AC`)을 따른다. 그린 서피스 스케일은 공개 화면 `retired`, 어드민은 유지. §3 굵기 4단은 아직 DESIGN.md에 없다(typography §9 반영안에만 있음). P2 토큰 PR에서 V13-A 값(poster 700, display·h1·h2·h3·numeral 600)으로 넣는다.
4. §5 레이아웃을 공개(5-A)와 어드민(5-B)으로 분리, 레이어 스택(5-C) 신설.
5. 표기 규칙 절 신설(`1,200` · `1,200,000원` · `2026.10.26` · `10월 26일(월)`), `lib/format.ts`만 사용.
6. 결정 로그 절 신설: V1–V9 "선택 A, 2026-10-27 운영자 승인". V10–V18 "선택 A, 2026-10-28 운영자 승인"을 P2-0에서 더하고, V3 행의 보충 문장을 V11-A 문장(§5 V3 보충)으로 바꾼다.
7. 중복 문구를 DESIGN.md 링크로 교체: `docs/active/playbook/01-home-front.md`의 배경 교차·`.section-*`·모바일 자간, `AGENTS.md`의 "UI 작업 시 필수 체크" 배경 교차 항목.

## 9. 감사 문서 동기화

[감사 문서](./public-site-audit-motion-plan-2026-10-26.md) §5의 다음 문구는 이 문서와 어긋난다. P0 PR에서 같이 고친다. §5-4·§5-6은 2026-10-28 고급화 개정으로 목표 값이 다시 바뀌었으므로 아래 값으로 맞춘다.

- §5-2: `--motion-story` 줄과 `lib/motion.ts` 줄 삭제(소비처 0).
- §5-4: LogoBar 마키 → 정적 목록. 목록은 X16 개정(2026-10-28)에 따라 숫자 없이 공개 동의 이름만 가나다순, 6곳 미만이면 렌더하지 않음('앞 12곳 + 외 N곳' 아님).
- §5-5-5: 헤더 전환 400ms → 320ms.
- §5-6: 획 1.75 → V6(1.5px), `#A39E98` → `--line-control`(`#8A857F`, V15-A), 배경 리듬 → V4·V10, pill → V9. 먹 위 차트 강조 `#6EE7B7` → 세이지 `#8FC4AC`.
- §5-8: "예외는 정지 가능한 마키와 히어로 영상 둘" → "홈 무한 루프 0(예외 없음)", "읽기 시간보다 빠른 자동 전환" → "자동 진행 0".

## 10. 상세 스펙과 정본 규칙

### 스펙 파일

| 파일 | 다루는 것 |
|---|---|
| [system.md](./public-site-design-language-2026-10-26/system.md) | 레이아웃·레이어 스택·토큰 배선·CSS 파일 구조·가드·사실 레지스트리·표기 유틸·롤아웃 |
| [typography.md](./public-site-design-language-2026-10-26/typography.md) | 서체 로딩·타입 스케일·잉크 밑줄·Kicker·숫자·OG |
| [surfaces.md](./public-site-design-language-2026-10-26/surfaces.md) | 색 토큰·지면·먹 재정의·섹션 배경·홈 시퀀스·그림자 |
| [cards_motion.md](./public-site-design-language-2026-10-26/cards_motion.md) | 카드 8종·hover·서사 모먼트·Reveal·모션 예산 |
| [icons.md](./public-site-design-language-2026-10-26/icons.md) | 아이콘 라이브러리·획·크기·색·고유 아이콘·브랜드 마크 |
| [imagery.md](./public-site-design-language-2026-10-26/imagery.md) | 출처 라벨·Frame·차트·사진 비율·영상·이미지 정리 |
| [controls.md](./public-site-design-language-2026-10-26/controls.md) | 버튼·링크·칩·폼·내비·탭·표·토스트·Dialog·상태 화면·플로팅 |

스펙끼리 다르면 아래 정본 규칙이 이긴다. 각 스펙의 "정본 편차" 절은 기술 근거가 있는 의도적 편차이고 운영자 확인 대상이다(system §13). 2026-10-28 고급화 개정으로 바뀐 규칙의 지금·바뀌는 것 대조는 [고급화 기획 §5](./public-site-premium-elevation-2026-10-28.md)에 있다. ID가 없는 새 규칙 '정직 지면 규칙'은 같은 표의 NEW 행이 정본이다(요약은 §6-7).

### 정본 규칙 색인 (C01–C28 · X01–X16)

| ID | 주제 | ID | 주제 |
|---|---|---|---|
| C01 | `.surface-ink` 정의 위치와 먹 위 값 | C23 | 조작 경계선 색 `--line-control` |
| C02 | Tailwind 색 유틸 어휘(유틸 = 변수 이름) | C24 | 한 페이지 번호 체계 2종 이하 |
| C03 | 결정 번호(V1–V18 · 감사 D#) | C25 | 잉크 밑줄 정의와 모션 |
| C04 | Pretendard 자체 호스팅 방식 | C26 | ai-report '현행 유지' 범위 |
| C05 | Frame '예시 화면' 표기와 캡션 문법 | C27 | 헤더 전환 320ms · theme-color |
| C06 | 차트 서버 SVG · opacity 순차 | C28 | OG 폰트 |
| C07 | 홈 무한 루프 0 · 자동 진행 0 | X01 | 색 토큰 20개와 폐기 토큰 |
| C08 | 서사 모먼트 상한 6 · ProblemCost 정성 장부 | X02 | 브레이크포인트 단일 정의 |
| C09 | Hero 오른쪽 5칸(출처 확인 캡처만, 없으면 무도판 표지)과 LCP | X03 | ghost 버튼 = 텍스트 링크 |
| C10 | Display·Poster 사용처 | X04 | masthead 먹선(정적) |
| C11 | 아이콘 세부(Sparkles 퇴역·색·IconFrame·획) · 비상호작용 그린 예산 | X05 | 그림자는 떠 있는 레이어만(제품 렌더 구운 접지 그림자 예외) |
| C12 | 탭·내비 활성 표시(index-tab) | X06 | 사례 3:2 · 홈 사례 3건 정적 · 인용 ≤4 |
| C13 | 링크 카드·목차 행 hover 끝 상태 | X07 | Reveal API와 무장 조건 |
| C14 | 먹 위 컨트롤 0 · 푸터 판권면 | X08 | reduced-motion 스피너 |
| C15 | 버튼 변형·크기 이름 · CTA 라벨 사전 | X09 | z-index 레이어 스택 |
| C16 | 입력 글자 16px 하한 | X10 | Figure/Frame(id API · 매트) |
| C17 | 공개 스코프 `site` 클래스 | X11 | 정직 라벨 6종(출처 장부에서 파생) |
| C18 | 타입 스케일 15종 · 굵기 · tw-merge | X12 | 링크 유틸 |
| C19 | 섹션 배경 plain · 홈 11지면 지면 배정 | X13 | 모션·비색 토큰 단일 정의 |
| C20 | 서체 수(Pretendard 하나) | X14 | 숫자 글리프(표 tabular · 단독 비례) |
| C21 | 좌측 2px 바 3곳 · 추천 표시 | X15 | Kicker 범위와 Act 이름 |
| C22 | Kicker 구성(먹 라벨, 바 없음) · Hero 폴리오(null은 Hero만) | X16 | LogoBar 동의 이름 목록 |

## 11. 열린 질문 (운영자 확인)

1. **V1–V9 · V10–V18 승인.** 해결됨: 2026-10-27 운영자가 V1–V9를, 2026-10-28 V10–V18을 모두 A로 승인했다(DESIGN.md §9 결정 로그). V11-A로 V3 보충 문장이 바뀌었다(§5).
2. **Hero 도판 출처.** V11-A에 따라 Hero는 출처를 확인한 캡처가 커밋되기 전까지 무도판 표지이므로, 출처 확인이 Hero를 막지 않는다. `hero-dashboard.webp`와 `writing-experience-classroom.webp`는 출처 장부 1차 검증 대상이고, 검증 전에는 라벨을 짐작해 달지 않고 공개 화면에 싣지 않는다. 최종 도판은 테스트 계정 EDB 밝은 캔버스에 강사가 직접 쓴 중2 수학 '일차함수' 한 페이지 캡처(1920×1200 ≤400KB, 모바일 전달 ≤120KB, 데스크톱 eager·preload 없음, 모바일 lazy)다. 캡처 담당은 고급화 기획 §12.
3. **사실 레지스트리 초기 항목.** EEO 수치(company-facts §3)는 source 'EEO 공식 소개(classin.com)', asOf '2026-06'으로 등록하기로 정했다(§6-7). 남은 것은 근거 보관·법무 확인 담당(고급화 기획 §9)과 그 밖에 화면에 남길 수치의 등록 담당·기한(감사 D3과 같은 질문)이다. 등록 전에는 출처 없는 수치가 화면에서 빠진다.
4. **모바일 토스트 높이.** 정본 72px(플로팅 CTA 위 +44+12) 대 제안 80px(챗봇 런처와 틈 8px). 결정 전 기본은 80px.
5. **채널톡 버블.** 지금은 부트 시 버튼을 숨긴다(`lib/channel-talk.ts:146`). 현행 유지가 기본이고, 이때 플로팅 겹침은 0이다.
6. **필드 LCP 측정.** `@vercel/speed-insights`(새 의존성)를 들일지. 기본은 들이지 않고 랩 지표와 리드 지표로만 판정한다.
7. **실기기 확인 담당과 날짜.** iPhone Safari · 삼성 인터넷 강제 다크 · 카카오톡 인앱 · DPR1 1366×768.
8. **어드민의 `color-scheme: only light`.** 루트 viewport 설정이라 어드민에도 적용된다. 어드민에 다크 테마가 없어 기본은 수용.
9. **정본 편차 10건 일괄 승인**(system §13).
10. **고급화 개정에서 생긴 질문.** [고급화 기획 §12](./public-site-premium-elevation-2026-10-28.md) 2–12번이 정본이다: 출처 장부 1차 검증 담당, CTA 라벨 3개·화상 상담 선택지, EDB 판서 캡처 담당과 테스트 계정, 제조사 원본 렌더·CAD 요청 또는 스튜디오 1일 예산, 담당자 연락 시점(SLA) 운영 확인 값, 법정 표기 값, 단색 먹 워드마크, 챗봇 런처 쉬는 상태 합의, ScienceBased Freeman 인용 처리, About '6개 지사·도시'와 `/checkout` 생성 추정 이미지 2장, 현장 촬영 동의 학원 후보.
11. **요금 시뮬레이터 공개 유지.** 금액 0 규칙(§6-7)은 `/pricing/simulator`·`/pricing/simulator/krw`를 예외로 둔다. 시뮬레이터를 공개 화면으로 계속 둘지는 운영자가 정한다(2026-10-28).
