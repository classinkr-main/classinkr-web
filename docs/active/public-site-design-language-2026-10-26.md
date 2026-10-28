# 공개 사이트 디자인 언어 — 편집 지면 · OS판

기준 시점: 2026-10-26 (HEAD `4c9e509c` + 미커밋 작업 트리)
상태: **기획 확정 전.** 운영자 결정 V1–V9는 모두 기본안 A로 그려 두었고, 승인 전까지 코드는 바꾸지 않았다.
범위: 공개 셸(`.site`). `/admin`·`/checkout`·`/receipt`는 제외하고, 모든 단계의 수용 조건은 "어드민 무변경"이다.

관련 문서
- [공개 사이트 전수 점검·모션 디벨롭 기획](./public-site-audit-motion-plan-2026-10-26.md) — 코드 점검(P0·P1·P2)과 모션 기획. 이 문서는 그 §5(모션)를 디자인 전반으로 넓힌 후속이다. 그 문서의 결정 D1–D8은 여기서 **감사 D#**으로 부른다.
- 상세 스펙 7종: [public-site-design-language-2026-10-26/](./public-site-design-language-2026-10-26/) (§10 목록)
- 시안 캔버스(비공개 artifact, 보드 15장): https://claude.ai/artifact/QShWLdYRgZCZTy957gHtyx
- 현행 디자인 정본: [DESIGN.md](../../DESIGN.md). 이 문서가 승인되면 §8의 변경을 DESIGN.md에 반영한다.

---

## 1. 요약

- **방향은 「편집 지면 · OS판」이다.** 학원 원장이 읽는 잘 편집된 교육 전문지에, 수업 OS의 상태 표기(● ○ –)와 정직한 화면 도판을 접목했다.
- **면은 4장, 그린은 잉크.** paper `#FAFAF8` · sheet `#FFFFFF` · sunken `#F6F5F4` · 먹 `#111110`. 그린 `#084734`는 글자·밑줄·막대·점·primary 버튼에만 쓰고 면을 칠하지 않는다. 민트 `#ECFDF5`·`#D1FAE5` 면은 공개 화면에서 0이 된다(`::selection`만 남김).
- **서체는 Pretendard 하나.** 자체 호스팅, 세리프 0, 모노는 시스템 스택(코드·쿠폰 입력만).
- **섹션은 괘선과 여백으로 나눈다.** Act 머리의 1px 먹선(masthead), 그림자 0(떠 있는 레이어만 예외), 섹션 배경 처리는 plain 하나.
- **움직임은 투명도.** 홈 무한 루프 0, 자동 진행 0, 카운트업 0, 선 긋기(stroke-dashoffset) 0. 홈 서사 모먼트는 5개(상한 6)이고 각각 한 번만 재생한다. reduced-motion이면 완성 상태로 멈춘다.
- **숫자와 이미지는 정직하게.** 화면 수치는 출처 있는 것만(`lib/facts.ts`), 도판에는 출처 라벨 6종 중 하나를 반드시 단다. 목업은 "예시 화면" 점선 태그.
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
5. **조작할 수 있는 것만 경계가 진하다.** 입력·line 버튼·칩·스위치 테두리는 `--line-control #8F8A84`(흰 바탕 3.42:1), 나머지 구획선은 hair `rgba(17,17,16,.08)`.
6. **움직임은 의미가 있을 때 한 번.** 모션은 opacity·색·2px 이동뿐이다. height·padding·box-shadow 애니메이션과 `transition-all`은 쓰지 않는다.
7. **가드는 래칫.** 새 위반은 0, 기존 위반은 줄기만 한다(`scripts/check-design-tokens.mjs` 확장).
8. **측정한 뒤 다음 단계.** 라우트 단위 PR, 기준선 14일, 미리 합의한 되돌림 트리거(§7).

## 5. 운영자 결정 V1–V9

방향 문서의 결정은 V(visual)로 번호를 매긴다. 감사 문서의 D1–D8과 섞이지 않게 하기 위해서다. 승인 전까지 보드와 스펙은 모두 **A**로 그렸다.

| # | 질문 | 기본안 A | 대안 | A를 권하는 이유 |
|---|---|---|---|---|
| V1 | Pretendard 로딩 | 자체 호스팅(`public/fonts/pretendard-1.3.9/`, woff2 92조각, 라틴 preload 1개, 1년 캐시) | B 시스템 폰트 우선(애플 기기 0바이트, 라틴 일부 SF) | 타이포가 곧 브랜드라 기기 간 동일성이 우선. iPhone 4G LCP를 전후로 재고 나빠지면 B로 전환(비용 0) |
| V2 | 인용 세리프 | 세리프 없음, 인용은 Pretendard 500 | B Noto Serif KR(인용만, 300KB 예산) · C MaruBuri 서브셋 | 0바이트. B는 시안 비교 칸에서만 확인 |
| V3 | 홈 Hero | 지면 표지: paper, 7/5 분할, 오른쪽 EDB 판서 실제 화면 캡처, 영상 없음, LCP = H1 | B 현행 sticky 다크 영상 + 스크림 | LCP·가독성·모바일 첫 화면 CTA. 극적 대비는 Manifesto 먹 지면이 맡음 |
| V4 | 배경 리듬·공감 Act | 서사 먹은 Manifesto 1곳 + Footer. ProblemCost는 sheet 위 정성 장부 6행(수치 0) | B 다크 꼭짓점 5곳 | 다크가 하나여야 전환점이 선다 |
| V5 | FinalCTA | sunken 띠 + 이중 괘선 + primary 52 + 텍스트 링크 | B 먹 패널 + 채움 버튼 | 먹 위 채움 버튼 논쟁을 "먹 위 채움 0"으로 해소 |
| V6 | 아이콘 획 | 1.5px, DPR1 화면은 2px | B 1.75px | 16px 인라인이 흐리면 B |
| V7 | 카드·배경 애니메이션 | 항상 정지. 링크 카드 hover는 경계 진하게 + 화살표 2px | B 대표 카드 conic 테두리 빛 1회 | 테두리 빛은 'AI 분석 중' 클리셰, 거부된 그라데이션 하이라이트 |
| V8 | 입력 필드 | 박스형(sheet + 1px `#8F8A84` + r6, 높이 44/48) | B 밑줄형 | 40~50대에게 "여기에 쓰는 칸" 인지가 가장 분명 |
| V9 | Hero 배지 | 삭제하고 Kicker(16×2 바 + '수업 시스템 OS')로 대체 | B 아웃라인 pill 1개 | 위계 장치가 하나로 준다. 비상호작용 pill 0 |

V3 보충: 실제 화면 캡처를 확보하기 전에는 현재 도판을 유지한다. 현재 도판과 시안의 대체 도판(`writing-experience-classroom.webp`)은 **출처가 확인되지 않았다**. 실사인지 생성 이미지인지 확인한 뒤 라벨('사진 · {제공처}' 또는 'AI 생성 이미지')을 정한다. 시안 보드에는 '출처 확인 필요'로 적어 두었다.

## 6. 요소별 핵심 규격

값의 정본은 각 상세 스펙이다. 여기에는 결정에 필요한 것만 옮긴다.

### 6-1. 타이포그래피 ([typography.md](./public-site-design-language-2026-10-26/typography.md))
- Pretendard Variable 하나. 400/500/600/700.
- 글자 크기 토큰 15종: poster · display · h1 · h2 · h3 · body-l · body · article · ui · caption · note · label · folio · numeral · quote.
- `text-display`(40→72/700)는 Hero H1 전용, `text-poster`(48→104/700)는 Manifesto 전용. FinalCTA 제목은 h2에 `text-h1`(32→48).
- 본문 16/1.75, 덱 17→19, 읽기 폭 38em. 모바일(<40rem)에서 자간 토큰은 한 번에 0.
- 잉크 밑줄: `text-decoration: underline 2px` 하나(줄바꿈마다 붙음, nowrap 금지).
- Kicker(폴리오 + 16×2 바 + 라벨)는 Act·장 머리 전용. 홈은 Hero 1 + Act 01–06.
- 숫자는 `tabular-nums`만. 카운트업 0.
- OG 이미지는 Pretendard 정적 OTF(Regular·Bold)를 Node 런타임에서 읽어 그린다.

### 6-2. 색·표면 ([surfaces.md](./public-site-design-language-2026-10-26/surfaces.md))
- 색 토큰 20개: `--surface-{paper, sheet, sunken, ink, skeleton, scrim}`, `--fg-{ink #111110, body #31302E, muted #615D59, placeholder #78736D, faint #A39E98(장식 전용), accent #084734, …}`, `--line-{hair .08, strong .16, ink, control #8F8A84, link}`.
- `#A39E98`은 글자 금지(장식선·비활성 표시만).
- 먹 지면(`surface-ink`) 위 재정의: 글자 `#FAFAF8`, 본문 /.72, 액센트 `#6EE7B7`, 오류 `#E89A94`. 먹 위 채움 버튼 0.
- 그림자는 `--shadow-deep` 하나, 떠 있는 레이어(Dialog·드롭다운·토스트·모바일 메뉴)만.
- 모눈은 도해 figure 자체 바탕으로 페이지당 1개(48px, 40rem 이상 56px).
- 홈 시퀀스: Hero(paper) → LogoBar(sunken) → 01 선언(sheet) → 02 시대(paper) → 03 공감(sheet) → 리드마그넷(sunken) → Manifesto(먹) → 04 솔루션(sunken) → … → 06 확신(sheet) → FinalCTA(sunken) → Footer(먹).

### 6-3. 카드·모션 ([cards_motion.md](./public-site-design-language-2026-10-26/cards_motion.md))
- 카드 8종: 인덱스 · 수치 · 인용 · 사례 · 요금 · 목차 행 · Frame · CTA 띠. 반경은 8·12, 그림자 0.
- 링크 카드·목차 행·FAQ 행의 hover: 경계 hair→strong + 화살표 2px, 160ms. 그 밖은 변하지 않는다.
- 홈 서사 모먼트 5개(`data-moment`): ① Hero 잉크 밑줄 색 페이드(700ms, 지연 240ms) ② Manifesto 두 줄 스크롤 스크럽 ③ 04 솔루션 OS 지도 ● 6개 점등(.25→1, 80ms 간격) ④ 차트 opacity 순차 ⑤ Comparison Classin 열 좌측 바.
- 시간 토큰: 160 / 320 / 700ms, `--ease-soft cubic-bezier(.22,1,.36,1)`.
- Reveal: 마운트 때 이미 화면 안이면 무장하지 않는다. reduced-motion·IO 미지원도 무장하지 않는다.
- SolutionOverview는 수동 탭, 사례 캐러셀은 수동 넘김. 자동 진행 0.

### 6-4. 아이콘 ([icons.md](./public-site-design-language-2026-10-26/icons.md))
- lucide-react 하나. Classin 고유 사물(전자칠판·수업 도구 26종·가이드 4종)만 Lucide 규격으로 직접 그려 등록한다.
- 획 `--stroke-pen` 1.5px(DPR1 2px), 크기 16/20/24/32만, IconFrame 40/48(투명 바탕, 1px hair, r8).
- 기본색은 글자 상속, 단독 아이콘은 `--fg-muted`. 그린 아이콘은 활성 IconFrame·추천 요금제 Check·완료 표지에만, 한 화면에 한 그룹까지.
- Sparkles 퇴역(AI는 글자 'AI'). 타일·채움 원·그라데이션·이모지 금지. 순서는 번호, 상태는 ● ○ –.
- 브랜드 마크는 벡터 원본과 단색화 승인 전까지 보류.

### 6-5. 이미지·도판 ([imagery.md](./public-site-design-language-2026-10-26/imagery.md))
- 출처 라벨 6종(`FigureSource` 타입으로 강제): `사진 · {제공처}` / `예시 연출` / `AI 생성 이미지`(분위기 컷만, 제품·UI·얼굴 금지) / `제품 렌더` / `실제 화면 · YYYY.MM 캡처` / 목업은 Frame 안 점선 태그 `예시 화면`.
- Frame: sheet + 1px hair + r8, 제목줄·창틀·그림자 없음. 캡션은 도판 아래 1px hair 뒤 왼쪽 설명 + 오른쪽 출처.
- 차트는 서버 SVG(공개 화면 Recharts import 0). 등장은 opacity 순차 하나.
- 비율: 화면 캡처 16:10, 사례 사진 3:2, 인물 4:5. 4:3 폐기.
- 개인정보: `admin-dashboard-source-2.webp`의 휴대폰 번호·닉네임은 블러만 되어 있어 재마스킹이 필요하다.
- 미참조 이미지 65개(약 25.9MB) 정리는 별도 커밋.

### 6-6. 컨트롤 ([controls.md](./public-site-design-language-2026-10-26/controls.md))
- 버튼 변형 3개(default · line · ghost=텍스트 링크), 크기 3개(md 44 · cta 52 · icon-md 44×44).
- 포커스는 `2px solid --fg-accent`, offset 2를 보증 규칙 하나로(먹 위 자동 `#6EE7B7`). 입력 글자 16px 하한도 보증 규칙.
- 탭·내비 활성: 탭마다 2px 막대 opacity 0→1(160ms), 글자 15/500 고정. 움직이는 인디케이터 없음.
- 좌측 2px 바는 세 곳만: Comparison Classin 열, /pricing 선택 행, 세로 목차 현재 항목. 토스트 상태선 폐기.
- 스위치: 트랙 채움 없음(1.5px 테두리 + 썸 이동). 체크·라디오는 네이티브 20px + accent-color.
- 모바일 플로팅 CTA는 아웃라인(글래스·펄스·그림자 0). 쿠키 배너가 열리면 플로팅 CTA·챗봇 런처는 숨김.
- 새로 정한 것: StateBlock(404·오류·빈 상태), 스킵 링크 + 단일 `<main>`, 푸터 법정 표기, Breadcrumb·Pagination 한 줄 규격.

### 6-7. 레이아웃·레이어·토큰 배선 ([system.md](./public-site-design-language-2026-10-26/system.md))
- 브레이크포인트: Tailwind 기본(sm 40 · md 48 · lg 64 · xl 80rem). 원시 CSS는 범위 문법만.
- 거터 16 / 24 / 48, page 1296 → 콘텐츠 1200, 글 칼럼 45rem, 문단 38em.
- 섹션 리듬: base 64/96 · act 80/128 · band 40/48. 헤더 높이 76/80 고정.
- z 토큰: subnav 30 · header 40 · floating 42 · chatbot 44 · consent 46 · skiplink 60 (+ 공유 기본값 Dialog 50 · 토스트 9999).
- 새 CSS 파일 3개(`app/styles/{tokens,utilities,site-base}.css`)와 `globals.css`의 `@import` 3줄. 새 공개 규칙은 `globals.css`에 쓰지 않는다.
- 새 파일 9개, 테스트 4개, 새 의존성 0.

## 7. 구현 순서와 측정

| 단계 | 내용 | 크기 | 화면 변화 |
|---|---|---|---|
| **P0 배선** | tokens/utilities/site-base CSS, 토큰 미러 + 테스트, tw-merge, `site` 스코프(AppChrome·Dialog 5곳·토스트), 가드 베이스라인, `lib/format.ts`, DESIGN.md 사실 정정 | M | 0 (iOS 브라우저 크롬 색만) |
| **P1 빼기 + 보증** | 포커스·입력 16px 보증, z 이관 7곳, 스킵 링크 + 중첩 main 정리, 글로우·ping·shimmer·hover scale·backdrop-filter·그라데이션 텍스트 제거, 헤더 높이 고정 | M | 있음 |
| **P2 프리미티브·셸** | Section, 사실 레지스트리 + Numeral, Button·Input·index-tab·Kicker·Card·Figure/Frame·TocRow, 헤더·푸터·Dialog, global-error | L | 있음 |
| **P3 홈** | Act 순서대로, 서사 모먼트 1개 = 커밋 1개 | L | 있음 |
| **P4 제품 / P5 콘텐츠·전환** | 라우트 단위 PR. 정적 랜딩 `/l/*`는 백로그 | L / M | 있음 |

순서 규칙
- `#A39E98`은 hex→hex로 치환하지 않는다. Footer·SW·HW 다크 구간을 `surface-ink`로 옮긴 **뒤에** hex→토큰으로만 바꾼다(먹 위에서 `#615D59`로 바꾸면 2.90:1로 떨어진다).
- 대체 도판이 들어간 뒤에만 기존 도판을 뺀다.
- `app/globals.css`·`MobileFloatingCTA.tsx`는 다른 세션이 작업 트리에서 고치고 있다. 그 변경이 들어간 뒤에 시작한다.
- 감사 W0 핫픽스(동의 모드·추적 수정)를 먼저 배포한다. 동의율이 바뀌면 지표 표본이 바뀌기 때문이다.

측정
- 기준선: P1 배포 전 14일(W0 핫픽스 배포 뒤 시작).
- 지표: CTA 클릭률(`client_events` 비율만, 분석 동의자만 적재됨), 리드 제출 일별 건수(`leads`·`showroom_bookings`), Lighthouse 모바일 3회 중앙값(LCP·CLS)과 INP. 운영 DB 집계는 `tmp/` 읽기 전용 스크립트를 운영자가 실행한다.
- 되돌림 트리거(하나라도 생기면 해당 PR revert): 라우트 리드 제출 7일 합계 10% 이상 감소 · 랩 LCP +0.3s 이상 · CLS 0.05 초과 · `/admin` 스크린샷 차이 발생. 기능 플래그는 두지 않는다.

## 8. DESIGN.md 변경 요약

P0 PR에서 토큰·사실을, 각 구현 PR에서 해당 절을 같은 커밋으로 고친다. 상세는 [system.md §10](./public-site-design-language-2026-10-26/system.md)과 요소 스펙의 "DESIGN.md 반영안" 절.

1. 머리말 아래 "적용 범위" 블록: 절마다 `[public]`·`[admin]`·`[공통]`, 토큰마다 `in force`·`target`·`retired` 배지.
2. 사실 정정: 폰트(Inter → Pretendard Variable), `#A39E98` 용도(텍스트 금지, 플레이스홀더는 `#78736D`), 대비 수치(보조 텍스트 6.53:1, 그린 CTA 10.71:1).
3. §2 토큰 표를 20색 + 먹 재정의로 교체. 그린 서피스 스케일은 공개 화면 `retired`, 어드민은 유지.
4. §5 레이아웃을 공개(5-A)와 어드민(5-B)으로 분리, 레이어 스택(5-C) 신설.
5. 표기 규칙 절 신설(`1,200` · `1,200,000원` · `2026.10.26` · `10월 26일(월)`), `lib/format.ts`만 사용.
6. 결정 로그 절 신설: V1–V9 초기값 "기본안 A(미확정)".
7. 중복 문구를 DESIGN.md 링크로 교체: `docs/active/playbook/01-home-front.md`의 배경 교차·`.section-*`·모바일 자간, `AGENTS.md`의 "UI 작업 시 필수 체크" 배경 교차 항목.

## 9. 감사 문서 동기화

[감사 문서](./public-site-audit-motion-plan-2026-10-26.md) §5의 다음 문구는 이 문서와 어긋난다. P0 PR에서 같이 고친다.

- §5-2: `--motion-story` 줄과 `lib/motion.ts` 줄 삭제(소비처 0).
- §5-4: LogoBar 마키 → 정적 목록(앞 12곳 + '외 N곳').
- §5-5-5: 헤더 전환 400ms → 320ms.
- §5-6: 획 1.75 → V6(1.5px), `#A39E98` → `#8F8A84`, 배경 리듬 → V4, pill → V9.
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

스펙끼리 다르면 아래 정본 규칙이 이긴다. 각 스펙의 "정본 편차" 절은 기술 근거가 있는 의도적 편차이고 운영자 확인 대상이다(system §13).

### 정본 규칙 색인 (C01–C28 · X01–X16)

| ID | 주제 | ID | 주제 |
|---|---|---|---|
| C01 | `.surface-ink` 정의 위치와 먹 위 값 | C23 | 조작 경계선 색 `--line-control` |
| C02 | Tailwind 색 유틸 어휘(유틸 = 변수 이름) | C24 | 한 페이지 번호 체계 2종 이하 |
| C03 | 결정 번호(V1–V9 · 감사 D#) | C25 | 잉크 밑줄 정의와 모션 |
| C04 | Pretendard 자체 호스팅 방식 | C26 | ai-report '현행 유지' 범위 |
| C05 | Frame '예시 화면' 표기와 캡션 문법 | C27 | 헤더 전환 320ms · theme-color |
| C06 | 차트 서버 SVG · opacity 순차 | C28 | OG 폰트 |
| C07 | 홈 무한 루프 0 · 자동 진행 0 | X01 | 색 토큰 20개와 폐기 토큰 |
| C08 | 서사 모먼트 상한 6 · ProblemCost 정성 장부 | X02 | 브레이크포인트 단일 정의 |
| C09 | Hero 오른쪽 5칸과 LCP | X03 | ghost 버튼 = 텍스트 링크 |
| C10 | Display·Poster 사용처 | X04 | masthead 먹선(정적) |
| C11 | 아이콘 세부(Sparkles 퇴역·색·IconFrame·획) | X05 | 그림자는 떠 있는 레이어만 |
| C12 | 탭·내비 활성 표시(index-tab) | X06 | 사례 사진 3:2 · 수동 캐러셀 |
| C13 | 링크 카드·목차 행 hover 끝 상태 | X07 | Reveal API와 무장 조건 |
| C14 | 먹 위 CTA(채움 0) | X08 | reduced-motion 스피너 |
| C15 | 버튼 변형·크기 이름 | X09 | z-index 레이어 스택 |
| C16 | 입력 글자 16px 하한 | X10 | Figure/Frame 컴포넌트 파일 |
| C17 | 공개 스코프 `site` 클래스 | X11 | 정직 라벨 6종 |
| C18 | 타입 스케일 15종 · tw-merge | X12 | 링크 유틸 |
| C19 | 섹션 배경 plain · 홈 시퀀스 | X13 | 모션·비색 토큰 단일 정의 |
| C20 | 서체 수(Pretendard 하나) | X14 | 숫자 글리프 tabular-nums |
| C21 | 좌측 2px 바 3곳 · 추천 표시 | X15 | Kicker 범위와 Act 이름 |
| C22 | Hero Kicker의 폴리오(null은 Hero만) | X16 | LogoBar 정적 목록 |

## 11. 열린 질문 (운영자 확인)

1. **V1–V9 승인.** 기본안 A로 진행해도 되는지. 보류할 항목만 골라 주면 나머지는 A로 진행한다.
2. **Hero 도판 출처.** `hero-dashboard.webp`와 `writing-experience-classroom.webp`가 실사인지 생성 이미지인지. 결과에 따라 라벨을 정한다. 장기적으로는 EDB 판서 화면 16:10 실제 캡처(1920×1200, 개인정보 마스킹)를 확보한다.
3. **사실 레지스트리 초기 항목.** 화면에 남길 수치를 출처 문서와 함께 등록할 담당과 기한(감사 D3과 같은 질문). 등록 전에는 출처 없는 수치가 화면에서 빠진다.
4. **모바일 토스트 높이.** 정본 72px(플로팅 CTA 위 +44+12) 대 제안 80px(챗봇 런처와 틈 8px). 결정 전 기본은 80px.
5. **채널톡 버블.** 지금은 부트 시 버튼을 숨긴다(`lib/channel-talk.ts:146`). 현행 유지가 기본이고, 이때 플로팅 겹침은 0이다.
6. **필드 LCP 측정.** `@vercel/speed-insights`(새 의존성)를 들일지. 기본은 들이지 않고 랩 지표와 리드 지표로만 판정한다.
7. **실기기 확인 담당과 날짜.** iPhone Safari · 삼성 인터넷 강제 다크 · 카카오톡 인앱 · DPR1 1366×768.
8. **어드민의 `color-scheme: only light`.** 루트 viewport 설정이라 어드민에도 적용된다. 어드민에 다크 테마가 없어 기본은 수용.
9. **정본 편차 10건 일괄 승인**(system §13).
