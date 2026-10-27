# 색·표면·섹션 배경 (surfaces) — 최종 스펙 (2026-10-26)

- 방향: 「편집 지면 · OS판」. 이 스펙은 canonical 표를 옮겨 적은 것이다. 소유 행은 C01·C19·C26·C27·X01·X04·X05이고, 영향 행은 C02·C03·C08·C09·C10·C13·C14·C15·C17·C18·C21·C23·X02·X09·X11·X13·X15·X16이다. 이 스펙과 canonical이 다르면 canonical이 이긴다.
- 결정 번호: 방향 문서의 운영자 결정은 **V1–V9**, 감사 문서(`docs/active/public-site-audit-motion-plan-2026-10-26.md` §4)의 결정은 **감사 D1–D8**로 적는다.
- 공유 기반은 system 스펙(`docs/active/public-site-design-language-2026-10-26/system.md`)이 소유한다. 레이아웃·Section API·z 스택·가드·사실 레지스트리·롤아웃이 여기에 해당하며, 이 스펙은 링크만 하고 값을 복제하지 않는다.
- 범위: 공개 셸(`.site`)만 다룬다. `/admin`·`/checkout`·`/receipt`는 제외한다(`isInternalPath`, `lib/internal-path.ts`로 이전). 모든 단계의 수용 조건은 '어드민 무변경'이다.
- 줄 번호는 HEAD `4c9e509c` 기준이다. `app/globals.css`와 `components/ui/MobileFloatingCTA.tsx`는 다른 세션이 작업 트리에서 고치고 있다.
- 대비는 WCAG 2.x 상대 휘도 공식으로 직접 계산했다. 알파 색은 해당 지면 위에 sRGB로 합성한 값이고, 테스트 임계는 4.5/3.0이다.
- 브라우저 하한은 iOS Safari 16.4+다. 범위 미디어 문법, `:where`, `@layer`, `overflow: clip`, CSS 중첩이 모두 이 하한에서 동작한다.

---

## 요약

- **지면은 4장이다.** 공개 화면의 면은 paper `#FAFAF8` · sheet `#FFFFFF` · sunken `#F6F5F4`와 먹 `#111110`이다. 그린 `#084734`는 면을 칠하지 않고 잉크로만 쓴다. 민트 `#ECFDF5`·`#D1FAE5`는 `::selection` 하나만 남기고 공개 화면에서 0이 된다.
- **섹션은 괘선과 여백으로 나눈다.** 면 색은 섹션을 가르지 않는다(지면 간 대비 1.04–1.09:1). 섹션 배경 처리는 plain 하나뿐이고, 모눈은 도해 figure 자체의 바탕으로만 페이지당 1개 쓴다. 그림자는 떠 있는 레이어만 갖는다.
- **토큰은 한 파일이 정본이다.** `app/styles/tokens.css`가 색 20개와 `.surface-ink` 하나를 정의한다. 유틸 이름은 변수 이름과 같다(`bg-surface-*`, `text-fg-*`, `border-line-*`). 먹 위에서는 같은 이름이 밝은 값으로 다시 정의되고, 먹 위 채움 버튼은 0이다.
- **결정 기본값을 적용했다.** V3-A(Hero 지면 표지 + capture Frame), V4-A(먹은 Manifesto 1곳, ProblemCost는 sheet 정성 장부), V5-A(FinalCTA는 sunken 띠), V7-A(배경·카드 정지), V9-A(pill 없음, Kicker), V8-A(입력은 sheet 박스).
- **이전 판(v2)에서 없앤 것이 많다.** rails, `--line-pattern`·`--line-opaque`·`--focus`·`--pattern-cell`·`--rail-x`, photo 레시피, 대표 Frame `--shadow-card`, 먹 위 그린 CTA, `body[data-shell]`, 별도 `--public` 가드 모드, FinalCTA Display H2가 모두 빠졌다. 홈 시퀀스는 C19를 따른다.

---

## 1. 원칙

1. **면은 웜 페이퍼 3장 + 먹 1장이다.** paper는 바닥이고, sheet는 카드·표·폼·Frame·입력과 텍스트 위주 섹션에 쓴다. sunken은 띠·도해·부록·카드 받침·CTA에 쓰고, 먹은 페이지당 서사 1곳과 Footer에만 쓴다.
2. **그린은 잉크다.** `#084734`는 밑줄, 출처 번호, Kicker, 한 계열 차트선, primary CTA 채움에만 쓴다. 민트 퇴역의 근거는 취향(파스텔 면 금지)이다. 민트는 paper와의 휘도 대비가 1.01:1인데도 색조 차이 때문에 눈에 보인다.
3. **구획은 괘선과 여백이 맡는다.** Act·장 머리는 1px 먹 괘선(`masthead`)과 리듬 여백으로 나눈다. 섹션 사이 하드 보더(`border-y`), 물결 구분선, 그라데이션 장식선은 0이다.
4. **배정은 교대가 아니라 역할로 한다.** sunken은 연속으로 두지 않는다. sheet 면 카드(index·case·plan·frame)는 paper·sunken 위에만 둔다(C19).
5. **먹은 한 곳이다.** 먹 지면에는 채움 버튼, Frame, 표, 사진, 밝은 위젯을 두지 않는다(C01·C14, §3-6 허용 목록).
6. **지면은 평면이다.** 그림자는 `--shadow-deep` 하나뿐이고, Dialog·드롭다운·토스트·모바일 메뉴 패널처럼 떠 있는 레이어에만 쓴다(X05).
7. **배경은 정지 상태다(V7-A).** 그라데이션 면, 블러 블롭, 글로우, 글래스, 그레인, mix-blend, 마스크, 패럴랙스는 모두 0이다.
8. **토큰으로만, `.site` 안에서만 쓴다.** 값은 `tokens.css`에서 한 번만 정의하고 `var()` 폴백은 쓰지 않는다. 전역 규칙은 `:where(.site)`(특이도 0) 안에 둔다.

### 결정 기본값 (운영자 확정 전까지 적용)

| 결정 | 기본값 | 이 스펙에 미치는 영향 |
|---|---|---|
| V3 Hero | A 지면 표지 | Hero는 paper + plain이다. ≥64rem에서 7/5로 나누고, 오른쪽에 capture Frame(r8, 그림자 0)을 둔다. 홈 영상과 sticky 다크 커버는 0이다 |
| V4 배경 리듬·공감 Act | A | 서사 먹은 Manifesto 1곳뿐이다. ProblemCost는 sheet 위 정성 장부다. 섹션 처리는 plain만 쓴다(C19 시퀀스) |
| V5 FinalCTA | A sunken 띠 | `rule-double` 아래 h2(`text-h1`) → 덱 → primary `size="cta"` + 텍스트 링크 순서다. 먹 위 채움 CTA는 0이다 |
| V7 배경 애니메이션 | A 정지 | 지면·카드 배경 모션이 0이다. 링크 카드 hover는 경계 hair→strong과 화살표 2px뿐이다 |
| V8 입력 | A 박스 | 입력 바탕은 `bg-surface-sheet`다. 먹 위에서는 `#111110`이 된다 |
| V9 Hero 배지 | A 삭제 | 글래스 배지 대신 Kicker를 둔다. 공개 화면에서 상호작용하지 않는 pill은 0개다 |

---

## 2. 토큰 (CSS + Tailwind @theme)

### 2-1. 위치와 소유

- 정의는 `app/styles/tokens.css` 한 파일에만 둔다(css_architecture). `globals.css`에는 `@import "tailwindcss";` 바로 아래에 `@import "./styles/tokens.css"; @import "./styles/utilities.css"; @import "./styles/site-base.css";` 세 줄만 더한다.
- 이 스펙이 소유하는 블록은 색 20개(X01), `--header-h`(C27), `.surface-ink`(C01), `@theme inline`의 색 매핑(C02)이다.
- 같은 파일의 다른 블록은 각 스펙이 소유한다: `--text-*`·`--trk-*`·`--container-*`(typography/system), `--motion-*`·`--ease-*`(X13), `--z-*`(X09), `--stroke-*`(C11).
- `tokens.css` 밖에서 `--surface-*`·`--fg-*`·`--line-*`를 선언하거나 `.surface-ink{}`를 선언하면 가드가 막는다.

### 2-2. 값의 정본 — `:root` (20색 + 셸 1)

| 토큰 | 값 | 대비(sheet · paper · sunken) | 용도 | 흡수하는 기존 값 |
|---|---|---|---|---|
| `--surface-paper` | `#FAFAF8` | — | 바닥·헤더·Hero·중간 띠·읽기 면 | `--background`, `#FDFCF8` `#F9F8F4` `#F7F8F5` `#F6F7F2` `#EDF7F2` `#F0FDF9` `#F5FBF7` |
| `--surface-sheet` | `#FFFFFF` | — | 카드·표·폼·Frame·입력 바탕, 텍스트 위주 섹션 | `bg-white` |
| `--surface-sunken` | `#F6F5F4` | — | 띠·도해·부록·카드 받침·CTA | `.section-warm`, `--secondary`·`--muted`(공개 사용분) |
| `--surface-ink` | `#111110` | — | 서사 1곳 + Footer. **`surface-ink` 클래스로만 칠한다** | `#1a1a19` `#0D1A12` `#0A1511` `#07110d` `#05080C` `#050708` `#010302` `#0B3328` `#031a12` `#1C1B1A` `#2a2925`, `bg-black` |
| `--surface-skeleton` | `#F0F0EC` | — | 로딩 상태만 | 유지 |
| `--surface-scrim` | `rgb(17 17 16 / .48)` | — | Dialog·모바일 메뉴 오버레이(블러 없음) | `backdrop-blur` 오버레이 |
| `--fg-ink` | `#111110` | 18.89 · 18.08 · 17.35 | 헤딩 | |
| `--fg-body` | `#31302E` | 13.18 · 12.62 · 12.11 | 본문 | `#484540`·`#4A6B5C`·`#44514A` 등 |
| `--fg-muted` | `#615D59` | 6.53 · 6.24 · 5.99 | 모든 보조 글자 | 읽는 글자로 쓰인 `#A39E98` |
| `--fg-placeholder` | `#78736D` | 4.70 · (4.49) · (4.31) | 플레이스홀더. **입력 바탕이 sheet일 때만 쓴다** | `#A39E98` |
| `--fg-faint` | `#A39E98` | 2.66 · 2.54 · 2.44 | 장식·비활성 전용. 텍스트 금지 | |
| `--fg-accent` | `#084734` | 10.71 · 10.25 · 9.83 | 링크·Kicker·강조·primary 채움 | |
| `--fg-accent-hover` | `#065C41` | 8.03 · 7.68 · 7.38 | hover | |
| `--fg-danger` | `#B43E3E` | 5.68 · 5.43 · 5.21 | 공개 화면의 유일한 오류색 | `#B85C33`, `red-*`, `amber-*` |
| `--fg-on-accent` | `#FAFAF8` | `#084734` 위 10.25 | 그린 채움 위 글자 | `#FFFFFF` |
| `--line-hair` | `rgb(17 17 16 / .08)` | 1.18 | 기본 선: 카드·행·띠·모눈·헤더 하단선 | `rgba(0,0,0,.08)`·`.06`·`.05`, `--border`, 공개 화면의 `#E8E8E4` |
| `--line-strong` | `rgb(17 17 16 / .16)` | 1.41 | **장식선 전용**: 표 머리 아래, 바이라인, 읽기 전용 필드, 링크 카드 hover | |
| `--line-ink` | `#111110` | 18.89 · 18.08 · 17.35 | 먹선 닫힌 목록 5곳(X04) | |
| `--line-control` | `#8F8A84` | 3.42 · 3.27 · 3.14 | 경계 자체가 조작 단서인 요소, 도해 정보선, ○ 점, 차트 비교선(C23) | `--input #E5E5E0`(1.26) |
| `--line-link` | `rgb(8 71 52 / .6)` | 3.49 · 3.43 · 3.38 | 링크 밑줄(`decoration-line-link`) | 카드 제목 40% 밑줄, `.link` 60% |
| `--header-h` | `76px` → `(width >= 48rem)` `80px` | — | 헤더 높이, 오프셋, sticky top, scroll-padding | `76px`·`80px`·`5rem` 하드코딩 7곳 |

- **고대비** `(prefers-contrast: more)`에서는 hair가 `/.32`(2.10), strong이 `#8F8A84`로 바뀐다.
- **먹 위 재정의**는 §2-3 표에 있다.
- 지면 사이 대비는 sheet/paper 1.05, paper/sunken 1.04, sheet/sunken 1.09다. 다크 11종을 `#111110` 하나로 모아도 시각 손실이 없다. `#0D1A12`와 `#1A1A19`는 먹 대비가 각각 1.06·1.08이다.

### 2-3. 먹 지면 재정의 — `.surface-ink` (C01)

`tokens.css`의 `@layer base` 안에 있는 클래스 하나가 담당한다. `@utility`·`.on-ink`는 없다. 커스텀 속성은 요소 단위로 선언되므로 `:root`에서 상속된 값을 이기고, 레이어 싸움은 생기지 않는다.

| 토큰 | 먹 위 값 | `#111110` 대비 | 규칙 |
|---|---|---|---|
| `--surface-sheet` | `#111110` | — | 불투명이고 바닥과 같은 색이라 투명처럼 보인다. 실제 소비처는 입력 바탕과 autofill 덮개뿐이다(먹 위 sheet 카드·Frame 금지) |
| `--fg-ink` | `#FAFAF8` | 18.08 | 헤딩 |
| `--fg-body` | `rgb(250 250 248 / .72)` | 9.61 | 본문 |
| `--fg-muted` | `/.56` | 6.14 | 보조 글자. 읽는 글자의 알파 하한은 .50(5.18)이다 |
| `--fg-placeholder` | `/.56` | 6.14 | 입력 플레이스홀더 |
| `--fg-faint` | `/.40` | 3.70 | 장식 전용(구분 기호 '·') |
| `--fg-accent` / `--fg-accent-hover` | `#6EE7B7` / `#6EE7B7` | 12.40 | 선·점·밑줄·포커스. 채움에는 쓰지 않는다 |
| `--fg-danger` | `#E89A94` | 8.53 | `#B43E3E`는 먹 위 3.33이라 미달이고, `#F2B8B8`은 파스텔에 가까워 기각했다 |
| `--line-hair` / `--line-strong` | `/.12` / `/.24` | 1.37 / 2.10 | 고대비에서는 `/.32`(2.82) / `/.40`(3.70) |
| `--line-ink` | `/.72` | 9.61 | 먹 위 Act 머리 괘선 |
| `--line-control` | `/.40` | 3.70 | 먹 위 입력·line 버튼 경계 |
| `--line-link` | `rgb(110 231 183 / .5)` | 3.86 | 먹 위 링크 밑줄 |
| 그 밖 | `background-color: var(--surface-ink); color: var(--fg-ink); color-scheme: dark` | — | 먹 안의 네이티브 스크롤바와 autofill이 어둡게 그려진다 |

- 다음 토큰은 만들지 않는다: `--surface-field`, `--field-bg`, `--line-pattern`, `--line-focus`, `--line-cta-ring`, `--focus`.
- 포커스와 체크박스 `accent-color`는 `var(--fg-accent)`를 쓴다. 그래서 먹 위에서는 자동으로 `#6EE7B7`이 된다.

### 2-4. CSS — `app/styles/tokens.css` (이 스펙 소유 블록)

```css
/* ── surfaces 소유: 색 20 + --header-h + .surface-ink + 색 매핑 (canonical C01·C02·C27·X01) ──
   같은 파일의 --text-*·--trk-*·--container-*·--aspect-*(typography/system), --motion-*·--ease-*(X13),
   --z-*(X09), --stroke-*(C11)는 각 소유 스펙의 블록이다. var() 폴백 금지. */
@layer base {
  :root {
    --surface-paper: #FAFAF8;
    --surface-sheet: #FFFFFF;
    --surface-sunken: #F6F5F4;
    --surface-ink: #111110;
    --surface-skeleton: #F0F0EC;
    --surface-scrim: rgb(17 17 16 / 0.48);

    --fg-ink: #111110;            /* 18.89 · 18.08 · 17.35 (sheet·paper·sunken) */
    --fg-body: #31302E;           /* 13.18 · 12.62 · 12.11 */
    --fg-muted: #615D59;          /*  6.53 ·  6.24 ·  5.99 */
    --fg-placeholder: #78736D;    /*  4.70 — 입력 바탕 sheet 전용 */
    --fg-faint: #A39E98;          /*  2.66 — 장식·비활성, 텍스트 금지 */
    --fg-accent: #084734;         /* 10.71 · 10.25 ·  9.83 */
    --fg-accent-hover: #065C41;   /*  8.03 ·  7.68 ·  7.38 */
    --fg-danger: #B43E3E;         /*  5.68 ·  5.43 ·  5.21 */
    --fg-on-accent: #FAFAF8;      /* #084734 위 10.25 */

    --line-hair: rgb(17 17 16 / 0.08);    /* 1.18 장식 */
    --line-strong: rgb(17 17 16 / 0.16);  /* 1.41 장식(표 머리 아래·바이라인·읽기 전용·카드 hover) */
    --line-ink: #111110;                  /* 먹선 5곳(X04) */
    --line-control: #8F8A84;              /* 3.42 · 3.27 · 3.14 — 조작 경계·도해·차트 비교선 */
    --line-link: rgb(8 71 52 / 0.6);      /* 3.49 · 3.43 · 3.38 — 링크 밑줄 */

    --header-h: 76px;
  }

  @media (width >= 48rem) {
    :root { --header-h: 80px; }
  }

  @media (prefers-contrast: more) {
    :root {
      --line-hair: rgb(17 17 16 / 0.32);  /* 2.10 */
      --line-strong: #8F8A84;
    }
  }

  /* 먹 지면: 같은 이름을 밝은 값으로 재정의(대비는 #111110 기준). 유일한 정의처. */
  .surface-ink {
    --surface-sheet: #111110;                   /* 불투명·바닥과 동색. 입력·autofill 덮개 */
    --fg-ink: #FAFAF8;                          /* 18.08 */
    --fg-body: rgb(250 250 248 / 0.72);         /*  9.61 */
    --fg-muted: rgb(250 250 248 / 0.56);        /*  6.14 */
    --fg-placeholder: rgb(250 250 248 / 0.56);  /*  6.14 */
    --fg-faint: rgb(250 250 248 / 0.40);        /*  3.70 장식 */
    --fg-accent: #6EE7B7;                       /* 12.40 선·점·밑줄·포커스, 채움 금지 */
    --fg-accent-hover: #6EE7B7;
    --fg-danger: #E89A94;                       /*  8.53 */
    --line-hair: rgb(250 250 248 / 0.12);
    --line-strong: rgb(250 250 248 / 0.24);
    --line-ink: rgb(250 250 248 / 0.72);
    --line-control: rgb(250 250 248 / 0.40);    /*  3.70 */
    --line-link: rgb(110 231 183 / 0.5);        /*  3.86 */
    background-color: var(--surface-ink);
    color: var(--fg-ink);
    color-scheme: dark;

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
  - 먹 지면: 클래스 `surface-ink`
  - primary 채움: `bg-fg-accent text-fg-on-accent hover:bg-fg-accent-hover`
- 가드의 어휘 정규식은 `(bg|text|border|divide|decoration)-(surface|fg|line)-`이다. 선 색을 배경으로 칠하는 `bg-line-*`는 어휘에 없으므로 헤어라인 그리드도 `gap-px + 부모 bg` 기법 대신 칸 `border`로 긋는다.
- 기존 `--color-warm-*`, `--color-green-50/100`, shadcn `--accent`(#ECFDF5), `--color-near-black`, `--shadow-card`, `.dark`, `--crm-*`는 어드민 호환을 위해 유지한다. 공개 범위에서 쓰면 가드가 막는다.
- `tailwind-merge` 설정(text 15종 등)은 system §5(`lib/utils.ts` 한 곳, `tests/lib/cn.test.ts`)가 소유한다. 색 유틸은 Tailwind 기본 색 그룹으로 분류되므로 이 스펙이 따로 등록할 것이 없다.

### 2-6. 만들지 않는 것 (X01·C02·C27)

`--overlay`(→ scrim), `--focus`·`--line-focus`(→ `--fg-accent`), `--cta`·`--cta-hover`·`--cta-fg`·`--surface-cta`·`--fg-on-cta`, `--field-bg`·`--surface-field`, `--line-opaque`(불투명 paper 위의 hair와 같은 색), `--line-pattern`, `--line-cta-ring`, `--link-decoration`(→ `--line-link`), `--pattern-cell`, `--rail-x`, `--masthead-pt`, `--color-surface-ink`, `--color-ink`, `bg-paper|sheet|sunken`(v1·v2 이름), `text-(--fg-*)` 임의값 문법.

### 2-7. CSS 변수를 읽지 못하는 소비처

`lib/design-tokens.ts`(system §3)는 hex 약 10개를 손으로 옮겨 적은 미러다. 이 스펙의 소비처는 `app/layout.tsx`의 viewport(`themeColor`)와 `app/global-error.tsx`의 인라인 스타일이다. `tests/lib/design-tokens.test.ts`가 미러 값이 `tokens.css`와 같은지 대조한다.

---

## 3. 패턴과 값 (데스크톱 / 모바일)

### 3-1. 레이아웃 값 요약 (정본은 system §1, 여기서는 지면 관련만 옮긴다)

| 항목 | 모바일 | 데스크톱 | 비고 |
|---|---|---|---|
| 거터 | 16px (`px-4`) | 24px (`sm:` ≥40rem), 48px (`lg:` ≥64rem) | 가로 스크롤 0 |
| 콘텐츠 폭 | 100% − 32px | `max-w-page` 1296px − 96px = **1200px** | `.container`(1400)는 공개 화면에서 쓰지 않는다 |
| 리듬 `base` | 64px | 96px (≥48rem) | 일반 섹션 |
| 리듬 `act` | 80px | 128px | Act·장 머리 섹션, 먹 서사 |
| 리듬 `band` | 40px | 48px | LogoBar, 중간 CTA 띠 |
| 리듬 `none` | 0 | 0 | Hero(자체 패딩) |
| 섹션 사이 경계선 | 0 | 0 | |
| masthead 위 패딩 | 16px | 16px | 모든 폭이 같다(X04) |
| Kicker → 헤딩 / 헤딩 → 덱 / 머리 블록 아래 | 12 / 16 / 32px | 12 / 20 / 40px | |
| 카드 그리드 gap | 16px | 24px (≥40rem) | |
| 모눈 셀 | 48px | 56px (≥40rem) | `pattern-grid` |
| `--header-h` | 76px | 80px (≥48rem) | |
| Hero 위 패딩 | `calc(var(--header-h) + 48px)` | `calc(var(--header-h) + 80px)` (≥48rem) | 7/5 분할은 ≥64rem, gap 48 |
| 앵커 오프셋 | `scroll-padding-top: calc(var(--header-h) + 16px)` | 같음 | `(width < 48rem)`에서 `[data-subnav]`가 있으면 +44px. 열린 질문 1 참고 |

### 3-2. Section 래퍼 — `components/landing/Section.tsx` (API 정본: system §1)

훅이 없는 서버 컴포넌트라 `"use client"` 섹션 안에서도 import할 수 있다. `rails`·`bleed`·`as`·`pattern` prop은 없다.

```tsx
import type { ComponentPropsWithRef } from "react"
import { cn } from "@/lib/utils"

const SURFACE = {
  paper: "bg-surface-paper",
  sheet: "bg-surface-sheet",
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
- `data-surface`는 예산 검사(§7)의 기준이다. Footer는 Section을 쓰지 않으므로 먹 예산에서 자동으로 빠진다.
- `scroll-mt-(--header-h)`는 system 출력 정본을 그대로 따른 것이다. `:root:has(.site)`의 `scroll-padding-top`과 더해지는 문제는 열린 질문 1에 있다.

### 3-3. 지면 배정 규칙

| 지면 | 배정 기준 | 금지 |
|---|---|---|
| paper | 기본값이다. 카드·Frame이 주인공인 섹션, Hero 표지, 중간 CTA 띠, 읽기 면 바닥, 고정 바에 쓴다 | — |
| sheet | 텍스트·표·수치·장부 위주 섹션에 쓴다. **안에 sheet 면 카드·Frame이 없어야 한다** | sheet 카드·Frame을 담는 것(그런 섹션은 paper나 sunken) |
| sunken | 띠(LogoBar·FinalCTA·콘텐츠 CTA), 도해(Solution·LatencyProof), 부록(LeadMagnet·자료), 카드 받침(SatisfyingClass·Outcomes) | **연속 배치**, 입력 바탕(플레이스홀더 4.31 미달) |
| ink | 페이지당 서사 1곳 + Footer | §3-6 허용 목록 밖의 모든 것, 읽기 면 |
| skeleton | 로딩 상태 | 장식 |

- 면 색 변화(1.04–1.09:1)로 의미를 전달하지 않는다. 묶음 구분은 헤딩·`aria-labelledby`·머리 괘선이 맡는다.
- SW·HW는 다크·그린·그라데이션·비토큰 면만 바꾼다. 기존 white 섹션은 이름만 바꾸되, 카드·Frame을 담으면 paper로 바꾼다(§4 표의 `sheet*`).

### 3-4. 구분선 체계

| 위치 | 선 | 값 | 지금 → 바꿀 곳 |
|---|---|---|---|
| 섹션과 섹션 사이 | **없음** | — | `border-y` 삭제: LogoBar.tsx:42, GlobalScale.tsx:15, app/product/page.tsx:100(border-b)·153(border-t), hw/page.tsx:1331(border-t) |
| Act·장 머리 | `masthead` | 1px `--line-ink`, 콘텐츠 폭, 섹션 안 첫 요소, 위 패딩 16 | 홈 6곳, SW 4곳, HW 4곳 |
| 중간 CTA 띠 | 위·아래 hair | `border-y border-line-hair`, 콘텐츠 폭(섹션 안쪽 요소) | 홈 2곳 |
| FinalCTA·콘텐츠 CTA 띠 | `rule-double` | 1px 먹 + 3px 간격 + 1px hair | FinalCTA, 블로그·행사·자료 CTA |
| 섹션 안 행·항목·장부 행 | hair | `border-t border-line-hair` | ProblemCost 장부 6행, 목록·TocRow |
| 표 | 상단 먹 / 머리 아래 strong / 행 hair | `table-paper`(controls) | Comparison, HW 사양, /pricing |
| 숫자 열이 있는 장부의 합계 | 위 1px 먹 + 아래 3px double 먹 | 견적·사양 표에서만 | 홈 ProblemCost에는 없다(C08) |
| 헤더 하단 | hair | 스크롤 뒤에만 opacity 0→1 | Header.tsx:56, ProductTabNav.tsx:19 |
| 먹 지면 안 | hair `/.12` | | Footer.tsx:71 `border-white/[0.08]` |
| 장식 구분선 | **금지** | — | 그라데이션 1px(Hero.tsx:118, EraVision.tsx:48·52), WaveDivider(sw/page.tsx:209 + 사용 5곳) |

**`--line-ink` 사용처는 닫힌 목록 5곳이다(X04).** Act·장 머리 괘선, 표 상단, 숫자 열이 있는 장부의 합계 이중선, CTA 띠 `rule-double` 윗선, 추천 Plan 테두리. hover에는 쓰지 않는다.

### 3-5. 배경 처리 — plain 하나 + 도해 모눈 (C19)

- **섹션 배경 처리는 plain 하나다.** rails, ruled, photo, 섹션 grid는 폐기했다.
- **모눈(`pattern-grid`)은 도해 figure 요소 자체의 배경이다.**
  - 개수는 페이지당 1개 이하다.
  - 셀은 48px, `(width >= 40rem)`에서 56px이다.
  - 선은 `--line-hair`, 정지 상태다.
  - 의사요소·마스크·z-index가 없고 가장자리는 하드 컷이다.
- **공통 금지**: 마스크, `filter`, `mix-blend-mode`, `backdrop-filter`, `background-attachment: fixed`, `contain: paint`, `will-change`, 배경 애니메이션.
- **허용처**: 홈 SolutionOverview 수업 OS 지도, HW ProductAnatomy 도해, /product 인덱스 도해. SW는 현재 후보가 0이다(도구 목록·LearningCycle 카드는 도해가 아니다).
- 본문 단락 뒤, 섹션 전체, 표, 먹 지면에는 모눈을 쓰지 않는다.

### 3-6. 먹 지면 — 허용 목록과 예산 (gap 반영)

- 칠하는 방법은 `surface-ink` 하나다(Section `surface="ink"` 또는 Footer 루트). 바탕은 단색이고, 블롭·그라데이션·그레인·글로우·글래스·그림자·mix-blend 이미지는 0이다.
- **허용**
  - 글자: `text-fg-ink|body|muted`. 알파 .50 미만인 읽는 글자는 금지한다.
  - PullQuote
  - 박스 없는 수치. `lib/facts.ts`에 등록된 출처 있는 것만 쓴다.
  - hair 구분선과 hair로 나눈 텍스트 행 목록(`<ul>`, 표 요소 아님)
  - Act 머리 괘선(`/.72`)
  - 푸터 뉴스레터 입력 1개 + `line` md 버튼 '구독'(C14)
  - 미리 합성한 제품 컷아웃(HW). `#111110` 위에 구워 두고, 글로우·blend·마스크는 0, 라벨은 '제품 렌더'다.
- **금지**
  - 채움 버튼(primary가 `.surface-ink` 안에 있으면 가드가 막는다)
  - Frame, 표, 사진, sheet 카드, 밝은 위젯·외부 임베드, 배지·pill
- 액센트 `#6EE7B7`은 선·점·밑줄·포커스에만 쓴다. Manifesto 그라데이션 텍스트(:38)는 `ink-underline-scrub`(typography·cards_motion 소관)으로 바꾼다.
- **예산**(Footer 제외, 빌드 HTML `[data-surface=ink]` 카운트)

| 페이지 | 먹 섹션 | 대상 |
|---|---|---|
| 홈 | 1 | Manifesto |
| SW | 1 | FullscreenQuote(PullQuote) |
| HW | 1 | AllInOne(타이포 먹 + hair 행 목록) |
| ai-report | 0 | 먹 지면 없음. Frame 안 mock에도 `surface-ink`를 쓰지 않는다(카운트 우회 예외 없음, §11-8) |
| /pricing·/product·읽기·전환 면 | 0 | |

### 3-7. 지면 위 카드·Frame 바탕과 그림자 (X05·C13)

| 섹션 지면 | 카드·Frame 바탕 | 테두리 | 링크 카드 hover·focus-within |
|---|---|---|---|
| paper·sunken | `bg-surface-sheet` | `border-line-hair` | `border-line-strong` + 화살표 2px, 160ms `--ease-soft`. 제목 색·밑줄·배경·그림자·이동은 바뀌지 않는다 |
| sheet | **카드·Frame 금지**(행·표·dl로 쓴다) | — | — |
| ink | **금지** | — | — |

- Frame은 `components/ui/figure.tsx`(imagery 소유, X10)에 있다. sheet + 1px hair + r8, 제목줄은 없고 그림자는 0이다. 목업은 Frame 안 오른쪽 위에 점선 태그 '예시 화면'을 단다(X11).
- **그림자**
  - 공개 화면에서는 `--shadow-deep` 하나만 쓰고, 대상은 Dialog·드롭다운·토스트·모바일 메뉴 패널이다.
  - 카드·Frame·표·컨트롤·섹션·헤더·MobileFloatingCTA의 그림자는 0이다.
  - `--shadow-card`는 공개 화면에서 쓰지 않는다(어드민은 유지).
- `components/ui/card.tsx`의 기본 그림자는 어드민과 공유하므로 바꾸지 않는다. 공개 variant에서만 0으로 한다(cards_motion 소관).
- 정보 카드에는 hover가 없다.

### 3-8. 헤더·모바일 메뉴·고정 바 (C27·X09)

| 요소 | 값 | 지금 |
|---|---|---|
| Header 루트 | `fixed inset-x-0 top-0 z-(--z-header) h-(--header-h) bg-surface-paper`. 높이 고정(76/80), 불투명, 그림자 0, 블러 0 | Header.tsx:54-57 `z-50 … bg-white/95 … shadow-[0_8px_24px…] py-4` / `bg-white/80 py-6`(92/87 → 77/72px로 바뀌며 Hero를 덮는다) |
| Header 하단선 | `after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:border-b after:border-line-hair after:opacity-0 after:transition-opacity after:duration-(--motion-base) after:ease-soft data-[scrolled=true]:after:opacity-100` | `border-b border-black/[0.08]` |
| 스크롤 감지 | 상단 1px 센티넬 IntersectionObserver → `data-scrolled` | scroll 리스너 |
| 모바일 메뉴 패널 | `bg-surface-paper`, 항목 높이 48, 항목 사이 hair, 그림자 `--shadow-deep`, `max-h-[calc(100svh-var(--header-h))]` | :87 `shadow-[0_14px_34px…]`, `100svh-5rem` |
| 모바일 메뉴 오버레이 | `bg-surface-scrim`, 블러 없음 | |
| 데스크톱 드롭다운 | `bg-surface-sheet` + hair, r ≤12, `--shadow-deep` | :135 `rounded-2xl … shadow-[0_12px_28px…]` |
| 활성 항목 | 채움 0. 표시는 controls의 index-tab 문법(aria-current + 2px 막대, C12) | :104·123·147·169 `bg-[#ECFDF5]` |
| 모바일 '쇼룸 예약' | ghost 텍스트 링크(X03) | :186 `bg-[#ECFDF5] hover:bg-[#D1FAE5]` |
| ProductTabNav | `sticky top-(--header-h) z-(--z-subnav) bg-surface-paper border-b border-line-hair`, 블러 0, `data-subnav` | :19 `top-[80px] z-40 bg-[#FAFAF8]/95 backdrop-blur-md border-black/[0.06]`(모바일 헤더 76에서 4px 틈), :31 활성 민트 |
| MobileFloatingCTA | `bg-surface-paper` 불투명 + 1px `--line-control` 아웃라인, 그림자 0, 블러 0, `z-(--z-floating)`, `bottom: calc(env(safe-area-inset-bottom) + 16px)` | 작업 트리: `bg-white/85 … shadow-[…] backdrop-blur-md z-40`. 다른 세션이 병합한 뒤에 적용한다 |
| 스킵 링크 | `z-(--z-skiplink)` | `z-[60]` |
| viewport | `export const viewport = { themeColor: DESIGN_TOKENS.paper, colorScheme: "only light" }`(값은 `lib/design-tokens.ts`). manifest는 만들지 않는다 | `app/layout.tsx`에 export 없음 |

- 하단선 opacity 페이드는 이동이 아니므로 reduced에서도 유지한다. `400ms` 리터럴은 쓰지 않는다(감사 §5-5-5를 320ms로 동기화).
- `:root:has(.site){color-scheme:light}`와 viewport `only light`로 Chrome·삼성 인터넷의 자동 다크 반전을 피한다. 실제로 피해지는지는 실기기에서 확인한다.

### 3-9. 푸터 (Footer.tsx:14)

Footer 루트는 `<footer className="surface-ink …">`이고 Section을 쓰지 않는다. 그래서 먹 예산에 들어가지 않는다.

| 요소 | 지금 | 목표 | 대비(먹 위) |
|---|---|---|---|
| 바탕 | `bg-[#111110]` | `surface-ink` | — |
| 본문·링크 | `text-[#A39E98]`(7.11, 비토큰) | `text-fg-body`, 링크는 `link-quiet`(controls) | 9.61 |
| 열 제목 | `text-white` | `text-fg-ink` | 18.08 |
| 사업자 정보 | `text-white/40` 12px(:72, **3.82 미달**) | `text-fg-muted text-note`(13px) | 6.14 |
| 저작권 | `text-white/25`(:83, **2.23 미달**) | `text-fg-muted text-note` | 6.14 |
| 구분 기호 | `|` `text-white/20`(:74) | '·' `text-fg-faint`, `aria-hidden` | 장식 |
| 내부 구분선 | `border-white/[0.08]`(:71) | `border-line-hair` | 장식 |
| 뉴스레터 입력 | dark variant | `bg-surface-sheet`(=`#111110`) + `border-line-control` + `text-fg-ink`, 플레이스홀더 `/.56`, 높이 44 | 테두리 3.70, 글자 18.08, 플레이스홀더 6.14 |
| '구독' 버튼 | — | `variant="line" size="md"`: 1px `--line-control`, 글자 `--fg-ink`, hover 경계 `--fg-ink`(C14) | 3.70 / 18.08 |

- FinalCTA(sunken)와 푸터 사이에는 경계선을 두지 않는다. 바탕 대비가 17.35:1로 충분하다.
- 법정 표기 블록 구성과 행 히트 44는 controls §3.6이 소유한다.

### 3-10. 띠

- **LogoBar**(홈, X16)
  - `<Section surface="sunken" rhythm="band">`, 서버 컴포넌트다.
  - 정적 줄바꿈 목록이다: 앞 12곳 + '외 {academies.length − 12}곳'(배열에서 계산). 이름은 `text-body font-medium text-fg-muted`이고 앞 점은 없다.
  - 마키, 좌우 페이드 div(:52-53), 인라인 keyframes(:72), `"use client"`, `border-y`(:42)를 삭제한다. 그래서 가드 예외도 0이다.
- **중간 CTA 띠**(홈 2곳: KeyUseCases 뒤, TestimonialWall 뒤)
  - `<Section surface="paper" rhythm="band">`, 안쪽 래퍼 `border-y border-line-hair py-6`
  - 덱 한 줄 + `<Button variant="line" size="cta">쇼룸에서 직접 보기</Button>`(ctaId `home_mid_showroom`, C15)
  - 데스크톱은 한 줄, 모바일은 세로 배치에 폭 전체 버튼이다.
- **FinalCTA 띠**(V5-A)
  - `<Section surface="sunken">`이고 안쪽 첫 요소에 `rule-double pt-6 md:pt-8`을 둔다.
  - h2(`text-h1`, 32→48/700) → 덱 → `<Button size="cta">`(primary, 모바일 폭 전체) + ghost 텍스트 링크 순서다(C10·C15).
  - Display·먹 패널은 쓰지 않는다. 바로 아래 먹 푸터와는 지면 대비와 위계(다른 섹션 h2 40px보다 한 단계 위)로 분리된다.
- **콘텐츠 CTA**(블로그·행사·자료)는 FinalCTA 띠와 같은 문법이거나 paper 위 sheet 카드(r12, hair)다. 먹 패널은 금지한다.

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

/* CTA 띠 윗선: 1px 먹 + 3px 간격 + 1px hair.
   forced-colors에서는 background-image가 none이 되어 먹 border만 남는다(의도된 대체). */
@utility rule-double {
  border-top: 1px solid var(--line-ink);
  background-image: linear-gradient(var(--line-hair), var(--line-hair));
  background-size: 100% 1px;
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
  /* 공개 화면에 남는 유일한 민트(가드 명시 예외). 글자는 리터럴 #111110이다.
     var(--fg-ink)를 쓰면 먹 위에서 #FAFAF8이 되어 민트 위 1.08:1이 된다. */
  :where(.site) ::selection {
    background-color: #D1FAE5;   /* #111110 글자 16.66 */
    color: #111110;
  }
}
```

- `.site` 표지는 C17의 세 곳에 붙는다. AppChrome 공개 분기의 `<div className="site contents">`, 공개 DialogContent 5곳, 토스트 뷰포트다. `body[data-shell]` effect는 만들지 않는다.
- AppChrome `<main>`(:122)의 `selection:bg-primary/20 selection:text-primary`는 삭제한다. 전역 `::selection`이 대신한다.
- 포커스 outline, 입력 16px 하한, autofill 덮개(`var(--surface-sheet)`), reduced 스피너는 site-base 끝의 무레이어 보증 블록 4개(system·controls 소유)가 맡는다. autofill 덮개는 먹 위에서 자동으로 `#111110`이 된다.

---

## 4. 사용 규칙과 대상 파일

### 4-1. 규칙 (Do)

- 바탕은 `<Section surface=…>`, `bg-surface-*`, `surface-ink` 클래스로만 칠한다. 글자·선은 `text-fg-*`·`border-line-*`·`decoration-line-link`로만 쓴다.
- 지면은 역할로 배정한다. sunken은 연속하지 않는다. sheet 섹션 안에는 카드·Frame을 두지 않는다.
- 섹션 분리는 `masthead`와 리듬 여백으로 한다. 장부·목록의 행은 실제 hair 테두리로 긋는다.
- 모눈은 도해 figure 자체에, 페이지당 1개만 쓴다.
- 헤더 오프셋은 `--header-h`로만, z는 `z-(--z-*)`로만 쓴다.
- 카드·Frame이 소비하는 루트 속성은 다음과 같다. 예산 검사 계약이다(열린 질문 2).
  - Card: `data-card`(cards_motion)
  - Frame: `data-frame`(imagery)

### 4-2. 홈 (`app/page.tsx` 순서, C19)

| # | 섹션 (파일:줄) | 지금 | 목표 지면 | 머리 괘선 | rhythm | 바뀌는 것 |
|---|---|---|---|---|---|---|
| 1 | Hero (Hero.tsx:15-120) | 래퍼 #FAFAF8, sticky 커버 #0A1511(:17), 오버레이 3겹(:32-34), 글래스 배지(:40), 겹침 섹션 + 위 그림자(:86), 유령 글자, 그라데이션 1px(:118) | paper | — (Kicker `folio={null}`) | none | **V3-A**: 커버·오버레이·겹침·유령 글자·그라데이션 선을 삭제하고 7/5 표지로 바꾼다. 오른쪽은 capture Frame(EDB 판서 16:10, r8, 그림자 0, 캡션 '실제 화면 · YYYY.MM 캡처')이다. 확보 전에는 현재 도판 + 'AI 생성 이미지' 라벨 하나를 둔다(C09). 배지는 V9-A Kicker로 바꾼다. LCP는 H1이다 |
| 2 | LogoBar (:42) | #F6F5F4 + border-y .06 + 마키 + 페이드 | sunken | — | band | 정적 목록(X16), border-y·페이드·마키 삭제 |
| 3 | HomeEntitySummary (:20) | white | sheet | **01 선언** | act | 클래스 이름만 바꾼다. `dl` 좌측선 `#084734/20`은 hair로 |
| 4 | EraVision (:28-35) | #FAFAF8 + 인라인 80px 그린 격자(.025) | paper | **02 시대** | act | 격자 삭제(모눈 없음). 그라데이션 선(:48·52)은 Kicker로, 카드 hover `#ECFDF5/40`(:91)은 삭제(링크 카드면 C13) |
| 5 | ProblemCost (:72-82) | #111110 + 흰 격자 + 블롭(:78-79) + 노이즈(:82) + 카드 #1C1B1A·#2a2925·white | sheet | **03 공감** | act | **V4-A·C08**: 정성 장부 6행(○ + 모듈명 `text-label` + 질문형 문장 `text-body`), 행 구분은 hair다. 숫자 열·합계 이중선·카운터는 0이다. 다크·격자·블롭·노이즈·카드를 삭제한다 |
| 6 | HomeLeadMagnet (:25) | white, #ECFDF5 타일(:90)·노트(:105) | sunken(부록) | — | base | 민트 타일은 sheet 카드 + hair로, 노트는 텍스트 + hair로 바꾼다. `scroll-mt-[76px]` 삭제 |
| 7 | Manifesto (:7-9) | #111110 + 800px 블러 + 그라데이션 텍스트(:38) | **ink** | — | act | 글로우·`overflow-hidden` 삭제, 둘째 줄 `ink-underline-scrub` |
| 8 | SolutionOverview (:56) | #F6F5F4, 그라데이션 pill(:59) | sunken(도해) | **04 솔루션** | act | pill은 Kicker로 바꾼다. OS 지도 figure에 `pattern-grid`(페이지 유일) |
| 9 | KeyUseCases (:13) | #F6F5F4, 이미지 칸 #ECFDF5(:45·63·81·104), 블롭(:167-168), 그라데이션(:166), `rounded-[2rem]`(:163) | paper | — | base | 이미지 칸은 Frame으로 바꾸고 블롭·그라데이션을 삭제한다. 반경은 카드 r12 / Frame r8 |
| — | 중간 CTA 띠 ① | — | paper | — | band | §3-10 |
| 10 | DashboardPreview (:100-120) | 135° #031a12→#084734 + 오브 3 | paper | **05 화면·사례** | act | mock Frame('예시 화면' 점선 태그)에 서버 SVG 차트를 둔다. 홈에서는 '그림 n' 번호가 0이다 |
| 11 | ScienceBased (:9-13) | #111110 + 노이즈(:11) + 블롭 2 + #ECFDF5(:72) | sheet | — | base | 다크·노이즈·블롭·민트 삭제 |
| 12 | SatisfyingClass (:9) | #F9F8F4(비토큰) | **sunken**(카드 받침) | — | base | 인덱스 카드(sheet)가 sunken 위에 뜬다(1.09) |
| 13 | CaseStudies (:127) | #F6F5F4 | paper | — | base | 사례 카드가 주인공이다 |
| 14 | GlobalScale (:15) | #ECFDF5 + border-y, 민트 원형 칩(:47), white 타일(:45) | sheet | — | base | 민트·border-y·아이콘 삭제. 칸은 채움 없이 hair border로 긋는다. 수치는 `lib/facts.ts` 등록분만 쓰고, 0개면 섹션을 렌더하지 않는다(감사 D3) |
| 15 | TestimonialWall (:28) | #F7F8F5(비토큰) | paper | — | base | — |
| — | 중간 CTA 띠 ② | — | paper | — | band | §3-10 |
| 16 | Outcomes (:31) | #F6F5F4, 민트 원(:57), 그라데이션 카드(:86) | **sunken**(카드 받침) | — | base | 민트 원·그라데이션 삭제 |
| 17 | Comparison (:43) | white, 그라데이션 pill(:46), 카드형 표 + 그림자 + 먹 머리(:63-67), zebra `#F6F5F4/60` | sheet | **06 확신** | act | pill은 Kicker로, 표는 `table-paper`(상단 먹선, 머리 아래 strong, 행 hair, zebra·그림자·hover 들림 0)로 바꾼다. Classin 열 `.row-accent` |
| 18 | FinalCTA (:11-17) | 다크 + 그라데이션 + 노이즈(:14) + 블롭 + 글래스 핑 배지 | sunken | `rule-double` | base | **V5-A** |
| — | Footer (Footer.tsx:14) | #111110 | ink(셸) | — | — | §3-9 |

- 홈 예산: ink 1, `pattern-grid` 1, masthead 6, sunken 6(LogoBar·LeadMagnet·Solution·SatisfyingClass·Outcomes·FinalCTA, 연속 0), sheet 섹션 안 카드·Frame 0, 그림자 있는 Frame 0.
- 블롭을 지울 때 섹션 루트의 `overflow-hidden`은 Section의 `overflow-x-clip`으로 바뀐다.
- 감사 D8(섹션 통합)이 승인되면 CaseStudies~Testimonial을 paper 한 섹션으로 합치고 띠 ②는 그 뒤에 둔다. GlobalScale이 렌더되지 않아도 sunken은 연속하지 않는다.

### 4-3. 제품 SW (`app/product/sw/page.tsx`, 렌더 순서)

- 래퍼(:1587) `bg-[#FDFCF8]`는 `bg-surface-paper`로 바꾸고, `selection:bg-[#D1FAE5]`는 삭제한다.
- `sheet*`는 white 섹션을 이름만 바꾼다는 뜻이다. 안에 카드·Frame이 있으면 paper로 바꾼다. 판정은 구현 PR에서 `[data-surface=sheet] :is([data-card],[data-frame])`가 0인지로 한다.

| # | 섹션 | 지금 | 목표 | 처리·머리 |
|---|---|---|---|---|
| 1 | Hero :1592 | #07110d + 영상 배경(포스터 two-way-blackboard 스톡) | paper | 지면 표지 문법. 영상은 Frame 안에 두고 C07 네 조건(≥64rem, hover:hover, no-preference, 정지 버튼·화면 밖 정지)을 따른다(imagery 소관) |
| 2 | Summary :1668 | white | sheet* | 장 머리 01 |
| 3 | ImpactText(정의 :1221) | #FDFCF8 | paper | — |
| — | WaveDivider(정의 :209, 사용 :1697·1773·1837·1928·2148) | 곡선 SVG 5개 | **삭제** | — |
| 4 | '회의용 도구로…' :1702 | white | sheet* | 장 머리 02 |
| 5 | LearningCycle(:945) | white + 색 카드 3 | paper(카드 주인공) | 카드는 sheet + hair로 바꾸고 `p.color` 틴트를 삭제한다 |
| 6 | '교사만 쓰는 칠판은…' :1778 | 래퍼 바탕 | paper | 변화 없음 |
| 7 | '수업이 지루할 틈이…' :1842 | white | sheet* | 도구 목록에 모눈을 쓰지 않는다(도해 아님) |
| 8 | '1:1 과외부터…' :1933 | 래퍼 바탕 | paper | 변화 없음 |
| 9 | HardwareTeaser(:1004) | #1a1a19 + radial | sunken(띠) | — |
| 10 | FullscreenQuote(:1267) | #084734 면 + feTurbulence(:1271-1273) + 블러 글로우(:1276) | **ink** | PullQuote. SW 유일한 먹이다 |
| 11 | '전 세계 어디서든' :2003 | #111110 + 지도 점 장식 | 렌더 안 함 → 등록 후 sheet | `lib/facts.ts` 등록 전에는 렌더하지 않는다(감사 D3). 등록되면 ScaleFacts/Numeral 정적 값 |
| 12 | '수업이 끝나도…' :2049 | 래퍼 바탕 | paper | 장 머리 03 |
| 13 | AIFeatures(:1078) | #F6F5F4 | sunken(유지) | — |
| 14 | CaseStudiesSection(:1368) | #FDFCF8 | paper | — |
| 15 | '수업 운영을 바꾼 사람들' :2153 | #F6F7F2 | paper | — |
| 16 | PricingValue(:1431) | white | sheet* | 장 머리 04 |
| 17 | OnboardingRoadmap(components/product/sw/OnboardingRoadmap.tsx:55) | white | sheet* | 이름만 |
| 18 | FAQ(:1167) | #FDFCF8 | paper | — |
| 19 | CinematicCases(:648) | #1a1a19 | paper | — |
| 20 | TypographyHook(:720) | #FDFCF8 | paper | — |
| 21 | FutureVision1(:782, 사용 :2187) | #084734 면 | paper | 그린 면 퇴역 |
| 22 | FutureVision2(:826, 사용 :2188) | #FDFCF8 | paper | — |
| 23 | FinalCTASection(:509, 바탕 :540-542) | #F0FDF9 그라데이션 + 파티클 + 글로우 | sunken | `rule-double`, V5-A 문법 |

- SW 예산: ink 1, `pattern-grid` 0(도해 figure가 생기면 1), masthead 4, sunken 9·13·23(연속 0).
- SW 다이어트(감사 §5-5-2, L)로 섹션이 줄면 같은 규칙으로 다시 배정한다.

### 4-4. 제품 HW (`app/product/hw/page.tsx`, 렌더 순서)

- 래퍼(:780) `bg-[#FDFCF8] … selection:bg-[#D1FAE5] pt-20`는 `bg-surface-paper pt-(--header-h)`로 바꾼다.

| # | 섹션 | 지금 | 목표 | 처리·머리 |
|---|---|---|---|---|
| 1 | Hero :785-787 | #FDFCF8→#ECFDF5→#FDFCF8 그라데이션 | paper | 그라데이션 삭제 |
| 2 | Summary :856 | white | sheet* | 장 머리 01 |
| 3 | OpeningStatement(OpeningStatement.tsx:29-31) | #FAFAF8 | paper | — |
| 4 | ClassroomStudio(ClassroomStudioSection.tsx:49) | white | sheet* | 이름만 |
| 5 | PainPointsV2(PainPointsV2.tsx:54) | white | sheet* | 이름만 |
| 6 | AllInOne(AllInOneStatement.tsx:19-49) | #010302 + radial + 위아래 그라데이션, 네온 글래스 3D 이미지 `ops-glass-energy-module-black.webp`(글로우가 구워져 있음) + `mix-blend-screen`(:38) + 마스크 2겹(:27-28·48-49) | **ink** | 장 머리 02(먹 위 `/.72`). 이미지·blend·마스크를 제거하고 capability를 hair로 나눈 텍스트 행 목록으로 세운다(표 요소 아님, §3-6). HW 유일한 먹이다. 컷아웃을 다시 쓸지는 열린 질문 3 |
| 7 | AICamera(AICameraSection.tsx:18-19) | #050708 + 그라데이션 | sheet* | — |
| 8 | BigBackdrop(BigBackdropImage.tsx:48-71) | black + 오버레이 .85/.40 + 패럴랙스 scale + `h-[90vh]` | **paper + Figure/Frame** | 사진 위 카피는 0이다. Frame(r8, 그림자 0) + 캡션 라벨(X11, 열린 질문 4). 카피는 Frame 옆(≥64rem)이나 아래(모바일). 패럴랙스·오버레이·90vh 삭제 |
| 9 | ImpactNumbers :471-472 | #0d1a12 + radial | **렌더 안 함** | 감사 D3·D5. 등록되면 paper + ScaleFacts |
| 10 | DesignDetails(DesignDetails.tsx:53-55) | white | sheet* | 이름만 |
| 11 | LatencyProof(LatencyProof.tsx:34) | #F6F5F4 | sunken(도해, 유지) | 감사 D5 뒤 차트 opacity 순차(C06), dashoffset 0 |
| 12 | SizeChooser(SizeChooser.tsx:48) | white | sheet* | 이름만 |
| 13 | ValueAnchor(ValueAnchor.tsx:58-67) | #0D1A12 `min-h-screen` + blur-3xl 2개 + 글래스 카드 | paper | min-h-screen·블러·글래스 삭제 |
| 14 | ComparisonSection :126 | white | sheet | 장 머리 03, `table-paper` |
| 15 | FullWidthPoint '약속' :926(정의 :497-507) | #0d1a12 | paper | 문장 섹션. `dark` prop과 :507 오버레이 삭제 |
| 16 | FeatureTabSection :320 | white | sheet* | 이름만 |
| 17 | LessonTimeline :559 | #FDFCF8 | paper | — |
| 18 | ProductAnatomy :409 | #FDFCF8 | paper | 도해 figure에 `pattern-grid`(HW 유일) |
| 19a-c | FeatureSection ×3(:184) | 바탕 없음 | paper(래퍼) | 변화 없음 |
| 20 | AfterClass(AfterClassSection.tsx:57) | #F6F5F4 | sunken(유지) | — |
| 21 | FullWidthPoint '교실의 경계' :1092 | 풀블리드 사진 + `#0d1a12/75`(:507) | paper | Figure/Frame 사진 + 캡션, 카피는 Frame 밖 |
| 22 | FeatureSection(하이브리드) | 바탕 없음 | paper(래퍼) | 변화 없음 |
| 23 | 'COMPLETE ECOSYSTEM' :1155 | #111110 + #6EE7B7 글로우 | paper | 글로우 삭제 |
| 24 | Testimonial :615 | white | sheet* | 이름만 |
| 25 | SpaceScenario :689 | #FDFCF8 | paper | — |
| 26 | 라인업·사양 :1236 | 바탕 없음 | paper | 장 머리 04, 사양 표는 `table-paper`(모눈 없음) |
| 27 | OnboardingRoadmap(components/product/hw/OnboardingRoadmap.tsx:55) | #FDFCF8 | paper | — |
| 28 | 최종 CTA :1331 | white→#FDFCF8 그라데이션 + border-t | sunken | `rule-double`, border-t 삭제 |

- HW 예산: ink 1, `pattern-grid` 1, masthead 4(01 Summary · 02 AllInOne · 03 Comparison · 04 라인업), sunken 11·20·28(연속 0). 연속 다크 4장(6~9)이 먹 1장으로 줄어든다.

### 4-5. ai-report · /product · /pricing

- **ai-report**(`app/product/ai-report/page.tsx`, C26). '현행 유지'는 구조·레이아웃·카피만 해당하고, 토큰 퇴역은 예외 없이 적용한다.
  - 지면 순서: Hero :269 paper → Pipeline :334 sunken → Recording :382 sheet* → Report :549 sunken → **Benefits :662 `#ECFDF5` → paper** → Scenario :727 sheet* → Qa :785 sunken → Closing :834 sheet*
  - 목업 :464 `bg-[#1a1a19] shadow-2xl`은 Frame(sheet + hair, r8, 그림자 0)으로 바꾼다. 안쪽 UI 묘사는 밝은 토큰(`bg-surface-sunken`·`text-fg-*`·`border-line-*`)으로 그리고 `surface-ink`는 쓰지 않는다. 먹을 쓰면서 `[data-surface=ink]` 카운트에서 빠지는 예외는 canonical에 근거가 없다(§11-8). mock은 `aria-hidden`이고 sr-only 요약 + 점선 태그 '예시 화면'을 단다.
  - OutlineIcon은 IconFrame(투명)으로, '자동 녹화 중' 무한 점멸은 정적 `status-dot` + '자동 녹화'로, 무한 웨이브폼은 정적 막대로, 10px `#A39E98` 라벨은 점선 태그로 바꾼다.
  - 결과적으로 공개 화면의 `#ECFDF5`·`#D1FAE5`는 `::selection` 외에 0이 된다.
- **/product**: :100 white + `border-b`는 sheet*(border 삭제), :115는 paper, :153 #F6F5F4 + `border-t`는 sunken(border 삭제)으로 바꾼다. 인덱스 도해 figure에 `pattern-grid`를 쓴다.
- **/pricing**
  - :6은 `bg-surface-paper`로 바꾼다.
  - Plan 카드 :45-47 `rounded-[20px] border-black/[0.06] shadow-sm`은 sheet r12 hair, 그림자 0으로 바꾼다. 추천 Plan은 1px `--line-ink` 테두리 + 상단 '추천' 탭이다(C21, cards 소관).
  - 안내 박스 :72 `#F5FBF7`/`#DCE9E1` r20은 paper 위 sheet 카드(r12 + hair)로 바꾸고, 글자 `#44514A`는 `text-fg-body`로 바꾼다.
  - 선택 가이드가 고른 비교 행의 2px 바는 C21-②(controls)다.

### 4-6. 읽기·전환 면

- 블로그·문서·행사·자료·업데이트·FAQ·법무·계정·로그인은 plain이다(paper 바닥 + sheet 카드). 먹 0, 모눈 0이다.
- 먹 패널은 콘텐츠 CTA 띠로 바꾼다: `app/blog/BlogPageClient.tsx:330-331`, `app/events/[slug]/page.tsx:323`, `app/events/videos/[slug]/page.tsx:162`, `app/resources/[slug]/page.tsx:638`.
- `app/contact/page.tsx:332`: 바닥 `#EDF7F2`는 paper로, `text-slate-900`은 `text-fg-ink`로 바꾼다.
- `.section-warm`은 `bg-surface-sunken`으로 바꾼다: `app/docs/page.tsx:427`, `app/download/DownloadPageClient.tsx:418`.
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
| `app/layout.tsx` | viewport export(값은 `lib/design-tokens.ts`) |
| `lib/design-tokens.ts`(신규, system) | paper·sheet·sunken·ink 등 hex 미러 |
| `components/landing/Section.tsx`(신규) | §3-2 |
| `components/sections/Header.tsx`, `ProductTabNav.tsx`, `Footer.tsx`, `components/ui/MobileFloatingCTA.tsx`, `components/PublicRouteLoading.tsx` | §3-8·§3-9·§4-6 |
| `tests/design/surface-contrast.test.ts`(신규) | §8 수용 기준 |

### 4-8. 가드 기여 — `scripts/check-design-tokens.mjs` 규칙 배열 (형식·래칫·warn→error 일정은 system §6)

| id | 패턴(요지) | 허용 | 대체 제안 |
|---|---|---|---|
| `surf-mint` | `/#(ECFDF5\|D1FAE5)/i` | `app/styles/site-base.css`(`::selection`) | `bg-surface-paper`·hair·Kicker |
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

- 이 밖의 공통 규칙은 system §6이 소유한다: `shadow-*`(shadow-deep 제외), `rounded-2xl` 이상, `.surface-ink`·`.on-ink`·`--(surface|fg|line)-` 선언 위치, `z-[N]`·`z-50`, `.surface-ink` 안 primary Button, 공개 Radix `*Content`의 `site` 누락.
- **예산(`--budget`, 빌드 HTML)에 이 스펙이 보태는 것**
  - `[data-surface=ink]` ≤ 1
  - `.pattern-grid` ≤ 1
  - `[data-surface=sheet] :is([data-card],[data-frame])` = 0
  - `main` 안 `data-surface` 순서에서 `sunken` 연속 = 0
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
- **유지**(어드민): `--background`(= paper 값), `--card`, `--shadow-card`, `--shadow-deep`, `.dark`, `--crm-*`, `--color-warm-*`, `--color-near-black`, shadcn `--accent`
- 그레인을 쓰지 않는 이유는 넷이다.
  1. 단색 지면에는 밴딩이 없다.
  2. 크기가 지정되지 않은 SVG는 섹션 크기 × DPR로 래스터된다.
  3. `mix-blend-overlay`는 큰 면 블렌딩 합성을 만든다.
  4. 회색 노이즈가 웜 톤을 탁하게 한다.

---

## 5. 접근성·대비

### 5-1. 대비표 (직접 계산)

**밝은 지면 위 글자**

| 토큰 | sheet | paper | sunken | skeleton | 판정 |
|---|---|---|---|---|---|
| fg-ink #111110 | 18.89 | 18.08 | 17.35 | 16.54 | AAA |
| fg-body #31302E | 13.18 | 12.62 | 12.11 | 11.54 | AAA |
| fg-muted #615D59 | 6.53 | 6.24 | 5.99 | 5.71 | AA |
| fg-placeholder #78736D | 4.70 | 4.49 ✗ | 4.31 ✗ | 4.11 ✗ | 입력 바탕은 sheet만(V8-A) |
| fg-faint #A39E98 | 2.66 ✗ | 2.54 ✗ | 2.44 ✗ | 2.33 ✗ | 장식·비활성 전용 |
| fg-accent #084734 | 10.71 | 10.25 | 9.83 | 9.37 | AAA |
| fg-accent-hover #065C41 | 8.03 | 7.68 | 7.38 | 7.03 | AAA |
| fg-danger #B43E3E | 5.68 | 5.43 | 5.21 | 4.97 | AA |
| fg-on-accent #FAFAF8 on #084734 | 10.25 | | | | AAA |
| `::selection` #111110 on #D1FAE5 | 16.66 | | | | |

- **먹 위**: §2-3 표. 퇴출 대상 실측값은 `white/40` 3.82, `white/25` 2.23, `white/20` 1.85, 먹 위 `#084734` 1.76, 먹 위 `#B43E3E` 3.33이다.
- **선(비텍스트)**
  - line-control #8F8A84: sheet 3.42 / paper 3.27 / sunken 3.14 / 먹 `/.40` 3.70
  - line-link: sheet 3.49 / paper 3.43 / sunken 3.38 / 먹 3.86
  - strong 1.41, hair 1.18(장식). 고대비에서는 hair 2.10, strong 3.27(paper)
- **지면 사이**: sheet/paper 1.05, paper/sunken 1.04, sheet/sunken 1.09, ink/sunken 17.35.

### 5-2. 규칙

- 읽는 글자는 `fg-muted` 이상이다. 읽는 글자에 쓰인 `#A39E98`은 **hex → 토큰**(`text-fg-muted`)으로만 치환한다. hex → hex 치환은 금지한다. Footer·SW·HW 다크 구간을 `surface-ink`로 먼저 옮긴 뒤에 치환한다. 먹 위 `#A39E98`(7.11)을 `#615D59`로 바꾸면 먹 위 대비가 3.0 미만이 되기 때문이다.
- 경계 자체가 조작 단서인 요소는 `--line-control`이고 hover 시 `--fg-ink`가 된다(C23). 대상은 입력·select·textarea·체크박스·스위치·line 버튼·필터 칩·아이콘 단독 버튼·MobileFloatingCTA다. `--line-strong`은 장식선 전용이다.
- 포커스는 site-base 보증 ①의 2px outline `var(--fg-accent)` 하나다. 밝은 지면에서는 `#084734`(9.37–10.71), 먹 위에서는 `#6EE7B7`(12.40)이 된다. 공개 Dialog 5곳과 토스트도 `.site`로 덮인다.
- 상태 변화(선택·활성)는 면 채움이 아니라 3:1 이상의 단서(● 점, `#084734` 테두리·막대)와 텍스트로 표시한다.

### 5-3. 동작 줄이기 · no-JS · 강제 색 · 고대비 · 인쇄

- 지면·괘선·모눈은 전부 정적 CSS다. 동작 줄이기와 no-JS 상태에서도 화면이 같고, JS 전에 숨기는 지면은 없다.
- 지면에서 움직이는 것은 헤더 하단선 opacity 하나다(이동 없음).
- **강제 색(forced-colors)**
  - `masthead`는 `::before`의 border라서 CanvasText로 남는다.
  - `rule-double`은 먹 border만 남는다(hair는 사라짐).
  - `pattern-grid`는 사라진다.
  - 지면 색은 시스템 Canvas로 덮이므로 구분은 괘선과 헤딩이 맡는다.
- **고대비(`prefers-contrast: more`)**: 밝은 지면은 hair `/.32`, strong `#8F8A84`, 먹은 hair `/.32`, strong `/.40`이 되고 모눈은 소거된다.
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
| 페이지당 처리 | 먹 ≤1(+Footer), `pattern-grid` ≤1, sunken 연속 0 | 빌드 HTML 예산 모드 |
| 지면 처리용 합성 레이어 | **0** | 마스크·transform·will-change·opacity 애니메이션이 없다. Safari Web Inspector Layers로 확인 |
| 모눈 figure 단일 Paint | ≤ 8ms(iPhone 13급, iOS 18·26) | Timeline |
| 스크롤 프레임 | 홈 위→아래 플링 중 33ms 초과 프레임 0 | 실기기 |
| CSS 추가량(이 스펙 몫) | ≤ 1.0KB gzip. 삭제분과 합치면 순감소 | 빌드 산출물 비교 |
| LCP | 악화 0. 홈 LCP 요소는 H1이다(V3-A, Hero 이미지는 lazy, 데스크톱 media preload) | Lighthouse 모바일 3회 중앙값 |
| CLS | ≤ 0.05. 헤더 높이 고정, `.site` SSR | 같음 |
| 가로 넘침 | 375px에서 `scrollWidth === innerWidth` | Section `overflow-x-clip` |

---

## 7. 마이그레이션 (S/M/L, system §11 단계에 맞춘다)

순서를 고정하는 규칙은 셋이다.
- (a) `#A39E98` 치환은 hex → 토큰으로만 하고, Footer·SW·HW 다크를 `surface-ink`로 옮긴 뒤에 한다.
- (b) 대체 도판 커밋이 들어간 뒤에만 기존 도판을 뺀다.
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
- **[M] P2 셸·프리미티브**
  - Section 컴포넌트를 만든다. SolutionOverview에 먼저 적용하고 typecheck를 통과시킨다.
  - 셸: Header(§3-8), 모바일 메뉴(`--shadow-deep`, scrim), ProductTabNav, Footer(`surface-ink`, AA 미달 2곳 해소), PublicRouteLoading, 하드코딩 오프셋 7곳(Hero.tsx:15·17, ProductTabNav.tsx:19, Header.tsx:87, PublicRouteLoading.tsx:36, HomeLeadMagnet.tsx:25, hw/page.tsx:780)
  - MobileFloatingCTA는 규칙 (c)를 따른다.
  - Card 공개 variant의 그림자 0은 cards_motion 소관이다.
  - 대상 파일: components/landing/Section.tsx, components/sections/Header.tsx, components/sections/ProductTabNav.tsx, components/sections/Footer.tsx, components/PublicRouteLoading.tsx, components/ui/MobileFloatingCTA.tsx, components/sections/SolutionOverview.tsx
- **[M] P3 홈 Act 순서대로**
  - §4-2 표를 Act 단위로 커밋한다(서사 모먼트 1개 = 커밋 1개, 지면 변경은 해당 Act 커밋에 같이 넣는다).
  - 순서: Hero(V3-A) → LogoBar(X16) → 01 Entity → 02 Era → 03 ProblemCost 장부 → LeadMagnet → Manifesto → 04 Solution(+모눈) → KeyUseCases·띠① → 05 Dashboard → ScienceBased·SatisfyingClass·CaseStudies·GlobalScale·Testimonial·띠② → Outcomes → 06 Comparison → FinalCTA(V5-A).
  - 노이즈 마지막 사용처가 사라지면 `noise-texture.svg`를 삭제한다.
  - 대상 파일: app/page.tsx, components/sections/{Hero,LogoBar,HomeEntitySummary,EraVision,ProblemCost,HomeLeadMagnet,Manifesto,SolutionOverview,KeyUseCases,DashboardPreview,ScienceBased,SatisfyingClass,CaseStudies,GlobalScale,TestimonialWall,Outcomes,Comparison,FinalCTA}.tsx, public/images/noise-texture.svg
- **[M] P4-HW**
  - AllInOne은 타이포 먹으로 바꾼다(이미지·blend·마스크 제거, hair 행 목록).
  - BigBackdrop·FullWidthPoint 사진은 paper 위 Figure/Frame으로 옮긴다.
  - ImpactNumbers는 렌더하지 않는다.
  - AICamera·ValueAnchor·'약속'·ECOSYSTEM은 밝은 지면으로 바꾼다.
  - ProductAnatomy 모눈을 넣고, 최종 CTA는 sunken 띠로, white는 `sheet*` 규칙으로 바꾼다.
  - 대상 파일: app/product/hw/page.tsx, components/product/hw/{AllInOneStatement,AICameraSection,BigBackdropImage,ValueAnchor,OnboardingRoadmap}.tsx
- **[L] P4-SW**: SW 다이어트 PR과 함께 진행한다. 다크·그린 면(Hero·HardwareTeaser·FullscreenQuote·지도·CinematicCases·FutureVision1)은 먹 1곳(FullscreenQuote)과 밝은 지면으로 바꾼다. feTurbulence(:1271-1273)와 비토큰 바탕을 정리한다. — app/product/sw/page.tsx, components/product/sw/OnboardingRoadmap.tsx
- **[S] P4-기타**: ai-report(C26 전부), /product(border 삭제, 인덱스 모눈), /pricing(Plan 카드, 안내 박스). — app/product/ai-report/page.tsx, app/product/page.tsx, app/pricing/page.tsx
- **[M] P5 읽기·전환 면**: 먹 패널 4곳을 콘텐츠 CTA 띠로, `.section-warm` 2곳을 `bg-surface-sunken`으로, contact 바닥을 바꾼 뒤 `.section-warm`을 삭제한다. 가드 규칙을 error로 올리는 것은 system 일정을 따른다. — app/blog/BlogPageClient.tsx, app/events/[slug]/page.tsx, app/events/videos/[slug]/page.tsx, app/resources/[slug]/page.tsx, app/docs/page.tsx, app/download/DownloadPageClient.tsx, app/contact/page.tsx, app/globals.css
- **[S] 문서 동기화**(각 PR과 같은 커밋): 감사 문서 §5-2(story·progress 토큰 삭제), §5-4(LogoBar '마키 유지' → 정적 목록, X16), §5-5-5(400ms → 320ms), §5-6(배경 리듬 → V4·C19, `#A39E98` → `#8F8A84`, 'pill 1개' → V9), §5-8(BigBackdrop 스크롤 연동 허용 문구 삭제, 마키·히어로 영상 예외 삭제). — docs/active/public-site-audit-motion-plan-2026-10-26.md
- **백로그**: 정적 랜딩 `/l/*` 6종의 지면 hex와 feTurbulence(kids:93, meets-july:192·470). growth-crm 랜딩 이관에서 랜딩별 최근 4주 리드 기준선을 잡은 뒤 하나씩 한다. kids·meets-july는 캠페인 테마 예외다.

---

## 8. 수용 기준

1. **대비 테스트**: `vitest tests/design/surface-contrast.test.ts`가 통과한다.
   - 이 테스트는 `app/styles/tokens.css`의 `:root`와 `.surface-ink` 블록을 정규식으로 읽고, 기대 키 20개(+ 먹 재정의 키)를 모두 찾았는지 먼저 단언한다. 누락은 실패다.
   - 밝은 지면: fg-ink·body·muted·accent·accent-hover·danger가 sheet·paper·sunken에서 4.5 이상, fg-placeholder가 sheet에서 4.5 이상, fg-on-accent가 fg-accent 위에서 4.5 이상, line-control·line-link가 세 지면에서 3.0 이상이어야 한다.
   - 먹 위: rgb 알파를 `#111110`에 합성해 계산한다. fg-ink·body·muted·placeholder·accent·danger가 4.5 이상, line-control·line-link가 3.0 이상이어야 한다.
2. **P0 무변화**: system §11 스크린샷 비교(/, /product/sw, /product/hw, /pricing, /blog, /contact, /share 1건, /admin 2건)에서 차이가 0이고, typecheck·eslint·vitest·build(prebuild 가드 포함)가 통과한다.
3. **가드**: 가드가 래칫 기준선보다 늘어난 건수 없이 통과한다. P5 뒤 `surf-*` 규칙의 공개 범위 건수는 0이다(허용 목록 제외). `grep -rnE "noise-texture|feTurbulence" app components lib public/images` 결과가 P4-SW 뒤 0건이다.
4. **오프셋**: `grep -rnE 'top-\[(76|80)px\]|pt-\[(76|92)px\]|scroll-mt-\[76px\]|100svh-(76px|5rem)' components app --exclude-dir=admin` 결과가 0건이다.
5. **헤더**: 헤더 높이가 스크롤 전후로 같다(375에서 76px, 1440에서 80px). 그림자는 0이고, 하단 hair만 opacity로 바뀐다. 첫 화면 헤더 아래에 틈·회색 띠가 없다.
6. **홈 예산**: 운영 빌드 홈 콘솔에서 아래 스니펫이 `{ink:1, sunkenAdj:false, grid:1, masthead:6, sheetCards:0, shadowed:0}`을 반환한다. SW·HW에서는 ink ≤1, sunkenAdj false, grid ≤1, sheetCards 0, shadowed 0이다.
   ```js
   const v=[...document.querySelectorAll('main section[data-surface]')].map(e=>e.dataset.surface);
   ({ink:v.filter(x=>x==='ink').length,
     sunkenAdj:v.some((x,i)=>x==='sunken'&&v[i+1]==='sunken'),
     grid:document.querySelectorAll('main .pattern-grid').length,
     masthead:document.querySelectorAll('main .masthead').length,
     sheetCards:document.querySelectorAll('main section[data-surface=sheet] :is([data-card],[data-frame])').length,
     shadowed:[...document.querySelectorAll('main [data-card], main [data-frame]')].filter(e=>getComputedStyle(e).boxShadow!=='none').length})
   ```
7. **금지 효과 0**: 공개 페이지 전 요소에서 아래 식이 참이다(backdrop-filter·mix-blend·mask·fixed 배경 0).
   ```js
   [...document.querySelectorAll('body *')].filter(e=>{const s=getComputedStyle(e);return s.backdropFilter!=='none'||s.mixBlendMode!=='normal'||s.backgroundAttachment.includes('fixed')||(s.maskImage&&s.maskImage!=='none')||(s.webkitMaskImage&&s.webkitMaskImage!=='none')}).length === 0
   ```
8. **민트 0**: 공개 페이지에서 computed `background-color`가 `rgb(236, 253, 245)`·`rgb(209, 250, 229)`인 요소가 0개다(`::selection` 제외).
9. **스코프**
   - 홈에서 DemoModal을 열면 DialogContent에 `site` 클래스가 있고, 안의 텍스트 선택색이 민트다.
   - /admin의 Dialog에는 `site` 클래스가 없다.
   - 렌더된 HTML에 `<meta name="theme-color" content="#FAFAF8">`와 color-scheme `only light`가 있다.
10. **가로 넘침**: 375px 폭에서 /, /product/sw, /product/hw 모두 `document.documentElement.scrollWidth === innerWidth`다. 블롭 제거 뒤 안쪽 sticky 요소가 동작한다.
11. **대비 검사**: Chrome DevTools CSS Overview의 Contrast issues가 375×812와 1440×900에서 /, /product/sw, /product/hw, /product/ai-report, /pricing 모두 0건이다(aria-hidden 장식 제외). 푸터 사업자 정보·저작권은 13px 이상이고 대비가 6.14다.
12. **정적성**: JS를 끈 상태와 reduced 에뮬레이션에서 홈 전 섹션의 지면·괘선·모눈이 JS를 켠 상태와 같다. forced-colors에서는 머리 괘선과 `rule-double` 윗선이 보인다. `prefers-contrast: more`에서는 hair가 진해지고 모눈이 사라진다.
13. **앵커**: `/#<섹션 id>`로 이동하면 섹션 상단이 헤더 하단에서 16±2px 아래에 온다(375·1440). canonical 값 그대로면 오프셋이 이중으로 더해진다(canonical 내부 충돌, 열린 질문 1). canonical이 정정되기 전에는 판정을 보류하고, P2 Section PR 전에 정정한다.
14. **실기기**
    - iPhone(iOS 18·26, DPR3)과 Android(DPR 2.625), Windows 100·110·125% 확대에서 모눈 figure에 모아레가 없다. 선 두께가 고르지 않은 것은 장식이라 허용한다.
    - Safari Layers에 지면 처리 때문에 생긴 합성 레이어가 0이다. 홈 플링에서 33ms를 넘는 프레임이 0이다.
    - 삼성 인터넷 강제 다크에서도 지면이 반전되지 않는다.
15. **Lighthouse**(모바일 3회 중앙값, 홈): CLS 0.05 이하, LCP는 기준선보다 나빠지지 않고, LCP 요소는 H1이다.
16. **어드민 무변경**: /admin 대표 3화면(대시보드·CRM 리드·HW)의 적용 전후 스크린샷이 같다.
17. **문서**
    - DESIGN.md에 §9가 반영돼 있다.
    - `grep -n ECFDF5 DESIGN.md`에서 공개 화면에 #ECFDF5를 권하는 줄이 0이다(어드민 상태 틴트와 퇴역 안내 줄만 남는다).
    - 감사 문서 §5-2·§5-4·§5-5-5·§5-6·§5-8이 이 스펙과 충돌하지 않는다.

---

## 9. DESIGN.md 반영안

적용 범위는 두 구획('적용 범위: public(.site) / admin')으로 나눈다. 토큰마다 상태 배지(**in force** / **target** / **retired**)를 단다. P0에서 넣는 토큰은 target으로 시작하고, 해당 단계의 화면 이관이 끝나면 in force로 바꾼다. 어드민 전용 절(Status·확도·Team·히트맵·채널 식별색·어드민 라벨 단순화)은 바꾸지 않는다.

────────────────────────────────────────
**[교체] §1 핵심 철학 — '그린 액센트'·'경량 보더' 두 줄**

- **그린은 잉크**: Classin Green(`#084734`)은 유일한 포화 컬러다. 공개 화면에서는 면을 칠하지 않는다. 밑줄·출처 번호·Kicker·한 계열 차트선·primary CTA 채움에만 쓴다.
- **구획은 괘선과 여백**: 지면 색은 섹션을 가르지 않는다. 기본 선은 `1px rgb(17 17 16 / .08)`이다. 먹선(1px `#111110`)은 닫힌 목록 다섯 곳에만 쓴다: Act·장 머리, 표 상단, 숫자 장부 합계, CTA 띠 이중선, 추천 Plan.

────────────────────────────────────────
**[교체] §2 '### 그린 서피스 스케일' 절 전체**

### 그린 서피스 스케일 — 어드민 상태 틴트와 선택 영역 전용
- **Green Surface 50** (`#ECFDF5`)·**100** (`#D1FAE5`)는 어드민 상태 틴트(§2 Status·확도)와 공개 화면 `::selection`(`#D1FAE5`, 글자 `#111110` 16.66:1)에만 쓴다.
- **공개 화면 사용은 retired(2026-10-26)다.** 섹션 면·카드·타일·아이콘 원·활성 채움·추천 열·배지에 쓰지 않는다. 근거는 취향(파스텔 면 금지)이다. 민트는 휘도 대비가 1.01:1이어도 색조 때문에 보인다.
- **Green Muted** (`#6EE7B7`)는 먹 지면 위 액센트다(밑줄·점·포커스·링크 hover, `#111110` 대비 12.40:1). 채움에는 쓰지 않는다.

────────────────────────────────────────
**[교체 표기] §2 웜 뉴트럴 스케일 두 줄**

- **Warm White** (`#F6F5F4`): 공개 화면에서는 sunken 지면이다(띠·도해·부록·카드 받침·CTA, 연속 금지). '섹션 교차 배경' 문구는 retired다.
- **Warm Gray 300** (`#A39E98`): 장식·비활성 전용이고 읽는 글자에는 쓰지 않는다(2.66:1). 플레이스홀더는 `#78736D`(sheet 위 4.70)다.

────────────────────────────────────────
**[신설] §2 '### 웜 뉴트럴 스케일' 바로 아래**

### 지면 토큰 — public(.site) (코드: `app/styles/tokens.css`, 유틸 `bg-surface-*`, 먹은 `surface-ink` 클래스)

| 토큰 | 값 | 상태 | 배정 기준 |
|---|---|---|---|
| `--surface-paper` | `#FAFAF8` | target | 기본값. 카드·Frame이 주인공인 섹션, Hero, 중간 띠, 읽기 면, 고정 바 |
| `--surface-sheet` | `#FFFFFF` | target | 카드·표·폼·Frame·입력 바탕, 텍스트·표·장부 위주 섹션(안에 카드 금지) |
| `--surface-sunken` | `#F6F5F4` | target | 띠·도해·부록·카드 받침·CTA. 연속 금지 |
| `--surface-ink` | `#111110` | target | 페이지당 서사 1곳 + 푸터. `surface-ink` 클래스로만 칠한다 |
| `--surface-skeleton` | `#F0F0EC` | in force | 로딩 |
| `--surface-scrim` | `rgb(17 17 16 / .48)` | target | Dialog·메뉴 오버레이(블러 없음) |

- 공개 화면 다크는 `#111110` 한 종류다. `#1a1a19`·`#0D1A12`·`#0A1511`·`#07110d`·`#05080C`·`#050708`·`#010302`·`#0B3328`·`#031a12`·`#1C1B1A`와 그 그라데이션은 retired다. 먹과의 대비가 1.02~1.08:1이라 구분 효과도 없다.
- 비토큰 밝은 바닥(`#FDFCF8`·`#F9F8F4`·`#F7F8F5`·`#F6F7F2`·`#EDF7F2`·`#F0FDF9`·`#F5FBF7`)은 가장 가까운 토큰으로 흡수한다.
- **먹 지면 재정의**: `.surface-ink` 안에서는 같은 토큰 이름이 밝은 값으로 바뀐다.
  - 글자: `#FAFAF8`(18.08), 본문 `/.72`(9.61), 보조 `/.56`(6.14). 알파 하한은 .50이다.
  - 액센트·포커스·링크 hover는 `#6EE7B7`, 오류는 `#E89A94`(8.53)다.
  - 선: hair `/.12`, strong `/.24`, 머리 괘선 `/.72`, control `/.40`(3.70), 링크 밑줄 `rgb(110 231 183/.5)`
  - 입력 바탕은 `#111110`이다. 먹 위에는 채움 버튼·Frame·표·사진·카드를 두지 않는다.
  - 그래서 Tailwind 매핑은 반드시 `@theme inline`이다.

### 글자 토큰과 대비 — public(.site) (코드: `--fg-*`, 유틸 `text-fg-*`)

| 토큰 | 값 | sheet | paper | sunken | 용도 |
|---|---|---|---|---|---|
| `--fg-ink` | `#111110` | 18.89 | 18.08 | 17.35 | 헤딩 |
| `--fg-body` | `#31302E` | 13.18 | 12.62 | 12.11 | 본문 |
| `--fg-muted` | `#615D59` | 6.53 | 6.24 | 5.99 | 모든 보조 글자 |
| `--fg-placeholder` | `#78736D` | 4.70 | — | — | 플레이스홀더(입력 바탕 sheet) |
| `--fg-faint` | `#A39E98` | 2.66 | 2.54 | 2.44 | 장식·비활성 전용 |
| `--fg-accent` / `-hover` | `#084734` / `#065C41` | 10.71 / 8.03 | 10.25 / 7.68 | 9.83 / 7.38 | 링크·Kicker·강조·primary 채움 |
| `--fg-danger` | `#B43E3E` | 5.68 | 5.43 | 5.21 | 공개 화면 오류색 하나 |
| `--fg-on-accent` | `#FAFAF8` | `#084734` 위 10.25 | | | 그린 채움 위 글자 |

────────────────────────────────────────
**[교체] §2 '### 헤어라인 보더 토큰' 절 → '### 선 토큰'**

### 선 토큰 — public(.site) (코드: `--line-*`, 유틸 `border-line-*`·`decoration-line-link`)
- **hair** `rgb(17 17 16 / .08)`: 기본 whisper 선이다. 카드·행·띠·모눈·헤더 하단선에 쓴다.
- **strong** `/.16`: 장식선 전용이다(표 머리 아래·바이라인·읽기 전용 필드·링크 카드 hover).
- **ink** `#111110` 1px: 먹선 다섯 곳 전용이다.
- **control** `#8F8A84`: 경계가 조작 단서인 요소(입력·체크박스·스위치·line 버튼·필터 칩·아이콘 단독 버튼·하단 플로팅 CTA)와 도해 정보선·○ 점·차트 비교선에 쓴다. sheet 3.42 / paper 3.27 / sunken 3.14로 비텍스트 3:1을 넘는 유일한 웜 그레이다. hover에서는 `#111110`이 된다.
- **link** `rgb(8 71 52 / .6)`: 링크 밑줄이다(3.38–3.49:1).
- 고대비(`prefers-contrast: more`)에서는 hair `/.32`, strong `#8F8A84`로 바뀐다.

### 헤어라인 보더 — admin (기존 문단 유지)
- 기존 '기본 `rgba(0,0,0,0.08)`'과 '불투명 등가 `#E8E8E4`' 문단은 어드민에 그대로 둔다. 공개 화면의 `#E8E8E4`는 retired다. 불투명 paper 위의 hair와 같은 색이라 hair 하나로 쓴다.

────────────────────────────────────────
**[신설] §2 '### 보더 & 섀도' 끝**

- **public(.site) 지면은 평면이다.** 그림자는 Deep Shadow 하나만 쓰고, Dialog·드롭다운·토스트·모바일 메뉴 패널처럼 떠 있는 레이어에만 둔다. 카드·Frame·표·컨트롤·섹션·헤더·하단 플로팅 CTA의 그림자는 0이다. Card Shadow는 공개 화면에서 retired이고 어드민은 유지한다.

────────────────────────────────────────
**[교체] §4 '**Pill Badge**' 블록 (V9-A)**

**Pill Badge — admin 전용**
- 공개 화면에서는 retired다. 단일 강조는 Kicker(폴리오 + 16×2px `#084734` 바 + 13/600 `#084734` 라벨)로 하고, 상태는 점(●/○/–) + 텍스트로 하고, 상호작용 필터는 아웃라인 칩으로 한다.
- 어드민에서 쓸 때는 기존 값(Background `#ECFDF5`, Text `#084734`, Radius `9999px`, Padding `4px 10px`, 12px/600)을 유지한다.

────────────────────────────────────────
**[교체] §5 '### 배경 교차 리듬' 절 전체**

### 지면 배정과 배경 처리 — public(.site)
- **분리는 괘선과 여백으로 한다.** 지면 3장 사이 대비는 1.04~1.09:1이라 면 색은 섹션을 가르지 않는다. Act 머리에 1px 먹 괘선(콘텐츠 폭, 섹션 안 첫 요소, 위 16px)을 둔다. 섹션 사이 하드 보더·물결 구분선·그라데이션 장식선은 쓰지 않는다.
- **배정은 역할로 한다.** 교대로 정하지 않는다. sunken은 연속 배치하지 않는다. sheet 면 카드·Frame은 paper·sunken 위에만 둔다. 먹은 페이지당 서사 1곳(+푸터)이고 읽기 면에는 0이다.
- **배경 처리는 plain 하나다.** 모눈은 도해 figure 자체의 배경으로만 쓴다: 페이지당 1개, 48px(≥40rem 56px), hair 선, 정지.
- **금지**: 그라데이션 면, 블러 블롭, 글로우, 글래스(backdrop-filter), 그레인·노이즈(feTurbulence 포함), mix-blend, 마스크, `background-attachment: fixed`, `contain: paint`, 움직이는 배경(패럴랙스 포함), 섹션 배경 괘선·rails·사진 위 카피.
- **홈 목표 지면**(V4-A): Hero paper → LogoBar sunken 띠 → Entity sheet「01」 → Era paper「02」 → ProblemCost sheet 장부「03」 → LeadMagnet sunken → Manifesto 먹 → Solution sunken(도해 figure 모눈)「04」 → KeyUseCases paper → 중간 띠 paper → Dashboard paper「05」 → ScienceBased sheet → SatisfyingClass sunken → CaseStudies paper → GlobalScale sheet → Testimonial paper → 중간 띠 paper → Outcomes sunken → Comparison sheet「06」 → FinalCTA sunken 띠(V5-A) → Footer 먹

(§5 간격·컨테이너 줄은 system 스펙의 반영안을 따른다. `--header-h`는 76px, ≥48rem에서 80px다.)

────────────────────────────────────────
**[교체] §6 접근성 첫 세 줄**

- 본문 글자(`#111110`) 대비: sheet 18.89 / paper 18.08 / sunken 17.35:1 (AAA)
- 보조 글자(`#615D59`) 대비: white 6.53 / paper 6.24 / sunken 5.99:1 (AA). 기존 '~5.5:1'은 오기다. 읽는 글자에 `#A39E98`(2.66:1)은 쓰지 않는다.
- Green(`#084734`) 대비: white 10.71 / paper 10.25:1 (AAA). 먹 위 포커스·액센트는 `#6EE7B7`(12.40:1)을 쓰고, 먹 위 `#084734`(1.76:1)는 쓰지 않는다.
- 비텍스트 경계는 `#8F8A84` 이상(3:1)이다. hair·strong 선과 지면 색 차이는 장식이므로 의미를 혼자 전달하지 않는다.
- 먹 지면 글자의 알파 하한은 .50(5.18:1)이다. 먹 위 오류색은 `#E89A94`(8.53:1)다.

────────────────────────────────────────
**[교체] §7 4·5·6·7번, [추가] 9번**

4. 보더는 whisper `1px rgb(17 17 16 / .08)`다. 공개 화면에서는 `#E8E8E4`를 쓰지 않는다(어드민만 불투명 등가 허용).
5. 섀도: 공개 화면 지면은 평면이다. Deep Shadow는 떠 있는 레이어(Dialog·드롭다운·토스트·모바일 메뉴)에만 쓴다. 어드민은 4–5레이어(개별 opacity 0.01–0.05)를 유지한다.
6. 공개 화면 면은 paper `#FAFAF8` / sheet `#FFFFFF` / sunken `#F6F5F4` 3장과 먹 `#111110` 1장이다. 배정은 역할로 하고, 섹션 분리는 머리 괘선과 여백으로 한다. 배경 교차나 `#ECFDF5` 면으로 나누지 않는다.
7. 뱃지/필: 공개 화면에서는 쓰지 않는다(Kicker·점 + 텍스트·아웃라인 칩). 그린 서피스는 `::selection`과 어드민 상태 틴트에만 쓴다.
9. 공개 화면의 색·선은 토큰 유틸(`bg-surface-*`, `surface-ink`, `text-fg-*`, `border-line-*`)로만 쓴다. 임의 hex와 `bg-black|white|near-black|warm-*`는 쓰지 않는다. 섹션은 `components/landing/Section.tsx`로 감싼다. 위반은 `scripts/check-design-tokens.mjs`(prebuild, 래칫)가 막는다.

────────────────────────────────────────
**[결정 로그 절에 추가] (system §10이 절을 만든다)**

- V3 Hero: A(기본, 운영자 확정 전) — 지면 표지 + capture Frame, 홈 영상 0.
- V4 배경 리듬·공감 Act: A(기본) — 서사 먹 1(Manifesto), ProblemCost 정성 장부, plain only.
- V5 FinalCTA: A(기본) — sunken 띠 + rule-double + h2(text-h1) + primary cta.
- V7 배경 애니메이션: A(기본) — 정지.
- V8 입력 모양: A(기본) — 박스형, 바탕 `bg-surface-sheet`(먹 위 `#111110`).
- V9 Hero 배지: A(기본) — 삭제, Kicker.
- V1·V2·V6은 typography·icons 스펙이 같은 절에 추가한다(절 전체는 V1–V9).
- 각 항목에 확정 날짜, 근거, 보드 스크린샷 경로를 추가한다.

---

## 10. 하지 말 것

- `#ECFDF5`·`#D1FAE5`를 면·카드·타일·원·활성 채움·추천 열·배지에 쓰지 않는다(`::selection` 하나만 예외).
- 그라데이션 면, 블러 블롭, 글로우, 글래스, 그레인, mix-blend, 마스크 페이드, 패럴랙스, 움직이는 배경을 쓰지 않는다. 지면용 예외는 0이다.
- 공개 범위에서 임의 hex(`bg-[#…]`·`text-[#…]`·`border-[#…]`)와 `bg-black|white|near-black|warm-*`, `bg-surface-ink`를 쓰지 않는다. `#0D1A12` 같은 둘째 다크를 새 토큰으로 두지 않는다.
- `tokens.css` 밖에서 `--surface-*`·`--fg-*`·`--line-*`나 `.surface-ink`를 선언하지 않는다. `.on-ink`·`@utility surface-ink`를 만들지 않는다. `var()` 폴백을 쓰지 않는다.
- 섹션 사이 `border-y`, WaveDivider, 그라데이션 장식선, rails, 섹션 배경 모눈·괘선을 쓰지 않는다.
- sunken을 연속으로 두지 않는다. sheet 섹션 안에 sheet 카드·Frame을 두지 않는다.
- 먹 위에 채움 버튼·Frame·표·사진·카드·밝은 위젯을 두지 않는다. 둘째 먹 서사, 읽기 면의 먹, 먹 CTA 패널을 두지 않는다.
- 사진·영상 위에 카피를 얹지 않는다. 밝은 스튜디오 사진이나 글로우가 구워진 3D 이미지를 먹 위에 두지 않는다.
- 카드·Frame·표·컨트롤·섹션·헤더에 그림자를 두지 않는다. `--shadow-card`를 공개 화면에 쓰지 않는다. 공유 `card.tsx`·`dialog.tsx`·`toast.tsx`의 기본값은 바꾸지 않는다.
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
   - "sheet 섹션 안 카드·Frame 0"과 "Frame 그림자 0"을 세려면 루트 속성이 필요하다. Card는 `data-card`(cards_motion)다.
   - Frame은 `components/ui/figure.tsx`(imagery)가 루트에 `data-frame`을 다는 것으로 제안한다. imagery 스펙이 확정해야 한다.
3. **HW AllInOne 이미지**
   - 기본값은 삭제다(타이포 먹 + hair 행 목록).
   - 대안은 먹 허용 목록 안에서 `#111110` 위로 미리 합성한 글로우 없는 제품 컷아웃 1장 + 캡션 '제품 렌더'다. 지금의 `ops-glass-energy-module-black.webp`는 글로우가 구워져 있어 그대로는 쓸 수 없다.
   - 다시 구울지 운영자가 정한다.
4. **HW 사진 라벨**: `board-bezel-detail.webp`와 '교실의 경계' 사진이 실사인지 렌더인지 알려 주어야 X11 라벨(`사진 · {credit}` 또는 '제품 렌더')을 정할 수 있다. 자산 담당이 확인한다.
5. **사실 레지스트리 등록**
   - `lib/facts.ts`에 출처가 문서로 확인된 수치가 없으면 홈 GlobalScale, HW ImpactNumbers(12개국·1,200+), SW '전 세계 어디서든'은 렌더되지 않는다(감사 D3·D5).
   - 지금 GlobalScale 캡션 'EEO 공식 소개 기준'의 원문 출처와 기준일을 콘텐츠 담당이 확정해야 한다.
6. **병합 순서**: `app/globals.css`와 `components/ui/MobileFloatingCTA.tsx`가 작업 트리에서 수정 중이다. P0-1(import 3줄)과 P2(MobileFloatingCTA)를 그 커밋 뒤로 둘지 오케스트레이터가 순서를 정해야 한다.
7. **운영자 결정 대기**: V3·V4·V5·V7·V8·V9는 기본값(A)으로 그렸다. 바뀌면 영향 범위는 다음과 같다.
   - V3-B: Hero가 먹이 되어 홈 먹 2곳이 된다. Manifesto 재배정이 필요하다.
   - V4-B: 다크 꼭짓점 5곳이 되어 이 스펙의 예산 전체를 다시 써야 한다.
   - V5-B: 먹 패널 + 채움 버튼이 되어 C14와 충돌한다. canonical 재결정이 필요하다.
   - V8-B: 입력이 라인형이 되어 입력 바탕 `bg-surface-sheet` 적용이 빠진다. 토큰 값은 그대로다(autofill 덮개가 계속 쓴다).
   - 확정 결과는 DESIGN.md 결정 로그에 남긴다.
8. **mock 안 먹 묘사**(canonical 확정 필요)
   - ai-report 목업 :464의 안쪽 UI는 지금 어둡다. Frame 안에서 `surface-ink`를 쓰면서 `data-surface`를 달지 않으면 빌드 HTML `[data-surface=ink]` 예산 카운트를 우회하게 된다. canonical(C26, 먹 지면 안 콘텐츠 규칙, V4-A)에는 이런 예외가 없다.
   - 기본값: mock 안쪽은 밝은 토큰으로 그리고 `surface-ink`는 0이다(§4-5).
   - 먹 묘사를 허용하려면 canonical이 카운트 방식(예: `.surface-ink`도 세고 ai-report 예산을 1로 올림)을 함께 정해야 한다.

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
- **Hero**: '닻 Frame + `--shadow-card` + OS 지도 대체'를 capture Frame(r8, 그림자 0, lazy) + 확보 전 'AI 생성 이미지' 라벨로 바꿨다. LCP 요소는 H1이다(C09).
- **FinalCTA**: Display H2와 sunken/sheet 비교를 h2(`text-h1`) + V5-A로 바꿨다(C10). 먹 위 그린 CTA 예외를 삭제했다(C14).
- **그림자**: '대표 Frame 1개 `--shadow-card`'를 공개 0으로 바꿨다. 모바일 메뉴 패널은 '삭제'에서 `--shadow-deep`으로 바꿨다. `card.tsx` 기본값 삭제 대신 공개 variant만 바꾼다(X05).
- **스코프**: `.site` + `body[data-shell]` 하이브리드를 `.site` 세 곳(AppChrome·Dialog 5·토스트)으로 바꿨다(C17).
- **헤더**: 하단선을 `#E8E8E4`에서 `--line-hair`로 바꾸고, `z-50`을 `z-(--z-header)`로 바꿨다. theme-color 충돌 질문은 `#FAFAF8` 확정으로 해소됐다(C27·X09).
- **컨트롤 경계**: v2의 'secondary(공개 이름은 이제 `line`, C15)·칩은 strong 허용'을 `--line-control`로 통일했다(C23).
- **가드**: 별도 `--public` 모드·별도 baseline·prebuild 지연을 system §6 규칙 배열(warn→error, `design-baseline.json`)로 합쳤다. LogoBar 페이드 예외도 삭제했다.
- **ai-report**: Benefits paper 전환을 '예외 질문'에서 확정으로 바꾸고, 점멸·웨이브폼·라벨까지 넓혔다(C26).
- **새로 넣은 것**: 먹 지면 허용 목록(gap 반영), 'sheet 섹션 안 카드 0' 규칙과 `sheet*` 판정, `#A39E98` 치환 순서 규칙, 앵커 오프셋 수용 기준.
- **삭제한 열린 질문**: rails 존폐, theme-color, Act 05 이름, 헤더 320ms, line 테두리, ai-report 예외, photo 확보, V3·V4·V5 비교.
