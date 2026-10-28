# 레이아웃·레이어·토큰 배선 (system)

> 편집 지면 · OS판의 공개 셸 공통 기반. 요소 6개 스펙(typography·surfaces·cards_motion·icons·imagery·controls)이 함께 쓰는 것만 소유하고, 요소의 생김새는 다루지 않는다.
> 정본 순위: canonical C01–C28·X01–X16·naming·css_architecture > 이 문서 > 요소 스펙. 이 문서는 정본을 옮겨 적고, 정본이 비워 둔 배선(파일·순서·검사)을 채운다. 정본 문구와 다르게 정한 곳은 §13에 모두 적었다(정본 개정 제안). 운영자 확인이 필요한 것은 §12에도 올렸다.
> 실측 기준: 2026-10-26 작업 트리(main `4c9e509c` + 미커밋 변경). `[실측]`은 이 저장소에서 확인한 사실, `[정본]`은 canonical 결정, `[추정]`은 확인하지 않은 판단이다.
> 이 파일이 system 스펙의 정본 위치다(`docs/active/public-site-design-language-2026-10-26/system.md`).

---

## 1. 요약

- **소유 범위**: 레이아웃(브레이크포인트·거터·컨테이너·섹션 리듬·그리드), 고정 레이어 스택(z·safe-area·동시 노출), 토큰 배선(정본 파일·미러·소비처), `.site` 스코프, CSS 파일 소유와 `@layer` 순서, tailwind-merge 설정, 디자인 가드(규칙 레지스트리 + 줄기만 하는 베이스라인 + 빌드 HTML 예산), 사실 레지스트리(`lib/facts.ts`), 한국어 표기 유틸(`lib/format.ts`), 롤아웃·측정·되돌림.
- **새 파일 9개**: `app/styles/{tokens,utilities,site-base}.css`, `lib/{design-tokens,internal-path,format,facts}.ts`, `components/landing/Section.tsx`, `scripts/design-baseline.json`. 테스트는 `tests/lib/{design-tokens,cn,format,facts}.test.ts` 4개.
- **새 의존성 0.** 생성 스크립트·기능 플래그·`/design-lab`·`body[data-shell]`·포털 루트도 만들지 않는다.
- **수용 조건 공통**: 어드민 무변경. P0는 공개 화면 스크린샷 차이 0.
- **실측으로 바뀐 전제 3개**: ① 스킵 링크는 지금 없다(`z-[60]`은 `components/blog/ReadingProgress.tsx`). ② 채널톡은 부트할 때 버튼을 숨긴다(`lib/channel-talk.ts:146 hideChannelButtonOnBoot: true`). 그래서 기본값(현행 유지)에서 버블 겹침은 0이다. 다만 버블 병존 여부는 정본(gap_triage·brief §2)대로 운영자 확인 항목으로 남긴다(§12-9). ③ Vercel Speed Insights는 설치돼 있지 않다(`package.json`에 없음). 그래서 필드 LCP는 측정 지표에서 뺀다.

## 2. 원칙

1. **값은 한 파일.** 디자인 토큰 선언은 `app/styles/tokens.css`에만 둔다. CSS 변수를 읽지 못하는 소비처는 손으로 적은 미러 `lib/design-tokens.ts` 하나만 import하고, 테스트가 두 값을 대조한다(C01·X01·X13).
2. **스코프는 클래스 하나.** 공개 셸 표지는 `site` 클래스뿐이다(C17). 모든 공개 규칙은 `:where(.site)`(특이도 0)로 시작한다. 어드민에는 닿지 않는다.
3. **우선순위는 레이어가 정한다.** 레이어 밖 규칙은 보증 4개뿐이다(④가 이름으로 부르는 `@keyframes skeleton-blink`는 보증 구간 안에 둔 ④의 부속이다). 같은 층 안의 충돌은 속성 소유를 나눠서 미리 없앤다: 유틸은 정적 모양, components는 모션 상태.
4. **기본값이 이긴다.** 브레이크포인트와 간격은 Tailwind 기본값을 쓴다. 새 spacing 토큰은 만들지 않는다. 섹션 리듬의 유일한 소비처는 `Section`이다.
5. **고정 레이어는 토큰 z와 safe-area 공식 하나로 쌓는다.** 겹치는 레이어는 동시 노출 규칙으로 숨긴다.
6. **가드는 래칫이다.** 새 위반은 0이고, 기존 위반은 줄기만 한다. 경고 2주 뒤 규칙별로 오류로 올린다.
7. **숫자에는 출처가 있어야 한다.** 화면의 수치는 `lib/facts.ts`의 factId로만 들어온다. 표기는 `lib/format.ts` 한 곳에서 한다.
8. **측정한 뒤에 다음 단계로 간다.** 라우트 단위 PR, 기준선 14일, 사전 합의한 되돌림 트리거로 운영한다. 플래그는 두지 않고 revert로 되돌린다.

---

## 3. 토큰(CSS + Tailwind @theme)

### 3-1. 파일 구성과 레이어 순서

| 파일 | 소유(값) | 내용 | 레이어 |
|---|---|---|---|
| `app/globals.css` | 기존(어드민·레거시) | 기존 내용은 그대로 둔다. `@import "tailwindcss";` 바로 아래에 import 3줄을 넣는다. **새 공개 규칙 금지**(가드) | 기존 그대로 |
| `app/styles/tokens.css` | 블록별(머리 주석) | `:root` 토큰, `:root` 미디어 재정의, `.surface-ink`, `@theme inline` | `@layer base` + `@theme` |
| `app/styles/utilities.css` | surfaces·controls·typography·imagery | `@utility`만 둔다. 정적 모양만 선언한다 | utilities |
| `app/styles/site-base.css` | 블록별 | (a) `@layer base` 한글 조판·링크·아이콘 획 (b) `@layer components` + 모션 무장 블록 1개 (c) 파일 끝 무레이어 보증 4개 | base / components / 무레이어 |

```css
/* app/globals.css 1–4행 */
@import "tailwindcss";
@import "./styles/tokens.css";
@import "./styles/utilities.css";
@import "./styles/site-base.css";
```

- import는 다른 규칙보다 앞에 둔다(CSS `@import` 위치 규칙). 레이어가 우선순위를 정하므로 import 순서 자체는 의미가 없다.
- 같은 PR에서 `globals.css` `@theme inline`의 `--font-sans`(34행)를 지운다. 이 값은 `tokens.css`로 옮긴다(값 동일, 화면 변화 0). 같은 이름을 두 `@theme`에 두면 뒤에 오는 쪽이 이기는데, 그 결과가 import 순서에 달리게 된다. **정본 편차(§13-1)**: css_architecture는 'globals.css에는 `@import` 3줄만 추가'라고 적었지만, 같은 정본이 `--font-sans`를 tokens.css `@theme`에 두라고 했으므로 이 1줄 삭제는 피할 수 없다.
- **우선순위(한 문장)**: 무레이어 보증 4개 > utilities(`@utility`·Tailwind 유틸) > components > base > theme/preflight. 의도적으로 레이어 밖에 쓴 CSS module(특이도 > 0)은 보증 규칙도 이긴다. 그래서 공개 CSS module은 가드 허용 목록에 있는 것만 쓸 수 있다(현재 `components/portal/quotes/quote-paper.module.css` 하나).
- 소유자는 home-front 파트 1명이다. 다른 세션이 `globals.css`를 수정 중이면(지금 미커밋 `M app/globals.css` [실측]) 그 커밋이 들어간 뒤에 P0를 시작한다.

### 3-2. `app/styles/tokens.css` (P0 전문)

```css
/* app/styles/tokens.css — 디자인 토큰의 유일한 선언처 (system §3).
   다른 파일에서 --surface-*·--fg-*·--line-* 를 선언하거나 .surface-ink 를 정의하면 가드가 막는다.
   값 소유는 블록 머리 주석을 따른다. var() 폴백은 금지(global-error 제외). */

@layer base {
  :root {
    /* ── 면·글자·선 20색 — surfaces 소유 (X01) ── */
    --surface-paper: #FAFAF8;
    --surface-sheet: #FFFFFF;
    --surface-sunken: #F6F5F4;
    --surface-ink: #111110;
    --surface-skeleton: #F0F0EC;
    --surface-scrim: rgb(17 17 16 / .48);

    --fg-ink: #111110;
    --fg-body: #31302E;
    --fg-muted: #615D59;
    --fg-placeholder: #78736D;
    --fg-faint: #A39E98;          /* 장식·비활성 전용. 텍스트 금지 (2.54:1) */
    --fg-accent: #084734;
    --fg-accent-hover: #065C41;
    --fg-danger: #B43E3E;
    --fg-on-accent: #FAFAF8;

    --line-hair: rgb(17 17 16 / .08);
    --line-strong: rgb(17 17 16 / .16);
    --line-ink: #111110;
    --line-control: #8F8A84;
    --line-link: rgb(8 71 52 / .6);

    /* ── 자간 원값 — typography 소유 (§3-2) ── */
    --trk-poster: -0.03em;
    --trk-display: -0.03em;
    --trk-h1: -0.025em;
    --trk-h2: -0.02em;
    --trk-h3: -0.01em;
    --trk-num: -0.02em;
    --trk-label: 0.02em;
    --trk-abbr: 0.06em;

    /* ── 모션 — cards_motion 소유 (X13). story·progress·carousel 은 만들지 않는다 ── */
    --motion-fast: 160ms;
    --motion-base: 320ms;
    --motion-slow: 700ms;
    --motion-rise: 12px;
    --motion-stagger: 80ms;
    --ease-soft: cubic-bezier(.22, 1, .36, 1);
    --ease-drift: cubic-bezier(.45, 0, .55, 1);

    /* ── 선 굵기 — icons 소유 (C11) ── */
    --stroke-pen: 1.5px;
    --stroke-accent: 2px;

    /* ── 레이아웃·레이어 — system 소유 (§4) ── */
    --header-h: 76px;
    --z-subnav: 30;
    --z-header: 40;
    --z-floating: 42;
    --z-chatbot: 44;
    --z-consent: 46;
    /* 50 = Radix Dialog·오버레이 (components/ui/dialog.tsx 공유 기본값, 토큰 아님) */
    --z-skiplink: 60;
    /* 9999 = 토스트 (components/ui/toast.tsx 공유 기본값, 토큰 아님) */
  }

  @media (width < 40rem) {
    :root { --trk-poster: 0; --trk-display: 0; --trk-h1: 0; --trk-h2: 0; --trk-h3: 0; --trk-num: 0; }
  }
  @media (width >= 48rem) {
    :root { --header-h: 80px; }
  }
  @media (prefers-reduced-motion: reduce) {
    :root { --motion-rise: 0px; --motion-stagger: 0ms; }
  }
  @media (prefers-contrast: more) {
    :root { --line-hair: rgb(17 17 16 / .32); --line-strong: #8F8A84; }
  }
  @media (max-resolution: 1.49dppx) {
    :root { --stroke-pen: 2px; }      /* V6 기본 켬: DPR1 사용자는 현행 lucide 2px 과 같아 변화 0 */
  }

  /* ── 먹 지면 — surfaces 소유 (C01). 유일한 정의. .on-ink 는 없다 ── */
  .surface-ink {
    --surface-sheet: #111110;          /* 불투명, 바닥과 같은 색. autofill 덮개도 이 값 */
    --fg-ink: #FAFAF8;
    --fg-body: rgb(250 250 248 / .72);
    --fg-muted: rgb(250 250 248 / .56);
    --fg-placeholder: rgb(250 250 248 / .56);
    --fg-faint: rgb(250 250 248 / .40);
    --fg-accent: #6EE7B7;
    --fg-accent-hover: #6EE7B7;
    --fg-danger: #E89A94;
    --line-hair: rgb(250 250 248 / .12);
    --line-strong: rgb(250 250 248 / .24);
    --line-ink: rgb(250 250 248 / .72);
    --line-control: rgb(250 250 248 / .40);
    --line-link: rgb(110 231 183 / .5);
    background-color: var(--surface-ink);
    color: var(--fg-ink);
    color-scheme: dark;

    @media (prefers-contrast: more) {
      --line-hair: rgb(250 250 248 / .32);
      --line-strong: rgb(250 250 248 / .40);
    }
  }
}

@theme inline {
  /* 색: 유틸 이름 = 변수 이름 (C02). --color-surface-ink 는 매핑하지 않는다(먹은 surface-ink 클래스만). */
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

  /* 글자 15종 — typography 소유. 값의 정본은 typography §3-1 표, 여기는 그 표를 옮긴다.
     형식: --text-X / --text-X--line-height / --text-X--letter-spacing: var(--trk-X) / --text-X--font-weight
     예외: text-ui 에는 --font-weight 를 두지 않는다(탭·내비 500, 버튼 600 은 요소가 정한다). */
  --text-h1: clamp(2rem, 1.6rem + 1.6vw, 3rem);
  --text-h1--line-height: 1.2;
  --text-h1--letter-spacing: var(--trk-h1);
  --text-h1--font-weight: 700;
  /* poster display h2 h3 body-l body article ui caption note label folio numeral quote — 같은 형식 */

  --tracking-label: var(--trk-label);
  --tracking-abbr: var(--trk-abbr);

  --container-measure: 38em;
  --container-deck: 34em;
  --container-heading: 18em;
  --container-display: 14em;
  --container-quote: 24em;
  --container-page: 1296px;
  --container-article: 45rem;

  --aspect-case: 3 / 2;
  --aspect-screen: 16 / 10;
  --aspect-portrait: 4 / 5;

  /* :root 의 같은 이름과 리터럴이 같아야 한다 — tests/lib/design-tokens.test.ts 가 대조 */
  --ease-soft: cubic-bezier(.22, 1, .36, 1);
  --ease-drift: cubic-bezier(.45, 0, .55, 1);

  --animate-skeleton: skeleton-blink 1.6s ease-in-out infinite;   /* keyframes 는 site-base.css 보증 구간 안(④ 부속, §13-3) */
  /* --animate-fade-in·--animate-dialog-in 은 controls P2 PR 에서 넣는다(§13-2) */

  --font-sans: /* typography §2-1 값. globals.css 34행에서 그대로 옮긴다 */;
}
```

배선 메모(전부 [실측] 또는 Tailwind 4.1.18 동작):
- `@theme inline`이어야 `.surface-ink` 아래 자손에서 `var()`가 다시 해석된다. 유틸이 `color: var(--fg-muted)`로 출력되어 요소 위치에서 값이 풀린다.
- `--text-X--letter-spacing: var(--trk-X)`는 `letter-spacing: var(--tw-tracking, var(--trk-X))`로 출력된다. 그래서 `(width < 40rem)` 재정의가 반영된다(typography 실측).
- **`@keyframes`를 `@theme` 안에 두면 해당 `animate-*` 유틸이 쓰일 때만 출력된다.** `skeleton-blink`는 보증 ④의 원시 CSS가 이름으로 참조하므로 `site-base.css`의 보증 구간(`guarantee:start/end`) 안, ④ 바로 앞에 둔다. 가드 `site-base-unlayered`는 이 구간 안을 검사하지 않으므로 별도 면제 규정이 필요 없다. **정본 편차(§13-3)**: css_architecture ④는 keyframes를 `@theme inline`에 둔다.
- **`--animate-fade-in`과 `--animate-dialog-in`은 P0에 넣지 않는다.** `animate-fade-in`은 정의가 없는 죽은 클래스인데 어드민 `SmartActionCard.tsx:222`가 쓰고 있다. 정의하는 순간 어드민에 페이드가 생긴다(controls 실측). 두 토큰은 controls P2 PR에서 넣고, 그 PR이 어드민 육안 확인을 맡는다. **정본 편차(§13-2)**: css_architecture ④는 두 토큰과 keyframes를 P0의 tokens.css `@theme inline`에 둔다. '어드민 무변경' 수용 조건을 지키려고 시점만 늦춘다(위치는 정본 그대로 tokens.css).
- tokens.css의 `:root`는 `@layer base` 안에 있다. 기존 `globals.css`의 무레이어 `:root`(shadcn `--accent` 등)와 이름이 겹치지 않으니 충돌도 없다. 기존 `bg-accent`(민트 `#ECFDF5`)와 새 `text-fg-accent`는 다른 유틸이다.

### 3-3. `app/styles/utilities.css` 골격

```css
/* app/styles/utilities.css — @utility 만. 정적 모양만 선언하고 transform·opacity·animation 은 쓰지 않는다.
   명시 예외 3개: index-tab 막대의 opacity 전이, arrow-nudge, 링크 160ms 색 전이.
   forced-colors 대응은 각 유틸 안에 중첩한다. 본문은 소유 스펙이 채운다. */

/* surfaces */   @utility masthead { … }       @utility rule-double { … }   @utility pattern-grid { … }
/* controls */   @utility link-body { … }      @utility link-quiet { … }    @utility index-tab { … }
                 @utility hit-area { … }       @utility arrow-nudge { … }   @utility select-chevron { … }
/* typography */ @utility ink-underline { … }  @utility ink-underline-scrub { … }
/* imagery */    @utility fig-edge { … }       @utility chart-stroke { … }
```

- `@utility`는 쓰일 때만 출력된다. 그래서 P0에 본문을 넣어도 화면 변화는 0이다. 다만 각 본문은 소비 컴포넌트 PR에서 넣는 것을 기본으로 한다(리뷰 단위를 맞추기 위해서).
- 커스텀 유틸 이름에 `text-` 접두는 금지한다. 폐기 목록(`rule-link`, `pattern-rails`, `on-ink`, `draw-path`, `progress-track/rule`, `masthead--draw`)은 정의하지 않는다.

### 3-4. `app/styles/site-base.css` 골격과 보증 블록(전문)

```css
/* app/styles/site-base.css — 공개 셸 규칙. 모든 셀렉터는 :where(.site) 또는 :root:has(.site) 로 시작한다. */

@layer base {
  /* (a) typography·controls·icons 가 채운다 — 목록은 css_architecture (a) */
  :root:has(.site) { color-scheme: light; scroll-padding-top: calc(var(--header-h) + 16px); }
  @media (width < 48rem) {
    :root:has(.site):has([data-subnav]) { scroll-padding-top: calc(var(--header-h) + 16px + 44px); }
  }
  /* :where(.site) … 한글 조판, ::selection, svg.lucide 획, 체크박스, 본문 링크, forced-colors */
}

@layer components {
  /* (b) table-paper, 스위치, status-dot, os-node, row-accent, case-slide, dg-*, chart-accent/compare */
  @media (prefers-reduced-motion: no-preference) {
    /* 모션 무장 규칙은 전부 이 블록 하나에 둔다 — cards_motion 소유 (X07) */
  }
}

/* ── guarantee:start — 무레이어 보증. 닫힌 목록 4개. 이 구간 밖의 무레이어 규칙은 가드가 거부한다 ── */
:where(.site) :where(a[href], button, input, select, textarea, summary, [role=tab], [tabindex]:not([tabindex="-1"])):not([data-focus-ring=parent]):focus-visible {
  outline: 2px solid var(--fg-accent);
  outline-offset: 2px;
}
:where(.site) :where(input:not([type=checkbox], [type=radio], [type=range], [type=color], [type=file], [type=submit], [type=button], [type=reset], [type=image], [type=hidden]), select, textarea) {
  font-size: max(16px, 1em);
}
:where(.site) :where(input, select, textarea):-webkit-autofill {
  -webkit-box-shadow: inset 0 0 0 1000px var(--surface-sheet);
  -webkit-text-fill-color: var(--fg-ink);
  caret-color: var(--fg-ink);
}
@keyframes skeleton-blink { 50% { opacity: .4; } }      /* ④ 부속(규칙이 아니라 이름 정의라 4개 집계 밖). X08·animate-skeleton 공용 */
@media (prefers-reduced-motion: reduce) {
  :where(.site) .animate-spin { animation: skeleton-blink 1.6s ease-in-out infinite; }
}
/* ── guarantee:end ── */
```

- 보증 4개와 `:root:has(.site)` 규칙은 **화면이 바뀐다**(포커스, 16px, 앵커 위치). 그래서 P0가 아니라 P1에 넣는다. P0의 `site-base.css`에는 골격과 보증 구간 표지, 그 구간 안의 `skeleton-blink`만 둔다.
- 먹 위 포커스는 `var(--fg-accent)`가 `.surface-ink`에서 `#6EE7B7`로 바뀌므로 따로 규칙이 필요 없다(C01).

### 3-5. 유틸 어휘(이 목록 밖의 색 유틸은 만들지 않는다)

| 계열 | 유틸 | 비고 |
|---|---|---|
| 면 | `bg-surface-paper·sheet·sunken·skeleton·scrim` | 먹은 `surface-ink` **클래스**만 쓴다. `bg-surface-ink`는 없다 |
| 글자 | `text-fg-ink·body·muted·placeholder·faint·accent·accent-hover·danger·on-accent`, `placeholder:text-fg-placeholder` | `text-fg-faint`는 장식 글리프에만 |
| 선 | `border-/divide-line-hair·strong·ink·control`, `decoration-line-link` | 포커스 outline 유틸은 없다(보증 규칙) |
| primary 채움 | `bg-fg-accent text-fg-on-accent hover:bg-fg-accent-hover` | 먹 위 채움은 0개(C14) |
| 크기 | `text-{15종}`, `tracking-label·abbr`, `max-w-{measure·deck·heading·display·quote·page·article}`, `aspect-{case·screen·portrait}`, `ease-soft·drift`, `duration-(--motion-*)`, `z-(--z-*)`, `top-(--header-h)` | 아이콘은 `size-4/5/6/8`, IconFrame은 `size-10/12` |
| 금지 | `bg-paper/sheet/sunken`, `--color-cta*`, `--color-field`, `--color-overlay`, `--color-ink`, `text-(--fg-*)` 임의값, `outline-line-focus` | 가드 정규식 `(bg\|text\|border\|divide\|decoration)-(surface\|fg\|line)-`의 이름 집합은 위 표와 같다 |

### 3-6. 토큰 소비처 아키텍처(정본 1 + 미러 1, 생성물 0)

| 소비처 | 지금 [실측] | 목표 | 언제 |
|---|---|---|---|
| CSS(공개 화면 전체) | `globals.css` 리터럴·shadcn 변수 | `tokens.css` → `@theme inline` 유틸 | P0 |
| `viewport` themeColor·colorScheme | export 없음 | `app/layout.tsx`: `export const viewport: Viewport = { themeColor: color.paper, colorScheme: "only light" }` | P0 |
| OG 2경로 | `fontFamily: "sans-serif"`, 'C' 배지, 리터럴 hex | `lib/design-tokens.ts` import + Pretendard 정적 OTF(C28, typography 소유) | typography PR |
| `app/global-error.tsx` | 스코프·레이아웃 CSS 없음, 'Inter' 선언 | 인라인 `<style>`에 `color.*` 6개 + 시스템 한글 스택(Apple SD Gothic Neo, Malgun Gothic) | P2(셸) |
| 이메일 `lib/email.ts` | 인라인 `#a39e98` 12/11px 등 | 착수할 때 `lib/design-tokens.ts` import, parity 테스트에 편입 | 백로그 |
| 리드마그넷 PDF `scripts/generate-lead-magnet-pdfs.py` | 파이썬 상수 | 착수할 때 `scripts/design-tokens.json`을 테스트로 대조(손으로 적음) | 백로그(문서면) |
| 정적 랜딩 `public/l/*` 6종 | 생성 HTML, 자체 팔레트 | 지금은 폰트만 맞춘다(typography §2-6). 팔레트 이관 때 `public/css/site-tokens.css` | 백로그(growth-crm) |

```ts
// lib/design-tokens.ts — tokens.css 의 손 미러. CSS 변수를 못 읽는 소비처 전용.
// 값을 바꾸면 tokens.css 와 같은 커밋에서 바꾼다. tests/lib/design-tokens.test.ts 가 대조한다.
export const color = {
  paper: "#FAFAF8",       // --surface-paper
  sheet: "#FFFFFF",       // --surface-sheet
  sunken: "#F6F5F4",      // --surface-sunken
  ink: "#111110",         // --surface-ink
  fgBody: "#31302E",      // --fg-body
  fgMuted: "#615D59",     // --fg-muted
  accent: "#084734",      // --fg-accent
  onAccent: "#FAFAF8",    // --fg-on-accent
  lineControl: "#8F8A84", // --line-control
  danger: "#B43E3E",      // --fg-danger
} as const
```

- 모션 TS 미러(`lib/motion.ts`, 감사 §5-2)는 만들지 않는다. 홈의 framer 소비처가 0이 되기 때문이다(cards_motion). 필요해지면 이 파일에 `motion`을 더하고 같은 테스트로 대조한다.
- `tests/lib/design-tokens.test.ts`(node 환경, 의존성 없음)가 하는 일:
  1. `tokens.css`의 첫 `:root { … }` 블록을 정규식 `/--([\w-]+):\s*([^;]+);/g`로 읽는다.
  2. 위 주석의 10쌍을 대소문자 무시로 대조한다.
  3. `@theme inline`의 `--ease-soft`·`--ease-drift`와 `:root` 값을 공백을 정규화해 대조한다.
  - `--text-*` 이름 집합 대조는 `cn.test.ts` 한 곳에서만 한다(중복 검사 금지). 정본 안에서 위치가 갈린다: brief §3은 `design-tokens.test.ts`, naming 5)·gap_triage는 `cn.test.ts`다. 이 문서는 naming 5)를 택한다. `TEXT_SCALE`을 import하는 파일에서 대조해야 tw-merge 목록 drift를 같은 테스트가 잡기 때문이다(§13-9).

### 3-7. tailwind-merge (`lib/utils.ts` 한 곳)

```ts
import { type ClassValue, clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// tokens.css @theme 의 --text-* 15종과 같은 목록. tests/lib/cn.test.ts 가 대조한다.
export const TEXT_SCALE = [
  "poster", "display", "h1", "h2", "h3", "body-l", "body", "article",
  "ui", "caption", "note", "label", "folio", "numeral", "quote",
] as const

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [...TEXT_SCALE],
      tracking: ["label", "abbr"],
      container: ["measure", "deck", "heading", "display", "quote", "page", "article"],
      ease: ["soft", "drift"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [실측] 지금 `lib/utils.ts`는 설정 없는 `twMerge`다. 그래서 `cn('text-h2 text-fg-ink')`는 `text-h2`를 지운다(surfaces 실측).
- [실측] 15종 이름·`tracking-label/abbr`·`max-w-{7종}`·`ease-soft/drift`의 현재 사용은 0건이다(`tracking-display` 7건은 레거시 클래스라 목록에 넣지 않는다). 그래서 설정을 바꿔도 화면 변화는 0이다.
- `tests/lib/cn.test.ts` 하나에 아래를 둔다.
  - `cn('mt-4 text-h3 text-fg-ink')` → 셋 다 유지
  - `cn('text-body text-h3')` → `'text-h3'`
  - `cn('text-ui text-fg-muted')` → 둘 다 유지
  - `cn('border-line-hair border-line-control')` → `'border-line-control'`
  - `cn('max-w-measure max-w-2xl')` → `'max-w-2xl'`
  - `TEXT_SCALE` 집합 = `tokens.css`의 `/--text-([a-z0-9-]+):/` 중 `--`를 포함하지 않는 이름 집합
- **함정**: tailwind-merge에서 font-size는 `leading-*`과 충돌 그룹이다. `cn('leading-7 text-h3')`는 `leading-7`을 지운다. 행간을 덮어써야 하면 `text-*` 뒤에 둔다.
- 새 text 토큰은 `tokens.css`와 `TEXT_SCALE`을 같은 커밋에서 바꾼다.

---

## 4. 패턴과 값(데스크톱/모바일)

### 4-1. 브레이크포인트(단일 정의, X02)

| 이름 | 값 | Tailwind | 원시 CSS |
|---|---|---|---|
| 모바일 | < 640px | (접두 없음) | `@media (width < 40rem)` |
| sm | ≥ 640px | `sm:` | `(width >= 40rem)` |
| md | ≥ 768px | `md:` | `(width >= 48rem)` / 미만 `(width < 48rem)` |
| lg | ≥ 1024px | `lg:` | `(width >= 64rem)` |
| xl | ≥ 1280px | `xl:` | `(width >= 80rem)` |

- 새 코드에서 `641px`, `767px`, `max-width: 640px`, `width <= 40rem`은 금지한다. typography 스펙의 `(width <= 40rem)` 자간 재정의는 `(width < 40rem)`로 바로잡는다(위 tokens.css). 그래야 정확히 640px에서 `sm:`과 겹치지 않는다.
- 레거시 `globals.css` `max-width: 640px` 3곳(435·508·832행 [실측])은 그 블록을 손댈 때 변환한다.
- **예외**: `<Image sizes>`는 CSS가 아니다. `(min-width: 1024px) 40vw, 100vw`처럼 min-width 형식을 쓰고, 값은 위 경계에 맞춘다.
- `2xl`(96rem)은 기본으로 존재하지만 쓰지 않는다. page 컨테이너 1296px가 그보다 작아 쓸 일이 없다.

### 4-2. 거터·컨테이너

| 요청 이름 | 정본 토큰 | 값 | 용도 |
|---|---|---|---|
| page | `max-w-page` | 1296px. 거터 48 제외 시 lg 콘텐츠 1200 | 모든 Section의 안쪽 컨테이너 |
| prose(칼럼) | `max-w-article` | 45rem = 720px | 블로그·docs·법무 본문 칼럼 |
| prose(문단) | `max-w-measure` | 38em(16px 608 / 17px 646) | 문단·덱 이외의 읽는 글 |
| 기타 측정폭 | `max-w-deck·heading·display·quote` | 34em·18em·14em·24em | typography §3-2 |
| wide | **없음** | — | 풀블리드는 Section 배경만 쓰고, 콘텐츠는 page에 둔다. `bleed` prop은 두지 않는다 |

- 거터는 `px-4 sm:px-6 lg:px-12`(16 / 24 / 48)이다. 모바일 측면 여백은 반드시 16px이고, 가로 스크롤은 0이어야 한다.
- 공개 화면에서는 `.container`(`globals.css:446`, 1400px, `md:px-12 lg:px-24`)를 쓰지 않는다. [실측] 현재 공개 파일 39곳에서 쓰고, `max-w-6xl` 31·`7xl` 20·`[1100px]` 17·`[1080px]` 14 등 임의 폭 8종도 있다. 이들은 라우트 PR마다 page나 article로 바꾼다. 일괄 치환은 하지 않는다.

### 4-3. 간격 스케일·섹션 리듬

- 간격 토큰은 새로 만들지 않는다. Tailwind 기본 `--spacing: 0.25rem`의 배수만 쓴다.
- 세로 리듬 값은 다음 집합 안에서 고른다: 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80 · 96 · 128px.

| `rhythm` | 모바일 | ≥48rem | 클래스 | 쓰는 곳 |
|---|---|---|---|---|
| `base` (기본) | 64 | 96 | `py-16 md:py-24` | 일반 섹션 |
| `act` | 80 | 128 | `py-20 md:py-32` | 홈 Act 01–06, 제품 장 머리 |
| `band` | 40 | 48 | `py-10 md:py-12` | LogoBar, 중간 CTA 띠 |
| `none` | 0 | 0 | — | Hero(자체 상단 여백) 등 |

- 섹션 사이 경계선은 0이다. 구획은 masthead와 여백이 맡는다(X04, C19).
- 머리 간격: masthead `padding-top: 16px` → Kicker→헤딩 12 → 헤딩→덱 16(모바일)/20(≥48rem) → 머리 블록 아래 32/40.
- 카드 그리드 gap은 16, `sm:` 이상에서 24(`gap-4 sm:gap-6`)이다.

### 4-4. 그리드

| 패턴 | 모바일 | ≥40rem | ≥64rem |
|---|---|---|---|
| Hero | 1열(텍스트 → 도판) | 1열 | 12칼럼 `lg:grid-cols-12`, 7 + 5, `gap-12`(48) |
| Hero 상단 여백 | `calc(var(--header-h) + 48px)` = 124 | 40–47.99rem은 124. **≥48rem(`md:`)부터** `calc(var(--header-h) + 80px)` = 160 | 160(≥48rem 값 유지) |
| 카드 그리드(기본) | 1열 | 2열 | 3열 |
| 그 밖의 열 수 | 요소 스펙이 정한다 | | |

### 4-5. 헤더·서브내비·스크롤 오프셋

| 항목 | 모바일 | ≥48rem | 근거 |
|---|---|---|---|
| `--header-h` | 76px | 80px | 현재 비스크롤 높이와 같다(로고 28/32 + `py-6`) [실측] |
| 헤더 | `fixed top-0 inset-x-0 h-(--header-h) z-(--z-header)`, 불투명 `bg-surface-paper` | 같음 | C27. 스크롤 시 높이 변화 0, 하단 hair opacity만 320ms |
| ProductTabNav | `sticky top-(--header-h) z-(--z-subnav)` + `data-subnav`, 높이 44 | `md:hidden`(현행) | 현재 `top-[80px] z-40` [실측] |
| 앵커 오프셋 | `scroll-padding-top: header-h + 16` = 92, 서브내비가 있으면 +44 = 136 | 96 | `:root:has(.site)`(P1) |

- **Section에는 `scroll-mt-*`을 두지 않는다.** 루트 `scroll-padding`과 대상의 `scroll-margin`은 합산된다. 둘 다 두면 헤더 높이만큼 더 내려간다. 그래서 이 문서는 system brief §1 출력 문자열의 `scroll-mt-(--header-h)`를 뺀다. **정본 편차(§13-4)**: brief §1은 Section 출력에 `scroll-mt-(--header-h)`를 넣는다.
- [실측] 공개 파일 7곳의 `scroll-mt-*`(3·4·6·16·임의값)은 P1에서 루트 규칙을 켜는 커밋에서 같이 지운다. 하드코딩 오프셋(`top-[80px]`, `scrollY - 80` 등)은 surfaces의 치환 목록을 따른다.

### 4-6. 고정 레이어 스택(X09)과 safe-area

| z | 토큰 | 레이어 | 모바일(< 48rem) 위치 | 데스크톱 위치 |
|---|---|---|---|---|
| 30 | `--z-subnav` | ProductTabNav(sticky) | `top: var(--header-h)` | 없음(`md:hidden`) |
| 40 | `--z-header` | Header, ReadingProgress(같은 층, DOM 순서로 위) | top 0 | top 0 |
| 42 | `--z-floating` | MobileFloatingCTA(아웃라인) | `left-3`, `bottom: calc(env(safe-area-inset-bottom) + 16px + 6px)`, 높이 44(현행 `+1rem+6px` 유지, 정본 편차 §13-5) | 없음 |
| 44 | `--z-chatbot` | FloatingChatbot 런처·패널 | 런처 `right-3`, `bottom: calc(env(safe-area-inset-bottom) + 16px)`, 56px | `right-6 bottom-6` |
| 46 | `--z-consent` | ConsentBanner | `inset-x-3`, `bottom: calc(env(safe-area-inset-bottom) + 16px)`(정본 brief §2. 현행 `bottom-3`은 safe-area 미반영 [실측]) | `left-6 bottom-6`, max-w 392 |
| 50 | (공유 기본값) | Radix Dialog·오버레이 | 가운데, `max-sm` safe-area 패딩(현행 `dialog.tsx:46-49`) | 가운데 |
| 60 | `--z-skiplink` | SkipLink(포커스 시에만 보인다) | `left-4 top-4` | 같음 |
| 9999 | (공유 기본값) | 토스트 뷰포트(공개 위치는 P1) | `inset-x-4`, `bottom: calc(env(safe-area-inset-bottom) + 80px)`(제안값, 정본 72px. 운영자 확인 §12-4) | `right-4`, `top: calc(var(--header-h) + 16px)` |

- **safe-area 공식은 하나다**: 하단 고정 레이어는 `bottom: calc(env(safe-area-inset-bottom) + Npx)`를 쓴다. `viewport-fit`은 기본값(auto)을 유지한다. 지금 iPhone 세로 화면에서는 env 값이 0이 되지만[추정], 가로 화면과 향후 `cover` 전환에 대비해 식은 유지한다.
- **하단 플로팅 기준선**: 정본(brief §2)은 `+ 16px`이다. ConsentBanner·챗봇 런처는 정본대로 둔다. MobileFloatingCTA만 현행 `+1rem+6px`(= 16 + 6)를 유지한다. 높이 44인 CTA의 중심선을 높이 56인 런처의 중심선(16 + 28 = 44)에 맞춘 현행 값이라 P1에서 위치가 바뀌지 않는다. **정본 편차(§13-5)**.
- **토스트 모바일 80px(제안값, 정본 편차 §13-6)**: 정본(brief §2 '플로팅 CTA 위 +44px+12px')대로 계산하면 16 + 44 + 12 = 72px다. 그런데 전폭(`inset-x-4`) 토스트가 오른쪽에서 챗봇 런처(`h-14` 56 [실측], 윗변 16 + 56 = 72)와 틈 0으로 맞닿는다. 그래서 16 + 56 + 8 = 80px을 제안한다. 운영자 확인(§12-4) 전까지는 이 문서의 80px로 그린다. 확인되면 brief §2 문구를 고치고, 런처가 44로 바뀌면 정본 72px로 되돌린다.
- **토스트 데스크톱 top**: 현행 `top-4`는 헤더 오른쪽 CTA를 가린다. 공개 화면에서만 `top: header-h + 16`으로 내린다. 위치 변경은 화면이 바뀌므로 **P1**이다(P0은 `site`만 붙인다). 공유 기본 문자열은 바꾸지 않는다(§5-1 코드).
- **전폭 고정 래퍼는 `pointer-events-none`**, 실제 조작 요소만 `pointer-events-auto`로 둔다. z가 높은 전폭 래퍼가 아래 레이어의 탭을 삼키기 때문이다. 감사 P0-2가 이 경우다(챗봇 `fixed inset-x-0 bottom-0 z-50` 래퍼가 모바일 CTA를 막음 [실측]).
- 화면 하단에 채움 덩어리는 두지 않는다(플로팅 CTA는 아웃라인).

### 4-7. 동시 노출 규칙

| 상황 | 숨기는 것 | 방법(한 곳) |
|---|---|---|
| 쿠키 배너가 열려 있음 | MobileFloatingCTA, 챗봇 **런처**(대화 상태는 보존) | AppChrome이 이미 `useConsent()`를 갖고 있다. 두 위젯을 감싼 `<div hidden={bannerOpen}>`(언마운트하지 않음). `hidden`이면 inert도 따라온다 |
| 모바일 메뉴가 열림 | `main`·`footer`는 `inert`. 헤더보다 z가 높은 플로팅(42·44)은 `inert` + 숨김 | Header의 메뉴 effect 한 곳에서 `[data-inert-with-menu]`를 토글한다. 플로팅에는 `data-inert-with-menu="hide"`를 단다 |
| 챗봇 패널이 열림 | MobileFloatingCTA(숨김 + 포커스 제외, brief §2) | 덮는 것만으로는 CTA가 Tab 순서에 남는다. FloatingChatbot의 기존 `isOpen` effect 한 곳에서 `[data-hide-with-chat]`의 `hidden`을 토글한다. MobileFloatingCTA 래퍼에 `data-hide-with-chat`을 단다(메뉴의 `[data-inert-with-menu]`와 같은 방식) |
| Dialog가 열림 | 그 아래 전부 | Radix 오버레이(50). 쿠키 배너(46)도 덮인다. 지금은 배너가 `z-[120]`이라 Dialog 위에 뜬다 [실측] |
| 채널톡 | — (기본: 현행 유지, 겹침 0) | 부트 시 버튼을 숨긴다 [실측]. 메신저는 챗봇에서 열 때만 뜨고, 서드파티 기본 z로 우리 스택 위에 놓인다. 그래서 기본값에서는 추가 규칙이 필요 없다. 버블을 따로 노출할지(병존)는 정본대로 운영자 확인 사항이다(§12-9). 노출로 정해지면 그때 위치 규칙을 더한다 |

---

## 5. 사용 규칙과 대상 파일

### 5-1. `.site` 스코프(C17)

**붙이는 곳은 정확히 셋.**

```ts
// lib/internal-path.ts (신규) — AppChrome.tsx:60 의 함수를 옮긴다. 새 제외 상수는 만들지 않는다.
export function isInternalPath(pathname: string) {
  return pathname.startsWith("/admin") || pathname.startsWith("/checkout") || pathname.startsWith("/receipt")
}
```

```tsx
// ① components/AppChrome.tsx — 공개 분기(showPublicChrome = !isInternalPath)에서만 래퍼로 감싼다(SSR, display: contents).
//    Header·main·Footer 와, 같은 공개 분기에서 AppChrome 이 렌더하는 플로팅(ConsentBanner·FloatingChatbot·
//    MobileFloatingCTA·ChannelTalkLoader)이 함께 들어간다. 이들은 포털이 아니다 [실측 AppChrome.tsx:119-160].
//    어드민 분기는 래퍼 없이 지금 DOM 그대로다(어드민 무변경).
const chrome = (
  <>{/* 기존 반환 내용 그대로. P1 에서 main 에 id="main" tabIndex={-1}, 맨 앞에 SkipLink */}</>
)
return showPublicChrome ? <div className="site contents">{chrome}</div> : chrome

// ② 공개 DialogContent 5곳: className 에 "site" 를 더한다. components/ui/dialog.tsx 기본값은 바꾸지 않는다.
//    components/sections/DemoModal.tsx, components/sections/NewsletterModal.tsx,
//    components/events/EventSignupModal.tsx, components/auth/PublicLoginDialog.tsx,
//    components/checkout/CheckoutRequestForm.tsx
<DialogContent className={cn("site", …)}>

// ③ components/ui/toast.tsx:46 — 뷰포트가 AppChrome 밖(app/layout.tsx 의 ToastProvider)이다. 경로로 붙인다.
//    P0: site 만 붙인다(C17 ③, 화면 변화 0).
const pathname = usePathname()
<div aria-live="polite" aria-atomic="false" className={cn(
  "fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none",          // 공유 기본값, 불변
  !isInternalPath(pathname) && "site",
)}>
//    P1: 공개 위치(§4-6)를 같은 조건 문자열에 더한다. 모바일 80px 은 운영자 확인(§12-4) 전 제안값이다.
//    !isInternalPath(pathname) &&
//      "site md:top-[calc(var(--header-h)+16px)] max-md:inset-x-4 max-md:top-auto max-md:items-center max-md:bottom-[calc(env(safe-area-inset-bottom)+80px)]"
```

- **소비 방식은 셋뿐이다**: CSS `:where(.site)` 접두(특이도 0), 공유 컴포넌트의 `[.site_&]:` 변형 또는 새 variant(기본 문자열 불변, C17), 루트 속성용 `:root:has(.site)`. 기본은 임의 변형 `[.site_&]:`이다. 같은 변형이 여러 공유 컴포넌트에서 반복되면 `site-base.css` 머리에 `@custom-variant site (.site &);` 한 줄을 더해 `site:`로 바꿔 쓸 수 있다(C17이 허용). 지금 소비처가 없으므로 P0에는 넣지 않는다.
- **스코프 밖에 남는 것**:
  - Radix `DialogOverlay`: `DialogContent`와 같은 포털에 형제로 렌더되므로 `.site` 밖이다. 공개 오버레이를 scrim 토큰으로 바꿔야 하면 `DialogContent`에 선택 prop `overlayClassName`(기본값 불변)을 더한다. 이 결정은 controls가 한다.
  - `app/global-error.tsx`: 자체 `<html>`이라 셸 밖이다. 인라인 `<style>`로 스스로 해결한다(§3-6).
- **`/share/*`**: 공개 크롬 안이라 `.site` 안이다. `quote-paper.module.css`(무레이어, 특이도 > 0)가 보증 규칙(16px·autofill·포커스)을 이기는지는 P0 스크린샷 diff로 확인한다(C17·css_architecture). P0에서 찍은 `/share` 1건(§9 P0-2)이 기준 캡처다. 보증 규칙이 실제로 켜지는 것은 P1이므로, 보증 커밋에서 같은 캡처를 다시 찍어 P0 기준과 차이 0을 확인한다(§9 P1-2).
- **포털 추가 규칙**: 공개 화면에서 렌더되는 Radix `*Content`(Dialog·Popover·Select·DropdownMenu·Sheet)는 className에 `site`를 넣는다. 가드가 검사한다.
- **만들지 않는 것**: `body[data-shell]` effect, `.on-ink`, 별도 포털 루트, `lib/internal-path.ts` 밖의 경로 판정 함수.

### 5-2. `Section` (P2, `components/landing/Section.tsx`, 서버 컴포넌트)

```tsx
import type { ComponentPropsWithoutRef } from "react"
import { cn } from "@/lib/utils"

const SURFACE = { paper: "bg-surface-paper", sheet: "bg-surface-sheet", sunken: "bg-surface-sunken", ink: "surface-ink" } as const
const RHYTHM = { base: "py-16 md:py-24", act: "py-20 md:py-32", band: "py-10 md:py-12", none: "" } as const

type SectionProps = ComponentPropsWithoutRef<"section"> & {
  surface?: keyof typeof SURFACE
  rhythm?: keyof typeof RHYTHM
}

export function Section({ surface = "paper", rhythm = "base", className, children, ...rest }: SectionProps) {
  return (
    <section data-surface={surface} className={cn("relative overflow-x-clip", SURFACE[surface], RHYTHM[rhythm], className)} {...rest}>
      <div className="mx-auto w-full max-w-page px-4 sm:px-6 lg:px-12">{children}</div>
    </section>
  )
}
```

- 훅과 `"use client"`가 없다. `rails`·`bleed`·`folio` prop도 없다. masthead와 Kicker는 children에 둔다.
- `overflow-x-clip`은 캐러셀 넘침을 자르지만 스크롤 컨테이너를 만들지 않는다. 그래서 sticky가 살아 있다(감사 P0-3과 같은 원리).
- `data-surface`는 빌드 HTML 예산의 마커다(§5-4). Footer는 Section을 쓰지 않는 `<footer class="surface-ink">`이고, `data-surface`를 달지 않는다.
- 홈 배경 시퀀스와 `sunken` 연속 금지는 surfaces(C19)가 정한다.

### 5-3. z 이관 대상(X09 + 실측 보강)

| 파일 [실측] | 현재 | 변경 | 단계 |
|---|---|---|---|
| `components/sections/Header.tsx:54` | `fixed … z-50` | `z-(--z-header)` | P1 |
| `components/sections/Header.tsx:134` | 드롭다운 `z-40`(헤더 안 로컬) | `z-10`(로컬 겹침) | P1 |
| `components/sections/ProductTabNav.tsx:19` | `sticky top-[80px] z-40` | `top-(--header-h) z-(--z-subnav)` + `data-subnav` | P1 |
| `components/ui/MobileFloatingCTA.tsx:101` | `z-40` | `z-(--z-floating)` | P1(다른 세션 머지 뒤) |
| `components/ui/FloatingChatbot.tsx:1301` | `fixed inset-x-0 bottom-0 z-50` | `z-(--z-chatbot)` + `pointer-events-none`(자식 auto) | W0 핫픽스 P0-2와 함께 |
| `components/consent/ConsentBanner.tsx:105` | `z-[120]` | `z-(--z-consent)` | P1 |
| `components/blog/ReadingProgress.tsx:37` | `z-[60]` | `z-(--z-header)`(DOM이 헤더보다 뒤라 위에 그려진다) | P1 |
| 신규 SkipLink(AppChrome 첫 자식) | 없음 | `z-(--z-skiplink)` | P1 |
| `components/ui/dialog.tsx:22,41`, `components/ui/toast.tsx:46` | `z-50`, `z-[9999]` | 유지(공유 기본값, 가드 허용 목록) | — |

### 5-4. 디자인 가드 (`scripts/check-design-tokens.mjs` 확장)

[실측] 현재 스크립트는 `components/admin/branch/`만 스캔한다. 패턴은 3개(`#1E5DA8`, `rose/emerald/sky-N`, `#7B8B36`)이고 `ALLOWLIST`는 비어 있다. 실행 시간은 0.07s이고, `prebuild`(`check:vercel-crons && check:design-tokens`)에서 이미 돈다. 그래서 게이트 순서는 바꿀 필요가 없다.

**구조(같은 파일, 새 의존성 0)**

```js
// 스캔 범위 — 글롭 대신 접두 목록(Vercel Node 버전에 따른 path.matchesGlob 가용성에 기대지 않는다)
const PUBLIC = {
  roots: ["app/", "components/", "lib/"],
  exts: [".ts", ".tsx", ".css"],
  exclude: [
    "app/admin/", "app/api/", "app/checkout/", "app/receipt/",
    "components/admin/", "components/portal/crud/", "components/portal/home/",   // 소비처가 어드민뿐 [실측]
    "lib/admin", "lib/branch/", "lib/crm/",
  ],
}
// 규칙: { id, files, pattern, message, allow: [접두|파일], severity: "warn"|"error", errorFrom?: "YYYY-MM-DD", check?: fn }
// 정본 편차(§13-8): brief §6 형식은 { id, glob, pattern, message, allow:[glob], severity, errorFrom } 이다.
// 같은 자리에 glob 대신 접두 목록(files·allow)을 둔다. 뜻은 같고, 필드 이름과 매칭 방식만 다르다.
// message 에는 대체 토큰을 적는다. 예: "#A39E98 → text-fg-muted(글자) / border-line-control(조작 경계)"
const RULES = [ /* 아래 표 */ ]
```

- 기존 3패턴은 `files: { roots: ["components/admin/branch/"] }`, `severity: "error"`인 규칙 3개로 옮긴다. 동작은 같아야 한다(수용 기준).
- 주석 제거(`stripComments`, CRLF 정규화)는 기존 함수를 재사용한다. CSS 파일에도 `/* */` 제거를 적용한다.
- **베이스라인** `scripts/design-baseline.json`: `{ "createdAt": "YYYY-MM-DD", "counts": { "<ruleId>": { "<path>": n } } }`. 규칙 × 파일 건수다.
  - 판정: 현재 건수가 베이스라인보다 많으면 위반이다. `warn`이면 출력만 하고 exit 0, `error`이고 오늘이 `errorFrom` 이후이면 exit 1이다. 베이스라인에 없는 파일은 0에서 시작한다.
  - 건수가 줄면 "줄었음 — `--update-baseline`으로 내리세요"를 출력한다(exit 0).
- **CLI**
  - (인자 없음) prebuild 검사.
  - `--init`: P0에서 한 번만 베이스라인 파일을 만든다. 파일이 있으면 거부한다.
  - `--update-baseline`: 각 값을 `min(현재, 기존)`으로 쓴다. 늘어난 항목이 하나라도 있으면 쓰지 않고 exit 1. **올리는 경로는 없다.**
  - `--budget`: 빌드 HTML 예산(아래).
- **경고 기간**: 기존 위반이 있는 규칙은 `warn`으로 시작하고, `errorFrom` = P0 머지일 + 14일(P0 PR에서 날짜를 적는다). 구조 규칙(현재 위반 0건이 확실한 것)은 처음부터 `error`다.

**1차 규칙**

참고 건수는 2026-10-26 작업 트리의 공개 범위 약 600파일을 grep으로 셌다 [실측]. 정식 값은 `--init`이 만든다.

| id | 패턴(요지) | 허용 | 초기 | 참고 건수 |
|---|---|---|---|---|
| `hex-literal` | `#[0-9a-f]{3,8}` (앞이 `[\s"'(:,\[{]`) | `lib/design-tokens.ts`, `app/styles/tokens.css`, `app/styles/site-base.css`의 `::selection` 줄(정본 편차 §13-10), `app/opengraph-image.tsx`, `app/twitter-image.tsx`, `app/global-error.tsx`, `components/portal/quotes/`, brand-glyphs, `components/auth/SocialLoginRow.tsx` | warn | 3,827 / 162파일 |
| `pastel-green` | `#ECFDF5`, `#D1FAE5` | `::selection` 줄 | warn | 261 / 78 |
| `ink-bg-literal` | `bg-[#111110]`, `bg-black`, `bg-surface-ink` | — | warn | — |
| `text-px` | `text-[Npx]` | — | warn | 965 / 101 |
| `tracking-literal` | `tracking-[…]`, `letterSpacing:` | — | warn | 234 + 47 |
| `radius-large` | `rounded(-[trblse]{1,2})?-(2xl\|3xl\|[≥16px])` | `components/ui/dialog.tsx`(공유 기본값) | warn | 200 / 65 |
| `shadow` | `shadow-*`(단 `shadow-deep`, `shadow-none` 제외) | — | warn | 236 / 64 |
| `lucide-strokewidth` | JSX `strokeWidth=` | `components/icons/`(커스텀 글리프) | warn | — |
| `lucide-retired` | `import { … Sparkles … } from "lucide-react"`(목록은 icons 소유) | — | warn | — |
| `token-decl-outside` | `--(surface\|fg\|line)-[a-z-]+\s*:`, `.surface-ink\s*{`, `.on-ink` | `app/styles/tokens.css` | **error** | 0 |
| `site-base-unlayered` | `site-base.css`의 `guarantee:start/end` 밖 무레이어 규칙·at-rule(괄호 깊이 추적, `@keyframes` 포함). 구간 안은 검사하지 않는다(보증 4개 + ④ 부속 `@keyframes skeleton-blink`) | — | **error** | 0 |
| `globals-public-rule` | `app/globals.css` 안 `.site`, `--(surface\|fg\|line)-` | — | **error** | 0 |
| `radix-content-site` | `<(Dialog\|Popover\|Select\|DropdownMenu\|Sheet)Content[\s\S]*?>`에 `site` 없음 | `components/ui/` | warn → P0 수정 후 **error** | 5 |
| `main-outside-chrome` | `<main[\s>]` | `components/AppChrome.tsx` | warn | 17파일(공개 16 + `CheckoutClient`) |
| `scope-display` / `scope-poster` / `scope-folio-null` | `(?<![-\w])text-display(?![-\w])`, `(?<![-\w])text-poster(?![-\w])`, `folio=\{null\}`. 앞뒤 `-`·단어 문자를 막아 tokens.css의 `--text-display`·`--text-display--line-height` 같은 토큰 선언은 걸리지 않는다 | 각각 `components/sections/Hero.tsx`, `Manifesto.tsx`, `Hero.tsx` | **error** | 0 |
| `ink-primary-button` | `surface-ink`가 있는 파일의 `<Button`에 `variant="(line\|ghost)"` 없음(휴리스틱) | — | warn | — |
| `motion-banned` | `animate-ping\|animate-bounce\|repeat:\s*Infinity\|hover:scale-\|will-change\|stroke-?[dD]ashoffset` | — | warn | 6 + 15 + 29 + 3 + 8 |
| `z-literal` | `\bz-(\[\d+\]\|30\|40\|50)\b` | `components/ui/dialog.tsx`, `components/ui/toast.tsx` | warn | 10 / 8 |
| `duration-literal` | `duration-\d+`, `delay-\d+`, `duration-\[`, framer `duration:\s*[\d.]+` | `app/styles/` | warn | — |
| `public-import` | `@/components/ui/badge`, `from "recharts"` | — | **error** | 0 + 1(`DashboardPreviewCharts`, C06에서 삭제) |
| `honesty-placeholder` | `credit`… `○○`, `source`…`"(예시\|샘플\|추정)"` | — | **error** | — |
| `numeric-claim` | JSX 텍스트 `\d[\d,.]*\s*(\+\|만\|억\|개국\|%\|배\|곳\|명)` | `lib/facts.ts`, mock Frame 안(`source` 종류가 `mock`인 `<Frame>`의 자식. `check`가 같은 파일에서 여는·닫는 태그 사이를 건너뛴다), `content/`·블로그 본문 | warn(고정) | — |
| `tolocale-direct` | `.toLocale(String\|DateString\|TimeString)(` | `lib/format.ts` | warn(고정) | 56 / 28 |
| `admin-branch-*` (기존 3개) | 현행 그대로 | 현행 그대로 | **error** | 0 |

- `z-literal`은 정본(brief §6·X09)의 `z-[N]·z-50`에 `z-30·z-40`을 더했다(**정본 편차 §13-7**, 범위 확장). 페이지 수준 레이어가 실제로 `z-40`을 쓰고 있기 때문이다(ProductTabNav·MobileFloatingCTA·헤더 드롭다운 [실측]). 컴포넌트 안 로컬 겹침용 `z-0/10/20`은 허용한다.
- 번호 체계 ≤ 2와 아이콘 의미는 리뷰 체크리스트로 본다(AST 검사 없음).

**빌드 HTML 예산 `--budget`** — `postbuild`를 `npm run check:public-content && node scripts/check-design-tokens.mjs --budget`으로 바꾼다.

- 읽는 파일 [실측 경로]: `.next/server/app/index.html`, `product/sw.html`, `product/hw.html`, `pricing.html`.
- 페이지 단위 기준: `data-surface="ink"` ≤ 1(Footer는 마커가 없어 집계 밖), `class="…pattern-grid…"` ≤ 1, `data-moment` ≤ 6.
- 섹션 단위 기준: HTML을 `<section `로 나눈 조각마다 `data-reveal` ≤ 1, `data-frame` ≤ 1. `data-surface="sheet"` 조각 안에서는 `data-face="sheet"`가 0이어야 한다(C19: sheet 면 카드 index·case·plan·frame은 paper·sunken 위에만).
- 마커는 소유 스펙과의 계약이다. Frame도 sheet 면이다(X10 'sheet + 1px hair'). 그래서 Frame 루트는 `data-frame`과 `data-face="sheet"`를 **둘 다** 단다. 그래야 sheet 섹션 안 Frame도 예산이 잡는다.

| 마커 | 붙이는 곳 | 소유 |
|---|---|---|
| `data-surface` | Section | system |
| `data-moment` | 서사 모먼트 루트 | cards_motion C08 |
| `data-reveal` | Reveal | cards_motion X07 |
| `data-frame` | Frame 루트 | imagery X10 |
| `data-face="sheet"` | sheet 면 카드 루트(index·case·plan) + Frame 루트 | 카드는 cards_motion, Frame은 imagery(X10, `components/ui/figure.tsx`) |

- ponytail: `<section` 분할은 정규식이다. Section은 중첩하지 않는다는 규칙에 기댄다. 중첩이 생기면 그때 파서를 검토한다.
- 마커가 아직 없는 동안 예산은 0으로 통과한다. 그래서 처음부터 `error`로 둔다.

### 5-5. 사실 레지스트리 (`lib/facts.ts`, P2 — Numeral과 같은 PR)

```ts
export type Fact = {
  id: string
  value: string                         // 화면에 그대로 쓰는 문자열('160', '6만'). 계산하지 않는다
  unit?: string                         // '개국' · '곳' · '%'
  label: string
  source: { name: string; href?: string }
  asOf: `${number}-${number}`           // 'YYYY-MM'
  owner: string                         // 갱신 책임자(파트 이름)
}

export const FACTS = {
  // 출처 문서가 확인된 것만 등록한다(콘텐츠 담당 확인). 비어 있으면 Numeral 을 쓸 수 없다 — 의도된 동작.
} as const satisfies Record<string, Fact>

export type FactId = keyof typeof FACTS
```

- `Numeral`·`ScaleFacts`·`Stat`은 `factId: FactId`만 받고 숫자 prop은 받지 않는다. 예시 수치는 Frame 안 mock이나 차트 `example: true`로만 쓴다(X11).
- `tests/lib/facts.test.ts`는 다음을 실패시킨다.
  - `source.name`이 비었거나 `/^(예시|샘플|추정)$/`인 것
  - `asOf`가 실행일 기준 12개월을 넘긴 것(의도된 시한 장치. 갱신하거나 화면에서 빼야 통과한다)
  - 어떤 문자열이든 `○○`가 있는 것
  - 키와 `id`가 다른 것
- 등록하지 않는 것: 출처 없는 수치. 예: ProblemCost 4종, HW 12개국·1,200+, '30+ 수업 도구'(실제 26개), GlobalScale 160+·6만+(감사 D3·D5). 등록하지 않으면 화면에서 빠진다. 새 수치를 만들지 않는다.

### 5-6. 한국어 표기 유틸 (`lib/format.ts`, P0)

[실측] 재사용할 것이 이미 있다. `lib/crm/phone.ts formatKoreanPhone`(국제표기 정규화, 02 가변, 10/11자리)과 `lib/billing/plans.ts formatKrw`(`toLocaleString("ko-KR") + "원"`)이다. 새로 쓰는 것은 아래뿐이다.

```ts
import { formatKoreanPhone } from "@/lib/crm/phone"

const TZ = "Asia/Seoul"                 // Vercel 서버는 UTC
const MINUS = "−"
const nf = new Intl.NumberFormat("ko-KR")
const parts = (d: Date, o: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, ...o }).formatToParts(d).map((p) => [p.type, p.value]))

export const formatNumber = (n: number) => nf.format(n).replace("-", MINUS)
export const formatKRW = (n: number) => `${formatNumber(n)}원`                     // 표·가격: 붙여 쓴다
export function formatKRWCompact(n: number) {                                      // 문장·헤드라인: 띄어 쓴다
  const sign = n < 0 ? MINUS : ""
  const abs = Math.abs(n)
  if (abs < 10_000) return `${sign}${nf.format(abs)}원`
  const totalMan = Math.round(abs / 10_000)
  const eok = Math.floor(totalMan / 10_000), man = totalMan % 10_000
  return `${sign}${[eok && `${nf.format(eok)}억`, man && `${nf.format(man)}만`].filter(Boolean).join(" ")} 원`
}
export function formatDate(d: Date | string, style: "meta" | "prose" = "meta") {
  const p = parts(new Date(d), { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
  return style === "meta" ? `${p.year}.${p.month}.${p.day}` : `${Number(p.month)}월 ${Number(p.day)}일(${p.weekday})`
}
export function formatTime(d: Date | string) {
  const p = parts(new Date(d), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  return `${p.hour}:${p.minute}`
}
export function formatPhone(v: string) {                                           // 대표번호 8자리만 새로 처리
  const d = v.replace(/\D/g, "")
  return /^1[568]\d{6}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4)}` : formatKoreanPhone(v)
}
```

| 함수 | 입력 → 출력 | 용도 |
|---|---|---|
| `formatNumber` | `1200` → `1,200` · `-34` → `−34` | 수치(`tabular-nums`) |
| `formatKRW` | `1200000` → `1,200,000원` | 표·가격 |
| `formatKRWCompact` | `12000000` → `1,200만 원` · `120000000` → `1억 2,000만 원` · `9000` → `9,000원` | 문장·헤드라인 |
| `formatDate(d,'meta')` | → `2026.10.26` | 바이라인·목록 |
| `formatDate(d,'prose')` | → `10월 26일(월)` | 행사·안내 문장 |
| `formatTime` | → `14:00` | 일정 |
| `formatPhone` | `0212345678` → `02-1234-5678` · `01012345678` → `010-1234-5678` · `15880000` → `1588-0000` | 연락처 |

- 퍼센트는 붙여 쓴다(`34%`). USD 함수는 만들지 않는다. 결제 플래그가 OFF이면 USD를 노출하지 않는다(감사 D6). 기존 `lib/billing/plans.ts formatUsd`는 결제 화면 전용으로 남긴다.
- `lib/billing/plans.ts`의 `formatKrw`는 `export { formatKRW as formatKrw } from "@/lib/format"`로 바꾼다. 양수에서 출력이 같다. 가격은 음수가 없다.
- `tests/lib/format.test.ts`: 위 표의 각 행 1건 + 자정 경계 1건(`new Date("2026-10-25T15:00:00Z")` → `2026.10.26`) + `formatTime("2026-10-26T05:00:00Z")` → `14:00`. 2026-10-26이 월요일임은 확인했다 [실측].

### 5-7. 새 파일·바뀌는 파일 일람

| 단계 | 새 파일 | 바뀌는 파일 |
|---|---|---|
| P0 | `app/styles/tokens.css`, `utilities.css`, `site-base.css`(골격), `lib/design-tokens.ts`, `lib/internal-path.ts`, `lib/format.ts`, `scripts/design-baseline.json`, `tests/lib/{design-tokens,cn,format}.test.ts` | `app/globals.css`(import 3줄, `--font-sans` 이동 — 정본 편차 §13-1), `app/layout.tsx`(viewport), `lib/utils.ts`, `components/AppChrome.tsx`(공개 분기 래퍼), `components/ui/toast.tsx`(`site`만), 공개 Dialog 5곳, `lib/billing/plans.ts`(재수출 1줄), `scripts/check-design-tokens.mjs`, `package.json`(postbuild), `DESIGN.md` |
| P1 | — | `site-base.css`((a)·(c) 채움), z 이관 7곳, `scroll-mt-*` 7곳, 중첩 `<main>` 16파일, `app/layout.tsx`(`scroll-smooth` → `motion-safe:scroll-smooth`), SkipLink(AppChrome), `components/ui/toast.tsx`(공개 위치, §4-6), `components/ui/FloatingChatbot.tsx`(`[data-hide-with-chat]` 토글), `components/consent/ConsentBanner.tsx`(하단 `+16px`) |
| P2 | `components/landing/Section.tsx`, `lib/facts.ts`, `tests/lib/facts.test.ts` | `app/global-error.tsx` |

---

## 6. 접근성·대비

대비는 WCAG 2.x 상대 휘도로 계산했다(white / paper / sunken).

| 토큰 | 값 | 대비 | 허용 용도 |
|---|---|---|---|
| `--fg-ink` | #111110 | 18.89 / 18.08 / 17.35 | 제목·강조 |
| `--fg-body` | #31302E | 13.18 / 12.62 / 12.11 | 본문 |
| `--fg-muted` | #615D59 | 6.53 / 6.24 / 5.99 | 보조 글자(13px 이상) |
| `--fg-placeholder` | #78736D | 4.70 / 4.49 / 4.31 | 플레이스홀더. **흰 입력 바탕(sheet) 위에서만** |
| `--fg-faint` | #A39E98 | 2.66 / 2.54 / 2.44 | 장식·비활성 표시. **텍스트 금지** |
| `--fg-accent` | #084734 | 10.71 / 10.25 / 9.83 | 링크·Kicker·포커스 |
| `--fg-danger` | #B43E3E | 5.68 / 5.43 / 5.21 | 오류 |
| `--line-control` | #8F8A84 | 3.42 / 3.27 / 3.14 | 조작 경계·도해 정보선(비텍스트 3:1) |
| `--line-link` | #084734 /.6 | paper 위 3.43 | 밑줄(색만으로 구분하지 않음) |
| on-accent / accent | #FAFAF8 / #084734 | 10.25(hover 7.68) | primary 버튼 |
| 먹 위 body / muted / faint | /.72 /.56 /.40 | 9.61 / 6.14 / 3.70 | faint는 장식 전용 |
| 먹 위 accent / danger / control | #6EE7B7 / #E89A94 / /.40 | 12.40 / 8.53 / 3.70 | 포커스·링크 / 오류 / 조작 경계 |
| hair / strong | /.08 /.16 | 1.18 / 1.41 | 장식 구분선(정보 전달 금지). 대비 강화 모드에서는 /.32 (2.10)와 #8F8A84 |

- **포커스**: 보증 규칙 1개, `2px solid var(--fg-accent)`, offset 2px. 먹 위에서는 자동으로 #6EE7B7이 된다. 컴포넌트별 `focus:ring`은 공개 화면에서 새로 쓰지 않는다.
- **입력 16px**: 보증 규칙 `max(16px, 1em)`이다. iOS 확대 임계와 같다. 공개 Dialog·챗봇 입력·푸터 뉴스레터에 자동 적용된다.
- **확대 수용 4상태**: Android 글꼴 최대, iOS Aa 150%, 브라우저 200%, 텍스트 간격 사용자 CSS(1.4.12). 각 상태에서 잘림·겹침·가로 스크롤이 0이어야 한다. 컨트롤은 `height` 대신 `min-height`로 만든다. 헤더만 고정 높이(`--header-h`)인데, 확대 시 내비가 줄바꿈되지 않게 하는 일은 controls가 맡는다(모바일은 메뉴 시트).
- **스킵 링크·랜드마크**: AppChrome 첫 자식으로 `<a href="#main">본문 바로가기</a>`(포커스 시에만 보임, `z-(--z-skiplink)`)를 둔다. `<main id="main" tabIndex={-1}>`는 AppChrome 하나뿐이다. 중첩 `<main>` 16파일은 `div`나 `article`로 바꾼다. 모양은 controls §3.6이 정한다.
- **동작 줄이기**: 토큰(`--motion-rise` 0, `--motion-stagger` 0), 무장 CSS 단일 블록(no-preference), reduced 스피너(보증 ④)로 처리한다. `app/layout.tsx`의 `<html className="scroll-smooth">`는 `motion-safe:scroll-smooth`로 바꾼다(지금은 reduced에서도 부드러운 스크롤 [실측]).
- **강제 색상**: `forced-colors` 대응은 각 `@utility` 안과 site-base (a)에 중첩한다. 의미를 테두리·밑줄·텍스트로 이중 표기하므로 색이 사라져도 정보는 남는다.
- **color-scheme**: viewport `only light` + `:root:has(.site){color-scheme:light}` + `.surface-ink{color-scheme:dark}`. 삼성 인터넷 강제 다크에서 반전되지 않는지 캡처로 확인한다. viewport는 루트 레이아웃이라 어드민에도 적용된다. 어드민은 `.dark`를 쓰는 곳이 없으므로[실측] 영향은 강제 다크 UA에서 반전이 꺼지는 것뿐이다.
- **inert**: 모바일 메뉴·쿠키 배너·챗봇 패널의 동시 노출 규칙(§4-7). 숨긴 레이어는 포커스 순서에서도 빠진다.
- **터치 타깃**: 44px 이상이다(리터럴 `min-h-11`/`size-11`. `--hit-min` 토큰은 없다).

## 7. 성능 예산

| 항목 | 기준선 [실측] | 예산 |
|---|---|---|
| 공용 CSS 청크(`.next/static/chunks/0bo-d.7u64z91.css`, 2026-10-26 19:16 빌드) | 418,225 B / gzip 60,357 B | P0 증가 ≤ 6 KB gz. P2가 끝나면 레거시 삭제분으로 기준선 이하 |
| 스코프 메커니즘 JS | — | 새 클라이언트 JS 0(효과·포털 루트 없음. 토스트 `usePathname`은 이미 번들에 있음) |
| `Section` | — | 서버 컴포넌트, JS 0 |
| 가드 실행 | 0.07s(64파일, components/admin/branch) | ≤ 2s(공개 범위 약 600파일) |
| `--budget` | — | ≤ 1s |
| 홈 HTML 예산 | — | 먹 섹션 ≤ 1, 모눈 ≤ 1, 모먼트 ≤ 6, 섹션당 Reveal ≤ 1, 섹션당 Frame ≤ 1, sheet 위 sheet 카드 0 |
| 랩 지표(모바일 Lighthouse 3회 중앙값, 홈·sw·hw·contact) | P1 배포 전 측정 | LCP 악화 < 0.3s, CLS ≤ 0.05, 탭 INP < 200ms(DevTools 상호작용 측정) |
| 폰트 | — | typography §7이 소유(V1) |

## 8. 마이그레이션(S/M/L)

### 8-1. 단계

| 단계 | 내용 | 크기 | 화면 변화 |
|---|---|---|---|
| **P0** 배선 | ① tokens.css + import 3줄 + `--font-sans` 이동 (S) ② utilities.css·site-base.css 골격 (S) ③ `lib/design-tokens.ts` + viewport + 테스트 (S) ④ tw-merge + `cn.test.ts` (S) ⑤ `lib/internal-path.ts` + AppChrome 공개 분기 래퍼 + Dialog 5곳 + 토스트 `site`(클래스만, 위치는 P1) (S) ⑥ 가드 레지스트리·베이스라인 `--init`·`--budget`·postbuild (M) ⑦ `lib/format.ts` + 테스트 + billing 재수출 (S) ⑧ DESIGN.md 사실 정정·배지·결정 로그·중복 문구 링크화 (S) ⑨ Reveal 보강(cards_motion 소유, 같은 PR) | **M**(합계) | 0. iOS 브라우저 크롬 색(themeColor)만 바뀐다 |
| **P1** 빼기 + 보증 | site-base (a)·(c), z 이관 7곳, 토스트 공개 위치, 챗봇 열림 시 CTA 숨김, 쿠키 배너 하단 +16px, `scroll-mt` 7곳, SkipLink + 중첩 main 16파일, `motion-safe:scroll-smooth`, 글로우·ping·shimmer·hover scale·backdrop-filter·그라데이션 텍스트 제거(요소 스펙), 헤더 높이 고정 | **M** | 있음(포커스·16px·아이콘 획·앵커 위치) |
| **P2** 프리미티브·셸 | `Section`, `lib/facts.ts` + Numeral, Button md/cta/line/ghost, Input, index-tab, Kicker, Card, Figure/Frame, TocRow, 헤더·푸터·Dialog, global-error, `--animate-fade-in/dialog-in` | **L** | 있음 |
| **P3** 홈 | Act 순서대로. 서사 모먼트 1개 = 커밋 1개 | **L** | 있음 |
| **P4** 제품 / **P5** 콘텐츠·전환 | 라우트 단위 PR. `/l/*`는 백로그 | **L** / **M** | 있음 |

### 8-2. 순서 고정 규칙

1. `#A39E98`은 hex → hex 치환을 하지 않는다. hex → 토큰(`text-fg-muted`) 치환만 한다. 그리고 Footer·SW·HW 다크 구간을 `surface-ink`로 옮긴 **뒤에** 한다. 먹 `#111110` 위 `#A39E98`(7.11:1)을 `#615D59`로 바꾸면 2.90:1로 떨어진다.
2. 대체 도판 커밋이 들어간 뒤에만 기존 도판을 뺀다.
3. 다른 세션이 `globals.css`·`MobileFloatingCTA.tsx`를 수정 중이면(현재 둘 다 미커밋 `M` [실측]) 그 머지 뒤에 한다.
4. 병합 순서: tokens → utilities → site-base(셋과 import 3줄은 같은 P0 PR) → 컴포넌트 PR.
5. 레거시 CSS(`.section-white/green`, `.border-whisper`, `.prism-glass`, `.animate-blob*`, `.tracking-*`, h1–h4 모바일 `!important`)는 삭제 직전에 grep 0건을 다시 확인하고, 단계마다 별도 커밋으로 지운다.

### 8-3. 측정

- **기준선**: P1 배포 전 14일이다. 시작일은 W0 핫픽스(동의 모드·추적 수정, 감사 §6)가 배포된 **뒤**로 잡는다. 동의율이 바뀌면 `client_events` 표본이 바뀌기 때문이다. P0는 화면 변화가 0이므로 기준선 기간 안에 배포해도 된다.
- **지표**
  1. CTA 클릭률: `client_events`에서 `event_name='click_cta'`를 `button`(ctaId)·`page`별로 세고, 같은 `page`의 `page_view`로 나눈다. **이 표는 분석 동의를 한 사람만 적재한다**(`lib/admin/traffic-lead-conversions.ts` 주석 [실측]). 그래서 절대 건수는 쓰지 않고 비율만 비교한다.
  2. 리드 제출: `leads`·`showroom_bookings` 테이블(서버 적재, 동의와 무관)의 일별 건수를 폼과 유입원 그룹(`getLeadSourceGroup`)별로 센다.
  3. 랩 지표: Chrome DevTools Lighthouse 모바일 3회 중앙값(LCP·CLS)과 탭 INP. 대상은 `/`, `/product/sw`, `/product/hw`, `/contact`. 레포 의존성은 추가하지 않는다.
  - 필드 LCP는 쓰지 않는다. Speed Insights가 설치돼 있지 않다 [실측]. 열린 질문 1.
- **판정**: 각 단계를 배포한 뒤 14일 동안 같은 지표로 비교하고, 통과하면 다음 단계로 간다. 운영 DB 읽기는 auto 모드에서 막힐 수 있다. 그래서 집계만 출력하는 읽기 전용 스크립트를 `tmp/`에 두고 운영자가 실행한다.
- **되돌림 트리거(사전 합의)**: 아래 중 하나가 생기면 해당 PR을 revert한다. 기능 플래그와 `?v=2` 이중 경로는 두지 않는다(QA 2배, YAGNI).
  - 해당 라우트 리드 제출 7일 합계가 기준선보다 10% 이상 줄었다.
  - 랩 LCP가 0.3s 이상 늘었다.
  - CLS가 0.05를 넘었다.
  - `/admin` 스크린샷에 차이가 생겼다.

## 9. 수용 기준

**P0**
1. `npm run typecheck` → `npx eslint app components lib --max-warnings=0` → `npx vitest run` → `npm run build`가 통과한다. prebuild 가드는 warn만 내고 exit 0이고, postbuild `--budget`도 통과한다.
2. 375×812·1440×900, reduced-motion 에뮬레이션(애니메이션 정지 상태)에서 `/`, `/product/sw`, `/product/hw`, `/pricing`, `/blog`, `/contact`, `/share` 1건, `/admin` 2건(대시보드·블로그 목록)을 전후로 캡처한다. 같은 스크롤 위치에서 차이가 0이어야 한다. 브라우저 도구로 캡처한다(새 의존성 없음).
3. `/`에서는 `document.querySelectorAll('.site').length ≥ 1`이고 그 요소의 computed `display`가 `contents`다. `/admin`에서는 `.site`가 0개다.
4. 홈에서 DemoModal을 열면 `[role=dialog].site`가 있다. 공개 페이지의 토스트 뷰포트에는 `site`가 있고, `/admin`에는 없다.
5. `<meta name="theme-color" content="#FAFAF8">`와 `<meta name="color-scheme" content="only light">`가 출력된다.
6. `tests/lib/cn.test.ts`의 6개 단언, `design-tokens.test.ts`의 10쌍 + ease 2개, `format.test.ts`의 9건(표 7행 + 자정 경계 + UTC 시각)이 통과한다.
7. 가드 동작
   - 새 공개 파일에 `text-[13px]`을 넣으면 경고가 1건 나온다.
   - `app/globals.css`에 `--fg-x: red;`를 넣으면 exit 1이다.
   - 베이스라인보다 많은 건수로 `--update-baseline`을 실행하면 exit 1이다.
   - `components/admin/branch/` 파일에 `#1E5DA8`을 넣으면 지금처럼 exit 1이다.
8. 가드 실행 ≤ 2s, `--budget` ≤ 1s. 공용 CSS 청크 증가 ≤ 6 KB gz.

**P1**
1. 공개 링크·버튼에 Tab으로 가면 computed outline이 `2px solid rgb(8, 71, 52)`이고, 먹 지면 안에서는 `rgb(110, 231, 183)`이다. `/admin`은 지금과 같다.
2. DemoModal 이메일 입력, 챗봇 입력, 푸터 뉴스레터 입력의 computed `font-size`가 16px 이상이다. `/admin` 입력은 그대로다. `/share` 견적 편집 화면은 P0 기준 캡처(§9 P0-2)와 스크린샷 차이가 0이다(quote-paper가 이긴다, §5-1).
3. 앵커 이동 뒤 대상 상단이 `header-h + 16`(±2px)이다. `/product/*` 모바일에서는 +44px이다.
4. 레이어 확인
   - 쿠키 배너가 열려 있으면 모바일 CTA와 챗봇 런처가 안 보이고 포커스도 받지 않는다.
   - 모바일 메뉴를 열면 플로팅이 숨고 `main`이 inert다.
   - 챗봇 패널을 열면 모바일 CTA가 숨고(`hidden`) Tab 포커스도 받지 않는다. 패널을 닫으면 다시 보인다.
   - 모바일 토스트가 런처 위 8px에 뜬다(제안값 80px 기준. §12-4에서 정본 72px로 정해지면 '토스트 하단 = safe-area + 72px'로 바꾼다).
   - Dialog가 쿠키 배너를 덮는다.
   - 모바일 CTA를 탭할 수 있다(감사 P0-2 재현 0).
5. 확대 4상태에서 홈·sw·contact의 가로 스크롤이 0이다. 이것은 `document.documentElement.scrollWidth <= innerWidth`로 확인한다.
6. JS를 끄거나 reduced-motion을 켜도 홈 전 섹션의 텍스트가 보인다.

**P2 이후(단계마다)**: §7 예산과 §8-3 판정을 통과하고, 되돌림 트리거가 0건이어야 한다.

## 10. DESIGN.md 반영안

P0 PR에서 넣는 것(토큰·사실). 컴포넌트·모션 절은 각 구현 PR이 같은 커밋에서 고친다.

1. **머리말 아래 '적용 범위' 블록 신설**
   > **적용 범위.** 이 문서는 공개 셸(`.site`)과 어드민이 함께 쓴다. 절 제목에 `[public]`·`[admin]`·`[공통]` 배지를 단다. 토큰에는 상태 배지를 단다: `in force`(코드에 있음) · `target`(스펙 확정, 구현 전) · `retired`(새 사용 금지). 공개 셸 기반(레이아웃·레이어·토큰 배선)의 정본은 `docs/active/public-site-design-language-2026-10-26/system.md`다.
2. **사실 정정(즉시)**
   - §3 폰트: `Inter, -apple-system, …` → `Pretendard Variable(라틴 글리프는 Inter 기반), 시스템 폴백` `in force`.
   - §2 `Warm Gray 300 (#A39E98)`: "플레이스홀더, 비활성, 캡션" → "장식선·비활성 표시 전용. 텍스트 금지(2.54:1). 플레이스홀더는 `#78736D`" `[public] target`.
   - §6: `보조 텍스트 ~5.5:1` → `6.53:1(white) / 6.24:1(paper) / 5.99:1(sunken)`. `Green CTA ~9.7:1` → `10.71:1(white)`.
3. **§2 토큰 표 교체 `[public] target`**: §3-2의 20색 + 먹 재정의. 각 행에 Tailwind 유틸 이름을 적는다(§3-5). 기존 그린 서피스 스케일에는 `[public] retired`(::selection 제외)를 달고, 어드민 사용은 `[admin] in force`로 남긴다.
4. **§5 레이아웃을 둘로 나눈다**
   - 5-A `[public]`: §4-1~4-5의 값(브레이크포인트, 거터 16/24/48, page 1296/article 45rem/measure 38em, 리듬 base 64/96·act 80/128·band 40/48, `--header-h` 76/80, Hero 7/5).
   - 5-B `[admin]`: 기존 '간격·컨테이너' 문구 그대로.
   - '배경 교차 리듬' 소절은 surfaces PR이 C19로 교체한다(P0에서는 `[public] retired` 배지만).
5. **§5-C 레이어 스택 `[public]` 신설**: §4-6 표 + safe-area 공식 1줄 + 동시 노출 4줄.
6. **§8 표기 `[공통]` 신설**: `1,200` · `1,200,000원` · `1,200만 원` · `2026.10.26` · `10월 26일(월)` · `02-1234-5678`. 마지막에 "`lib/format.ts`만 쓴다. `toLocaleString` 직접 호출 금지(가드 경고)"를 적는다.
7. **§6 접근성 추가 `[public]`**: 포커스 보증 규칙 1개, 입력 16px, 확대 4상태, 스킵 링크·단일 main, 지원 기준(iOS Safari 16.4+, 최근 2년 Chrome·Samsung Internet·Whale·Edge, 카카오톡·네이버 인앱). 지원 하한은 Tailwind 4의 공식 하한과 같다. 점진적 향상 대상은 view-timeline·`text-wrap: pretty`·hanging-punctuation·`@starting-style`·`details name`·`:has`(scroll-padding 전용)이고, 미지원이면 정적 완성 상태로 보인다.
8. **§7 에이전트 가이드 추가**
   - "공개 화면의 색·크기·z·지속시간은 토큰 유틸만 쓴다(가드: `scripts/check-design-tokens.mjs`)"
   - "새 공개 CSS는 `app/styles/*`에만 쓴다. `globals.css`는 금지"
   - "공개 Radix `*Content`에는 `site`를 넣는다"
   - "화면 수치는 `lib/facts.ts` factId로만"
   - "표기는 `lib/format.ts`"
   - 기존 6번(배경 교차)과 7번(배지 그린 서피스)은 `retired` 배지를 단 뒤 각 구현 PR에서 삭제한다.
9. **§9 결정 로그 신설**: 열은 `결정 | 선택 | 날짜 | 근거 | 보드 스크린샷 경로`다. V1–V9 행의 초기값은 `기본안 A(미확정)`이다. 감사 문서 결정은 '감사 D#'으로 인용한다(C03).
10. **중복 문구 링크화** [실측 위치]
    - `docs/active/playbook/01-home-front.md:41-44, 89`(배경 교차 `#ECFDF5`, `.section-*` 유틸, 모바일 자간 `≤640px`)
    - `AGENTS.md:136-139`('UI 작업 시 필수 체크'의 섹션 배경 교차)
    - 두 곳 모두 → "DESIGN.md §2·§5(배지 확인)" 링크 한 줄로 바꾼다.
    - `.claude/agents/home-front.md`는 gitignore 대상이라 로컬에서만 고친다.
11. **감사 문서 동기화**(같은 P0 PR)
    - §5-2: story·progress 토큰 삭제(brief §10, X13). `--motion-story` 줄과 `lib/motion.ts` 줄을 지우고, "`--motion-story`·`--motion-progress`·`--motion-carousel`은 소비처가 0이라 정의하지 않는다"는 한 줄을 남긴다. [실측] 감사 §5-2 코드 블록에는 progress·carousel 줄이 없으므로 지울 줄은 story 하나다.
    - §5-4: LogoBar 마키 → 정적 목록.
    - §5-5-5: 400ms → 320ms.
    - §5-6: 1.75 → V6, `#A39E98` → `#8F8A84`, 배경 리듬 → V4, pill → V9.
    - §5-8(자동 진행 0, C07): '예외는 정지 가능한 마키와 히어로 영상 둘' → '홈 무한 루프 0(예외 없음)', '읽기 시간보다 빠른 자동 전환' → '자동 진행 0'.

## 11. 하지 말 것

- 토큰 생성 스크립트, 토큰 JSON 정본, 기능 플래그, `?v=2` 미리보기 경로, `/design-lab` 라우트.
- `tokens.css` 밖의 `--surface-*`·`--fg-*`·`--line-*` 선언, `.on-ink`, 두 번째 `.surface-ink` 정의, `var()` 폴백값.
- `globals.css`에 새 공개 규칙. `site-base.css` 보증 구간 밖의 무레이어 규칙.
- `body[data-shell]` effect, 별도 포털 루트, `ui/dialog.tsx`·`ui/toast.tsx`·`ui/card.tsx`의 기본 문자열 변경(추가 변형·선택 prop만 허용).
- 새 spacing·hit·focus·icon 크기 토큰(`--space-*`, `--gutter`, `--hit-min`, `--focus-width/offset`, `--icon-*`).
- `641px`·`767px`·`max-width:640px`·`width <= 40rem`, `.container`(1400)의 공개 신규 사용, `wide` 컨테이너.
- Section에 `scroll-mt-*`를 두는 것(루트 scroll-padding과 합산된다).
- 페이지 수준 `z-[N]`·`z-30/40/50` 리터럴, 하단 플로팅의 safe-area 미반영, z가 높은 전폭 래퍼의 `pointer-events` 기본값.
- 쿠키 배너를 Dialog 위로 올리는 것(현행 `z-[120]`).
- 베이스라인 수동 상향, 경고를 끄는 예외 주석, 새 위반을 베이스라인에 끼워 넣는 `--init` 재실행.
- 출처 없는 수치 등록, 숫자 prop을 받는 Numeral, 카운트업.
- `toLocaleString`·`toLocaleDateString` 직접 호출, 서버 기본 시간대(UTC)로 날짜 표시, hex → hex 기계 치환.
- P0에 화면이 바뀌는 규칙(보증 4개, `:root:has(.site)`, `--animate-fade-in`, 토스트·플로팅 위치 변경)을 섞는 것. P0의 토스트 변경은 `site` 클래스 하나뿐이다.

## 12. 열린 질문

1. **필드 LCP**: `@vercel/speed-insights`(새 의존성)를 들일까요? 기본은 '안 들임'이고, 랩 지표와 리드 지표로만 판정합니다.
2. **`errorFrom` 날짜**: P0 머지일 + 14일로 둡니다. 운영자가 머지일을 정하면 P0 PR에 적습니다.
3. **공개 Dialog 오버레이**: 현행 `bg-black/40 backdrop-blur-[2px]`는 `.site` 밖이라 scrim 토큰을 못 받습니다. `overlayClassName` 선택 prop을 더할지는 controls가 정합니다. 기본은 '추가 안 함, blur만 제거 검토'입니다.
4. **토스트 모바일 높이(정본 편차 §13-6, 운영자 확인)**: 정본(brief §2)은 '플로팅 CTA 위 +44px+12px' = 72px입니다. 이 문서는 80px(16 + 런처 56 + 8)을 제안합니다. 72px이면 전폭 토스트가 챗봇 런처 윗변과 틈 0으로 맞닿기 때문입니다. 80px을 승인하시면 brief §2 문구를 고칩니다. 거절하시면 72px로 두고, 그 대신 토스트를 런처 왼쪽까지만 펴는(`max-md:right-20`) 방안을 controls가 검토합니다. 챗봇 런처가 44로 바뀌면 어느 쪽이든 72px로 돌아갑니다. 결정 전 P1 기본은 80px입니다.
5. **가드의 `lib/` 범위**: 제외 접두(`lib/admin`, `lib/branch/`, `lib/crm/`) 밖에 어드민 전용 모듈이 더 있으면 `--init` 때 함께 제외합니다. 확인 담당은 home-front입니다.
6. **사실 레지스트리 초기 항목**: 출처 문서와 함께 등록할 담당(콘텐츠)과 기한이 필요합니다. 등록 전에는 출처 없는 수치가 화면에서 빠집니다(감사 D3).
7. **실기기 확인 ⑧**(iPhone Safari·삼성 인터넷 강제 다크·카카오톡 인앱·DPR1 1366×768): 담당자와 날짜를 운영자가 먼저 정해야 합니다.
8. **어드민의 `only light`**: 루트 viewport라 어드민에도 적용됩니다. 강제 다크 UA에서 어드민 자동 반전이 꺼지는데, 이것을 수용할지 확인이 필요합니다. 기본은 수용입니다(어드민에 다크 테마가 없음 [실측]).
9. **채널톡 버블 병존(정본상 운영자 확인 사항)**: 지금은 부트할 때 버튼을 숨기고 챗봇에서 열 때만 메신저가 뜹니다(`lib/channel-talk.ts:146` [실측]). 기본은 현행 유지이고, 이때 플로팅 스택과의 겹침은 0입니다. 채널톡 버블을 따로 노출하기로 하시면 그때 위치·동시 노출 규칙을 §4-6·§4-7에 더합니다.
10. **§13 정본 편차 일괄 승인**: §13의 편차 10건을 정본 개정으로 받아들일지 확인이 필요합니다. 승인 전에는 이 문서 값으로 작업본을 그리고, P0 PR 승격 전에 brief·css_architecture 문구를 함께 고칩니다.

## 13. 정본 편차 기록

정본(canonical·naming·css_architecture·system_spec_brief) 문구와 다르게 정한 곳이다. 모두 기술 근거가 있는 의도적 편차이고, 정본 개정 제안으로 운영자 확인(§12-10)을 받는다.

| # | 위치 | 정본 | 이 문서 | 근거 |
|---|---|---|---|---|
| 13-1 | §3-1, §5-7 | css_architecture: globals.css에는 `@import` 3줄만 추가 | import 3줄 + `@theme inline`의 `--font-sans` 1줄 삭제 | 같은 정본이 `--font-sans`를 tokens.css `@theme`에 두라고 한다. 두 `@theme`에 같은 이름이 있으면 결과가 import 순서에 달린다 |
| 13-2 | §3-2 | css_architecture ④: `--animate-fade-in/dialog-in/skeleton + keyframes`를 P0 tokens.css에 | `--animate-skeleton`만 P0, fade-in·dialog-in은 controls P2 PR(위치는 tokens.css 그대로) | 어드민 `SmartActionCard.tsx:222`가 정의 없는 `animate-fade-in`을 쓴다. P0에 정의하면 어드민에 페이드가 생겨 '어드민 무변경'을 깬다 |
| 13-3 | §3-2, §3-4 | css_architecture ④: keyframes는 `@theme inline` | `@keyframes skeleton-blink`는 site-base.css 보증 구간 안(④ 부속) | `@theme` 안 keyframes는 `animate-*` 유틸이 쓰일 때만 출력된다. 보증 ④가 이름으로 부르므로 항상 출력돼야 한다 |
| 13-4 | §4-5, §5-2 | brief §1: Section 출력에 `scroll-mt-(--header-h)` | Section에 `scroll-mt-*` 없음 | 루트 `scroll-padding-top`과 대상 `scroll-margin`은 합산된다. 둘 다 두면 헤더 높이만큼 더 내려간다 |
| 13-5 | §4-6 | brief §2: 하단 플로팅 `+16px` | MobileFloatingCTA만 현행 `+16px + 6px` | 높이 44 CTA의 중심선을 높이 56 챗봇 런처 중심선에 맞춘 현행 값([실측] `+1rem+6px`). ConsentBanner·런처는 정본대로 +16 |
| 13-6 | §4-6, §5-1, §9 P1 | brief §2: 모바일 토스트 = 플로팅 CTA 위 +44+12(72px) | 80px(제안값) | 72px이면 전폭 토스트가 런처(56) 윗변과 틈 0. 운영자 확인 §12-4 |
| 13-7 | §5-4 `z-literal` | brief §6·X09: `z-[N]·z-50` 리터럴 금지 | `z-30·z-40`도 금지(범위 확장) | 페이지 수준 레이어가 실제로 `z-40`을 쓴다(ProductTabNav·MobileFloatingCTA·헤더 드롭다운 [실측]) |
| 13-8 | §5-4 구조 | brief §6: `{id, glob, pattern, message, allow:[glob], severity, errorFrom}` | `glob` 대신 접두 목록(`files`, `allow`) + 선택 `check` | Vercel Node 버전에 따른 `path.matchesGlob` 가용성에 기대지 않는다. 새 의존성 0 |
| 13-9 | §3-6 | brief §3: `design-tokens.test.ts`가 15종 `--text-*` 이름 집합 대조 | `cn.test.ts`에서 대조(naming 5)·gap_triage 쪽) | 정본 안에서 상충한다. `TEXT_SCALE`을 쓰는 테스트에서 대조해야 tw-merge 목록 drift를 같이 잡는다 |
| 13-10 | §5-4 `hex-literal` | brief §6: hex 허용 `tokens.css` 등 | `app/styles/site-base.css`의 `::selection` 줄 추가 | css_architecture (a)의 `::selection{background:#D1FAE5;color:#111110}`이 site-base.css에 있다. 허용을 그 한 줄로 좁힌다 |
