# Design System — Classin (Notion base × Apple whitespace × Classin Green)

Notion의 구조/타이포그래피 철학을 기반으로, Apple의 넉넉한 공백감과
Classin 브랜드 그린(공개 `#0B7A52` · 어드민 `#084734`)을 액센트로 오버라이드한 시스템.

> **적용 범위.** 이 문서는 공개 셸(`.site`)과 어드민이 함께 쓴다. 절 제목에 `[public]`·`[admin]`·`[공통]` 배지를 단다. 토큰에는 상태 배지를 단다: `in force`(코드에 있음) · `target`(스펙 확정, 구현 전) · `retired`(새 사용 금지). 공개 셸 기반(레이아웃·레이어·토큰 배선)의 정본은 [system.md](docs/active/public-site-design-language-2026-10-26/system.md)다.
>
> 공개 화면의 방향은 「편집 지면 · OS판」이다([디자인 언어 문서](docs/active/public-site-design-language-2026-10-26.md)). 운영자 결정 V1–V9는 2026-10-27에, 고급화 결정 V10–V18은 2026-10-28에 모두 A로 확정됐다(§9, [고급화 기획](docs/active/public-site-premium-elevation-2026-10-28.md)). `target` 토큰은 해당 구현 PR이 머지되면 `in force`로 바꾼다. 컴포넌트·모션 절은 각 구현 PR이 같은 커밋에서 고친다.

---

## 1. 핵심 철학 [공통]

- **따뜻한 미니멀리즘**: 차가운 그레이 대신 따뜻한 오프화이트 + 웜 뉴트럴
- **프리미엄 공백**: Apple처럼 여백이 디자인의 일부. 섹션 간 64–120px
- **그린 액센트**: Classin 브랜드 포레스트 그린을 유일한 포화 컬러로 사용
- **경량 보더**: `1px solid rgba(0,0,0,0.08)` — 보이지 않을 듯 존재하는 구분선

---

## 2. 컬러 팔레트 [공통]

공개 화면은 아래 '공개 화면 색 토큰'의 20색을 유틸로 쓴다. 그 위의 팔레트 값은 어드민에서 그대로 유효하다.

### Primary
- **Classin Green** (`#084734` `[admin] in force` · 공개 화면 `#0B7A52` `[public] in force` 2026-11-02, 토큰 `--fg-accent`): Primary CTA, 링크, 인터랙티브 액센트 — 유일한 포화 컬러
- **Green Hover** (`#065c41`): 버튼 hover/active 상태 `[admin] in force`. 공개 화면 hover는 밝아지지 않고 짙어지는 `#0A6E4A`다 `[public] in force`(2026-11-02, `--fg-accent-hover`)
- **Page White** (`#FAFAF8`): 페이지 배경 `[admin] in force`. 공개 화면 paper는 `#F9F8F5`다 `[public] target`(V15-A)
- **Near Black** (`#111110`): 헤딩, 본문 텍스트 (현재 프로젝트 기존값 유지)

### 그린 서피스 스케일 — `[admin] in force` · `[public] retired`
- **Green Surface 50** (`#ECFDF5`): 연한 그린 배경, 섹션 교차, 뱃지 배경. 공개 화면에서는 `retired` — 섹션 면·카드·타일·아이콘 원·활성 채움·배지에 쓰지 않는다.
- **Green Surface 100** (`#D1FAE5`): 호버 서피스, 강조 블록 배경. 공개 화면에서는 `retired`다(2026-10-28). 지금 `::selection` 바탕으로 쓰이지만(P1, `in force`) P2 토큰 PR에서 `rgb(8 71 52 / .14)`로 바꾼다(§3 한글 조판).
- **Green Muted** (`#6EE7B7`): 보조 그린 텍스트, 아이콘. 공개 화면에서는 `retired`다(2026-10-28). 먹 지면 위 액센트(밑줄·점·포커스·링크)는 세이지 `#8FC4AC`로 바꾼다 `target`.

### 웜 뉴트럴 스케일 (Notion 기반)
- **Warm White** (`#F6F5F4`): 섹션 교차 배경 — 노란-갈색 언더톤 `[admin] in force`. 공개 화면 sunken 지면(`--surface-sunken`)은 `#F3F2EE`다 `target`(V15-A). '섹션 교차 배경' 용도는 공개 화면 `retired`.
- **Warm Dark** (`#31302E`): 다크 서피스 텍스트. 공개 화면 본문 글자(`--fg-body`)와 같은 값이다.
- **Form Label** (`#44514A`): 공개 폼의 필드 라벨 — 본문(`#111110`)보다 한 단계 눌러 값과
  라벨을 가르는 자리. 문의·쇼룸 예약·도입 신청 세 폼의 실사용(2026-09-22 기준 30여 곳)을
  공식 토큰으로 편입한 것이다. 라벨 밖에서는 쓰지 않는다.
- **Warm Gray 500** (`#615D59`): 보조 텍스트, 설명
- **Warm Gray 300** (`#A39E98`): 장식선·비활성 표시 전용. **텍스트 금지**(2.54:1). 플레이스홀더는 `#78736D` `[public] target`. 이전 표기 '플레이스홀더, 비활성, 캡션'은 대비 미달이라 정정했다(2026-10-27).
- **Pure White** (`#FFFFFF`): 카드 표면, 모달
- **Skeleton Neutral** (`#F0F0EC`): 로딩 스켈레톤(`animate-pulse`) 전용 배경 — 실사용 다수(어드민 전반)를 공식 토큰으로 편입. 공개 화면 `--surface-skeleton`은 `#EFEEE9`다 `target`(V15-A)

### 공개 화면 색 토큰 [public]

코드: `app/styles/tokens.css`(유일한 선언처). 유틸 이름은 변수 이름과 같다(C02). 이 목록 밖의 색 유틸은 만들지 않는다.
**상태: 20색 모두 `target`이다.** 아래 값은 V15-A(2026-10-28)로 확정된 목표값이다. `app/styles/tokens.css`에는 P0 값(paper `#FAFAF8` · sunken `#F6F5F4` · skeleton `#F0F0EC` · line-control `#8F8A84` · 먹 면 `#111110` · hover `#065C41` · 먹 위 accent `#6EE7B7`)이 들어가 있고, P2 토큰 PR이 미러(`lib/design-tokens.ts`)·대비 테스트(`tests/design/surface-contrast.test.ts`)·`global-error`·OG·viewport theme-color와 함께 바꾼다. 그때 `surface-ink`에 붙은 하드코딩 bg(`bg-[#111110]` 등)도 같이 지워야 값이 반영된다. 대비는 sheet / paper / sunken 순서다(새 값 기준).

**면 6**

| 토큰 | 값 | 유틸 | 쓰는 곳 |
|---|---|---|---|
| `--surface-paper` | `#F9F8F5` | `bg-surface-paper` | 기본 지면. 모든 섹션의 기본값·Hero·띠·읽기 면·고정 바 |
| `--surface-sheet` | `#FFFFFF` | `bg-surface-sheet` | 물건에만: 폼·표·사진 있는 카드·요금 Plan·Frame·plate·입력 바탕(글만 있는 카드는 열린 단). 섹션 지면으로 쓰지 않는다 |
| `--surface-sunken` | `#F3F2EE` | `bg-surface-sunken` | 도해·부록·FinalCTA 세 역할 + 화면 캡처 매트(V16). 연속 배치 금지 |
| `--surface-ink` | `#1A1917` | `surface-ink` 클래스만 | 페이지당 서사 1곳(홈 Manifesto) + 푸터. `bg-surface-ink`는 없다 |
| `--surface-skeleton` | `#EFEEE9` | `bg-surface-skeleton` | 로딩, 캡처 속 개인정보 마스킹(블러 금지) |
| `--surface-scrim` | `rgb(17 17 16 / .48)` | `bg-surface-scrim` | Dialog·메뉴 오버레이(블러 없음) |

- 밝은 지면(paper·sunken·skeleton)은 R≥G≥B, R−B 4–7로 같은 온도를 쓴다. 사진 흰점도 paper 값에 맞춘다(imagery §3-5). sheet `#FFFFFF`와 글자·선 회색은 이 규칙 밖이다.
- 이전 값의 문제: paper `#FAFAF8`은 노란 쪽, sunken `#F6F5F4`는 붉은 쪽으로 온도가 어긋났다. 큰 먹 면 `#111110`은 꺼진 화면처럼 보였다. 글자 `--fg-ink #111110`과 masthead `#111110`은 그대로다.

**글자 9**

| 토큰 | 값 | 유틸 | 대비 | 쓰는 곳 |
|---|---|---|---|---|
| `--fg-ink` | `#111110` | `text-fg-ink` | 18.89 / 17.79 / 16.87 | 제목·강조 |
| `--fg-body` | `#31302E` | `text-fg-body` | 13.18 / 12.41 / 11.77 | 본문 |
| `--fg-muted` | `#615D59` | `text-fg-muted` | 6.53 / 6.14 / 5.82 | 보조 글자(13px 이상)·카드 범주·지역 라벨 |
| `--fg-placeholder` | `#78736D` | `placeholder:text-fg-placeholder` | 4.70(sheet) | 플레이스홀더. 흰 입력 바탕 위에서만 |
| `--fg-faint` | `#A39E98` | `text-fg-faint` | 2.66 / 2.50 / 2.37 | 장식 글리프·비활성 표시. **텍스트 금지** |
| `--fg-accent` | `#0B7A52` | `text-fg-accent`, `bg-fg-accent` | 5.36 / 5.13 / 4.92 | 누를 수 있는 것에만: 링크·포커스·현재 위치·primary 채움. 제목·Kicker·라벨에는 쓰지 않는다 |
| `--fg-accent-hover` | `#0A6E4A` | `hover:text-fg-accent-hover`, `hover:bg-fg-accent-hover` | 6.28 / 6.01 / 5.77 | hover(밝아지지 않고 짙어진다) |
| `--fg-danger` | `#B43E3E` | `text-fg-danger` | 5.68 / 5.35 / 5.07 | 오류(공개 화면 오류색 하나) |
| `--fg-on-accent` | `#FAFAF8` | `text-fg-on-accent` | `#0B7A52` 위 5.13 · `#0A6E4A` 위 6.01 | 그린 채움 위 글자 |

- 그린 배급(2026-10-28): 비상호작용 그린 표지(잉크 밑줄·● 묶음·좌측 2px 바·차트 강조·인용 여는 따옴표)는 뷰포트당 2개 이하, 그린 채움은 primary 1개다. 링크·버튼·포커스·index-tab은 세지 않는다. 공개 그린 글자·채움은 `#0B7A52`(2026-11-02 확정, 밝은 지면 AA 통과)다. 밝은 지면 대비 4.5 아래로 내려가는 더 밝은 값은 쓰지 않는다. 어드민은 `#084734` 그대로이며 `tokens.css`의 `:root:not(:has(.site))` 블록이 맡는다.

**선 5**

| 토큰 | 값 | 유틸 | 대비 | 쓰는 곳 |
|---|---|---|---|---|
| `--line-hair` | `rgb(17 17 16 / .08)` | `border-line-hair`, `divide-line-hair` | 1.18 | 기본 구분선. 장식이라 정보를 혼자 전달하지 않는다 |
| `--line-strong` | `rgb(17 17 16 / .16)` | `border-line-strong` | 1.41 | 장식선(표 머리 아래·링크 카드 hover) |
| `--line-ink` | `#111110` | `border-line-ink` | — | 먹선 1px(Act 머리·표 상단 등 닫힌 목록) |
| `--line-control` | `#8A857F` | `border-line-control` | 3.66 / 3.44 / 3.26 | 조작 경계(입력·line 버튼·칩·스위치)·도해 정보선 |
| `--line-link` | `rgb(11 122 82 / .75)` | `decoration-line-link` | 3.35 / 3.25 / 3.16 | 링크 밑줄 |

- 헤어라인 두께(2026-10-28): 기본 1px, 2dppx 이상 화면에서는 .5px + α .14, 먹 위 .5px + α .20, `prefers-contrast: more`에서는 1px + α .32. masthead·조작 경계·2px 바는 그대로다. iPhone 실기기와 DPR1 모니터에서 함께 확인한다.
- 고대비(`prefers-contrast: more`)에서는 hair가 `/.32`, strong이 `#8A857F`로 바뀐다.
- primary 채움은 `bg-fg-accent text-fg-on-accent hover:bg-fg-accent-hover`다. 먹 위 채움은 0개다(C14).

**먹 지면 재정의** — `.surface-ink` 안에서는 같은 토큰 이름이 밝은 값으로 바뀐다(정의는 tokens.css 한 곳, C01). 그래서 Tailwind 매핑은 `@theme inline`이다.

| 토큰 | 먹 위 값 | 먹 위 대비 |
|---|---|---|
| `--surface-sheet` | `#1A1917`(먹 면과 같은 값, 입력 바탕·autofill 덮개) | — |
| `--fg-ink` | `#FAFAF8` | 16.81 |
| `--fg-body` / `--fg-muted` / `--fg-placeholder` | `rgb(250 250 248 / .72)` / `/.56` / `/.56` | 9.14 / 6.00 / 6.00 |
| `--fg-faint` | `/.40` | 3.71(장식 전용) |
| `--fg-accent` / `--fg-accent-hover` | 세이지 `#8FC4AC` | 8.92 |
| `--fg-danger` | `#E89A94` | 7.93 |
| `--line-hair` / `--line-strong` / `--line-ink` / `--line-control` | `/.12` / `/.24` / `/.72` / `/.40` | control 3.71 |
| `--line-link` | `rgb(143 196 172 / .6)` | — |

- 대비는 먹 면 `#1A1917`(V15-A) 기준이다. 지금 코드(`#111110`, 먹 위 accent `#6EE7B7`)는 P2 토큰 PR에서 바뀐다.
- 먹 위 `::selection`은 세이지 알파 바탕 + 글자 `#FAFAF8`이다(`.surface-ink ::selection` 재정의 필요).
- 먹 위에서는 `#084734`(1.64:1)와 `#B43E3E`를 쓰지 않는다. 채움 버튼·Frame·표·카드도 두지 않는다. 사진은 HW 먹 장의 제품 한 컷만 예외다(같은 먹 값의 판에 미리 합성).
- 먹 지면은 `color-scheme: dark`다. 고대비에서는 hair `/.32`, strong `/.40`이다.

**규칙**
- 토큰은 `app/styles/tokens.css`에만 선언한다. 다른 파일에서 `--surface-*`·`--fg-*`·`--line-*`를 선언하거나 `.surface-ink`를 정의하면 가드가 막는다. `.on-ink`는 없다.
- CSS 변수를 못 읽는 곳(OG·viewport·global-error)은 손으로 적은 미러 `lib/design-tokens.ts`만 쓴다. 테스트가 두 값을 대조한다.
- 금지: `bg-paper/sheet/sunken`, `text-(--fg-*)` 임의값, `var()` 폴백, `--color-cta*`·`--color-ink`.
- 기존 `bg-accent`(shadcn 민트 `#ECFDF5`)와 새 `text-fg-accent`는 다른 유틸이다.

### 헤어라인 보더 토큰 (2026-08-18 정리) — `[admin] in force`

- **기본**: `1px solid rgba(0,0,0,0.08)` — 배경이 비치는 whisper 보더. 새 코드의 기본값.
- **불투명 등가** (`#E8E8E4`): 같은 명도의 불투명 값. 알파가 누적돼 선이 진해지는 곳(스티키
  헤더·겹침 표면)용이며, 어드민 전반 900여 곳의 실사용을 공식 토큰으로 편입한 것이다.
  두 값은 모두 정본이지만 **같은 화면 안에서 섞어 쓰지 않는다** — 한 화면은 한 값을 고른다.
- 공개 화면은 위 '선 5'의 `--line-*`를 쓴다. 공개 화면의 `#E8E8E4`는 `retired`다.

### 제3자 채널 식별색 — 어드민 차트 전용 (2026-08-18 등재) [admin]

광고 채널 구분(파이 차트·범례·예산표의 채널 점)은 채널의 브랜드 색이 오독을 막는다.
코드 SSOT는 `lib/types/event-metrics.ts`의 `AD_CHANNEL_COLOR` — 아래 값에 한해
**차트·범례·채널 점 표시**에만 허용한다. CTA·버튼·뱃지·텍스트 강조에는 금지(냉색 금지
원칙은 유지되며, 이 예외는 제3자 브랜드 식별 맥락뿐이다).

| 채널 | 색 | 비고 |
| --- | --- | --- |
| Google | `#4285F4` | Google 브랜드 블루 |
| Meta | `#0866FF` | Meta 브랜드 블루 |
| 네이버 | `#03C75A` | 네이버 그린 |
| 카카오 | `#FEE500` | 카카오 옐로 — 채널 점·말풍선 미리보기 한정 |
| YouTube | `#FF0000` | YouTube 레드 |

### 운영 상태 스케일 (Status scale) — 어드민 전용 [admin]

운영 데이터의 상태(부족/예정/출고/취소 등)는 녹색 단일 액센트만으로 구분되지 않으므로, 어드민 운영 화면(`/admin/hardware` 등)에 한해 아래 신호색을 정식 토큰으로 허용한다. 단 **CTA 액센트는 여전히 Classin Green 하나**이며, 신호색은 상태 표시(뱃지·수치·작은 라벨)에만 쓰고 일반 버튼 채움·주요 액션엔 쓰지 않는다.

| 의미 | 텍스트 | 배경 틴트 | 보더 |
| --- | --- | --- | --- |
| Danger (출고·부족·취소) | `#B43E3E` (강조 `#8F2C2C`) | `#FCE9E9` | `#F2B8B8` |
| Warning (예정·주문 검토) | `#A8741A` (강조 `#7A520F`) | `#FBF1E0` | `#ECD29C` |
| Success·Info (입고·확정·정상) | `#084734` | `#ECFDF5` | `#BDEFD8` |

원칙:
- 신호색은 **상태 의미가 있을 때만**. 장식·카테고리 구분엔 웜 뉴트럴을 쓴다.
- 한 화면에서 신호색이 경쟁하면 위계가 무너진다 — 행 내 빠른 액션처럼 의미가 약한 곳은 중립(`#31302E`)으로 두고 hover에서만 의도색을 드러낸다.
- 채움(solid) 버튼의 포화색은 Classin Green(주요)과 Danger(파괴적 확인)만 허용.

### 확도 신호 토큰 (Confidence scale) — 매출 확도 전용 [admin]

REV 매출의 3단 확도(확정/고확도/예정)는 본질 기능이라 서로 구분되는 신호색 3개가 필요하다.
코드 SSOT는 `lib/branch/confidence-tokens.ts`의 `CONFIDENCE_TOKENS` 단일 맵 — 확도 맥락의
소비처는 이 맵만 import하고 색 리터럴을 재정의하지 않는다.

| 확도 | 텍스트 | 강조 | 배경 틴트 | 보더 | 비고 |
| --- | --- | --- | --- | --- | --- |
| 확정 (confirmed) | `#C8102E` | `#C8102E` | `#FFF0F1` | `#FFC9CF` | 확정 크림슨 — 2026-10-21 운영자 결정. Danger(`#B43E3E`)와 구분되는 별도 빨강이며 확도 맥락 전용 |
| 고확도 (high-confidence) | `#1E5DA8` | `#1E5DA8` | `#EFF6FF` | `#BFDBFE` | **냉색 금지 원칙의 유일한 예외 토큰** — 2026-07-10 운영자 결정으로 공식화. 확도 신호 맥락 전용 |
| 예정 (expected) | `#A8741A` | `#7A520F` | `#FBF1E0` | `#ECD29C` | Warning 상태 축과 동일 |

오용 금지 규칙:
- `#1E5DA8`은 **확도(고확도) 신호에만** 쓴다. 파이프라인 stage 색·캠페인 태그·KPI 실적 막대 등
  비확도 맥락의 파랑 사용은 여전히 팔레트 위반이다(기존 오용은 별도 정리 대상이며, 이 토큰의
  존재가 새 파랑 사용을 정당화하지 않는다).
- 확도 색을 CTA·일반 버튼 채움·장식·카테고리 구분에 쓰지 않는다. 예외는 확도 선택 토글(3버튼)의
  활성 상태뿐 — 그 외 solid 채움 규칙은 위 원칙(Classin Green·Danger만)을 따른다.
- 세 색은 항상 3단 체계로 함께 읽힌다 — 한 색만 떼어 단독 강조색으로 차용하지 않는다.
- 고확도 틴트(`#EFF6FF`/`#BFDBFE`)도 예외 토큰의 일부로, 확도 뱃지·칩 밖에서는 쓰지 않는다.

### Team Identity 색 (BD/MKT/CSM) — 어드민 지사 대시보드 전용 [admin]

지사 대시보드에서 딜·인사이트·KPI를 BD/MKT/CSM 팀별로 색 구분할 때 쓰는 팀 아이덴티티
색이다. 코드 SSOT는 `lib/branch/team-colors.ts`의 `TEAM_COLORS` 단일 맵 — 소비처는
여기서 import만 하고 색 리터럴을 재정의하지 않는다.

| 팀 | 색 | 비고 |
| --- | --- | --- |
| BD | `#084734` | Status Success 축과 값이 겹침(우연) |
| MKT | `#7B8B36` (올리브) | Status 3색 어디에도 대응 없는 **팀 아이덴티티 전용 예외 토큰** — 확도 예외 파랑(`#1E5DA8`)과 같은 패턴으로 공식화(2026-07-17) |
| CSM | `#A8741A` | Status Warning 축과 값이 겹침(우연) |

원칙:
- **Team Identity 색은 팀 구분에만 쓴다.** 상태(정상/부족 등)·확도(확정/고확도/예정)·
  페이싱·확률 등급 같은 의미 축에는 절대 재사용하지 않는다 — 특히 MKT 올리브를
  "중간 단계" 색으로 차용해 KPI·확률 그라데이션에 쓰는 것은 팔레트 위반이다. 그
  맥락은 §2 Status 스케일(Danger/Warning/Success) 또는 `lib/branch/confidence-tokens.ts`를 쓴다.
- BD·CSM이 Status 색과 값이 같은 것은 팀 색이 상태 의미를 겸한다는 뜻이 아니다 —
  같은 팔레트에서 고른 결과일 뿐, 두 축은 독립적으로 관리한다.

### 지역 히트맵 램프 (Region heatmap ramp) — BranchRegionHeatmap 전용 [admin]

지사 대시보드의 지역별 매출 히트맵(`components/admin/branch/sections/BranchRegionHeatmap.tsx`)은
연속값(0~1 정규화 지표)을 4단 그라데이션으로 표현해야 해서, 이산 상태/팀 색과는 다른 별도의
연속 램프 예외 토큰이 필요하다. 색 자체는 이미 실사용 중이었고 이 항목은 **새 색 도입이 아니라
가드 사각지대(문서 미등재) 해소**다 — 색 변경 없음.

| 위치(t) | 색 | 의미 |
| --- | --- | --- |
| 0.00 | `#A85952` (muted terracotta) | 낮음 / 위험 |
| 0.34 | `#C09460` (warm tan) | 주의 필요 |
| 0.67 | `#7F9A82` (sage) | 정상 궤도 |
| 1.00 | `#3E5F4D` (deep forest) | 강함 |
| — | `#D5D2CB` | 데이터 없음(dimmed) 셀 전용 |

원칙:
- 이 4색 + dimmed 회색은 **BranchRegionHeatmap의 연속 램프 보간에만** 쓴다. 위 §2 Status
  스케일(Danger/Warning/Success)이나 §2 확도 신호 토큰과 값이 겹치지 않도록 의도적으로
  분리된 팔레트다 — 다른 맥락(상태 뱃지·확도·팀 색)에 이 램프 색을 차용하지 않는다.
- 중간 구간(t 사이) 색은 RGB 선형 보간으로 계산되며 개별 상수로 하드코딩하지 않는다 —
  네 앵커 색만 SSOT다.
- 이산 카테고리 구분(팀·확도·상태)에는 이 램프 대신 §2의 해당 토큰 맵을 쓴다. 이 램프는
  "정도"를 표현하는 연속값 전용이다.

### 보더 & 섀도
- **Whisper Border** (`1px solid rgba(0,0,0,0.08)`): 기본 구분선 `[admin] in force`. 공개 화면은 `--line-hair`.
- **Card Shadow**: `rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px, rgba(0,0,0,0.01) 0px 0.175px 1px` — `[admin] in force` · `[public] retired`
- **Deep Shadow**: 5레이어, 최대 opacity 0.05, 52px blur. 공개 화면에서는 떠 있는 레이어(Dialog·드롭다운·토스트·모바일 메뉴)에만 쓴다 `target`.
- 공개 화면 지면은 평면이다. 카드·Frame·표·컨트롤·섹션·헤더·하단 플로팅 CTA의 그림자는 0이다(X05) `target`.
- 예외 하나(2026-10-28): '제품 렌더' 이미지 안에 구운 접지 그림자 1개(α ≤ .18, 띄움 0, 색 후광·림 라이트·반사 바닥 0)는 이미지 내용으로 허용한다. CSS `box-shadow`·`drop-shadow` 규칙은 그대로다.
- 예외 둘째(V20-A, 2026-11-03): 홈의 실제 제품 창 캡처 2곳에만 `plate-window` 유틸(`app/styles/utilities.css`: 창 모양(투명 알파)을 따르는 받침 그림자 `filter: drop-shadow(0 8px 24px rgb(17 17 16 / .12))`, CSS 반경 없음 — 반경은 창 이미지 자체의 둥근 모서리, 강제 색상 모드에서는 그림자 대신 1px 윤곽선)을 쓴다. 그 밖의 그림자 0 규칙은 그대로다.

---

## 3. 타이포그래피 (Notion 기반) [공통]

### 폰트 패밀리 — `in force`
- **공개 화면(`.site`): IBM Plex Sans KR**(400·500·600·700) + Pretendard 폴백 — `in force (2026-11-03, V20-A)`. 스택은 `"IBM Plex Sans KR", "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif`다. 정의는 `app/styles/tokens.css`의 `--font-sans`(`@theme`, `inline` 아님 — `inline`이면 Tailwind가 값을 `html`·`.font-sans`에 리터럴로 박아 어드민 되돌리기가 먹지 않는다)다. 자체 호스팅이고(`@fontsource/ibm-plex-sans-kr` 5.3.0, `app/layout.tsx`에서 굵기별 CSS 4개 import, 조각마다 `unicode-range` + `font-display: swap`) 라틴·숫자도 같은 서체다.
- **어드민·checkout(`.site` 래퍼 없음): Pretendard Variable 유지**(라틴 글리프는 Inter 기반) + 시스템 폴백. `tokens.css`의 `:root:not(:has(.site))` 블록이 `--font-sans`를 `"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif`로 되돌린다. 밀도 높은 숫자 화면이라 바꾸지 않는다. 공개 화면에서도 Pretendard는 폴백이라 계속 싣는다.
- 「공개도 Pretendard 하나」라는 옛 결정(§9 V2-A·V18-A)은 공개 화면에서 V20-A로 대체됐다. 세리프(명조)를 쓰지 않는 결정은 그대로다.
- 사실 정정(2026-10-27): 이전 표기 `Inter, -apple-system, system-ui, Segoe UI, Helvetica, Arial, sans-serif`는 실제와 달랐다. Inter를 따로 싣지 않는다.
- 로딩은 자체 호스팅이다(V1-A, 2026-11-03 in force): `pretendard` npm 패키지의 dynamic-subset CSS를 `app/layout.tsx`에서 import 한다. jsDelivr 링크는 없다(`next.config.ts` CSP의 jsdelivr 허용은 `public/l/**` 정적 페이지가 떼기 전까지 남는다).

### 공개 화면 글자 토큰 — `[public] target`
- 15종: `text-poster`·`text-display`·`text-h1`·`text-h2`·`text-h3`·`text-body-l`·`text-body`·`text-article`·`text-ui`·`text-caption`·`text-note`·`text-label`·`text-folio`·`text-numeral`·`text-quote`. 토큰 하나가 크기·행간·자간·굵기를 함께 든다. 값의 정본은 [typography 스펙 §2-2 표](docs/active/public-site-design-language-2026-10-26/typography.md)(옛 표기 §3-1)다. 단 `text-h1`·`h2`·`h3`·`body-l`·`body`·`numeral` 여섯의 크기·행간·자간은 V20-A(2026-11-03)로 교체돼 아래 표가 현행 정본이다 `in force`.
- `text-display`는 Hero H1, `text-poster`는 Manifesto 전용이다.
- **굵기(V13-A · 2026-10-28)**: poster 700(Manifesto 한 곳), display·h1·h2·h3·numeral 600. 크게 쓰되 가볍게, 크게 소리 내는 곳은 하나다. 14px 이하에서 600은 라벨·폼 라벨·버튼·'예시' 태그에만 쓴다.
- **크기(V20-A · 2026-11-03, `in force`)**: 시안 B-T2(테크 SaaS) 스케일이다. 요금 시뮬레이터(`/pricing/simulator`·`/krw`) 결과 금액은 `text-h2`다(`/pricing` 카드에는 금액이 없다).

| 토큰 | 크기 | 범위(px) | 행간 | 굵기 | 자간(데스크톱) |
|---|---|---|---|---|---|
| h1 | `clamp(2.25rem, 1.6rem + 2.6vw, 3.75rem)` | 36 → 60 | 1.15 | 600 | −0.02em |
| h2 | `clamp(1.75rem, 1.5rem + 1vw, 2.375rem)` | 28 → 38 | 1.2 | 600 | −0.02em |
| h3 | `clamp(1.25rem, 1rem + 1vw, 1.875rem)` | 20 → 30 | 1.25 | 600 | −0.015em |
| body-l | `clamp(1.0625rem, 1rem + 0.25vw, 1.125rem)` | 17 → 18 | 1.8 | 400 | — |
| body | `1rem` | 16 | 1.8 | 400 | — |
| numeral | `clamp(2rem, 1.6rem + 1.6vw, 2.75rem)` | 32 → 44 | 1 | 600 | −0.02em |

- **자간(2026-10-28 · h1~numeral 데스크톱 열은 V20-A 2026-11-03에 교체)** — 모바일은 0이 아니라 줄인 음수다. 아래 표가 정본이고, 표 밖 값과 −0.035em보다 좁은 자간은 쓰지 않는다(이전의 '한글 700 이상 −0.03em 상한'을 대체).

| 토큰 | 데스크톱 | 모바일(`width < 40rem`) |
|---|---|---|
| poster | −0.035em | −0.025em |
| display | −0.035em | −0.022em |
| h1 | −0.02em | −0.018em |
| h2 | −0.02em | −0.014em |
| h3 | −0.015em | −0.006em |
| numeral | −0.02em | −0.015em |

- 레거시 h1–h4·`.tracking-*` 모바일 `letter-spacing: 0 !important`는 어드민 전용으로 옮겼다(2026-11-03, `tokens.css`의 `body:not(:has(.site))`). 공개 화면은 이 표를 따른다.
- **숫자**: 단독 디스플레이 숫자(`text-numeral`)는 비례 숫자, 표·가격·차트·폴리오·날짜는 `tabular-nums`(X14 개정).
- **강조**: 제목(h1–h3·display·poster) 안 그린은 0이다. 구절 강조는 굵기 대비나 잉크 밑줄(2px, 페이지당 1)만 쓴다. 본문 그린 구절도 쓰지 않는다(밑줄 없는 링크와 구분되지 않는다). 가드 `heading-accent`를 P2에서 warn 래칫으로 새로 둔다.
- **섹션 머리(V12-A)**: 1px 먹 masthead 아래 왼쪽 레일에 Kicker = 폴리오 13/500 `#615D59` → 12px → 라벨 13/600 `#111110`. 그린 바·그린 라벨 없음. 제목은 본문 칸(4–12)에서 시작하고, 공개 h1/h2 가운데 정렬은 쓰지 않는다(StateBlock·Dialog 제외).
- **조판 마감**: 인용 여는 따옴표는 `text-indent: −0.45em`으로 매단다. 한글 사이 가운뎃점에는 공백을 두지 않는다('전·중·후'). 띄어쓰기('수밖에'·'안 됩니다')와 과장어 목록은 typography 교열 기준을 따른다.
- `cn()`에 넣으려면 `lib/utils.ts`의 tailwind-merge 확장이 필요하다(설정은 그 파일 한 곳).
- 아래 '계층' 표는 공개 화면에서 `retired`다. 타이포 구현 PR에서 이 절을 교체한다.

### 계층 — `[admin] in force` · `[public] retired`

| 역할 | 크기 | 굵기 | Line Height | Letter Spacing |
|------|------|------|-------------|----------------|
| Display Hero | 64px | 700 | 1.00 | -2.125px |
| Display Secondary | 54px | 700 | 1.04 | -1.875px |
| Section Heading | 48px | 700 | 1.00 | -1.5px |
| Sub-heading | 40px | 700 | 1.5 | normal |
| Card Title | 22px | 700 | 1.27 | -0.25px |
| Body Large | 20px | 600 | 1.40 | -0.125px |
| Body | 16px | 400 | 1.50 | normal |
| Nav / Button | 15px | 600 | 1.33 | normal |
| Caption | 14px | 500 | 1.43 | normal |
| Badge | 12px | 600 | 1.33 | 0.125px |

### 원칙
- 헤딩 크기가 클수록 letter-spacing 더 음수 (압축감)
- 본문 16px에서는 letter-spacing normal
- 뱃지 12px에서만 양수 letter-spacing (가독성)

### 한글 조판 (`:where(.site)`) — `[public] in force`
정의는 `app/styles/site-base.css` `@layer base` 한 곳이다. 정본: [typography 스펙 §9](docs/active/public-site-design-language-2026-10-26/typography.md).
- `word-break: keep-all`(body 상속) + `overflow-wrap: break-word` + `font-synthesis: none`. 한글 이탤릭·가짜 굵게 없음.
- `text-wrap`: `h1`–`h4`는 `balance`, `figcaption`·`.text-article`·`.text-body-l`·`.text-quote`는 `pretty`.
- `blockquote`: `hanging-punctuation: first`(Safari만).
- `em`: 정체(기울임 없음) 600, 색은 상속.
- `mark`: 바탕 없음, 600 + 2px `#084734` 밑줄(offset 0.2em). 파스텔 배경 금지.
- `::selection`: 지금은 바탕 `#D1FAE5`, 글자 `#111110`(P1). P2 토큰 PR에서 밝은 지면 바탕 `rgb(8 71 52 / .14)`(합성 `#D7DFDA`, 글자 `#111110` 13.91:1), 먹 위 세이지 알파 + 글자 `#FAFAF8`로 바꾼다 `target`(2026-10-28).
- 금지: 그라데이션 텍스트(`bg-clip-text`), `drop-shadow` 장식 글자, 글래스 배지(`backdrop-blur` 필).
- 명조는 쓰지 않는다(V2-A 유지, V18-A). 인용 4개와 Manifesto 문구가 확정되면 V18을 같은 보드로 다시 판정한다.

---

## 4. 컴포넌트 스타일 [공통]

아래 값은 지금 코드 기준이다. 공개 화면 규격은 각 구현 PR이 이 절을 교체한다(정본: controls·cards_motion·icons·imagery 스펙). 그 전까지 공개 화면에서 바뀌는 항목에는 배지를 단다.

### 버튼
**Primary (Green)** — `in force`
- Background: `#084734`
- Text: `#ffffff`
- Padding: `8px 20px`
- Radius: 어드민·checkout `6px` · 공개 화면 `4px` — 토큰 `--radius-control`(`app/styles/tokens.css`, V20-A 2026-11-03 `in force`). `components/ui/button.tsx`·`input.tsx`가 `rounded-(--radius-control)`로 읽고, 어드민 값은 `:root:not(:has(.site))` 블록이 6px로 되돌린다
- Hover: `#065c41` — 공개 화면은 `#073D2D` `target`(2026-10-28)
- Active: `scale(0.97)`

**Secondary** — `[admin] in force` · 공개 화면은 `line` 변형(투명 + 1px `#8A857F`) `target`
- Background: `rgba(0,0,0,0.05)`
- Text: `#111110`
- Radius: `--radius-control`(공개 4px · 어드민 6px, 위 Primary 참조)
- Hover: `rgba(0,0,0,0.08)`

**Ghost**
- Background: transparent
- Text: `#084734`
- Hover: underline

**Pill Badge** — `[admin] in force` · `[public] retired`(V9-A)
- 공개 화면에서는 쓰지 않는다. 단일 강조는 Kicker, 상태는 점(● ○ –) + 텍스트, 상호작용 필터는 아웃라인 칩으로 한다.
- Background: `#ECFDF5`
- Text: `#084734`
- Radius: `9999px`
- Padding: `4px 10px`
- Font: 12px weight 600

### 어드민 라벨 단순화 [admin]
- 데이터 행과 밀집 대시보드에서 파스텔 채움과 둥근 pill/card 라벨을 기본값으로 쓰지 않는다.
- 상태와 범주는 텍스트 색, 아이콘, `1–2px` 선 중 한두 가지만 사용해 구분한다.
- 한 행에 여러 배지를 쌓지 않는다. 정보 순서는 `대상·제목 → 근거·담당·기한 → 상태·보조 행동`을 따른다.
- 배경 채움은 경고·오류, 주요 CTA, 명시적 선택 상태처럼 면이 꼭 필요한 경우에만 허용한다. 밀집 화면의 선택 상태도 밑줄·선·글자색을 우선한다.
- 버튼과 입력 등 실제 조작 컨트롤은 클릭 영역과 보더를 유지하되 분류 라벨처럼 보이지 않게 한다.

### 카드 — `[admin] in force` · 공개 화면은 그림자 0·반경 0(V14-A), 글만 있는 카드는 상자 없이 열린 단(위 hair + 단 사이 세로 hair) `target`(cards_motion 스펙)
- Background: `#ffffff`
- Border: `1px solid rgba(0,0,0,0.08)`
- Radius: `12px` (표준), `16px` (피처/히어로)
- Shadow: Card Shadow 참조
- Hover: 섀도 강도 살짝 증가

### 인풋 — `[admin] in force` · 공개 화면은 박스형(V8-A, 1px `#8A857F`, r4(V20-A로 r6에서 내림), 글자 16px, controls 스펙) `target`
- Border: `1px solid #E5E5E0`
- Radius: `--radius-control`(공개 4px · 어드민 6px)
- Focus: `2px solid #084734` outline

---

## 5. 레이아웃 원칙 [공통]

### 5-A. 공개 화면 [public] — `target`

값의 정본은 [system.md §4](docs/active/public-site-design-language-2026-10-26/system.md)다.

**브레이크포인트** — Tailwind 기본값 하나만 쓴다(X02).

| 이름 | 값 | Tailwind | 원시 CSS |
|---|---|---|---|
| 모바일 | < 640px | (접두 없음) | `(width < 40rem)` |
| sm | ≥ 640px | `sm:` | `(width >= 40rem)` |
| md | ≥ 768px | `md:` | `(width >= 48rem)` |
| lg | ≥ 1024px | `lg:` | `(width >= 64rem)` |
| xl | ≥ 1280px | `xl:` | `(width >= 80rem)` |

- 원시 CSS는 범위 문법만 쓴다. `641px`·`767px`·`max-width: 640px`·`width <= 40rem`은 쓰지 않는다.

**거터·컨테이너**
- 거터: `px-4 sm:px-6 lg:px-12`(16 / 24 / 48). 모바일 측면은 16px, 가로 스크롤은 0.
- `max-w-page` 1296px: 모든 섹션의 안쪽 컨테이너(거터를 빼면 lg 콘텐츠 1200).
- `max-w-article` 45rem(720px): 블로그·문서·법무 본문 칼럼.
- `max-w-measure` 38em: 읽는 문단. 덱 34em · 헤딩 18em · Display 14em · 인용 24em.
- wide 컨테이너는 없다. 공개 화면에 `.container`(1400px)를 새로 쓰지 않는다. 풀블리드 이미지도 없다(예외는 홈 히어로 영상 무대 하나, V23-A). 큰 도판은 콘텐츠 폭 plate(1200, 16:9 · 모바일 4:5, 글자 없음)로 두고 예산은 홈 8(2026-11-03 v4: Codex 생성 정면 보드 렌더 2장 — 화면 속은 기존 지구 이미지·실제 수업 캡처 합성 — + 실제 창 캡처 2 + 사례 사진 3, 이름 블러 + 목동 쇼룸 사진 1(V21-A)) · SW ≤1 · HW ≤2다(2026-10-28).

**간격·섹션 리듬**
- 새 spacing 토큰은 없다. Tailwind 기본 `--spacing`(0.25rem)의 배수만 쓴다.
- 세로 리듬 값: 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80 · 96 · 128px.

| rhythm | 모바일 | ≥48rem | 클래스 | 쓰는 곳 |
|---|---|---|---|---|
| `base`(기본) | 64 | 96 | `py-16 md:py-24` | 일반 섹션 |
| `act` | 80 | 128 | `py-20 md:py-32` | 홈 Act 01–06, 제품 장 머리 |
| `compact` | 56 | 80 | `py-14 md:py-20` | (보관) 홈 관문 v2(2026-11-02). 2026-11-03 v4부터 홈 섹션은 `act`(80/128) |
| `band` | 40 | 48 | `py-10 md:py-12` | LogoBar(홈 중간 CTA 띠는 04 화면 Section 안 마지막 요소라 rhythm 없음) |
| `none` | 0 | 0 | — | Hero 등 |

- 섹션 사이 경계선은 0이다. 카드 그리드 gap은 `gap-4 sm:gap-6`.

**그리드**
- 섹션(2026-10-28): ≥64rem에서 12칸(칸 약 78, 간격 24). 레일 1–3칸(Kicker·목차·짧은 주), 본문 4–12칸(제목 18em·덱 34em·본문 38em), 여백 10–12칸(본문이 4–9칸일 때 캡션·출처). 도판·카드 그리드·표는 1–12칸이나 4–12칸. 64rem 미만은 1열이고 Kicker를 제목 위 12px에 쌓는다.
- Hero(V11-A): 출처를 확인한 실제 화면 캡처가 커밋되기 전에는 무도판 비대칭 표지다. H1은 1–9칸, 덱·CTA는 8–12칸에 H1 마지막 줄 아래 40px부터, LCP는 H1이다. 캡처가 들어오면 12칼럼 7 + 5(V3-A), `gap-12`로 바꾼다. 그 아래는 1열(텍스트 → 도판). 상단 여백은 `calc(var(--header-h) + 48px)`, ≥48rem에서 `+ 80px`. 홈 히어로는 전자칠판 1장(`/images/home/hero-board.webp` — Codex 생성 정면 보드에 기존 지구 화면 합성, 배경 투명, 사용자 결정 2026-11-03)을 세로 쌓기(텍스트 → 960 도판)로 둔다(V19-A). 실제 화면 캡처는 이득 3행이 맡는다. **2026-11-06 V23-A**: 홈 히어로는 먹 영상 무대(가운데 정렬 H1 `text-display` · 리드 · line CTA, 최소 높이 100svh − 헤더, 높이 40rem 이상에서 sticky)로 바뀌고, 전자칠판 사진과 숫자 4개는 무대 위로 올라와 덮는 시트 첫머리로 옮겼다.
- 카드 그리드: 1열 → ≥40rem 2열 → ≥64rem 3열.

**헤더·앵커**
- `--header-h` 76px, ≥48rem 80px. 스크롤해도 높이는 바뀌지 않는다.
- ProductTabNav: `sticky top-(--header-h) z-(--z-subnav)`, 높이 44, 모바일만.
- 앵커: 루트 `scroll-padding-top`이 `header-h + 16px`(서브내비가 있으면 +44)다. Section에 `scroll-mt-*`를 두지 않는다(둘이 합산된다).

### 5-B. 어드민 [admin] — `in force`

#### 간격
- Base unit: `8px`
- 섹션 간 수직 간격: `80px–120px` (Apple처럼 넉넉하게)
- 모바일 섹션 간격: `48px–64px`

#### 컨테이너
- Max width: `1200px`, 중앙 정렬
- 히어로: 단일 컬럼, 상단 패딩 `80–120px`
- 피처: 2–3컬럼 그리드

### 5-C. 고정 레이어 스택 [public] — `target`

z는 토큰으로만 쌓는다(X09). 지금의 리터럴(`z-40`·`z-50`·`z-[60]`·`z-[120]`)은 P1에서 이 표로 옮긴다.

| z | 토큰 | 레이어 | 모바일(< 48rem) | 데스크톱 |
|---|---|---|---|---|
| 30 | `--z-subnav` | ProductTabNav(sticky) | `top: var(--header-h)` | 없음 |
| 40 | `--z-header` | Header(ReadingProgress는 P5에서 삭제하고 헤더 hair 위 1px 읽기 괘선으로 바꾼다) | top 0 | top 0 |
| 42 | `--z-floating` | MobileFloatingCTA(아웃라인) | `left-3`, 하단 safe-area + 16 + 6px | 없음 |
| 44 | `--z-chatbot` | FloatingChatbot 런처·패널 | `right-3`, 하단 safe-area + 16px | `right-6 bottom-6` |
| 46 | `--z-consent` | ConsentBanner | `inset-x-3`, 하단 safe-area + 16px | `left-6 bottom-6` |
| 50 | (공유 기본값) | Radix Dialog·오버레이 | 가운데 | 가운데 |
| 60 | `--z-skiplink` | 스킵 링크(포커스 시에만) | `left-4 top-4` | 같음 |
| 9999 | (공유 기본값) | 토스트 | `inset-x-4`, 하단 safe-area + 80px(제안값, 운영자 확인 중) | `right-4`, `top: header-h + 16px` |

- safe-area 공식은 하나다: 하단 고정 레이어는 `bottom: calc(env(safe-area-inset-bottom) + Npx)`를 쓴다. z가 높은 전폭 래퍼는 `pointer-events-none`, 조작 요소만 `pointer-events-auto`.
- 쿠키 배너가 열려 있으면 MobileFloatingCTA와 챗봇 런처를 숨긴다(언마운트하지 않아 대화는 남는다).
- 모바일 메뉴가 열리면 `main`·`footer`는 `inert`, 플로팅(42·44)은 `inert` + 숨김이다(`[data-inert-with-menu]`).
- 챗봇 패널이 열리면 MobileFloatingCTA를 숨긴다(`[data-hide-with-chat]`, Tab 순서에서도 빠진다).
- Dialog가 열리면 그 아래 전부를 덮는다(쿠키 배너 포함). 쿠키 배너를 Dialog 위로 올리지 않는다.
- 떠 있는 요소는 뷰포트당 1개다. 흐름 안의 결정 CTA가 보이면 MobileFloatingCTA를 숨긴다 `target`(2026-10-28).

### 배경 교차 리듬 — `[public] retired`
공개 화면에서는 새로 쓰지 않는다. surfaces 구현 PR이 이 소절을 지면 배정 규칙(C19: 역할로 배정, 구획은 괘선과 여백)으로 교체한다. 지면 배정(V10-A · 2026-10-28): paper가 기본, sunken은 도해·부록·FinalCTA 세 역할(연속 금지), sheet는 섹션 지면으로 쓰지 않고 물건에만, 먹은 Manifesto + 푸터다. 홈은 11지면 + 푸터, 지면 바뀜 6회 이하.
- 흰 섹션(`#FFFFFF`) ↔ 웜 화이트 섹션(`#F6F5F4`) 교차
- 가끔 연한 그린 서피스(`#ECFDF5`) 강조 섹션 사용
- 섹션 간 하드 보더 없음 — 배경색 변화와 간격으로만 분리

### Border Radius 스케일
- `4px`: 인풋, 작은 기능성 UI
- `6px`: 버튼 `[admin] in force` · 공개 화면 컨트롤은 `4px`(`--radius-control`, V20-A 2026-11-03)
- `8px`: 작은 카드, 인라인 요소 — `[public] retired`
- `12px`: 표준 카드 — `[public] retired`
- `16px`: 히어로 카드, 피처 블록 — `[public] retired`
- `9999px`: 뱃지, 필 태그 — `[public] retired`(비상호작용 pill 0, V9-A). 공개 화면은 필터 칩·상태 점·스위치 썸만(스위치 트랙은 6px)
- **공개 화면 반경은 이 종류뿐이다(V14-A · 2026-10-28, 컨트롤 값은 V20-A 2026-11-03에 조정)**: `0` — 카드·Figure·Frame·표·띠·IconFrame·도해 노드(물건) / `4px`(`--radius-control`) — 버튼·입력·스위치(누르는 것) / `6px` — Dialog·드롭다운·토스트·모바일 메뉴(떠 있는 층) / 원형 — 필터 칩·상태 점·스위치 썸(기존 챗봇 런처는 chatbot 파트 합의 전까지). 둥근 모서리는 '누를 수 있음'을 뜻한다. 공유 `card.tsx`의 legacy family는 바이트 그대로 둔다.

---

## 6. 접근성 [공통]

- 기본 텍스트(`#111110`) on `#FAFAF8`: 18.08:1 (WCAG AAA)
- 보조 텍스트(`#615D59`): 6.53:1(white) / 6.24:1(paper) / 5.99:1(sunken) (WCAG AA)
- Green CTA(`#084734`) on white: 10.71:1 (WCAG AAA)
- `#A39E98`은 읽는 글자에 쓰지 않는다(paper 위 2.54:1)
- 모든 인터랙티브 요소: `2px solid` 포커스 링
- 사실 정정(2026-10-27): 이전 표기 '~17:1'·'~5.5:1'·'~9.7:1'을 계산값으로 바꿨다(WCAG 2.x 상대 휘도).

### 공개 화면 추가 [public] — `target`
- **포커스**: 보증 규칙 하나가 그린다. `:where(.site)` 안 `:focus-visible`에 `2px solid var(--fg-accent)`, offset 2px(P1, `in force`). 먹 지면에서는 자동으로 먹 위 accent다(지금 `#6EE7B7`, P2부터 세이지 `#8FC4AC`). 공개 화면에 컴포넌트별 `focus:ring`을 새로 쓰지 않는다. P2에서 offset을 `var(--focus-offset)`로 바꾸고 형태별로 다듬는다: 글 링크 3px + 반경 2px, 입력은 테두리 accent 위에 링을 −1px 겹쳐 한 선으로, 그 밖 2px `target`(2026-10-28).
- **입력 16px**: 보증 규칙 `font-size: max(16px, 1em)`. iOS 확대를 막는다. 공개 Dialog·챗봇 입력·푸터 뉴스레터에도 적용된다.
- **확대 4상태**: Android 글꼴 최대, iOS Aa 150%, 브라우저 200%, 텍스트 간격 사용자 CSS(1.4.12). 각 상태에서 잘림·겹침·가로 스크롤이 0이어야 한다. 컨트롤은 `height` 대신 `min-height`로 만든다.
- **스킵 링크·단일 main**: AppChrome 첫 자식으로 '본문 바로가기' 링크(포커스 시에만 보임)를 둔다. `<main id="main">`은 AppChrome 하나뿐이다.
- **먹 지면**: 글자·포커스는 `.surface-ink` 재정의 값만 쓴다. 먹 위 `#084734`(먹 `#1A1917` 위 1.64:1)는 쓰지 않는다.
- **검수 기기**: 모든 단계는 iPhone 실기기와 Windows Chrome 1366×768 DPR1(ClearType) 두 환경에서 본다(2026-10-28).
- **지원 기준**: iOS Safari 16.4+, 최근 2년 Chrome·Samsung Internet·Whale·Edge, 카카오톡·네이버 인앱. Tailwind 4의 공식 하한과 같다.
- **점진적 향상**: view-timeline·`text-wrap: pretty`·hanging-punctuation·`@starting-style`·`details name`·`:has`(scroll-padding 전용). 지원하지 않는 브라우저에서는 정적 완성 상태로 보인다.

---

## 7. AI 에이전트 프롬프트 가이드 [공통]

컴포넌트 생성 시 이 룰을 항상 따른다:
1. 웜 뉴트럴 사용 — 블루-그레이 금지, 노란-갈색 언더톤 그레이 사용
2. 유일한 포화 컬러 = Classin Green(`#084734`) — 파랑/보라 절대 금지 (예외 둘: 확도 신호 전용 `#1E5DA8`, 제3자 채널 식별색 §2 — 차트·범례 한정)
3. 헤딩 letter-spacing: 64px → -2.125px, 48px → -1.5px, 26px → -0.625px, 16px → normal — `[admin] in force`. 공개 화면은 §3 글자 토큰을 쓴다
4. 보더는 whisper: `1px solid rgba(0,0,0,0.08)` — 절대 두껍게 하지 않음 (불투명 등가 `#E8E8E4` 허용, §2 헤어라인 보더 토큰 — 한 화면엔 한 값만)
5. 섀도: 4–5레이어, 개별 opacity 0.01–0.05
6. 섹션 배경 교차: White ↔ `#F6F5F4` ↔ `#ECFDF5` — `[public] retired`(§5). 구현 PR에서 삭제한다
7. 뱃지/필: `9999px` radius, 그린 서피스 배경 — `[admin] in force` · `[public] retired`(V9-A). 구현 PR에서 삭제한다
8. CTA 버튼: 항상 `#084734`, radius `6px`

공개 화면(`.site`) 추가 규칙 [public]:

9. 공개 화면의 색·크기·z·지속시간은 토큰 유틸만 쓴다(가드: `scripts/check-design-tokens.mjs`).
10. 새 공개 CSS는 `app/styles/*`에만 쓴다. `globals.css`는 금지.
11. 공개 Radix `*Content`(Dialog·Popover·Select·DropdownMenu·Sheet)에는 `site`를 넣는다.
12. 화면 수치는 `lib/facts.ts` factId로만 넣는다 `target`.
13. 표기는 `lib/format.ts`로 한다(§8).
14. (public) 카드 hover는 경계 hair→strong(들어갈 때 160ms, 나올 때 320ms)과 화살표 2px뿐이다. 들림·확대·그림자·채움·제목 색 변화는 금지한다.
15. (public) 그린은 누를 수 있는 것(링크·버튼·포커스·현재 위치)에만 쓴다. 제목 속 그린 0, 비상호작용 그린 표지는 뷰포트당 2개 이하, 그린 채움은 primary 1개(§2).
16. (public) 둥근 모서리는 누르거나 떠 있는 것에만(컨트롤 r4 · 떠 있는 층 r6, V20-A). 카드·도판·표·띠는 r0, 칩·점은 원형(§5 반경).
17. (public) 제목은 600, Manifesto(poster)만 700. 섹션 머리는 왼쪽 레일의 먹 Kicker이고 가운데 정렬은 쓰지 않는다(§3).
18. (public) 도판은 출처 장부(`data/image-credits.json`)를 거친 것만 싣는다. 흰 화면 캡처는 sunken 매트(20px, ≥64rem 32px) 위에 r0 + hair로, 풀블리드 0(예외: 홈 히어로 영상 무대 V23-A), 같은 파일은 페이지당 1회. 출처를 밝힐 수 없는 도판에 라벨을 짐작해 달지 않는다. 단, 홈의 실제 제품 창 캡처 2곳은 V20-A `plate-window`(창 모양 그림자, 매트·hair 없음) 예외다.
19. (public) 숫자와 후기는 증거로만: 사실 레지스트리 + 각주, 별표 마스킹 금지(서술형 익명 또는 실명), 체크아웃과 요금 시뮬레이터 밖 금액 0, 측정하지 않은 약속 문구(응답 시간 등) 0.
20. (public) 움직임: Hero는 처음부터 정지해 있고 잉크 밑줄 하나만 240ms 뒤 900ms에 걸쳐 스민다. 홈 Hero는 V23-A 먹 영상 무대다 — 무음 루프 영상은 데스크톱(≥64rem)·동작 줄이기 꺼짐에서만 첫 화면이 뜬 뒤 붙고 멈춤 버튼을 둔다(휴대폰·동작 줄이기는 정지 포스터). 제목·버튼은 정지. 전자칠판 화면 켜짐(V21-A, 화면 층만 240ms 뒤 700ms 페이드)은 시트가 칠판을 화면에 들여올 때 일어난다. 서사 모먼트는 900ms `--ease-fade`(`cubic-bezier(.33,1,.68,1)`), Dialog·메뉴는 닫힐 때도 160ms 페이드. 공개 페이지 이동 모션 0.

---

## 8. 표기 [공통]

| 종류 | 표기 | 함수 |
|---|---|---|
| 수치 | `1,200` | `formatNumber` |
| 금액(표·가격) | `1,200,000원` | `formatKRW` |
| 금액(문장·헤드라인) | `1,200만 원` | `formatKRWCompact` |
| 날짜(바이라인·목록) | `2026.10.26` | `formatDate(d, "meta")` |
| 날짜(문장) | `10월 26일(월)` | `formatDate(d, "prose")` |
| 전화 | `02-1234-5678` | `formatPhone` |

- 날짜·시각은 `Asia/Seoul` 기준이다(서버 기본 시간대는 UTC).
- `lib/format.ts`만 쓴다. `toLocaleString` 직접 호출 금지(가드 경고).

---

## 9. 결정 로그 [public]

운영자 결정을 남긴다. 감사 문서의 결정은 '감사 D#'으로 인용한다(C03). 보드는 시안 캔버스(비공개 artifact)다.

| 결정 | 선택 | 날짜 | 근거 | 보드 스크린샷 경로 |
|---|---|---|---|---|
| V1 Pretendard 로딩 | A 자체 호스팅 | 2026-10-27 | 기기 간 글꼴 동일성. iPhone 4G LCP가 나빠지면 B(시스템 우선)로 전환(비용 0) | [시안 캔버스](https://claude.ai/artifact/QShWLdYRgZCZTy957gHtyx) |
| V2 인용 세리프 | A 세리프 없음(Pretendard 500 — 공개 화면 서체는 2026-11-03 V20-A로 IBM Plex Sans KR 500) | 2026-10-27 | 추가 0바이트 | [시안 캔버스](https://claude.ai/artifact/QShWLdYRgZCZTy957gHtyx) |
| V3 홈 Hero | A 지면 표지(paper, 7/5, 실제 화면 캡처, 영상 없음) | 2026-10-27 | LCP·가독성·모바일 첫 화면 CTA. ~~도판 출처 확인 전에는 현 도판 유지~~ → 2026-10-28 V11-A로 바뀜: 출처를 확인한 캡처 전에는 무도판 표지 | [시안 캔버스](https://claude.ai/artifact/QShWLdYRgZCZTy957gHtyx) |
| V4 배경 리듬·공감 Act | A 서사 먹 Manifesto 1곳 + Footer, ProblemCost 정성 장부 | 2026-10-27 | 다크가 하나여야 전환점이 선다 | [시안 캔버스](https://claude.ai/artifact/QShWLdYRgZCZTy957gHtyx) |
| V5 FinalCTA | A sunken 띠 + 이중 괘선 + primary 52 + 텍스트 링크 | 2026-10-27 | 먹 위 채움 버튼 0으로 정리 | [시안 캔버스](https://claude.ai/artifact/QShWLdYRgZCZTy957gHtyx) |
| V6 아이콘 획 | A 1.5px(DPR1 화면 2px) | 2026-10-27 | Pretendard 한글 획 굵기와 맞춘다. 16px 인라인이 흐리면 B(1.75px) | [시안 캔버스](https://claude.ai/artifact/QShWLdYRgZCZTy957gHtyx) |
| V7 카드·배경 애니메이션 | A 항상 정지(링크 카드 hover는 경계 + 화살표 2px) | 2026-10-27 | 테두리 빛은 'AI 분석 중' 클리셰 | [시안 캔버스](https://claude.ai/artifact/QShWLdYRgZCZTy957gHtyx) |
| V8 입력 필드 | A 박스형(sheet + 1px `#8F8A84` + r6, 높이 44/48) — 테두리 값은 2026-10-28 V15-A로 `#8A857F` | 2026-10-27 | '여기에 쓰는 칸'이 가장 분명하다 | [시안 캔버스](https://claude.ai/artifact/QShWLdYRgZCZTy957gHtyx) |
| V9 Hero 배지 | A 삭제, Kicker로 대체 | 2026-10-27 | 위계 장치가 하나로 준다. 비상호작용 pill 0 | [시안 캔버스](https://claude.ai/artifact/QShWLdYRgZCZTy957gHtyx) |
| V10 홈 목차 | A 11지면(Hero · LogoBar 띠 · 01 선언 · 02 공감 · 부록 진단표 · Manifesto · 03 흐름 · 04 화면 · 05 기록 · 06 확신 · FinalCTA) | 2026-10-28 | 같은 주장이 다섯 섹션에서 반복된다. 목차가 짧아야 여백과 증거가 무게를 얻는다. 결정 CTA 5곳 유지 + CTA 띠 1, 홈 경유 리드 7일 −10%면 되돌림 | [캔버스 '고급화 V10–V18' · V10](https://claude.ai/artifact/QShWLdYRgZCZTy957gHtyx) |
| V11 캡처 전 Hero | A 무도판 비대칭 표지(H1 1–9칸, 덱·CTA 8–12칸, LCP = H1) | 2026-10-28 | 출처를 확인할 수 없는 도판은 정직 라벨을 달 수 없다. V3 보충 문장을 대체한다(운영자 재승인 포함) | [캔버스 · V11](https://claude.ai/artifact/QShWLdYRgZCZTy957gHtyx) |
| V12 섹션 머리 그린 | A 바 없음, 먹 라벨(폴리오 13/500 회색 + 라벨 13/600 먹) | 2026-10-28 | 그린 대시 + 색 라벨은 흔한 템플릿 머리. 그린은 누를 수 있는 것에만 | [캔버스 · V12·V13](https://claude.ai/artifact/QShWLdYRgZCZTy957gHtyx) |
| V13 제목 굵기 | A 제목 600, Manifesto(poster)만 700, h1 56px(크기는 2026-11-03 V20-A로 60px) | 2026-10-28 | 모든 제목이 700이면 외치는 인상. 크게 쓰되 가볍게. 가변 폰트라 바이트 0 | [캔버스 · V12·V13](https://claude.ai/artifact/QShWLdYRgZCZTy957gHtyx) |
| V14 모서리 | A 누를 수 있는 것·떠 있는 층만 r6, 물건 r0, 칩·점 원형 | 2026-10-28 | hair + r12 흰 카드는 'AI가 만든 느낌'. 반경이 장식이 아니라 정보가 된다 | [캔버스 · V14·V16](https://claude.ai/artifact/QShWLdYRgZCZTy957gHtyx) |
| V15 종이와 먹 | A paper `#F9F8F5` · sunken `#F3F2EE` · skeleton `#EFEEE9` · 조작 경계 `#8A857F` · 먹 면 `#1A1917`(글자 `#111110` 유지) | 2026-10-28 | 지면·띠·사진 흰점을 한 종이 온도로. 먹 위 본문 9.14:1. 대안 B(먹 `#2B2926`)는 7.89:1 | [캔버스 · V15](https://claude.ai/artifact/QShWLdYRgZCZTy957gHtyx) |
| V16 흰 화면 캡처 | A sunken 매트(20px, ≥64rem 32px) + 캡처 r0·hair, 모바일 전폭 — 홈 창 캡처 2곳은 V20-A plate-window 예외(2026-11-03) | 2026-10-28 | 흰 위 흰 경계(1.06:1)가 사라진다. 그림자·색 없이 '보여 주는 물건'으로 세운다 | [캔버스 · V14·V16](https://claude.ai/artifact/QShWLdYRgZCZTy957gHtyx) |
| V17 움직임 | A 인쇄된 표지 + 잉크 템포(밑줄 240ms 뒤 900ms, 모먼트 900ms `--ease-fade`, hover 160/320ms, 오버레이 닫힘 160ms) | 2026-10-28 | 정지한 지면에 잉크 한 획이 서명이 된다. 손에는 즉각, 떼면 여운 | [캔버스 · V17](https://claude.ai/artifact/QShWLdYRgZCZTy957gHtyx) |
| V18 명조 디스플레이 | A 지금은 Pretendard 하나(V2-A 유지) — 공개 화면 서체는 2026-11-03 V20-A로 대체(세리프 없음은 유지) | 2026-10-28 | 문구가 바뀌는 동안 서브셋을 계속 다시 만들어야 한다. 인용 4개·Manifesto 문구 확정 뒤 같은 보드로 재판정 | [캔버스 · V18](https://claude.ai/artifact/QShWLdYRgZCZTy957gHtyx) |
| V19 홈 도판 | A 도판 7장(히어로 전자칠판 사진 1 · 작동 방식 실제 캡처·교실 사진 3 · 사례 사진 3), 히어로는 세로 쌓기(텍스트 → 960 도판) 유지, 섹션 리듬 `compact` 등재 — 2026-11-03 v4: 이득 3행(자동 녹화·AI 강의 평가·EDB 교안) + 학원 롤링 띠 + 역할표 + 둘러보기, 섹션 리듬 `act` | 2026-11-03 | 작동 방식·사례는 출처를 확인한 실제 화면·교실 사진이라 V11-A의 무도판 조건이 풀린다. 히어로는 '처음에는 전자칠판이 필요하다'는 사용자 결정으로 기존 사진을 유지한다. 코스 화면은 수업 전 카드로. 이름은 블러 | [홈 스펙 v3](docs/superpowers/specs/2026-10-30-home-landing-redesign-design.md) |
| V20 공개 글꼴·타입 | A IBM Plex Sans KR(400–700) + T2 스케일(h1 60·h2 38·h3 30·본문 18/1.8), 컨트롤 반경 4px, 창 캡처 그림자 1종(plate-window) | 2026-11-03 | 사용자가 시안 B-T2(테크 SaaS)를 골라 공개 사이트 전체 적용을 지시. 어드민은 밀도 높은 숫자 화면이라 Pretendard 유지 | [캔버스 · B-T2](https://claude.ai/artifact/Sqstbv5y41VNEviU2gxX1U) |
| V21 홈 움직임·쇼룸 | A 모먼트 4개(히어로 전자칠판 화면 켜짐 · 이득 1행 먹 밑줄 스밈 · 창 캡처 2장이 행 등장 240ms 뒤 제자리로) + 섹션 Reveal + 학원 롤링 띠(멈춤 버튼), 3행 '누가 들어가도 같은 수업'에 목동 쇼룸 사진 + 활동 게시 창 겹침 | 2026-11-03 | 사용자 요청 '약간의 애니메이션', '누가 들어가도 같은 수업에 쇼룸 사진'. V17·X07 안에서 transform·opacity·색만 쓰고 선 그리기·카드 순차·hover 확대는 없다. 롤링 띠의 무한 반복은 사용자 요청 예외(WCAG 2.2.2 멈춤 버튼). 동작 줄이기는 전부 정지 | [시안 캔버스](https://claude.ai/artifact/Sqstbv5y41VNEviU2gxX1U) |
| V22 쿠키 배너 그림 | A 쿠키 먹는 정글 갈매기 그림 1장(Gemini 3 Pro Image 생성 2026-11-04, `/images/consent/gull-cookie.webp`, 48px) + 말풍선 배너(시안 D·C 혼합: 버튼 2개, 세부 설정 접기, 닫기 X 없음) | 2026-11-04 | 사용자 요청 '쿠키 창 더 작고 컴팩트하게', 'D랑 C 섞어서, 정글 갈매기 캐릭터가 쿠키 먹는 그림'. 캐릭터 금지(imagery 도해 규칙)의 예외는 쿠키 배너 이 한 곳뿐이다. 그 밖의 공개 화면에 캐릭터를 넓히지 않는다 | [PR #64](https://github.com/classinkr-main/classinkr-web/pull/64) |
| V23 홈 히어로 영상 무대 | A 옛 랜딩 복원 — 먹 지면 무대(최소 높이 100svh − 헤더, 높이 40rem 이상에서 sticky)에 옛 홈 수업 영상(1280×640 · 무음 · 1.2MB, 위아래 검은 띠 잘라냄)을 40%로 깔고 H1 `text-display` · 리드 · line CTA를 가운데 정렬. 스크롤하면 시트(위 모서리 12px — 반경 규칙 16의 예외, 그림자 없음)가 24px 겹쳐 올라와 덮고, 시트 첫머리에 전자칠판 사진 · 숫자 4개. 영상은 데스크톱 + 움직임 허용만(idle 로드, 멈춤 버튼), 휴대폰 · 동작 줄이기는 기기별 포스터 1장(`<picture>`) | 2026-11-06 | 사용자 '이전에 있던 히어로 랜딩은 필요할 것 같다' → 캔버스 히어로 시안 A·B·C 중 A 선택. V3·V11·V19·V21의 '밝은 정적 히어로 · 영상 없음 · 풀블리드 0'을 홈 히어로에 한해 대체한다. 옛 장식(알약 배지 · 그라데이션 글자 · 큰 반경 · 그림자)은 되살리지 않는다. 영상은 해외 수업 장면이라 한국 학원 촬영본이 생기면 바꾼다 | [캔버스 · Hero-A](https://claude.ai/artifact/Sqstbv5y41VNEviU2gxX1U) |

- V10–V18의 규칙 개정 전문은 [고급화 기획 §5](docs/active/public-site-premium-elevation-2026-10-28.md)에, 결정 없이 함께 채택한 변경은 같은 문서 §4에 있다. 디자인과 별개인 정직성·개인정보 핫픽스(H)는 같은 문서 §7이다.
