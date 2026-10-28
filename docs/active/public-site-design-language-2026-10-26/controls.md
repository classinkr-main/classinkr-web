# 버튼·링크·칩·폼·내비 (controls) — 최종판

> **방향**: 편집 지면 · OS판. 2026-10-26 최종.
> **우선순위**: canonical 표(C01–C28·X01–X16), naming, css_architecture가 이 문서보다 앞선다. 값이 다르면 canonical이 맞다.
> **결정 표기**: 방향 결정은 V1–V9이고 기본안을 적용한 상태로 쓴다. 감사·모션 플랜 문서(`docs/active/public-site-audit-motion-plan-2026-10-26.md` §4)의 결정은 '감사 D#'으로 적는다.
>
> **이 문서가 소유하는 것**
> - Button 변형·크기(C15·X03), 먹 위 컨트롤(C14), 조작 경계선(C23), 좌측 바 사용처 목록(C21)
> - 링크 유틸 `link-body`·`link-quiet`(X12), 색인 탭 `index-tab`(C12), `hit-area`·`arrow-nudge`·`select-chevron`
> - 보증 블록 ① 포커스 ② 입력 16px(C16) ③ autofill
> - 폼 키트, 내비 셸의 동작(헤더·모바일 메뉴·푸터 법정 표기), 탭·FAQ·지면 표·토스트·Dialog·StateBlock·쿠키 배너·모바일 플로팅 CTA의 외형
>
> **참조만 하는 것**
> - 색 값과 `.surface-ink` 블록: surfaces(C01·X01)
> - 글자 크기 15종: typography(C18)
> - 모션 무장, `.row-accent`, TocRow, Card: cards_motion
> - 아이콘 크기·획·스피너(보증 ④): icons(C11·X08)
> - `.site` 스코프, 가드 스크립트, tw-merge 설정, z 스택, 레이아웃: system(C17·X09·C18)

---

## 요약

공개 컨트롤(버튼·링크·칩·폼·내비·탭·표·토스트·Dialog)의 정본은 `components/ui/*`이고, 공개 화면에만 적용된다. 공유 프리미티브의 어드민 문자열(base 포함)은 한 글자도 바꾸지 않는다(C17 원칙). 공개 외형은 세 가지 방법으로만 얹는다: 새 키(variant·size), `[.site_&]:` 변형과 C17의 '새 variant'로 읽는 `[&.site]:`·`[&:has(~.site)]:`(Dialog 한정, 정본 확인 요청 — 열린 질문 6), `isInternalPath` 경로 조건. 그래서 모든 단계의 수용 조건이 '어드민 스크린샷 diff 0'이다.

정본 결정을 반영한 핵심은 다음과 같다.
- **버튼**: 변형 3개 `default`·`line`·`ghost`, 크기 3개 `md` 44·`cta` 52·`icon-md` 44×44(C15). ghost는 텍스트 링크 문법이다(X03). 먹 위에는 채움 버튼이 없다. 푸터 '구독'은 `line md`다(C14, V5-A).
- **조작 경계**: 입력·line 버튼·칩·스위치·외곽선 아이콘 버튼·플로팅 CTA의 테두리는 모두 `--line-control #8F8A84`이고, hover 때 `--fg-ink`가 된다(C23). 체크박스·라디오는 기본이 네이티브라 미체크 테두리를 UA가 그린다(토큰 아님). 실기기에서 그 테두리가 3:1 미만이면 C23대로 `--line-control` 대체 레시피를 넣는다(§3.5).
- **색인 탭**: 탭마다 2px 막대 하나가 opacity 0→1로 켜진다(160ms). 글자는 15/500으로 고정이고, 움직이는 인디케이터는 없다(C12).
- **포커스·입력**: 포커스와 입력 16px는 site-base.css 끝의 무레이어 보증 규칙이 맡는다. 레이어 밖이라 Tailwind 레이어 전부를 이긴다(C16). 특이도는 ② 입력 16px가 0이고, ① 포커스는 `:not([data-focus-ring=parent]):focus-visible` 때문에 (0,2,0)이다. 그래서 의도적으로 레이어 밖에 쓴 CSS(CSS module·inline style)에는 진다(②는 늘, ①은 특이도·순서에 따라). 입력 모양은 박스형이다(V8-A).
- **좌측 2px 바**: 세 곳에만 쓴다(Comparison Classin 열, /pricing 선택 행, 세로 목차). 토스트 상태선과 표 추천 열 상단 바는 없다(C21).
- **흡수한 공백 항목**: StateBlock(404·오류·빈 상태), 푸터 법정 표기, 스킵 링크와 단일 `<main>`, 소셜 로그인 외부 브랜드 예외, Pagination·Breadcrumb·Stepper·Tooltip·다운로드 행의 한 줄 규격, 챗봇 패널 후속 규격.

---

## 원칙

컨트롤은 지면 위에서 '조작할 수 있는 글자와 선'이다.

1. **채움은 밝은 지면의 primary와 체크 표식뿐이다.** primary는 `bg-fg-accent`(#084734) 위에 `text-fg-on-accent`(#FAFAF8)를 쓴다. 체크박스·라디오의 `accent-color`만 예외로 채운다. 스위치·칩·탭·활성 행은 선과 글자로만 그린다. 먹 지면에는 채움 버튼이 0개다(C14).
2. **선의 진하기가 조작 가능성을 알린다.** 조작 경계는 `--line-control`(3:1 이상)이다. `--line-strong`(.16)은 장식선 전용이다: 표 머리 아래, 바이라인, 읽기 전용 필드, 링크 카드 hover(C23).
3. **크기를 고정한다.** 버튼·입력 반경은 6px(`rounded-md`)이다. 터치 대상은 44px 이상이다(버튼 44/52, 입력 44, 터치 기기 48, 칩 36 + 히트 44). 입력 글자는 16px다. 높이는 `min-h-*`로 지정해 글자를 키우면 컨트롤도 같이 늘어나게 한다.
4. **상태를 색만으로 나타내지 않는다.** 함께 쓰는 단서는 다음과 같다.
   - 가로 색인: 2px 막대
   - 드롭다운·메뉴 행: 2px 밑줄
   - 칩: ●와 테두리
   - 스위치: 썸 위치
   - 링크: 밑줄
   - 오류: 문구와 아이콘
   - 모든 상태에 `aria-*`를 단다.
5. **좌측 2px 바는 세 곳뿐이다(C21).** 그 밖에서 쓰면 가드가 막는다.
6. **포커스는 규칙 하나가 맡는다.** `.site` 보증 ①이 2px `var(--fg-accent)` outline을 그린다. 먹 위에서는 자동으로 #6EE7B7이 된다. 개별 ring·`outline-none`·`focus:`는 쓰지 않는다.
7. **움직임은 네 가지다.**
   - 색·테두리·막대 opacity 전이 160ms(`--motion-fast`)
   - 눌림 scale .97
   - 화살표 2px 이동
   - 패널·토스트·오버레이 opacity 320ms(`--motion-base`)

   reduced 환경에서는 이동이 0이다. 무한 반복은 로딩 중 스켈레톤 점멸(C07)과 스피너(X08)뿐이다.
8. **프리미티브가 정본이다.** 공개 화면은 새 키(`size="md|cta|icon-md"`, `variant="line"`, `variant="site"`)로 들어간다. 기본값은 어드민 밀도를 지킨다. className으로 높이·반경·색·그림자를 덮어쓰지 않는다.
9. **먹 지면은 `surface-ink` 클래스 하나로 바꾼다(C01).** 토큰이 뒤집히므로 컴포넌트에 dark prop을 두지 않는다. `NewsletterSubscribe variant="dark"`는 없앤다.
10. **이동은 링크, 동작은 버튼이다.** 링크를 버튼 모양으로 쓰는 것은 CTA(`Button asChild`)뿐이다.

---

## 토큰 (CSS + Tailwind @theme)

### 1. 소비하는 토큰 — 정의는 `app/styles/tokens.css` 한 곳(C01·X01·X13)

이 문서는 아래 토큰을 쓰기만 하고 선언하지 않는다. `.surface-ink` 블록도 다시 쓰지 않는다. 가드는 tokens.css 밖의 `--(surface|fg|line)-` 선언을 막는다.

| 토큰 | 밝은 지면 | 먹(`.surface-ink`) | 컨트롤 용도 |
|---|---|---|---|
| `--surface-sheet` | #FFFFFF | #111110 (불투명) | 입력·스위치 트랙·슬라이더 썸 바탕, autofill 덮개, 드롭다운·토스트·Dialog 면 |
| `--surface-paper` | #FAFAF8 | — | 헤더·제품 탭·모바일 메뉴·플로팅 CTA 바탕 |
| `--surface-scrim` | rgb(17 17 16/.48) | — | Dialog·모바일 메뉴 백드롭(블러 없음) |
| `--surface-skeleton` | #F0F0EC | — | 스켈레톤 |
| `--fg-ink` | #111110 | #FAFAF8 | 활성 라벨, 입력 글자, hover 경계 |
| `--fg-body` | #31302E | /.72 | 칩·체크 라벨, 푸터 링크 |
| `--fg-muted` | #615D59 | /.56 | 비활성 탭, 도움말, 아이콘 버튼 |
| `--fg-placeholder` | #78736D | /.56 | 플레이스홀더(흰 필드 전용) |
| `--fg-faint` | #A39E98 | /.40 | 장식·비활성 전용. 글자에 쓰지 않는다 |
| `--fg-accent` | #084734 | #6EE7B7 | primary 채움, 링크, 선택 칩, 막대, 포커스, accent-color |
| `--fg-accent-hover` | #065C41 | #6EE7B7 | primary·링크 hover |
| `--fg-on-accent` | #FAFAF8 | — | primary 글자 |
| `--fg-danger` | #B43E3E | #E89A94 | 오류 테두리·문구·아이콘 |
| `--line-control` | #8F8A84 | /.40 | 조작 경계(C23) |
| `--line-strong` | rgb(17 17 16/.16) | /.24 | 장식선: 표 머리 아래, 읽기 전용 필드, 토스트 테두리 |
| `--line-hair` | rgb(17 17 16/.08) | /.12 | 탭 바닥선, 행 구분, 헤더 스크롤 하단선 |
| `--line-ink` | #111110 | /.72 | 표 상단, 장부 합계 이중선(X04 목록 안) |
| `--line-link` | rgb(8 71 52/.6) | rgb(110 231 183/.5) | 본문 링크·ghost 밑줄 |
| `--motion-fast` / `-base` / `-slow` | 160ms / 320ms / 700ms | — | 색·막대 / 패널·토스트 / 오류 테두리 페이드 |
| `--ease-soft` | cubic-bezier(.22,1,.36,1) | — | 모든 컨트롤 전이 |
| `--header-h` | 76px, (width ≥ 48rem)에서 80px | — | 헤더 높이, 제품 탭 sticky top, scroll-padding |
| `--z-subnav` 30 · `--z-header` 40 · `--z-floating` 42 · `--z-chatbot` 44 · `--z-consent` 46 · `--z-skiplink` 60 | — | — | `z-(--z-…)`로 쓴다. Dialog 50과 토스트 9999는 공유 기본값이다(X09) |

`prefers-contrast: more`에서는 tokens.css가 값을 바꾼다(hair /.32, strong #8F8A84; 먹 위 hair /.32, strong /.40). 컨트롤에서 따로 할 일은 없다.

### 2. Tailwind 이름 (C02)

- **유틸 이름 = 변수 이름**이다. `bg-surface-sheet|paper|sunken|skeleton|scrim`, `text-fg-ink|body|muted|placeholder|faint|accent|accent-hover|danger|on-accent`, `border-line-hair|strong|ink|control`, `divide-line-hair`, `decoration-line-link`, `placeholder:text-fg-placeholder`.
- **primary 채움**: `bg-fg-accent text-fg-on-accent hover:bg-fg-accent-hover`.
- **먹 바탕**: `surface-ink` 클래스로만 칠한다. `bg-surface-ink` 유틸은 없다.
- **C02 목록 밖이지만 쓰는 유틸**: `border-fg-ink`·`border-fg-accent`·`border-fg-danger`(C14·C23의 hover·선택·오류 경계), `bg-line-control`(슬라이더 트랙), `decoration-fg-accent`(활성 밑줄), `outline-fg-accent`(parent 포커스 컨테이너, §토큰 5(c)). `@theme inline` 1:1 매핑이라 생성되지만, C02 열거와 system §3-5 '목록 밖 색 유틸 금지'에 어긋난다. 정본 목록 추가를 요청한다(열린 질문 6, icons 열린 질문 8과 같은 요청). 추가 전에는 이 6개 밖으로 늘리지 않는다.
- **포커스 outline**: 유틸이 없다. 보증 ①이 그린다. 예외는 `data-focus-ring="parent"` 입력의 컨테이너다(§토큰 5(c)).
- **글자**: 컨트롤 글자는 `text-ui`(15/1.4, 굵기는 요소가 정한다: 탭·내비 500, 버튼 600)다. 라벨·도움말·오류는 `text-caption`(14), 메타·캡션은 `text-note`(13), 범주·상태·표 머리는 `text-label`(13/600), 폴리오는 `text-folio`(13/500)다(C18).

### 3. tokens.css `@theme inline`에 들어가는 컨트롤 몫

css_architecture가 tokens.css ④에 두기로 한 애니메이션 3종이다. 값은 controls가 정한다.

```css
/* tokens.css ④ @theme inline 안 — 값 소유: controls */
--animate-fade-in: fade-in var(--motion-base) var(--ease-soft) both;     /* Dialog 오버레이, FAQ 답변 */
--animate-dialog-in: dialog-in var(--motion-fast) var(--ease-soft) both; /* Dialog 본문 */
--animate-skeleton: skeleton-blink 1.6s ease-in-out infinite;            /* 스켈레톤(로딩 한정, 루프 집계 제외 — C07) */

@keyframes fade-in { from { opacity: 0; } }
/* 개별 scale 속성을 쓴다. Dialog 가운데 정렬의 translate와 충돌하지 않는다 */
@keyframes dialog-in { from { opacity: 0; scale: 0.98; } }
/* 보증 ④ reduced 스피너(icons, X08)도 이 keyframes를 쓴다. 50%만 두어 reduced에서 멈추면 opacity 1로 끝난다 */
@keyframes skeleton-blink { 50% { opacity: 0.4; } }
```

- **Dialog 220ms → 160ms**: 토큰 밖 ms 리터럴을 쓰지 않기 위해서다. 감사 §5-5-5 문구를 함께 고친다.
- **어드민 무변경 주의**: `animate-fade-in`은 이미 어드민 `components/admin/cs-chat/components/SmartActionCard.tsx:222` 한 곳에 붙어 있다. 지금은 정의가 없어 아무 일도 하지 않는 죽은 클래스다. 정의하는 순간 그 화면에 페이드가 생기므로, 정의하는 PR에서 그 클래스를 지운다(동작 변화 0, 어드민 소유자에게 한 줄로 알린다).
- **키프레임 출력 확인**: Tailwind는 @theme 안 keyframes를 쓰는 곳이 있을 때만 내보낼 수 있다. 스켈레톤이 쓰이므로 `skeleton-blink`는 출력된다. 보증 ④가 이 이름을 직접 부르므로 빌드 CSS에서 한 번 확인한다.

### 4. `app/styles/utilities.css` — controls 소유 `@utility`

규칙(css_architecture): 유틸에는 정적인 모양만 둔다. 예외는 명시한 세 가지다: `index-tab` 막대의 opacity 전이, `arrow-nudge`의 이동, 링크의 160ms 색 전이. 이름에 `text-` 접두를 쓰지 않는다(tailwind-merge가 색으로 보고 지운다).

```css
/* ── controls ─────────────────────────────────────────────────────── */

/* 히트 영역 44×44 이상(칩 36, 밀집 행의 보조 버튼). ::before를 쓰므로 같은 요소에 before: 유틸을 겹치지 않는다 */
@utility hit-area {
  position: relative;
  &::before {
    content: "";
    position: absolute;
    inset-inline-start: 50%;
    inset-block-start: 50%;
    inline-size: max(100%, 44px);
    block-size: max(100%, 44px);
    translate: -50% -50%;
  }
}

/* 화살표 2px(명시 예외). 조상 a·button·summary(FAQ 행, C13)의 hover(hover 기기)·focus-visible에 반응한다. 옵트인 */
@utility arrow-nudge {
  transition: translate var(--motion-fast) var(--ease-soft);
  @media (hover: hover) {
    :is(a, button, summary):hover & { translate: 2px 0; }
  }
  :is(a, button, summary):focus-visible & { translate: 2px 0; }
  @media (prefers-reduced-motion: reduce) {
    translate: none !important;   /* 전역 reduced 블록은 전이 시간만 줄이고 이동은 막지 못한다 */
  }
}

/* 본문 링크(X12) */
@utility link-body {
  color: var(--fg-accent);
  text-decoration-line: underline;
  text-decoration-thickness: 1px;
  text-decoration-color: var(--line-link);
  text-underline-offset: 0.22em;
  text-decoration-skip-ink: auto;
  transition: color var(--motion-fast) var(--ease-soft), text-decoration-color var(--motion-fast) var(--ease-soft);
  @media (hover: hover) {
    &:hover { color: var(--fg-accent-hover); text-decoration-color: currentColor; }
  }
  &:focus-visible { color: var(--fg-accent-hover); text-decoration-color: currentColor; }
}

/* 조용한 링크(X12): 푸터·보조 내비·Breadcrumb. 기하는 link-body와 같고 평소 밑줄이 투명하다. 색은 호출부(text-fg-body 등) */
@utility link-quiet {
  text-decoration-line: underline;
  text-decoration-thickness: 1px;
  text-decoration-color: transparent;
  text-underline-offset: 0.22em;
  transition: color var(--motion-fast) var(--ease-soft), text-decoration-color var(--motion-fast) var(--ease-soft);
  @media (hover: hover) {
    &:hover { color: var(--fg-ink); text-decoration-color: currentColor; }
  }
  &:focus-visible { color: var(--fg-ink); text-decoration-color: currentColor; }
}

/* 색인 탭(C12): 헤더 내비, ProductTabNav, ui/tabs variant="site", 블로그·행사·문서 범주, Pagination */
@utility index-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-block-size: 44px;
  white-space: nowrap;                               /* 768px 부근 두 줄 꺾임 방지(감사 §2-2) */
  font-size: --theme(--text-ui);
  line-height: --theme(--text-ui--line-height);
  font-weight: 500;                                  /* 활성·비활성 모두 500 → 폭 변화 0 */
  color: var(--fg-muted);
  transition: color var(--motion-fast) var(--ease-soft);
  &::after {
    content: "";
    position: absolute;
    inset-inline: 0;
    inset-block-end: 0;
    block-size: 2px;
    background: var(--fg-accent);
    opacity: 0;
    transition: opacity var(--motion-fast) var(--ease-soft);
  }
  @media (hover: hover) {
    &:hover { color: var(--fg-ink); }               /* hover는 색만. 막대 미리보기는 없다 */
  }
  &:is([aria-current="page"], [aria-current="true"], [aria-selected="true"], [aria-pressed="true"]) {
    color: var(--fg-ink);
    &::after { opacity: 1; }
  }
  @media (forced-colors: active) {
    &::after { forced-color-adjust: none; background: CanvasText; }
  }
}

/* 네이티브 select 화살표. data URI는 CSS 안에만 둔다(클래스 문자열에 넣으면 Oxide 스캐너가 공백에서 끊는다).
   여백은 클래스(pr-10)로 준다. 먹 지면 select는 없다. 생기면 두 번째 data URI를 추가한다 */
@utility select-chevron {
  appearance: none;
  background-repeat: no-repeat;
  background-position: right 14px center;
  background-size: 16px 16px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23615D59' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
}
```

`--theme()`는 빌드할 때 값으로 풀린다. `@theme inline` 변수가 `:root`에 출력되는지와 무관하게 동작한다.

### 5. `app/styles/site-base.css` — controls 소유 블록

모든 셀렉터는 `:where(.site)`로 시작한다. 블록 머리에 소유 스펙을 주석으로 적는다.

```css
/* (a) @layer base — controls */
@layer base {
  /* 체크박스·라디오 20px. accent-color는 var(--fg-accent)라 먹 위에서 자동으로 #6EE7B7(C01).
     base 레이어라 sr-only 같은 유틸이 이긴다 */
  :where(.site) :is(input[type="checkbox"]:not([role="switch"]), input[type="radio"]) {
    inline-size: 20px;
    block-size: 20px;
    margin: 0;
    flex-shrink: 0;
    accent-color: var(--fg-accent);
  }
  /* 문단 안 클래스 없는 링크 = 본문 링크(X12) */
  :where(.site) :where(p, li, dd, td, figcaption, blockquote) > a:not([class]) {
    @apply link-body;
  }
}

/* (b) @layer components — controls */
@layer components {
  /* 지면 표 */
  :where(.site) .table-paper {
    width: 100%;
    border-collapse: collapse;
    border-top: 1px solid var(--line-ink);           /* X04 먹선 목록: 표 상단 */
    font-variant-numeric: tabular-nums;              /* lining-nums는 쓰지 않는다(X14) */
  }
  :where(.site) .table-paper caption {
    caption-side: top;
    text-align: start;
    padding-bottom: 12px;
    @apply text-note font-medium;
    color: var(--fg-muted);
  }
  :where(.site) .table-paper :is(th, td) {
    padding: 16px 20px;
    text-align: start;
    vertical-align: top;
    border-bottom: 1px solid var(--line-hair);
    @apply text-body;
    color: var(--fg-body);
  }
  :where(.site) .table-paper thead th {
    padding-block: 12px;
    border-bottom-color: var(--line-strong);
    @apply text-label;
    color: var(--fg-ink);
  }
  :where(.site) .table-paper tbody th { font-weight: 600; color: var(--fg-ink); }
  :where(.site) .table-paper .group-head th {
    padding-top: 24px;
    border-top: 1px solid var(--line-hair);
    @apply text-label;
    color: var(--fg-accent);
  }
  /* 추천 열(C21): 바·채움 없음. 머리에 '추천' text-label, 셀은 600 */
  :where(.site) .table-paper [data-recommended] { font-weight: 600; color: var(--fg-ink); }
  /* 숫자 열이 있는 장부의 합계(X04 먹선 목록) */
  :where(.site) .table-paper tfoot :is(th, td) {
    border-top: 1px solid var(--line-ink);
    border-bottom: 3px double var(--line-ink);
    font-weight: 600;
    color: var(--fg-ink);
  }
  @media (width < 40rem) {
    :where(.site) .table-paper :is(th, td) { padding: 12px; @apply text-caption; }
    /* display를 바꾸면 Safari가 표 시맨틱을 잃는다 → 마크업에 role=table/rowgroup/row/columnheader/rowheader/cell 명시 */
    :where(.site) .table-paper--stack :is(thead, tbody) tr { display: grid; grid-template-columns: 1fr 1fr; }
    :where(.site) .table-paper--stack thead th:first-child { display: none; }
    :where(.site) .table-paper--stack tbody th { grid-column: 1 / -1; padding-bottom: 4px; border-bottom: 0; }
  }

  /* 스위치: input[role=switch] 하나. 트랙은 선화(채움 없음), 썸의 위치와 색이 상태를 나타낸다 */
  :where(.site) input[type="checkbox"][role="switch"] {
    appearance: none;
    position: relative;
    flex-shrink: 0;
    margin: 0;
    inline-size: 40px;
    block-size: 24px;
    border: 1.5px solid var(--line-control);
    border-radius: 9999px;
    background: var(--surface-sheet);
    cursor: pointer;
    transition: border-color var(--motion-fast) var(--ease-soft);
  }
  :where(.site) input[type="checkbox"][role="switch"]::before {
    content: "";
    position: absolute;
    inset-block-start: 50%;
    inset-inline-start: 3px;
    inline-size: 15px;
    block-size: 15px;
    border-radius: 9999px;
    background: var(--line-control);
    translate: 0 -50%;
    transition: translate var(--motion-fast) var(--ease-soft), background-color var(--motion-fast) var(--ease-soft);
  }
  :where(.site) input[type="checkbox"][role="switch"]:checked { border-color: var(--fg-accent); }
  :where(.site) input[type="checkbox"][role="switch"]:checked::before { translate: 16px -50%; background: var(--fg-accent); }
  :where(.site) input[type="checkbox"][role="switch"]:disabled { opacity: 0.4; cursor: not-allowed; }
  @media (forced-colors: active) {
    :where(.site) input[type="checkbox"][role="switch"]::before { forced-color-adjust: none; background: CanvasText; }
    :where(.site) input[type="checkbox"][role="switch"]:checked::before { background: Highlight; }
  }
}

/* (c) 파일 끝, 레이어 밖 '보증' 블록 — 닫힌 목록 4개. ①②③ controls, ④ icons(X08) */

/* ① 포커스. 정본(css_architecture (c)①) 그대로 셀렉터 하나다. 특이도 (0,2,0).
   data-focus-ring="parent" 입력은 제외되고, 그 컨테이너가 Tailwind 유틸로 표시를 맡는다(아래 목록) */
:where(.site) :where(a[href], button, input, select, textarea, summary, [role="tab"], [tabindex]:not([tabindex="-1"])):not([data-focus-ring="parent"]):focus-visible {
  outline: 2px solid var(--fg-accent);
  outline-offset: 2px;
}

/* ② 입력 글자 16px 하한(C16). 특이도 0 + 레이어 밖 → preflight·text-sm·text-[14px]·marketing-form 15px를 모두 이긴다.
   의도적으로 레이어 밖에 쓴 CSS module(quote-paper 등)과 inline style에는 진다 */
:where(.site) :where(input:not([type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"], [type="submit"], [type="button"], [type="reset"], [type="image"], [type="hidden"]), select, textarea) {
  font-size: max(16px, 1em);
}

/* ③ 자동완성 덮개. Chrome 파랑·Safari 노랑을 덮는다. 먹 위에서는 --surface-sheet가 #111110(C01) */
:where(.site) :where(input, select, textarea):-webkit-autofill {
  -webkit-box-shadow: inset 0 0 0 1000px var(--surface-sheet);
  -webkit-text-fill-color: var(--fg-ink);
  caret-color: var(--fg-ink);
}

/* ④ reduced 스피너 — icons(X08) 소유. 여기서는 참조만 한다. 정본 값(X08·css_architecture ④):
   @media (prefers-reduced-motion:reduce){:where(.site) .animate-spin{animation:skeleton-blink 1.6s ease-in-out infinite}}
   알려진 충돌: globals.css:904의 전역 reduced 블록(*{animation-duration:.001ms !important; animation-iteration-count:1 !important})이
   !important라서 정본 값 그대로면 점멸이 한 번에 끝난다. `!important`를 붙일지는 icons 열린 질문 7(정본 정정 요청)이 정한다.
   controls는 값을 따로 정하지 않는다 */
```

- **`data-focus-ring="parent"`의 짝**: 보증 ①은 정본대로 셀렉터 하나이고 container 짝 셀렉터를 두지 않는다(system 보증 블록과 같다). 제외된 입력의 컨테이너는 utilities 레이어의 Tailwind 유틸로 그린다: `focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-fg-accent`. 무레이어 규칙은 늘지 않는다(4개 그대로). 먹 위에서는 `--fg-accent`가 #6EE7B7로 바뀌므로 따로 처리하지 않는다. `outline-fg-accent`는 C02 목록 밖이라 추가를 요청한다(§토큰 2). 소비처는 docs 검색 폼 3곳과 챗봇 입력이다(챗봇은 chatbot 파트와 합의).
- **스크롤 여백**: `:root:has(.site){scroll-padding-top:calc(var(--header-h) + 16px)}`와 `(width < 48rem)`의 `:root:has([data-subnav])` +44px는 system이 site-base base에 둔다(css_architecture). 컨트롤은 거기에 기댄다.

### 6. tailwind-merge와 테스트

- **설정**: `lib/utils.ts` 한 곳에 `extendTailwindMerge`로 둔다(C18, system 소유). controls가 기대는 항목은 `text: [15종]`과 `ease: ['soft','drift']`다. 15종에 `ui`가 들어 있으므로 `cn('text-ui text-fg-muted')`는 두 클래스를 모두 남긴다.
- **커스텀 유틸**: `link-body`·`link-quiet`·`index-tab`·`hit-area`·`arrow-nudge`·`select-chevron`은 twMerge가 모르는 클래스다. 지우지도 겹침을 풀지도 않는다. 그래서 cva 안에서 기존 Tailwind 클래스와 겹치는 값은 Tailwind 유틸로 쓴다(§3.1 ghost).
- **controls 테스트 1개**: `tests/ui/button-variants.test.ts`
  - `buttonVariants()`(어드민 기본 default·default)의 출력이 현행 문자열 스냅샷과 같다. 어드민 무변경의 기계 검사다.
  - `cn(buttonVariants({ size: "md" }))`에 `bg-fg-accent`·`text-ui`가 있다. `bg-[#084734]`·`shadow-sm`·`focus-visible:ring-2`·`transition-all`·`text-[15px]`·`duration-150`은 없다(C15의 text-ui 치환은 공개 크기 키가 한다).
  - `cn(buttonVariants({ variant: "ghost", size: "md" }))`에 `px-0`·`underline`이 있고 `px-5`는 없다. `cn(buttonVariants({ variant: "ghost", size: "cta" }))`에 `text-ui`가 있고 `text-body`는 없다(X03).
  - `cn(buttonVariants({ size: "icon-md" }))`에 `[&_svg]:size-5`가 있고 `[&_svg]:size-4`는 없다(같은 변형·같은 그룹이라 twMerge가 뒤의 값만 남긴다).

### 7. 만들지 않는 것

- **토큰**(C01·X01 폐기 목록과 같다): `--cta`·`--cta-hover`·`--cta-fg`·`--surface-cta`·`--fg-on-cta`·`--line-cta-ring`, `--field-bg`·`--surface-field`·`--color-field`, `--focus`·`--line-focus`·`--focus-width`·`--focus-offset`, `--overlay`·`--color-overlay`, `--link-decoration`, `--hit-min`(리터럴 44px), `--tab-bar-offset`, `--motion-story`·`--motion-progress`·`--motion-carousel`.
- **클래스·장치**: `.on-ink`, `rule-link`(ghost 괘선 막대), `.progress-track`·`.progress-rule`, 그룹 이동 인디케이터(translateX·scaleX 측정 JS), 토스트 상태선, 표 추천 열 상단 바, `.num`, `--animate-accordion-*`.
- **var() 폴백값**: 쓰지 않는다(X01).

---

## 패턴과 값 (데스크톱/모바일)

### 0. 반응형 요약

브레이크포인트는 Tailwind 기본값이다(X02). 원시 CSS는 `(width < 40rem)`처럼 범위 문법만 쓴다. 터치 기기 분기는 `pointer-coarse:`다.

| 대상 | 모바일 (`< 40rem` 또는 `pointer:coarse`) | 데스크톱 (`sm:` 이상, 포인터) |
|---|---|---|
| 주 CTA | `size="cta"` + `w-full` | `w-auto` |
| 버튼 쌍 | 세로로 쌓고 gap 12, primary를 위에 | 가로 gap 12, primary를 왼쪽에 |
| 입력 높이 | 48 (`pointer-coarse:min-h-12`) | 44 |
| 폼 배치 | 1열, 필드 묶음 사이 16 | 짧은 필드 쌍 2열 gap 20, 묶음 사이 20 |
| 4개 이상 탭 | 2×2 그리드, 칸 높이 48 | 4열 |
| 헤더 | 76px, 메뉴 토글(`ghost icon-md`) + 메뉴 패널 | 80px(`≥ 48rem`), `index-tab` 내비 |
| 제품 탭 내비 | sticky 2칸(`< 48rem`) | 없음 |
| 지면 표 | 셀 패딩 12, 글자 14, Comparison은 행 쌓기 | 셀 16×20, 글자 16 |
| 토스트 | 하단 가운데 `bottom: calc(env(safe-area-inset-bottom) + 72px)` | 오른쪽 위 `top: calc(var(--header-h) + 16px)`, right 16 |
| Dialog | 패딩 16 + safe-area(현행 유지), r12 | 패딩 24 |
| 푸터 링크 행 | 44 (`min-h-11`) | 44 (`min-h-11`) |
| FAQ 폴리오 칸 | 40px | 56px |
| 모바일 플로팅 CTA | 보인다(`md:hidden`) | 없다 |

### 3.1 버튼 (`components/ui/button.tsx`)

**변형** — 공개 화면은 이 셋만 쓴다(C15).

| 변형 | 평소 | hover (hover 기기) | 눌림 | 포커스 | 비활성 | 진행 중 |
|---|---|---|---|---|---|---|
| `default` (primary) | `bg-fg-accent text-fg-on-accent`, `border border-transparent`(강제 색 모드에서 경계가 보인다), 그림자 0 | `bg-fg-accent-hover` | scale .97 (reduced: 없음) | 보증 ① | opacity .4, 옆에 이유 문구 필수 | `aria-busy`, 라벨을 '보내는 중…'으로 교체, LoaderCircle 16, 불투명도 유지 |
| `line` (보조) | 투명, 1px `--line-control`, 글자 `--fg-ink` | 테두리 `--fg-ink` | scale .97 | 보증 ① | 같음 | 같음 |
| `ghost` + `md`·`cta` = 텍스트 링크(X03) | `--fg-accent` `text-ui` 600, 밑줄 1px `--line-link` offset .22em, 반경 0, 좌우 패딩 0, `min-h-11` | 밑줄 currentColor, 색 `--fg-accent-hover` (160ms) | 없음 | 보증 ① + hover와 같은 색 | 같음 | — |
| `ghost` + `icon-md` = 맨 아이콘 버튼 | 투명, 테두리 없음, 아이콘 `--fg-muted` | 아이콘 `--fg-ink` | 없음 | 보증 ① | 같음 | — |

- **아이콘 단독 버튼**: 두 갈래다(icons §11과 같은 기준).
  - 본문에 홀로 서는 버튼(캐러셀 이전·다음, 영상 정지, 복사·공유)은 `line icon-md`로 외곽선을 그린다(C23).
  - 컨테이너 모서리의 닫기(Dialog·토스트)와 헤더 메뉴 토글은 `ghost icon-md`로 외곽선 없이 둔다. 아이콘 대비(muted 6.24, ink 18.08)가 1.4.11을 채운다.
  - 둘 다 `aria-label`이 필수다.
- **어드민 전용 변형**: `secondary`·`outline`·`destructive`·`link`. 현행 문자열을 그대로 두고, 공개 파일에서 쓰면 가드가 막는다.
- **`green-surface`**: 사용처는 `components/billing/CheckoutSuccessClient.tsx:214` 한 곳이다(/checkout, `.site` 밖). platform-data가 `outline lg`로 바꾼 뒤 키를 지운다.

**크기**

| 크기 | 높이 | 좌우 | 글자 | 아이콘 | 용도 |
|---|---|---|---|---|---|
| `md` | 44 (`min-h-11`) | 20 | `text-ui` 600 | 16 | 헤더 '도입 문의', 폼 보조, 쿠키 배너, 푸터 '구독', 다이얼로그 하단 |
| `cta` | 52 (`min-h-13`) | 24 | `text-body` 600 (16). ghost는 `text-ui`(X03) | 16 | Hero, FinalCTA, 중간 CTA 띠, 폼 제출, 모바일 메뉴 하단 |
| `icon-md` | 44×44 | 0 | — | 20(`[&_svg]:size-5`). 24가 필요한 헤더 토글만 호출부 `className="[&_svg]:size-6"` + `<Icon icon={Menu} size={24} />`(icons, 같은 값으로 적는다) | 메뉴, 닫기, 비밀번호 보기, 캐러셀, 영상 정지 |

- **`min-h`를 쓴다(정본 안 편차)**: C15 표기는 `h-11`·`h-13`이고, system 브리프 §1은 '컨트롤은 height 대신 min-height'다. 정본 안에서 둘이 다르므로 이 스펙은 system §1을 따른다. 기본 글자 크기에서는 둘 다 44·52로 같고, 글자를 키우면 버튼도 커진다(system §9). C15 표기를 `min-h-11`·`min-h-13`으로 고쳐 달라고 요청한다(열린 질문 6).
- **어드민·결제 전용 크기**: `default`(38)·`sm`(32)·`icon`(36)·`icon-sm`(28)·`lg`(44, billing 8곳·checkout 1곳)는 그대로 둔다.
- **`xl`**: 공개 8곳(DownloadPageClient 4, DemoModal 2, EventSignupModal 2)을 `cta`로 옮기고, grep이 0이 되면 키를 지운다.
- **36px 버튼은 공개 화면에 없다.** 36은 필터 칩 높이다.
- **공개 `<Button>`은 `size`를 반드시 명시한다.**
- **`.site` 밖에서는 쓰지 않는다**: 공개 크기는 포커스를 보증 ①에 맡긴다. 그래서 /checkout·/receipt(`isInternalPath`, `.site` 밖)에서는 공개 크기를 쓰지 않는다.

**배치(C15)**

| 자리 | 변형·크기 |
|---|---|
| Hero(V3-A) | `default cta` + `line cta` |
| FinalCTA(V5-A) | `default cta` + ghost 텍스트 링크 |
| 폼 제출 | `default cta` |
| 중간 CTA 띠, Comparison 끝 | `line cta` (FinalCTA primary와 한 화면에 겹치지 않게) |
| 헤더 | '도입 문의' `default md`, '쇼룸 예약' `ghost md` |

- primary는 화면 구획당 1개다. 카드 안 반복 CTA는 ghost나 본문 링크로 쓴다.
- 라벨은 줄바꿈하지 않고 14자 이하로 쓴다.

**코드** — 어드민 문자열은 그대로 두고, 공개 외형은 새 키와 compoundVariants로만 얹는다.

```tsx
// components/ui/button.tsx
const PUBLIC = ["md", "cta", "icon-md"] as const

const buttonVariants = cva(
  // base: 현행 문자열 그대로다. 한 글자도 바꾸지 않는다(C17 원칙, icons '기본 문자열의 [&_svg]:size-4는 그대로 둔다').
  // C15의 'text-[15px] → text-ui'는 공개 크기 키(md의 text-ui)가 twMerge로 base의 text-[15px]를 대체하는 방식으로 지킨다.
  // transition-all·duration-150·ring·hex는 공개 compound가 덮어 효과가 없다. 소스에 남는 리터럴은 가드 허용 목록으로 처리한다(아래 '어드민 문자열과 가드')
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-[15px] font-semibold transition-all duration-150 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 " +
  "disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /* 현행 그대로: */ default: "…", secondary: "…", outline: "…", ghost: "…", destructive: "…", link: "…",
        "green-surface": "…", // CheckoutSuccessClient 이관 뒤 삭제
        line: "rounded-md border border-line-control bg-transparent text-fg-ink hover:border-fg-ink active:scale-[0.97]",
      },
      size: {
        /* 현행 그대로: */ default: "…", sm: "…", lg: "…", icon: "…", "icon-sm": "…",
        xl: "h-12 px-8 text-base",            // 공개 8곳 이관 뒤 삭제
        md: "min-h-11 px-5 text-ui",
        cta: "min-h-13 px-6 text-body",
        "icon-md": "size-11 rounded-md [&_svg]:size-5",   // base의 [&_svg]:size-4를 twMerge가 대체한다(같은 변형·같은 그룹)
      },
    },
    compoundVariants: [
      // 공개 크기 공통: 전이 속성 한정, 링 제거(포커스는 .site 보증 ①), reduced에서 눌림 0
      { size: [...PUBLIC], className:
          "transition-[color,background-color,border-color,text-decoration-color,scale] duration-(--motion-fast) ease-soft " +
          "focus-visible:ring-0 focus-visible:ring-offset-0 motion-reduce:active:scale-100 aria-busy:cursor-progress" },
      // 공개 primary: 토큰 채움, 그림자 0, 투명 1px 테두리
      { variant: "default", size: [...PUBLIC], className:
          "rounded-md border border-transparent bg-fg-accent text-fg-on-accent shadow-none hover:bg-fg-accent-hover" },
      // ghost = 텍스트 링크(X03). link-body와 같은 값이지만, 어드민 ghost 문자열과 겹치는 값을 twMerge가 풀도록 Tailwind 유틸로 쓴다
      { variant: "ghost", size: ["md", "cta"], className:
          "min-h-11 rounded-none px-0 text-ui font-semibold text-fg-accent underline decoration-line-link decoration-1 underline-offset-[0.22em] " +
          "hover:text-fg-accent-hover hover:decoration-current focus-visible:text-fg-accent-hover focus-visible:decoration-current" },
      // ghost = 맨 아이콘 버튼(헤더 토글은 호출부에서 text-fg-ink)
      { variant: "ghost", size: "icon-md", className: "text-fg-muted no-underline hover:no-underline hover:text-fg-ink" },
    ],
    defaultVariants: { variant: "default", size: "default" },
  },
)
```

- **compound가 이기는 이유**: cva는 base → variant → size → compound → className 순으로 붙이고, `cn()`의 twMerge가 같은 그룹에서 뒤의 값만 남긴다. 그래서 공개 크기에서는 `bg-[#084734]`·`text-white`·`shadow-sm`·`rounded-[6px]`·`transition-all`·`ring-2`가 지워진다.
- **남는 `focus-visible:outline-none`**: `.site` 안에서는 레이어 밖의 보증 ①이 이긴다.
- **ghost + cta**: compound의 `text-ui`가 size `cta`의 `text-body`를 대체한다. 그래서 ghost는 크기와 상관없이 15/600이다(X03, C18).
- **어드민 문자열과 가드**: base와 어드민 변형에는 `text-[15px]`·`transition-all`·`duration-150`·hex·`shadow-sm`·`focus-visible:ring`이 남는다. 공개 크기에서는 `md`·`cta` 키가 `text-[15px]`를, compound가 나머지를 덮어 효과가 없다(`icon-md`는 글자가 없어 `text-[15px]`가 남아도 화면 영향이 없다). 그래도 소스에는 남으므로, 가드 허용 목록에 `components/ui/button.tsx`를 명시한다: controls `effects`·`focus-ring`, system `text-px`·`shadow`·`hex-literal`·`duration-literal`(system에 요청). input·textarea·tabs·dialog·toast의 어드민 문자열도 같은 방식이다. compound의 `shadow-none`은 system `shadow` 규칙이 제외한다.

**제출 중 패턴**
- `disabled`를 걸지 않는다. disabled가 되면 포커스를 잃어 스크린리더 사용자가 위치를 놓친다.
- `aria-disabled`도 함께 걸지 않는다. `aria-busy`만 건다.
- 중복 제출은 ref 가드가 막는다. 가드는 `e.preventDefault()` 다음 줄에 둔다. 가드가 앞에 있으면 두 번째 탭이 네이티브 submit을 일으켜 페이지가 새로 고침된다.

```tsx
const submittingRef = useRef(false)
async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault()
  if (submittingRef.current) return
  const firstInvalid = validateAll()            // 오류 상태를 세팅하고 첫 오류 요소를 돌려준다
  if (firstInvalid) return focusField(firstInvalid)
  submittingRef.current = true; setLoading(true)
  try { await send() } finally { submittingRef.current = false; setLoading(false) }
}
// …
<Button type="submit" size="cta" className="w-full sm:w-auto" aria-busy={loading || undefined}>
  {loading ? <><LoaderCircle className="animate-spin" aria-hidden />보내는 중…</>
           : <>상담 요청 보내기<ArrowRight className="arrow-nudge" aria-hidden /></>}
</Button>
```

- **링크를 CTA 모양으로 쓸 때**: `<Button asChild size="cta"><TrackedLink href ctaId>…</TrackedLink></Button>`. 계측용 `ctaId`는 그대로 둔다.
- **먹 지면(C14)**: `.surface-ink` 안에 primary를 두지 않는다(가드). 먹 위 유일한 컨트롤은 푸터 뉴스레터 '구독' `line md`다: 1px `--line-control`(먹 /.40, 3.70), 글자 `--fg-ink`(#FAFAF8, 18.08), hover 경계 `--fg-ink`.

### 3.2 화살표 마이크로 인터랙션

- 뒤쪽 `ArrowRight` 16 하나만 둔다. 외부 링크는 `ArrowUpRight`다. 앞쪽 아이콘은 움직이지 않는다.
- 움직일 화살표에만 `arrow-nudge`를 단다(옵트인). 조상 `a`·`button`·`summary`가 hover(hover 기기)이거나 focus-visible이면 2px, 160ms. reduced에서는 none이다.
- 쓰는 곳: primary·line CTA, ghost 텍스트 링크, 링크 카드·TocRow(C13, cards_motion 소관), FAQ 행 쉐브론(C13, §3.8). 아이콘만 있는 버튼과 비활성 버튼에는 달지 않는다.
- 텍스트 '→' 6곳은 아이콘으로 바꾼다. `group-hover:translate-x-1`(4px, `app/product/sw/page.tsx:593` 등)은 지우고 `arrow-nudge`로 바꾼다.

### 3.3 링크

| 종류 | 평소 | hover·focus-visible | 비고 |
|---|---|---|---|
| 본문 링크 | `link-body`: `--fg-accent`, 1px 밑줄 `--line-link`(.6), offset .22em | 밑줄 currentColor, 색 `--fg-accent-hover` | `p·li·dd·td·figcaption·blockquote > a:not([class])`에는 base 규칙으로 자동 적용된다. 클래스가 있는 본문 `<Link>`는 `link-body`를 직접 쓴다(가드) |
| 내비 링크 | 밑줄 없음 | `index-tab` 막대(§3.6) | `aria-current` 규칙은 §3.6 |
| 푸터·보조 내비·Breadcrumb | `link-quiet`, 색은 `text-fg-body`(푸터) 또는 `text-fg-muted` | 밑줄 currentColor, 색 `--fg-ink` | 행은 `inline-flex min-h-11 items-center`(모든 폭에서 히트 44, gap_triage 푸터 행·system §1) |
| 새 창 | 위와 같음 + `ArrowUpRight` 16 | — | `<span class="sr-only">(새 창)</span>` |

- 본문 링크와 본문 글자의 색 대비는 1.23뿐이다. 그래서 링크를 구분하는 것은 늘 보이는 밑줄이다(WCAG 1.4.1).
- 밑줄은 1px이다. 본문에서 1.5px를 쓰면 링크가 제목처럼 무거워진다.
- 카드 제목에는 밑줄을 쓰지 않는다(C13). 링크 카드의 hover는 경계와 화살표만 바뀐다(cards_motion).

### 3.4 칩·태그·배지·상태

**필터 칩**은 공개 화면에서 유일하게 허용하는 상호작용 pill이다. 여러 조건을 켜고 끄거나 질문에 답할 때 쓴다(예: /pricing 선택 가이드 3문항, 감사 §5-5-3; docs 검색 조건).

```tsx
// components/ui/filter-chip.tsx — rounded-full이 여기에만 있으므로 가드의 둥근 모서리 허용 목록은 이 파일이다
export function FilterChip({ pressed, className, children, ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { pressed: boolean }) {
  return (
    <button type="button" aria-pressed={pressed} {...props}
      className={cn(
        "group hit-area inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line-control px-3.5 " +
        "text-ui font-medium text-fg-body transition-[color,border-color] duration-(--motion-fast) ease-soft " +
        "hover:border-fg-ink aria-pressed:border-fg-accent aria-pressed:text-fg-accent", className)}>
      <span aria-hidden className="hidden size-1.5 rounded-full bg-current group-aria-pressed:block" />
      {children}
    </button>
  )
}
// 묶음: <div role="group" aria-label="학원 규모" className="flex flex-wrap gap-2">…</div>
```

| 항목 | 값 |
|---|---|
| 높이 / 히트 | 36 / 44 (`hit-area`) |
| 반경 | 9999 |
| 테두리 | 1px `--line-control`(3.42), hover `--fg-ink` |
| 글자 | `text-ui` 500 `--fg-body`(C18: 15px는 컨트롤 전용) |
| 선택 | 1px `--fg-accent` 테두리 + `--fg-accent` 글자 + 앞에 6px ●. 채움 없음, `aria-pressed` |
| 줄 | 줄바꿈, gap 8. 가로 스크롤 금지 |

**칩을 쓰지 않는 곳**
- **하나만 고르는 범주 전환**(블로그·행사·문서): 칩이 아니라 `index-tab` + `aria-pressed`다.
- **비상호작용 태그**: pill 없이 글자로 쓴다. 범주는 `text-label`(X15), 나열 메타는 `text-note font-medium text-fg-muted`를 ' · '로 잇는다(구분자는 `aria-hidden`).
- **상태**: 모양 점 `status-dot`(icons 소유: ● 켜짐 / ○ 대기·기존 / – 해당 없음)과 글자를 함께 쓴다. ○●–는 상태 전용이고 라벨에 쓰지 않는다(C05·X11).
- **배지**: 공개 화면에서 0개다. `components/ui/badge.tsx`는 어드민 전용이고, 공개 import는 가드가 막는다. Hero 배지는 Kicker로 바꾼다(V9-A, typography 소유).
- **범주 개수**(블로그): `index-tab` 안에서 `text-folio tabular-nums`로 쓴다. 색은 탭 색을 상속한다(비활성 muted, 활성 ink). `#A39E98`은 쓰지 않는다.

### 3.5 폼 (입력 모양 V8-A: 박스형)

**정본**
- 입력 프리미티브: `components/ui/input.tsx`·`textarea.tsx`의 `variant="site"`
- 공개 폼 키트: `components/ui/marketing-form.tsx`
- 폼 바탕: cards의 `Card family="plain"`(r12, sheet, hair, 그림자 0). `marketingSurfaceClassName`(r28, 냉색 그림자)은 지운다.

**필드 클래스는 병합하지 않고 분기로 대체한다.** legacy 문자열에는 그림자, 20% 링, `disabled:opacity-50`이 있다. twMerge는 짝이 없는 클래스를 지우지 않으므로 병합하면 이것들이 남는다.

```ts
// components/ui/input.tsx — export. 어드민이 쓰는 legacy 분기 문자열은 한 글자도 바꾸지 않는다
const fieldBase =
  "block w-full rounded-md border border-line-control bg-surface-sheet px-3.5 text-fg-ink placeholder:text-fg-placeholder " +
  "transition-[border-color] duration-(--motion-fast) ease-soft hover:border-fg-ink focus-visible:border-fg-accent " +
  "aria-invalid:border-fg-danger aria-invalid:duration-(--motion-slow) " +
  "disabled:cursor-not-allowed disabled:border-line-hair disabled:text-fg-muted read-only:border-line-strong"
export const siteFieldClassName    = fieldBase + " min-h-11 py-2 pointer-coarse:min-h-12"
export const siteTextareaClassName = fieldBase + " min-h-30 py-3 text-body resize-y"   // 높이 유틸을 섞지 않는다
export const siteSelectClassName   = siteFieldClassName + " select-chevron pr-10"

// <input className={cn(variant === "site" ? siteFieldClassName : legacyInputClassName, className)} />
// marketing-form.tsx: export { siteFieldClassName as marketingFieldClassName, siteSelectClassName as marketingSelectClassName }
```

- **글자 크기 클래스를 두지 않는다**: 보증 ②가 16px를 보장한다. textarea만 행간 때문에 `text-body`(16/1.75)를 준다.
- **오류 테두리 페이드**: `--motion-slow` 700ms다. 감사 §5-5-7의 '600ms'는 토큰 값으로 맞춘다.

| 항목 | 데스크톱·포인터 | 터치 기기 (`pointer:coarse`) |
|---|---|---|
| 높이 | 44 | 48 |
| 글자 | 16px | 16px |
| 좌우 패딩 | 14 | 14 |
| 간격 | 라벨→필드 8, 필드→도움말·오류 6, 묶음 사이 20 | 묶음 사이 16 |
| 배치 | 짧은 필드 쌍은 `sm:grid-cols-2 gap-5` | 1열 |

**필드 세부 규칙**
- **바탕** `bg-surface-sheet`
  - 밝은 지면: 흰색이다. 플레이스홀더 #78736D가 4.70이다.
  - 먹 지면: #111110이라 투명하게 보인다(C01). 글자 #FAFAF8 18.08, 플레이스홀더 /.56 6.14, 테두리 /.40 3.70, hover 테두리 #FAFAF8.
- **hover**: 테두리 `--fg-ink`(C23).
- **focus**: 테두리 `--fg-accent` + 보증 ① 2px outline(offset 2px). 20% 링, 3px 글로우, hover 그림자는 지운다.
- **자동완성**: 보증 ③이 덮는다.
- **select**: 네이티브 `<select>`로 iOS 피커를 지킨다. 화살표는 `select-chevron`이 그린다.
- **단위 접미**('명', '대'): 필드 안 오른쪽 14px(`text-caption`) `--fg-muted`, `pointer-events:none`. 필드는 `pr-10`이다.

**라벨·도움말·오류·상태줄** (`marketing-form.tsx` 개정)

| 요소 | 스펙 |
|---|---|
| 필수 안내 | 폼 맨 위 한 줄 "(선택) 표시가 없는 항목은 꼭 적어 주세요." `text-caption text-fg-muted` |
| `FormLabel` | `block mb-2 text-caption font-semibold text-fg-ink`(14/600). 선택 항목만 `<span class="ml-1 font-normal text-fg-muted">(선택)</span>`. 필수 항목에는 `required` 속성을 두고 별표는 쓰지 않는다 |
| `FormHint` | `mt-1.5 text-caption text-fg-muted`. id를 두고 `aria-describedby`로 잇는다 |
| `FormMessage tone="error"` | `mt-1.5 flex items-start gap-1.5 text-caption font-medium text-fg-danger` + `<CircleAlert className="mt-[3px] size-4 shrink-0" aria-hidden />`. 필드 오류에는 role을 두지 않는다 |
| `FormMessage tone="success"` | `text-fg-accent`(`#0E7A49` 폐기) |
| 폼 상태줄 | 제출 버튼 바로 아래 `<p id="{form}-status" role="alert" className="mt-3 min-h-6 text-caption font-medium text-fg-danger">`. 서버·네트워크 오류는 여기에만 쓴다. 한 줄을 미리 잡아 두어 늦게 오는 응답이 레이아웃을 밀지 않는다 |
| 연결 | `aria-describedby="{hint-id} {error-id}"`. 도움말은 남기고 그 아래에 오류를 더한다 |

**검증 흐름**
1. 제출할 때 전체를 검증한다. 첫 제출 뒤부터는 blur에서도 다시 검증한다. 입력 중에는 오류를 띄우지 않는다. 예외로 전화번호 문자 거부(`rejectPhoneInput`)는 지금처럼 즉시 동작한다.
2. 실패하면 첫 오류 필드로 간다: `el.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" }); el.focus({ preventScroll: true })`. 기본 `focus()`도 스크롤하므로 `preventScroll`로 이중 스크롤을 막는다.
3. 서버가 특정 필드 오류(예: 이메일 중복)를 돌려주면 그 필드에 `aria-invalid`를 걸고, 상태줄에 문구를 쓴 뒤 2와 같이 이동한다.
4. 흔들기(`animate-shake`)는 공개 화면에서 지운다. 키프레임은 `app/admin/login`이 쓰므로 남긴다.
5. 성공하면 폼을 성공 패널로 바꾸고, 그 제목(`tabIndex={-1}`)으로 포커스를 옮긴다.

**체크박스·라디오**
- 네이티브 input을 쓴다. 20px와 `accent-color`는 site-base base 규칙이 준다(css_architecture (a), C01). 먹 위에서는 `color-scheme: dark`(C01)라 미체크 테두리도 보인다.
- **C23과의 관계**: C23은 체크박스 경계에 `--line-control`을 요구한다. 네이티브 미체크 테두리는 UA가 그려 토큰으로 칠할 수 없다. 그래서 기본안은 C23을 실측으로 확인하고, 미달이면 대체 레시피(`--line-control` 1.5px)로 C23을 채운다. 정본 안의 이 긴장(css_architecture의 accent-color vs C23)은 열린 질문 6에 적었다.
- 행: `flex min-h-11 items-start gap-3 py-2.5`. 라벨은 `text-body` `--fg-body`, 설명은 `text-caption text-fg-muted`.
- 박스 래퍼, 채움, 18~20px 반경은 쓰지 않는다. `FormCheckbox`의 `#F7FAF7` 채움과 r20을 지운다.
- 라디오 묶음은 `fieldset` + `legend`(`text-caption font-semibold`)로 감싼다.
- **대체 레시피**: 실기기에서 체크 표시가 읽히지 않거나, 미체크 테두리의 바탕 대비가 3:1 미만일 때(C23) 아래를 쓴다.

```css
/* 대체 레시피 — site-base components. 조건이 생길 때만 넣는다 */
:where(.site) input[type="checkbox"]:not([role="switch"]) {
  appearance: none; border: 1.5px solid var(--line-control); border-radius: 4px;
  background: var(--surface-sheet) center / 14px no-repeat;
}
:where(.site) input[type="checkbox"]:not([role="switch"]):checked {
  border-color: var(--fg-accent); background-color: var(--fg-accent);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23FAFAF8' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E");
}
@media (forced-colors: active) { :where(.site) input[type="checkbox"] { appearance: auto; } }
```

**스위치** — 쿠키 상세 설정처럼 즉시 반영되는 on/off에만 쓴다. CSS는 §토큰 5(b)에 있다.

```tsx
<label className="flex min-h-11 items-center justify-between gap-4 border-b border-line-hair py-2">
  <span className="text-ui text-fg-body">분석 쿠키
    <span className="block text-note text-fg-muted">{/* 문구는 ConsentBanner 현행 desc 그대로 */}</span>
  </span>
  <input type="checkbox" role="switch" checked={on} onChange={…} />
</label>
```

| 상태 | 트랙 | 썸 |
|---|---|---|
| 꺼짐 | 40×24, `--surface-sheet` 바탕, 1.5px `--line-control` | 15px `--line-control`, 왼쪽 |
| 켜짐 | 테두리 `--fg-accent` | `--fg-accent`, 오른쪽(16px 이동). 채움 없음 |
| 잠김(필수 쿠키) | checked + disabled(opacity .4) | 오른쪽에 "항상 켜져 있어요" `text-note text-fg-muted` |
| 강제 색 모드 | 테두리는 시스템 색 | `forced-color-adjust:none`, 꺼짐 `CanvasText`, 켜짐 `Highlight` |

썸의 위치와 색이 함께 바뀌므로 색에만 기대지 않는다. 히트 영역은 label 행 전체(44)다.

**슬라이더** (`components/ui/slider.tsx`)
- 공개 전용이다. 사용처는 `components/sections/PricingCalculator.tsx` 하나이고 어드민 사용이 0이므로 기본값을 직접 바꾼다.
- 트랙 4px `bg-line-control`(3.42), 범위 `bg-fg-accent`.
- 썸 24px, `bg-surface-sheet`, 2px `border-fg-accent`, `hit-area`.
- 값은 라벨 옆에 `tabular-nums`로 보인다.

**진행 레일(Stepper)** — 쇼룸 01~04
- `<ol>`, 폴리오는 `text-folio tabular-nums`, 라벨은 `text-caption font-semibold`.
- 단계 표시:
  - 현재: `--fg-accent` + `aria-current="step"`
  - 완료: `--fg-ink` + Check 16
  - 예정: `--fg-muted`
- 레일 선은 전 구간 1px hair 하나이고, 현재 단계에서도 굵기·색을 바꾸지 않는다. 현재 표시는 항목의 `--fg-accent` 글자와 `aria-current="step"`뿐이다(gap_triage 'Stepper: 현재 항목만 --fg-accent'). 2px 액센트 구간은 C21의 2px 바 3곳 밖이라 쓰지 않는다. 이 레일이 페이지의 번호 체계 1종이다(C24).

**소셜 로그인**(`components/auth/SocialLoginRow.tsx`) — 외부 브랜드 예외
- **강제하는 것**: 높이 44 통일 하나뿐이다(gap_triage). 현행 48 원형도 44로 맞춘다. 글리프 크기와 색은 강제하지 않고, 플랫폼별 공식 허용 변형을 확인해 표로 고정한다(icons §14와 함께).
- **바꾸는 것**
  - hover 들림(`hover:-translate-y-0.5`)을 지운다.
  - 라벨 11px와 구분선 문구 12px `#A39E98`을 `text-note text-fg-muted`로 올린다.
  - 오류 `#B85C33`은 `FormMessage tone="error"`로 바꾼다.
- **각 플랫폼의 색·글리프·모양**: 공식 허용 변형을 확인해 DESIGN.md '외부 브랜드 예외' 표로 고정한다. 그 전까지는 현행 공식 색(Naver #03C75A, Kakao #FEE500 등)을 유지한다.
- **가드 hex 허용 목록**: `SocialLoginRow.tsx`·`brand-glyphs.tsx`뿐이다.

### 3.6 내비

**스킵 링크·랜드마크** (`components/AppChrome.tsx`)
- 공개 분기는 `<div className="site contents">` 하나로 감싼다(C17 ①, SSR).
  - C17 ① 정본 문구가 감싸는 것: Header·`<main>`·Footer.
  - **정본 편차(정정 요청, 열린 질문 5)**: 같은 분기에서 AppChrome가 렌더하는 공개 위젯(ConsentBanner·FloatingChatbot·MobileFloatingCTA)도 같은 래퍼 안에 둔다. system 최종판(AppChrome 코드 주석)과 같은 범위다. 표지를 붙이는 곳은 여전히 C17의 세 곳이고 래퍼가 하나 더 생기지는 않는다. 위젯은 포털이 아니라서 래퍼 밖에 두면 보증 ①②가 닿지 않는다: 쿠키 배너 버튼의 포커스, 챗봇 입력의 iOS 확대 방지. 정정이 거절되면 위젯은 래퍼 밖에 두고, 이 두 항목은 수용 기준에서 빼고 chatbot·consent 후속 항목으로 넘긴다.
  - 판정은 `lib/internal-path.ts`로 옮긴 `isInternalPath`(/admin, /checkout, /receipt)다.
- 래퍼의 첫 자식은 스킵 링크다:

```tsx
<a href="#main" className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-(--z-skiplink) focus-visible:inline-flex focus-visible:min-h-11 focus-visible:items-center focus-visible:rounded-md focus-visible:bg-surface-sheet focus-visible:px-5 focus-visible:text-ui focus-visible:font-semibold focus-visible:text-fg-ink">본문 바로가기</a>
```

  채움 없이 sheet 바탕에 보증 ① outline이 경계를 맡는다.
- `<main id="main" tabIndex={-1}>`은 AppChrome에 하나만 둔다. 안쪽 `<main>` 15곳(+CheckoutClient)은 `<div>`나 `<section>`으로 바꾸고 클래스는 그대로 둔다. 가드는 AppChrome 밖의 `<main`을 막는다.
- **포커스 가림 방지**(WCAG 2.4.11): system의 `scroll-padding-top: header + 16px`(모바일 제품 탭 +44px) 덕분에 Tab 이동, 스킵 링크 착지, 첫 오류 포커스가 고정 헤더 아래로 들어가지 않는다.

**헤더** (`components/sections/Header.tsx`. 면 값은 surfaces §3-8)
- **루트**: `<header className="fixed inset-x-0 top-0 z-(--z-header) h-(--header-h) bg-surface-paper">`. 높이 고정(76/80), 불투명, 그림자·블러 0이다. 현행 `py-6→py-4` 전환(레이아웃 전이)과 `shadow-[0_8px_24px…]`을 지운다.
- **스크롤 상태**(C27)
  - 하단 1px `--line-hair`의 opacity만 0→1로 바꾼다. `--motion-base` 320ms `--ease-soft`.
  - 스크롤 감지는 상단 1px 센티넬의 IntersectionObserver가 `data-scrolled`를 단다. scroll 리스너는 지운다.
  - 400ms 리터럴은 쓰지 않는다.
- **내비**: `<nav aria-label="주 메뉴">`(감사 §2-2).
- **활성 판정**
  - `pathname === href`일 때만 `aria-current="page"`다.
  - 하위 경로의 부모(/product/sw에서 '제품 소개')는 `aria-current="true"`다.
  - `index-tab`이 두 값을 모두 막대로 그린다. 그래서 헤더 안 `page`는 늘 1개다.
- **데스크톱 내비 링크**: `index-tab`. 15/500, 비활성 `--fg-muted`, 활성 `--fg-ink` + 2px 막대. hover는 색만 바뀐다. 활성을 색(#084734)만으로 표시하던 현행 방식과 민트 채움은 지운다.
- **제품 드롭다운**
  - 패널: `bg-surface-sheet border border-line-hair rounded-lg shadow-deep p-1.5`(r8, X05: 떠 있는 레이어). 헤더 안 로컬 `z-10`. X09의 'z-[N]·z-50 금지'는 페이지 수준 레이어 대상이다. system 가드 `z-literal`(`\bz-(\[\d+\]|30|40|50)\b`)은 컴포넌트 안 로컬 겹침용 `z-0/10/20`을 허용한다고 적었다(system 정본 편차 §13-7). 헤더 자체가 `z-(--z-header)` 쌓임 맥락이므로 그 안의 `z-10`은 페이지 스택과 겨루지 않는다.
  - 항목: `min-h-11`, `text-ui font-medium text-fg-body`, 아이콘 16(ClassinSoftware·ClassinBoard).
  - 활성 항목: `--fg-ink` + 글자 아래 2px 밑줄(`underline decoration-2 decoration-fg-accent underline-offset-[0.4em]`). 좌측 막대는 쓰지 않는다.
  - 열림: hover 또는 focus-within일 때 opacity 160ms만 바뀐다. 이동은 없다.
  - 한계: 터치 전용 ≥768px(iPad)에서는 hover가 없고, iOS는 링크를 탭해도 focus를 주지 않는다. 그래서 '제품 소개'를 탭하면 /product로 바로 간다. /product 허브에 두 제품 링크가 늘 있어 기능 손실은 없다(수용 기준).
  - 현행 `rounded-2xl`, `rounded-xl` 항목, `bg-[#ECFDF5] shadow-sm` 활성은 지운다.
- **오른쪽 영역**(데스크톱)
  - SessionNavEntry: 세션을 확인하기 전에도 같은 폭의 자리를 렌더한다(같은 글자를 `invisible`로). 로그인 링크가 늦게 끼어들며 약 90px 밀리던 문제(감사 §2-2)가 없어진다.
  - '쇼룸 예약': `Button variant="ghost" size="md"`(텍스트 링크, X03)
  - '다운로드': `link-quiet text-ui font-medium text-fg-body`, `min-h-11 inline-flex items-center`
  - '도입 문의': `Button size="md"`. 현행 수작업 클래스, `shadow-sm`, `active:scale`은 정본으로 흡수한다.
- **모바일 메뉴 토글**: `Button variant="ghost" size="icon-md" className="text-fg-ink [&_svg]:size-6"` 안에 `<Icon icon={Menu} size={24} />`, `aria-expanded`, `aria-controls`. 24는 호출부 `[&_svg]:size-6`이 정한다(icons: Button 안 아이콘 크기는 Button이 정하고, `<Icon size>`는 같은 값으로 적는다). raw `<Menu size={24}>`는 쓰지 않는다. hover 채움은 지운다.

**모바일 메뉴 패널**
- **형태**: `bg-surface-paper`, 하단 hair, `shadow-deep`, `max-h-[calc(100svh-var(--header-h))] overflow-y-auto`. 패널 아래는 `bg-surface-scrim` 백드롭이다(블러 없음).
- **진입**: `@starting-style`로 opacity만 바뀐다(160ms). Safari 17.5 미만은 애니메이션 없이 바로 보인다(정상 폴백). 감사 §5-5-5의 '4px 페이드'는 opacity만으로 맞춘다.
- **행**: `flex min-h-12 items-center px-4 text-body font-medium text-fg-ink`, 행 사이 hair.
  - 활성: `aria-[current]:underline aria-[current]:decoration-2 aria-[current]:decoration-fg-accent aria-[current]:underline-offset-[0.4em]`. 드롭다운과 같은 밑줄 어휘이고, 좌측 막대는 쓰지 않는다.
  - 제품 하위 2항목은 들여쓴 행(`pl-8 text-ui`)이다. 현행 민트 pill은 지운다.
- **하단 CTA 3개**(세로, gap 8)
  - '도입 문의': `Button size="cta"` w-full
  - '쇼룸 예약': `Button variant="line" size="cta"` w-full
  - '다운로드': `Button variant="ghost" size="md"`
  - 현행 민트 채움 쇼룸 버튼(`bg-[#ECFDF5] hover:bg-[#D1FAE5]`)은 지운다.
- **열림 동작**(Header effect, 새 JS 1KB 미만 예산 안)

```ts
useEffect(() => {
  if (!open) return
  const targets = [document.getElementById("main"), ...document.querySelectorAll("[data-inert-with-menu]")]
  targets.forEach((el) => el?.setAttribute("inert", ""))
  const close = () => setOpen(false)
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close() }
  const wide = matchMedia("(width >= 48rem)")              // 열린 채 넓히면 닫는다(감사 §2-2)
  document.addEventListener("keydown", onKey); wide.addEventListener("change", close)
  document.documentElement.style.overflow = "hidden"        // 스크롤 잠금
  return () => {                                            // 닫힘·언마운트 모두 반드시 되돌린다
    targets.forEach((el) => el?.removeAttribute("inert"))
    document.removeEventListener("keydown", onKey); wide.removeEventListener("change", close)
    document.documentElement.style.overflow = ""
    toggleRef.current?.focus()
  }
}, [open])
```

- **`data-inert-with-menu`를 다는 곳**: Footer 루트, MobileFloatingCTA, 챗봇 런처, 쿠키 배너. 쿠키 배너·챗봇 패널과의 동시 노출 규칙은 system §2가 맡는다.

**제품 탭 내비** (`components/sections/ProductTabNav.tsx`, `md:hidden`)
- `data-subnav`, `sticky top-(--header-h) z-(--z-subnav) bg-surface-paper border-b border-line-hair`. `backdrop-blur-md`와 `top-[80px]`(모바일 헤더 76에서 4px 틈)를 지운다.
- 2칸 `grid grid-cols-2`. 각 칸은 `index-tab justify-center`이고 막대는 칸 전체 폭이다.
- 정확히 일치할 때만 `aria-current="page"`다. 민트 `rounded-full` pill과 `shadow-sm` 활성은 지운다.
- sticky가 동작하려면 감사 P0-3(`body { overflow-x: clip }`)이 먼저 들어가야 한다(system·surfaces).

**푸터** (`components/sections/Footer.tsx`. 면·글자 값은 surfaces §3-9)
- 루트: `<footer data-inert-with-menu className="surface-ink …">`. Section을 쓰지 않으므로 먹 예산에 들어가지 않는다.
- 링크: `link-quiet text-fg-body inline-flex min-h-11 items-center`. 행 히트는 모든 폭에서 44다(gap_triage 푸터 행, system §1). 색만 바뀌던 hover 대신 밑줄이 나타난다(1.4.1).
- 열 제목: `text-caption font-semibold text-fg-ink`(18.08).
- **법정 표기 블록**(gap 흡수)
  - 위치: 링크 열 아래, 1px `border-line-hair` 구분 뒤.
  - 글자: `text-note text-fg-muted`(13px, 먹 위 6.14).
  - 항목 순서: 상호 · 대표자 · 주소 · 사업자등록번호 · 통신판매업 신고번호 · 고객센터(전화·이메일) · 개인정보 보호책임자. 구분자 '·'는 `text-fg-faint aria-hidden`이다.
  - 현행 코드에는 상호·대표자·사업자등록번호·주소만 있다. 나머지 값은 운영자가 준다(열린 질문). 값을 지어내지 않는다. 값이 오기 전에는 그 항목을 빼고 렌더한다.
  - 각 행은 줄바꿈되는 목록(`<ul>`)이다. 링크가 아니므로 히트 규칙은 적용하지 않는다. '개인정보처리방침' 링크는 `link-quiet` 행(히트 44)이다.
- 저작권: `text-note text-fg-muted`. 연도는 서버 렌더 시각의 KST 연도다(`lib/format.ts`). 감사 §2-2에서 지적된 `© 2025` 고정을 없앤다.
- **뉴스레터**(`NewsletterSubscribe`, C14)
  - `variant="dark"` 분기를 지우고 토큰을 따른다.
  - 필드: `siteFieldClassName`. 먹 위에서 자동으로 #111110 바탕, #FAFAF8 글자, /.40 테두리가 된다.
  - 버튼: `Button variant="line" size="md"`
  - 오류: `FormMessage`가 `--fg-danger`(#E89A94, 8.53)로 나온다.
  - 성공 문구: 민트 박스 대신 `FormMessage tone="success"`
  - 먹 위의 다른 뉴스레터 폼(블로그 다크 패널 `BlogPageClient.tsx:346`)도 같은 규칙이다. 그 패널을 먹으로 남길지는 surfaces의 먹 예산이 정한다.
- SNS 글리프는 icons §14 소관이다. 푸터에 SNS 링크를 둘지는 열린 질문이다.

**세로 색인** (`components/blog/ArticleToc.tsx`, `components/docs/DocsSidebarLayout.tsx`)
- 현재 항목은 왼쪽 2px `--fg-accent` 바 + `--fg-ink`이고, 나머지는 `--fg-muted`다(C21 ③). 가드의 좌측 바 허용 파일이 이 둘이다.
- 목차 라벨은 12px에서 `text-note`(13)로 올린다.

**Breadcrumb**(새로 만들 때)
- `<nav aria-label="현재 위치"><ol>`, 행 `min-h-11 flex flex-wrap items-center`, `text-note text-fg-muted`.
- 구분 ' · '는 `aria-hidden`이다.
- 링크는 `link-quiet`, 현재 항목은 `aria-current="page"` `--fg-ink`(링크 아님).

**Pagination**(새로 만들 때)
- `<nav aria-label="페이지">`. 번호는 `index-tab min-w-11 justify-center tabular-nums`이고 현재 번호에 `aria-current="page"`를 단다(2px 막대).
- 이전·다음은 `Button variant="line" size="icon-md"` + ChevronLeft/Right 20 + `aria-label`이다.
- 번호 목록이 페이지의 번호 체계에 들지는 않는다(탐색 장치).

### 3.7 탭 (`components/ui/tabs.tsx`)

공개는 `variant="site"` 분기를 쓴다. 기본 분기 문자열은 그대로 두므로 어드민 EventEditor·PartnerWorkspaceShell은 변화 0이다.

| 부분 | `variant="site"` 클래스 |
|---|---|
| `TabsList` | `flex w-full items-end gap-6 border-b border-line-hair` (회색 pill 바탕 없음) |
| `TabsTrigger` | `index-tab -mb-px` (막대·색·굵기·hover·forced-colors는 유틸이 맡는다) |
| `TabsContent` | `mt-8 data-[state=inactive]:hidden`. 이 분기에서는 `forceMount`를 켠다 |

- **모든 패널을 SSR한다**(C07). Radix는 forceMount일 때 `hidden`을 걸지 않으므로 `data-[state=inactive]:hidden`이 필요하다.
- **패널 전환 opacity 320ms**: cards_motion이 site-base no-preference 블록에 둔 `[data-switched] [role="tabpanel"][data-state="active"]` 규칙이 맡는다. 첫 페인트에는 애니메이션이 없다. 소비처는 `onValueChange`에서 Root에 `data-switched`를 단다(SolutionOverview와 같은 방식).
- **자동 진행은 없다**(C07). 진행 괘선도, 예외 괘선도 없다.
- **4개 이상인 탭**(KeyUseCases)
  - `< 40rem`: `grid grid-cols-2`, 각 칸 `min-h-12 justify-center`, 칸마다 하단 hair.
  - `sm:`: `grid-cols-4`.
  - 가로 스크롤은 쓰지 않는다. 숨은 탭을 40~50대 원장이 찾지 못한다.
- **하나만 고르는 범주 필터**(블로그·행사·문서): Radix 탭이 아니라 `<button aria-pressed>` + `index-tab`이다.
- **SolutionOverview**는 Radix primitive를 직접 쓰고 `index-tab`을 붙인다(cards_motion §코드). 시각 규칙은 같다.

### 3.8 FAQ (목차 행 + 네이티브 `details`)

목차 행 문법을 FAQ에도 쓴다. hover·focus-within 문법은 링크 카드·TocRow와 같다(C13): 위 테두리가 hair에서 strong으로 한 단계 진해지고, 쉐브론이 `arrow-nudge`로 translateX 2px 움직인다. 160ms `--ease-soft`. 제목 색, 밑줄, 먹선, 배경은 바뀌지 않는다. 열린 상태에 테두리를 따로 주지 않는다(C13에 없는 규칙이라 `open:` 테두리는 두지 않는다). 열림 표시는 쉐브론 회전이 맡는다.

```tsx
<details name={`faq-${category.key}`}
  className="group border-t border-line-hair transition-colors duration-(--motion-fast) ease-soft last:border-b hover:border-t-line-strong focus-within:border-t-line-strong">
  <summary className="cursor-pointer list-none py-5 [&::-webkit-details-marker]:hidden">
    <h4 className="grid min-h-11 grid-cols-[40px_1fr_auto] items-start gap-x-4 sm:grid-cols-[56px_1fr_auto]">
      <span aria-hidden className="pt-1 text-folio tabular-nums text-fg-muted">{String(i + 1).padStart(2, "0")}</span>
      <span className="text-h3 text-fg-ink">{faq.question}</span>
      {/* 이동(arrow-nudge, translate)과 회전(rotate)은 전이가 겹치지 않게 요소를 나눈다 */}
      <span aria-hidden className="arrow-nudge mt-1 inline-flex">
        <ChevronDown className="size-5 text-fg-muted transition-[rotate] duration-(--motion-fast) ease-soft group-open:rotate-180" />
      </span>
    </h4>
  </summary>
  <div className="max-w-measure pb-6 pl-14 text-body text-fg-body sm:pl-18 animate-fade-in">…</div>
</details>
```

- **헤딩 의미**: 질문을 `<summary>` 안의 `<h4>`로 감싼다. 카테고리 제목이 `<h3>`이므로 Radix Accordion Header가 만들던 헤딩 탐색이 남는다. grid는 Safari 구버전을 위해 summary가 아니라 h4에 준다.
- **폴리오** '01'은 `text-folio`, `aria-hidden`이다. FAQ 페이지의 번호 체계 1종이다(C24).
- **ChevronDown 회전**은 open 상태 표시다. reduced에서는 전역 블록 때문에 바로 끝 상태가 된다.
- **하나만 열림**: `name` 속성으로 한다. Safari 17.2+, Chrome 120+, Firefox 130+에서 동작하고, 오래된 브라우저에서는 여러 개가 열릴 뿐 해가 없다.
- **SSR**: 높이 애니메이션이 없다. 탭 forceMount(§3.7)와 합쳐 세 카테고리의 모든 답변이 SSR HTML에 들어간다.
- **정리**: `components/ui/accordion.tsx`와 `--animate-accordion-*`를 지운다. 사용처는 FAQ 1곳이다.

### 3.9 표 (지면 표)

클래스는 `table-paper`다(§토큰 5(b)).

| 부분 | 스펙 |
|---|---|
| 표 위 | 1px `--line-ink` |
| 머리 | `text-label`(13/600) `--fg-ink`, 아래 `--line-strong` |
| 행 | hair, 패딩 16×20, 글자 `text-body`. `< 40rem`에서 12, `text-caption` |
| 채움 | zebra·채움·그림자 0 |
| 숫자 | 표 전체 `tabular-nums`. 숫자 셀은 `text-end`(`.num` 클래스는 없다, X14) |
| 캡션 | `<caption>` `text-note font-medium text-fg-muted`, 표 위. '표 n ·' 번호는 도판·표가 3개 이상인 장문 페이지에만 붙인다(C05·C24). 홈은 번호 0이고, 제목이 이미 있으면 `sr-only` 캡션을 쓴다 |
| 범위 | `th scope` |
| 그룹 머리 | `text-label` `--fg-accent` + 위 hair |
| 추천 열 | `data-recommended`. 머리에 `<span class="text-label text-fg-accent">추천</span>`, 셀은 600 `--fg-ink`. 바·채움 없음(C21) |
| 장부 합계 | `tfoot`, 위 1px 먹 + 아래 3px double(숫자 열이 있을 때만, X04) |

- **Comparison**(`components/sections/Comparison.tsx`)
  - `<table class="table-paper table-paper--stack">`로 바꾸고 role을 명시한다.
  - `< 40rem`에서는 각 행을 '영역 → 기존 | Classin'으로 쌓는다.
  - Classin 열 셀은 `td.row-accent`다(C21 ①). 정의와 모먼트 ⑤ 무장은 cards_motion 소관이다.
  - '기존 방식' 열은 `--fg-muted`이고 취소선은 없다.
  - 머리·행의 X·Check 아이콘은 모두 지운다(icons 최종판). green-400/500, 표 들림, 먹 머리띠, zebra도 지운다.
- **/pricing 선택 가이드**(C21 ②): FilterChip 3문항이 고른 비교 행의 첫 셀에 `row-accent`를 단다. 나머지 행의 글자는 `--fg-muted`로 낮춘다(opacity로 흐리게 하지 않는다).

### 3.10 상태 화면·스켈레톤·로딩

**StateBlock** (`components/ui/state-block.tsx`, 서버 컴포넌트, gap 흡수)

| kind | 구성 | 소비처 |
|---|---|---|
| `notfound` | (선화 스팟) → `<h1 class="text-h1">` → 덱 `text-body-l text-fg-body` → 복구 링크 3개 | `app/not-found.tsx` |
| `error` | 같은 구성 + 복구 링크 앞에 '다시 시도' `Button variant="line" size="md"`(`reset()`) | `app/error.tsx`, `app/blog/error.tsx` |
| `empty` | **정본 편차(정정 요청, 열린 질문 6)**: `<h2 class="text-h3">` → 덱 → 호출부가 주는 행동 1개(예: '조건 지우기' `line md`) | 블로그·문서 검색 0건, 빈 목록 |
| `loading` | 스켈레톤 블록 + 컨테이너 `role="status"` + sr-only "불러오는 중" | `app/loading.tsx`, `PublicRouteLoading` |

- **복구 링크 3개**: 홈(`/`), 쇼룸 예약(`/showroom`), 도입 문의(`/contact`)를 `Button variant="ghost" size="md"`로 둔다. `flex flex-wrap gap-x-6`.
- **`empty`가 정본 구성과 다른 이유**: gap_triage는 모든 kind를 'H1 → 덱 → 복구 링크 3개'로 적었다. `empty`는 페이지 안에 놓이는 블록이라 H1을 쓰면 한 페이지에 H1이 둘이 되고, 이미 그 페이지에 있는 사용자에게 홈·쇼룸·문의로 나가는 링크 3개는 할 일이 아니다. 그래서 h2와 행동 1개로 둔다. 정본에 예외 근거가 없으므로 정정을 요청하고, 거절되면 정본 구성(h2 유지 여부 포함)을 따른다.
- **Kicker는 없다**(X15). 선화 스팟(160×120, `aria-hidden`)은 imagery §3-11 소관이다.
- **`app/global-error.tsx`**: 스코프 밖이다. 인라인 `<style>`에 `lib/design-tokens.ts`의 hex와 시스템 한글 스택(Apple SD Gothic Neo, Malgun Gothic)을 넣어 같은 구성을 스스로 그린다(css_architecture).

**스켈레톤**
- `bg-surface-skeleton animate-skeleton`(opacity 1↔.4, 1.6s). 키프레임은 보증 ④ 스피너와 같다(X08).
- 반경은 대상을 따른다: 글 줄 4, 도판 8, 카드 12.
- 블록에는 `aria-hidden`을 건다.
- reduced에서는 전역 블록 때문에 멈춘다(opacity 1).

**PublicRouteLoading**: 그라디언트 shimmer(`background-position` 루프)와 상단 진행 막대(`admin-loading-progress`, transform 루프)를 지운다. 로딩 표시는 스켈레톤 1종이다(gap_triage). C07이 루프 집계에서 빼는 것은 스켈레톤 점멸뿐이라 진행 막대는 예외가 아니다.

**스피너**: `LoaderCircle` 16 `animate-spin`. reduced 대체는 icons 보증 ④가 맡는다.

### 3.11 토스트 (`components/ui/toast.tsx`, 어드민 공유)

`ToastProvider`가 `usePathname()`으로 `isPublic = !isInternalPath(pathname)`을 구한다. 공개 분기만 새 뷰포트를 렌더한다. 어드민 분기(현행 뷰포트·3초·div 클릭 닫기·외형)는 한 글자도 바꾸지 않는다.

| 항목 | 공개 분기 값 |
|---|---|
| 스코프 | 뷰포트에 `site` 클래스(C17 ③). 보증 ①·아이콘 획 규칙이 닿는다 |
| 위치 | 데스크톱 `fixed right-4 top-[calc(var(--header-h)+16px)]`. 헤더 CTA를 덮지 않는다(감사 §2-2). `< 40rem`에서는 하단 가운데 `bottom: calc(env(safe-area-inset-bottom) + 72px)`로 플로팅 CTA 위에 둔다(system §2) |
| z | `z-[9999]`(공유 기본값 유지, X09) |
| 항목 | `bg-surface-sheet border border-line-strong rounded-lg shadow-deep`, 패딩 `py-1.5 pl-4 pr-1.5`, 최대 폭 360(모바일 `calc(100vw-32px)`) |
| 글자·아이콘 | `text-caption font-medium text-fg-ink`. `CircleCheck` 16 `text-fg-accent` / `CircleAlert` 16 `text-fg-danger`(icons). 상태선은 없다(C21) |
| 닫기 | `<Button variant="ghost" size="icon-md" aria-label="알림 닫기">` + X 20. div 클릭 닫기는 없다 |
| 시간 | 성공 5000ms. **오류는 닫을 때까지 남는다** |
| 일시정지 | `pointerenter`·`focusin`에 멈추고 `pointerleave`·`focusout`에 남은 시간부터 다시 센다. 터치도 pointer 이벤트로 받는다 |
| 진입 | opacity `--motion-base` 320ms. 이동 없음 |
| 낭독 | 상시 컨테이너 2개: `aria-live="polite"`(성공), `aria-live="assertive"`(오류). 항목의 `role="status"`는 없앤다(두 번 읽힘 해소) |

- 공개 화면에서 토스트는 성공 알림 위주로 쓴다. 폼 오류는 필드와 상태줄이 맡는다.
- 지우는 것: 민트·테라코타 채움, `rounded-xl`, `shadow-md`, `#B85C33`.

### 3.12 다이얼로그 (`components/ui/dialog.tsx`, 어드민 공유)

공개 호출부 5곳(DemoModal, NewsletterModal, EventSignupModal, PublicLoginDialog, CheckoutRequestForm)은 `<DialogContent className="site …">`를 준다(C17 ②). dialog.tsx의 기본 문자열은 그대로 두고, `.site`를 조건으로 한 변형만 뒤에 덧붙인다.

| 부분 | 공개 변형 | 지우는 것(공개에서) |
|---|---|---|
| 오버레이 | `[&:has(~.site)]:bg-surface-scrim [&:has(~.site)]:backdrop-blur-none [&:has(~.site)]:animate-fade-in`. 오버레이와 본문은 포털 안의 형제다 | `bg-black/40 backdrop-blur-[2px]`. 정의되지 않은 `animate-in` 계열은 무효 클래스다 |
| 본문 | `[&.site]:rounded-xl [&.site]:max-sm:rounded-xl [&.site]:border-line-hair [&.site]:bg-surface-sheet [&.site]:shadow-deep [&.site]:animate-dialog-in`. 패딩은 현행(모바일 16 + safe-area, sm 24)을 유지한다 | `rounded-2xl`, 4겹 그림자 |
| 진입 | `dialog-in`: opacity 0→1 + 개별 `scale` .98→1, 160ms. 가운데 정렬이 `translate` 속성이라 충돌하지 않는다 | — |
| 제목 | `[.site_&]:text-h3`(20→24/600). `DialogHeader`에 `[.site_&]:pr-12`를 줘 닫기와 겹치지 않게 한다 | 18px 리터럴 |
| 닫기 | `[.site_&]:right-3 [.site_&]:top-3 [.site_&]:inline-flex [.site_&]:size-11 [.site_&]:items-center [.site_&]:justify-center [.site_&]:rounded-md [.site_&]:p-0 [.site_&]:text-fg-muted [.site_&]:hover:bg-transparent [.site_&]:hover:text-fg-ink [.site_&]:focus:ring-0 [.site_&]:focus:ring-offset-0 [.site_&]:[&_svg]:size-5`. ghost icon-md와 같은 모양이다 | 28px `#A39E98`(2.66), `focus:ring` |
| z | 50(공유 기본값, X09) | — |

- **변형 3종의 근거(정본 확인 요청, 열린 질문 6)**: C17이 열거한 공유 컴포넌트 소비 방식은 `[.site_&]:`(조상 조건) 또는 '새 variant'다. 제목·닫기처럼 DialogContent의 자손은 `[.site_&]:`로 된다. 그런데 DialogContent 자신이 `.site`라서 조상 조건이 자기에게 걸리지 않고, 오버레이는 포털 안 형제라 조상 조건이 닿지 않는다. 그래서 자기 조건 `[&.site]:`와 형제 조건 `[&:has(~.site)]:` 두 임의 variant를 C17의 '새 variant'로 읽고 dialog.tsx 한 파일에만 쓴다. 정본이 이 경우를 다루지 않으므로 system 확인을 받는다.
- X 아이콘의 `strokeWidth={2}` prop은 공유 기본값이라 그대로 둔다(C17). 공개 화면에서는 `:where(.site) svg.lucide` 규칙이 획을 덮고, 가드 `lucide-strokewidth` 허용 목록에 `components/ui/dialog.tsx`를 넣는다(icons 최종판과 같다).
- `:has()`를 지원하지 않는 브라우저에서는 현행 오버레이가 나온다. 해가 없다(system §9: `:has`는 비필수 향상에만).
- Esc로 닫으면 트리거로 포커스가 돌아간다(Radix 기본). reduced에서는 전역 블록 때문에 바로 보인다.
- 모달 안 eyebrow(DemoModal:155의 11px uppercase)는 Kicker로 바꾸지 않고 지운다(C22·X15).

### 3.13 플로팅: 모바일 CTA·쿠키 배너·챗봇

**모바일 플로팅 CTA** (`components/ui/MobileFloatingCTA.tsx`. 다른 세션이 이 파일을 고치는 중이므로 그 머지 뒤에 적용한다)

| 항목 | 값 |
|---|---|
| 형태 | `min-h-11 rounded-md bg-surface-paper border border-line-control px-4`, `text-ui font-semibold text-fg-accent`, 아이콘 16. 그림자·블러 0(C23·X05, surfaces §3-8) |
| 위치 | `fixed z-(--z-floating)`, `bottom: calc(env(safe-area-inset-bottom) + 16px)`(system §2) |
| 동작 | 지금의 스크롤 업 표시 로직은 유지한다. 진입은 opacity `--motion-base` 1회다. `data-inert-with-menu`를 단다. 쿠키 배너가 열려 있거나 챗봇 패널이 열려 있으면 `hidden` + `inert`(system §2) |
| 지우는 것 | 글래스(`bg-white/85 backdrop-blur-md`), `rounded-full`, 그림자, framer 무한 펄스(`repeat: Infinity`), `z-40` |

감사 P0-2(챗봇 래퍼가 CTA를 덮는 문제)의 수리는 chatbot 파트 몫이다. 이 스펙의 수용 기준은 겹침 0을 확인한다.

**쿠키 배너** (`components/consent/ConsentBanner.tsx`)
- **위치**: `z-(--z-consent)`, `data-inert-with-menu`.
- **닫기**: 32px을 `Button variant="ghost" size="icon-md"`(44)로 키운다. `focus:ring`은 지운다.
- **본문·설명**: 11.5~12px `#5b6660`·`#6b756f`(sunken 위 4.38 ✗)를 `text-note text-fg-muted`로 올린다.
- **상세 설정**: 회색 박스를 hair 구분선 + 스위치 행(§3.5)으로 바꾼다. 문구는 현행 desc 3종을 그대로 쓴다.
- **하단 버튼**: `grid grid-cols-2 gap-2`에 같은 크기로 둔다. '필수만 사용'은 `line md`, '모두 허용'은 `default md`다. 감사 §5-5-9의 '거부는 그린 아웃라인'은 line(#8F8A84)으로 맞춘다(C23).
- **진입**: opacity 1회. 그림자 `shadow-[0_12px_34px]`는 0으로 한다(배너는 떠 있는 레이어이므로 필요하면 `shadow-deep` 하나만 쓴다).
- **저장 뒤**: 확인 문구("언제든 푸터 '쿠키 설정'에서 바꿀 수 있어요")를 1.6초 보인다(감사 §5-5-9).

**챗봇 패널(후속 항목, chatbot 파트 합의)** — `FloatingChatbot.tsx`·`ChatbotTeaser.tsx`
- 지금 받는 것: `.site` 래퍼 안에 들어가 보증 ①②를 받는다(§3.6의 정본 편차, 열린 질문 5). focus-within 입력은 입력에 `data-focus-ring="parent"`, 컨테이너에 `focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-fg-accent`를 쓴다(§토큰 5(c)).
- 후속 규격:
  - 패널은 Dialog 규격(sheet, hair, r12, `shadow-deep`), 런처·패널은 `z-(--z-chatbot)`.
  - 글자는 13px 이상(현행 9~12px 퇴출).
  - 글로우 그림자 `shadow-[0_0_8px_rgba(16,185,129,.7)]`, `#10B981`, blur 필터 애니메이션, `bg-white/70` 글래스, `#B85C33`·`#FBEAE2` 오류색은 0.
  - 스트리밍 커서는 점멸 없는 1px 정지 막대다. C07이 루프 집계에서 빼는 것은 스켈레톤 점멸뿐이고 스피너는 X08이 다루므로, 커서 점멸은 예외가 아니다.
- 채널톡 버블 병존은 운영자 확인 사항이다(system).

### 3.14 기타 한 줄 규격

- **Tooltip**: 현재 공개 사용 0이다. 만들면 새 라이브러리 없이 `<span role="tooltip" id>` + `aria-describedby`를 쓰고, hover·focus-within에서 opacity 160ms로 보인다. 면은 `surface-ink rounded-md px-2.5 py-1.5 text-note shadow-deep`이다. 필수 정보는 툴팁에 두지 않는다.
- **다운로드 행**: TocRow(cards_motion) + 오른쪽 `Download` 20 + 파일 형식·크기 `text-note text-fg-muted`. 게이트가 있으면 폼 키트를 쓴다.
- **검색 폼**(docs 3곳): 컨테이너 1px `border-line-control rounded-md focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-fg-accent`, 입력 `data-focus-ring="parent"`. 입력의 `outline-none`은 지운다(보증 ①이 parent 입력을 건너뛰고, 컨테이너 유틸이 그린다).
- **영상 정지 버튼**: `Button variant="line" size="icon-md"` + Pause/Play 20 + `aria-label`·`aria-pressed`. 대상 영상은 imagery 소관이다.

---

## 사용 규칙과 대상 파일

### 소유와 적용 (`docs/active/playbook/01-home-front.md`)

| 파트 | 대상 | 적용 |
|---|---|---|
| home-front | `components/ui/*`, `components/sections/*`, 공개 `app/*` | 직접 적용 |
| growth-crm | `components/showroom/*`, `components/checkout/CheckoutRequestForm.tsx`·`HardwareCheckoutPanel.tsx` | 합의 후 적용 |
| platform-data | `components/billing/*`, `components/checkout/CheckoutClient.tsx`(/checkout, `.site` 밖) | 합의 후 적용(green-surface 정리, 안쪽 main) |
| chatbot | `FloatingChatbot.tsx`, `ChatbotTeaser.tsx` | 보증 규칙만 받는다. 패널 재스타일은 후속 |

### 쓰는 곳 / 쓰지 않는 곳

| 요소 | 쓰는 곳 | 쓰지 않는 곳 |
|---|---|---|
| primary(`default`) | 구획당 1개: 헤더 '도입 문의', Hero, FinalCTA, 폼 제출, 쿠키 '모두 허용', 모바일 메뉴 하단 | 한 줄에 2개, 카드 안 반복 CTA, 먹 지면 |
| `line` | primary 옆 보조, 중간 CTA 띠, Comparison 끝, 모바일 메뉴 쇼룸, 쿠키 '필수만', 푸터 '구독', 외곽선 아이콘 버튼 | 단독 강조 |
| ghost 텍스트 링크 | 헤더 쇼룸, FinalCTA 보조, 섹션 끝 보조 이동, StateBlock 복구 링크 | 문단 안(→ 본문 링크), 색인 탭 바로 옆 |
| ghost `icon-md` | 헤더 메뉴 토글, Dialog·토스트·쿠키 배너 닫기 | 본문에 홀로 서는 아이콘 버튼(→ `line icon-md`) |
| 필터 칩 | 다중 조건, 질문 답 | 단일 범주 전환(→ `index-tab`), 비상호작용 태그(→ 글자 '·') |
| 스위치 | 즉시 반영되는 설정(쿠키) | 제출이 필요한 동의(→ 체크박스) |
| 탭 | 같은 맥락의 패널 전환 | 페이지 이동(→ 내비 링크 + `aria-current`) |
| 좌측 2px 바 | Comparison Classin 열, /pricing 선택 행, 세로 목차 현재 항목(C21) | 드롭다운·메뉴 활성, 오류 필드, 토스트, 표 추천 열, 카드 장식 |

### 공유 프리미티브 격리 — 어드민 영향 0

| 파일 | 공개 적용 방식 | 어드민 영향 |
|---|---|---|
| `button.tsx` | 새 키 `line`·`md`·`cta`·`icon-md` + compoundVariants. `xl`은 이관 뒤 삭제, `green-surface`는 platform-data 이관 뒤 삭제 | 0. base와 기존 키 문자열은 한 글자도 바뀌지 않는다(svg 선택자 `[&_svg]:size-4` 포함). 테스트가 기본 출력 문자열을 고정한다. 남는 리터럴은 가드 허용 목록으로 둔다(§3.1) |
| `input.tsx`, `textarea.tsx` | `variant="site"` 분기 대체, field 클래스 export | 0(기본 분기 문자열 동일) |
| `tabs.tsx` | `variant="site"` 분기(+forceMount) | 0 |
| `dialog.tsx` | `[.site_&]:`(자손), `[&.site]:`(본문 자신)·`[&:has(~.site)]:`(오버레이) 변형 덧붙임. 뒤의 둘은 C17 '새 variant'로 읽고 정본 확인을 요청한다(§3.12, 열린 질문 6). X `strokeWidth`는 유지(가드 허용) | 0 |
| `toast.tsx` | `isInternalPath` 공개 분기 뷰포트 | 0(어드민 분기 불변) |
| `slider.tsx` | 기본값 직접 수정 | 0(어드민 사용 0) |
| `accordion.tsx` | 삭제 | 0(사용처 FAQ 1곳) |
| `badge.tsx` | 유지(어드민 전용), 공개 import 금지 | 0 |
| `label.tsx` | 유지. 공개는 `FormLabel` | 0 |
| `marketing-form.tsx` | 공개 폼 키트로 개정 | 0(공개 전용) |
| `filter-chip.tsx`, `state-block.tsx` | 신규 | 0 |
| `lib/internal-path.ts` | AppChrome에서 옮겨 공유(C17) | 0 |
| tokens.css `--animate-fade-in` | 정의 | 어드민 `SmartActionCard.tsx:222`의 죽은 클래스를 같은 PR에서 지운다 → 0 |

### 화면 파일

| 파일 | 지금 | 바꿀 것 |
|---|---|---|
| `components/AppChrome.tsx` | 스코프 없음, :122 `<main>`에 id 없음, `isInternalPath` 로컬 함수 | 공개 분기 `<div className="site contents">`(Header·main·Footer. 위젯 3종 포함은 정본 편차, 열린 질문 5), 스킵 링크, `<main id="main" tabIndex={-1}>`, `lib/internal-path.ts` import |
| 안쪽 `<main>` 15파일(+CheckoutClient) | 랜드마크 중복: showroom, faq, ResourcesHub, About, unsubscribe, product, ai-report, pricing×3, share×3, DocsSidebarLayout, LegalArticle | `<div>`/`<section>`, 클래스 유지 |
| `components/sections/Header.tsx` | :54-57 py 전환 + 그림자 + `z-50`, :93 활성 판정, :102-105·:166-171 민트·색 활성, :121-124·:186 민트 pill, :134 드롭다운 `rounded-2xl`, :236 수작업 CTA | §3.6 전부, `z-(--z-header)`, 센티넬, inert effect, SessionNavEntry 자리 고정 |
| `components/sections/ProductTabNav.tsx` | :18 `top-[80px]` + `/95` blur, :29-32 민트 pill | §3.6 |
| `components/sections/Footer.tsx` | :14 `bg-[#111110]`, :72 `white/40`, :83 `white/25`, 색만 바뀌는 hover, 법정 표기 4항목 | `surface-ink`, 토큰, `link-quiet`, 행 히트, 법정 표기 블록, `data-inert-with-menu` |
| `components/sections/NewsletterSubscribe.tsx` | :66 민트 성공 박스, :92 h-10·13px·placeholder 12px, :97 `disabled`, :99 r14, :116 `#F8D4C3` | dark 분기 제거, site 필드, `line md`(먹 위) / `default md`(밝은 지면), ref 가드, `FormMessage` |
| `components/sections/FAQ.tsx` | pill 탭, Radix Tabs/Accordion, :65 bold 18~24, `rounded-[28px]` 박스 | 탭 `variant="site"` + forceMount, `details` 목차 행, 태그 '·', 본문 링크 |
| `components/sections/KeyUseCases.tsx` | :26-30 비활성 `#A39E98`, bold 18px, 흰 칩 활성 | `index-tab`, 2×2 / 4열 |
| `components/sections/Hero.tsx` | :70 `h-[3.5rem] rounded-2xl hover:scale-[1.03]` + 그린 그림자, :74 반투명 outline, `size="lg"` | V3-A: `default cta` + `line cta` |
| `components/sections/FinalCTA.tsx` | :37 흰 `rounded-full h-16 hover:scale-105`, :49 글래스 링크 | V5-A: sunken 띠(surfaces) + `default cta` + ghost 텍스트 링크 |
| `components/sections/Comparison.tsx` | div 표, zebra, `green-400/500`, 표 들림, :108 `size="lg"` | `table-paper--stack` + role, `row-accent`, 아이콘 삭제, CTA `line cta` |
| `app/download/DownloadPageClient.tsx` | `size="xl"` 4, `size="lg"` 2 | `cta`/`md` |
| `app/product/sw/page.tsx` | :592·:1642 `rounded-full h-14 hover:scale-105` + 그린 그림자, :593 `translate-x-1`, :1651 글래스 outline | `default cta` / `line cta`, `arrow-nudge` |
| `app/product/hw/page.tsx` | :756·:1346 `rounded-full` + 그림자, :1355 outline `rounded-full` | 같음 |
| `app/pricing/page.tsx`(선택 가이드) | — | FilterChip 3문항, 고른 행 `row-accent`, 나머지 `--fg-muted` |
| `app/contact/page.tsx` | :475-517 `Input` + slate·`rounded-xl`·`shadow-sm`, :501·543·579 shake, :524 select `focus:ring`, :596 textarea, :659 `disabled={loading}`·그린 그림자·`hover:-translate-y-0.5` | site 필드·select·textarea, 폼 키트, 제출 `cta` + ref 가드 + `aria-busy`, shake 삭제, 첫 오류 포커스, 상태줄, 동의 행 박스 제거 |
| `components/showroom/ShowroomBookingForm.tsx` (growth-crm) | :229 `#E5E5E0` select, :586 민트 hover 버튼, 11px 오류 12곳 | site 필드·select, `FormMessage`, 진행 레일 `aria-current="step"`, `line md`, ref 가드 |
| `app/resources/[slug]/ResourceDownloadForm.tsx` | :50 h-10 필드, :249-307 10px uppercase `#A39E98` 라벨 | site 필드, `FormLabel`, 대문자·자간 삭제 |
| `components/blog/LeadMagnetGate.tsx` | :214·:247 Button 오버라이드, :238 필드, :259 10px `#A39E98` | `cta`, site 필드, 고지 `text-note text-fg-muted` |
| 모달 4종(NewsletterModal, DemoModal, EventSignupModal, PublicLoginDialog) | r18 버튼, `size="xl"`(DemoModal :146·:241, EventSignupModal :131·:188), DemoModal:155 eyebrow, DemoModal:126 shake | `DialogContent className="site"`, `cta`/`md`, site 필드, shake·eyebrow 삭제 |
| `components/checkout/CheckoutRequestForm.tsx` (growth-crm) | 공개 Dialog | `className="site"`, 폼 키트 |
| `components/auth/SocialLoginRow.tsx` | hover 들림, 11·12px 라벨, `#B85C33` | §3.5 소셜 로그인 |
| `app/events/EventsClient.tsx` | :238-241 solid 그린 pill + 그림자 | `index-tab` + `aria-pressed` |
| `app/blog/BlogPageClient.tsx` | :129 막대형 + ring, 카운트 `#A39E98`, :346 다크 뉴스레터 | `index-tab` + 카운트 `text-folio`, 다크 패널은 surfaces 결정 뒤 `surface-ink` |
| `components/docs/DocsCategoryNav.tsx` | :41 막대형 + ring, 11px 메타 | `index-tab`, 메타 `text-note` |
| docs 검색 폼 3곳 | focus-within 컨테이너 + 입력 `outline-none` | 입력 `data-focus-ring="parent"`, 컨테이너 `focus-within:outline-*` 유틸(§3.14) |
| `components/blog/ArticleToc.tsx`, `components/docs/DocsSidebarLayout.tsx` | 12px 라벨 | 2px 현재 바 유지, `text-note` |
| `components/consent/ConsentBanner.tsx` | :45 11.5/12px `#6b756f`, :113 h-8 + `focus:ring`, :146 회색 박스, 그림자 | §3.13 |
| `components/ui/MobileFloatingCTA.tsx` | 글래스 pill, 펄스, `z-40` | §3.13(다른 세션 머지 뒤) |
| `components/PublicRouteLoading.tsx` | :10 shimmer | §3.10 |
| `app/not-found.tsx`, `app/error.tsx`, `app/blog/error.tsx`, `app/loading.tsx`, `app/global-error.tsx` | 제각각 | StateBlock / 자급 인라인 스타일 |
| `components/sections/PricingCalculator.tsx` | Slider 2개 | slider 개정을 받는다 |
| 수작업 그린 CTA 26파일(33곳 이상) | `bg-[#084734] … rounded-*` | `<Button asChild size=…>` |
| `components/billing/CheckoutSuccessClient.tsx` (platform-data, /checkout) | :214 `green-surface rounded-full` | `outline lg`(어드민 변형, `.site` 밖) → 그 뒤 `green-surface` 키 삭제 |

### 가드 규칙 — controls 몫

`scripts/check-design-tokens.mjs`(prebuild에서 이미 실행된다)의 규칙 배열에 넣는다. 형식, 베이스라인 `scripts/design-baseline.json` 래칫, 2주 warn 뒤 규칙별 error 승격은 system §6을 따른다. 범위는 공개 glob이다(app·components·lib, 어드민 제외).

| id | 패턴 | 허용 | 비고 |
|---|---|---|---|
| `focus-ring` | `focus-visible:ring`, `ring-offset-`, 앞 경계 `(?<![\w-])focus:`, `(?<![\w-])outline-none` | `components/ui/{button,dialog,tabs,input,textarea}.tsx`(어드민 문자열) | 보증 ①과 이중 표시를 막는다 |
| `button-variant` | `variant="(secondary\|outline\|destructive\|link\|green-surface)"` | billing·checkout(`.site` 밖) | |
| `button-size` | `<Button` 여는 태그에 `size="(md\|cta\|icon-md)"`가 없다 | billing·checkout | 여러 줄 여는 태그는 따옴표·중괄호 2단을 허용하는 정규식으로 잡는다. AST는 쓰지 않는다 |
| `site-variant` | `<(Input\|Textarea\|TabsList\|TabsTrigger\|TabsContent)` 여는 태그에 `variant="site"`가 없다 | billing·checkout | |
| `badge-import` | `@/components/ui/badge` | — | |
| `form-text` | 폼 파일의 `text-\[1[01]px\]`, `animate-shake` | — | |
| `bad-colors` | `#B85C33`, `#E5E5E0`, `placeholder:text-\[#A39E98\]`, `#ECFDF5`·`#D1FAE5`(::selection 제외, system 규칙과 공유) | — | |
| `left-bar` | `border-l-2`, `before:w-0.5`, `inset_2px_0_0`, `row-accent` | Comparison, /pricing 선택 가이드 파일, ArticleToc, DocsSidebarLayout, cards_motion의 site-base 정의 | C21 |
| `rounded-full` | system의 둥근 모서리 규칙 | `filter-chip.tsx`, `SocialLoginRow.tsx`, site-base(스위치·status-dot) | |
| `effects` | `transition-all`, `hover:scale-`, `hover:-translate-y`, 컨트롤 파일의 `backdrop-blur` | `components/ui/{button,dialog,tabs,input,textarea}.tsx`(어드민 문자열. 공개 분기·compound가 `transition-all`을 지운다, §3.1) | `hover:scale`는 system 목록과 공유 |
| `ink-primary` | 빌드 HTML의 `.surface-ink` 하위에 `bg-fg-accent` 클래스가 0 | — | `--budget` 모드(system)에서 센다 |

AppChrome 밖 `<main`, 공개 Radix `*Content`의 `site` 누락, `z-[N]`·`z-50`, 토큰 밖 ms 리터럴은 system 목록에 이미 있다. system 규칙 `text-px`·`shadow`·`hex-literal`·`duration-literal`의 허용 목록에도 같은 공유 프리미티브 파일(어드민 문자열)을 넣어 달라고 system에 요청한다. 넣지 않으면 마이그레이션 20단계의 '베이스라인 0'이 어드민 문자열을 바꾸라는 뜻이 되어 C17 원칙과 부딪힌다.

### 현황 실측 (2026-10-26, 공개 파일 217개, 어드민·포털 제외 — 이전 판)

| 항목 | 값 |
|---|---|
| 공개 `<Button>` | 47회. className으로 높이·반경·색·그림자를 덮어쓴 곳이 35회(18파일) |
| `size="xl"` / `size="lg"` | 8회·3파일 / 14회(공개 섹션 5, billing 8, checkout 1) |
| `bg-[#084734]` 수작업 CTA | 33회 이상(26파일) |
| `focus-visible:ring*` / `focus:*` / `outline-none` / `ring-offset-[#…]` | 263 / 51 / 108 / 31 |
| 링크·버튼이 있는데 포커스 스타일이 없는 공개 파일 | 16개 |
| `hover:scale-*` / `transition-all` / `backdrop-blur*` | 29 / 94 / 41 |
| 입력 글자 | `ui/input.tsx` 14px, `marketingFieldClassName` 15px, `NewsletterSubscribe` 13px(플레이스홀더 12px) → 모두 iOS 포커스 확대 |
| 입력 테두리 / 플레이스홀더 | `#E5E5E0` 1.26:1 / `#A39E98` 2.66:1 |
| `ui/button.tsx` 어드민 사용 | 221회(sm 153, outline 129, ghost 22, secondary 5, destructive 2, lg·xl 0) |
| `ui/input.tsx` 어드민 사용 | 125개 중 124개가 기본 클래스에 의존 |

---

## 접근성·대비

### 지원 기준선

| 기능 | 요구 | 미지원 시 |
|---|---|---|
| Tailwind 4·범위 미디어 쿼리 `(width >= 48rem)` | Safari 16.4+ | — |
| `details[name]` | Safari 17.2+ | 여러 개가 열린다(무해) |
| `@starting-style` | Safari 17.5+ | 바로 보인다 |
| `accent-color` | Safari 15.4+ | 색이 적용된다. 체크 표시 가독성만 실기기로 확인한다 |
| `inert` | Safari 15.5+ | — |
| `:has()` | Safari 15.4+ | 비필수 향상(Dialog 오버레이, scroll-padding)에만 쓴다 |

### 동작 줄이기
- **전역 블록이 기본을 맡는다**: `globals.css:904`의 `*{animation-duration:.001ms!important; animation-iteration-count:1!important; transition-duration:.001ms!important}`가 전이와 애니메이션을 끝 상태로 만든다.
- **이동량은 따로 0으로 만든다.** 바로 적용되는 transform은 전역 블록이 막지 못하기 때문이다: `motion-reduce:active:scale-100`, `arrow-nudge`의 `translate:none !important`.
- **스피너만 예외다**: 회전 대신 opacity 점멸(보증 ④, icons 소유). 정본 ④에는 `!important`가 없어 전역 블록에 진다. 이 충돌은 icons 열린 질문 7이 정본 정정을 요청해 두었고, controls는 그 결정을 따른다.
- **바로 끝 상태로 보이는 것**: 막대, 드롭다운, 메뉴 패널, Dialog scale, 토스트, FAQ 쉐브론.
- **animationend에 기대는 로직이 없다.**

### 키보드·스크린리더

**포커스**: 보증 ① 한 규칙(셀렉터 하나)이다. 예외는 `data-focus-ring="parent"`이고, 그 컨테이너가 `focus-within:outline-*` 유틸로 같은 2px outline을 대신 그린다. 스킵 링크가 첫 Tab이다. scroll-padding이 포커스를 헤더 밑에서 꺼낸다.

**랜드마크**: `<main>`은 1개다. 모바일 메뉴가 열려 있는 동안 메뉴 밖(`#main`, `[data-inert-with-menu]`)은 `inert`다.

**ARIA**

| 자리 | 속성 |
|---|---|
| 내비 | 현재 페이지 `aria-current="page"`, 부모 섹션 `"true"`, `<nav aria-label>` |
| 탭 | `aria-selected`(Radix) |
| 단일 필터·칩 | `aria-pressed` |
| 스위치 | `role="switch"` + checked |
| 단계 | `aria-current="step"` |
| 필드 | `aria-invalid` + `aria-describedby` |
| 진행 중 버튼 | `aria-busy` |
| 메뉴 토글 | `aria-expanded` + `aria-controls` |
| 아이콘 단독 버튼 | `aria-label` 필수 |
| 새 창 | sr-only "(새 창)" |

**오류 공지**
- 필드 오류: 포커스를 옮기고 `describedby`로 읽힌다.
- 폼 전체 오류: 상태줄 `role="alert"`.
- 공개 토스트 오류: assertive 영역.

### 강제 색 모드 (Windows 고대비)
- **primary**: 투명 1px 테두리가 시스템 색으로 보여 경계가 남는다.
- **`index-tab` 막대·`row-accent`**: `forced-color-adjust:none; background:CanvasText`.
- **스위치 썸**: 꺼짐 `CanvasText`, 켜짐 `Highlight`.
- **링크 밑줄**: `link-quiet`의 투명 밑줄도 강제 색에서는 보인다(식별에 유리).
- **체크박스·라디오**: UA가 그린다.

### 크기·확대
- 터치 대상은 44×44 이상이다. 예외는 문단 안 인라인 링크(WCAG 2.5.8 inline)뿐이다. 36px 칩은 `hit-area`로 44를 확보한다. 푸터 링크 행도 데스크톱 포인터를 포함해 모든 폭에서 44다(gap_triage, system §1. 포인터 기기 예외를 두지 않는다).
- 입력 글자 16px 이상, 읽는 글자 13px 이상, 오류 14px 이상.
- 확대 4상태(Android 글꼴 최대, iOS Aa 150%, 브라우저 200%, 텍스트 간격 사용자 CSS)에서 잘림·겹침·가로 스크롤이 0이어야 한다(system §9). 컨트롤은 `min-h`로 만들어 글자와 함께 커진다. 헤더 내비는 `whitespace-nowrap`이고, 넘치는 폭에서는 md 미만 메뉴로 내려간다.

### 계산 대비 (WCAG 2.x 상대 휘도, 알파는 브라우저처럼 8bit sRGB 합성)

**밝은 지면** (흰 / paper / sunken)

| 전경 | 흰 #FFF | paper #FAFAF8 | sunken #F6F5F4 | 판정 |
|---|---|---|---|---|
| `--fg-ink` #111110 | 18.89 | 18.08 | 17.35 | AAA |
| `--fg-body` #31302E | 13.18 | 12.62 | 12.11 | AAA |
| `--fg-muted` #615D59 | 6.53 | 6.24 | 5.99 | AA (DESIGN.md '~5.5' 정정) |
| `--fg-accent` #084734 | 10.71 | 10.25 | 9.83 | AAA |
| `--fg-accent-hover` #065C41 | 8.03 | 7.68 | — | AAA |
| `--fg-on-accent` on accent / on hover | 10.25 / 7.68 | | | AAA |
| `--fg-danger` #B43E3E | 5.68 | 5.43 | 5.21 | AA |
| `--fg-placeholder` #78736D | 4.70 | 4.49 ✗ | — | 흰 필드 전용 |
| `--line-control` #8F8A84 (비텍스트) | 3.42 | 3.27 | 3.14 | 1.4.11 충족 |
| `--line-link` .6 | 3.49 | 3.43 | 3.38 | 밑줄 식별 |
| `--fg-faint` #A39E98 | 2.66 | 2.54 | — | 글자 금지 |
| `--line-strong` .16 | 1.41 | — | — | 장식선 전용 |
| 퇴출: `#E5E5E0` 입력 테두리 / `#7C8A83` BillingModeTabs / `#6b756f` 쿠키 설명 | 1.26 / 3.61 / 4.77 | — | — / — / 4.38 | ✗ |

**먹 #111110 위**

| 전경 | 대비 | 판정 |
|---|---|---|
| `--fg-ink` #FAFAF8 | 18.08 | AAA |
| `--fg-body` /.72 | 9.61 | AAA |
| `--fg-muted`·`--fg-placeholder` /.56 | 6.14 | AA |
| `--fg-faint`·`--line-control` /.40 | 3.70 | 비텍스트 3:1 충족. 글자로는 금지 |
| `--fg-accent` #6EE7B7 (포커스·링크) | 12.40 | AAA |
| `--line-link` rgb(110 231 183/.5) | 약 3.8 (계산값) | 밑줄 식별 |
| `--fg-danger` #E89A94 | 8.53 | AAA |
| 금지: `#B43E3E` / `#084734` | 3.33 / 1.76 | ✗ (먹 위 채움 CTA가 0인 이유 중 하나) |
| 퇴출: 현행 푸터 `white/40` / `white/25` | 3.82 / 2.23 | ✗ |

---

## 성능 예산

| 항목 | 예산 |
|---|---|
| CSS | 컨트롤 블록 추가분은 3.5KB gzip 이하다. shimmer·accordion 키프레임과 ring·offset 유틸을 지우면 순증은 0 이하다 |
| JS | 새 클라이언트 JS는 1KB gzip 미만이다: 메뉴 inert·Esc·넓힘 닫기, 헤더 센티넬(scroll 리스너 대체), 토스트 타이머·일시정지, 첫 오류 포커스, 제출 ref 가드. 라이브러리 추가는 0이다. Radix Accordion 청크가 빠지는 효과는 빌드 리포트로만 판정한다(Radix Tabs는 남는다) |
| 전이 속성 | `color, background-color, border-color, text-decoration-color, opacity, scale, translate, rotate`(쉐브론)만 쓴다. 손대는 파일의 `transition-all`은 0이다. 예외는 공유 프리미티브의 어드민 문자열뿐이고, 공개 크기·분기에서는 덮여 효과가 없다(§3.1, 가드 `effects` 허용) |
| 무한 애니메이션 | 컨트롤에서 0이다. 예외는 로딩 중 스켈레톤 점멸(C07)과 스피너(X08)뿐이다. 진행 막대·스트리밍 커서 점멸·모바일 CTA 펄스는 지운다 |
| `backdrop-filter` | 컨트롤에서 0이다(헤더, 제품 탭, 모바일 CTA, Dialog 오버레이, Hero 버튼) |
| 레이아웃 속성 애니메이션 | 0이다. 헤더 padding 전환과 아코디언 height를 지운다 |
| CLS | 컨트롤이 만드는 CLS는 0이다. 고정하는 것: 헤더 높이, 탭 굵기(500), 필드 높이, SessionNavEntry 자리. 서버 오류는 미리 잡아 둔 상태줄에만 들어간다 |
| INP | 탭·칩·FAQ·메뉴 클릭이 200ms 미만이다(Chrome 4× CPU 감속). 프레임당 setState는 0이다 |
| 폰트·이미지 | 추가 0이다. select 화살표는 CSS 안 data URI(약 300B)다 |

---

## 마이그레이션 (S/M/L)

단계는 system §11의 P0–P5를 따른다. 단계마다 /admin 대표 화면과 /checkout의 스크린샷 diff가 0이어야 한다. 다른 세션이 고치는 중인 파일은 그 머지 뒤에 손댄다: `app/globals.css`, `components/ui/MobileFloatingCTA.tsx`, 블로그 파일, 견적 파일. 커밋 전에는 파일별 diff를 확인하고 `git add -A`는 쓰지 않는다.

**P0 — 화면 변화 0 (system PR에 실린다)**
1. **[S] 스코프 표지와 스킵 링크**
   - `lib/internal-path.ts`로 `isInternalPath`를 옮긴다.
   - AppChrome 공개 분기 `<div className="site contents">`(Header·main·Footer. 위젯 3종 포함은 정본 편차로 열린 질문 5 결정을 따른다), sr-only 스킵 링크, `<main id="main" tabIndex={-1}>`.
   - toast 뷰포트에 `site` 클래스, 공개 DialogContent 5곳에 `className="site"`.
   - 아직 이 표지를 소비하는 규칙이 없으므로 화면은 그대로다.
   - 파일: `components/AppChrome.tsx`, `lib/internal-path.ts`, `components/ui/toast.tsx`, `components/sections/{DemoModal,NewsletterModal}.tsx`, `components/events/EventSignupModal.tsx`, `components/auth/PublicLoginDialog.tsx`, `components/checkout/CheckoutRequestForm.tsx`
2. **[S] 랜드마크 정리**
   - 안쪽 `<main>` 15곳을 `<div>`/`<section>`으로 바꾼다(클래스 유지). CheckoutClient는 platform-data와 합의한다.
   - axe `landmark-no-duplicate-main`·`landmark-main-is-top-level` 0을 확인한다.
   - 파일: app/showroom/page.tsx, app/faq/page.tsx, app/resources/ResourcesHubClient.tsx, app/about/AboutPageClient.tsx, app/unsubscribe/page.tsx, app/product/page.tsx, app/product/ai-report/page.tsx, app/pricing/page.tsx, app/pricing/simulator/page.tsx, app/pricing/simulator/krw/page.tsx, app/share/contract/[token]/page.tsx, app/share/quote/[token]/page.tsx, app/share/_components/ShareUnavailable.tsx, components/docs/DocsSidebarLayout.tsx, components/legal/LegalArticle.tsx
3. **[S] 가드 규칙 warn + 베이스라인**: 위 표의 controls 몫. 파일: `scripts/check-design-tokens.mjs`, `scripts/design-baseline.json`
4. **[S] 애니메이션 토큰**: tokens.css에 `--animate-fade-in/dialog-in/skeleton`과 keyframes를 넣고, 같은 PR에서 `SmartActionCard.tsx:222`의 죽은 `animate-fade-in`을 지운다.

**P1 — 보증과 빼기**
5. **[S] 보증 ①②③ + base 규칙**
   - site-base.css에 넣는 것: 보증 ①(정본 셀렉터 하나)·②·③, base의 체크박스 20px·accent-color·본문 링크 자동 적용. docs 검색 3곳의 입력에 `data-focus-ring="parent"`, 컨테이너에 `focus-within:outline-*` 유틸을 단다.
   - 화면 변화는 셋이다: 키보드 포커스 outline, 입력 글자 13~15→16px, 체크박스 20px.
   - 이전 판의 '공개 Input 10파일 임시 `text-base`'는 필요 없다. 보증 ②가 모든 유틸을 이긴다.
   - 파일: `app/styles/site-base.css`, `app/docs/search/page.tsx` 외 2곳
6. **[M] 포커스·효과 빼기**
   - 공개 파일의 `focus-visible:ring*`(263)·`focus:*`(51)·`ring-offset-[#`(31)을 기계적으로 지운다. 남겨 두면 보증 ①과 이중으로 보인다.
   - 컨트롤의 `hover:scale-`(29)·`active:scale` 덮어쓰기, 공개 `animate-shake`(contact 3곳·DemoModal), 헤더·제품 탭 `backdrop-blur`를 지운다.
   - 가드 베이스라인을 함께 낮춘다.

**P2 — 프리미티브·셸**
7. **[S] button.tsx 정본화**
   - `line`, `md`·`cta`·`icon-md`, compoundVariants, svg 선택자 + `tests/ui/button-variants.test.ts`.
   - `xl` 8곳을 `cta`로 옮기고 grep 0을 확인한 뒤 키를 지운다.
   - 파일: `components/ui/button.tsx`, `app/download/DownloadPageClient.tsx`, `components/sections/DemoModal.tsx`, `components/events/EventSignupModal.tsx`
8. **[S] 유틸과 칩**: utilities.css의 controls `@utility` 6개, `components/ui/filter-chip.tsx`. 유틸은 쓰이는 순간에만 CSS로 나온다.
9. **[M] 폼 프리미티브**
   - input·textarea `variant="site"`, 폼 키트(FormLabel·Hint·Message·Checkbox, 필수 안내, 상태줄), `siteSelectClassName`, 스위치 CSS, slider 개정.
   - `marketingSurfaceClassName`을 지운다.
   - 파일: `components/ui/{input,textarea,marketing-form,slider}.tsx`, `app/styles/site-base.css`
10. **[M] 탭·FAQ·범주 필터**
    - tabs `variant="site"`, FAQ `details` + forceMount, accordion·키프레임 삭제, KeyUseCases 2×2/4열.
    - 행사·블로그·문서 범주를 `index-tab` + `aria-pressed`로 바꾼다. 11·12px를 13px로 올린다.
    - 파일: `components/ui/{tabs,accordion}.tsx`, `components/sections/{FAQ,KeyUseCases}.tsx`, `app/events/EventsClient.tsx`, `app/blog/BlogPageClient.tsx`, `components/docs/DocsCategoryNav.tsx`, `components/blog/ArticleToc.tsx`
11. **[M] 셸 내비** — 모든 페이지에 보인다
    - Header 전부(§3.6), ProductTabNav, Footer(법정 표기·link-quiet·뉴스레터 line md), 세로 색인 라벨.
    - 감사 P0-3 sticky 수리 뒤에 한다.
    - 파일: `components/sections/{Header,ProductTabNav,Footer,NewsletterSubscribe}.tsx`, `components/consent/CookieSettingsButton.tsx`
12. **[S] 토스트·Dialog·상태 화면**
    - toast 공개 분기, dialog `.site` 변형, StateBlock + 404·error·loading, PublicRouteLoading shimmer 삭제.
    - 파일: `components/ui/{toast,dialog,state-block}.tsx`, `app/{not-found,error,loading,global-error}.tsx`, `app/blog/error.tsx`, `components/PublicRouteLoading.tsx`
13. **[S] 쿠키 배너, 모바일 플로팅 CTA**: §3.13. 플로팅 CTA는 다른 세션 머지 뒤에 한다.

**P3 — 홈 Act 순서**
14. **[M] 홈 CTA와 표**
    - Hero(V3-A) `default cta` + `line cta`, 중간 CTA 띠 `line cta`, FinalCTA(V5-A), Comparison `table-paper--stack` + `row-accent`(모먼트 ⑤는 cards_motion과 같은 커밋).
    - 파일: `components/sections/{Hero,FinalCTA,Comparison}.tsx`

**P4 — 제품**
15. **[M] 제품 CTA와 선택 가이드**: sw·hw CTA(`cta`/`line`, `arrow-nudge`), /pricing 선택 가이드(FilterChip + `row-accent`), PricingCalculator 슬라이더.

**P5 — 콘텐츠·전환**
16. **[L] 공개 폼 12개의 오류 흐름** — 전환 화면이다. V8 시안을 확인하고, growth-crm 파일은 합의한 뒤 한다.
    - 폼마다 체크리스트를 적용한다.
      - 핸들러 첫 두 줄: `e.preventDefault(); if (submittingRef.current) return;`
      - finally에서 가드를 푼다.
      - `disabled={loading}`을 `aria-busy`로 바꾼다.
      - aria-invalid·describedby, 첫 오류 이동, 상태줄.
      - 11px 오류를 없앤다.
      - 쇼룸 레일에 `aria-current="step"`을 단다.
    - 파일: app/contact/page.tsx, components/showroom/ShowroomBookingForm.tsx, app/resources/[slug]/ResourceDownloadForm.tsx, components/blog/LeadMagnetGate.tsx, components/sections/{DemoModal,NewsletterModal,NewsletterSubscribe}.tsx, components/events/{EventSignupModal,EventAlertSignup}.tsx, components/auth/PublicLoginDialog.tsx, components/checkout/{CheckoutRequestForm,HardwareCheckoutPanel}.tsx
17. **[M] 수작업 그린 CTA 26파일**을 `<Button asChild size=…><TrackedLink|Link/></Button>`으로 바꾼다. 계측 ctaId는 유지한다. 라우트 단위 PR로 나눈다.
18. **[S] 인증·소셜 로그인**: SocialLoginRow, 인증 패널 버튼·필드.

**후속**
19. **[S] platform-data**: CheckoutSuccessClient `green-surface` → `outline lg`. grep 0을 확인하고 키를 지운다. billing `lg`는 그대로 둔다.
20. **[S] 정리와 문서 동기화**: 가드 베이스라인을 0으로 내리고 규칙별 error를 확정한다. DESIGN.md 반영안, 감사 §5-5 문구를 동기화한다.

---

## 수용 기준

**포커스**
- **범위**: Playwright로 /, /contact, /showroom, /product/sw, /product/hw, /blog, /faq, /events, /pricing에서 Tab을 끝까지 누른다.
- **outline**: 각 activeElement의 computed outline이 `2px solid rgb(8, 71, 52)`인 비율이 100%다. `.surface-ink` 안은 `rgb(110, 231, 183)`이다. outline-style none은 0개다. `data-focus-ring="parent"` 요소는 바로 위 컨테이너의 computed outline이 같은 값이다(`focus-within:outline-*` 유틸).
- **이중 표시 없음**: 같은 요소에 box-shadow 링이 함께 있는 경우가 0이다.
- **시작**: 첫 Tab은 '본문 바로가기'다.
- **포털·위젯**: 공개 Dialog 닫기, 토스트 닫기에서 같은 outline이 나온다(스코프 누락 0). 쿠키 배너 버튼·챗봇 입력은 열린 질문 5에서 위젯을 래퍼에 넣기로 정해진 경우에만 이 항목으로 판정한다.

**포커스 가림**: 같은 9페이지에서 Tab을 누를 때마다, 그리고 /contact에서 첫 오류로 이동할 때 `activeElement.getBoundingClientRect().top`이 헤더 하단 이상이다. `< 48rem` 제품 페이지에서는 헤더 하단 + 44px 이상이다.

**입력 글자(실기기)**: iPhone Safari에서 /contact·/showroom·DemoModal·EventSignupModal·NewsletterModal·PublicLoginDialog·푸터 뉴스레터(챗봇 입력은 열린 질문 5 결정에 따라)에 포커스해도 `visualViewport.scale === 1`이 유지된다. computed-style 자동 테스트는 따로 두지 않는다(C16).

**터치 대상**: 390×844 터치 에뮬레이션에서 `a[href]`·button·input·select·summary·`[role=tab]`·`[role=switch]`가 든 label 행의 히트 박스(`hit-area` ::before 포함)가 모두 44×44 이상이다. 예외는 문단 안 인라인 링크뿐이다.

**대비**
- **axe**: 9페이지와 모달 4종에서 color-contrast 위반 0.
- **흰 필드**: 플레이스홀더 4.5 이상. 오류 문구 4.5 이상이고 글자 14px 이상.
- **조작 경계**: computed border-color의 바탕 대비가 3.0 이상이다(입력, line 버튼, 비선택 칩, 스위치 트랙, 플로팅 CTA). 미체크 체크박스·라디오는 UA가 그려 computed 값이 없으므로 실기기 캡처의 픽셀로 3.0 이상을 확인한다. 미달이면 대체 레시피(`--line-control`)를 넣는다(C23).
- **본문 링크**: computed `text-decoration-color`가 `rgba(8, 71, 52, 0.6)`이다.

**먹 지면(푸터)**
- 뉴스레터 입력: background `rgb(17, 17, 16)`, 글자 `rgb(250, 250, 248)`, 플레이스홀더 4.5 이상, 테두리 3.0 이상. 흰 바탕 + 흰 글자 조합은 0이다.
- '구독' 버튼: background transparent, border-color `rgba(250, 250, 248, 0.4)`, 글자 `rgb(250, 250, 248)`.
- 빌드 HTML의 `.surface-ink` 하위 `bg-fg-accent`는 0이다(가드 `--budget`).
- 오류 문구 `rgb(232, 154, 148)`, 포커스 outline `rgb(110, 231, 183)`.
- 법정 표기·저작권 대비 4.5 이상(현행 3.82·2.23 제거), 글자 13px 이상.

**버튼 규격**
- 공개 페이지에서 칩·아이콘·ghost를 뺀 button과 버튼형 링크의 computed 값: border-radius 6px, height 44 또는 52(기본 글자 크기), box-shadow none.
- ghost 텍스트 링크: radius 0, text-decoration-line underline, decoration 색 `rgba(8, 71, 52, 0.6)`, min-height 44, padding-inline 0.
- border-radius 9999px는 `[aria-pressed]` 칩, 스위치 트랙·썸, 상태 점, 소셜 로그인 버튼에만 있다.
- 공개 범위 `size="xl"`은 0이다. billing·checkout의 `lg` 9곳은 computed 높이 44로 변화가 없다.
- `tests/ui/button-variants.test.ts`가 통과한다(어드민 기본 출력 문자열 불변 포함).

**가드와 grep**
- `node scripts/check-design-tokens.mjs`가 베이스라인 대비 증가 0으로 통과한다.
- 마이그레이션이 끝난 공개 범위 grep:
  - 포커스: `focus-visible:ring` 0(현 263), 앞 경계 `focus:` 0(51), `outline-none` 0(108), `ring-offset-[#` 0(31). 허용 파일 제외
  - 효과: 컨트롤 `hover:scale-` 0(29), `transition-all` 0. 허용 파일(공유 프리미티브의 어드민 문자열, §가드 `effects`) 제외
  - import·프리미티브: `@/components/ui/badge` 0, `variant="site"`가 없는 `<Input`·`<Textarea`·`<Tabs*` 0, size가 md|cta|icon-md가 아닌 `<Button` 0
  - 폼: 폼 파일 `text-[10px]`·`text-[11px]` 0, `animate-shake` 0
  - 색: `#B85C33` 0, `#E5E5E0` 0
  - 구조: AppChrome 밖 `<main` 0, 허용 파일 밖 좌측 바 0

**내비 상태**
- /product/sw에서 헤더 안 `aria-current="page"`는 정확히 1개('Classin 소프트웨어')이고 '제품 소개'는 `aria-current="true"`다. 제품 탭에도 page가 1개다.
- 그레이스케일 스크린샷에서 활성 항목이 2px 막대나 밑줄로 구분된다.
- 활성 전후 내비 링크 폭 변화가 0이다(500 고정). 탭 막대 전환에 transform 변화가 0이고 opacity만 바뀐다.
- Header·ProductTabNav·FAQ·KeyUseCases·EventsClient에서 `#ECFDF5`·`#D1FAE5` 활성 채움은 0이다.
- forced-colors 에뮬레이션에서 활성 탭 막대, 스위치 켜짐·꺼짐, primary 경계가 모두 보인다.

**헤더**
- 스크롤 0→500px 동안 header 높이 변화 0(모바일 76, `≥ 48rem` 80).
- computed background `rgb(250, 250, 248)` 알파 1, box-shadow·backdrop-filter none.
- 스크롤 뒤 하단선 opacity 1, 전이 320ms.
- SessionNavEntry가 늦게 응답해도 헤더 오른쪽 요소의 x 변화가 0이다.
- 터치 전용 1024px 에뮬레이션에서 '제품 소개'를 탭하면 /product로 가고, /product에 두 제품 링크가 모두 있다.

**모바일 메뉴**
- 열린 동안 `#main`과 `[data-inert-with-menu]`가 inert이고 Tab이 메뉴 밖으로 나가지 않는다.
- Esc로 닫히고 포커스가 토글로 돌아온다. 열린 채 `≥ 48rem`으로 넓히면 닫힌다.
- 닫은 뒤 inert가 남은 요소는 0이다.

**랜드마크**: 9페이지와 /share/quote, /legal 계열에서 axe `landmark-no-duplicate-main`·`landmark-main-is-top-level` 위반이 0이고 `document.querySelectorAll('main').length === 1`이다.

**폼 오류 흐름**
- /contact·/showroom·DemoModal에서 빈 값으로 제출하면 `document.activeElement`가 첫 필수 필드다. 그 필드는 `aria-invalid="true"`이고, `aria-describedby`가 가리키는 요소가 보이며 오류 문구를 담는다. iOS VoiceOver가 필드 이름과 오류를 읽는다.
- translateX 흔들기는 0이다.
- 네트워크를 끊고 제출하면 상태줄(`role=alert`)에 문구가 나오고 CLS 증가분은 0이다.
- 폼 머리에 필수 안내 한 줄이 있다.
- 제출 중 버튼에 `aria-busy="true"`가 붙고 disabled·aria-disabled는 없으며, 포커스가 버튼에 남고 computed opacity는 1이다. 0.3초 안에 두 번 탭해도 네트워크 요청은 1건이고 페이지 새로 고침은 0이다.

**토스트(공개)**
- 성공은 5000ms 이상 보이고, 오류는 닫기를 누르기 전까지 남는다. pointerenter·focusin 동안 타이머가 멈춘다.
- 성공은 polite, 오류는 assertive 영역에 들어간다. 항목에 role=status가 없어 VoiceOver가 한 번만 읽는다.
- 390px에서 하단 가운데이고 MobileFloatingCTA·챗봇 런처와 bounding box가 겹치지 않는다. 데스크톱에서 헤더와 겹치지 않는다.
- 닫기는 키보드로 조작하는 44×44 button이다.
- /admin 토스트는 적용 전후 외형·3초 동작이 같다.

**다이얼로그(공개)**
- 오버레이 computed backdrop-filter none, background `rgba(17, 17, 16, 0.48)`.
- 열 때 `getAnimations().length ≥ 1`(현재 0)이고 160ms 동안 opacity·scale(.98→1)이 실행된다. reduced에서는 scale 변화가 없다.
- 닫기 44×44이고 제목과 bounding box가 겹치지 않는다. Esc로 닫으면 포커스가 트리거로 돌아간다.
- 어드민 Dialog 9곳의 스크린샷 diff 0.

**FAQ**
- JS를 끈 `curl /faq` HTML에 세 카테고리의 모든 질문과 답변 텍스트가 있다. 질문마다 `<h4>`가 있다.
- 열 때 Performance 패널에 height 애니메이션이 0이다. hover 때 제목 색 변화가 0이다.
- Safari 17.2+·Chrome 120+에서 카테고리마다 한 번에 하나만 열린다.
- `ui/accordion.tsx` import가 0이다.

**StateBlock**: /존재하지-않는-경로가 404 StateBlock(H1, 덱, 복구 링크 3개, Kicker 0)을 렌더한다. error 경계에 '다시 시도'가 있고 동작한다. 빈 검색 결과에 empty가 나온다.

**성능**(Lighthouse 모바일 3회 중앙값)
- 홈·/contact·/faq: CLS 0.05 이하, LCP·TBT 악화 0.
- 탭·칩·FAQ·모바일 메뉴 클릭 INP 200ms 미만(4× CPU 감속).
- 컨트롤의 무한 애니메이션 0(로딩 중 스켈레톤·스피너 제외), backdrop-filter 컨트롤 0.
- 새 클라이언트 JS 1KB gzip 미만(빌드 리포트).

**reduced-motion 에뮬레이션**
- 눌림·화살표·드롭다운·메뉴·Dialog·토스트에서 transform·scale·translate 변화가 0이다.
- 스켈레톤은 정적이다. 스피너는 animation-name이 `skeleton-blink`다. iteration-count infinite 판정은 icons 열린 질문 7(④ `!important` 정본 정정)이 결정된 뒤에 한다. 정본 ④ 그대로면 전역 블록의 `!important`에 져서 1이 된다.

**JS 끔**: 헤더 링크, 폼 필드, FAQ 질문과 답변, 탭 3패널 텍스트가 모두 보인다.

**어드민 회귀**: /admin 대표 화면(리드 목록, 견적 편집, 캘린더, EventEditor·PartnerWorkspaceShell 탭, SmartActionCard가 있는 CS 채팅)과 /checkout의 전후 스크린샷 diff가 0이다. 이전 판의 '허용되는 차이 5가지'는 없앤다.

**iOS Safari 실기기(16~18)**
- 체크된 체크박스·라디오가 #084734로 보이고 흰 체크 표시가 읽힌다. 미체크 테두리는 white·paper·sunken 위에서 3:1 이상이다. 둘 중 하나라도 아니면 대체 레시피를 넣는다(C23).
- `input[role=switch]`의 ::before 썸이 그려지고, 탭하면 썸 위치와 색이 바뀐다.

---

## DESIGN.md 반영안

system §10에 따라 구획을 '적용 범위: public(.site) / admin'으로 나누고, 토큰마다 상태 배지(in force / target / retired)를 단다. 아래는 controls 몫이다. 색 토큰 표(§2)는 surfaces 반영안이 맡는다. 컴포넌트 절은 해당 구현 PR과 같은 커밋에서 고친다.

```diff
━━━ §4 "### 버튼"부터 "**Pill Badge**" 블록 끝까지(현 176–202행) 전체 교체. "### 어드민 라벨 단순화"는 그대로 둔다 ━━━
-### 버튼 … **Primary (Green)** … **Secondary** … **Ghost** … **Pill Badge** …
+### 버튼 — public(.site) [target] · 정본 `components/ui/button.tsx`
+변형(공개 3종)
+- primary(`default`): `bg-fg-accent`(#084734) + `text-fg-on-accent`(#FAFAF8), hover `#065C41`, 투명 1px 테두리, 그림자 0.
+- `line`: 투명 + 1px `--line-control`(#8F8A84) + `--fg-ink` 글자. hover 시 테두리 `--fg-ink`.
+- `ghost`: 텍스트 링크다. `--fg-accent` 15/600 + 1px 밑줄(`--line-link`, offset .22em) + ArrowRight 16. 아이콘 단독(`icon-md`)일 때는 테두리 없는 `--fg-muted` 아이콘이다.
+- `secondary`·`outline`·`destructive`·`link`는 어드민 전용이다.
+크기(공개 3종): `md` 44(15/600) · `size="cta"` 52(16/600) · `icon-md` 44×44(아이콘 20). `default`(38)·`sm`(32)·`icon`(36)·`lg`(44, 결제 화면)는 어드민·결제 전용이다. 공개 화면에 36px 버튼은 없다.
+배치: Hero·FinalCTA·폼 제출 = primary `cta` / 중간 CTA 띠 = `line cta` / 헤더 = primary `md` + ghost.
+규칙
+- 반경 6px(ghost 텍스트 링크는 0), 그림자 0. 전이 160ms(색·배경·테두리·scale), 눌림 scale .97(동작 줄이기에서 0).
+- 포커스는 공개 셸 전역 규칙이 그린다(2px `--fg-accent`, offset 2px).
+- 모바일 주 CTA는 `cta` + 폭 전체. 버튼 쌍은 세로로 쌓고 primary를 위에 둔다.
+- 먹 지면에는 채움 버튼이 없다. 먹 위 컨트롤은 푸터 '구독' `line md` 하나다(V5-A).
+- 제출 중에는 `aria-busy`만 걸고 라벨을 "보내는 중…"으로 바꾼다. `disabled`·`aria-disabled`는 쓰지 않는다. 중복 제출은 `preventDefault` 다음 줄의 ref 가드가 막는다.
+금지: className으로 높이·반경·색·그림자 덮어쓰기, `rounded-full`·2xl·18px 버튼, hover scale·들림, 그린 글로우, 글래스·반투명 버튼, 먹 위 채움 버튼.
+
+### 링크 — public [target]
+- 본문 링크 `link-body`: `#084734` + 1px 밑줄 `rgb(8 71 52/.6)`, offset .22em. hover·focus 시 밑줄 불투명, 색 `#065C41`. 문단 안 클래스 없는 `<a>`에는 자동 적용된다.
+- 조용한 링크 `link-quiet`(푸터·보조 내비·Breadcrumb): 평소 밑줄이 투명하고, hover·focus 시 밑줄과 `--fg-ink`가 나타난다. 색만으로 구분하지 않는다.
+- 이동은 링크, 동작은 버튼이다. 링크를 버튼 모양으로 쓰는 것은 CTA(`Button asChild`)뿐이다. 새 창은 sr-only "(새 창)".
+
+### 칩·태그·배지 — public [target]
+- 공개 화면의 pill(9999px)은 상호작용 필터 칩(`FilterChip`)뿐이다. 높이 36(히트 44), 1px `#8F8A84`, 15/500 `#31302E`. 선택하면 1px `#084734` 테두리 + `#084734` 글자 + 앞에 6px ●이고, 채움 없이 `aria-pressed`를 쓴다.
+- 하나만 고르는 범주 전환은 색인 탭이다. 비상호작용 태그는 글자와 ' · '로 쓴다. 상태는 모양 점(● ○ –) + 글자다.
+- `components/ui/badge.tsx`는 어드민 전용이다. 공개 화면에서는 import하지 않는다.
+
+### 외부 브랜드 예외 — public [target]
+- 소셜 로그인(Google·Apple·Kakao·Naver)과 제3자 브랜드 글리프는 각 플랫폼의 공식 허용 색·글리프·모양을 따른다. 플랫폼별 허용 변형 표: (확인 후 기입).
+- 이 스펙이 강제하는 것은 높이 44 통일 하나뿐이다. 색·글리프·크기는 위 허용 변형 표를 따른다. hex 리터럴 허용 파일은 `SocialLoginRow.tsx`·`brand-glyphs.tsx`만이다.

━━━ §4 "### 인풋"(현 218–223행) 교체 ━━━
-### 인풋
-- Border: `1px solid #E5E5E0` …
+### 폼 — public [target] · 정본 `components/ui/input.tsx` `variant="site"`, `components/ui/marketing-form.tsx`
+- 입력·select·textarea(V8-A 박스형): `bg-surface-sheet`(먹 위 #111110), 1px `#8F8A84`, 반경 6px, 높이 44(터치 48), 좌우 14px. 글자는 16px으로 보장된다(공개 셸 전역 규칙, iOS 확대 방지). 플레이스홀더 `#78736D`.
+- hover 테두리 `#111110`. focus 시 테두리 `#084734` + 2px outline. 그림자·글로우 링 없음. `variant="site"`는 기본 클래스를 병합하지 않고 대체한다(어드민 기본값 보존).
+- 라벨은 위 14/600 `#111110`, 도움말은 아래 14 `#615D59`. 선택 항목에만 "(선택)"을 붙이고, 폼 머리에 "(선택) 표시가 없는 항목은 꼭 적어 주세요"를 둔다. 단위('명'·'대')는 필드 안 오른쪽 14px.
+- 오류: 테두리 `#B43E3E`(먹 위 `#E89A94`) + 아래 14/500 문구와 CircleAlert 16. `aria-invalid`·`aria-describedby`, 첫 오류 필드로 이동(`scrollIntoView` 후 `focus({preventScroll:true})`). 서버 오류는 제출 버튼 아래 미리 잡아 둔 상태줄(`role="alert"`). 흔들기·좌측 바·빨간 배경 금지.
+- select는 네이티브 + `select-chevron`. 체크박스·라디오는 네이티브 20px + `accent-color`, 행 44. 스위치는 선화(40×24 트랙, 15px 썸, 켜지면 테두리·썸이 `#084734`, 채움 없음, `role="switch"`).
+- 금지: 폼 바탕 파스텔·회색 박스·18~28px 반경, 16px 미만 입력 글자, `#E5E5E0` 테두리, `#A39E98` 플레이스홀더.

━━━ §4에 새 절 추가: "### 내비·탭·FAQ·표·토스트·다이얼로그·상태 화면" ━━━
+### 내비·탭(색인 탭 `index-tab`) — public [target]
+- 15/500 고정. 비활성 `#615D59`, 활성 `#111110` + 아래 2px `#084734` 막대. 막대는 opacity로만 켜진다(160ms). hover는 색만 바뀐다. 움직이는 인디케이터·파스텔·solid pill 활성 금지.
+- 헤더: 높이 76/80px 고정, `#FAFAF8` 불투명. 스크롤하면 하단 hair가 320ms로 나타난다. 현재 페이지에만 `aria-current="page"`, 부모 섹션은 `"true"`. 첫 요소는 "본문 바로가기". 드롭다운·모바일 메뉴 활성은 2px 밑줄(좌측 막대 금지). 모바일 메뉴가 열리면 본문·푸터는 `inert`.
+- 탭(`components/ui/tabs.tsx` `variant="site"`): 하단 hair 위에 같은 막대, 모든 패널 SSR, 자동 진행 없음.
+- 좌측 2px 바는 Comparison Classin 열, /pricing 선택 행, 세로 목차 현재 항목 세 곳뿐이다.
+- 푸터: 먹 지면(`.surface-ink`) 토큰. 링크 `link-quiet`, 터치 히트 44. 법정 표기(상호·대표자·주소·사업자등록번호·통신판매업 신고번호·고객센터·개인정보 보호책임자)는 13px `--fg-muted`.
+
+### FAQ·표·토스트·다이얼로그·상태 화면 — public [target]
+- FAQ: 목차 행(폴리오 01 · 질문 H3 · ChevronDown 20). 네이티브 `<details name>`, 높이 애니메이션 금지. hover 시 위 테두리만 hair→strong. 모든 답변이 SSR HTML에 들어간다.
+- 표(`table-paper`): 위 1px `#111110`, 머리 아래 `rgb(17 17 16/.16)`, 행 hair. zebra·채움·그림자 0. 숫자 tabular·오른쪽 정렬. 추천 열은 머리 '추천' 라벨 + 600(바·채움 없음). 장부 합계는 위 1px 먹 + 아래 3px double. '표 n' 번호는 장문 페이지에만.
+- 토스트(공개): 흰 바탕 + 1px `rgb(17 17 16/.16)`, 반경 8, 상태선 없음(아이콘·문구가 상태를 맡는다). 성공 5초, 오류는 닫을 때까지. hover·focus 중 멈춤. 모바일은 하단 가운데.
+- 다이얼로그(공개): 오버레이 `rgb(17 17 16/.48)` 단색(블러 없음), 본문 흰 바탕·hair·반경 12·`shadow-deep`. 열림 opacity + scale .98→1 160ms. 닫기 44.
+- 상태 화면(StateBlock): H1 → 덱 → 복구 링크 3개(홈·쇼룸·문의). Kicker 없음. 로딩은 스켈레톤 `#F0F0EC` 한 가지, opacity 1↔.4 1.6s(동작 줄이기에서 정지). shimmer 금지.

━━━ §5 "### Border Radius 스케일" — controls 행만(나머지는 surfaces·cards 반영안과 함께) ━━━
-- `4px`: 인풋, 작은 기능성 UI
-- `6px`: 버튼
-- `9999px`: 뱃지, 필 태그
+- `4px`: 스켈레톤 줄 등 작은 기능성 UI
+- `6px`: 버튼·입력·select·textarea
+- `9999px`: 공개 화면에서는 필터 칩·스위치·상태 점(+외부 브랜드 예외)만. 비상호작용 pill 금지
+- (16px 행은 공개 범위에서 retired — 가드가 rounded-2xl 이상을 막는다. surfaces·cards 반영안과 같은 커밋)

━━━ §6 접근성 — controls 몫 교체·추가 ━━━
-- 보조 텍스트(`#615D59`) on white: ~5.5:1 (WCAG AA)
-- Green CTA(`#084734`) on white: ~9.7:1 (WCAG AAA)
-- 모든 인터랙티브 요소: `2px solid` 포커스 링
+- 보조 텍스트 `#615D59`: 흰 6.53 / paper 6.24 / sunken 5.99 (AA)
+- `#084734`: 흰 10.71 / paper 10.25 (AAA). primary 글자 `#FAFAF8` on `#084734` 10.25
+- 비텍스트 3:1: 조작 경계(입력·line 버튼·칩·스위치·외곽선 아이콘 버튼)는 `#8F8A84`(3.42/3.27/3.14). 체크박스·라디오는 네이티브(accent-color)라 미체크 테두리를 UA가 그린다. 실기기에서 3:1 미만이면 같은 `#8F8A84` 대체 레시피를 쓴다. `rgb(17 17 16/.16)`(1.41)은 장식선 전용
+- 먹 `#111110` 위: 글자 하한 알파 .50, 포커스·링크 `#6EE7B7`(12.40), 오류 `#E89A94`(8.53). `#B43E3E`(3.33)·`#084734`(1.76)는 먹 위 금지
+- 포커스: 공개 셸(`.site`)의 전역 `:focus-visible` 규칙 하나(2px solid `--fg-accent`, offset 2px). 개별 ring·`outline-none`·`focus:` 금지. 예외는 `data-focus-ring="parent"`(컨테이너가 그린다)
+- 랜드마크: `<main>`은 AppChrome의 하나뿐. 스킵 링크가 첫 Tab. 고정 헤더가 포커스를 가리지 않게 scroll-padding을 둔다
+- 크기: 터치 대상 44×44 이상(문단 안 인라인 링크 제외). 입력 글자 16px, 읽는 글자 13px, 오류 14px 이상. 컨트롤 높이는 min-height
+- 상태는 색만으로 구분하지 않는다: 막대·밑줄·칩 ●·링크 밑줄·오류 문구·스위치 썸 위치 + aria 속성
+- 동작 줄이기: 이동(scale·translate) 0, 색·opacity 전환만 남는다. 스피너는 opacity 점멸

━━━ §7 AI 에이전트 프롬프트 가이드: 7·8번 교체, 9~13번 추가 ━━━
-7. 뱃지/필: `9999px` radius, 그린 서피스 배경
-8. CTA 버튼: 항상 `#084734`, radius `6px`
+7. 공개 화면의 pill은 `FilterChip`만 쓴다(1px `#8F8A84` 아웃라인, 선택하면 그린 테두리 + ●). 배지·태그는 글자와 ' · '로 쓴다.
+8. CTA는 `components/ui/button.tsx`의 primary `size="md"|"cta"`만 쓴다. className으로 덮어쓰지 않는다. 먹 지면에는 채움 버튼을 두지 않는다.
+9. 입력은 `Input variant="site"`, `siteSelectClassName`, `siteTextareaClassName`을 쓴다. 탭은 `variant="site"`. 테두리 `#8F8A84`.
+10. 활성·선택은 `index-tab` 막대, 2px 밑줄, 칩 테두리 + ●와 aria 속성으로 나타낸다. 파스텔 채움과 장식용 좌측 막대는 금지한다.
+11. 포커스 스타일을 따로 쓰지 않는다(전역 규칙이 맡는다). `outline-none`·`ring-*`·`focus:`는 금지한다.
+12. 오류색은 `--fg-danger` 하나이고 글자는 14px 이상이다. 흔들기 금지.
+13. 커스텀 유틸 이름에 `text-` 접두를 쓰지 않는다. 안쪽 `<main>`을 만들지 않는다. z-index는 `z-(--z-…)` 토큰만.

━━━ 결정 로그 절(system §10)에 controls 관련 줄 ━━━
+- V5-A FinalCTA sunken 띠 · 먹 위 채움 버튼 0(C14) — 기본안 적용, 시안 ⑤ 승인 기록 자리
+- V8-A 입력 박스형 — 기본안 적용, 시안 ⑤에서 B(라인형)와 비교, 승인 기록 자리
+- V9-A Hero 배지 → Kicker — 기본안 적용(typography)
```

**DESIGN.md 밖 — 감사 문서 동기화**(`docs/active/public-site-audit-motion-plan-2026-10-26.md`)
- **§5-5-3**: 선택 가이드의 좌측 그린 바는 유지한다(C21 ②). 칩은 `FilterChip`, 나머지 행은 `--fg-muted`로 낮춘다('흐리게'의 구현).
- **§5-5-5**
  - 헤더 '배경·보더·그림자 opacity 400ms'를 '하단 hair opacity만, 320ms'로 고친다(C27).
  - '하단 2px 그린 바 scaleX(제품 탭은 인디케이터 하나가 translateX)'를 '탭별 2px 막대 opacity 160ms(`index-tab`, 측정 JS 0)'로 고친다(C12).
  - 모바일 메뉴 '4px 페이드'를 'opacity만'으로 고치고, inert 대상을 `#main` + `[data-inert-with-menu]`로 적는다.
  - Dialog '220ms'를 '160ms(--motion-fast)'로 고친다.
- **§5-5-6**: 'CTA 반경 6px 통일'에 'Button size md/cta, className 덮어쓰기 금지, 먹 위 채움 0(C14)'을 덧붙인다. '포커스 링 #084734 2px'는 '.site 보증 outline'으로 고친다.
- **§5-5-7**: '좌측 2px Danger 바'는 '테두리 #B43E3E + 14px 오류 문구 + 서버 오류 상태줄(좌측 바 없음, C21)'로 고친다. '600ms 보더 색 페이드'는 '--motion-slow 700ms'로 고친다.
- **§5-5-9**: '거부는 그린 아웃라인'을 'line md(#8F8A84, C23)'로 고친다.

---

## 하지 말 것

- **공유 프리미티브 기본값**: button·input·textarea·tabs·dialog·toast의 어드민 문자열을 바꾸지 않는다. 공개 외형은 새 키·`.site` 조건 변형·경로 분기로만 준다.
- **버튼 덮어쓰기**
  - className으로 높이·반경·색·그림자를 덮어쓰지 않는다.
  - `rounded-full`·`rounded-2xl`·`rounded-[18px]` 버튼, `hover:scale`, `hover:-translate-y`, 그린 글로우를 쓰지 않는다.
  - 글래스·반투명 버튼을 쓰지 않는다.
  - 먹 위에 채움 버튼(그린이든 흰색이든)을 두지 않는다. `--cta` 계열 토큰을 만들지 않는다.
  - 공개 크기(md·cta·icon-md)를 `.site` 밖(/checkout·/receipt)에서 쓰지 않는다.
- **포커스**: `focus:*`, `focus-visible:ring*`, `ring-offset-*`, `outline-none`으로 포커스를 개별로 만들거나 지우지 않는다. 예외는 `data-focus-ring="parent"` 입력과 그 컨테이너의 `focus-within:outline-*` 유틸뿐이다.
- **채움**: `#ECFDF5`·`#D1FAE5` 활성 채움, solid 그린 pill, 회색 pill 탭 바탕, 스위치 트랙 채움을 쓰지 않는다.
- **막대·바**
  - 좌측 2px 바를 정해진 3곳 밖에서 쓰지 않는다. 토스트 상태선과 표 추천 열 바는 두지 않는다.
  - 탭 그룹을 따라 움직이는 인디케이터, 자동 진행 탭, 진행 괘선을 만들지 않는다.
- **배지·pill**: 비상호작용 pill·배지를 공개 화면에 두지 않는다. `@/components/ui/badge`를 공개 화면에서 import하지 않는다. Kicker를 모달 eyebrow 대용으로 쓰지 않는다.
- **글자 크기·색**
  - 16px 미만 입력 글자, 13px 미만 읽는 글자, 14px 미만 오류를 쓰지 않는다.
  - `#A39E98` 글자·플레이스홀더, `#E5E5E0` 입력 테두리, 먹 위 `#B43E3E`를 쓰지 않는다.
  - 15px(`text-ui`)를 카드·본문 문장에 쓰지 않는다.
- **오류 표시**: 흔들기, 빨간 배경, 좌측 바를 쓰지 않는다. 냉색 회녹색과 `#B85C33`·`red-*`·`amber-*`를 쓰지 않는다.
- **애니메이션**: `height`·`padding`·`box-shadow`·`background-position`을 애니메이션하지 않는다. `transition-all`, 컨트롤의 무한 애니메이션, `backdrop-filter`, 토큰 밖 ms 리터럴을 쓰지 않는다.
- **이름**: `text-` 접두 커스텀 유틸을 만들지 않는다(twMerge가 지운다). `text-(--fg-*)` 임의값, `.on-ink`, `.num`, var() 폴백을 쓰지 않는다.
- **구조**: 가로 스크롤 탭, 진행 중 `disabled`, 안쪽 `<main>`, 토큰 밖 `z-[N]`·`z-50`을 쓰지 않는다.
- **정직성**: 푸터 법정 표기 값, 소셜 로그인 허용 변형을 추정해 채우지 않는다.

---

## 열린 질문

1. **V8 입력 모양**: 박스형(A)을 기본으로 적용해 두었습니다. 시안 ⑤에서 라인형(B: 아래 1px #8F8A84, focus 2px #084734)과 폼 전체 무게를 나란히 보고 확정해 주세요. 확정 전에는 P5 전환 폼(단계 16)을 머지하지 않습니다.
2. **푸터 법정 표기 값**: 현재 코드에는 상호·대표자·사업자등록번호·주소만 있습니다. 통신판매업 신고번호, 고객센터(전화·이메일), 개인정보 보호책임자 값을 주세요. 받기 전에는 그 항목을 빼고 렌더합니다. 푸터에 SNS 링크(네이버 블로그·카카오 채널·유튜브)를 둘지도 정해 주세요(icons 열린 질문과 같습니다).
3. **소셜 로그인 외부 브랜드 표**: Google·Apple·Kakao·Naver의 공식 허용 색·글리프·모양을 누가 언제 확인할지 정해 주세요. 그 전까지는 현행 공식 색·글리프를 유지하고, 높이 44 통일만 강제합니다(현행 48 원형은 44로 맞춥니다, gap_triage).
4. **FAQ 카테고리 탭**: 이 스펙은 탭을 유지하고 forceMount로 SSR을 보장합니다. 탭을 없애고 세 카테고리를 제목 + 목차 행으로 이어 붙이면 FAQ가 서버 컴포넌트가 되어 JS가 0이 되고, 페이지 안 찾기가 전 카테고리에 걸립니다. IA를 바꿀지 정해 주세요.
5. **`.site` 래퍼 범위(C17 정본 문구 정정 요청, system 결정)**: C17 ① 문구는 'Header·main·Footer'를 감싼다고 되어 있습니다. 이 스펙과 system 최종판(AppChrome 코드 주석)은 같은 분기에서 AppChrome가 렌더하는 ConsentBanner·FloatingChatbot·MobileFloatingCTA도 같은 래퍼에 넣습니다. 표지를 붙이는 곳은 C17의 세 곳 그대로입니다. 위젯을 빼면 쿠키 배너 버튼에 포커스가 안 보이고 챗봇 입력에서 iOS 확대가 남습니다. C17 ① 문구를 'Header·main·Footer와 같은 분기의 공개 위젯'으로 고칠지 정해 주세요. 거절되면 위젯은 래퍼 밖에 두고, 두 항목은 수용 기준에서 빼서 chatbot·consent 후속으로 넘깁니다.
6. **정본 문구 정정·확인 요청 묶음(system)**: 아래는 이 스펙이 정본과 다르게 쓰거나 정본이 다루지 않는 항목입니다. 각각 정본을 고칠지, 스펙을 정본대로 되돌릴지 정해 주세요.
   - **C02 유틸 목록 추가**: `border-fg-ink`·`border-fg-accent`·`border-fg-danger`·`bg-line-control`·`decoration-fg-accent`·`outline-fg-accent`(§토큰 2). 1:1 매핑으로 생성되며, icons 열린 질문 8과 같은 요청입니다.
   - **보증 ①과 `data-focus-ring="parent"`**: 보증 ①은 정본대로 셀렉터 하나입니다. 제외된 입력의 컨테이너는 `focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-fg-accent` 유틸로 그립니다(무레이어 규칙 추가 0). 이 방식을 정본 ① 옆에 한 줄로 적어 두기를 요청합니다.
   - **C15 높이 표기**: `h-11`·`h-13` → `min-h-11`·`min-h-13`(system 브리프 §1 '컨트롤은 min-height'와 맞춤).
   - **Dialog의 `[&.site]:`·`[&:has(~.site)]:`**: DialogContent 자신과 형제 오버레이는 `[.site_&]:`가 닿지 않습니다. C17 '새 variant'로 읽어도 되는지 확인해 주세요(§3.12).
   - **공유 프리미티브의 가드 허용 목록**: button·input·textarea·tabs·dialog·toast의 어드민 문자열(`text-[15px]`·`transition-all`·`duration-150`·hex·`shadow-sm` 등)은 C17 원칙으로 남깁니다. system 규칙 `text-px`·`shadow`·`hex-literal`·`duration-literal` 허용 목록에 이 파일들을 넣어 주세요. C15의 'text-[15px] → text-ui'는 공개 크기 키가 대체하는 방식으로 지킵니다(§3.1).
   - **StateBlock `empty`**: gap_triage 구성(H1 → 덱 → 복구 링크 3개)과 달리 h2 + 행동 1개입니다. 페이지 안 블록이라 H1이 둘이 되는 것을 피하려는 것입니다(§3.10).
   - **체크박스 경계(C23 vs css_architecture)**: C23은 체크박스에 `--line-control`을 요구하고, css_architecture (a)·C01은 네이티브 accent-color를 둡니다. 네이티브 미체크 테두리는 토큰으로 칠할 수 없습니다. 이 스펙은 실측 미달일 때만 대체 레시피를 씁니다(§3.5). C23 대상에서 '체크박스(대체 레시피를 쓸 때)'로 좁힐지 정해 주세요.
7. **키프레임 중복(system 결정)**: cards_motion의 `panel-in`과 tokens.css의 `fade-in`은 같은 `from { opacity: 0 }`입니다. 하나로 합칠지 정해 주세요. 기본은 둘 다 두고, 다음 정리 PR에서 `fade-in` 하나로 모읍니다.
8. **챗봇 패널 재스타일 시점**: §3.13의 후속 규격(Dialog 규격, 13px 이상, 글로우 0)을 chatbot 파트가 언제 받을지 정해 주세요. 감사 P0-2(래퍼가 하단 CTA를 덮는 문제)는 그보다 먼저 고쳐야 합니다.
