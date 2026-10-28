# 색·표면·섹션 배경 (surfaces) — 최종 스펙 (2026-10-26, 고급화 개정 2026-10-28)

- 상태: V1–V9 A 확정(2026-10-27) · **V10–V18 A 반영 2026-10-28**(운영자 승인). 고급화 결정·규칙 개정의 원문은 `docs/active/public-site-premium-elevation-2026-10-28.md`(§3–§5·§7·§13)다. 이 스펙은 목표를 적고, 구현을 뜻하지 않는다.
- 방향: 「편집 지면 · OS판」. 이 스펙은 canonical 표를 옮겨 적은 것이다. 소유 행은 C01·C19·C26·C27·X01·X04·X05이고, 영향 행은 C02·C03·C08·C09·C10·C13·C14·C15·C17·C18·C21·C23·X02·X09·X11·X13·X15·X16이다. 이 스펙과 canonical이 다르면 canonical이 이긴다.
- 결정 번호: 방향 문서의 운영자 결정은 **V1–V9**, 고급화 기획의 결정은 **V10–V18**, 감사 문서(`docs/active/public-site-audit-motion-plan-2026-10-26.md` §4)의 결정은 **감사 D1–D8**로 적는다. 고급화 기획의 제안 ID(CO-5·RA-7 등)는 괄호로 단다.
- 공유 기반은 system 스펙(`docs/active/public-site-design-language-2026-10-26/system.md`)이 소유한다. 레이아웃·Section API·z 스택·가드·사실 레지스트리·롤아웃이 여기에 해당하며, 이 스펙은 링크만 하고 값을 복제하지 않는다.
- 범위: 공개 셸(`.site`)만 다룬다. `/admin`·`/checkout`·`/receipt`는 제외한다(`isInternalPath`, `lib/internal-path.ts`로 이전). 모든 단계의 수용 조건은 '어드민 무변경'이다.
- 줄 번호는 HEAD `4c9e509c` 기준이다. 고급화 반영분(2026-10-28)의 줄 번호는 `design/p1-visual` `e44cd161` 기준이다. `app/globals.css`와 `components/ui/MobileFloatingCTA.tsx`는 다른 세션이 작업 트리에서 고치고 있다.
- 대비는 WCAG 2.x 상대 휘도 공식으로 직접 계산했다. 알파 색은 해당 지면 위에 sRGB로 합성한 값이고, 테스트 임계는 4.5/3.0이다.
- 브라우저 하한은 iOS Safari 16.4+다. 범위 미디어 문법, `:where`, `@layer`, `overflow: clip`, CSS 중첩이 모두 이 하한에서 동작한다.

---

## 요약

- **지면은 4장이다.** 공개 화면의 면은 paper `#F9F8F5` · sheet `#FFFFFF` · sunken `#F3F2EE`와 먹 `#1A1917`이다(V15-A · 2026-10-28). 글자 `#111110`은 그대로 두고 먹 면과 값을 나눈다. 밝은 지면(paper·sunken·skeleton)은 R≥G≥B, R−B 4–7인 따뜻한 축 하나다. 그린 `#084734`는 면을 칠하지 않고 잉크로만 쓴다. 민트(`#ECFDF5`·`#D1FAE5`·`#6EE7B7`)는 `::selection`까지 포함해 공개 화면에서 0이다.
- **섹션은 괘선과 여백으로 나눈다.** 면 색은 섹션을 가르지 않는다(지면 간 대비 1.06–1.12:1). paper가 기본이다. sheet는 섹션 지면이 아니라 물건(Frame·plate·요금·사진 있는 사례·폼·표)에만 쓰고, sunken은 도해·부록·FinalCTA 3역할에만 쓴다(RA-7). 섹션 배경 처리는 plain 하나뿐이고, 모눈은 도해 figure 자체의 바탕으로만 페이지당 1개 쓴다. 그림자는 떠 있는 레이어만 갖는다.
- **토큰은 한 파일이 정본이다.** `app/styles/tokens.css`가 색 20개, 헤어라인 굵기 `--line-w-hair`, `.surface-ink` 하나를 정의한다. 유틸 이름은 변수 이름과 같다(`bg-surface-*`, `text-fg-*`, `border-line-*`). 먹 위에서는 같은 이름이 밝은 값으로 다시 정의되고, 먹 위 컨트롤은 0이다.
- **확정 결정을 적용했다.** V1–V9 A(2026-10-27): V3-A(Hero 지면 표지, 캡처 커밋 뒤 capture Frame), V4-A(먹은 Manifesto 1곳, ProblemCost는 정성 장부), V5-A(FinalCTA는 sunken 띠), V7-A(배경·카드 정지), V9-A(pill 없음, Kicker), V8-A(입력은 sheet 박스). V10–V18 A(2026-10-28): V10(홈 11지면), V11(캡처 전 무도판 표지), V12(Kicker 먹 라벨, 바 없음), V13(제목 600), V14(누를 수 있는 것만 둥글게), V15(웜 아이보리 + 인쇄 먹), V16(캡처 매트), V17(인쇄된 표지 + 잉크 템포). V18(Pretendard 하나)은 이 스펙에 영향이 없다.
- **이전 판(v2)에서 없앤 것이 많다.** rails, `--line-pattern`·`--line-opaque`·`--focus`·`--pattern-cell`·`--rail-x`, photo 레시피, 대표 Frame `--shadow-card`, 먹 위 그린 CTA, `body[data-shell]`, 별도 `--public` 가드 모드, FinalCTA Display H2가 모두 빠졌다. 홈 시퀀스는 C19를 따른다.

---

## 1. 원칙

1. **면은 웜 페이퍼 한 종 + 먹 1장이다(V15-A · 2026-10-28).** paper는 바닥이고 모든 섹션 지면의 기본이다. sheet는 섹션 지면으로 쓰지 않고 물건(Frame·plate·요금 Plan·사진 있는 사례·폼·표·입력)에만 쓴다. sunken은 섹션 지면으로는 도해·부록·FinalCTA 3역할에만 쓰고, 물건 수준에서는 캡처 매트(V16)와 제품 판의 바탕 값이다. 먹은 페이지당 서사 1곳과 Footer에만 쓴다. 지면·띠·사진 흰점은 같은 온도다(밝은 지면 R≥G≥B, R−B 4–7, imagery §3-5 흰점 = paper 값).
2. **그린은 잉크이고, 누를 수 있는 것과 지금 위치를 뜻한다(V12-A · C11).** `#084734`는 링크·버튼(그린 채움은 primary 1개)·포커스·현재 위치(index-tab)에 쓰고, 이것들은 예산에서 세지 않는다. 비상호작용 그린 표지(잉크 밑줄·● 묶음·C21 좌측 2px 바·한 계열 차트선·인용 여는 따옴표)는 뷰포트당 2개 이하다. C21 좌측 2px 바는 비교표 Classin 열·`/pricing` 선택 가이드 행·세로 목차 현재 항목 세 곳뿐이다. 섹션 머리(Kicker)와 제목 안의 그린은 0이다. 민트 퇴역의 근거는 취향(파스텔 면 금지)이다. 민트는 paper와의 휘도 대비가 1.01:1인데도 색조 차이 때문에 눈에 보인다.
3. **구획은 괘선과 여백이 맡는다.** Act·장 머리는 1px 먹 괘선(`masthead`)과 리듬 여백으로 나눈다. 섹션 사이 하드 보더(`border-y`), 물결 구분선, 그라데이션 장식선은 0이다. 나머지 가는 선은 기기 헤어라인(`--line-w-hair`, CO-5)이라 masthead가 상대적으로 더 또렷한 섹션 구분선이 된다.
4. **배정은 교대가 아니라 역할로 한다(C19 · RA-7).** paper가 기본이고, 지면은 드물게 바뀐다. sunken은 연속으로 두지 않는다. sheet 면은 물건에만 있고 섹션 지면에는 없다. 글만 있는 카드(인덱스·후기·가치)는 상자 없이 열린 단으로 둔다(CO-9).
5. **먹은 한 곳이다.** 먹 지면에는 컨트롤(채움·line 버튼, 입력), Frame, 표, 사진, 밝은 위젯을 두지 않는다(C01·C14, §3-6 허용 목록).
6. **지면은 평면이다.** 그림자는 `--shadow-deep` 하나뿐이고, Dialog·드롭다운·토스트·모바일 메뉴 패널처럼 떠 있는 레이어에만 쓴다(X05). 예외는 CSS 그림자가 아니라 이미지 내용 하나다: '제품 렌더' 자산 안에 구운 접지 그림자 1개(§3-7).
7. **배경은 정지 상태다(V7-A).** 그라데이션 면, 블러 블롭, 글로우, 글래스, 그레인, mix-blend, 마스크, 패럴랙스는 모두 0이다.
8. **토큰으로만, `.site` 안에서만 쓴다.** 값은 `tokens.css`에서 한 번만 정의하고 `var()` 폴백은 쓰지 않는다. 전역 규칙은 `:where(.site)`(특이도 0) 안에 둔다.

### 확정 결정 (V1–V9 A 2026-10-27 · V10–V18 A 2026-10-28)

| 결정 | 선택 | 이 스펙에 미치는 영향 |
|---|---|---|
| V3 Hero | A 지면 표지 | Hero는 paper + plain이다. 출처를 확인한 capture가 커밋되면 ≥64rem에서 7/5로 나누고, 오른쪽 5칸에 capture Frame(V16 매트, r0, 그림자 0)을 둔다. 그 전에는 V11 표지다. 홈 영상과 sticky 다크 커버는 0이다 |
| V4 배경 리듬·공감 Act | A | 서사 먹은 Manifesto 1곳뿐이다. ProblemCost는 paper 위 정성 장부다(02 공감). 섹션 처리는 plain만 쓴다(C19 시퀀스) |
| V5 FinalCTA | A sunken 띠 | `rule-double` 아래 h2(`text-h1`) → 덱 → primary `size="cta"` + 텍스트 링크 순서다. 먹 위 채움 CTA는 0이다 |
| V7 배경 애니메이션 | A 정지 | 지면·카드 배경 모션이 0이다. 링크 카드 hover는 경계 hair→strong과 화살표 2px뿐이다 |
| V8 입력 | A 박스 | 입력 바탕은 `bg-surface-sheet`다. 먹 위에서는 `#1A1917`이 된다 |
| V9 Hero 배지 | A 삭제 | 글래스 배지 대신 Kicker를 둔다. 공개 화면에서 상호작용하지 않는 pill은 0개다 |
| V10 홈 지면 수 | A 11지면 목차 | 홈은 11블록 + 푸터다. sunken은 부록·03 흐름·FinalCTA 3곳, 먹은 Manifesto + 푸터, sheet 섹션 0, 지면 바뀜 ≤6, LogoBar는 paper 띠 + hair(§4-2) |
| V11 캡처 전 첫 화면 | A 무도판 비대칭 표지 | Hero 도판 0, LCP = H1. 출처 미확인 도판(`hero-dashboard.webp`)은 내리고 라벨을 짐작해 달지 않는다. 캡처가 커밋되면 V3-A 7/5로 바꾼다 |
| V12 섹션 머리 그린 | A 바 없음, 먹 라벨 | Kicker는 1px 먹 masthead 아래 레일에 폴리오 13/500 `#615D59` → 12px → 라벨 13/600 `#111110`이다. 섹션 머리 그린 0. 먹 위 색은 C01 재정의가 자동으로 바꾼다 |
| V13 큰 제목 굵기 | A 제목 600, Manifesto만 700 | FinalCTA h2(`text-h1`)는 36→56px / 600이다(typography 소관) |
| V14 모서리 | A 누를 수 있는 것만 r6 | 카드·Frame·plate·표·띠·IconFrame은 r0. 버튼·입력·스위치 트랙·Dialog·드롭다운·토스트는 r6. 필터 칩·상태 점·스위치 썸은 원형 |
| V15 종이와 먹 | A 웜 아이보리 + 인쇄 먹 | paper `#F9F8F5` · sunken `#F3F2EE` · skeleton `#EFEEE9` · line-control `#8A857F` · surface-ink `#1A1917`(먹 안 sheet도 같은 값). fg-ink·masthead `#111110` 유지(§2) |
| V16 흰 캡처 놓기 | A 매트 | capture·mock Frame은 ≥40rem에서 sunken 매트(20px, ≥64rem 32px) 안에 hair 캡처, r0, 그림자 0. <40rem은 매트 없이 전폭(§3-7) |
| V17 움직임의 결 | A 인쇄된 표지 + 잉크 템포 | 링크 카드·열린 단 hover는 진입 160ms(`--motion-fast`)·이탈 320ms(`--motion-base`)다. Hero 진입 애니메이션 0(cards_motion 소관) |

---

## 2. 토큰 (CSS + Tailwind @theme)

### 2-1. 위치와 소유

- 정의는 `app/styles/tokens.css` 한 파일에만 둔다(css_architecture). `globals.css`에는 `@import "tailwindcss";` 바로 아래에 `@import "./styles/tokens.css"; @import "./styles/utilities.css"; @import "./styles/site-base.css";` 세 줄만 더한다.
- 이 스펙이 소유하는 블록은 색 20개(X01), 헤어라인 굵기 `--line-w-hair`(X01 · CO-5), `--header-h`(C27), `.surface-ink`(C01), `@theme inline`의 색 매핑(C02)이다.
- 같은 파일의 다른 블록은 각 스펙이 소유한다: `--text-*`·`--trk-*`·`--container-*`(typography/system), `--motion-*`·`--ease-*`(X13), `--z-*`(X09), `--stroke-*`(C11).
- `tokens.css` 밖에서 `--surface-*`·`--fg-*`·`--line-*`를 선언하거나 `.surface-ink{}`를 선언하면 가드가 막는다.

### 2-2. 값의 정본 — `:root` (20색 + 헤어라인 굵기 1 + 셸 1)

지면·먹·조작 경계 값은 V15-A, 그린 hover는 CO-3, 헤어라인은 CO-5로 정했다(고급화 2026-10-28).

| 토큰 | 값 | 대비(sheet · paper · sunken) | 용도 | 흡수하는 기존 값 |
|---|---|---|---|---|
| `--surface-paper` | `#F9F8F5` | — | 모든 섹션 지면의 기본: 바닥·헤더·Hero·LogoBar 띠·중간 CTA 띠·읽기 면 | `#FAFAF8`(이전 paper), `#FDFCF8` `#F9F8F4` `#F7F8F5` `#F6F7F2` `#EDF7F2` `#F0FDF9` `#F5FBF7` |
| `--surface-sheet` | `#FFFFFF` | — | 물건 전용: Frame 안 캡처·plate·요금 Plan·사진 있는 사례 카드·폼·표·입력 바탕. 섹션 지면으로 쓰지 않는다 | `bg-white` |
| `--surface-sunken` | `#F3F2EE` | — | 섹션은 도해·부록·FinalCTA 3역할만. 물건 수준에서는 캡처 매트(V16)·제품 판 바탕 | `#F6F5F4`(이전 sunken), `.section-warm`, `--secondary`·`--muted`(공개 사용분) |
| `--surface-ink` | `#1A1917` | — | 서사 1곳 + Footer. **`surface-ink` 클래스로만 칠한다.** 면 값이고 글자 `--fg-ink`(`#111110`)와 다르다 | `#111110`(이전 먹 면), `#1a1a19` `#0D1A12` `#0A1511` `#07110d` `#05080C` `#050708` `#010302` `#0B3328` `#031a12` `#1C1B1A` `#2a2925`, `bg-black` |
| `--surface-skeleton` | `#EFEEE9` | — | 로딩 상태, 화면 캡처 속 개인정보 단색 마스킹(블러 금지) | `#F0F0EC`(이전 값) |
| `--surface-scrim` | `rgb(17 17 16 / .48)` | — | Dialog·모바일 메뉴 오버레이(블러 없음) | `backdrop-blur` 오버레이 |
| `--fg-ink` | `#111110` | 18.89 · 17.79 · 16.87 | 헤딩 | |
| `--fg-body` | `#31302E` | 13.18 · 12.41 · 11.77 | 본문 | `#484540`·`#4A6B5C`·`#44514A` 등 |
| `--fg-muted` | `#615D59` | 6.53 · 6.14 · 5.82 | 모든 보조 글자 | 읽는 글자로 쓰인 `#A39E98` |
| `--fg-placeholder` | `#78736D` | 4.70 · (4.42) · (4.19) | 플레이스홀더. **입력 바탕이 sheet일 때만 쓴다** | `#A39E98` |
| `--fg-faint` | `#A39E98` | 2.66 · 2.50 · 2.37 | 장식·비활성 전용. 텍스트 금지 | |
| `--fg-accent` | `#084734` | 10.71 · 10.08 · 9.56 | 링크·버튼·포커스·현재 위치·primary 채움. Kicker·제목 안 그린 0(V12) | |
| `--fg-accent-hover` | `#073D2D` | 12.25 · 11.53 · 10.93 | hover. 밝아지지 않고 한 단 짙어진다(OKLCH L .322) | `#065C41`(이전 hover) |
| `--fg-danger` | `#B43E3E` | 5.68 · 5.35 · 5.07 | 공개 화면의 유일한 오류색 | `#B85C33`, `red-*`, `amber-*` |
| `--fg-on-accent` | `#FAFAF8` | `#084734` 위 10.25 | 그린 채움 위 글자 | `#FFFFFF` |
| `--line-w-hair` | `1px` → `(resolution >= 2dppx)` `.5px` | — | hair 선의 굵기. masthead·조작 경계·2px 바·포커스에는 쓰지 않는다 | — |
| `--line-hair` | `rgb(17 17 16 / .08)` → 2dppx 이상 `/.14` | 1.18 (2dppx 1.35) | 기본 선: 카드·Frame·행·띠·열린 단·캡션 괘선·헤더 하단선 | `rgba(0,0,0,.08)`·`.06`·`.05`, `--border`, 공개 화면의 `#E8E8E4` |
| `--line-strong` | `rgb(17 17 16 / .16)` | 1.41 | **장식선 전용**: 표 머리 아래, 바이라인, 읽기 전용 필드, 링크 카드·열린 단 hover | |
| `--line-ink` | `#111110` | 18.89 · 17.79 · 16.87 | 먹선 닫힌 목록 5곳(X04). 먹 면 값이 바뀌어도 그대로다 | |
| `--line-control` | `#8A857F` | 3.66 · 3.44 · 3.26 | 경계 자체가 조작 단서인 요소, 도해 정보선, ○ 점, 차트 비교선(C23) | `#8F8A84`(이전 값), `--input #E5E5E0`(1.26) |
| `--line-link` | `rgb(8 71 52 / .6)` | 3.51 · 3.43 · 3.36 | 링크 밑줄(`decoration-line-link`) | 카드 제목 40% 밑줄, `.link` 60% |
| `--header-h` | `76px` → `(width >= 48rem)` `80px` | — | 헤더 높이, 오프셋, sticky top, scroll-padding | `76px`·`80px`·`5rem` 하드코딩 7곳 |

- **중립 온도 규칙**: 밝은 지면(paper·sunken·skeleton)은 R≥G≥B, R−B 4–7이다. sheet `#FFFFFF`과 글자·선 회색은 이 규칙에서 뺀다. 지금 paper `#FAFAF8`은 노란 쪽, sunken `#F6F5F4`는 붉은 쪽이라 온도가 어긋나 있다.
- **그린 상태값 규칙**: 공개 화면의 그린 글자·채움 상태값은 OKLCH L ≤ .36(밝은 지면) 또는 C ≤ .07(먹 위)이다. selection·밑줄 합성색은 이 규칙에서 뺀다. 기본색 `#084734`는 유지하고 `#0E5038`로 옮기지 않는다(L .385로 오히려 밝다). 공개 CSS에서 `#6EE7B7`·`#D1FAE5`·`#065C41`은 0이다. 어드민 민트는 건드리지 않는다.
- **고대비** `(prefers-contrast: more)`에서는 hair가 1px `/.32`(2.09), strong이 `--line-control` 값 `#8A857F`로 바뀐다.
- **먹 위 재정의**는 §2-3 표에 있다.
- 지면 사이 대비는 sheet/paper 1.06, paper/sunken 1.06, sheet/sunken 1.12다. 흰 sheet 물건이 paper 위에서 다른 지종처럼 뜬다. 다크 11종을 `#1A1917` 하나로 모아도 시각 손실이 없다. `#0D1A12`와 `#1A1A19`는 새 먹과의 대비가 각각 1.02·1.01이다.

### 2-3. 먹 지면 재정의 — `.surface-ink` (C01)

`tokens.css`의 `@layer base` 안에 있는 클래스 하나가 담당한다. `@utility`·`.on-ink`는 없다. 커스텀 속성은 요소 단위로 선언되므로 `:root`에서 상속된 값을 이기고, 레이어 싸움은 생기지 않는다.

먹 면 값은 `#1A1917`(V15-A), 먹 위 액센트는 세이지 `#8FC4AC`(CO-3)다(고급화 2026-10-28). 재정의 구조(한 곳에서 한다)는 그대로이고 값만 바뀌었다.

| 토큰 | 먹 위 값 | `#1A1917` 대비 | 규칙 |
|---|---|---|---|
| `--surface-sheet` | `#1A1917` | — | 불투명이고 먹 면과 같은 값이라 투명처럼 보인다. 실제 소비처는 autofill 덮개뿐이다(먹 위 컨트롤·sheet 카드·Frame 금지, C14) |
| `--fg-ink` | `#FAFAF8` | 16.81 | 헤딩 |
| `--fg-body` | `rgb(250 250 248 / .72)` | 9.14 | 본문 |
| `--fg-muted` | `/.56` | 6.00 | 보조 글자. 읽는 글자의 알파 하한은 .50(5.05)이다 |
| `--fg-placeholder` | `/.56` | 6.00 | 플레이스홀더(먹 위 입력이 0이라 소비처 없음) |
| `--fg-faint` | `/.40` | 3.71 | 장식 전용(구분 기호 '·') |
| `--fg-accent` / `--fg-accent-hover` | `#8FC4AC` / `#8FC4AC` | 8.92 | 세이지. 선·점·밑줄·포커스·링크에 쓰고 채움에는 쓰지 않는다 |
| `--fg-danger` | `#E89A94` | 7.93 | `#B43E3E`는 먹 위 미달이고, `#F2B8B8`은 파스텔에 가까워 기각했다 |
| `--line-hair` / `--line-strong` | `/.12` / `/.24` | 1.41 / 2.15 | 2dppx 이상에서 hair는 .5px + `/.20`(1.86). 고대비에서는 1px `/.32`(2.84) / `/.40`(3.71) |
| `--line-ink` | `/.72` | 9.14 | 먹 위 Act 머리 괘선 |
| `--line-control` | `/.40` | 3.71 | 먹 위 조작 경계(먹 위 컨트롤 0이라 도해 정보선·○ 점에만) |
| `--line-link` | `rgb(143 196 172 / .6)` | 4.03 | 먹 위 링크 밑줄 |
| `::selection` | 세이지 알파 바탕 + 글자 `#FAFAF8` | — | site-base가 글자를 리터럴 `#111110`으로 고정하므로 먹 안에서 다시 정의한다. 알파 값은 열린 질문 9 |
| 그 밖 | `background-color: var(--surface-ink); color: var(--fg-ink); color-scheme: dark` | — | 먹 안의 네이티브 스크롤바와 autofill이 어둡게 그려진다 |

- 다음 토큰은 만들지 않는다: `--surface-field`, `--field-bg`, `--line-pattern`, `--line-focus`, `--line-cta-ring`, `--focus`.
- 포커스와 체크박스 `accent-color`는 `var(--fg-accent)`를 쓴다. 그래서 먹 위에서는 자동으로 세이지 `#8FC4AC`가 된다. 캐럿·포커스 링 등 MO-5·MO-7의 먹 위 값도 이 토큰에서 파생한다.

### 2-4. CSS — `app/styles/tokens.css` (이 스펙 소유 블록)

```css
/* ── surfaces 소유: 색 20 + --line-w-hair + --header-h + .surface-ink + 색 매핑 (canonical C01·C02·C27·X01) ──
   같은 파일의 --text-*·--trk-*·--container-*·--aspect-*(typography/system), --motion-*·--ease-*(X13),
   --z-*(X09), --stroke-*(C11)는 각 소유 스펙의 블록이다. var() 폴백 금지.
   값: V15-A(지면·먹·조작 경계), CO-3(그린 상태값), CO-5(헤어라인) — 고급화 2026-10-28 */
@layer base {
  :root {
    --surface-paper: #F9F8F5;     /* 밝은 지면: R≥G≥B, R−B 4–7 */
    --surface-sheet: #FFFFFF;     /* 물건 전용, 섹션 지면 아님 */
    --surface-sunken: #F3F2EE;
    --surface-ink: #1A1917;       /* 먹 면. 글자 --fg-ink #111110과 분리 */
    --surface-skeleton: #EFEEE9;  /* 로딩·캡처 개인정보 단색 마스킹 */
    --surface-scrim: rgb(17 17 16 / 0.48);

    --fg-ink: #111110;            /* 18.89 · 17.79 · 16.87 (sheet·paper·sunken) */
    --fg-body: #31302E;           /* 13.18 · 12.41 · 11.77 */
    --fg-muted: #615D59;          /*  6.53 ·  6.14 ·  5.82 */
    --fg-placeholder: #78736D;    /*  4.70 — 입력 바탕 sheet 전용 */
    --fg-faint: #A39E98;          /*  2.66 — 장식·비활성, 텍스트 금지 */
    --fg-accent: #084734;         /* 10.71 · 10.08 ·  9.56 */
    --fg-accent-hover: #073D2D;   /* 12.25 · 11.53 · 10.93 — 짙어지는 hover */
    --fg-danger: #B43E3E;         /*  5.68 ·  5.35 ·  5.07 */
    --fg-on-accent: #FAFAF8;      /* #084734 위 10.25 */

    --line-w-hair: 1px;                   /* hair 굵기. masthead·조작 경계·2px 바·포커스는 제외 */
    --line-hair: rgb(17 17 16 / 0.08);    /* 1.18 장식 */
    --line-strong: rgb(17 17 16 / 0.16);  /* 1.41 장식(표 머리 아래·바이라인·읽기 전용·카드 hover) */
    --line-ink: #111110;                  /* 먹선 5곳(X04) */
    --line-control: #8A857F;              /* 3.66 · 3.44 · 3.26 — 조작 경계·도해·차트 비교선 */
    --line-link: rgb(8 71 52 / 0.6);      /* 3.51 · 3.43 · 3.36 — 링크 밑줄 */

    --header-h: 76px;
  }

  @media (width >= 48rem) {
    :root { --header-h: 80px; }
  }

  /* 기기 헤어라인: 2dppx 이상에서 1 기기 픽셀. DPR1·1.5는 그대로 */
  @media (resolution >= 2dppx) {
    :root {
      --line-w-hair: 0.5px;
      --line-hair: rgb(17 17 16 / 0.14);  /* 1.35 */
    }
  }

  @media (prefers-contrast: more) {
    :root {
      --line-w-hair: 1px;
      --line-hair: rgb(17 17 16 / 0.32);  /* 2.09 */
      --line-strong: #8A857F;             /* = --line-control */
    }
  }

  /* 먹 지면: 같은 이름을 밝은 값으로 재정의(대비는 #1A1917 기준). 유일한 정의처. */
  .surface-ink {
    --surface-sheet: #1A1917;                   /* 불투명·먹 면과 같은 값. autofill 덮개 */
    --fg-ink: #FAFAF8;                          /* 16.81 */
    --fg-body: rgb(250 250 248 / 0.72);         /*  9.14 */
    --fg-muted: rgb(250 250 248 / 0.56);        /*  6.00 */
    --fg-placeholder: rgb(250 250 248 / 0.56);  /*  6.00 */
    --fg-faint: rgb(250 250 248 / 0.40);        /*  3.71 장식 */
    --fg-accent: #8FC4AC;                       /*  8.92 세이지. 선·점·밑줄·포커스·링크, 채움 금지 */
    --fg-accent-hover: #8FC4AC;
    --fg-danger: #E89A94;                       /*  7.93 */
    --line-hair: rgb(250 250 248 / 0.12);
    --line-strong: rgb(250 250 248 / 0.24);
    --line-ink: rgb(250 250 248 / 0.72);
    --line-control: rgb(250 250 248 / 0.40);    /*  3.71 */
    --line-link: rgb(143 196 172 / 0.6);        /*  4.03 */
    background-color: var(--surface-ink);
    color: var(--fg-ink);
    color-scheme: dark;

    /* 먹 위 ::selection(& ::selection)은 세이지 알파 바탕 + 글자 #FAFAF8로 여기서 다시 정의한다.
       site-base의 리터럴 #111110 글자를 덮어야 한다. 알파 값은 열린 질문 9에서 정한 뒤 넣는다. */

    @media (resolution >= 2dppx) {
      --line-hair: rgb(250 250 248 / 0.20);
    }
    @media (prefers-contrast: more) {
      --line-hair: rgb(250 250 248 / 0.32);
      --line-strong: rgb(250 250 248 / 0.40);
    }
  }
}
```

### 2-5. Tailwind `@theme inline` 매핑과 유틸 어휘 (C02)

```css
/* 반드시 inline이어야 한다. 유틸이 var(--fg-*)를 직접 출력해야 .surface-ink 아래 자손에서 값이 다시 풀린다.
   --color-surface-ink는 매핑하지 않는다. 먹 바탕은 surface-ink 클래스로만 칠한다(배경만 칠하는 우회 차단). */
@theme inline {
  --color-surface-paper: var(--surface-paper);
  --color-surface-sheet: var(--surface-sheet);
  --color-surface-sunken: var(--surface-sunken);
  --color-surface-skeleton: var(--surface-skeleton);
  --color-surface-scrim: var(--surface-scrim);

  --color-fg-ink: var(--fg-ink);
  --color-fg-body: var(--fg-body);
  --color-fg-muted: var(--fg-muted);
  --color-fg-placeholder: var(--fg-placeholder);
  --color-fg-faint: var(--fg-faint);
  --color-fg-accent: var(--fg-accent);
  --color-fg-accent-hover: var(--fg-accent-hover);
  --color-fg-danger: var(--fg-danger);
  --color-fg-on-accent: var(--fg-on-accent);

  --color-line-hair: var(--line-hair);
  --color-line-strong: var(--line-strong);
  --color-line-ink: var(--line-ink);
  --color-line-control: var(--line-control);
  --color-line-link: var(--line-link);
}
```

- **쓰는 유틸**
  - 면: `bg-surface-paper|sheet|sunken|skeleton|scrim`
  - 글자: `text-fg-ink|body|muted|placeholder|faint|accent|accent-hover|danger|on-accent`, `placeholder:text-fg-placeholder`
  - 선: `border-line-hair|strong|ink|control`, `divide-line-hair`, `decoration-line-link`
  - hair 선 굵기: `border-(length:--line-w-hair)`(hair 선에만. 새 의존성 0, CO-5)
  - 먹 지면: 클래스 `surface-ink`
  - primary 채움: `bg-fg-accent text-fg-on-accent hover:bg-fg-accent-hover`
- 가드의 어휘 정규식은 `(bg|text|border|divide|decoration)-(surface|fg|line)-`이다. 선 색을 배경으로 칠하는 `bg-line-*`는 어휘에 없으므로 헤어라인 그리드도 `gap-px + 부모 bg` 기법 대신 칸 `border`로 긋는다.
- 기존 `--color-warm-*`, `--color-green-50/100`, shadcn `--accent`(#ECFDF5), `--color-near-black`, `--shadow-card`, `.dark`, `--crm-*`는 어드민 호환을 위해 유지한다. 공개 범위에서 쓰면 가드가 막는다.
- `tailwind-merge` 설정(text 15종 등)은 system §5(`lib/utils.ts` 한 곳, `tests/lib/cn.test.ts`)가 소유한다. 색 유틸은 Tailwind 기본 색 그룹으로 분류되므로 이 스펙이 따로 등록할 것이 없다.

### 2-6. 만들지 않는 것 (X01·C02·C27)

`--overlay`(→ scrim), `--focus`·`--line-focus`(→ `--fg-accent`), `--cta`·`--cta-hover`·`--cta-fg`·`--surface-cta`·`--fg-on-cta`, `--field-bg`·`--surface-field`, `--line-opaque`(불투명 paper 위의 hair와 같은 색), `--line-pattern`, `--line-cta-ring`, `--link-decoration`(→ `--line-link`), `--pattern-cell`, `--rail-x`, `--masthead-pt`, `--color-surface-ink`, `--color-ink`, `bg-paper|sheet|sunken`(v1·v2 이름), `text-(--fg-*)` 임의값 문법.

### 2-7. CSS 변수를 읽지 못하는 소비처

`lib/design-tokens.ts`(system §3)는 hex 약 10개를 손으로 옮겨 적은 미러다. 이 스펙의 소비처는 `app/layout.tsx`의 viewport(`themeColor`), `app/global-error.tsx`(:22·63)의 인라인 스타일, `app/opengraph-image.tsx`(:13·73)다. `tests/lib/design-tokens.test.ts`가 미러 값이 `tokens.css`와 같은지 대조한다.

- **V15 값은 한 커밋에서 바꾼다.** `tokens.css`, `lib/design-tokens.ts` 미러, OG, global-error, viewport theme-color, 대조 테스트(`tests/lib/design-tokens.test.ts`·`tests/design/surface-contrast.test.ts`)를 P2 토큰 PR 하나에 넣는다.
- **`surface-ink`에 겹친 하드코딩 bg는 토큰을 덮는다.** 같은 토큰 PR에서 지워야 `#1A1917`이 화면에 나온다: `components/sections/Footer.tsx:14`·`FinalCTA.tsx:11`(`bg-[#111110]`), Hero, `app/product/sw/page.tsx:958·1535`, `app/blog/BlogPageClient.tsx:331`. `components/product/hw/ValueAnchor.tsx:58`의 `surface-ink` + 하드코딩 bg는 P4-HW에서 paper로 옮기며 지운다(HW 먹 장은 AllInOne 하나, 2026-10-28). `components/sections/Manifesto.tsx:7`은 `surface-ink` 없이 `bg-[#111110]`만 있으므로 `<Section surface="ink">`로 바꾼다.

---

## 3. 패턴과 값 (데스크톱 / 모바일)

### 3-1. 레이아웃 값 요약 (정본은 system §1, 여기서는 지면 관련만 옮긴다)

| 항목 | 모바일 | 데스크톱 | 비고 |
|---|---|---|---|
| 거터 | 16px (`px-4`) | 24px (`sm:` ≥40rem), 48px (`lg:` ≥64rem) | 가로 스크롤 0 |
| 콘텐츠 폭 | 100% − 32px | `max-w-page` 1296px − 96px = **1200px** | `.container`(1400)는 공개 화면에서 쓰지 않는다. 큰 도판(plate)도 이 폭 안이다 |
| 그리드 | 1열 왼쪽 정렬 | 12칸(≥64rem, 칸 약 78 · 간격 24): 레일 1–3, 본문 4–12, 여백 10–12 | 정본은 system §4-4(TY-1). 공개 h1/h2 가운데 정렬 0 |
| 리듬 `base` | 64px | 96px (≥48rem) | 일반 섹션 |
| 리듬 `act` | 80px | 128px | Act·장 머리 섹션, 먹 서사 |
| 리듬 `band` | 40px | 48px | LogoBar 띠(홈의 중간 CTA 띠는 04 화면 섹션 안 요소다) |
| 리듬 `none` | 0 | 0 | Hero(자체 패딩) |
| 섹션 사이 경계선 | 0 | 0 | |
| masthead 위 패딩 | 16px | 16px | 모든 폭이 같다(X04) |
| Kicker → 헤딩 / 헤딩 → 덱 / 머리 블록 아래 | 12 / 16 / 32px | 12 / 20 / 40px | ≥64rem에서는 Kicker가 레일(1–3칸), H2가 본문 칸(4–12)에 서고 위 맞춤 ±4px다(TY-1, system 소관) |
| 카드 그리드 gap | 16px | 24px (≥40rem) | |
| 모눈 셀 | 48px | 56px (≥40rem) | `pattern-grid` |
| `--header-h` | 76px | 80px (≥48rem) | |
| Hero 위 패딩 | `calc(var(--header-h) + 48px)` | `calc(var(--header-h) + 80px)` (≥48rem) | 캡처 전 V11 표지(H1 1–9칸, 덱·CTA 8–12칸). 캡처 커밋 뒤 7/5 분할(≥64rem, gap 48) |
| 앵커 오프셋 | `scroll-padding-top: calc(var(--header-h) + 16px)` | 같음 | `(width < 48rem)`에서 `[data-subnav]`가 있으면 +44px. 열린 질문 1 참고 |

### 3-2. Section 래퍼 — `components/landing/Section.tsx` (API 정본: system §1)

훅이 없는 서버 컴포넌트라 `"use client"` 섹션 안에서도 import할 수 있다. `rails`·`bleed`·`as`·`pattern` prop은 없다.

```tsx
import type { ComponentPropsWithRef } from "react"
import { cn } from "@/lib/utils"

// 공개 surface에 sheet는 없다(RA-7). sheet는 물건(폼·표·사진 있는 카드·Frame·plate·요금)의 바탕이다.
const SURFACE = {
  paper: "bg-surface-paper",
  sunken: "bg-surface-sunken",
  ink: "surface-ink",
} as const

const RHYTHM = {
  base: "py-16 md:py-24",
  act: "py-20 md:py-32",
  band: "py-10 md:py-12",
  none: "",
} as const

type SectionProps = ComponentPropsWithRef<"section"> & {
  surface?: keyof typeof SURFACE
  rhythm?: keyof typeof RHYTHM
}

export function Section({ surface = "paper", rhythm = "base", className, children, ...rest }: SectionProps) {
  return (
    <section
      data-surface={surface}
      className={cn("relative overflow-x-clip scroll-mt-(--header-h)", SURFACE[surface], RHYTHM[rhythm], className)}
      {...rest}
    >
      <div className="mx-auto w-full max-w-page px-4 sm:px-6 lg:px-12">{children}</div>
    </section>
  )
}
```

- `ComponentPropsWithRef`를 쓰는 이유: SolutionOverview(`ref={sectionRef}`)와 BigBackdropImage가 ref를 넘긴다. React 19.2에서는 `{...rest}`로 그대로 전달된다. 첫 적용은 SolutionOverview 한 곳으로 하고 `npm run typecheck`를 통과시킨 뒤 확산한다.
- `overflow-x-clip`: 블롭 때문에 붙은 `overflow-hidden`(공개 범위 126건/44파일)을 지울 때 이것으로 바꾼다. 스크롤 컨테이너를 만들지 않으므로 안쪽 sticky가 살아 있고, 가로 넘침은 잘린다.
- `isolation`은 걸지 않는다. 섹션 아래로 넘치는 인라인 팝오버가 다음 섹션 밑에 깔리기 때문이다. 넘치는 레이어는 포털로 띄운다.
- `data-surface`는 예산 검사(§7)의 기준이다. Footer는 Section을 쓰지 않으므로 먹 예산에서 자동으로 빠진다. `surface="sheet"`는 타입에서 빠지므로 섹션 지면 sheet는 컴파일 단계에서 0이다.
- 64rem 이상 12칸 그리드(레일·본문·여백)는 Section 프리미티브가 갖는다. 열 정의와 ChapterHead 구성은 system §4-4(TY-1)가 소유한다.
- `scroll-mt-(--header-h)`는 system 출력 정본을 그대로 따른 것이다. `:root:has(.site)`의 `scroll-padding-top`과 더해지는 문제는 열린 질문 1에 있다.

### 3-3. 지면 배정 규칙

C19 · RA-7(고급화 2026-10-28): paper가 기본이고, 지면 변화는 드물게 둔다.

| 지면 | 배정 기준 | 금지 |
|---|---|---|
| paper | 기본값이다. 모든 섹션의 바닥이다: Hero 표지, LogoBar 띠(위아래 hair), 중간 CTA 띠, 장부·표·카드·Frame·열린 단이 있는 섹션, 읽기 면 바닥, 고정 바 | — |
| sheet | **섹션 지면으로 쓰지 않는다.** 물건에만 쓴다: Frame 안 캡처, plate, 요금 Plan, 사진 있는 사례 카드, 폼, 표 외곽, 입력 바탕 | 섹션 지면(`surface="sheet"`), 글만 있는 카드의 상자(→ 열린 단, CO-9) |
| sunken | 섹션은 3역할만: 도해(페이지당 1, 홈 03 흐름 OS 지도·HW LatencyProof), 부록(홈 진단표), FinalCTA 띠(콘텐츠 CTA 띠 포함). 물건 수준에서는 capture·mock Frame의 매트(V16)와 제품 판 바탕 값 | **연속 배치**, 3역할 밖의 섹션(LogoBar 띠·카드 받침 등), 입력 바탕(플레이스홀더 4.19 미달) |
| ink | 페이지당 서사 1곳 + Footer | §3-6 허용 목록 밖의 모든 것, 읽기 면 |
| skeleton | 로딩 상태, 화면 캡처 속 개인정보 단색 마스킹(리터럴 hex가 아니라 이 토큰 값, 블러 금지) | 장식 |

- 면 색 변화(1.06–1.12:1)로 의미를 전달하지 않는다. 묶음 구분은 헤딩·`aria-labelledby`·머리 괘선이 맡는다.
- SW·HW는 다크·그린·그라데이션·비토큰 면을 바꾸고, 기존 white 섹션은 모두 paper로 바꾼다(§4 표의 `paper*` = white → paper 이름 변경만). 3역할 밖의 sunken 섹션도 paper로 바꾼다.

### 3-4. 구분선 체계

| 위치 | 선 | 값 | 굵기 | 지금 → 바꿀 곳 |
|---|---|---|---|---|
| 섹션과 섹션 사이 | **없음** | — | — | `border-y` 삭제: LogoBar.tsx:42, GlobalScale.tsx:15, app/product/page.tsx:100(border-b)·153(border-t), hw/page.tsx:1331(border-t) |
| Act·장 머리 | `masthead` | 1px `--line-ink`, 콘텐츠 폭, 섹션 안 첫 요소, 위 패딩 16 | 1px 고정 | 홈 6곳(01–06), SW 4곳, HW 4곳 |
| LogoBar·중간 CTA 띠 | 위·아래 hair | `border-y border-line-hair`, 콘텐츠 폭(섹션 안쪽 요소) | hair | 홈 2곳(LogoBar, 04 화면 끝 CTA 띠) |
| FinalCTA·콘텐츠 CTA 띠 | `rule-double` | 1px 먹 + 3px 간격 + hair | 먹 1px + hair | FinalCTA, 블로그·행사·자료 CTA |
| 섹션 안 행·항목·장부 행 | hair | `border-t border-line-hair` | hair | ProblemCost 장부 6행, 목록·TocRow·FAQ 행 |
| 열린 단(글 카드) | 위 hair + 단 사이 세로 hair(≥64rem) | `border-t border-line-hair`, 단 간격 32/48 | hair | 인덱스·후기·가치 카드(CO-9, cards_motion 소관) |
| 표 | 상단 먹 / 머리 아래 strong / 행 hair | `table-paper`(controls) | 1px / 1px / hair | Comparison, HW 사양, /pricing |
| 숫자 열이 있는 장부의 합계 | 위 1px 먹 + 아래 3px double 먹 | 견적·사양 표에서만 | 1px | 홈 02 공감 장부에는 없다(C08) |
| 헤더 하단 | hair | 스크롤 뒤에만 opacity 0→1 | hair | Header.tsx:56, ProductTabNav.tsx:19 |
| 먹 지면 안 | hair `/.12`(2dppx 이상 `/.20`) | | hair | Footer.tsx:71 `border-white/[0.08]` |
| 장식 구분선 | **금지** | — | — | 그라데이션 1px(Hero.tsx:118, EraVision.tsx:48·52), WaveDivider(sw/page.tsx:209 + 사용 5곳) |

- **굵기 'hair'는 `--line-w-hair`다(CO-5 · 고급화 2026-10-28).** 1px이고, 2dppx 이상에서 .5px + α .14(먹 위 .5px + `/.20`), `prefers-contrast: more`에서 1px + `/.32`다. 적용처는 위 표의 hair 외에 fig-edge, 카드·Frame 테두리, 캡션 괘선이다. masthead 1px 먹, 조작 경계 1px `--line-control`, 2px 바·포커스는 그대로다. 검수는 iPhone 실기기로 하고, DPR1 화면은 P2 전과 픽셀 차이가 0이어야 한다.

**`--line-ink` 사용처는 닫힌 목록 5곳이다(X04).** Act·장 머리 괘선, 표 상단, 숫자 열이 있는 장부의 합계 이중선, CTA 띠 `rule-double` 윗선, 추천 Plan 테두리. hover에는 쓰지 않는다.

### 3-5. 배경 처리 — plain 하나 + 도해 모눈 (C19)

- **섹션 배경 처리는 plain 하나다.** rails, ruled, photo, 섹션 grid는 폐기했다.
- **모눈(`pattern-grid`)은 도해 figure 요소 자체의 배경이다.**
  - 개수는 페이지당 1개 이하다.
  - 셀은 48px, `(width >= 40rem)`에서 56px이다.
  - 선은 `--line-hair`, 정지 상태다.
  - 의사요소·마스크·z-index가 없고 가장자리는 하드 컷이다.
- **공통 금지**: 마스크, `filter`, `mix-blend-mode`, `backdrop-filter`, `background-attachment: fixed`, `contain: paint`, `will-change`, 배경 애니메이션.
- **허용처**: 홈 03 흐름(SolutionOverview) 수업 OS 지도, HW ProductAnatomy 도해, /product 인덱스 도해. SW는 현재 후보가 0이다(도구 목록·LearningCycle 카드는 도해가 아니다).
- 본문 단락 뒤, 섹션 전체, 표, 먹 지면에는 모눈을 쓰지 않는다.

### 3-6. 먹 지면 — 허용 목록과 예산 (gap 반영)

- 칠하는 방법은 `surface-ink` 하나다(Section `surface="ink"` 또는 Footer 루트). 바탕은 단색이고, 블롭·그라데이션·그레인·글로우·글래스·그림자·mix-blend 이미지는 0이다.
- **허용**
  - 글자: `text-fg-ink|body|muted`. 알파 .50 미만인 읽는 글자는 금지한다.
  - PullQuote
  - 박스 없는 수치. `lib/facts.ts`에 등록된 출처 있는 것만 쓴다.
  - hair 구분선과 hair로 나눈 텍스트 행 목록(`<ul>`, 표 요소 아님)
  - Act 머리 괘선(`/.72`)
  - 텍스트 링크(`link-quiet`). 푸터 뉴스레터도 텍스트 링크로 두고, 신청은 별도 폼에서 받는다(C14 개정)
  - 미리 합성한 제품 컷아웃 한 컷(HW AllInOne, CO-8). `--surface-ink` 값(`#1A1917`)과 같은 판에 미리 합성하고, 접지 그림자 α ≤ .12, 글로우·blend·마스크는 0, 라벨은 '제품 렌더'다. 출처 장부에서 확인된 렌더만 쓴다.
- **금지**
  - 컨트롤 전부: 채움 버튼(primary가 `.surface-ink` 안에 있으면 가드가 막는다), line 버튼, 입력(C14 개정 · 고급화 2026-10-28)
  - Frame, 표, 사진, sheet 카드, 밝은 위젯·외부 임베드, 배지·pill
- 먹 위 액센트는 세이지 `#8FC4AC`이고 선·점·밑줄·포커스·링크에만 쓴다. Manifesto 그라데이션 텍스트(:38)는 `ink-underline-scrub`(typography·cards_motion 소관)으로 바꾼다.
- **예산**(Footer 제외, 빌드 HTML `[data-surface=ink]` 카운트). 먹 장은 페이지당 1이고 제품 페이지 예외도 0이다(V4 · CO-8).

| 페이지 | 먹 섹션 | 대상 |
|---|---|---|
| 홈 | 1 | Manifesto |
| SW | 1 | FullscreenQuote(PullQuote) |
| HW | 1 | AllInOne(OPS 제품 한 컷 + capability hair 행 목록. 컷아웃 출처가 확인되지 않으면 타이포 먹 + 행 목록) |
| ai-report | 0 | 먹 지면 없음. Frame 안 mock에도 `surface-ink`를 쓰지 않는다(카운트 우회 예외 없음, §11-8) |
| /pricing·/product·읽기·전환 면 | 0 | |

### 3-7. 지면 위 카드·Frame 바탕과 그림자 (X05·C13)

상자는 줄인다(CO-9 · V14-A · V16-A, 고급화 2026-10-28). sheet 상자는 '집어 들 수 있는 물건'에만 쓰고, 글만 있는 카드는 지면에 바로 놓는다.

| 섹션 지면 | 카드·Frame 바탕 | 테두리 | 링크 카드 hover·focus-within |
|---|---|---|---|
| paper·sunken | 물건(사진 있는 사례·요금 Plan·폼·표 외곽)은 `bg-surface-sheet`. capture·mock Frame은 sunken 매트 안 캡처(아래). 글만 있는 카드(인덱스·후기·가치)는 열린 단: 채움 0·상자 0 | 물건은 `border-line-hair`, r0. 열린 단은 위 hair + ≥64rem 단 사이 세로 hair | `border-line-strong`(열린 단은 위 괘선) + 화살표 2px, `duration-(--motion-base) ease-soft hover:duration-(--motion-fast) focus-visible:duration-(--motion-fast)`(진입 160 · 이탈 320, V17). 제목 색·밑줄·배경·그림자·이동은 바뀌지 않는다. 링크 단은 화살표를 늘 보이고 히트 영역은 단 전체다 |
| ink | **금지** | — | — |

- Frame은 `components/ui/figure.tsx`(imagery 소유, X10)에 있다. Figure/Frame은 출처 장부(`data/image-credits.json`) id 하나만 받고, 라벨은 장부에서 만든다(X11 개정, imagery 소관). 코드 목업 Frame도 장부에 kind 'mock' 행(id)으로 등록하고, 자식으로 목업 컴포넌트를 받는다(2026-10-28).
- **capture·mock Frame(V16-A)**: 40rem 이상에서는 sunken 매트(여백 20px, 64rem 이상 32px) 안에 1px hair를 두른 캡처를 r0, 그림자 0으로 놓는다. 40rem 미만에서는 매트 없이 전폭 캡처로 둔다. 제목줄은 없다. 목업은 Frame 안 오른쪽 위에 점선 태그 '예시 화면'을 단다(X11). 대체 도판이 오기 전에 빈 Frame을 두지 않는다.
- **plate**: 큰 도판은 콘텐츠 폭 plate다(`max-w-page` 1200 안, 16:9 · 모바일 4:5 아트 디렉션, r0, 위에 글자 없음). 예산은 홈 0, SW ≤1, HW ≤2, 블로그 글 표지 1이고 `data-plate`로 센다. 풀블리드와 콘텐츠 이미지 `sizes="100vw"`는 0이다(imagery §3-4 소관, system §4-2 'wide 없음'이 정본).
- **반경(V14-A)**: 물건(카드·Figure·Frame·plate·표·띠·IconFrame·도해 노드)은 r0, 컨트롤(스위치 트랙 포함)과 떠 있는 층(Dialog·드롭다운·토스트·모바일 메뉴)은 r6이다. 원형은 필터 칩·상태 점·스위치 썸뿐이고, chatbot 파트 합의 전까지 기존 챗봇 런처를 둔다. 반경 가드는 허용목록 방식이다(cards_motion·system 소관).
- **그림자**
  - 공개 화면에서는 `--shadow-deep` 하나만 쓰고, 대상은 Dialog·드롭다운·토스트·모바일 메뉴 패널이다.
  - 카드·Frame·plate·표·컨트롤·섹션·헤더·MobileFloatingCTA의 그림자는 0이다. Frame은 그림자 대신 매트로 지면과 갈린다.
  - `--shadow-card`는 공개 화면에서 쓰지 않는다(어드민은 유지).
  - **X05 예외(이미지 내용)**: '제품 렌더' 자산 안에 구운 접지 그림자 1개만 허용한다(α ≤ .18, 띄움 0, 색 후광·림 라이트·반사 바닥 0, 좌상 키 라이트 하나). CSS `box-shadow`·`drop-shadow`·`filter` 규칙은 그대로다. 제품 판은 sunken 값 한 색 무봉 판이다(CO-7, imagery 소관).
- `components/ui/card.tsx`의 기본 그림자는 어드민과 공유하므로 바꾸지 않는다. 공개 variant에서만 0으로 하고, 공개 family `column`(열린 단)을 더한다. legacy family는 바이트 그대로 둔다(cards_motion 소관).
- 정보 카드에는 hover가 없다.

### 3-8. 헤더·모바일 메뉴·고정 바 (C27·X09)

| 요소 | 값 | 지금 |
|---|---|---|
| Header 루트 | `fixed inset-x-0 top-0 z-(--z-header) h-(--header-h) bg-surface-paper`. 높이 고정(76/80), 불투명, 그림자 0, 블러 0 | Header.tsx:54-57 `z-50 … bg-white/95 … shadow-[0_8px_24px…] py-4` / `bg-white/80 py-6`(92/87 → 77/72px로 바뀌며 Hero를 덮는다) |
| Header 하단선 | `after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:border-b after:border-line-hair after:opacity-0 after:transition-opacity after:duration-(--motion-base) after:ease-soft data-[scrolled=true]:after:opacity-100` | `border-b border-black/[0.08]` |
| 스크롤 감지 | 상단 1px 센티넬 IntersectionObserver → `data-scrolled` | scroll 리스너 |
| 모바일 메뉴 패널 | `bg-surface-paper`, 항목 높이 48, 항목 사이 hair, 그림자 `--shadow-deep`, `max-h-[calc(100svh-var(--header-h))]` | :87 `shadow-[0_14px_34px…]`, `100svh-5rem` |
| 모바일 메뉴 오버레이 | `bg-surface-scrim`, 블러 없음 | |
| 데스크톱 드롭다운 | `bg-surface-sheet` + hair, r6(V14), `--shadow-deep` | :135 `rounded-2xl … shadow-[0_12px_28px…]` |
| 활성 항목 | 채움 0. 표시는 controls의 index-tab 문법(aria-current + 2px 막대, C12) | :104·123·147·169 `bg-[#ECFDF5]` |
| 모바일 '쇼룸 예약' | ghost 텍스트 링크(X03) | :186 `bg-[#ECFDF5] hover:bg-[#D1FAE5]` |
| ProductTabNav | `sticky top-(--header-h) z-(--z-subnav) bg-surface-paper border-b border-line-hair`, 블러 0, `data-subnav` | :19 `top-[80px] z-40 bg-[#FAFAF8]/95 backdrop-blur-md border-black/[0.06]`(모바일 헤더 76에서 4px 틈), :31 활성 민트 |
| MobileFloatingCTA | `bg-surface-paper` 불투명 + 1px `--line-control` 아웃라인, 그림자 0, 블러 0, `z-(--z-floating)`, `bottom: calc(env(safe-area-inset-bottom) + 16px)`. 뷰포트당 떠 있는 요소는 1개이고, 흐름 안 결정 CTA가 보이면 숨긴다(SY-2) | 작업 트리: `bg-white/85 … shadow-[…] backdrop-blur-md z-40`. 다른 세션이 병합한 뒤에 적용한다 |
| 스킵 링크 | `z-(--z-skiplink)` | `z-[60]` |
| viewport | `export const viewport = { themeColor: DESIGN_TOKENS.paper, colorScheme: "only light" }`(값은 `lib/design-tokens.ts`, V15 뒤 `#F9F8F5`). manifest는 만들지 않는다 | `app/layout.tsx`에 export 없음 |

- 하단선 opacity 페이드는 이동이 아니므로 reduced에서도 유지한다. `400ms` 리터럴은 쓰지 않는다(감사 §5-5-5를 320ms로 동기화).
- `:root:has(.site){color-scheme:light}`와 viewport `only light`로 Chrome·삼성 인터넷의 자동 다크 반전을 피한다. 실제로 피해지는지는 실기기에서 확인한다.

### 3-9. 푸터 (Footer.tsx:14)

Footer 루트는 `<footer className="surface-ink …">`이고 Section을 쓰지 않는다. 그래서 먹 예산에 들어가지 않는다. 푸터는 읽기 전용 판권면이고, 먹 위 컨트롤은 0이다(C14 개정 · 고급화 2026-10-28).

| 요소 | 지금 | 목표 | 대비(먹 `#1A1917` 위) |
|---|---|---|---|
| 바탕 | `bg-[#111110]`(`surface-ink`와 겹침, :14) | `surface-ink` 하나. 하드코딩 bg는 V15 토큰 PR에서 지운다 | — |
| 본문·링크 | `text-[#A39E98]`(7.11, 비토큰) | `text-fg-body`, 링크는 `link-quiet`(controls) | 9.14 |
| 열 제목 | `text-white` | `text-fg-ink` | 16.81 |
| 판권면(사업자 정보) | `text-white/40` 12px(:72, **3.82 미달**) | `text-fg-muted text-note`(13px). 상호·대표자·주소·사업자등록번호·통신판매업 신고번호·고객센터·개인정보 보호책임자·쇼룸 행. 운영자가 준 값만 렌더한다 | 6.00 |
| 저작권 | `text-white/25`(:83, **2.23 미달**) | `text-fg-muted text-note`. © 연도는 KST 실행 연도 | 6.00 |
| 구분 기호 | `|` `text-white/20`(:74) | '·' `text-fg-faint`, `aria-hidden` | 장식 |
| 내부 구분선 | `border-white/[0.08]`(:71) | `border-line-hair`(2dppx 이상 .5px `/.20`) | 장식 |
| 뉴스레터 | 입력 + '구독' 버튼(dark variant), '동의한 것으로 간주' 문구 | 텍스트 링크(`link-quiet`) 하나. 신청은 별도 폼에서 체크 안 된 수신 동의 체크박스로 받는다. '간주' 문구 0(H에서 먼저 삭제) | 9.14 |

- 지금 열의 대비 실측값(`white/40` 3.82 등)은 지금 바탕 `#111110` 기준이다.
- FinalCTA(sunken)와 푸터 사이에는 경계선을 두지 않는다. 바탕 대비가 15.7:1로 충분하다.
- 법정 표기 블록 구성과 행 히트 44는 controls §3.6이 소유한다.

### 3-10. 띠

- **LogoBar**(홈, X16 개정 · V10-A)
  - `<Section surface="paper" rhythm="band">`, 안쪽 래퍼 `border-y border-line-hair`(위아래 hair). 서버 컴포넌트다.
  - 정적 줄바꿈 목록이다: 공개 동의를 받은 이름만 가나다순으로 싣고 숫자는 없다('외 N곳' 0). 동의 기관이 6곳 미만이면 렌더하지 않는다. 이름은 `text-body font-medium text-fg-muted`이고 앞 점은 없다.
  - 마키, 좌우 페이드 div(:52-53), 인라인 keyframes(:72), `"use client"`, 섹션 `border-y`(:42)를 삭제한다. 그래서 가드 예외도 0이다.
- **중간 CTA 띠**(홈 1곳: 04 화면 섹션 끝, V10-A)
  - 별도 Section이 아니라 04 화면 섹션 안의 마지막 요소다. 래퍼 `border-y border-line-hair py-6`
  - 덱 한 줄 + 확인 CTA 1개(`variant="line" size="cta"`, ctaId `home_mid_showroom` 유지). 라벨은 `lib/cta.ts` 사전에서 오고(확인 '쇼룸 방문 예약'), 문구는 운영자 확인 뒤 확정한다(C15 개정)
  - 데스크톱은 한 줄, 모바일은 세로 배치에 폭 전체 버튼이다.
- **FinalCTA 띠**(V5-A)
  - `<Section surface="sunken">`이고 안쪽 첫 요소에 `rule-double pt-6 md:pt-8`을 둔다. 머리 블록은 왼쪽 정렬이다.
  - h2(`text-h1`, 36→56/600, V13) → 덱 → `<Button size="cta">`(primary 결정 CTA, 모바일 폭 전체) + ghost 텍스트 링크 순서다(C10·C15).
  - Display·먹 패널은 쓰지 않는다. 바로 아래 먹 푸터와는 지면 대비와 위계(다른 섹션 h2보다 한 단계 위)로 분리된다.
- **콘텐츠 CTA**(블로그·행사·자료)는 FinalCTA 띠와 같은 문법(sunken + `rule-double`)이다. sheet 카드 CTA와 먹 패널은 쓰지 않는다.

### 3-11. 유틸 CSS — `app/styles/utilities.css` (이 스펙 소유 3종)

```css
/* Act·장 머리 괘선(X04). 정적 상태이고 긋기 애니메이션은 없다.
   선을 ::before의 border-top으로 그리므로 forced-colors에서 CanvasText로 자동 대체된다(별도 블록 불필요). */
@utility masthead {
  position: relative;
  padding-top: 16px;
  &::before {
    content: "";
    position: absolute;
    inset: 0 0 auto 0;
    border-top: 1px solid var(--line-ink);
  }
}

/* CTA 띠 윗선: 1px 먹 + 3px 간격 + hair(--line-w-hair, 2dppx 이상 .5px · CO-5).
   forced-colors에서는 background-image가 none이 되어 먹 border만 남는다(의도된 대체). */
@utility rule-double {
  border-top: 1px solid var(--line-ink);
  background-image: linear-gradient(var(--line-hair), var(--line-hair));
  background-size: 100% var(--line-w-hair);
  background-position: 0 3px;
  background-repeat: no-repeat;
}

/* 도해 figure 자체의 모눈(C19). 선은 셀 끝에 긋는다. 그라데이션 %는 타일 기준이라 셀 크기와 무관하다.
   figure의 왼쪽·위 테두리와 첫 선이 겹치지 않는다. 바탕색은 요소의 bg-*가 맡는다. */
@utility pattern-grid {
  background-image:
    linear-gradient(to right, transparent calc(100% - 1px), var(--line-hair) 0),
    linear-gradient(to bottom, transparent calc(100% - 1px), var(--line-hair) 0);
  background-size: 48px 48px;
  @media (width >= 40rem) { background-size: 56px 56px; }
  @media (prefers-contrast: more) { background-image: none; }  /* 고대비에서는 장식 소거 */
}
```

- 유틸에는 정적인 모양만 둔다. transform·opacity·animation은 선언하지 않는다(css_architecture).
- `pattern-grid`는 forced-colors에서 그라데이션이 none이 되어 저절로 사라진다(장식).

### 3-12. 공개 셸 전역 — `app/styles/site-base.css` (이 스펙의 몫)

```css
@layer base {
  :root:has(.site) {
    color-scheme: light;
    scroll-padding-top: calc(var(--header-h) + 16px);
  }
  /* 밝은 지면 선택: 그린 잉크 .14(CO-3 · 고급화 2026-10-28). 공개 민트는 0이다.
     글자는 리터럴 #111110이다(paper 위 합성 #D7DFDA, 13.91). 먹 위는 tokens.css .surface-ink가 다시 정의한다. */
  :where(.site) ::selection {
    background-color: rgb(8 71 52 / 0.14);
    color: #111110;
  }
}
```

- 먹 위 selection은 세이지 알파 바탕 + 글자 `#FAFAF8`이다. 위 규칙이 글자를 `#111110`으로 고정하므로 `.surface-ink` 안에서 다시 정의해야 한다(§2-4, 알파 값은 열린 질문 9).

- `.site` 표지는 C17의 세 곳에 붙는다. AppChrome 공개 분기의 `<div className="site contents">`, 공개 DialogContent 5곳, 토스트 뷰포트다. `body[data-shell]` effect는 만들지 않는다.
- AppChrome `<main>`(:122)의 `selection:bg-primary/20 selection:text-primary`는 삭제한다. 전역 `::selection`이 대신한다.
- 포커스 outline, 입력 16px 하한, autofill 덮개(`var(--surface-sheet)`), reduced 스피너는 site-base 끝의 무레이어 보증 블록 4개(system·controls 소유)가 맡는다. autofill 덮개는 먹 위에서 자동으로 `#1A1917`이 된다.

---

## 4. 사용 규칙과 대상 파일

### 4-1. 규칙 (Do)

- 바탕은 `<Section surface=…>`, `bg-surface-*`, `surface-ink` 클래스로만 칠한다. 글자·선은 `text-fg-*`·`border-line-*`·`decoration-line-link`로만 쓴다.
- 지면은 역할로 배정한다. paper가 기본이고, sunken은 도해·부록·FinalCTA 3역할에만 쓰며 연속하지 않는다. sheet는 섹션 지면으로 쓰지 않고 물건에만 쓴다.
- 섹션 분리는 `masthead`와 리듬 여백으로 한다. 장부·목록의 행은 실제 hair 테두리로 긋는다.
- 글만 있는 카드는 열린 단으로 둔다. sheet 상자는 Frame·plate·요금·사진 있는 사례·폼·표에만 쓴다(CO-9).
- 모눈은 도해 figure 자체에, 페이지당 1개만 쓴다.
- 헤더 오프셋은 `--header-h`로만, z는 `z-(--z-*)`로만 쓴다.
- 카드·Frame·도판이 소비하는 루트 속성은 다음과 같다. 예산 검사 계약이다(열린 질문 2).
  - Card: `data-card`(cards_motion)
  - Frame: `data-frame`(imagery), Figure: `data-figure`(imagery)
  - plate: `data-plate`(imagery, 예산 홈 0·SW ≤1·HW ≤2)

### 4-2. 홈 (`app/page.tsx` 순서, C19 · V10-A 11지면)

V10-A(2026-10-28)로 홈은 11블록 + 푸터다. paper가 기본이고, sunken은 부록·03 흐름·FinalCTA 3곳(연속 0), 먹은 Manifesto + 푸터, 섹션 지면 sheet는 0이다. 인접 지면 바뀜은 푸터까지 6회다: paper(Hero~02) → sunken(부록) → 먹(Manifesto) → sunken(03) → paper(04~06) → sunken(FinalCTA) → 먹(푸터). '지금' 열은 HEAD `4c9e509c` 기준이다.

| # | 지면 (섹션, 파일:줄) | 지금 | 목표 지면 | 머리 괘선 | rhythm | 바뀌는 것 |
|---|---|---|---|---|---|---|
| 1 | Hero (Hero.tsx:15-120) | 래퍼 #FAFAF8, sticky 커버 #0A1511(:17), 오버레이 3겹(:32-34), 글래스 배지(:40), 겹침 섹션 + 위 그림자(:86), 유령 글자, 그라데이션 1px(:118) | paper | — (Kicker 라벨 '수업 시스템 OS'만, `folio={null}`) | none | 커버·오버레이·겹침·유령 글자·그라데이션 선을 삭제한다. **V11-A**: 출처를 확인한 capture가 커밋되기 전에는 무도판 비대칭 표지다. H1은 1–9칸, 덱과 CTA 두 개는 8–12칸 H1 마지막 줄 아래에 두고 도판은 0이다. 현 도판 `hero-dashboard.webp`는 내리고, 출처 미확인 도판에 라벨을 짐작해 달지 않는다. 캡처가 커밋되면 **V3-A** 7/5로 바꾸고 오른쪽 5칸에 capture Frame(EDB 판서 16:10, V16 매트, r0, 그림자 0, 캡션 '실제 화면 · YYYY.MM 캡처')을 둔다. 같은 이미지 파일은 페이지당 1회다. 배지는 V9-A Kicker로 바꾼다. 진입 애니메이션은 0이다(V17). LCP는 H1이다 |
| 2 | LogoBar 띠 (LogoBar.tsx:42) | #F6F5F4 + border-y .06 + 마키 + 페이드 | paper 띠(위아래 hair) | — | band | 공개 동의 이름만 가나다순 정적 목록, 숫자 0, 6곳 미만이면 렌더하지 않는다(X16). 섹션 border-y·페이드·마키 삭제 |
| 3 | 01 선언 — HomeEntitySummary (:20) | white | paper | **01 선언** | act | white → paper. `dl` 좌측선 `#084734/20`은 hair로 |
| 4 | 02 공감 — ProblemCost (:72-82) | #111110 + 흰 격자 + 블롭(:78-79) + 노이즈(:82) + 카드 #1C1B1A·#2a2925·white | paper | **02 공감** | act | **V4-A·C08**: 정성 장부 6행(○ + 모듈명 `text-label` + 질문형 문장 `text-body`), 행 구분은 hair다. 6행의 이름·순서는 03 흐름 OS 지도 노드와 같다(MO-2 ○→● 콜백). 숫자 열·합계 이중선·카운터는 0이다. 다크·격자·블롭·노이즈·카드를 삭제한다 |
| 5 | 부록 진단표 — HomeLeadMagnet (:25) | white, #ECFDF5 타일(:90)·노트(:105) | sunken(부록) | — | base | 진단표 미리보기는 sheet 상자 1개(r0, hair, 중첩 상자·그림자 0)로 두고 민트 타일은 지운다. 노트는 위 hair + `text-note`로 바꾼다. `scroll-mt-[76px]` 삭제 |
| 6 | Manifesto (:7-9) | #111110 + 800px 블러 + 그라데이션 텍스트(:38) | **ink** | — | act | 글로우·`overflow-hidden` 삭제, 둘째 줄 `ink-underline-scrub`. 루트 `bg-[#111110]`(:7)은 `<Section surface="ink">`로 |
| 7 | 03 흐름 — SolutionOverview (:56) | #F6F5F4, 그라데이션 pill(:59) | sunken(도해) | **03 흐름** | act | pill은 Kicker로 바꾼다. OS 지도 figure에 `pattern-grid`(페이지 유일). 노드는 r0, 윤곽 1.5px(`--stroke-pen`) `--line-control`(정보 경계, C23), 13px 라벨, 아이콘 원 0(SY-3). 노드 점은 ○→●로 한 번 켜진다(MO-2) |
| 8 | 04 화면 (새 영역 캡처) | —(KeyUseCases·DashboardPreview 자리) | paper | **04 화면** | act | 영역 캡처 1장(720×450 CSS px, DPR2)을 capture Frame(V16 매트, r0, 그림자 0)에 둔다. 캡처가 커밋되기 전에는 Frame을 두지 않는다(빈 Frame 0). 섹션 끝에 중간 CTA 띠 1(§3-10, 섹션 안 요소) |
| 9 | 05 기록 — CaseStudies(:127) + TestimonialWall(:28) + GlobalScale(:15) + Outcomes(:31) 합침 | #F6F5F4 · #F7F8F5(비토큰) · #ECFDF5 + border-y·민트 원형 칩 · #F6F5F4 + 민트 원·그라데이션 카드. CaseStudies 8.5초 자동 넘김 | paper | **05 기록** | act | 사례 서류 3건을 정적으로 둔다(64rem 이상 3열, 모바일 세로, dl 4칸, 성과 수치 0. 사진 있는 사례만 sheet 물건). 인용은 4개 이하(PullQuote, 위 hair, 2단 열린 단). 별표 마스킹·이니셜 원 0, 그린 채움 대표 후기 패널 삭제. EEO 수치 한 줄(160+개국 · 5,000만+ 교육자·학습자 · 월 3,000만+ 수업, `lib/facts.ts`)과 13px 각주를 같은 뷰포트에 둔다. 칸은 채움 없이 hair로 긋고 민트·border-y·아이콘을 삭제한다. 동의 행이 없으면 렌더하지 않고, 동의 2건 이하면 2열이다 |
| 10 | 06 확신 — Comparison (:43) | white, 그라데이션 pill(:46), 카드형 표 + 그림자 + 먹 머리(:63-67), zebra `#F6F5F4/60` | paper | **06 확신** | act | pill은 Kicker로, 표는 `table-paper`(상단 먹선, 머리 아래 strong, 행 hair, zebra·그림자·hover 들림 0)로 바꾼다. Classin 열 `.row-accent`(C21 좌측 2px 바) |
| 11 | FinalCTA (:11-17) | 다크 + 그라데이션 + 노이즈(:14) + 블롭 + 글래스 핑 배지 | sunken | `rule-double` | base | **V5-A**, 왼쪽 정렬 |
| — | Footer (Footer.tsx:14) | #111110 | ink(셸) | — | — | §3-9 판권면 |

- **빠지는 섹션**(V10-A): EraVision · KeyUseCases(SW 페이지로) · 중간 CTA 띠 ①(KeyUseCases 뒤) · DashboardPreview · ScienceBased(각주를 단 블로그 글로) · SatisfyingClass. 빠진 내용은 SW·블로그로 옮겨 색인을 유지한다.
- **홈 예산**: `[data-surface]` 11(+푸터), ink 1, sunken 3(부록·03 흐름·FinalCTA, 연속 0), 섹션 지면 sheet 0, 지면 바뀜 ≤6(푸터 포함), `pattern-grid` 1, masthead 6, plate 0, 그림자 있는 Frame 0. 길이는 1440에서 ≤11,500px(목표 약 11,400px, 지금 18,406px), 375에서 ≤16,000px. '한 흐름' 계열 주장은 ≤2회, LCP 요소는 H1이다.
- **CTA**: 결정 CTA(default `cta`)는 지금 5곳(Hero `hero_demo` · 06 확신 `comparison_demo` · FinalCTA `final_consultation` · 헤더 · 모바일 플로팅)을 그대로 두고, 04 화면 끝 CTA 띠 1개(확인 tier, `line` cta)를 더한다. 결정 CTA는 뷰포트당 1개다.
- 블롭을 지울 때 섹션 루트의 `overflow-hidden`은 Section의 `overflow-x-clip`으로 바뀐다.
- 감사 D8(12~13지면)은 V10에서 기각됐다. 동의가 늦어 05 기록이 비면 인용 + 각주 수치 한 줄로 두고, 그래도 sunken은 연속하지 않는다.

### 4-3. 제품 SW (`app/product/sw/page.tsx`, 렌더 순서)

- 래퍼(:1587) `bg-[#FDFCF8]`는 `bg-surface-paper`로 바꾸고, `selection:bg-[#D1FAE5]`는 삭제한다.
- 섹션 지면 sheet가 없어졌으므로(RA-7) white 섹션은 모두 paper가 된다. `paper*`는 white → paper 이름 변경만이라는 뜻이다. sunken은 3역할(도해·부록·FinalCTA)에만 남는다.
- `sw/page.tsx:958·1535`의 `surface-ink` + 하드코딩 bg는 V15 토큰 PR에서 먼저 지운다(§2-7).

| # | 섹션 | 지금 | 목표 | 처리·머리 |
|---|---|---|---|---|
| 1 | Hero :1592 | #07110d + 영상 배경(영상은 쿼드러닝 클립 1080p, 포스터 two-way-blackboard는 스톡이고 페이지에 두 번 쓰인다) | paper | 지면 표지 문법. 클립은 출처 장부에서 권리를 확인한 뒤에만 쓰고, 없으면 텍스트 히어로다(IM-9). 영상은 Frame 안에 두고 C07 네 조건(≥64rem, hover:hover, no-preference, 정지 버튼·화면 밖 정지)을 따른다(imagery 소관) |
| 2 | Summary :1668 | white | paper* | 장 머리 01 |
| 3 | ImpactText(정의 :1221) | #FDFCF8 | paper | — |
| — | WaveDivider(정의 :209, 사용 :1697·1773·1837·1928·2148) | 곡선 SVG 5개 | **삭제** | — |
| 4 | '회의용 도구로…' :1702 | white | paper* | 장 머리 02 |
| 5 | LearningCycle(:945) | white + 색 카드 3 | paper | 글만 있는 카드는 열린 단(CO-9)으로 바꾸고 `p.color` 틴트를 삭제한다 |
| 6 | '교사만 쓰는 칠판은…' :1778 | 래퍼 바탕 | paper | 변화 없음 |
| 7 | '수업이 지루할 틈이…' :1842 | white | paper* | 도구 목록에 모눈을 쓰지 않는다(도해 아님) |
| 8 | '1:1 과외부터…' :1933 | 래퍼 바탕 | paper | 변화 없음 |
| 9 | HardwareTeaser(:1004) | #1a1a19 + radial | paper 띠(위아래 hair) | sunken 3역할 밖 |
| 10 | FullscreenQuote(:1267) | #084734 면 + feTurbulence(:1271-1273) + 블러 글로우(:1276) | **ink** | PullQuote. SW 유일한 먹이다 |
| 11 | '전 세계 어디서든' :2003 | #111110 + 지도 점 장식 | 렌더 안 함 → 등록 후 paper | `lib/facts.ts` 등록 전에는 렌더하지 않는다(감사 D3). 등록되면 ScaleFacts/Numeral 정적 값과 각주 |
| 12 | '수업이 끝나도…' :2049 | 래퍼 바탕 | paper | 장 머리 03 |
| 13 | AIFeatures(:1078) | #F6F5F4 | paper | sunken 3역할 밖 |
| 14 | CaseStudiesSection(:1368) | #FDFCF8 | paper | — |
| 15 | '수업 운영을 바꾼 사람들' :2153 | #F6F7F2 | paper | — |
| 16 | PricingValue(:1431) | white | paper* | 장 머리 04 |
| 17 | OnboardingRoadmap(components/product/sw/OnboardingRoadmap.tsx:55) | white | paper* | 이름만 |
| 18 | FAQ(:1167) | #FDFCF8 | paper | — |
| 19 | CinematicCases(:648) | #1a1a19 | paper | — |
| 20 | TypographyHook(:720) | #FDFCF8 | paper | — |
| 21 | FutureVision1(:782, 사용 :2187) | #084734 면 | paper | 그린 면 퇴역 |
| 22 | FutureVision2(:826, 사용 :2188) | #FDFCF8 | paper | — |
| 23 | FinalCTASection(:509, 바탕 :540-542) | #F0FDF9 그라데이션 + 파티클 + 글로우 | sunken | `rule-double`, V5-A 문법 |

- SW 예산: ink 1, `pattern-grid` 0(도해 figure가 생기면 1), masthead 4, sunken 23(연속 0), 섹션 지면 sheet 0, plate ≤1.
- SW 다이어트(감사 §5-5-2, L)로 섹션이 줄면 같은 규칙으로 다시 배정한다.

### 4-4. 제품 HW (`app/product/hw/page.tsx`, 렌더 순서)

- 래퍼(:780) `bg-[#FDFCF8] … selection:bg-[#D1FAE5] pt-20`는 `bg-surface-paper pt-(--header-h)`로 바꾼다.

| # | 섹션 | 지금 | 목표 | 처리·머리 |
|---|---|---|---|---|
| 1 | Hero :785-787 | #FDFCF8→#ECFDF5→#FDFCF8 그라데이션 | paper | 그라데이션 삭제 |
| 2 | Summary :856 | white | paper* | 장 머리 01 |
| 3 | OpeningStatement(OpeningStatement.tsx:29-31) | #FAFAF8 | paper | — |
| 4 | ClassroomStudio(ClassroomStudioSection.tsx:49) | white | paper* | 글만 있는 3카드는 열린 단(CO-9) |
| 5 | PainPointsV2(PainPointsV2.tsx:54) | white | paper* | 이름만 |
| 6 | AllInOne(AllInOneStatement.tsx:19-49) | #010302 + radial + 위아래 그라데이션, 네온 글래스 3D 이미지 `ops-glass-energy-module-black.webp`(글로우가 구워져 있음) + `mix-blend-screen`(:38) + 마스크 2겹(:27-28·48-49) | **ink** | 장 머리 02(먹 위 `/.72`). 이미지·blend·마스크를 제거한다. **CO-8**: 출처를 확인한 OPS 컷아웃을 `--surface-ink` 값과 같은 판에 미리 합성해 제품 한 컷으로 두고(접지 그림자 α ≤ .12, 글로우·blend 0, 라벨 '제품 렌더'), 옆에 capability를 hair로 나눈 텍스트 행 목록을 둔다(표 요소 아님, §3-6). 출처가 확인되지 않으면 타이포 먹 + 행 목록이다. HW 유일한 먹이다 |
| 7 | AICamera(AICameraSection.tsx:18-19) | #050708 + 그라데이션 | paper | 제품은 paper 위 밝은 판(sunken 값 무봉 판, CO-7·CO-8)으로 둔다 |
| 8 | BigBackdrop(BigBackdropImage.tsx:48-71) | black + 오버레이 .85/.40 + 패럴랙스 scale + `h-[90vh]`, 풀블리드 `sizes="100vw"` | **paper + plate** | 풀블리드를 퇴역하고 콘텐츠 폭 plate(1200, 16:9 · 모바일 4:5, r0)로 둔다. 사진 위 카피는 0이고 캡션 라벨은 장부에서 만든다(X11, 열린 질문 4). 카피는 plate 위나 아래 단에 둔다. 패럴랙스·오버레이·90vh 삭제 |
| 9 | ImpactNumbers :471-472 | #0d1a12 + radial | **렌더 안 함** | 감사 D3·D5. 등록되면 paper + ScaleFacts |
| 10 | DesignDetails(DesignDetails.tsx:53-55) | white | paper* | 이름만 |
| 11 | LatencyProof(LatencyProof.tsx:34) | #F6F5F4 | sunken(도해, 유지) | 감사 D5 뒤 차트 opacity 순차(C06), dashoffset 0 |
| 12 | SizeChooser(SizeChooser.tsx:48) | white | paper* | 이름만 |
| 13 | ValueAnchor(ValueAnchor.tsx:58-67) | #0D1A12 `min-h-screen` + blur-3xl 2개 + 글래스 카드 | paper | P4-HW에서 paper로 옮기고 :58의 `surface-ink` + 하드코딩 bg를 지운다(HW 먹 장은 AllInOne 하나, 2026-10-28). min-h-screen·블러·글래스 삭제 |
| 14 | ComparisonSection :126 | white | paper | 장 머리 03, `table-paper` |
| 15 | FullWidthPoint '약속' :926(정의 :497-507) | #0d1a12 | paper | 문장 섹션. `dark` prop과 :507 오버레이 삭제 |
| 16 | FeatureTabSection :320 | white | paper* | 이름만 |
| 17 | LessonTimeline :559 | #FDFCF8 | paper | — |
| 18 | ProductAnatomy :409 | #FDFCF8 | paper | 도해 figure에 `pattern-grid`(HW 유일) |
| 19a-c | FeatureSection ×3(:184) | 바탕 없음 | paper(래퍼) | 변화 없음 |
| 20 | AfterClass(AfterClassSection.tsx:57) | #F6F5F4 | paper | sunken 3역할 밖 |
| 21 | FullWidthPoint '교실의 경계' :1092 | 풀블리드 사진(`sizes="100vw"`) + `#0d1a12/75`(:507) | paper + plate | 풀블리드를 퇴역하고 콘텐츠 폭 plate + 캡션으로 둔다. 카피는 plate 밖 |
| 22 | FeatureSection(하이브리드) | 바탕 없음 | paper(래퍼) | 변화 없음 |
| 23 | 'COMPLETE ECOSYSTEM' :1155 | #111110 + #6EE7B7 글로우 | paper | 글로우 삭제 |
| 24 | Testimonial :615 | white | paper* | 글만 있는 후기 카드는 열린 단(CO-9) |
| 25 | SpaceScenario :689 | #FDFCF8 | paper | — |
| 26 | 라인업·사양 :1236 | 바탕 없음 | paper | 장 머리 04, 사양 표는 `table-paper`(모눈 없음) |
| 27 | OnboardingRoadmap(components/product/hw/OnboardingRoadmap.tsx:55) | #FDFCF8 | paper | — |
| 28 | 최종 CTA :1331 | white→#FDFCF8 그라데이션 + border-t | sunken | `rule-double`, border-t 삭제 |

- HW 예산: ink 1(AllInOne), `pattern-grid` 1, masthead 4(01 Summary · 02 AllInOne · 03 Comparison · 04 라인업), sunken 11·28(연속 0), 섹션 지면 sheet 0, plate ≤2(8·21). 연속 다크 4장(6~9)이 먹 1장으로 줄어든다. 둘째 먹 장은 두지 않는다(V4 · CO-8).
- 풀블리드 퇴역 대상은 `BigBackdrop`과 `FullWidthPointSection`(hw/page.tsx:497-507, `sizes="100vw"`) 둘이다(imagery §3-4·§6과 함께).

### 4-5. ai-report · /product · /pricing

- **ai-report**(`app/product/ai-report/page.tsx`, C26). '현행 유지'는 구조·레이아웃·카피만 해당하고, 토큰 퇴역은 예외 없이 적용한다.
  - 지면 순서: Hero :269 paper → Pipeline :334 sunken(도해, 페이지당 1) → Recording :382 paper* → Report :549 **paper** → **Benefits :662 `#ECFDF5` → paper** → Scenario :727 paper* → Qa :785 **paper** → Closing :834 paper*. sunken은 Pipeline 하나다(3역할, 2026-10-28).
  - 목업 :464 `bg-[#1a1a19] shadow-2xl`은 mock Frame(V16 매트, 1px hair, r0, 그림자 0)으로 바꾼다. 안쪽 UI 묘사는 밝은 토큰(`bg-surface-sunken`·`text-fg-*`·`border-line-*`)으로 그리고 `surface-ink`는 쓰지 않는다. 먹을 쓰면서 `[data-surface=ink]` 카운트에서 빠지는 예외는 canonical에 근거가 없다(§11-8). mock은 `aria-hidden`이고 sr-only 요약 + 점선 태그 '예시 화면'을 단다.
  - OutlineIcon은 IconFrame(투명)으로, '자동 녹화 중' 무한 점멸은 정적 `status-dot` + '자동 녹화'로, 무한 웨이브폼은 정적 막대로, 10px `#A39E98` 라벨은 점선 태그로 바꾼다.
  - 결과적으로 공개 화면의 `#ECFDF5`·`#D1FAE5`는 0이 된다(`::selection`도 그린 잉크로 바뀐다).
- **/product**: :100 white + `border-b`는 paper*(border 삭제), :115는 paper, :153 #F6F5F4 + `border-t`('EEO Product Family')는 paper(border 삭제)로 바꾼다. sunken은 인덱스 도해 figure가 있는 섹션 1곳만이고, 그 figure에 `pattern-grid`를 쓴다.
- **/pricing**
  - :6은 `bg-surface-paper`로 바꾼다.
  - Plan 카드 :45-47 `rounded-[20px] border-black/[0.06] shadow-sm`은 sheet r0 hair, 그림자 0으로 바꾼다(V14). 추천 Plan은 1px `--line-ink` 테두리 + 상단 '추천' 탭이다(C21, cards 소관). 추천 Plan에는 좌측 바가 없다.
  - 안내 박스 :72 `#F5FBF7`/`#DCE9E1` r20은 상자를 지우고 위 hair + `text-caption text-fg-body` 안내문으로 바꾼다(CO-9, cards_motion §4). 글자 `#44514A`는 `text-fg-body`가 된다.
  - 선택 가이드가 고른 비교 행의 2px 바는 C21-②(controls)다.

### 4-6. 읽기·전환 면

- 블로그·문서·행사·자료·업데이트·FAQ·법무·계정·로그인은 plain이다(paper 바닥. 글만 있는 카드는 열린 단·TocRow, sheet 상자는 폼·표·사진 있는 카드만). 먹 0, 모눈 0이다.
- 먹 패널은 콘텐츠 CTA 띠로 바꾼다: `app/blog/BlogPageClient.tsx:330-331`, `app/events/[slug]/page.tsx:323`, `app/events/videos/[slug]/page.tsx:162`, `app/resources/[slug]/page.tsx:638`. `BlogPageClient.tsx:331`의 `surface-ink` + 하드코딩 bg는 V15 토큰 PR에서 먼저 지운다.
- `app/contact/page.tsx:332`: 바닥 `#EDF7F2`는 paper로, `text-slate-900`은 `text-fg-ink`로 바꾼다.
- `.section-warm`은 3역할로 다시 배정한다(2026-10-28): `app/docs/page.tsx:427` 설치 안내 띠는 콘텐츠 CTA 띠(sunken + `rule-double`), `app/download/DownloadPageClient.tsx:418` '교실용 도구' 띠는 3역할 밖이라 paper다.
- `components/PublicRouteLoading.tsx:36`: `bg-[#FAFAF8]`은 `bg-surface-paper`로, `min-h-[calc(100svh-76px)] pt-[92px] … md:min-h-[calc(100svh-5rem)] md:pt-28`은 `min-h-[calc(100svh-var(--header-h))] pt-[calc(var(--header-h)+16px)]`로 바꾼다.
- 블로그 렌더러는 다른 세션이 아직 커밋하지 않았다. 읽기 면 전용 컴포넌트(Callout·TOC 등)는 article 스펙 백로그다.

### 4-7. 셸·전역 파일

| 파일 | 변경 |
|---|---|
| `app/styles/tokens.css`(신규) | §2-4·§2-5 블록 |
| `app/styles/utilities.css`(신규) | §3-11 `masthead`·`rule-double`·`pattern-grid` |
| `app/styles/site-base.css`(신규) | §3-12 `:root:has(.site)`, `::selection` |
| `app/globals.css` | import 3줄, §4-9 삭제. 새 공개 규칙은 쓰지 않는다 |
| `components/AppChrome.tsx` | 공개 분기 `<div className="site contents">`(C17-①), main selection 클래스 삭제, `isInternalPath`를 `lib/internal-path.ts`로 이전 |
| `lib/internal-path.ts`(신규) | `isInternalPath`(/admin·/checkout·/receipt). AppChrome·toast가 공유한다 |
| `components/sections/DemoModal.tsx`, `components/sections/NewsletterModal.tsx`, `components/events/EventSignupModal.tsx`, `components/auth/PublicLoginDialog.tsx`, `components/checkout/CheckoutRequestForm.tsx` | 공개 DialogContent에 `className="site"`(C17-②). `ui/dialog.tsx` 기본값은 바꾸지 않는다 |
| `components/ui/toast.tsx` | 뷰포트에 `!isInternalPath(pathname) && 'site'`(C17-③). z 기본값은 그대로 둔다 |
| `app/layout.tsx` | viewport export(값은 `lib/design-tokens.ts`). V15 뒤 theme-color `#F9F8F5` |
| `lib/design-tokens.ts`(신규, system) | paper·sheet·sunken·ink 등 hex 미러. V15 값으로 토큰 PR과 같은 커밋에서 바꾼다 |
| `app/global-error.tsx`(:22·63), `app/opengraph-image.tsx`(:13·73) | V15 값 미러. 토큰 PR과 같은 커밋 |
| `components/sections/Footer.tsx:14`, `FinalCTA.tsx:11`, `Hero.tsx`, `Manifesto.tsx:7`, `app/product/sw/page.tsx:958·1535`, `app/blog/BlogPageClient.tsx:331` | `surface-ink`에 겹친 하드코딩 bg 삭제(§2-7). 토큰 PR과 같은 PR. `components/product/hw/ValueAnchor.tsx:58`은 P4-HW에서 paper로 옮기며 지운다 |
| `components/landing/Section.tsx`(신규) | §3-2(공개 surface에서 sheet 제외) |
| `components/sections/Header.tsx`, `ProductTabNav.tsx`, `Footer.tsx`, `components/ui/MobileFloatingCTA.tsx`, `components/PublicRouteLoading.tsx` | §3-8·§3-9·§4-6 |
| `tests/design/surface-contrast.test.ts`(신규) | §8 수용 기준(P2에서 기준 상향) |

### 4-8. 가드 기여 — `scripts/check-design-tokens.mjs` 규칙 배열 (형식·래칫·warn→error 일정은 system §6)

| id | 패턴(요지) | 허용 | 대체 제안 |
|---|---|---|---|
| `surf-mint` | `/#(ECFDF5\|D1FAE5\|6EE7B7\|065C41)/i` | —(`::selection` 예외 퇴역, CO-3) | `bg-surface-paper`·hair·Kicker, 상태값은 `--fg-accent-hover`·먹 위 세이지 토큰 |
| `surf-dark-bypass` | `/\bbg-(\[#111110\]\|black\|near-black\|surface-ink)\b/` | — | `<Section surface="ink">` 또는 `surface-ink` |
| `surf-palette-leak` | `/\b(bg\|text\|border)-(white\|black\|near-black\|warm-\w+\|slate-\d+\|gray-\d+\|zinc-\d+\|stone-\d+)\b/` | — | `bg-surface-sheet`·`text-fg-*`·`border-line-*` |
| `surf-arbitrary-color` | `/\b(bg\|text\|border\|from\|via\|to\|fill\|stroke\|ring\|outline\|decoration\|divide)-\[(#\|rgb)/` | system hex 허용 목록과 같다 | 토큰 유틸 |
| `surf-glass-blend` | `/backdrop-(blur\|filter)\|mix-blend\|bg-blend/` | — | 불투명 `bg-surface-*` |
| `surf-noise` | `/noise-texture\|feTurbulence/` | `public/l/**`(백로그) | 삭제 |
| `surf-gradient` | `/bg-(gradient\|linear\|radial\|conic)-\|(linear\|radial\|conic)-gradient\(/` | `app/styles/utilities.css` | plain |
| `surf-blur-blob` | `/\bblur-(2xl\|3xl)\b\|blur-\[([4-9]\d\|\d{3,})px\]/` | — | 삭제 |
| `surf-clip-text` | `/bg-clip-text/` | — | 단색 + `ink-underline` |
| `surf-fixed-mask` | `/bg-fixed\|background-attachment:\s*fixed\|mask-image\|\bmask-(linear\|radial\|\[)/` | — | 삭제 |
| `surf-header-offset` | `/(top\|pt\|scroll-mt)-\[(76\|80\|92)px\]\|100svh-(76px\|5rem)/` | — | `--header-h` |

- 이 밖의 공통 규칙은 system §6이 소유한다: `shadow-*`(shadow-deep 제외), 반경 허용목록(V14: 0·6·원형만), `.surface-ink`·`.on-ink`·`--(surface|fg|line)-` 선언 위치, `z-[N]`·`z-50`, `.surface-ink` 안 primary Button, 공개 Radix `*Content`의 `site` 누락.
- **예산(`--budget`, 빌드 HTML)에 이 스펙이 보태는 것**
  - `[data-surface=ink]` ≤ 1
  - `.pattern-grid` ≤ 1
  - `[data-surface=sheet]` = 0(섹션 지면 sheet 퇴역, RA-7)
  - `main` 안 `data-surface` 순서에서 `sunken` 연속 = 0
  - 홈: `[data-surface]` = 11, `[data-surface=sunken]` ≤ 3, 인접 지면 바뀜(푸터 포함) ≤ 6
  - plate(`data-plate`): 홈 0, SW ≤ 1, HW ≤ 2
  - 대상 경로는 `/`, `/product/sw`, `/product/hw`, `/pricing`이다.

### 4-9. CSS 삭제·유지 (`app/globals.css`)

- **바로 삭제**(사용 0, 지우기 직전 grep 0 재확인, 화면 변화 0, 이관 단계마다 별도 커밋)
  - `.section-white`·`.section-green`·`.border-whisper`(HEAD:495·497·500)
  - `.prism-glass`(:735-760)
  - `.animate-blob1/2/3`(:762-765)와 @theme `--animate-blob*`·`@keyframes blob1-3`(:83-105)
- **이관 후 삭제**
  - `.section-warm`(:496): docs·download 이관 뒤
  - `.animate-text-gradient`(:713): Hero 정리 뒤
  - `.animate-digit-glow`·`.animate-shimmer-sweep`·`.animate-glow-pulse`(:784-809): sw/page.tsx:332·576 정리 뒤
  - `public/images/noise-texture.svg`: FinalCTA.tsx:14, ScienceBased.tsx:11, ProblemCost.tsx:82 정리 뒤
- **유지**(어드민): `--background`(`#FAFAF8` 그대로. V15 뒤 공개 paper `#F9F8F5`와 값이 갈라진다), `--card`, `--shadow-card`, `--shadow-deep`, `.dark`, `--crm-*`, `--color-warm-*`, `--color-near-black`, shadcn `--accent`
- 그레인을 쓰지 않는 이유는 넷이다.
  1. 단색 지면에는 밴딩이 없다.
  2. 크기가 지정되지 않은 SVG는 섹션 크기 × DPR로 래스터된다.
  3. `mix-blend-overlay`는 큰 면 블렌딩 합성을 만든다.
  4. 회색 노이즈가 웜 톤을 탁하게 한다.

---

## 5. 접근성·대비

### 5-1. 대비표 (직접 계산)

**밝은 지면 위 글자**(paper `#F9F8F5` · sunken `#F3F2EE` · skeleton `#EFEEE9`, V15-A · 2026-10-28)

| 토큰 | sheet | paper | sunken | skeleton | 판정 |
|---|---|---|---|---|---|
| fg-ink #111110 | 18.89 | 17.79 | 16.87 | 16.26 | AAA |
| fg-body #31302E | 13.18 | 12.41 | 11.77 | 11.35 | AAA |
| fg-muted #615D59 | 6.53 | 6.14 | 5.82 | 5.62 | AA(밝은 지면 ≥5.5 게이트 통과) |
| fg-placeholder #78736D | 4.70 | 4.42 ✗ | 4.19 ✗ | 4.04 ✗ | 입력 바탕은 sheet만(V8-A) |
| fg-faint #A39E98 | 2.66 ✗ | 2.50 ✗ | 2.37 ✗ | 2.29 ✗ | 장식·비활성 전용 |
| fg-accent #084734 | 10.71 | 10.08 | 9.56 | 9.22 | AAA |
| fg-accent-hover #073D2D | 12.25 | 11.53 | 10.93 | 10.54 | AAA |
| fg-danger #B43E3E | 5.68 | 5.35 | 5.07 | 4.89 | AA |
| fg-on-accent #FAFAF8 on #084734 | 10.25 | | | | AAA |
| `::selection` #111110 on rgb(8 71 52 / .14) | 14.72(합성 #DCE5E3) | 13.91(합성 #D7DFDA) | 13.24(합성 #D2DAD4) | | AAA |

- **먹 위**(`#1A1917`): §2-3 표. 글자 16.81, 본문(.72) 9.14, 보조(.56) 6.00, 세이지 `#8FC4AC` 8.92, 오류 7.93. 참고로 B안 `#2B2926` 위 본문 7.89·세이지 7.36, 지금 `#111110` 위 본문 9.61이다. 퇴출 대상 실측값(지금 바탕 `#111110` 기준)은 `white/40` 3.82, `white/25` 2.23, `white/20` 1.85, 먹 위 `#084734` 1.76, 먹 위 `#B43E3E` 3.33이다.
- **선(비텍스트)**
  - line-control #8A857F: sheet 3.66 / paper 3.44 / sunken 3.26 / 먹 `/.40` 3.71
  - line-link: sheet 3.51 / paper 3.43 / sunken 3.36 / 먹 세이지 `/.6` 4.03
  - strong 1.41, hair 1.18(2dppx 이상 α .14 1.35, 장식). 고대비에서는 hair 2.09, strong 3.44(paper)
- **지면 사이**: sheet/paper 1.06, paper/sunken 1.06, sheet/sunken 1.12, ink/sunken 15.68.

### 5-2. 규칙

- 읽는 글자는 `fg-muted` 이상이다. 읽는 글자에 쓰인 `#A39E98`은 **hex → 토큰**(`text-fg-muted`)으로만 치환한다. hex → hex 치환은 금지한다. Footer·SW·HW 다크 구간을 `surface-ink`로 먼저 옮긴 뒤에 치환한다. 먹 위 `#A39E98`(7.11)을 `#615D59`로 바꾸면 먹 위 대비가 3.0 미만이 되기 때문이다.
- 경계 자체가 조작 단서인 요소는 `--line-control`이고 hover 시 `--fg-ink`가 된다(C23). 대상은 입력·select·textarea·체크박스·스위치·line 버튼·필터 칩·아이콘 단독 버튼·MobileFloatingCTA다. 세 밝은 지면에서 3.2:1 이상이어야 한다(#8A857F, 최저 sunken 3.26). `--line-strong`은 장식선 전용이다.
- 포커스는 site-base 보증 ①의 2px outline `var(--fg-accent)` 하나다. 밝은 지면에서는 `#084734`(9.22–10.71), 먹 위에서는 세이지 `#8FC4AC`(8.92)가 된다. 오프셋은 `var(--focus-offset)`이고 형태별 정밀화는 system·controls 소관이다(MO-5). 공개 Dialog 5곳과 토스트도 `.site`로 덮인다.
- 상태 변화(선택·활성)는 면 채움이 아니라 3:1 이상의 단서(● 점, `#084734` 테두리·막대)와 텍스트로 표시한다.

### 5-3. 동작 줄이기 · no-JS · 강제 색 · 고대비 · 인쇄

- 지면·괘선·모눈은 전부 정적 CSS다. 동작 줄이기와 no-JS 상태에서도 화면이 같고, JS 전에 숨기는 지면은 없다.
- 지면에서 움직이는 것은 헤더 하단선 opacity 하나다(이동 없음).
- **강제 색(forced-colors)**
  - `masthead`는 `::before`의 border라서 CanvasText로 남는다.
  - `rule-double`은 먹 border만 남는다(hair는 사라짐).
  - `pattern-grid`는 사라진다.
  - 지면 색은 시스템 Canvas로 덮이므로 구분은 괘선과 헤딩이 맡는다.
- **고대비(`prefers-contrast: more`)**: 밝은 지면은 hair 1px `/.32`, strong `#8A857F`, 먹은 hair 1px `/.32`, strong `/.40`이 되고 모눈은 소거된다. 2dppx 기기 헤어라인(.5px)도 1px로 돌아간다.
- **강제 다크(삼성 인터넷 등)**: viewport `colorScheme: "only light"`와 `:root:has(.site){color-scheme:light}`로 피한다. 먹 지면만 `color-scheme: dark`다.
- **인쇄**: 기존 `@media print` `body { background: white !important; print-color-adjust: exact }`(HEAD:924)가 상속된다. 먹 지면을 흰 바탕으로 바꾸는 인쇄 규칙은 백로그다(수요 확인 시 site-base base 레이어).

### 5-4. 의미 전달

- 섹션 구분은 `<section aria-labelledby>`와 헤딩 위계로 전달한다. 면 색만으로 '다른 묶음'을 알리지 않는다.
- 장식 선과 모눈은 의사요소나 배경 이미지라 접근성 트리에 나타나지 않는다. 구분 기호 '·'는 `aria-hidden`이다.

---

## 6. 성능 예산

| 항목 | 예산 | 근거·측정 |
|---|---|---|
| 배경 처리용 이미지 요청 | **0** | 모눈·괘선 모두 CSS, noise SVG 삭제 |
| 마스크(공개 지면·섹션) | **0** | computed `maskImage`/`webkitMaskImage` 검사 |
| `backdrop-filter`·`mix-blend-mode`·장식 `filter`·`background-attachment: fixed` | **0** | HEAD 기준선: backdrop 23건/12파일, mix-blend 5/4 |
| 40px 이상 블러 블롭 | **0** | 기준선 20건/10파일 |
| 페이지당 처리 | 먹 ≤1(+Footer), `pattern-grid` ≤1, sunken 연속 0, 섹션 지면 sheet 0, plate 홈 0·SW ≤1·HW ≤2. 홈은 sunken ≤3·지면 바뀜 ≤6 | 빌드 HTML 예산 모드 |
| 지면 처리용 합성 레이어 | **0** | 마스크·transform·will-change·opacity 애니메이션이 없다. Safari Web Inspector Layers로 확인 |
| 모눈 figure 단일 Paint | ≤ 8ms(iPhone 13급, iOS 18·26) | Timeline |
| 스크롤 프레임 | 홈 위→아래 플링 중 33ms 초과 프레임 0 | 실기기 |
| CSS 추가량(이 스펙 몫) | ≤ 1.0KB gzip. 삭제분과 합치면 순감소 | 빌드 산출물 비교 |
| LCP | 악화 0. 홈 LCP 요소는 H1이다. 캡처 전에는 Hero 도판 0(V11-A). 캡처 커밋 뒤 V3-A에서는 데스크톱 eager(preload 없음), 모바일 lazy다(IM-3) | Lighthouse 모바일 3회 중앙값 |
| CLS | ≤ 0.05. 헤더 높이 고정, `.site` SSR | 같음 |
| 가로 넘침 | 375px에서 `scrollWidth === innerWidth` | Section `overflow-x-clip` |

---

## 7. 마이그레이션 (S/M/L, system §11 단계에 맞춘다)

순서를 고정하는 규칙은 셋이다. 고급화 반영(2026-10-28) 뒤 단계는 H → P2-0 → P2 → P3 → P4 → P5다.
- (a) `#A39E98` 치환은 hex → 토큰으로만 하고, Footer·SW·HW 다크를 `surface-ink`로 옮긴 뒤에 한다.
- (b) 출처를 확인할 수 없는 도판은 대체 없이 내리고 텍스트 단·사양표·도해로 무게를 유지한다(V11·IM-1·IM-2). 그 밖의 도판은 대체 도판 커밋이 들어간 뒤에만 뺀다. 어느 경우든 빈 Frame은 0이다.
- (c) 다른 세션이 `app/globals.css`·`MobileFloatingCTA.tsx`를 수정 중이면 그 병합 뒤에 시작한다.

- **[S] P0-1 토큰·스코프(화면 변화 0)**
  - `app/styles/tokens.css`(§2-4·§2-5), `utilities.css`(§3-11, 아직 미사용), `site-base.css`(§3-12)를 만들고 `globals.css`에 import 3줄을 넣는다.
  - `lib/design-tokens.ts`와 viewport export를 넣는다. iOS 상태 표시줄 색만 바뀐다.
  - `site` 표지를 정확히 세 곳에 넣는다(C17, system 공동): ① AppChrome 공개 분기 `<div className="site contents">` ② 공개 DialogContent 5곳(DemoModal, NewsletterModal, EventSignupModal, PublicLoginDialog, CheckoutRequestForm)의 `className="site"` ③ toast 뷰포트의 `!isInternalPath(pathname) && 'site'`. `isInternalPath`는 `lib/internal-path.ts`로 옮긴다.
  - `tests/design/surface-contrast.test.ts`를 같은 커밋에 넣는다.
  - 대상 파일: app/styles/tokens.css, app/styles/utilities.css, app/styles/site-base.css, app/globals.css, app/layout.tsx, lib/design-tokens.ts, lib/internal-path.ts, components/AppChrome.tsx, components/sections/DemoModal.tsx, components/sections/NewsletterModal.tsx, components/events/EventSignupModal.tsx, components/auth/PublicLoginDialog.tsx, components/checkout/CheckoutRequestForm.tsx, components/ui/toast.tsx, tests/design/surface-contrast.test.ts
- **[S] P0-2 죽은 CSS 삭제(화면 변화 0)**: §4-9 '바로 삭제'를 하나씩, 각각 grep 0을 재확인하고 별도 커밋으로 지운다. — app/globals.css
- **[S] P0-3 가드 warn**: §4-8 규칙과 예산을 system §6 규칙 배열에 넣는다. 처음에는 warn(exit 0)으로 두고 `scripts/design-baseline.json` 래칫에 기록한다. — scripts/check-design-tokens.mjs, scripts/design-baseline.json
- **[S] P0-4 DESIGN.md**: §9 사실 정정·지면 토큰 절·상태 배지를 반영한다. — DESIGN.md
- **[M] P1 빼기**
  - 대상: 블롭·글로우·글래스(`backdrop-filter`)·그라데이션 텍스트·mix-blend·노이즈 3곳(FinalCTA·ScienceBased·ProblemCost)·그라데이션 장식선(Hero:118, EraVision:48·52)·WaveDivider 정의와 사용 5곳·EraVision 인라인 격자.
  - 블롭 때문에 붙은 `overflow-hidden`은 `overflow-x-clip`으로 바꾼다.
  - 지면 색 자체는 아직 바꾸지 않는다.
  - 대상 파일: components/sections/*.tsx(홈 해당 파일), app/product/sw/page.tsx, components/product/hw/AllInOneStatement.tsx, components/product/hw/ValueAnchor.tsx, components/product/hw/AICameraSection.tsx
- **[S] H 정직성·개인정보 핫픽스**(P2 전, W0 핫픽스 뒤. 디자인 브랜치와 별개로 main에서 별도 세션이 진행한다. 이 스펙은 단계만 기록한다)
  - 이 스펙에 닿는 것: 푸터 뉴스레터 '동의한 것으로 간주' 문구 삭제, 문서의 Hero 'AI 생성 이미지' 라벨 지시 삭제(이 스펙의 §4-2·부록 포함).
  - 게이트는 소스 정규식이 아니라 하이드레이션 뒤 렌더 텍스트를 브라우저 도구로 검사한다. `/admin` 스크린샷 차이 0, `/checkout` 이미지 4파일 존재.
- **[S] P2-0 결정 기록**: 운영자 선택(V10–V18 A, 2026-10-28)을 DESIGN.md §9에 기록한다. V11-A 승인(2026-10-28)으로 V3 보충 문장 교체도 승인됐다(DESIGN.md §9 V3 행). 기록 전에는 P2 토큰 PR을 머지하지 않는다. — DESIGN.md
- **[M] P2 셸·프리미티브**
  - 첫 커밋은 `globals.css`의 h1–h4 모바일 `letter-spacing:0 !important`를 어드민 전용 셀렉터로 옮기는 것이다(typography 소관, 어드민 diff 0).
  - **토큰 PR**(이 스펙 몫): 지면·먹 값(V15-A, §2-2·§2-3), 그린 상태값(CO-3: hover `#073D2D`, 먹 위 세이지, selection), 헤어라인(`--line-w-hair`, CO-5). 같은 PR에서 미러(`lib/design-tokens.ts`·OG·global-error·viewport theme-color)와 `surface-ink`에 겹친 하드코딩 bg(§2-7 목록)를 함께 고친다. 대비 테스트 기준을 올린다(§8-1).
  - Section 컴포넌트를 만든다. 공개 surface는 paper·sunken·ink 셋이다(sheet 제외, RA-7). SolutionOverview에 먼저 적용하고 typecheck를 통과시킨다.
  - 셸: Header(§3-8), 모바일 메뉴(`--shadow-deep`, scrim), ProductTabNav, Footer(`surface-ink`, 판권면, 먹 위 컨트롤 0, AA 미달 2곳 해소), PublicRouteLoading, 하드코딩 오프셋 7곳(Hero.tsx:15·17, ProductTabNav.tsx:19, Header.tsx:87, PublicRouteLoading.tsx:36, HomeLeadMagnet.tsx:25, hw/page.tsx:780)
  - MobileFloatingCTA는 규칙 (c)를 따른다.
  - Card 공개 variant의 그림자 0과 공개 family `column`(열린 단, CO-9)은 cards_motion 소관이다. Figure/Frame의 id API·매트(V16)·plate는 imagery 소관이다.
  - 대상 파일: app/styles/tokens.css, app/styles/site-base.css, app/styles/utilities.css(`rule-double`), lib/design-tokens.ts, app/layout.tsx, app/global-error.tsx, app/opengraph-image.tsx, tests/lib/design-tokens.test.ts, tests/design/surface-contrast.test.ts, components/landing/Section.tsx, components/sections/Header.tsx, components/sections/ProductTabNav.tsx, components/sections/Footer.tsx, components/sections/FinalCTA.tsx, components/sections/Manifesto.tsx, components/sections/Hero.tsx, app/product/sw/page.tsx, app/blog/BlogPageClient.tsx, components/PublicRouteLoading.tsx, components/ui/MobileFloatingCTA.tsx, components/sections/SolutionOverview.tsx
- **[M] P3 홈 11지면 순서대로**(첫 커밋 전에 V10 확정 — 2026-10-28 A)
  - §4-2 표를 지면 단위로 커밋한다(서사 모먼트 1개 = 커밋 1개, 지면 변경과 masthead·Kicker는 해당 지면 커밋에 같이 넣어 단조로움을 막는다).
  - 순서: Hero(V11 표지, 캡처 커밋 시 V3-A) → LogoBar 띠(X16) → 01 선언 → 02 공감 장부 → 부록 진단표 → Manifesto → 03 흐름(+모눈, ○→● 콜백) → 04 화면(매트 Frame + CTA 띠) → 05 기록(사례 3 + 인용 4 + 각주 수치, 감사 D4 동의 선행) → 06 확신 비교표 → FinalCTA(V5-A, 왼쪽 정렬).
  - 빠지는 섹션(EraVision·KeyUseCases·DashboardPreview·ScienceBased·SatisfyingClass)을 홈에서 내리고, 합쳐지는 섹션(CaseStudies·TestimonialWall·GlobalScale·Outcomes)을 05 기록으로 옮긴다. 사례 사진 3장은 한 빛 보정(흰점 = paper, imagery 소관)을 거친다.
  - 노이즈 마지막 사용처가 사라지면 `noise-texture.svg`를 삭제한다.
  - 대상 파일: app/page.tsx, components/sections/{Hero,LogoBar,HomeEntitySummary,ProblemCost,HomeLeadMagnet,Manifesto,SolutionOverview,CaseStudies,TestimonialWall,GlobalScale,Outcomes,Comparison,FinalCTA}.tsx, 홈에서 빠지는 components/sections/{EraVision,KeyUseCases,DashboardPreview,ScienceBased,SatisfyingClass}.tsx, public/images/noise-texture.svg
- **[M] P4-HW**
  - AllInOne은 먹 장 하나로 둔다. 이미지·blend·마스크를 제거하고, 출처가 확인된 OPS 컷아웃을 `#1A1917` 판에 미리 합성한 제품 한 컷 + hair 행 목록으로 세운다. 확인되지 않으면 타이포 먹 + 행 목록이다(CO-8).
  - BigBackdrop·FullWidthPoint '교실의 경계' 사진은 풀블리드를 퇴역하고 paper 위 콘텐츠 폭 plate로 옮긴다(plate ≤2).
  - ImpactNumbers는 렌더하지 않는다.
  - AICamera(밝은 판)·ValueAnchor·'약속'·ECOSYSTEM은 밝은 지면으로, AfterClass는 paper로 바꾼다. ValueAnchor는 paper로 옮기면서 :58의 `surface-ink`·하드코딩 bg를 지운다(2026-10-28).
  - ProductAnatomy 모눈을 넣고, 최종 CTA는 sunken 띠로, white는 `paper*` 규칙으로 바꾼다.
  - 대상 파일: app/product/hw/page.tsx, components/product/hw/{AllInOneStatement,AICameraSection,BigBackdropImage,ValueAnchor,OnboardingRoadmap,AfterClassSection}.tsx
- **[L] P4-SW**: SW 다이어트 PR과 함께 진행한다. 다크·그린 면(Hero·HardwareTeaser·FullscreenQuote·지도·CinematicCases·FutureVision1)은 먹 1곳(FullscreenQuote)과 밝은 지면으로 바꾼다. HardwareTeaser·AIFeatures는 paper로 바꾼다(sunken 3역할 밖). feTurbulence(:1271-1273)와 비토큰 바탕을 정리한다. — app/product/sw/page.tsx, components/product/sw/OnboardingRoadmap.tsx
- **[S] P4-기타**: ai-report(C26 전부, mock Frame 매트), /product(border 삭제, 인덱스 모눈), /pricing(Plan 카드 r0, 안내 박스). — app/product/ai-report/page.tsx, app/product/page.tsx, app/pricing/page.tsx
- **[M] P5 읽기·전환 면**: 먹 패널 4곳을 콘텐츠 CTA 띠로, `.section-warm` 2곳을 3역할로 다시 배정하고(docs 설치 안내 sunken CTA 띠, download '교실용 도구' paper), contact 바닥을 바꾼 뒤 `.section-warm`을 삭제한다. 가드 규칙을 error로 올리는 것은 system 일정을 따른다. — app/blog/BlogPageClient.tsx, app/events/[slug]/page.tsx, app/events/videos/[slug]/page.tsx, app/resources/[slug]/page.tsx, app/docs/page.tsx, app/download/DownloadPageClient.tsx, app/contact/page.tsx, app/globals.css
- **[S] 문서 동기화**(각 PR과 같은 커밋): 감사 문서 §5-2(story·progress 토큰 삭제), §5-4(LogoBar '마키 유지' → 정적 목록, X16), §5-5-5(400ms → 320ms), §5-6(배경 리듬 → V4·C19, `#A39E98` → `#8A857F`, 'pill 1개' → V9), §5-8(BigBackdrop 스크롤 연동 허용 문구 삭제, 마키·히어로 영상 예외 삭제). — docs/active/public-site-audit-motion-plan-2026-10-26.md
- **백로그**: 정적 랜딩 `/l/*` 6종의 지면 hex와 feTurbulence(kids:93, meets-july:192·470). growth-crm 랜딩 이관에서 랜딩별 최근 4주 리드 기준선을 잡은 뒤 하나씩 한다. kids·meets-july는 캠페인 테마 예외다.

---

## 8. 수용 기준

1. **대비 테스트**: `vitest tests/design/surface-contrast.test.ts`가 통과한다.
   - 이 테스트는 `app/styles/tokens.css`의 `:root`와 `.surface-ink` 블록을 정규식으로 읽고, 기대 키 20개(+ 먹 재정의 키)를 모두 찾았는지 먼저 단언한다. 누락은 실패다.
   - 밝은 지면: fg-ink·body·accent·accent-hover·danger가 sheet·paper·sunken에서 4.5 이상, fg-muted가 세 지면에서 5.5 이상, fg-placeholder가 sheet에서 4.5 이상, fg-on-accent가 fg-accent 위에서 4.5 이상, line-control이 세 지면에서 3.2 이상, line-link가 3.0 이상이어야 한다(P2에서 기준 상향 · 고급화 2026-10-28).
   - 먹 위: rgb 알파를 `--surface-ink`(`#1A1917`)에 합성해 계산한다. 읽는 글자(fg-ink·body·muted·accent·danger)가 4.5 이상, line-control·line-link가 3.0 이상이어야 한다.
   - 중립 온도: paper·sunken·skeleton이 R≥G≥B이고 R−B가 4–7이다(sheet·글자·선 회색 제외).
   - 공개 CSS(`app/styles/*.css`)에 `#6EE7B7`·`#D1FAE5`·`#065C41`이 0이다.
2. **P0 무변화**: system §11 스크린샷 비교(/, /product/sw, /product/hw, /pricing, /blog, /contact, /share 1건, /admin 2건)에서 차이가 0이고, typecheck·eslint·vitest·build(prebuild 가드 포함)가 통과한다.
3. **가드**: 가드가 래칫 기준선보다 늘어난 건수 없이 통과한다. P5 뒤 `surf-*` 규칙의 공개 범위 건수는 0이다(허용 목록 제외). `grep -rnE "noise-texture|feTurbulence" app components lib public/images` 결과가 P4-SW 뒤 0건이다.
4. **오프셋**: `grep -rnE 'top-\[(76|80)px\]|pt-\[(76|92)px\]|scroll-mt-\[76px\]|100svh-(76px|5rem)' components app --exclude-dir=admin` 결과가 0건이다.
5. **헤더**: 헤더 높이가 스크롤 전후로 같다(375에서 76px, 1440에서 80px). 그림자는 0이고, 하단 hair만 opacity로 바뀐다. 첫 화면 헤더 아래에 틈·회색 띠가 없다.
6. **홈 예산**(V10-A): 운영 빌드 홈 콘솔에서 아래 스니펫이 `{sections:11, ink:1, sunken:3, sheet:0, sunkenAdj:false, seams:6, grid:1, masthead:6, plate:0, shadowed:0}`을 반환한다(seams는 푸터를 먹으로 붙여 센 인접 지면 바뀜, ≤6). SW·HW에서는 ink ≤1, sheet 0, sunkenAdj false, grid ≤1, shadowed 0이고 plate는 SW ≤1·HW ≤2다. 홈 길이는 1440에서 ≤11,500px, 375에서 ≤16,000px이다.
   ```js
   const v=[...document.querySelectorAll('main section[data-surface]')].map(e=>e.dataset.surface);
   const w=[...v,'ink']; // 푸터(먹)
   ({sections:v.length,
     ink:v.filter(x=>x==='ink').length,
     sunken:v.filter(x=>x==='sunken').length,
     sheet:v.filter(x=>x==='sheet').length,
     sunkenAdj:v.some((x,i)=>x==='sunken'&&v[i+1]==='sunken'),
     seams:w.filter((x,i)=>i>0&&x!==w[i-1]).length,
     grid:document.querySelectorAll('main .pattern-grid').length,
     masthead:document.querySelectorAll('main .masthead').length,
     plate:document.querySelectorAll('main [data-plate]').length,
     shadowed:[...document.querySelectorAll('main [data-card], main [data-frame]')].filter(e=>getComputedStyle(e).boxShadow!=='none').length})
   ```
7. **금지 효과 0**: 공개 페이지 전 요소에서 아래 식이 참이다(backdrop-filter·mix-blend·mask·fixed 배경 0).
   ```js
   [...document.querySelectorAll('body *')].filter(e=>{const s=getComputedStyle(e);return s.backdropFilter!=='none'||s.mixBlendMode!=='normal'||s.backgroundAttachment.includes('fixed')||(s.maskImage&&s.maskImage!=='none')||(s.webkitMaskImage&&s.webkitMaskImage!=='none')}).length === 0
   ```
8. **민트 0**: 공개 페이지에서 computed `background-color`가 `rgb(236, 253, 245)`·`rgb(209, 250, 229)`인 요소가 0개다. `::selection`도 예외가 아니다.
9. **스코프**
   - 홈에서 DemoModal을 열면 DialogContent에 `site` 클래스가 있고, 안의 텍스트 선택색이 그린 잉크(`rgb(8 71 52 / .14)`)다.
   - /admin의 Dialog에는 `site` 클래스가 없다.
   - 렌더된 HTML에 `<meta name="theme-color" content="#F9F8F5">`와 color-scheme `only light`가 있다.
10. **가로 넘침**: 375px 폭에서 /, /product/sw, /product/hw 모두 `document.documentElement.scrollWidth === innerWidth`다. 블롭 제거 뒤 안쪽 sticky 요소가 동작한다.
11. **대비 검사**: Chrome DevTools CSS Overview의 Contrast issues가 375×812와 1440×900에서 /, /product/sw, /product/hw, /product/ai-report, /pricing 모두 0건이다(aria-hidden 장식 제외). 푸터 판권면·저작권은 13px 이상이고 대비가 6.00이다.
12. **정적성**: JS를 끈 상태와 reduced 에뮬레이션에서 홈 전 섹션의 지면·괘선·모눈이 JS를 켠 상태와 같다. forced-colors에서는 머리 괘선과 `rule-double` 윗선이 보인다. `prefers-contrast: more`에서는 hair가 진해지고 모눈이 사라진다.
13. **앵커**: `/#<섹션 id>`로 이동하면 섹션 상단이 헤더 하단에서 16±2px 아래에 온다(375·1440). canonical 값 그대로면 오프셋이 이중으로 더해진다(canonical 내부 충돌, 열린 질문 1). canonical이 정정되기 전에는 판정을 보류하고, P2 Section PR 전에 정정한다.
14. **실기기**
    - iPhone(iOS 18·26, DPR3)과 Android(DPR 2.625), Windows 100·110·125% 확대에서 모눈 figure에 모아레가 없다. 선 두께가 고르지 않은 것은 장식이라 허용한다.
    - Safari Layers에 지면 처리 때문에 생긴 합성 레이어가 0이다. 홈 플링에서 33ms를 넘는 프레임이 0이다.
    - 삼성 인터넷 강제 다크에서도 지면이 반전되지 않는다.
    - 헤어라인(CO-5): iPhone 실기기 3배 확대 캡처에서 hair 행선이 1 기기 픽셀이다. Windows Chrome 1366×768 DPR1 캡처는 P2 전과 픽셀 차이가 0이다. 고대비 모드에서는 1px이다.
15. **Lighthouse**(모바일 3회 중앙값, 홈): CLS 0.05 이하, LCP는 기준선보다 나빠지지 않고, LCP 요소는 H1이다.
16. **어드민 무변경**: /admin 대표 3화면(대시보드·CRM 리드·HW)의 적용 전후 스크린샷이 같다.
17. **문서**
    - DESIGN.md에 §9가 반영돼 있고, 결정 로그에 V10–V18 A(2026-10-28)가 기록돼 있다.
    - `grep -n ECFDF5 DESIGN.md`에서 공개 화면에 #ECFDF5를 권하는 줄이 0이다(어드민 상태 틴트와 퇴역 안내 줄만 남는다).
    - 스펙 문서에서 Hero 도판에 'AI 생성 이미지' 라벨을 달라는 지시가 0건이다(H 게이트).
    - 감사 문서 §5-2·§5-4·§5-5-5·§5-6·§5-8이 이 스펙과 충돌하지 않는다.
18. **먹 값 반영**(V15-A): 공개 페이지의 `[data-surface=ink]`와 푸터 루트의 computed `background-color`가 `rgb(26, 25, 23)`이다. `surface-ink` 요소에 겹친 하드코딩 bg는 0이다.

---

## 9. DESIGN.md 반영안

적용 범위는 두 구획('적용 범위: public(.site) / admin')으로 나눈다. 토큰마다 상태 배지(**in force** / **target** / **retired**)를 단다. P0에서 넣는 토큰은 target으로 시작하고, 해당 단계의 화면 이관이 끝나면 in force로 바꾼다. 어드민 전용 절(Status·확도·Team·히트맵·채널 식별색·어드민 라벨 단순화)은 바꾸지 않는다.

────────────────────────────────────────
**[교체] §1 핵심 철학 — '그린 액센트'·'경량 보더' 두 줄**

- **그린은 잉크**: Classin Green(`#084734`)은 유일한 포화 컬러다. 공개 화면에서는 면을 칠하지 않는다. 링크·버튼(그린 채움은 primary 1개)·포커스·현재 위치에 쓰고, 비상호작용 그린 표지(잉크 밑줄·● 묶음·좌측 2px 바·한 계열 차트선·인용 여는 따옴표)는 뷰포트당 2개 이하다. 섹션 머리(Kicker)와 제목 안의 그린은 0이다(V12-A).
- **구획은 괘선과 여백**: 지면 색은 섹션을 가르지 않는다. 기본 선은 `1px rgb(17 17 16 / .08)`이고, 2dppx 이상에서는 `.5px` + α .14인 기기 헤어라인이다. 먹선(1px `#111110`)은 닫힌 목록 다섯 곳에만 쓴다: Act·장 머리, 표 상단, 숫자 장부 합계, CTA 띠 이중선, 추천 Plan.

────────────────────────────────────────
**[교체] §2 '### 그린 서피스 스케일' 절 전체**

### 그린 서피스 스케일 — 어드민 상태 틴트 전용
- **Green Surface 50** (`#ECFDF5`)·**100** (`#D1FAE5`)는 어드민 상태 틴트(§2 Status·확도)에만 쓴다.
- **공개 화면 사용은 retired다**(면 2026-10-26, `::selection` 2026-10-28). 섹션 면·카드·타일·아이콘 원·활성 채움·추천 열·배지·선택 영역에 쓰지 않는다. 근거는 취향(파스텔 면 금지)이다. 민트는 휘도 대비가 1.01:1이어도 색조 때문에 보인다. 공개 `::selection`은 그린 잉크 `rgb(8 71 52 / .14)` + 글자 `#111110`(paper 위 13.9:1)이다.
- **Green Muted** (`#6EE7B7`)는 공개 화면에서 retired다(2026-10-28, CO-3). 먹 지면 위 액센트(밑줄·점·포커스·링크)는 세이지 `#8FC4AC`(`#1A1917` 대비 8.92:1)이고 채움에는 쓰지 않는다. 먹 위 링크 밑줄은 `rgb(143 196 172 / .6)`이다.
- **hover**: 공개 hover는 `#073D2D`다(밝아지지 않고 짙어진다). `#065C41`은 공개 화면에서 retired다. 어드민 값은 그대로 둔다.

────────────────────────────────────────
**[교체 표기] §2 웜 뉴트럴 스케일 두 줄**

- **Warm White** (`#F6F5F4`): 어드민 값으로 남는다. 공개 sunken 지면은 `#F3F2EE`이고 도해·부록·FinalCTA 3역할에만 쓴다(연속 금지). '섹션 교차 배경' 문구는 retired다.
- **Warm Gray 300** (`#A39E98`): 장식·비활성 전용이고 읽는 글자에는 쓰지 않는다(2.66:1). 플레이스홀더는 `#78736D`(sheet 위 4.70)다.

────────────────────────────────────────
**[신설] §2 '### 웜 뉴트럴 스케일' 바로 아래**

### 지면 토큰 — public(.site) (코드: `app/styles/tokens.css`, 유틸 `bg-surface-*`, 먹은 `surface-ink` 클래스)

값은 V15-A(2026-10-28)를 따른다. 밝은 지면(paper·sunken·skeleton)은 R≥G≥B, R−B 4–7인 따뜻한 축 하나이고, 사진 흰점도 paper 값에 맞춘다.

| 토큰 | 값 | 상태 | 배정 기준 |
|---|---|---|---|
| `--surface-paper` | `#F9F8F5` | target | 기본값. 모든 섹션 지면: Hero, LogoBar 띠, 중간 띠, 카드·Frame·장부·표가 있는 섹션, 읽기 면, 고정 바 |
| `--surface-sheet` | `#FFFFFF` | target | 물건 전용: Frame 안 캡처·plate·요금·사진 있는 사례·폼·표·입력 바탕. 섹션 지면으로 쓰지 않는다 |
| `--surface-sunken` | `#F3F2EE` | target | 섹션은 도해·부록·FinalCTA 3역할만(연속 금지). 캡처 매트·제품 판 바탕 |
| `--surface-ink` | `#1A1917` | target | 페이지당 서사 1곳 + 푸터. `surface-ink` 클래스로만 칠한다. 글자색 `#111110`과 다른 값이다 |
| `--surface-skeleton` | `#EFEEE9` | target | 로딩, 화면 캡처 개인정보 단색 마스킹 |
| `--surface-scrim` | `rgb(17 17 16 / .48)` | target | Dialog·메뉴 오버레이(블러 없음) |

- 공개 화면 다크 면은 `#1A1917` 한 종류다. `#111110`(면으로 쓸 때)·`#1a1a19`·`#0D1A12`·`#0A1511`·`#07110d`·`#05080C`·`#050708`·`#010302`·`#0B3328`·`#031a12`·`#1C1B1A`와 그 그라데이션은 retired다. 새 먹과의 대비가 1.01~1.27:1이라 구분 효과도 거의 없다. 글자·masthead의 `#111110`은 그대로다.
- 비토큰 밝은 바닥(`#FAFAF8`·`#FDFCF8`·`#F9F8F4`·`#F7F8F5`·`#F6F7F2`·`#EDF7F2`·`#F0FDF9`·`#F5FBF7`)은 가장 가까운 토큰으로 흡수한다.
- **먹 지면 재정의**: `.surface-ink` 안에서는 같은 토큰 이름이 밝은 값으로 바뀐다(대비는 `#1A1917` 기준).
  - 글자: `#FAFAF8`(16.81), 본문 `/.72`(9.14), 보조 `/.56`(6.00). 알파 하한은 .50(5.05)이다.
  - 액센트·포커스·링크 hover는 세이지 `#8FC4AC`(8.92), 오류는 `#E89A94`(7.93)다.
  - 선: hair `/.12`(2dppx 이상 .5px `/.20`), strong `/.24`, 머리 괘선 `/.72`, control `/.40`(3.71), 링크 밑줄 `rgb(143 196 172/.6)`(4.03)
  - 선택 영역은 세이지 알파 바탕 + 글자 `#FAFAF8`이다.
  - autofill 덮개 바탕은 `#1A1917`이다. 먹 위에는 컨트롤(버튼·입력)·Frame·표·사진·카드를 두지 않는다.
  - 그래서 Tailwind 매핑은 반드시 `@theme inline`이다.

### 글자 토큰과 대비 — public(.site) (코드: `--fg-*`, 유틸 `text-fg-*`)

| 토큰 | 값 | sheet | paper | sunken | 용도 |
|---|---|---|---|---|---|
| `--fg-ink` | `#111110` | 18.89 | 17.79 | 16.87 | 헤딩 |
| `--fg-body` | `#31302E` | 13.18 | 12.41 | 11.77 | 본문 |
| `--fg-muted` | `#615D59` | 6.53 | 6.14 | 5.82 | 모든 보조 글자 |
| `--fg-placeholder` | `#78736D` | 4.70 | — | — | 플레이스홀더(입력 바탕 sheet) |
| `--fg-faint` | `#A39E98` | 2.66 | 2.50 | 2.37 | 장식·비활성 전용 |
| `--fg-accent` / `-hover` | `#084734` / `#073D2D` | 10.71 / 12.25 | 10.08 / 11.53 | 9.56 / 10.93 | 링크·버튼·포커스·현재 위치·primary 채움. hover는 짙어진다 |
| `--fg-danger` | `#B43E3E` | 5.68 | 5.35 | 5.07 | 공개 화면 오류색 하나 |
| `--fg-on-accent` | `#FAFAF8` | `#084734` 위 10.25 | | | 그린 채움 위 글자 |

────────────────────────────────────────
**[교체] §2 '### 헤어라인 보더 토큰' 절 → '### 선 토큰'**

### 선 토큰 — public(.site) (코드: `--line-*`, 유틸 `border-line-*`·`decoration-line-link`)
- **hair** `rgb(17 17 16 / .08)`: 기본 whisper 선이다. 카드·Frame·행·띠·열린 단·모눈·헤더 하단선에 쓴다. 굵기는 `--line-w-hair`로, 1px이고 2dppx 이상에서는 `.5px` + α .14다(먹 위 .5px + `/.20`).
- **strong** `/.16`: 장식선 전용이다(표 머리 아래·바이라인·읽기 전용 필드·링크 카드 hover).
- **ink** `#111110` 1px: 먹선 다섯 곳 전용이다. 먹 면 값이 `#1A1917`로 바뀌어도 그대로다.
- **control** `#8A857F`: 경계가 조작 단서인 요소(입력·체크박스·스위치·line 버튼·필터 칩·아이콘 단독 버튼·하단 플로팅 CTA)와 도해 정보선·○ 점·차트 비교선에 쓴다. sheet 3.66 / paper 3.44 / sunken 3.26으로 세 지면 모두 3.2:1을 넘는다. 굵기는 1px 고정이고 hover에서는 `#111110`이 된다.
- **link** `rgb(8 71 52 / .6)`: 링크 밑줄이다(3.36–3.51:1).
- 고대비(`prefers-contrast: more`)에서는 hair 1px `/.32`, strong `#8A857F`로 바뀐다.

### 헤어라인 보더 — admin (기존 문단 유지)
- 기존 '기본 `rgba(0,0,0,0.08)`'과 '불투명 등가 `#E8E8E4`' 문단은 어드민에 그대로 둔다. 공개 화면의 `#E8E8E4`는 retired다. 불투명 paper 위의 hair와 같은 색이라 hair 하나로 쓴다.

────────────────────────────────────────
**[신설] §2 '### 보더 & 섀도' 끝**

- **public(.site) 지면은 평면이다.** 그림자는 Deep Shadow 하나만 쓰고, Dialog·드롭다운·토스트·모바일 메뉴 패널처럼 떠 있는 레이어에만 둔다. 카드·Frame·plate·표·컨트롤·섹션·헤더·하단 플로팅 CTA의 그림자는 0이다. Card Shadow는 공개 화면에서 retired이고 어드민은 유지한다. 예외는 CSS가 아니라 이미지 내용 하나다: '제품 렌더' 자산 안에 구운 접지 그림자 1개(α ≤ .18, 띄움 0, 색 후광·림 라이트·반사 바닥 0).
- **반경(V14-A)**: 물건(카드·Figure·Frame·plate·표·띠·IconFrame)은 r0, 버튼·입력·스위치 트랙·Dialog·드롭다운·토스트는 r6, 필터 칩·상태 점·스위치 썸은 원형이다. 값은 0·6·원형 셋뿐이다.

────────────────────────────────────────
**[교체] §4 '**Pill Badge**' 블록 (V9-A)**

**Pill Badge — admin 전용**
- 공개 화면에서는 retired다. 단일 강조는 Kicker(1px 먹 masthead 아래 레일에 폴리오 13/500 `#615D59` → 12px → 라벨 13/600 `#111110`, 바 없음, V12-A)로 하고, 상태는 점(●/○/–) + 텍스트로 하고, 상호작용 필터는 아웃라인 칩으로 한다.
- 어드민에서 쓸 때는 기존 값(Background `#ECFDF5`, Text `#084734`, Radius `9999px`, Padding `4px 10px`, 12px/600)을 유지한다.

────────────────────────────────────────
**[교체] §5 '### 배경 교차 리듬' 절 전체**

### 지면 배정과 배경 처리 — public(.site)
- **분리는 괘선과 여백으로 한다.** 지면 사이 대비는 1.06~1.12:1이라 면 색은 섹션을 가르지 않는다. Act 머리에 1px 먹 괘선(콘텐츠 폭, 섹션 안 첫 요소, 위 16px)을 둔다. 섹션 사이 하드 보더·물결 구분선·그라데이션 장식선은 쓰지 않는다.
- **배정은 역할로 한다.** 교대로 정하지 않는다. paper가 기본이고, sunken은 도해·부록·FinalCTA 3역할에만 쓰며 연속 배치하지 않는다. sheet는 섹션 지면으로 쓰지 않고 물건(Frame·plate·요금·사진 있는 사례·폼·표)에만 쓴다. 글만 있는 카드는 상자 없이 열린 단으로 둔다. 먹은 페이지당 서사 1곳(+푸터)이고 읽기 면에는 0이다.
- **배경 처리는 plain 하나다.** 모눈은 도해 figure 자체의 배경으로만 쓴다: 페이지당 1개, 48px(≥40rem 56px), hair 선, 정지.
- **금지**: 그라데이션 면, 블러 블롭, 글로우, 글래스(backdrop-filter), 그레인·노이즈(feTurbulence 포함), mix-blend, 마스크, `background-attachment: fixed`, `contain: paint`, 움직이는 배경(패럴랙스 포함), 섹션 배경 괘선·rails·사진 위 카피, 풀블리드 도판.
- **홈 목표 지면**(V10-A · 2026-10-28, 11지면): Hero paper → LogoBar paper 띠(위아래 hair) → 01 선언 paper → 02 공감 paper(정성 장부) → 부록 진단표 sunken → Manifesto 먹 → 03 흐름 sunken(OS 지도, 도해 figure 모눈) → 04 화면 paper(영역 캡처 매트 Frame + CTA 띠) → 05 기록 paper → 06 확신 paper(비교표) → FinalCTA sunken 띠(V5-A) → Footer 먹. 지면 바뀜 6, sunken 3, sheet 섹션 0.

(§5 간격·컨테이너 줄은 system 스펙의 반영안을 따른다. `--header-h`는 76px, ≥48rem에서 80px다.)

────────────────────────────────────────
**[교체] §6 접근성 첫 세 줄**

- 본문 글자(`#111110`) 대비: sheet 18.89 / paper 17.79 / sunken 16.87:1 (AAA)
- 보조 글자(`#615D59`) 대비: white 6.53 / paper 6.14 / sunken 5.82:1 (AA, 밝은 지면 5.5 이상). 기존 '~5.5:1'은 오기다. 읽는 글자에 `#A39E98`(2.66:1)은 쓰지 않는다.
- Green(`#084734`) 대비: white 10.71 / paper 10.08:1 (AAA), hover `#073D2D` paper 11.53:1. 먹 위 포커스·액센트는 세이지 `#8FC4AC`(`#1A1917` 위 8.92:1)를 쓰고, 먹 위 `#084734`(1.64:1)는 쓰지 않는다.
- 비텍스트 경계는 `#8A857F`(세 밝은 지면 3.2:1 이상)다. hair·strong 선과 지면 색 차이는 장식이므로 의미를 혼자 전달하지 않는다.
- 먹 지면(`#1A1917`) 글자의 알파 하한은 .50(5.05:1)이다. 먹 위 오류색은 `#E89A94`(7.93:1)다.

────────────────────────────────────────
**[교체] §7 4·5·6·7번, [추가] 9번**

4. 보더는 whisper `1px rgb(17 17 16 / .08)`다. 공개 화면에서는 `#E8E8E4`를 쓰지 않는다(어드민만 불투명 등가 허용).
5. 섀도: 공개 화면 지면은 평면이다. Deep Shadow는 떠 있는 레이어(Dialog·드롭다운·토스트·모바일 메뉴)에만 쓴다. 어드민은 4–5레이어(개별 opacity 0.01–0.05)를 유지한다.
6. 공개 화면 면은 paper `#F9F8F5` / sheet `#FFFFFF` / sunken `#F3F2EE` 3장과 먹 `#1A1917` 1장이다(글자 `#111110`과 분리). paper가 기본이고, sheet는 물건에만, sunken은 도해·부록·FinalCTA 3역할에만 쓴다. 섹션 분리는 머리 괘선과 여백으로 한다. 배경 교차나 `#ECFDF5` 면으로 나누지 않는다.
7. 뱃지/필: 공개 화면에서는 쓰지 않는다(Kicker·점 + 텍스트·아웃라인 칩). 그린 서피스는 어드민 상태 틴트에만 쓴다.
9. 공개 화면의 색·선은 토큰 유틸(`bg-surface-*`, `surface-ink`, `text-fg-*`, `border-line-*`)로만 쓴다. 임의 hex와 `bg-black|white|near-black|warm-*`는 쓰지 않는다. 섹션은 `components/landing/Section.tsx`로 감싼다. 위반은 `scripts/check-design-tokens.mjs`(prebuild, 래칫)가 막는다.

────────────────────────────────────────
**[결정 로그 절에 추가] (system §10이 절을 만든다)**

- V3 Hero: A(2026-10-27 확정) — 지면 표지 + capture Frame, 홈 영상 0. 캡처 전 상태는 V11이 정한다.
- V4 배경 리듬·공감 Act: A(2026-10-27 확정) — 서사 먹 1(Manifesto), ProblemCost 정성 장부, plain only.
- V5 FinalCTA: A(2026-10-27 확정) — sunken 띠 + rule-double + h2(text-h1) + primary cta.
- V7 배경 애니메이션: A(2026-10-27 확정) — 정지.
- V8 입력 모양: A(2026-10-27 확정) — 박스형, 바탕 `bg-surface-sheet`.
- V9 Hero 배지: A(2026-10-27 확정) — 삭제, Kicker.
- V10 홈 지면 수: A(2026-10-28 확정) — 11지면 목차, sunken 3·먹 1·sheet 섹션 0, 지면 바뀜 ≤6, LogoBar paper 띠 + hair.
- V11 캡처 전 첫 화면: A(2026-10-28 확정) — 무도판 비대칭 표지, LCP = H1, 캡처 커밋 뒤 V3-A 7/5. V11-A 승인(2026-10-28)으로 V3 보충 문장 교체도 승인됐다(DESIGN.md §9 V3 행).
- V12 섹션 머리 그린: A(2026-10-28 확정) — 바 없음, 먹 라벨.
- V14 모서리: A(2026-10-28 확정) — 누를 수 있는 것만 r6, 물건 r0, 필터 칩·상태 점·스위치 썸 원형.
- V15 종이와 먹: A(2026-10-28 확정) — paper `#F9F8F5` · sunken `#F3F2EE` · skeleton `#EFEEE9` · line-control `#8A857F` · surface-ink `#1A1917`, 글자 `#111110` 유지.
- V16 흰 캡처 놓기: A(2026-10-28 확정) — sunken 매트, 캡처 r0 + hair, 그림자 0, 모바일 전폭.
- V1·V2·V6과 V13·V17·V18은 typography·icons·cards_motion 스펙이 같은 절에 추가한다(절 전체는 V1–V18).
- 각 항목에 확정 날짜, 근거, 보드 스크린샷 경로를 추가한다.

---

## 10. 하지 말 것

- `#ECFDF5`·`#D1FAE5`를 면·카드·타일·원·활성 채움·추천 열·배지·`::selection`에 쓰지 않는다. 공개 화면에서 `#6EE7B7`(먹 위 → 세이지)·`#065C41`(hover → `#073D2D`)도 쓰지 않는다.
- accent를 `#0E5038`로 옮기지 않는다. `#084734`보다 밝다(OKLCH L .385 대 .355). 그린을 깊게 하려면 hover와 먹 위 값을 고친다.
- 그라데이션 면, 블러 블롭, 글로우, 글래스, 그레인·종이 질감·노이즈, mix-blend, 마스크 페이드, 패럴랙스, 움직이는 배경을 쓰지 않는다. 지면용 예외는 0이다. 둘째 액센트(금·버건디)와 다크 모드 토글도 두지 않는다.
- 공개 범위에서 임의 hex(`bg-[#…]`·`text-[#…]`·`border-[#…]`)와 `bg-black|white|near-black|warm-*`, `bg-surface-ink`를 쓰지 않는다. `#0D1A12` 같은 둘째 다크를 새 토큰으로 두지 않는다.
- `tokens.css` 밖에서 `--surface-*`·`--fg-*`·`--line-*`나 `.surface-ink`를 선언하지 않는다. `.on-ink`·`@utility surface-ink`를 만들지 않는다. `var()` 폴백을 쓰지 않는다.
- 섹션 사이 `border-y`, WaveDivider, 그라데이션 장식선, rails, 섹션 배경 모눈·괘선을 쓰지 않는다.
- sheet를 섹션 지면으로 쓰지 않는다. sunken을 연속으로 두거나 도해·부록·FinalCTA 3역할 밖에 쓰지 않는다. 글만 있는 카드를 sheet 상자로 두지 않는다(열린 단).
- 먹 위에 컨트롤(채움·line 버튼, 입력)·Frame·표·사진·카드·밝은 위젯을 두지 않는다. 둘째 먹 서사(HW 포함), 읽기 면의 먹, 먹 CTA 패널을 두지 않는다.
- `surface-ink` 요소에 하드코딩 bg(`bg-[#111110]` 등)를 겹쳐 쓰지 않는다. 토큰 값을 덮는다.
- 사진·영상 위에 카피를 얹지 않는다. 밝은 스튜디오 사진이나 글로우가 구워진 3D 이미지를 먹 위에 두지 않는다. 풀블리드 도판(`sizes="100vw"`)을 쓰지 않는다. 큰 도판은 콘텐츠 폭 plate다.
- 출처를 확인하지 않은 도판에 라벨('AI 생성 이미지' 등)을 짐작해 달지 않는다. 라벨을 달 수 없는 도판은 싣지 않는다.
- 카드·Frame·plate·표·컨트롤·섹션·헤더에 그림자를 두지 않는다(제품 렌더 자산 안의 구운 접지 그림자 1개만 이미지 내용으로 허용). `--shadow-card`를 공개 화면에 쓰지 않는다. 공유 `card.tsx`·`dialog.tsx`·`toast.tsx`의 기본값은 바꾸지 않는다.
- 물건(카드·Frame·plate·표·띠)을 둥글게 하지 않는다. 반경 값은 0·6·원형 셋뿐이다(V14).
- hover에 `--line-ink`를 쓰지 않는다. hover에서 배경·그림자·이동을 바꾸지 않는다.
- 모든 Section에 `isolation`을 걸지 않는다. `@theme`(non-inline)으로 색 토큰을 매핑하지 않는다.
- 헤더 높이를 스크롤에 따라 바꾸지 않는다. `400ms`·`76px`·`80px`·`z-50` 리터럴을 쓰지 않는다.
- `#A39E98`을 hex → hex로 기계 치환하지 않는다.

---

## 11. 열린 질문

1. **앵커 오프셋 이중 적용**(canonical 내부 충돌)
   - system §1의 Section 출력에는 `scroll-mt-(--header-h)`가 있고, site-base에는 `:root:has(.site){scroll-padding-top: calc(var(--header-h) + 16px)}`가 있다.
   - 두 값은 더해지므로, Section으로 앵커 이동하면 오프셋이 `2 × 헤더 + 16px`(모바일 168px)이 된다.
   - §3-2 코드는 canonical 값을 그대로 옮겼다. 이 스펙의 이탈이 아니라 canonical 두 항목(system §1 Section 출력, css_architecture (a))끼리의 충돌이므로 정정도 canonical 쪽에서 한다.
   - **canonical 정정 제안: Section에서 `scroll-mt-(--header-h)`를 지우고** scroll-padding 하나로 둔다. FAQ 행처럼 Section이 아닌 앵커도 같은 오프셋을 받는다. 정정되면 §3-2 코드도 같이 고친다.
   - canonical이 정정되기 전에는 수용 기준 13을 판정하지 않는다(P2 Section PR 전에 정정한다).
2. **예산 검사 속성 계약**
   - "sheet 섹션 0"·"Frame 그림자 0"·"plate 예산"을 세려면 루트 속성이 필요하다. Card는 `data-card`(cards_motion)다.
   - Frame은 `components/ui/figure.tsx`(imagery)가 루트에 `data-frame`을, Figure는 `data-figure`를, plate는 `data-plate`를 다는 것으로 제안한다. 속성 값(예: plate 크기 단계 L·M·S 중 예산에 드는 것)은 imagery 스펙이 확정해야 한다.
3. **HW AllInOne 이미지**(해소 · CO-8, 2026-10-28)
   - 다시 굽는다. 출처를 확인한 OPS 컷아웃을 `--surface-ink` 값(`#1A1917`)과 같은 판에 미리 합성한 제품 한 컷(접지 그림자 α ≤ .12, 글로우·blend·마스크 0, 라벨 '제품 렌더') + capability hair 행 목록이다.
   - 출처가 확인되지 않으면 타이포 먹 + hair 행 목록으로 둔다. 지금의 `ops-glass-energy-module-black.webp`는 글로우가 구워져 있어 쓰지 않는다.
4. **HW 사진 라벨**: `board-bezel-detail.webp`와 '교실의 경계' 사진의 라벨은 출처 장부(`data/image-credits.json`)에서 만든다(X11 개정). 1차 검증 담당자가 실사인지 렌더인지 장부에 기록하기 전에는 plate에 올리지 않는다. 렌더된 HW 이미지 21개 중 5개는 `scripts/generate-hw-images.ts` 출력과 이름이 같고(git 기록상 3개는 Gemini 생성), 16개는 출처 기록이 없다.
5. **사실 레지스트리 등록**
   - company-facts §3 값을 `lib/facts.ts`에 등록한다(source 'EEO 공식 소개(classin.com)', asOf '2026-06'). 홈 05 기록에는 160+개국·5,000만+ 교육자·학습자·월 3,000만+ 수업과 13px 각주를 싣고, 6만+ 기관·2억+ 누적은 About에만 싣는다(system §5-5 개정).
   - HW ImpactNumbers(12개국·1,200+)와 SW '전 세계 어디서든'은 출처가 문서로 확인되기 전에는 렌더되지 않는다(감사 D3·D5).
   - EEO 수치 근거 보관과 법무 확인은 운영자·법무가 맡는다.
6. **병합 순서**: `app/globals.css`와 `components/ui/MobileFloatingCTA.tsx`가 작업 트리에서 수정 중이다. P0-1(import 3줄)과 P2(MobileFloatingCTA)를 그 커밋 뒤로 둘지 오케스트레이터가 순서를 정해야 한다.
7. **운영자 결정**(해소): V1–V9는 A로 확정됐고(2026-10-27), V10–V18도 전부 A로 확정됐다(2026-10-28). V11-A 승인(2026-10-28)으로 V3 보충 문장 교체도 승인됐다(DESIGN.md §9 V3 행). 확정 결과는 DESIGN.md §9 결정 로그에 남긴다.
8. **mock 안 먹 묘사**(canonical 확정 필요)
   - ai-report 목업 :464의 안쪽 UI는 지금 어둡다. Frame 안에서 `surface-ink`를 쓰면서 `data-surface`를 달지 않으면 빌드 HTML `[data-surface=ink]` 예산 카운트를 우회하게 된다. canonical(C26, 먹 지면 안 콘텐츠 규칙, V4-A)에는 이런 예외가 없다.
   - 기본값: mock 안쪽은 밝은 토큰으로 그리고 `surface-ink`는 0이다(§4-5).
   - 먹 묘사를 허용하려면 canonical이 카운트 방식(예: `.surface-ink`도 세고 ai-report 예산을 1로 올림)을 함께 정해야 한다.
9. **먹 위 selection 알파**
   - CO-3은 먹 위 `::selection`을 '세이지 알파 바탕 + 글자 `#FAFAF8`'로 정했지만 알파 값은 정하지 않았다.
   - P2 토큰 PR 전에 값을 정하고, 합성색 위 `#FAFAF8` 대비를 대비 테스트에 넣는다. 정해지기 전에는 §2-4 코드에 규칙을 넣지 않는다.

---

## 부록. 이전 판(v2) 대비 변경

- **토큰**
  - 정의 위치를 `app/globals.css` `:root`에서 `app/styles/tokens.css` 하나로 옮겼다.
  - 유틸 이름을 `bg-paper|sheet|sunken`에서 `bg-surface-*`로 바꿨다(C02).
  - `--line-pattern`·`--line-opaque`·`--focus`·`--pattern-cell`·`--rail-x`를 삭제하고 `--line-link`를 추가했다(X01).
  - `.surface-ink`를 `@utility`에서 base 레이어 클래스로 바꿨다. 먹 위 값은 sheet `transparent`→`#111110`, danger `#F2B8B8`→`#E89A94`, accent-hover `#D1FAE5`→`#6EE7B7`이다(C01).
- **배경 처리**: rails(EraVision)와 photo 레시피를 폐기했다. 모눈은 도해 figure 전용이고 선은 `--line-hair`, 셀 전환 기준은 `(width >= 40rem)`이다. `masthead`의 rails 연장 보정과 scaleX `transform-origin`도 삭제했다(C19·X04).
- **홈 시퀀스**(C19)
  - SatisfyingClass와 Outcomes를 paper에서 sunken으로 바꾸고, Era 모눈·rails를 삭제했다.
  - LogoBar를 마키·페이드에서 정적 목록으로 바꿨다(X16).
  - ProblemCost를 숫자 장부·합계 이중선에서 정성 6행으로 바꿨다(C08).
  - Act 05 이름을 '화면·사례'로 확정했다(X15).
- **Hero**: '닻 Frame + `--shadow-card` + OS 지도 대체'를 capture Frame(그림자 0, lazy)으로 바꿨다. LCP 요소는 H1이다(C09). 캡처 전 상태는 고급화 개정에서 V11 무도판 표지로 정했다.
- **FinalCTA**: Display H2와 sunken/sheet 비교를 h2(`text-h1`) + V5-A로 바꿨다(C10). 먹 위 그린 CTA 예외를 삭제했다(C14).
- **그림자**: '대표 Frame 1개 `--shadow-card`'를 공개 0으로 바꿨다. 모바일 메뉴 패널은 '삭제'에서 `--shadow-deep`으로 바꿨다. `card.tsx` 기본값 삭제 대신 공개 variant만 바꾼다(X05).
- **스코프**: `.site` + `body[data-shell]` 하이브리드를 `.site` 세 곳(AppChrome·Dialog 5·토스트)으로 바꿨다(C17).
- **헤더**: 하단선을 `#E8E8E4`에서 `--line-hair`로 바꾸고, `z-50`을 `z-(--z-header)`로 바꿨다. theme-color 충돌 질문은 paper 값 확정으로 해소됐다(C27·X09. 값은 V15 뒤 `#F9F8F5`).
- **컨트롤 경계**: v2의 'secondary(공개 이름은 이제 `line`, C15)·칩은 strong 허용'을 `--line-control`로 통일했다(C23).
- **가드**: 별도 `--public` 모드·별도 baseline·prebuild 지연을 system §6 규칙 배열(warn→error, `design-baseline.json`)로 합쳤다. LogoBar 페이드 예외도 삭제했다.
- **ai-report**: Benefits paper 전환을 '예외 질문'에서 확정으로 바꾸고, 점멸·웨이브폼·라벨까지 넓혔다(C26).
- **새로 넣은 것**: 먹 지면 허용 목록(gap 반영), 'sheet 섹션 안 카드 0' 규칙과 `sheet*` 판정, `#A39E98` 치환 순서 규칙, 앵커 오프셋 수용 기준.
- **삭제한 열린 질문**: rails 존폐, theme-color, Act 05 이름, 헤더 320ms, line 테두리, ai-report 예외, photo 확보, V3·V4·V5 비교.

## 부록. 고급화 개정 (V10–V18 A · 2026-10-28)

- **값**(V15-A·CO-3·CO-5): paper `#FAFAF8`→`#F9F8F5`, sunken `#F6F5F4`→`#F3F2EE`, skeleton `#F0F0EC`→`#EFEEE9`, line-control `#8F8A84`→`#8A857F`, surface-ink `#111110`→`#1A1917`(먹 안 sheet도 같은 값, 글자·masthead `#111110` 유지). hover `#065C41`→`#073D2D`, 먹 위 accent `#6EE7B7`→세이지 `#8FC4AC`, 먹 위 line-link → `rgb(143 196 172/.6)`, `::selection` `#D1FAE5`→`rgb(8 71 52/.14)`. `--line-w-hair`(2dppx 이상 .5px)를 더했다. 대비표를 새 값으로 다시 계산했다.
- **지면 배정**(V10-A·RA-7): sheet를 섹션 지면에서 뺐다(Section `surface`에서 제외, 표의 `sheet*` → `paper*`). sunken은 도해·부록·FinalCTA 3역할만 남고 카드 받침·LogoBar 띠는 paper가 됐다. 홈은 18섹션(+ 띠 2)·약 17번 바뀜에서 11지면·6번 바뀜이 됐고, Act 이름은 01 선언·02 공감·03 흐름·04 화면·05 기록·06 확신이다.
- **상자·도판**(CO-9·V14-A·V16-A): 글만 있는 카드는 열린 단, 물건은 r0, capture·mock Frame은 sunken 매트. HW 풀블리드(BigBackdrop·FullWidthPoint)는 콘텐츠 폭 plate로 바꿨다. X05에 제품 렌더 이미지 안 구운 접지 그림자 1개 예외를 더했다.
- **먹**(C14 개정·CO-8): 먹 위 컨트롤 0, 푸터는 판권면, HW 먹 장은 AllInOne 하나에 제품 한 컷(열린 질문 3 해소).
- **Hero**(V11-A): 캡처 전 무도판 표지. Hero 도판에 'AI 생성 이미지' 라벨을 달라는 지시(§4-2 1행, 이 부록의 Hero 줄)를 지웠다.
- **새 열린 질문**: 먹 위 selection 알파(9).
