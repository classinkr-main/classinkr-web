# 아이콘 (icons) — 최종 스펙 · 편집 지면 · OS판 (3판)

> **범위:** 공개 셸 `.site` 전체(C17). AppChrome 공개 분기, 공개 DialogContent 5곳(DemoModal·NewsletterModal·EventSignupModal·PublicLoginDialog·CheckoutRequestForm), 공개 경로의 토스트 뷰포트를 포함한다. /admin·/checkout·/receipt(`isInternalPath`)는 제외한다.
> **정본 순서:** canonical 표(C01–C28·X01–X16) > naming·css_architecture > 이 문서. 이 문서는 아이콘 소유 행 **C11·X08**을 정의하고, 아이콘에 닿는 C01·C02·C03·C07·C08·C13·C15·C17·C21·C23·C24·C26·C27·C28·X01·X03·X05·X11·X13·X14·X15를 따른다. 공통 기반(토큰 파일·레이어·가드·롤아웃)은 시스템 기반 스펙(system)을 링크하고 복제하지 않는다.
> **결정 번호:** 방향 문서 결정은 V1–V9, 감사·모션 플랜 문서 결정은 '감사 D#'으로 적는다(C03). 미정 결정은 기본안을 적용한 상태로 쓴다.
> **확인 표기:** [실측] 저장소·로컬 파일을 직접 쟀다 · [코드] 파일을 읽어 확인했다 · [지식] 학습 지식이고 확인하지 않았다.

---

## 요약

공개 사이트의 아이콘은 **지면의 보조 표지**다. 말은 글자가 하고, 아이콘은 같은 펜(--stroke-pen)으로 옆에서 짧게 가리킨다.

- **라이브러리:** lucide-react 0.562 하나. Classin 고유 사물(전자칠판·소프트웨어·수업 도구 26종·가이드 4종)만 Lucide 규격으로 그려 `/*#__PURE__*/ createLucideIcon`으로 등록한다. 새 의존성 0.
- **획(V6 기본안 A 적용):** 화면상 획은 `--stroke-pen` 1.5px 하나. DPR1(≤1.49dppx) 화면에서는 2px로 켠다(C11). 집행은 `site-base.css` base 레이어의 `:where(.site) svg.lucide` 규칙 + `vector-effect: non-scaling-stroke`. `strokeWidth` prop은 지운다.
- **크기:** `size-4/5/6/8`(16/20/24/32)만. IconFrame은 `size-10/12`(40/48). 크기 토큰은 만들지 않는다(C11).
- **색:** 기본은 글자 색 상속, 단독 아이콘은 `text-fg-muted`. `--fg-accent` 아이콘은 **활성 IconFrame · 추천 Plan 포함 항목 Check · 완료 표지** 세 경우뿐이고 한 뷰포트(375×812)에 한 그룹까지(C11).
- **대체:** 순서는 번호(C24 상한 안), 수치는 숫자, 상태는 점(● ○ –), AI는 라틴 글자 'AI'(`tracking-abbr`). Sparkles 퇴역. 타일·채움 원·그라데이션·이모지·글자 기호 금지.
- **움직임:** CTA·링크 카드 화살표 2px(controls의 `arrow-nudge`)와 대기 스피너뿐. reduced에서 이동 0, 스피너는 opacity 점멸(X08).
- **격리:** 공유 컴포넌트(button·dialog·toast)의 기본 문자열(클래스·prop·import)은 예외 없이 바꾸지 않는다. 공개 화면 적용은 C17의 소비 방식 셋(`:where(.site)` 접두 CSS · 공유 컴포넌트의 `[.site_&]:` 변형 또는 새 size·variant · `:root:has(.site)`)으로만 한다.
- **브랜드 마크:** 벡터 원본과 단색화 승인 전까지 **차단**. theme-color `#FAFAF8`과 viewport는 surfaces가 이미 확정(C27), manifest 없음. OG는 텍스트 워드마크(C28).

---

## 원칙

1. **글자가 먼저 말한다.** 아이콘은 한 행에 하나, 사전에 있는 개념에만 붙인다. 사전에 없는 개념은 아이콘 없이 글자로 쓴다.
2. **한 펜.** 아이콘·도해 정보선·차트 비교선은 같은 `--stroke-pen`이다. Pretendard 500 16px 한글 세로획(1.49px [실측])과 회색도가 같아 본문 옆에서 튀지 않는다.
3. **한 개념 = 한 글리프.** 의미 사전 `lib/icon-concepts.ts`가 정본이고 테스트로 유일성을 강제한다.
4. **그린은 잉크다.** 아이콘 초록은 상태(활성·완료)와 추천에만 쓴다. 장식 강조, 불릿 행렬, 면 채움에 쓰지 않는다.
5. **역할을 빼앗지 않는다.** 순서는 번호, 수치는 숫자, 상태는 ● ○ – 점과 텍스트, 'AI'는 글자가 맡는다. 상자·파스텔 타일·그라데이션·이모지·반짝이(✦·Sparkles)로 주목을 끌지 않는다.
6. **정직.** 지어낸 별점·근거 없는 '30+'·실물 미확인 디테일을 아이콘이나 글리프로 만들지 않는다.
7. **집행은 셸 안 CSS로.** 규칙은 `:where(.site)`(특이도 0)에서만 돌고 /admin은 무변경이다.
8. **움직임은 최소.** 화살표 2px 한 가지와 대기 스피너. 아이콘은 Reveal·서사 모먼트의 대상이 아니다.

---

## 토큰(CSS + Tailwind @theme)

### 1) tokens.css에 아이콘이 소유하는 값 (C11·X13)

정의 위치는 `app/styles/tokens.css` 한 곳이다(system §3, css_architecture). 아래는 그 파일의 해당 줄이다.

```css
/* app/styles/tokens.css — icons 소유 값 (C11 · V6 기본안 A) */
@layer base {
  :root {
    --stroke-pen: 1.5px;     /* lucide 획 · 도해 정보선 · 차트 비교선 · ○ 점 테두리 */
    --stroke-accent: 2px;    /* 도해 강조 · 차트 강조 (아이콘은 쓰지 않는다) */
  }
  /* DPR1 보정 — 기본 켬(C11). 원장 사무실 1366×768 Windows 100~125%.
     DPR1에서는 pen = accent = 2px 이 되므로 강조 구분은 색(#084734 대 #8F8A84)이 맡는다. */
  @media (max-resolution: 1.49dppx) {
    :root { --stroke-pen: 2px; }
  }
}
```

### 2) 아이콘이 쓰는 공유 색 토큰 (X01 · C01, 정의는 surfaces 소유 tokens.css)

아이콘 스펙은 색을 새로 정의하지 않는다. 먹 지면 값은 C01의 `.surface-ink` 블록이 자동으로 바꾼다.

| 토큰 | 지면 값 | 대비 white / paper / sunken | 먹(`.surface-ink`) 값 · 대비(#111110 위) | 아이콘 용도 |
|---|---|---|---|---|
| `--fg-ink` | #111110 | 18.89 / 18.08 / 17.35 | #FAFAF8 · 18.08 | 내비·헤더 토글 |
| `--fg-body` | #31302E | 13.18 / 12.62 / 12.11 | /.72 · 9.61 | 상속(본문 행) |
| `--fg-muted` | #615D59 | 6.53 / 6.24 / 5.99 | /.56 · 6.14 | 단독 아이콘·불릿 Check 기본 |
| `--fg-accent` | #084734 | 10.71 / 10.25 / 9.83 | #6EE7B7 · 12.40 | 활성 IconFrame·추천 Plan Check·완료 표지·● |
| `--fg-danger` | #B43E3E | 5.68 / 5.43 / 5.21 | #E89A94 · 8.53 | `CircleAlert`만 |
| `--fg-faint` | #A39E98 | 2.66 / 2.54 / 2.44 | /.40 | **장식·비활성 전용. 의미·조작 아이콘 금지** |
| `--line-control` | #8F8A84 | 3.42 / 3.27 / 3.14 | /.40 · 3.70 | ○·– 상태 점, 외곽선 있는 아이콘 단독 버튼(C23) |
| `--line-hair` | rgb(17 17 16/.08) | — | /.12 | IconFrame 기본 테두리(장식) |

- 먹 위 `#084734` 아이콘(1.76:1)과 밝은 면의 `#6EE7B7` 아이콘(1.46:1)은 금지다. 토큰을 쓰면 자동으로 지켜진다.

### 3) Tailwind 유틸 (C02 · C18)

아이콘 스펙이 `@theme inline`에 **추가하는 항목은 0개**다. 쓰는 유틸은 모두 기존 정본에서 나온다.

| 용도 | 유틸 | 출처 |
|---|---|---|
| 아이콘 크기 | `size-4` `size-5` `size-6` `size-8` | Tailwind 기본 spacing |
| IconFrame | `size-10` `size-12` `rounded-lg`(8px, globals.css `--radius-lg: 8px` [코드]) | Tailwind 기본 |
| 색 | `text-fg-muted` `text-fg-ink` `text-fg-accent` `text-fg-danger` `border-line-hair` `border-fg-accent` `border-line-control` | C02 `--color-<토큰>` 1:1 매핑. `border-fg-accent`(활성 IconFrame)는 C02 유틸 목록에는 없지만 1:1 매핑으로 생성되고 가드 정규식 `(bg\|text\|border\|divide\|decoration)-(surface\|fg\|line)-`에 맞는다. 정본 목록에 추가를 요청한다(열린 질문 8) |
| 번호·라벨 | `text-folio tabular-nums` · `text-label` · `tracking-abbr` | C18 · X14 |
| 전이 | `duration-(--motion-fast) ease-soft` | X13 |
| 대기 점멸 keyframes | `skeleton-blink`(50% opacity .4) | tokens.css `@theme inline`의 `--animate-skeleton`과 공유(css_architecture) |

### 4) site-base.css에 들어가는 아이콘 규칙 (css_architecture)

```css
/* app/styles/site-base.css (a) @layer base — icons 소유 */
@layer base {
  :where(.site) svg.lucide {
    stroke-width: var(--stroke-pen);   /* 레이어 안 author 규칙도 SVG 프레젠테이션 속성(stroke-width="2")을 이긴다 */
    flex-shrink: 0;
  }
  :where(.site) svg.lucide :where(path, line, polyline, polygon, circle, rect, ellipse) {
    vector-effect: non-scaling-stroke; /* 크기와 무관하게 화면상 --stroke-pen. 미지원이면 크기 비례로 가늘어질 뿐 깨지지 않는다 */
  }
}

/* app/styles/site-base.css (b) @layer components — icons 소유 */
@layer components {
  :where(.site) .status-dot {
    display: inline-block;
    inline-size: 7px;
    block-size: 7px;
    border-radius: 9999px;
    background: var(--fg-accent);                 /* ● 켜짐 */
    vertical-align: calc(0.355em - 3.5px);        /* 한글 잉크 중심 */
    flex-shrink: 0;
  }
  :where(.site) .status-dot[data-state="off"] {   /* ○ 꺼짐·대기 */
    background: transparent;
    border: var(--stroke-pen) solid var(--line-control);
  }
  :where(.site) .status-dot[data-state="na"] {    /* – 해당 없음 */
    block-size: var(--stroke-pen);
    border-radius: 1px;
    background: var(--line-control);
    vertical-align: calc(0.355em - var(--stroke-pen) / 2);
  }
  @media (forced-colors: active) {
    :where(.site) .status-dot:not([data-state="off"]) {
      forced-color-adjust: none;
      background: CanvasText;
    }
  }
}

/* app/styles/site-base.css (c) 레이어 밖 보증 블록 ④ — X08 (icons 소유) */
@media (prefers-reduced-motion: reduce) {
  :where(.site) .animate-spin {
    animation: skeleton-blink 1.6s ease-in-out infinite !important;
  }
}
```

- **보증 ④의 `!important`는 필수다.** `app/globals.css:909-916`의 전역 reduced 블록(레이어 밖)이 `*{animation-duration:.001ms !important; animation-iteration-count:1 !important}`를 선언한다 [코드]. `!important`가 없으면 중요도에서 지고, 스피너가 한 바퀴 돌고 멈춰 '먹통'처럼 보인다. 둘 다 레이어 밖 `!important`이므로 특이도 (0,1,0) > (0,0,0)으로 이긴다. 전역 블록을 `@layer` 안으로 옮기면 레이어 `!important` 우선순위가 뒤집혀 이 규칙이 지므로 함께 옮긴다.
- **정본 정정 요청(system 담당):** X08과 css_architecture (c)④의 규칙 문안에는 `!important`가 없다. 위 근거로 이 스펙의 문안(`!important` 포함)이 맞으므로, 정본 두 곳의 문안을 `animation:skeleton-blink 1.6s ease-in-out infinite !important`로 고쳐 달라고 요청한다(열린 질문 7). 정정 전까지도 구현은 이 스펙의 문안을 따른다.
- 상태 점의 7px·테두리 값은 리터럴이다. `--dot-*` 토큰은 만들지 않는다(X01).
- CTA 화살표 이동 규칙은 이 스펙에 두지 않는다. controls 소유 `@utility arrow-nudge`를 쓴다(§패턴 13).

### 5) 만들지 않는 토큰 (C11 · X01 · naming)

`--icon-stroke`, `--icon-sm/md/lg/xl`, `--icon-frame-*`, `--icon-optical-center`, `--icon-nudge`, `--icon-lh`, `--dot-size`, `--dot-ring`, `--dg-line-w`, `--dg-accent-w`, `--chart-*-w`, `--hit-min`, `size-icon-*` 유틸. 광학 중심(0.355em)·점 크기(7px)·이동량(2px)은 소비처 한두 곳의 리터럴로 충분하다.

---

## 패턴과 값(데스크톱/모바일)

### 1. 라이브러리와 파일 구성

| 파일 | 내용 | import하는 곳 |
|---|---|---|
| `components/icons/product-glyphs.ts` | `ClassinBoardGlyph`, `ClassinSoftwareGlyph` | Header·ProductTabNav·/product·/docs·사전 |
| `components/icons/lesson-tool-glyphs.ts` | 수업 도구 26종(`LessonToolIcons.tsx` 이관) | /product/sw, /product/hw(`MirroringGlyph`만) |
| `components/icons/guide-glyphs.ts` | 가이드 인텐트 4종(`GuideIntentIcons.tsx` 이관) | /docs |
| `components/ui/ClassInAIIcon.tsx` | ClassIn AI 마크(경로 유지, `createLucideIcon`으로 재작성) | FloatingChatbot |
| `components/auth/brand-glyphs.tsx` | 제3자 브랜드 글리프(Google·Naver·Kakao·Apple). 채움형 예외 | 소셜 로그인, 다운로드 |
| `lib/icon-concepts.ts` | 개념 별칭(모듈 별칭) | 공개 화면 |
| `components/ui/icon.tsx` | `Icon`, `IconFrame` | 공개 화면 |

- **모든 `createLucideIcon` 호출 앞에 `/*#__PURE__*/`를 붙인다.** package.json에 `sideEffects`가 없어서 [실측, 이전 판] 표시가 없으면 번들러가 쓰지 않는 글리프까지 공유 청크에 남긴다.
- **수업 도구·가이드 글리프는 사전에서 다시 내보내지 않는다.** 사용처에서 해당 파일을 직접 import해 전역 청크로 새는 경로를 구조로 막는다.
- **lucide 밖에 남는 것**(모두 채움형이라 획 규칙 대상 아님): 제3자 브랜드 글리프, Classin 로고(§14), 404·빈 상태 선화(imagery 소유, 160×120 인라인 SVG).
- **금지:** `import * as … from "lucide-react"`(테스트 제외), `lucide-react/dynamic`, 아이콘 폰트, SVG 스프라이트 fetch, PNG·WebP 아이콘.

### 2. 획 (V6)

- 화면상 획은 `--stroke-pen` 하나다. 기본 1.5px, DPR1 2px(기본 켬).
- **현황 [실측, 이전 판]:** 공개 범위 `strokeWidth` 68회(26파일) 중 lucide·글리프 컴포넌트 prop은 약 21~27건이다. **삭제 대상은 이것뿐이다.** raw SVG(path·svg·circle·rect·line)와 sw 진행 링 `motion.circle`은 `.lucide`가 아니라 규칙 대상이 아니므로 그대로 둔다. Recharts `Area` 2건은 imagery의 Recharts 공개 0(C06)으로 함께 사라진다.
- **prop을 지우는 이유:** CSS가 prop을 조용히 덮는다. 남기면 '동작한다고 착각하는 죽은 코드'가 된다(X14와 같은 논리).
- **셸 밖 예외:** `app/global-error.tsx`는 루트 레이아웃을 대체해 `.site` 밖이다(css_architecture). 이 파일에만 `absoluteStrokeWidth strokeWidth={1.5}`를 쓴다.
- **`overflow: visible`은 넣지 않는다.** lucide 기하는 대부분 2~22 안쪽이다. 실제로 잘리는 글리프만 개별 `overflow-visible`로 푼다.
- **V6 근거와 DPR1:**
  - 1.5px은 Pretendard 500 16px 한글 획(1.49px)과 같고, 600(1.74px)·700(2.00px) 글자보다 한 단계 가볍다 [실측]. 아이콘이 글자보다 가벼워야 위계가 선다.
  - DPR1 24px에서 lucide 좌표는 정수 픽셀에 떨어져 1.5px 획이 두 픽셀에 75%씩 걸쳐 흐려진다. 2px이면 선명하다. 그래서 DPR1 보정을 켠다.
  - DPR1 보정을 켜면 24px은 현행 lucide 기본(2 단위 = 2px)과 같다. 16·20px은 현행(1.33·1.67px)보다 약간 굵어진다. `vector-effect: non-scaling-stroke` 아래에서는 크기와 상관없이 2px이 되기 때문이다. 시안 ⑥에서 확인한다.
  - **정본 정정 요청(system 담당):** C11 근거 문장과 V6 기본값 문구의 'DPR1 사용자에게는 변화 0'은 24px에만 맞는다. 결정 값(기본 켬, 1.49dppx, 2px)은 그대로 두고, 근거 문장만 '24px은 변화 0, 16·20px은 1.33·1.67px→2px로 약간 굵어짐. 끄면 DPR1에서만 흐려지는 회귀'로 고쳐 달라고 요청한다(열린 질문 1).
  - V6-B(1.75px)는 시안 ⑥에서 16px 인라인이 흐리다고 판정될 때만 `--stroke-pen` 값 1줄을 바꾼다. 32px 전용 굵기 같은 크기별 분기는 두지 않는다.
- **지원:** `vector-effect`는 주요 브라우저가 오래전부터 지원한다 [지식]. MDN 호환표 링크를 근거로 남기고 iPhone 실기기 검증을 수용 기준에 둔다. 미지원이면 16px에서 1.0px로 가늘어질 뿐 깨지지 않는다.

### 3. 크기와 역할

크기는 브레이크포인트로 바꾸지 않는다. 모바일에서는 배치·열 수만 달라진다.

| 역할 | 아이콘 | 짝 글자(C18) | 간격 | 정렬 | 비고 |
|---|---|---|---|---|---|
| 버튼 md/cta 안 앞·뒤 아이콘 | 16 `size-4` | `text-ui` 15/600 · cta 16/600 | `gap-2` | items-center | 버튼 하나에 아이콘 하나 |
| 본문·캡션·링크 안 인라인 | 16 | `text-note`~`text-article` 13–17 | 0.25em | `align="inline"` | |
| 색인 탭·필터 칩 | 16 | `text-ui` 15/500(컨트롤 전용, C18·C12) | 칩 `gap-1.5` · 탭 `gap-2` | items-center | 탭·칩 아이콘은 글자 색 상속 |
| 표 셀·폼 오류/도움말·토스트 | 16 | `text-caption`·`text-note`(`text-ui` 금지, C18) | `gap-2` | items-center | |
| 목록 행(기능·연락처·자료) | 20 `size-5` | `text-body`·`text-body-l` | `gap-3` | 1줄 items-center, 여러 줄 `align="lead"` | |
| 아이콘 단독 버튼 `size="icon-md"` | 20 | — | — | 박스 44×44 | 닫기·공유·복사·비밀번호 보기 |
| 헤더 메뉴/닫기 토글 | 24 `size-6` | — | — | 박스 44×44(`icon-md`) | `--fg-ink` |
| SW 수업 도구 목차 행 | 20 | `text-body` 500 | `gap-3`, 행 `min-h-12` | items-center | 그룹 머리 `text-label text-fg-accent` |
| IconFrame 40 / 48 내부 | 20 / 24 | 제목 `text-h3` | `gap-4` | 프레임 윗변을 제목 첫 줄에 lead 정렬 | 배치마다 하나를 고르고 반응형으로 바꾸지 않는다 |
| 폼·모달 안 인라인 완료·잠금 표지 / 기능 소개 | 32 `size-8` | `text-h3` | 아래 `mt-4` | 컨테이너 없음 | 기능 소개는 페이지당 6개 이하 |

- **카드 머리띠에는 아이콘을 두지 않는다.** 범주는 바 없는 `text-label`(X15)이 맡는다.
- **페이지·섹션 단위 상태**(StateBlock: 404·오류·빈 목록·검색 0·접수 완료 페이지·점검)는 imagery 선화가 맡는다. 32 아이콘은 폼·모달 안의 인라인 표지에만 쓴다. 한 상태에 둘을 함께 쓰지 않는다.
- **격자 밖 크기 정리:** w-3·w-3.5(12·14) → 16(장식이면 삭제), [17px]·[18px] → 16 또는 20, w-7(28) → 24 또는 32, w-9 이상 → 32 이하로 줄이거나 도판으로 바꾼다.
- **짝 규칙:** 한글 잉크 높이는 400~500에서 0.856~0.864em이다 [실측]. 16px 글자 잉크 13.7px 대 16px 아이콘 잉크 약 12~15px이라, 기본 짝은 '아이콘 = 글자 + 0~4px'이다.

**데스크톱/모바일 차이**

| 항목 | 모바일(<40rem) | 태블릿(≥40rem) | 데스크톱(≥64rem) |
|---|---|---|---|
| 아이콘 크기 | 같음 | 같음 | 같음 |
| SW 도구 목차 | 2열 | 3열 | 4열 |
| 주 CTA | 폭 전체, 아이콘 16 | 내용 폭 | 내용 폭 |
| 화살표 이동 | focus-visible만(터치 hover 없음) | 같음 | `(hover: hover)` + focus-visible |
| 획 | DPR2·3 → 1.5px | 기기 DPR에 따름 | DPR1 → 2px, DPR2 → 1.5px |
| 아이콘 단독 히트 | 44×44 | 44×44 | 44×44 |

### 4. 한글 광학 정렬

측정 대상은 `PretendardVariable.ttf`다(glyf bbox·hhea 파싱) [실측]. UPM 2048, ascender 1950·descender −494이고 hhea·typo·win이 같다. 한글 8자(가·한·수·업·녹·화·학·원) 잉크 중심 평균은 727단위 = **0.355em**, 줄 상자 중심은 (1950−494)/2/2048 = **0.3555em**이다. 한글이 줄 상자 정중앙에 오므로 정렬은 세 모드면 충분하다.

| 모드 | 언제 | 규칙 | 예 |
|---|---|---|---|
| 기본 | 한 줄 라벨이 있는 flex 행 | `items-center`. **손보정 금지** | `mt-0.5`, `translate-y-[-1px]` 삭제 |
| `align="inline"` | 글줄 안 아이콘 | `display:inline-block; vertical-align: calc(0.355em − size/2)` | 15px 글자 + 16 = −2.68px, 16px = −2.32px, 17px = −1.97px |
| `align="lead"` | 여러 줄 글 옆, 첫 줄에 맞춤 | `margin-block-start: calc((1lh − size) / 2)` | `text-body` 16/28 + 20 = 4px, `text-caption` 14/22.4 + 16 = 3.2px |

- Tailwind preflight가 `svg{display:block}`를 주므로 inline 모드는 래퍼가 inline-block을 다시 지정한다.
- `1lh`는 svg가 **상속받는** line-height 기준이다. 행간은 행 컨테이너(`li`, `div.flex`)에 둔다. 형제 `<p>`에만 두면 2~4px 어긋난다. 별도 변수(`--icon-lh`)는 만들지 않는다.
- `lh` 단위는 Safari 16.4+로, 지원 기준(system §9)과 같아 폴백을 두지 않는다.
- V1-A 자체 호스팅 뒤 복사한 woff2 조각 하나의 hhea가 로컬 TTF와 같은지 fontTools로 한 번 확인한다.

### 5. 컨테이너 · IconFrame (C11)

- **기본은 컨테이너 없음.** 아이콘 + 글자 + 괘선(docs 방식).
- **IconFrame**(필요할 때만, ai-report `OutlineIcon`을 다듬은 정본):
  - 크기 `size-10`(내부 20) 또는 `size-12`(내부 24). 배치마다 하나를 고른다.
  - 모양 `rounded-lg`(8px), `border border-line-hair`, **배경 투명**.
  - **먹 지면에는 두지 않는다.** 외곽선 박스라 먹 위 허용 목록(글자·PullQuote·박스 없는 수치·hair 구분선·뉴스레터 입력+line 버튼·제품 컷아웃, surfaces §3-5)에 없다.
  - 기본: 아이콘 `--fg-muted`.
  - **활성:** 테두리와 아이콘이 `--fg-accent`(흰 위 10.71:1). 상태 자체는 부모 컨트롤의 `aria-current`·`aria-pressed`·`aria-selected`가 전한다.
  - hover 상태는 없다. 링크 카드 hover는 카드 테두리 hair→strong과 화살표가 맡는다(C13).
  - hair와 strong 테두리 차이(1.18 대 1.41:1)를 상태 신호로 쓰지 않는다.
  - 그룹 안에서 하나가 프레임을 쓰면 전부 쓴다. 섞지 않는다.
- **인라인 완료·잠금 표지:** 32 아이콘 단독. `CircleCheck` `--fg-accent` 또는 `LockKeyhole` `--fg-muted`, 아래 16px 뒤 `text-h3`. 현행 '민트 원 + 체크' 약 16곳을 이 패턴으로 바꾼다.
- **순서 목록:** 아이콘 대신 순서 번호. 표기는 그 페이지가 이미 쓰는 번호 체계를 따르고(대개 `No. 01`, `text-folio tabular-nums text-fg-muted`) 새 체계를 만들지 않는다(C24: 페이지당 ≤2). 홈은 Act 폴리오와 순서 있는 카드 묶음의 `No. 01`만 쓴다.
- **불릿 목록:** 기본은 아이콘 없이 hair 행에 글자만. 체크 느낌이 필요하면 `Check` 16 `tone="muted"`.
- **수치·Stat:** 아이콘을 붙이지 않는다.
- **금지:** `bg-[#ECFDF5]`·`#D1FAE5` 채움 원·타일, `bg-gradient-to-*`·글래스 타일, 8px 외 반경의 타일, 타일 hover scale·inset 하이라이트, 아이콘 drop-shadow(X05), 이모지·글자 기호(✕ ✦ ✓ ✗ ★ ⚠ →).

### 6. 색

| 맥락 | 색 |
|---|---|
| 기본 | `currentColor`(글자 색 상속) |
| 행·목록의 단독 아이콘, 불릿 Check | `--fg-muted` |
| 내비·헤더 토글 | `--fg-ink` |
| 탭·칩 안 | 상속(비활성 muted → 활성 ink, C12). 활성 표시는 index-tab 막대·칩 테두리가 맡는다 |
| 강조(아래 세 경우만) | `--fg-accent` |
| 오류 | `--fg-danger`(`CircleAlert`만) |
| 비활성·장식 전용 | `--fg-faint`. 의미·조작 아이콘 금지 |
| primary 버튼 안 | 상속 `--fg-on-accent` #FAFAF8 |
| ghost 링크 화살표 | 상속 `--fg-accent`(X03) |

- **`--fg-accent` 아이콘이 허용되는 세 경우(C11):**
  1. 활성 IconFrame
  2. **추천** Plan의 포함 항목 `Check`(나머지 Plan의 Check는 `--fg-muted`). 추천 지정이 없으면 전부 muted다.
  3. 완료 표지 `CircleCheck`(인라인 32, 토스트 성공 16)
- **한 뷰포트(375×812)에 이런 초록 아이콘 그룹은 1개까지다.** 글자 색을 상속한 아이콘(ghost 링크·primary 버튼 안)은 집계에서 뺀다. 토스트는 떠 있는 레이어라 정지 상태 화면으로 센다.
- `fill`은 `Play`와 커스텀 글리프의 지름 3단위 이하 점에만 쓴다.
- **퇴출 색:** green-400/500·#22C55E·#10B981·#34D399, 금색 #D7B56D·#F8C35B·#FFB000, 팔레트 밖 초록 #1e8b58·#0E7A49·#009060, 오류 중복색 #B85C33, 의미 아이콘의 #A39E98. 치환은 hex→hex가 아니라 hex→토큰 유틸로만 한다(system §11).

### 7. 의미 사전 (`lib/icon-concepts.ts` 정본)

- **코드 사전**에는 이관 뒤 실제 import가 남는 항목만 넣는다. 소비처가 없는 항목은 이 문서에 **예약**으로만 둔다.

요청 개념 20개:

| # | 개념 | 글리프 | 코드 | 쓰지 않는 것 / 주의 |
|---|---|---|---|---|
| 1 | 수업 전·중·후 | **아이콘 없음**(탭 글자 '수업 전 · 수업 중 · 수업 후') | — | BookOpen/Zap/RefreshCw(`SolutionOverview.tsx:13,22,31`) 삭제. 홈 번호 체계(C24)에 탭 번호를 더하지 않는다 |
| 2 | 녹화 | `Video` | ✓ | 재생 버튼은 `Play`(fill) |
| 3 | AI 리포트 | `FileChartColumn` | ✓ | 관리자 데이터(ChartColumn)와 문서 윤곽 유무로 구분. 16px 구분성은 시안 ④ |
| 4 | 과제 | `NotebookPen` | 예약 | LMS 전체는 `ClipboardCheck` |
| 5 | 출결 | `UserCheck` | 예약 | 학생 관리 전체는 `Users` |
| 6 | 학부모 소통 | **아이콘 없음** | — | 16px에서 MessagesSquare와 상담 MessageSquare가 구분되지 않는다 |
| 7 | 관리자 대시보드·데이터 | `ChartColumn` | ✓ | `BarChart3`는 같은 도형의 별칭 |
| 8 | 전자칠판 | `ClassinBoardGlyph` | ✓ | Presentation·MonitorSpeaker·Monitor 퇴역 |
| 9 | 카메라(교실·AI) | `Webcam` | ✓ | `Camera`·`Cctv` 금지. 도구 '보조 카메라'는 `SubCameraGlyph` |
| 10 | 화면 공유 | `ScreenShareGlyph` | 도구 파일 | lucide ScreenShare와 섞지 않는다 |
| 11 | 판서 | `PenLine` | ✓ | `PenTool`·`Pencil` 퇴역(제품 표시용) |
| 12 | 퀴즈 | `QuizChoiceGlyph`(선착순 `QuizBuzzerGlyph`) | 도구 파일 | `CheckCircle2`·`Zap`(`sw/page.tsx:69-70`) 퇴역 |
| 13 | 랜덤 선택 | `RandomPickGlyph` | 도구 파일 | `Shuffle` 퇴역 |
| 14 | 타이머(수업 도구) | `TimerGlyph` | 도구 파일 | 소요 시간은 `Clock` |
| 15 | 쇼룸 방문·위치 | `MapPin` | ✓ | 확정 예약은 `CalendarCheck` |
| 16 | 상담 | `MessageSquare` | ✓ | 챗봇은 `ClassInAIIcon` |
| 17 | 자료 다운로드 | `Download` | ✓ | 자료 자체는 `FileText`. 체크리스트도 `FileText`(FileCheck2 퇴역) |
| 18 | 보안 | `ShieldCheck` | ✓ | 잠금·로그인 필요는 `LockKeyhole`. `Shield`(코팅 오용 `hw:1005`) 퇴역 |
| 19 | 연동 | `Plug` | 예약 | 동기화는 `RefreshCw`. `Link2`는 '링크 복사' 동작에만 |
| 20 | 하드웨어 설치 | `Wrench` | ✓ | `HardHat`·`Drill` 금지 |

**나머지 사전 항목(코드):** 교안·EDB `Layers` · LMS `ClipboardCheck` · 학생 관리 `Users` · 소프트웨어 `ClassinSoftwareGlyph` · 마이크 `Mic` · 일정 `CalendarDays` · 확정 일정 `CalendarCheck` · 소요 시간 `Clock` · 속도·지연 `Gauge` · 동기화 `RefreshCw` · 교사 교육 `GraduationCap`(이 개념에만) · 전화 `Phone` · 이메일 `Mail` · 소식·블로그 `Newspaper` · 성공 `CircleCheck` · 경고 `TriangleAlert` · 오류 `CircleAlert` · 정보 `Info` · 재생 `Play`.

- **예약(문서만):** 과제 NotebookPen, 출결 UserCheck, 연동 Plug, 교육기관 Building2, 서비스 국가 Globe. 교육기관·서비스 국가는 지금 수치 옆에만 쓰이고, 수치 옆 아이콘은 삭제되므로 소비처가 없다.
- **AI(C11):** 아이콘이 없다. `Sparkles`는 퇴역한다. AI 표시는 라틴 글자 'AI'에 `tracking-abbr`(+0.06em)를 준다. 자리는 장 머리 Kicker이거나, 카드·목록에서는 바 없는 `text-label`이다(X15).
- **동작 아이콘**(사전 밖, UI 조작 전용): `X`, `Menu`, `ChevronDown/Left/Right`, `Search`, `Copy`, `Share2`(공유만), `Link2`(링크 복사), `Send`, `Eye/EyeOff`, `LoaderCircle`, `Check`, `Minus`, `Plus`, `Pause`, `Volume2/VolumeX`, `Printer`, `RotateCcw`, `ThumbsUp/Down`, `ArrowRight`, `ArrowUpRight`(외부 링크), `ArrowLeft`(뒤로). 개념 아이콘으로 재사용하지 않는다.
- **퇴역 글리프:** Zap(속도→Gauge, 선착순→QuizBuzzer, 수업 중→글자), Star, Sparkles, PenTool, Pencil·Presentation·MonitorSpeaker(제품 표시용), Fingerprint, Wifi(하이브리드 오용), Hand·Maximize, FileCheck2.
- **레거시 별칭**(도형 같음, 화면 변화 0) [실측]: Loader2→LoaderCircle, CheckCircle2→CircleCheck, AlertTriangle→TriangleAlert, AlertCircle→CircleAlert, BarChart3→ChartColumn, HelpCircle→CircleHelp.
- **도형이 바뀌는 교체**(스크린샷 diff에 '의도된 변경'으로 표시): Globe2(실체 `earth` [실측], 수치 아이콘이라 삭제), Clock3→Clock, ExternalLink→ArrowUpRight.
- **블로그 카테고리**(`lib/blog-categories.ts`): 제품 = `Package`, 데이터 분석 = `ChartColumn`. 블로그 세션 커밋 뒤 반영한다.

```ts
// lib/icon-concepts.ts — 공개 화면 의미 사전(정본). 한 개념 = 한 글리프.
// 객체 대신 모듈 별칭: 쓰지 않는 별칭은 트리셰이킹으로 사라진다.
// 수업 도구·가이드 글리프는 여기서 다시 내보내지 않는다 — 사용처에서 @/components/icons/* 직접 import.
import {
  CalendarCheck, CalendarDays, ChartColumn, CircleAlert, CircleCheck, ClipboardCheck, Clock, Download,
  FileChartColumn, FileText, Gauge, GraduationCap, Info, Layers, LockKeyhole, Mail, MapPin, MessageSquare,
  Mic, Newspaper, PenLine, Phone, Play, RefreshCw, ShieldCheck, TriangleAlert, Users, Video, Webcam, Wrench,
} from "lucide-react"
import { ClassinBoardGlyph, ClassinSoftwareGlyph } from "@/components/icons/product-glyphs"

export const BoardIcon = ClassinBoardGlyph
export const SoftwareIcon = ClassinSoftwareGlyph
export const WritingIcon = PenLine
export const LessonFileIcon = Layers
export const RecordingIcon = Video
export const PlaybackIcon = Play
export const LmsIcon = ClipboardCheck
export const StudentsIcon = Users
export const AdminDataIcon = ChartColumn
export const AiReportIcon = FileChartColumn
export const CameraIcon = Webcam
export const MicIcon = Mic
export const DurationIcon = Clock
export const ScheduleIcon = CalendarDays
export const ScheduleConfirmedIcon = CalendarCheck
export const PlaceIcon = MapPin
export const ConsultIcon = MessageSquare
export const PhoneIcon = Phone
export const EmailIcon = Mail
export const DownloadIcon = Download
export const MaterialIcon = FileText
export const NewsIcon = Newspaper
export const SecurityIcon = ShieldCheck
export const LockIcon = LockKeyhole
export const SyncIcon = RefreshCw
export const HwInstallIcon = Wrench
export const SpeedIcon = Gauge
export const TeacherTrainingIcon = GraduationCap
export const SuccessIcon = CircleCheck
export const WarningIcon = TriangleAlert
export const ErrorIcon = CircleAlert
export const InfoIcon = Info
```

```ts
// tests/lib/icon-concepts.test.ts — 한 글리프가 두 개념을 맡으면 실패(namespace import는 테스트에서만)
import { expect, it } from "vitest"
import * as C from "@/lib/icon-concepts"
it("한 글리프는 한 개념", () => {
  expect(new Set(Object.values(C)).size).toBe(Object.keys(C).length)
})
```

- 이관이 끝났을 때 소비처가 0인 별칭이 있으면 그 줄을 지운다(예약으로 내린다).

### 8. Classin 고유 글리프 그리는 법

**규격**(Lucide 규격 + 화면 고정 획 보정):
1. **캔버스:** 24×24. 잉크 상자 중심은 (12,12)±0.5. 기하는 1~23 안.
2. **좌표:** 0.5 그리드. 원호는 정수 반지름 우선.
3. **획:** 원본은 stroke 2로 그린다(Figma·Lucide 호환). 검수는 렌더 `--stroke-pen`(1.5px, DPR1 2px)으로 한다. 요소별 `strokeWidth` 금지. GoBoard의 `strokeWidth={1}`(`LessonToolIcons.tsx:106`) 삭제.
4. **간격(16px 기준, 1.5px = 2.25단위):** 평행 획 **중심 간격 4.5단위 이상**, 서로 다른 요소의 **바깥선 사이 빈틈 2.25단위 이상**. DPR1 2px(3단위)에서도 빈틈이 0이 되지 않도록 바깥선 사이는 가능하면 2.75단위 이상을 목표로 한다.
5. **끝·모서리:** round cap·join. 8단위 이상 요소는 rx 2, 그보다 작으면 rx 1.
6. **요소 수:** 6개 이하.
7. **채움:** 지름 3단위 이하의 점(주사위 눈·바둑돌·모래)에만 `fill:"currentColor", stroke:"none"`.
8. **금지:** 글자·숫자, 원근·3D, 손떨림 획, 여러 색, 그림자, 화살촉 남발, **확인되지 않은 실물 디테일**(카메라 위치, 스탠드 형태 등).
9. **가족 모티프:** 판서 물결 한 획을 제품 글리프 2종에만 쓴다. 한 주기 10단위(x 7→17), 제어점 오프셋 2.7, 진폭 ±2.0단위. 16px에서 얼룩으로 보이면(시안 ②) 두 글리프 모두 물결을 빼고 실루엣(칠판 받침 선, 소프트웨어 제목줄)으로 구분한다. 소프트웨어가 lucide `AppWindow`와 구분되지 않으면 커스텀을 버리고 `AppWindow`를 쓴다.
10. **등록:** `/*#__PURE__*/ createLucideIcon("classin-<kebab>", nodes)`, 노드마다 고유 `key`, 클래스는 `lucide lucide-classin-<kebab>`, export 이름은 PascalCase + `Glyph`.
11. **검수:** 16/20/24/32 × 1x/2x/3x(16px은 3배 확대 캡처 필수), lucide 이웃과 나란히(제품: Monitor·Presentation·AppWindow·LayoutPanelTop, 도구: Video·Layers), paper·sheet·ink 위. 15/16px Pretendard 500 옆에서 lucide보다 무거우면 요소를 줄인다. **이름을 가렸을 때 20px에서 구분되지 않는 도구 글리프는 탈락**(lucide 대응으로 되돌리거나 아이콘 없이).

**초안**(시안 ② 승인 대상):

```ts
// components/icons/product-glyphs.ts
import { createLucideIcon } from "lucide-react"

/** 전자칠판 — 패널 + 판서 물결 + 받침 선. Monitor(짧은 받침+기둥)·Presentation(다리)과 실루엣으로 구분.
 *  카메라·다리는 실물 확인 전까지 그리지 않는다. */
export const ClassinBoardGlyph = /*#__PURE__*/ createLucideIcon("classin-board", [
  ["rect", { x: "2", y: "3", width: "20", height: "14", rx: "2", key: "panel" }],
  ["path", { d: "M7 10c1.7-2.7 3.3-2.7 5 0s3.3 2.7 5 0", key: "ink" }],
  ["path", { d: "M5 21.5h14", key: "base" }],
])

/** Classin 소프트웨어 — 앱 창 + 제목줄 + 판서 물결. AppWindow(제목줄 점)·LayoutPanelTop(칸 나눔)과 구분 */
export const ClassinSoftwareGlyph = /*#__PURE__*/ createLucideIcon("classin-software", [
  ["rect", { x: "2", y: "2.5", width: "20", height: "19", rx: "2", key: "win" }],
  ["path", { d: "M2 7.5h20", key: "bar" }],
  ["path", { d: "M7 14.5c1.7-2.7 3.3-2.7 5 0s3.3 2.7 5 0", key: "ink" }],
])
```

**16px 간격 검산**(1.5px: 반 획 1.125단위, 기준 2.25단위):

| 글리프 | 구간 | 바깥선 사이 | 16px | DPR1 2px(반 획 1.5단위) |
|---|---|---|---|---|
| Board | 패널 위 안선 ↔ 물결 위 끝 | 2.73 | 1.82px ✓ | 1.98단위 = 1.32px ✓ |
| Board | 물결 아래 끝 ↔ 패널 아래 안선 | 2.73 | 1.82px ✓ | 1.32px ✓ |
| Board | 패널 바깥선 ↔ 받침 선 위 | 2.25 | 1.50px ✓ | 1.50단위 = 1.00px △(시안 확인) |
| Board | 잉크 상자 y 1.875~22.625 → 중심 12.25 | — | ±0.5 ✓ | — |
| Software | 위 안선 ↔ 제목줄 위 | 2.75 | 1.83px ✓ | 1.33px ✓ |
| Software | 제목줄 ↔ 물결 / 물결 ↔ 아래 안선 | 2.73 | 1.82px ✓ | 1.32px ✓ |

- Board 받침 선은 DPR1 2px에서 빈틈 1px이다. 시안 ⑥ DPR1 캡처에서 붙어 보이면 받침 선을 y 22로 0.5 내린다(잉크 중심 12.5, 허용 끝).

```ts
// components/icons/lesson-tool-glyphs.ts — /product/sw 전용(hw는 MirroringGlyph만). 좌표는 LessonToolIcons.tsx 기준, {...solid}는 fill/stroke 속성으로.
import { createLucideIcon } from "lucide-react"
export const TimerGlyph = /*#__PURE__*/ createLucideIcon("classin-timer", [
  ["path", { d: "M7 3h10M7 21h10", key: "caps" }],
  ["path", { d: "M8.2 3v3.3c0 1.7 1.3 2.8 2.5 3.7.8.6.8 1.4 0 2-1.2.9-2.5 2-2.5 3.7V21", key: "l" }],
  ["path", { d: "M15.8 3v3.3c0 1.7-1.3 2.8-2.5 3.7-.8.6-.8 1.4 0 2 1.2.9 2.5 2 2.5 3.7V21", key: "r" }],
  ["circle", { cx: "12", cy: "16.4", r: "1", fill: "currentColor", stroke: "none", key: "sand" }],
])
// … Stopwatch, Dice, RandomPick, TrophyRank, SubBoard, PersonalBoard, GoBoard, ScreenShare, Vnc, Mirroring, SubCamera,
//   VideoGallery, Browser, MultiBrowser, QuizChoice, QuizBuzzer, GroupDiscussion, LiveChat, Collaboration, LaserPointer,
//   MaterialLibrary, Chemistry, Physics, Geometry, Measure — 각각 /*#__PURE__*/
```

- 26종은 원본 stroke 1.6 설계라 일부 좌표 조정이 필요할 수 있다. 시안 ③ 컨택트 시트에서 규칙 4로 검산한다.

### 9. `<Icon>` 래퍼와 `IconFrame`

`components/ui/icon.tsx`. 훅·`"use client"`가 없어 서버·클라이언트 양쪽에서 쓴다.

```tsx
import type { CSSProperties } from "react"
import type { LucideIcon, LucideProps } from "lucide-react"
import { cn } from "@/lib/utils"

// size 클래스를 항상 붙인다. 단 Button 안에서는 Button의 `[&_svg]:size-*`(특이도 0,1,1)가 이긴다 — 버튼 안 크기는 Button이 정한다(§15)
const SIZE = { 16: "size-4", 20: "size-5", 24: "size-6", 32: "size-8" } as const
const TONE = { inherit: "", muted: "text-fg-muted", ink: "text-fg-ink", accent: "text-fg-accent", danger: "text-fg-danger" } as const

export type IconProps = Omit<LucideProps, "ref" | "size" | "color" | "strokeWidth" | "absoluteStrokeWidth" | "aria-label" | "aria-hidden" | "role"> & {
  icon: LucideIcon
  size?: keyof typeof SIZE
  tone?: keyof typeof TONE
  /** 있으면 의미 아이콘(role=img). 없으면 장식(aria-hidden). */
  label?: string
  /** inline: 글줄 안 · lead: 여러 줄 글의 첫 줄(행 컨테이너에 line-height 필요) */
  align?: "inline" | "lead"
}

export function Icon({ icon: Glyph, size = 16, tone = "inherit", label, align, className, style, ...rest }: IconProps) {
  // lucide는 aria-* 키가 '있기만' 해도(값 undefined) aria-hidden을 생략한다 → 조건부 spread
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const }
  const alignStyle: CSSProperties | undefined =
    align === "inline" ? { display: "inline-block", verticalAlign: `calc(0.355em - ${size / 2}px)` }
    : align === "lead" ? { marginBlockStart: `calc((1lh - ${size}px) / 2)` }
    : undefined
  return <Glyph size={size} className={cn(SIZE[size], TONE[tone], className)} style={{ ...alignStyle, ...style }} {...rest} {...a11y} />
}

export function IconFrame({ icon, frame = 40, active = false, className }:
  { icon: LucideIcon; frame?: 40 | 48; active?: boolean; className?: string }) {
  // 활성 상태 자체는 부모 컨트롤의 aria-current / aria-pressed / aria-selected 가 전한다.
  return (
    <span className={cn(
      "inline-grid shrink-0 place-items-center rounded-lg border",
      frame === 48 ? "size-12" : "size-10",
      active ? "border-fg-accent text-fg-accent" : "border-line-hair text-fg-muted", className)}>
      <Icon icon={icon} size={frame === 48 ? 24 : 20} />
    </span>
  )
}
```

**RSC 경계 규칙:**
- `icon` prop은 컴포넌트 참조(forwardRef 객체)다. 서버 컴포넌트는 이 참조를 `"use client"` 컴포넌트의 prop으로 **넘기지 않는다**. 런타임에 'Only plain objects can be passed to Client Components' 오류가 나고 tsc·lint는 잡지 못한다.
- 대신 **렌더된 요소**(`icon={<Icon icon={RecordingIcon} size={20} />}`)나 **개념 키 문자열**(클라이언트에서 해석)을 넘긴다. 같은 경계 안에서는 참조를 넘겨도 된다.
- 정적 프리렌더 라우트는 `next build`가 실패해 드러나고, 동적 라우트는 PR 체크리스트로 확인한다.

**적용 방식:**
- 신규 공개 코드: `<Icon icon={RecordingIcon} size={20} tone="muted" />`.
- 기존 `<X className="w-4 h-4" />`는 P1 획 규칙만으로 획을 따른다. 파일을 손댈 때 래퍼로 옮긴다(일괄 치환 금지).
- 데이터 배열의 아이콘(`icon: Presentation` → `<tab.icon …/>`)은 `<Icon icon={tab.icon} size={16} />`로 바꾼다.
- **Button 안 크기:** 기존 `h-5 w-5`는 `size-` 클래스가 아니어서 계속 16으로 눌린다(예: `app/contact/page.tsx:661` Loader2). 20·24가 필요하면 `<Icon size>`로 옮긴다.

### 10. 상태 점 ● ○ –

상태 표기의 정본이다. 공개 화면의 비상호작용 pill을 대신하고(V9-A), '실시간'을 뜻하지 않으며 깜빡이지 않는다. **상태 전용이고 라벨·범주·열 이름에는 쓰지 않는다**(X11).

```html
<span class="status-dot" aria-hidden="true"></span> 자동 녹화
<span class="status-dot" data-state="off" aria-hidden="true"></span> 아직 연결되지 않음
<span class="status-dot" data-state="na" aria-hidden="true"></span> 해당 없음
```

| 모양 | 지면 | 먹 지면(C01 자동) | 대비 |
|---|---|---|---|
| ● 7px | `--fg-accent` #084734 | #6EE7B7 | 10.25 / 12.40 |
| ○ 7px, 테두리 `--stroke-pen` | `--line-control` #8F8A84 | /.40 | 3.27 / 3.70 |
| – 7×`--stroke-pen` | `--line-control` | /.40 | 3.27 / 3.70 |

- 점 옆에는 항상 13px 이상 텍스트를 붙인다. 점은 aria-hidden이고 의미는 텍스트가 진다.
- 수직 정렬은 `calc(0.355em − 3.5px)`.
- **쓰는 곳:** ProblemCost 장부 6행의 ○(꺼진 채, C07·C08), ai-report '자동 녹화' ●(정지, C26), 표 안의 예/해당 없음 셀(●·– + 텍스트).
- SolutionOverview의 ●점등 노드는 cards_motion 소유 `os-node`다. 정지 표지인 `status-dot`과 클래스를 섞지 않는다.

### 11. 아이콘 단독 버튼

- **박스 자체를 44×44로 한다.** `ui/Button`은 controls가 정의한 `size="icon-md"`(44×44, 아이콘 20)를 쓴다(C15). 헤더 메뉴·닫기 토글은 같은 박스에 `<Icon size={24}>`.
- 박스를 44로 키울 수 없는 자리(밀집 행 안의 보조 버튼 등)만 controls `hit-area` 유틸로 히트를 넓힌다.
- 색: `--fg-muted`, hover `--fg-ink`(헤더 토글은 `--fg-ink` 고정).
- **외곽선을 그리면** 1px `--line-control`, hover `--fg-ink`(C23). 외곽선 없는 버튼(다이얼로그 닫기·헤더 토글)은 아이콘 대비(muted 6.24:1, ink 18.08:1)로 1.4.11을 충족한다.
- 접근 이름은 컨트롤의 `aria-label`(또는 sr-only 텍스트)에 둔다. 정본 예: `components/sections/Header.tsx` 메뉴 토글(h-11 w-11, aria-label, aria-expanded) [코드].
- 포커스는 전역 보증 ① 2px outline이 맡는다.

### 12. 대기 스피너 (X08)

- `LoaderCircle` 16(버튼 안) 또는 20에 `animate-spin`. 화면에 동시에 1개만.
- 옆에 '처리 중…' 텍스트를 두거나 버튼에 `aria-busy`를 단다.
- **reduced:** `:where(.site) .animate-spin` **전부**(LoaderCircle, `RefreshCw animate-spin`, raw svg 스피너 `UnsubscribeForm.tsx:148`)가 회전 대신 opacity 1↔.4, 1.6s 점멸이 된다. 스켈레톤과 같은 주기·같은 keyframes(`skeleton-blink`)다. 규칙은 보증 ④ 하나(§토큰 4).

### 13. 화살표 (C13 · X03, `arrow-nudge`는 controls 소유)

- 뒤쪽 `ArrowRight` 16 하나. 외부 링크는 `ArrowUpRight`. 앞쪽 아이콘은 움직이지 않는다.
- 움직이는 화살표에는 `className="arrow-nudge"`를 단다(옵트인). 부모 `a`·`button`이 hover(hover 기기)이거나 focus-visible이면 `translate: 2px 0`, `--motion-fast` 160ms `--ease-soft`. reduced에서는 none.
- 쓰는 곳: primary·line CTA, ghost 텍스트 링크(X03), 링크 카드·TocRow·FAQ 행(C13, hover·focus-within).
- 아이콘만 있는 '다음 슬라이드' 버튼과 비활성 버튼의 화살표에는 달지 않는다.
- 기존 `group-hover:translate-x-*` 22회 [실측, 이전 판]는 이관 때 삭제하고 `arrow-nudge`로 바꾼다. 같은 화살표에 둘을 함께 두지 않는다.

### 14. 브랜드 마크 · 파비콘 · OG 마크 · 외부 브랜드 글리프

- **현황 [실측]:**
  - 로고는 래스터 `/images/logo.png`이고 Header·Footer·AuthShell, 그리고 **/admin/login(`app/admin/login/page.tsx:141`)**이 쓴다.
  - 파비콘 계열은 `app/icon.png`·`apple-icon.png`·`favicon.ico`다. manifest는 없다.
  - OG(`app/opengraph-image.tsx:54`)는 'C' 글자 배지를 그리고 fontFamily는 `sans-serif`다.
  - 저장소에 로고 SVG 원본이 없다. 방향 문서 기준 로고는 에메랄드(#00A070)라 #084734 UI 옆에서 두 초록이 어긋나 보인다.
- **이미 확정된 것(차단과 무관):**
  - theme-color `#FAFAF8`, `colorScheme: 'only light'`, 값은 `lib/design-tokens.ts`에서 import(C27, surfaces 소유). manifest는 만들지 않는다.
  - OG 'C' 배지는 폐기하고, 브랜드 원본이 오기 전까지는 텍스트 워드마크를 쓴다(C28). OG 템플릿(`lib/og/template.tsx`)은 typography 소유다.
- **목표(차단):** 브랜드팀의 공식 벡터 원본, ClassIn 글로벌 브랜드 가이드의 변형 허용 여부, 'UI 그린 #084734 단색화' 승인이 선행 조건이다. PNG를 손으로 트레이싱하지 않는다.
  - 단색 로고 컴포넌트 1개: `components/brand/ClassinLogo.tsx`, 인라인 SVG, `fill="currentColor"`. 지면에서는 `text-fg-accent`, 먹 지면에서는 `text-fg-ink`(#FAFAF8 자동).
  - 같은 path로 `app/icon.svg`(정적 파일이라 hex 리터럴), `app/apple-icon.tsx`(ImageResponse, `lib/design-tokens.ts` import), OG 템플릿의 마크를 맞춘다.
  - 원본을 받을 때 함께 정할 것: 락업(마크+워드마크) 최소 높이·여백, 어두운 탭에서의 파비콘 가시성(SVG 안 `prefers-color-scheme` 변형 또는 불투명 바탕), apple-icon 불투명 바탕(iOS는 투명부를 검게 채운다 [지식]), favicon.ico 16/32/48 유지.
  - `/images/logo.png`는 /admin/login이 쓰므로 공개 3곳을 바꾼 뒤에도 **지우지 않는다**. `logo_raw.png.png`·공개 전용 PNG만 대체 뒤 grep 0건을 확인하고 지운다.
- **ClassIn AI 마크:** `createLucideIcon("classin-ai", …)`로 다시 쓴다. 말풍선은 stroke, 주 별 하나는 `fill:"currentColor", stroke:"none"`. 보조 마이크로 스파클, duotone·white variant, #10B981·#34D399·#A7F3D0, drop-shadow를 삭제한다. 크기는 16/24. lucide 클래스·획 규칙·자동 aria-hidden을 그대로 받는다(운영자 승인 필요 — 열린 질문).
- **제3자 브랜드 글리프**(`components/auth/brand-glyphs.tsx`):
  - 소셜 로그인 버튼의 글리프는 각 플랫폼이 공식 허용하는 색·변형을 따른다(controls §3.5, DESIGN.md '외부 브랜드 예외'). 가드 hex 허용 목록은 `brand-glyphs`와 `SocialLoginRow`만이다.
  - 높이 44 통일만 이 스펙이 강제하고, 글리프 크기는 20(`size-5`)으로 통일한다. 현행 기본값 h-5·h-3.5·h-4·h-[18px] [코드]은 호출부에서 `size-5`로 맞춘다.
  - `app/download/DownloadPageClient.tsx:21-30`의 AppleGlyph 중복은 brand-glyphs 한 곳으로 합친다.
  - **푸터 SNS 글리프:** 현재 푸터에 SNS 링크가 0개다 [실측]. 링크를 두기로 하면(controls §3.6, 열린 질문) 네이버 블로그·카카오 채널·유튜브 3종을 같은 파일에 단색(`currentColor`) 글리프로 등록한다. 먹 위 `--fg-muted`, hover `--fg-ink`, 20px, 박스 44, `aria-label`='{채널명} (새 창)'. 브랜드 색은 쓰지 않는다(공식 단색 변형 허용을 확인한 뒤).

### 15. 공유 컴포넌트 격리 (C17)

- 어드민 importer가 있는 공유 파일은 **기본 문자열(클래스·prop·import)을 바꾸지 않는다**(ui/button 어드민 37파일, ui/dialog 6파일, ui/toast provider 공유 [실측, 이전 판]). 예외는 없다.
- 소비 방식은 C17의 셋뿐이다: ① CSS `:where(.site)` 접두(특이도 0, 이 스펙의 획·스피너·상태 점 규칙) ② 공유 컴포넌트의 `[.site_&]:` 변형(조상에 `.site`가 있을 때만) 또는 새 size·variant ③ `:root:has(.site)`(루트 속성, 아이콘 스펙은 쓰지 않는다).
- `isInternalPath`(`lib/internal-path.ts`로 옮겨 공유)는 소비 방식이 아니다. `site` 표지를 붙이는 세 곳 중 하나(토스트 뷰포트)의 판정 함수다.
- 공유 기본값에 남는 퇴역 표기는 고치지 않고 가드 허용 목록에 넣는다. 둘 다 공개 화면 결과가 정본과 같다.
  - dialog X의 `strokeWidth={2}`: 공개에서는 `:where(.site) svg.lucide` 규칙이 획을 덮는다. `icon-stroke-prop` 허용 목록에 `components/ui/dialog.tsx`.
  - toast의 `CheckCircle2`·`AlertCircle` import: lucide 0.562에서 `CircleCheck`·`CircleAlert`와 같은 컴포넌트를 가리키는 별칭이다 [코드, lucide-react.d.ts]. `icon-retired-import` 허용 목록에 `components/ui/toast.tsx`.
- 공유 파일에 `[.site_&]:` 변형·새 키를 더하는 커밋에는 '어드민 importer 수'를 적고 /admin 스크린샷 diff 0을 확인한다.

**button.tsx(controls 소유)에 아이콘이 요청하는 한 가지:** 기본 문자열의 `[&_svg]:size-4`는 그대로 둔다. 새 size 키 `icon-md`에 같은 변형 `[&_svg]:size-5`를 넣으면, tailwind-merge가 같은 변형·같은 그룹으로 보고 뒤의 것(size 키)만 남긴다. 버튼 안 아이콘 크기는 Button이 정한다(`<Icon size>`는 같은 값으로 적는다). 24가 필요한 헤더 메뉴/닫기 토글만 호출부 `className="[&_svg]:size-6"`로 덮는다(같은 원리로 className이 마지막에 이긴다).

```ts
// 기본 클래스 — 변경 없음
"… [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"
// size — 새 키만 추가
"icon-md": "size-11 rounded-md [&_svg]:size-5",
```

**dialog.tsx 닫기(controls §3.12 소유):** 공개 모달만 `[.site_&]:` 변형으로 `icon-md` 44 박스, X 20 `--fg-muted`, hover `--fg-ink`. 어드민 클래스와 `strokeWidth={2}`는 그대로다.

**toast.tsx:** 뷰포트에 `!isInternalPath(pathname) && "site"`(C17 표지). 아이콘 import(`CheckCircle2`·`AlertCircle` = `CircleCheck`·`CircleAlert` 도형) 16은 그대로 두고, 공개 화면에서만 `[.site_&]:` 변형으로 성공 `text-fg-accent`·오류 `text-fg-danger`를 준다. 좌측 상태선은 두지 않는다. 상태는 아이콘 색과 문구가 맡는다(C21). 토스트 면(파스텔 채움 퇴역)은 controls 소관이다.

---

## 사용 규칙과 대상 파일

**아이콘을 쓰지 않는 곳**
- 수치·Stat, 인용, 사례 카드 본문, 카드 머리띠
- 표의 반복 셀(열 머리가 있을 때), 순서 목록, 탭 라벨의 순서 표시
- 기사 본문(블로그·문서 prose), 헤딩 앞 장식
- 버튼 하나에 아이콘 둘, 한 행에 아이콘 둘 이상
- 사전에 없는 개념, 'AI'

**파일별 변경**(라인은 [코드, 이전 판 기준]. 착수 시 다시 확인)

| 파일(라인) | 현재 | 변경 | 단계 |
|---|---|---|---|
| `components/AppChrome.tsx`, `lib/internal-path.ts`, `components/ui/toast.tsx`, 공개 DialogContent 5곳 | `.site` 없음 | system P0이 `site` 표지를 단다(C17). 아이콘 스펙은 이에 의존만 한다 | P0(system) |
| `components/ui/toast.tsx:4,85,87` | CheckCircle2·AlertCircle, 파스텔 면 | import는 그대로(같은 도형 별칭, 가드 허용). 공개만 `[.site_&]:` accent/danger(§15) | P2 |
| `components/ui/dialog.tsx:62-73` | 닫기 X `text-[#A39E98]`(2.66:1), `strokeWidth={2}`, 히트 28 | 기본 문자열·`strokeWidth`는 그대로(공개 획은 CSS가 덮음, 가드 허용). 공개만 `[.site_&]:` 44 박스·muted·20(controls) | P2 |
| `components/ui/button.tsx:8` | `[&_svg]:size-4`가 20·24를 16으로 누름 | 기본 문자열 그대로. 새 size `icon-md`(`[&_svg]:size-5`)가 tailwind-merge로 기본을 대체, 24는 호출부 `[&_svg]:size-6`(§15, controls). 기존 icon·icon-sm은 유지하되 공개에서 쓰지 않는다 | P2 |
| `components/sections/Header.tsx`, `ProductTabNav.tsx`, `app/product/page.tsx`, `app/docs/page.tsx` | 제품 표시 Pencil·Presentation·MonitorSpeaker | `SoftwareIcon`·`BoardIcon` 16, 색 상속 | P2 |
| `app/product/page.tsx` | CheckCircle2 불릿 | 불릿 아이콘 삭제(hair 행). 필요하면 `Check` 16 muted | P4 |
| `app/pricing/page.tsx:54` | 모든 Plan `CheckCircle2` #084734 | 추천 Plan만 `Check` 16 accent, 나머지 muted(C11·C21) | P5 |
| `components/docs/GuideIntentIcons.tsx` | 자체 svg, stroke 2 | `guide-glyphs.ts`로 이관 후 삭제 | P4 |
| `components/product/sw/LessonToolIcons.tsx` | 사용 0, stroke 1.6 | `lesson-tool-glyphs.ts`로 이관(GoBoard strokeWidth 1 삭제) 후 삭제 | P4 |
| `app/product/sw/page.tsx:49-80, 1854-1886` | 26 타일: 그라데이션 + 글래스 + hover scale. 제목 '30+ 수업 도구', 실제 26개 | **목차 행**: 그룹 5개(진행·순서 / 판서·화면 / 브라우저 / 퀴즈·토론 / 실험·자료), 그룹 머리 `text-label text-fg-accent`, 행 `grid-cols-[20px_1fr] gap-3 min-h-12 border-t border-line-hair`, 글리프 20 muted, 라벨 `text-body font-medium`. 제목은 `대표 수업 도구 {LESSON_TOOLS.length}종`(배열에서 계산) | P4 |
| `app/product/sw/page.tsx:86-162, 1900-1910` | 활동 PNG 10장 unoptimized 560,100B [실측]. homework.png 파랑 | 글리프 20 또는 IconFrame 48. 대응 없으면 아이콘 없이. activity-icons 18장·`tool-icons/` 26장(사용 0, 65,015B) 삭제 | P4 |
| `app/product/sw/page.tsx:776-779, 921-937, 1068-1075` | 이모지 15개 | 삭제. 목록은 번호·글자, AI 기능 묶음은 `text-label` 'AI' | P1 |
| `app/product/sw/page.tsx:695, 978, 1084` | ✕ 2, ✦ 1 | ✕ → `status-dot` na + '해당 없음'. ✦ → 삭제 | P1 |
| `app/product/sw/page.tsx:933`, `app/product/hw/page.tsx:276,279,1194` | '30+ 수업 도구' | 출처가 `lib/facts.ts`에 없으므로 숫자를 뺀 문구로(감사 D3·D5, system §7). sw 목록 제목만 실제 개수 | P1 |
| 텍스트 '→' 약 20곳(hw 5, sw 4, ai-report 3, docs/[category]/[slug] 2, download·Hero·PricingCalculator·ClassroomStudioSection·ValueAnchor 각 1) | 글자 화살표 | CTA는 `ArrowRight` 16 + `arrow-nudge`, 순서·흐름은 '·' 또는 번호 | P1 |
| `app/product/sw/page.tsx:585, 588, 2029-2031` | 수치 옆 Monitor·Sparkles·Globe·Zap·Shield | 삭제 | P1 |
| `app/product/sw/page.tsx:1944-1947` | 수업 형태 3종 민트 타일 w-7 | 아이콘 삭제 | P4 |
| `app/product/hw/page.tsx:150-160` | 두 열 목록의 손그림 체크·마이너스(stroke 2~2.5) | 삭제. 열 제목과 hair 행이 의미를 맡는다 | P4 |
| `app/product/hw/page.tsx:382` | 민트 원 + 체크 불릿 | 컨테이너 삭제. 아이콘 없음 또는 `Check` 16 muted `align="lead"` | P4 |
| `app/product/hw/page.tsx:527-551` | 준비→복습 5단계에 Fingerprint·PenTool·Users·Share2·Monitor | `No. 01–05`(`text-folio tabular-nums`, C24) | P4 |
| `app/product/hw/page.tsx:958-968` | Zap·Hand·Maximize w-7, items-start(28 대 24 어긋남) | `SpeedIcon` / 삭제 / `LessonFileIcon` 20 `align="lead"` | P4 |
| `app/product/hw/page.tsx:1005` | Shield = AG·AF 코팅(오용) | 삭제 | P4 |
| `app/product/hw/page.tsx:1053,1063` | Share2 = 동기화, Users = 복습 | `SyncIcon`, `RecordingIcon` | P4 |
| `app/product/hw/page.tsx:1113-1123` | Camera·Mic·Wifi | `CameraIcon`(Webcam) / `MicIcon` / 삭제 | P4 |
| `app/product/hw/page.tsx:1187-1213` | Share2 = 파일 호환, GraduationCap = LMS, Monitor = 미러링 w-8, 글래스 카드 | `MaterialIcon` / `LmsIcon` / `MirroringGlyph` 20, 프레임 없음. 먹 지면 안에는 IconFrame을 두지 않는다(먹 위 허용 목록 밖, surfaces §3-5) | P4 |
| `app/product/hw/page.tsx:609`, `app/product/sw/page.tsx:442, 491`, `components/sections/TestimonialWall.tsx:10-12` | `rating: source.rating ?? 5`(없으면 5점 날조), StarRating 기본 5 + `aria-label="별점 5점"`, 금색 별 | Star와 함께 **rating 필드, `?? 5`, StarRating, aria-label 모두 삭제** | P1 |
| `app/product/hw/page.tsx:220` | Monitor w-20 #A39E98 플레이스홀더 | 도판 Frame으로 대체(imagery). 아이콘 플레이스홀더 금지 | P4 |
| `app/product/ai-report/page.tsx:243-249`(OutlineIcon), `:449·:568` 사용처 | 로컬 OutlineIcon(r12, 흰 배경, 아이콘 #084734) | 공용 `IconFrame`(r8, 투명, 기본 muted, 활성만 accent). 구조·카피는 유지(C26) | P4 |
| `app/product/ai-report/page.tsx:~470-476` | '자동 녹화 중' 무한 점멸 점 | 정적 `status-dot` + '자동 녹화'(C26). 웨이브폼 정지·'예시 화면' 태그는 imagery·cards 소관 | P4 |
| `app/product/ai-report/page.tsx:6,164` | Sparkles | 삭제, 'AI' 글자 | P1 |
| `components/sections/SolutionOverview.tsx:5,13,22,31,93,141` | 탭 아이콘 BookOpen·Zap·RefreshCw, 손그림 체크 svg | 탭은 글자만(index-tab, C07·C12). 체크는 삭제하거나 `Check` 16 muted | P3 |
| `components/sections/ProblemCost.tsx:5,45-61` | TrendingDown·Clock·AlertTriangle + 근거 없는 수치 | 아이콘 삭제. 6행 장부의 각 행 머리에 `status-dot data-state="off"`(꺼진 채, C07·C08). 수치는 0 | P3 |
| `components/sections/Comparison.tsx:4,68-106` | 머리(#111110 위) X #A39E98·Check green-400, 흰 행 X #A39E98 2.66·Check green-500 2.28, 행 글자 `text-[#A39E98]` → 1.4.11·1.4.3 위반 | 머리·행 아이콘 **모두** 삭제. 열 이름은 글자만(점을 라벨로 쓰지 않는다, X11). Classin 열 강조는 `.row-accent`(C21). 행 글자는 `text-fg-muted`(hex→토큰) | P3 |
| `components/sections/GlobalScale.tsx:4-10` | 수치 4개에 아이콘·민트 타일 | 삭제 | P3 |
| `components/sections/TestimonialWall.tsx:4` | Quote·Star | 삭제(PullQuote 여는 따옴표는 글자, V2-A) | P3 |
| `components/sections/FinalCTA.tsx:7` | CalendarDays·FileCheck2·MapPin·Newspaper 선택지 행 | V5-A 구성(제목·덱·primary cta + 텍스트 링크)에 선택지 행이 없어 아이콘 4개 삭제. 텍스트 링크의 `ArrowRight` 16 + `arrow-nudge`만 | P3 |
| `components/sections/KeyUseCases.tsx`, `ScienceBased.tsx`, `HomeLeadMagnet.tsx`, `CaseStudies.tsx` | 민트 원·타일 | 컨테이너 삭제. 그룹 전체가 아이콘이 필요하면 IconFrame, 아니면 없음 | P3 |
| `components/sections/EraVision.tsx:108`, `components/docs/DocsSidebarLayout.tsx:24-26,127-133` | 손그림 체크·검색·쉐브론 | `Check`(muted) / `Search` / `ChevronDown` 16 | P2 |
| `app/contact/page.tsx:661, 685-707` | Button 안 Loader2 `h-5 w-5`(실제 16), Phone·Mail·MapPin 17px, strokeWidth 1.8 | `<Icon icon={LoaderCircle} size={16}>`, 연락처 20, prop 삭제 | P5 |
| `app/about/AboutPageClient.tsx` 14곳 | strokeWidth 1.5~2.5, Sparkles w-3 | prop 삭제, Sparkles 삭제, 12px → 16 | P5 |
| Sparkles 사용 공개 파일 [실측 2026-10-26]: `app/about/AboutPageClient.tsx`, `app/product/sw/page.tsx`, `app/product/ai-report/page.tsx`, `app/updates/page.tsx`, `app/events/videos/[slug]/page.tsx`, `components/sections/NewsletterModal.tsx`, `components/sections/DemoModal.tsx`, `components/product/sw/OnboardingRoadmap.tsx`, `lib/blog-categories.ts`(+ notifications 계열은 공개 여부 확인) | AI·장식 혼용 | 삭제. AI는 'AI' 글자 | P1(블로그 카테고리는 블로그 세션 뒤) |
| `components/ui/ClassInAIIcon.tsx`, `components/ui/FloatingChatbot.tsx:258,814,1363,1693` | duotone 3색, 보조 스파클, 획 1.75, 13/22/28px, drop-shadow, variant | §14대로 재작성. 호출부 16/24, variant·drop-shadow 삭제 | P5(승인 후) |
| Header·Footer·AuthShell `/images/logo.png`, `app/icon.png`·`apple-icon.png`·`favicon.ico`, `app/opengraph-image.tsx` | 에메랄드 래스터, OG 'C' 배지 | `ClassinLogo` 단색(§14, 차단). OG 'C' 배지 폐기·텍스트 워드마크는 typography C28 작업에서 | 차단 |
| `lib/blog-categories.ts:1-31` | 제품 = Sparkles, BarChart3 | `Package`, `ChartColumn` | 블로그 세션 뒤 |
| `app/download/DownloadPageClient.tsx:21-30` + `components/auth/brand-glyphs.tsx:42` | AppleGlyph 중복 | brand-glyphs 한 곳 | P5 |
| `app/global-error.tsx:56` | ⚠ 글자 | `TriangleAlert` 24 `absoluteStrokeWidth strokeWidth={1.5}`(셸 밖 예외) | P1 |
| Loader2 29곳(21파일) | 별칭, reduced에서 멈춤 | `LoaderCircle`. 점멸은 보증 ④ | P2 |
| CheckCircle2 27곳(22파일) | 성공과 불릿 혼용 | 성공 상태는 `CircleCheck`(인라인 32·토스트 16), 불릿은 삭제하거나 `Check` 16 muted | P2–P5 |
| 민트 원·타일 약 24파일(showroom, Premium·Signup·Login·ForgotPassword, ResourceDownloadForm, SegmentLandingPage, Seminar, EventSignupModal, DemoModal …) | `rounded-full bg-[#ECFDF5]` + LockKeyhole·Check·MailCheck | 컨테이너 삭제, 인라인 표지 32 단독. 목록이면 IconFrame | P5 |
| 비밀번호 토글 등 인터랙티브 아이콘의 #A39E98 (`PublicLoginPanel`·`SignupPanel`·`ResetPasswordPanel`) | 2.54:1 | `text-fg-muted`(hex→토큰). 먹 구간을 `surface-ink`로 옮긴 뒤에 치환(system §11) | P5 |
| `components/ui/MobileFloatingCTA.tsx` | MapPin·MessageSquare(사전과 일치) | 다른 세션 머지 뒤. 아이콘 16, 박스는 controls 규격(h44, 1px `--line-control`) | 세션 뒤 |
| `scripts/check-design-tokens.mjs` | admin/branch 3패턴 | 아래 아이콘 규칙을 system §6 규칙 배열에 더한다 | P0 |

**가드 규칙(system §6 형식, 같은 파일의 규칙 배열에 추가)**

AST 검사는 하지 않는다(system §6). 정규식은 근사이고 warn으로 시작해 베이스라인 래칫으로 줄인다. `cn(...)`·템플릿 안 클래스, 크기 격자는 런타임 수용 스니펫이 잡는다.

```js
// scripts/check-design-tokens.mjs — icons가 더하는 규칙. PUBLIC = app/**·components/**·lib/** 의 .ts/.tsx (어드민 제외, system §6)
const RETIRED = "Sparkles|Zap|Star|PenTool|Presentation|MonitorSpeaker|Globe2|ExternalLink|FileCheck2|Fingerprint|" +
                "Loader2|CheckCircle2|AlertTriangle|AlertCircle|BarChart3|HelpCircle|Clock3"
export const ICON_RULES = [
  { id: "icon-stroke-prop", glob: PUBLIC,
    // 대문자로 시작하는 JSX 태그(컴포넌트)의 strokeWidth/absoluteStrokeWidth. raw <path>·motion.circle 은 소문자라 제외
    pattern: /<[A-Z][\w.]*\b[^<>]*?\s(?:strokeWidth|absoluteStrokeWidth)\b/g,
    message: "아이콘에 strokeWidth를 쓰지 않는다. 획은 :where(.site) svg.lucide { stroke-width: var(--stroke-pen) }가 정한다.",
    allow: ["app/global-error.tsx", "components/ui/dialog.tsx"], severity: "warn", errorFrom: "YYYY-MM-DD" },  // dialog = 공유 기본값 불변(§15)
  { id: "icon-retired-import", glob: PUBLIC,
    pattern: new RegExp(`import\\s*\\{[^}]*\\b(?:${RETIRED})\\b[^}]*\\}\\s*from\\s*["']lucide-react["']`, "g"),
    message: "퇴역 글리프·별칭. Loader2→LoaderCircle, CheckCircle2→CircleCheck(불릿이면 Check muted), AlertTriangle→TriangleAlert, AlertCircle→CircleAlert, BarChart3→ChartColumn, HelpCircle→CircleHelp, Clock3→Clock, ExternalLink→ArrowUpRight, Sparkles→'AI' 글자, 나머지는 lib/icon-concepts.ts.",
    allow: ["components/ui/toast.tsx"], severity: "warn", errorFrom: "YYYY-MM-DD" },  // toast = 공유 기본값 불변, 같은 도형 별칭(§15)
  { id: "icon-namespace-import", glob: PUBLIC,
    pattern: /import\s*\*\s*as\s+\w+\s+from\s*["']lucide-react["']|["']lucide-react\/dynamic["']/g,
    message: "lucide는 이름으로만 import한다(트리셰이킹).", allow: ["tests/**"], severity: "warn", errorFrom: "YYYY-MM-DD" },
  { id: "icon-glyph-char", glob: PUBLIC,
    // JSX 텍스트(>…<)와 따옴표 문자열 안의 글자 기호·이모지. ©®™ 제외. 주석 안 따옴표는 오탐할 수 있다(warn)
    pattern: /(?:>[^<>{}]*|(["'`])[^"'`\n]*)(?:[✕✦✓✗★⚠→]|(?![©®™])\p{Extended_Pictographic})/gu,
    message: "글자 기호·이모지 대신 lucide 아이콘(→ 는 ArrowRight + arrow-nudge), 상태는 status-dot, ✦는 삭제.",
    allow: [], severity: "warn", errorFrom: "YYYY-MM-DD" },
]
```

- `Pencil`·`Wifi`·`Hand`·`Maximize`는 정당한 동작 아이콘일 수 있어 가드에 넣지 않고 리뷰로 본다.
- 금지 색(hex)·#ECFDF5 면·`shadow-*`·`rounded-2xl` 이상·`animate-ping`·`hover:scale-` 등은 system §6의 1차 규칙이 이미 잡는다. 아이콘 스펙은 여기에 **기존 규칙 (b)(Tailwind 기본 팔레트 유출)의 공개 glob 확장과 색 목록에 green·amber·yellow 추가**를 요청한다(초록 체크 green-400/500 차단).

---

## 접근성·대비

- **장식과 의미 구분:** 래퍼에 `label`이 없으면 `aria-hidden="true"`, 있으면 `role="img"` + `aria-label`. role 없는 svg의 aria-label은 VoiceOver가 건너뛸 수 있다 [지식]. 텍스트가 같은 뜻을 이미 말하면 장식으로 둔다.
- **함정 [코드]:** lucide `hasA11yProp`는 `aria-*` 키가 **있는지만** 본다. 래퍼는 조건부 spread를 쓰고 `aria-label={maybeUndefined}`를 넘기지 않는다.
- **아이콘 단독 컨트롤:** 접근 이름은 컨트롤에, 박스는 44×44 이상(WCAG 2.5.5 AAA 기준으로 운영, 2.5.8 AA 24 충족).
- **비텍스트 대비(1.4.11, 3:1 이상):** 의미·조작 아이콘은 `--fg-muted`(6.24) 이상. ○·– 점과 외곽선 있는 아이콘 버튼은 `--line-control`(3.27, 먹 3.70). `--fg-faint`는 장식 전용. 먹 지면은 C01 값으로 자동 전환(.72 / .56 / 점 .40 / 강조 #6EE7B7 / 오류 #E89A94).
- **활성 상태:** 색 하나로 알리지 않는다. IconFrame 테두리 hair→`--fg-accent`(10.71)와 aria 상태를 함께 단다.
- **색 단독 금지(1.4.1):** 상태는 모양(● ○ –)과 텍스트로 구분한다. 토스트 성공·오류는 아이콘 모양(CircleCheck·CircleAlert)과 문구가 다르다.
- **forced-colors:** lucide는 `currentColor`라 CanvasText를 따른다. ●는 `forced-color-adjust:none` + `CanvasText` 채움, ○는 테두리라 그대로 보인다. IconFrame 테두리도 남는다.
- **reduced-motion:** `arrow-nudge` 이동 none, `.site` 안 모든 `.animate-spin`은 opacity 점멸, 아이콘 진입·hover scale·회전·ping·bob 0. 아이콘은 Reveal·서사 모먼트 대상이 아니다.
- **확대(system §9):** 아이콘은 px 고정, 짝 글자는 rem이다. 200% 확대·iOS Aa 150%에서 아이콘이 글자보다 작아져도 잘림·겹침이 없어야 하므로 아이콘 칸은 `shrink-0` 고정폭, 글자 칸은 `min-w-0`로 둔다.
- **no-JS·SSR:** lucide와 커스텀 글리프는 SSR 인라인 SVG다. width/height 속성이 있어 CLS 0이고, `opacity:0` 초기 상태가 없다.

---

## 성능 예산

| 항목 | 예산 | 근거 |
|---|---|---|
| 아이콘 런타임 | 공유 1회 약 1.2KB gz | Icon + createLucideIcon + defaultAttributes + utils = 1,183B gz [실측, 이전 판] |
| 개별 아이콘 | 약 0.2~0.35KB gz | gauge 203B, presentation 232B, messages-square 303B, file-chart-column 318B [실측, 이전 판] |
| **전 라우트 공유 청크 증가** | **2KB gz 이하** | 제품 글리프 2종 + 래퍼 + 별칭만. `/*#__PURE__*/`와 모듈 별칭으로 강제 |
| 라우트당 아이콘 JS | 고유 아이콘 30개 이하, **8KB gz 이하**(커스텀 포함) | 공개 lucide 파일 99개 중 68개가 `use client` [실측, 이전 판] |
| 래스터 아이콘 | **0B** | /product/sw 활동 PNG 560,100B, tool-icons 65,015B(사용 0) [실측] |
| SSR 인라인 SVG | 페이지당 120개 이하 | HTML 무게 |
| 애니메이션 | 스피너 동시 1개, 화살표는 `translate`만 | will-change 0, drop-shadow 0, 레이아웃 속성 0 |
| CSS | 아이콘 규칙(획 2 + 상태 점 4 + 보증 ④ 1) 0.5KB gz 이하 | site-base.css |
| 금지 | 아이콘 폰트, 스프라이트 fetch, `lucide-react/dynamic`, `import * as`(테스트 제외), PNG·WebP 아이콘, 사전 객체(`ICON = {…}`), PURE 없는 `createLucideIcon` | — |

---

## 마이그레이션(S/M/L)

단계 이름은 system §11 롤아웃(P0–P5)을 따른다. 각 단계는 375×812·1440×900 전후 스크린샷, /admin diff 0, 수용 스니펫 ①②를 확인한다. 다른 세션이 `globals.css`·`MobileFloatingCTA`·블로그 파일을 편집 중이면 그 머지 뒤에 시작한다(system §11 (c)).

- **[M] 시안(구현 전, 저장소 변경 없음):** ① V6 확인(시안 ⑥) — 16/20/24/32 아이콘을 15·16·17px Pretendard 400/500/600 옆에, paper·sheet·ink 위에 두고 Mac(DPR2)·iPhone 실기기·Windows Chrome 100%/125%(DPR1)로 캡처. 1.5 기본 + DPR1 2px을 확정하거나 V6-B(1.75)로 바꾼다. ② ClassinBoard·ClassinSoftware 16px 3배 확대, Monitor·Presentation·AppWindow·LayoutPanelTop 옆. 물결 유지 판정, Board 받침 선 DPR1 빈틈 확인. ③ 수업 도구 26종 컨택트 시트(20px, 1x/2x/3x, paper·sheet) — 이름 가림 탈락 목록. ④ FileText·FileChartColumn·ClipboardCheck·ChartColumn 16~20px 구분성. ⑤ SW 도구 목차 행 4열·2열. ⑥ 정렬 3모드 확대. ⑦ ai-report OutlineIcon 전후(r12→r8, 흰→투명, 초록→muted).
- **[S] P0(화면 변화 0, system P0 PR에 포함):** tokens.css에 `--stroke-pen`·`--stroke-accent`·DPR1 미디어(소비처 없음). 가드에 `ICON_RULES` 4개를 warn으로 추가하고 `scripts/design-baseline.json`에 현재 건수를 적는다. — `app/styles/tokens.css`, `scripts/check-design-tokens.mjs`, `scripts/design-baseline.json`
- **[S] P1 획·스피너·상태 점 규칙:** site-base.css base 레이어의 svg.lucide 획 2규칙, components 레이어 `.status-dot`, 보증 ④ 스피너(`!important`). 화면 변화는 획 통일뿐이다. 검증: 스니펫 ①(스코프 누락·획·vector-effect), reduced 에뮬레이션에서 스피너 animation-name이 `skeleton-blink`이고 opacity가 실제로 변함(Tailwind 4가 @theme 안 keyframes를 쓰일 때만 내보낼 수 있다 [지식] — 안 나오면 keyframes 위치를 system과 정한다). — `app/styles/site-base.css`
- **[S] P1 빼기·정직성:** 이모지 15·✕·✦·⚠·텍스트 '→' 약 20곳, Sparkles 공개 파일(블로그 카테고리 제외), 수치 옆 아이콘, 별점·`?? 5`·StarRating·aria-label, '30+' 문구. — `app/product/sw/page.tsx`, `app/product/hw/page.tsx`, `app/product/ai-report/page.tsx`, `app/docs/[category]/[slug]/page.tsx`, `app/download/DownloadPageClient.tsx`, `components/sections/Hero.tsx`, `components/pricing/PricingCalculator.tsx`, `components/sections/TestimonialWall.tsx`, `app/global-error.tsx`, `app/about/AboutPageClient.tsx`, `app/updates/page.tsx`, `app/events/videos/[slug]/page.tsx`, `components/sections/NewsletterModal.tsx`, `components/sections/DemoModal.tsx`, `components/product/sw/OnboardingRoadmap.tsx`, (ClassroomStudioSection·ValueAnchor)
- **[S] P2 프리미티브:** `components/ui/icon.tsx`(Icon·IconFrame), `components/icons/product-glyphs.ts`(시안 ② 승인본, PURE), `lib/icon-concepts.ts`(소비처 있는 별칭만), `tests/lib/icon-concepts.test.ts`. PR 체크리스트에 'RSC 경계로 아이콘 참조를 넘기지 않기'.
- **[S] P2 공유 컴포넌트(controls PR과 같이):** button 새 size `icon-md`(`[&_svg]:size-5`), dialog 닫기 `[.site_&]:`, toast 공개 색 `[.site_&]:`. 세 파일 모두 기본 문자열(클래스·prop·import)은 그대로다. 커밋마다 어드민 importer 수 기록, /admin diff 0. — `components/ui/button.tsx`, `components/ui/dialog.tsx`, `components/ui/toast.tsx`
- **[M] P2 기계적 정리:** lucide·글리프 JSX의 strokeWidth prop 약 21~27건 삭제(global-error·공유 ui/dialog 예외, raw SVG·motion.circle은 유지). 같은 도형 별칭 교체(Loader2·CheckCircle2·AlertTriangle·AlertCircle·BarChart3·HelpCircle, 공유 ui/toast 제외). 도형이 바뀌는 교체(Clock3→Clock, ExternalLink→ArrowUpRight)는 diff에 '의도된 변경'. 손그림 체크·검색·쉐브론 → lucide. `group-hover:translate-x-*` → `arrow-nudge`. Header·ProductTabNav·/product·/docs 제품 표시 → BoardIcon·SoftwareIcon. — `components/docs/DocsSidebarLayout.tsx`, `components/sections/EraVision.tsx`, `app/unsubscribe/UnsubscribeForm.tsx`, `app/unsubscribe/page.tsx`, `components/seminars/SeminarPoster.tsx`, `components/sections/Header.tsx`, `components/sections/ProductTabNav.tsx`, `app/product/page.tsx`, `app/docs/page.tsx`, (Loader2·CheckCircle2 사용 21~22개 파일)
- **[M] P3 홈(Act 순서, 모먼트 커밋과 같이):** SolutionOverview 탭 글자화, ProblemCost ○ 장부, Comparison 아이콘 전부 삭제 + `text-fg-muted`, GlobalScale·KeyUseCases·ScienceBased·HomeLeadMagnet·CaseStudies 컨테이너 철거, TestimonialWall Quote·Star, FinalCTA 선택지 아이콘. — `components/sections/SolutionOverview.tsx`, `ProblemCost.tsx`, `Comparison.tsx`, `GlobalScale.tsx`, `KeyUseCases.tsx`, `ScienceBased.tsx`, `HomeLeadMagnet.tsx`, `CaseStudies.tsx`, `TestimonialWall.tsx`, `FinalCTA.tsx`
- **[L] P4 제품:** 수업 도구·가이드 글리프 이관(PURE, GoBoard strokeWidth 삭제, 탈락분 대체) 후 원본 2파일 삭제. SW 도구 목차 행·활동 아이콘 교체, activity-icons 18장·tool-icons 26장 삭제(모션 플랜 Phase 3 'SW 다이어트'와 같은 커밋). HW 의미 교정(Zap 해체, Shield·Wifi 삭제, Share2·Camera·GraduationCap 교정, 단계 `No. 01–05`, 플레이스홀더 → 도판). ai-report IconFrame·정적 상태 점. — `components/icons/lesson-tool-glyphs.ts`, `components/icons/guide-glyphs.ts`, `components/product/sw/LessonToolIcons.tsx`, `components/docs/GuideIntentIcons.tsx`, `app/product/sw/page.tsx`, `app/product/hw/page.tsx`, `app/product/ai-report/page.tsx`, `components/product/hw/AfterClassSection.tsx`, `components/product/hw/OnboardingRoadmap.tsx`, `public/images/product/sw/activity-icons/`, `public/images/product/sw/tool-icons/`
- **[M] P5 콘텐츠·전환:** contact(Loader2·연락처 20·prop), 인증 패널(#A39E98 → `text-fg-muted`, 먹 구간 이관 뒤), 민트 원 철거(showroom·premium·resources·landing·events·seminars), pricing Plan Check, AppleGlyph 통합·브랜드 글리프 `size-5`, ClassIn AI 마크(승인 뒤), 블로그 카테고리(블로그 세션 뒤), MobileFloatingCTA(세션 뒤). — `app/contact/page.tsx`, `components/auth/*Panel.tsx`, `components/auth/PublicLoginDialog.tsx`, `components/auth/brand-glyphs.tsx`, `app/showroom/page.tsx`, `components/showroom/ShowroomBookingForm.tsx`, `components/premium/PremiumLoginGate.tsx`, `app/premium/page.tsx`, `app/resources/[slug]/ResourceDownloadForm.tsx`, `components/landing/SegmentLandingPage.tsx`, `components/events/EventSignupModal.tsx`, `components/seminars/SeminarLockedPreview.tsx`, `app/pricing/page.tsx`, `app/download/DownloadPageClient.tsx`, `components/ui/ClassInAIIcon.tsx`, `components/ui/FloatingChatbot.tsx`, `lib/blog-categories.ts`, `components/ui/MobileFloatingCTA.tsx`
- **[S] 가드 승격:** 2주 warn 뒤 규칙별로 error(system §6). 베이스라인 건수는 감소만 허용.
- **[S] 문서:** DESIGN.md 아이콘 절은 P2 프리미티브 PR과 같은 커밋에(system §10). 감사·모션 플랜 동기화: 205행(미사용 자산 'PNG 28개' → tool-icons 26장 + 활동 PNG 18장, 대체 후 삭제), 307행(26 타일 → 정지 목차 행, 마이크로 데모는 아이콘과 별개 띠·페이지 모먼트 예산 안), 321행(stroke 1.75 → V6 결과 1.5/DPR1 2px, '타일 없이 또는 whisper 아웃라인' → '타일 없음 또는 IconFrame 40/48·r8·투명'), 333행('AI 리포트 무한 펄스 in-view 한정' → 정적 상태 점, C26). — `DESIGN.md`, `docs/active/public-site-audit-motion-plan-2026-10-26.md`
- **[M] 브랜드 마크(차단):** 벡터 원본·변형 허용·단색화 승인 뒤. `ClassinLogo`, 공개 3곳 교체, `app/icon.svg`·`app/apple-icon.tsx`·OG 템플릿 마크. `/images/logo.png`는 /admin/login 때문에 유지. — `components/brand/ClassinLogo.tsx`, `components/sections/Header.tsx`, `components/sections/Footer.tsx`, `components/auth/AuthShell.tsx`, `app/icon.svg`, `app/apple-icon.tsx`, `lib/og/template.tsx`

---

## 수용 기준

**검사 스니펫**(DevTools). 정지 상태, 그리고 토스트 성공·오류 각 1회, 챗봇 열기, 동의 배너 표시 상태마다 실행한다.

```js
// ① 공개 화면 아이콘: 스코프 누락·획·크기·vector-effect·a11y 위반 0
const PEN = getComputedStyle(document.documentElement).getPropertyValue('--stroke-pen').trim()  // DPR2+ '1.5px', DPR1 '2px'
const SIZES = [16, 20, 24, 32]
const bad = [...document.querySelectorAll('svg.lucide')].filter(s => s.getClientRects().length).filter(s => {
  if (!s.closest('.site')) return true                                  // 토스트·포털·배너 스코프 누락
  const w = s.getBoundingClientRect().width                             // 정지 상태에서 측정
  const child = s.querySelector('path,line,circle,rect,polyline,polygon,ellipse')
  return getComputedStyle(s).strokeWidth !== PEN
    || !SIZES.some(n => Math.abs(w - n) < 0.01)
    || (child && getComputedStyle(child).vectorEffect !== 'non-scaling-stroke')
    || (s.hasAttribute('aria-label') ? s.getAttribute('role') !== 'img' : s.getAttribute('aria-hidden') !== 'true')
})
bad.length   // 0 기대

// ② 아이콘 단독 컨트롤 히트 44 미만 0 (sr-only 텍스트는 '보이는 글자'로 치지 않는다. hit-area 는 ::before 로 판정)
const iconOnly = el => el.querySelector('svg')
  && ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())
  && ![...el.querySelectorAll(':not(svg):not(svg *)')].some(c => c.textContent.trim() && c.getBoundingClientRect().width > 1)
const hit = el => {
  const r = el.getBoundingClientRect(), b = getComputedStyle(el, '::before')
  return el.classList.contains('hit-area')
    ? [Math.max(r.width, parseFloat(b.width) || 0), Math.max(r.height, parseFloat(b.height) || 0)]
    : [r.width, r.height]
}
;[...document.querySelectorAll('.site :is(a,button,[role=button])')]
  .filter(el => el.getClientRects().length && iconOnly(el))
  .filter(el => { const [w, h] = hit(el); return w < 44 || h < 44 }).length   // 0 기대

// ③ 현재 뷰포트의 단독 accent 아이콘(글자 색 상속 제외) — 그룹 1개 이하인지 눈으로 확인
;[...document.querySelectorAll('.site svg.lucide')].filter(s => {
  const r = s.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return false
  const c = getComputedStyle(s).color
  return c === 'rgb(8, 71, 52)' && getComputedStyle(s.parentElement).color !== c
})
```

**기준**
- **스코프·획·크기·a11y:** 홈, /product/sw, /product/hw, /product/ai-report, /pricing, /contact, /blog, /docs에서 스니펫 ①이 모든 상태에서 0이다.
- **격리:** /admin 주요 화면 5곳(대시보드, CRM 리드, 매출 장부, 블로그 편집, 견적)과 어드민 Dialog·Button·토스트의 적용 전후 픽셀 diff가 0이다. 공유 파일 커밋마다 어드민 importer 수가 적혀 있다.
- **Button 안 크기:** 공개 `<Button>` 안 svg의 렌더 폭이 기본 16, `size="icon-md"` 20, 호출부 `[&_svg]:size-6`을 준 헤더 토글 24다. button.tsx 기본 문자열의 diff가 0이고 어드민 Button 안 svg 크기는 그대로다.
- **실기기:** iPhone(iOS 17·18·26) Safari와 Windows Chrome 100%·125%(DPR1)에서 16/20/24/32를 Mac Chrome 캡처와 나란히 비교한 기록이 있다. DPR1에서 computed `--stroke-pen`이 2px이고, V6 판정과 MDN `vector-effect` 호환표 링크가 남아 있다.
- **가드:** `npm run check:design-tokens`가 통과한다(ICON_RULES는 warn 단계에서 베이스라인 이하). 로컬 더미로 확인하고 되돌린다: 공개 파일에 `<X strokeWidth={2} />`, `import { Sparkles } from "lucide-react"`, JSX 텍스트 '→'·'✦'를 넣으면 해당 규칙이 잡고, `<path strokeWidth={2}>`·`<motion.circle strokeWidth={4}>`는 잡지 않는다. error 승격 뒤에는 공개 lucide JSX의 strokeWidth·absoluteStrokeWidth가 `app/global-error.tsx`와 공유 기본값 `components/ui/dialog.tsx`(공개 획은 CSS가 덮음) 2곳뿐이다. 네 규칙 모두 warn으로 시작하고, 2주 뒤 규칙별로 error로 올린다(system §6).
- **래스터:** /product/sw를 끝까지 스크롤해도 `/images/product/sw/activity-icons/`·`tool-icons/` 요청이 0이고, 전송량이 적용 전보다 550KB 이상 줄어든다(캐시 비움).
- **번들:** /의 전 라우트 공유 JS 증가 2KB gz 이하, /product/sw 아이콘 관련 증가 8KB gz 이하. /에서 내려받은 JS에 'classin-timer' 같은 도구 글리프 이름 문자열이 없다.
- **대비·초록 규칙:** 의미·조작 아이콘에 #A39E98·green-400/500·#10B981·#34D399·금색이 0이다. 밝은 면의 #6EE7B7 아이콘과 먹 지면의 #084734 아이콘이 0이다. 375×812 각 뷰포트에서 스니펫 ③ 결과가 한 그룹 이하이고, 쓰인 곳이 활성 IconFrame·추천 Plan Check·완료 표지뿐이다. 불릿 목록에 초록 Check가 없다.
- **활성 상태:** 활성 IconFrame의 computed border-color가 rgb(8, 71, 52)이고(`.surface-ink` 안 IconFrame은 0개), 부모 컨트롤에 aria-current·aria-pressed·aria-selected 중 하나가 있다.
- **접근성:** 홈·sw·hw·pricing·contact에서 axe `svg-img-alt`·`button-name`·`link-name` 위반 0. 스니펫 ② 결과 0, 공개 Dialog 닫기 박스 44×44.
- **reduced-motion 에뮬레이션:** `.site` 안 모든 `.animate-spin`(LoaderCircle, RefreshCw, unsubscribe raw svg)의 computed animation-name이 `skeleton-blink`, iteration-count가 infinite이고 회전이 없다. `arrow-nudge` 화살표는 hover·focus에서 computed translate가 none이다.
- **화살표:** `arrow-nudge`가 없는 화살표(슬라이드 다음 등)는 움직이지 않는다. 있는 것은 hover(hover 기기)·focus-visible에서 2px 0으로 움직인다. 같은 요소에 `group-hover:translate-x-*`가 남아 있지 않다.
- **정렬:** 한 줄 라벨 행(버튼 15/600, 탭·칩 15/500 `text-ui`, 목록 16/400) 확대 캡처에서 아이콘 잉크 중심과 한글 잉크 중심의 수직 편차 0.5px 이하. 공개 아이콘의 `mt-0.5`·`mt-1`·`translate-y-[…]` 보정 0.
- **상태 점:** 상태 점은 모두 aria-hidden이고 옆에 13px 이상 텍스트가 있다. 표 열 머리·범주 라벨에 상태 점이 0이다(X11). ProblemCost ○는 꺼진 채이고 애니메이션이 없다. forced-colors 에뮬레이션에서 ●가 보인다.
- **의미 사전:** `tests/lib/icon-concepts.test.ts` 통과(별칭 값 중복 0). `lib/icon-concepts.ts`에 객체 export가 없다. 예약 항목(NotebookPen, UserCheck, Plug, Building2, Globe)은 코드 사전에 없다.
- **정직성:** 공개 코드에 rating 기본값(`?? 5`, `rating = 5`), StarRating, '별점 n점' aria-label이 0. '30+ 수업 도구' 문구가 0이고 sw 도구 목록 제목이 배열 길이에서 계산된다.
- **글리프:** ClassinBoard·ClassinSoftware가 16px 검산표의 빈틈을 지키고 카메라·다리 같은 미확인 디테일이 없다. 시안 승인본과 좌표가 같다.
- **컨테이너:** 공개 화면에서 아이콘을 감싼 bg-[#ECFDF5]·bg-[#D1FAE5]·bg-gradient-to-* 타일이 0. IconFrame은 배경 투명, 반경 8px.
- **브랜드:** `/images/logo.png`가 /admin/login에서 계속 뜬다. 차단 해제 전에는 로고·파비콘 파일 변경이 0이다.
- **품질 게이트:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` 통과. 정적 프리렌더에서 'Only plain objects can be passed to Client Components' 오류 0.
- **시안 승인:** V6, ClassinBoard·ClassinSoftware(물결·받침 선 포함), 수업 도구 26종 탈락 목록, SW 도구 목차 행, ai-report IconFrame 전후의 승인 기록이 DESIGN.md 결정 로그 절(system §10)에 있다.

---

## DESIGN.md 반영안

적용 범위 표기는 system §10을 따른다(`public(.site)` / `admin`, 토큰 상태 배지 in force / target / retired). §2 팔레트의 Green Surface 50·100과 Green Muted('아이콘' 용도 문구 포함) 수정, §5 배경 리듬, §7-6·7-7은 surfaces·controls 반영안이 고친다. 아이콘 반영안은 아래만 싣는다.

```diff
@@ §4 컴포넌트 스타일 — "### 인풋" 다음에 신설
+ ### 아이콘 — public(.site)
+
+ **라이브러리** [target]
+ - lucide-react(0.562)만 쓴다. Classin 고유 사물은 Lucide 규격으로 그려 `/*#__PURE__*/ createLucideIcon`으로 등록한다.
+   파일은 용도별: 제품 `components/icons/product-glyphs.ts` · 수업 도구 `lesson-tool-glyphs.ts` · 가이드 `guide-glyphs.ts`.
+ - 수업 도구·가이드 글리프는 사용처에서 직접 import한다(사전에서 재수출하지 않는다).
+ - 로고·제3자 브랜드 글리프(`components/auth/brand-glyphs.tsx`)는 채움형 예외다.
+ - 금지: 아이콘 폰트, PNG 아이콘, `import * as`, `lucide-react/dynamic`.
+
+ **획** [target] — V6
+ - `--stroke-pen` 1.5px 하나(DPR1 ≤1.49dppx에서 2px). 아이콘·도해 정보선·차트 비교선이 같은 펜이다. 강조선 `--stroke-accent` 2px은 도해·차트 전용.
+ - 집행: `site-base.css` base `:where(.site) svg.lucide { stroke-width: var(--stroke-pen) }` + 자식 `vector-effect: non-scaling-stroke`.
+ - 아이콘에 `strokeWidth` prop을 쓰지 않는다(global-error 예외, 공유 ui/dialog 기본값은 손대지 않는다). raw SVG 도판·차트는 대상이 아니다.
+ - 근거: Pretendard 500 16px 한글 세로획 1.49px(실측).
+
+ **크기** [target] — 반응형으로 바꾸지 않는다. 크기 토큰 없음
+
+ | 크기 | 유틸 | 쓰는 곳 |
+ |---|---|---|
+ | 16 | `size-4` | 버튼 안·인라인·칩·색인 탭·표·폼 메시지·토스트 |
+ | 20 | `size-5` | 목록 행·아이콘 단독 버튼(`icon-md` 44)·IconFrame 40 내부 |
+ | 24 | `size-6` | 헤더 메뉴/닫기 토글·IconFrame 48 내부 |
+ | 32 | `size-8` | 폼·모달 안 완료·잠금 표지, 기능 소개(페이지당 6개 이하) |
+
+ - 간격: 16→8px, 20·24→12px, 32→아래 16px.
+
+ **한글 정렬**(Pretendard 한글 잉크 중심 = 기준선 위 0.355em = 줄 상자 중심, 실측)
+ - 한 줄 행은 `items-center`, 손보정 금지. 글줄 안은 `vertical-align: calc(0.355em - 아이콘/2)`.
+ - 여러 줄은 `margin-top: calc((1lh - 아이콘)/2)`. 행간은 행 컨테이너에 둔다.
+
+ **컨테이너** [target]
+ - 기본은 없다(아이콘 + 글자 + 괘선).
+ - IconFrame: `size-10`/`size-12`, `rounded-lg`(8px), 1px `--line-hair`, 배경 투명. 활성은 테두리·아이콘 `--fg-accent` + 부모 aria 상태. hover 없음.
+ - 순서 목록은 그 페이지의 번호 체계(대개 `No. 01`), 불릿은 아이콘 없음 또는 `Check` muted, 수치에는 아이콘 없음.
+ - [retired] 민트 원·타일(#ECFDF5·#D1FAE5), 그라데이션·글래스 타일, 아이콘 그림자, OutlineIcon(r12·흰 배경).
+
+ **색** [target]
+ - 기본 상속, 단독 `text-fg-muted`(6.24:1), 내비 `text-fg-ink`, 오류 `text-fg-danger`(CircleAlert만).
+ - `--fg-accent` 아이콘은 활성 IconFrame · 추천 Plan 포함 항목 Check · 완료 표지에만, 한 뷰포트(375×812)에 한 그룹까지.
+ - `--fg-faint`(#A39E98)는 장식·비활성 전용. 먹 지면은 `.surface-ink`가 자동 전환(먹 위 #084734 아이콘 금지).
+ - fill은 Play와 커스텀 글리프의 작은 점에만. [retired] Star·별점, green-400/500·#10B981·#34D399·#1e8b58·#0E7A49·#009060, 금색.
+
+ **의미 사전**: `lib/icon-concepts.ts`(모듈 별칭)가 정본. 한 개념 = 한 글리프(테스트로 강제). 사전에 없는 개념은 글자로만.
+ - 녹화 Video · AI 리포트 FileChartColumn · 관리자 데이터 ChartColumn · 전자칠판 ClassinBoard · 소프트웨어 ClassinSoftware
+ - 카메라 Webcam · 판서 PenLine · 교안 Layers · LMS ClipboardCheck · 쇼룸·위치 MapPin · 상담 MessageSquare
+ - 자료 FileText · 다운로드 Download · 보안 ShieldCheck · 동기화 RefreshCw · HW 설치 Wrench · 속도 Gauge
+ - AI는 아이콘 없이 'AI' 글자(`tracking-abbr`). [retired] Sparkles, Zap, Star, PenTool, Presentation, MonitorSpeaker, FileCheck2, Globe2, ExternalLink, 레거시 별칭(Loader2·CheckCircle2·AlertTriangle·AlertCircle·BarChart3·HelpCircle·Clock3).
+
+ **커스텀 글리프 규격**: 24×24, 잉크 중심 (12,12)±0.5, 0.5 그리드, round cap·join, rx 2(8단위 이상)/1, 요소 6개 이하.
+ 16px 기준 평행 획 중심 간격 4.5단위 이상·바깥선 사이 2.25단위 이상. 요소별 strokeWidth 금지, 채움은 지름 3 이하 점만. 미확인 실물 디테일 금지.
+
+ **상태 점** [target] (`.status-dot`)
+ - ● 켜짐 7px `--fg-accent` · ○ 꺼짐 `--stroke-pen` 테두리 `--line-control` · – 해당 없음 7×`--stroke-pen` `--line-control`.
+ - 항상 텍스트와 함께, 점은 aria-hidden. 상태 전용(라벨·열 이름 금지). 비상호작용 pill을 대체한다(V9-A).
+
+ **움직임**
+ - 화살표: `arrow-nudge`(controls) 옵트인, hover·focus-visible 2px, 160ms `--ease-soft`.
+ - 스피너는 화면에 1개. reduced에서 `.site` 안 모든 `.animate-spin`은 opacity 1↔.4 1.6s 점멸(X08).
+
+ **격리·접근성**
+ - 아이콘 전역 규칙은 `:where(.site)`에서만. 공유 컴포넌트는 기본 문자열을 바꾸지 않고 `[.site_&]:` 변형·새 size(`icon-md`)로만 공개 화면을 바꾼다(C17).
+ - 장식은 aria-hidden, 의미는 `role="img"` + `aria-label`(`<Icon label>`). 아이콘 단독 컨트롤은 박스 44×44, 접근 이름은 컨트롤에.
+ - 서버 → 클라이언트로 아이콘 컴포넌트 참조를 넘기지 않는다(렌더된 요소나 개념 키).
+
+ **브랜드 마크** [target · 차단] 단색 `ClassinLogo`(currentColor)는 벡터 원본·변형 허용·단색화 승인 뒤. theme-color `#FAFAF8`, manifest 없음(C27).

@@ §6 접근성 — 추가
+ - 의미·조작 아이콘과 비텍스트 표지는 3:1 이상: 아이콘 `#615D59` 이상, ○·– 점과 외곽선 있는 아이콘 버튼은 `#8F8A84`(3.27:1). `#A39E98`(2.54:1)은 장식 전용.
+ - 아이콘 단독 버튼·링크: 접근 이름은 `aria-label`, 박스 44×44px 이상.
+ - 상태는 색만으로 구분하지 않는다: 모양 점(● ○ –)·텍스트·테두리 변화(hair → #084734)와 aria 상태.

@@ §7 AI 에이전트 프롬프트 가이드 — 끝에 추가(번호는 병합 시 이어 붙인다)
+ - 아이콘: lucide와 `lib/icon-concepts.ts`의 개념 별칭만. `<Icon icon size={16|20|24|32}>`, strokeWidth prop·격자 밖 크기 금지.
+ - 아이콘에 타일·채움 원·그라데이션을 씌우지 않는다. 필요하면 IconFrame(아웃라인). 순서는 번호, 수치는 숫자만, AI는 'AI' 글자.
+ - 이모지와 글자 기호(✕ ✦ ✓ ✗ ★ ⚠ →), Sparkles는 공개 화면에서 금지.
+ - 사전에 없는 개념에는 아이콘을 만들지 않는다. 새 개념은 먼저 사전에 등록하고, 커스텀 글리프는 `/*#__PURE__*/ createLucideIcon`으로 용도별 파일에.

@@ 결정 로그(system §10 신설 절) — 행 추가
+ | V6 | 아이콘·도해·차트 비교선 획 | A: --stroke-pen 1.5px, DPR1 2px 켬 | YYYY-MM-DD | 시안 ⑥ 캡처 경로 |
```

---

## 하지 말 것

- `strokeWidth` prop·`stroke-*` 클래스·`absoluteStrokeWidth`(global-error 예외, 공유 ui/dialog 기본값은 유지), 크기별 획 분기(32px만 1.75 등)
- `--icon-*`·`--dot-*` 토큰, `size-icon-*` 유틸, 16/20/24/32 밖의 아이콘 크기
- `.surface-ink` 블록이나 `--fg-*`·`--line-*`를 이 스펙·다른 파일에서 다시 선언하기(C01, tokens.css 한 곳)
- var() 폴백값(`var(--motion-fast, 160ms)` 등, X01)
- 민트·그라데이션·글래스 타일, 채운 원, 아이콘 그림자, IconFrame 채움·hover
- 이모지와 글자 기호(✕ ✦ ✓ ✗ ★ ⚠ →), Sparkles, 4점 반짝이 마크
- 수치·인용·순서 목록·카드 머리띠·헤딩 앞의 장식 아이콘, 줄줄이 선 초록 체크, 모든 Plan의 초록 Check
- 홈 탭에 번호 붙이기, 페이지에 세 번째 번호 체계 만들기(C24)
- 상태 점을 라벨·열 이름·범주로 쓰기, 상태 점 깜빡이기
- 퇴역 글리프와 레거시 별칭, 한 글리프로 두 개념, 사전에 없는 개념을 아이콘으로 '그럴듯하게' 채우기
- 의미 아이콘에 #A39E98·green-400/500·#10B981·#34D399·금색, 먹 위 #084734 아이콘, 밝은 면 #6EE7B7 아이콘, hex→hex 기계 치환
- hair·strong 테두리 차이만으로 활성 표시
- `aria-label={maybeUndefined}`, role 없는 aria-label svg
- `mt-0.5`, `translate-y-[-1px]` 손 정렬 보정, 형제 `<p>`에만 행간 두기
- 아이콘 hover scale·회전·ping·bob, reduced에서 멈춘 스피너, `!important` 없는 reduced 스피너 규칙
- `[data-nudge]` 같은 별도 화살표 규칙(→ `arrow-nudge`), 같은 화살표에 `group-hover:translate-x-*` 병행
- 사전 객체(`ICON = {…}`), PURE 없는 `createLucideIcon`, 서버에서 클라이언트로 컴포넌트 참조 넘기기
- 공유 컴포넌트(dialog·button·toast)의 기본값을 공개 화면용으로 바꾸기
- 지어낸 평점(`?? 5`), 출처 없는 '30+', 실물 미확인 글리프 디테일, 로고 PNG 손 트레이싱
- `/images/logo.png` 삭제(/admin/login이 쓴다)
- 가드에 TypeScript AST 검사 추가(system §6: 정규식 + 베이스라인)

---

## 열린 질문

1. **V6 확인:** 기본안 A(1.5px, DPR1 2px)를 적용해 두었습니다. DPR1 화면에서 16·20px 아이콘은 지금(1.33·1.67px)보다 약간 굵어지고 24px은 지금과 같습니다. 시안 ⑥ 캡처를 보고 A를 확정할지, 16px 인라인이 흐리면 B(1.75px)로 바꿀지 정해 주세요. 값 1줄입니다. 함께 정본 정정을 요청합니다: C11 근거와 V6 기본값 문구의 'DPR1 사용자 변화 0'은 24px에만 맞으므로 '16·20px은 약간 굵어짐'을 더해 주세요(결정 값은 그대로).
2. **브랜드 마크(차단):** 로고 SVG 원본이 저장소에 없습니다(PNG뿐). 브랜드팀이 벡터 원본을 줄 수 있는지, ClassIn 글로벌 브랜드 가이드가 에메랄드(#00A070) → UI 그린(#084734) 단색 변형을 허용하는지 확인이 필요합니다. 그 전까지 로고·파비콘 작업은 멈춰 있습니다.
3. **ClassinBoard 실루엣:** 카메라와 다리를 빼고 '패널 + 받침 선'으로 그렸습니다. 실제 대표 제품이 벽걸이형인지 스탠드형인지 HW팀 확인이 필요합니다. 맞지 않으면 받침 선도 뺍니다.
4. **ClassIn AI 마크:** 단색(currentColor)·별 하나로 바꿉니다. 챗봇 인지에 영향이 있을 수 있어 운영자 승인이 필요합니다.
5. **푸터 SNS:** 지금 푸터에는 SNS 링크가 없습니다. 네이버 블로그·카카오 채널·유튜브 링크를 둘지 정해 주시면, 두기로 할 때 단색 글리프 3종을 등록합니다(controls §3.6과 함께).
6. **PNG 생성 파이프라인:** `scripts/generate-sw-tool-icons.mjs`와 `scripts/assets/sw-tool-icons-raw`를 tool-icons PNG와 함께 지울까요?
7. **reduced 스피너의 `!important`(정본 정정 요청):** `globals.css:909-916`의 전역 블록(`*{animation-duration:0.001ms !important; animation-iteration-count:1 !important}`) 때문에 `!important`가 있어야 동작합니다 [코드]. X08과 css_architecture (c)④의 문안을 `animation:skeleton-blink 1.6s ease-in-out infinite !important`로 고쳐 주세요(system 담당). 전역 reduced 블록을 레이어로 옮길 계획이 있으면 이 규칙과 함께 옮겨야 합니다.
8. **`border-fg-accent`(정본 정정 요청, 저위험):** 활성 IconFrame이 쓰는 `border-fg-accent`는 C02 유틸 목록(`border-/divide-line-*`)에 없습니다. 1:1 매핑으로 생성되고 가드 정규식에도 맞아 위반은 아니지만, C02 목록에 `border-fg-accent`를 추가해 두기를 요청합니다.
