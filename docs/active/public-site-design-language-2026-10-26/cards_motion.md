# 카드·배경 애니메이션 (cards_motion) — 최종 스펙 v3

> **방향** 「편집 지면 · OS판」 · **기준** HEAD `4c9e509c`(2026-10-26) · **정본** canonical C01–C28·X01–X16, naming, css_architecture, system 스펙(시스템 기반)
> **결정 번호** 방향 문서 결정은 V1–V9, 감사·모션 플랜 문서(`docs/active/public-site-audit-motion-plan-2026-10-26.md` §4) 결정은 '감사 D#'로 적는다(C03).
> **이 스펙이 적용한 기본안** V3-A(Hero 지면 표지) · V4-A(먹 서사 1곳 + 정성 장부) · V5-A(FinalCTA sunken 띠) · V6-A(획 1.5px, DPR1 2px) · V7-A(배경·카드 정지) · V9-A(Hero 배지 → Kicker). V2-A(인용 Pretendard 500)는 인용 카드에 반영했다.
> **행 번호** `app/globals.css`는 HEAD 기준이다(다른 세션이 작업 트리를 고치는 중이라 작업 트리에서는 약 8행 밀린다). 나머지 파일은 작업 트리와 HEAD가 같다.

## 0. 요약

카드와 섹션 배경은 움직이지 않는다. 지면은 종이처럼 평면이고, 카드 그림자는 0, 반경은 8·12 두 값뿐이다. 움직임은 모두 **투명도**이고, 홈의 서사 모먼트는 5개다(상한 6, 6번째 슬롯은 출처 있는 수치를 정적 값으로 둘 자리).

- **카드·블록 8종**: 인덱스 · 수치 · 인용 · 사례 · 요금 · 목차 행 · Frame(imagery 소유, 참조) · CTA 띠. 링크인 카드·목차 행·FAQ 행의 hover·focus-within은 **경계 hair→strong + 화살표 2px** 두 가지뿐이다(C13). 제목 색·밑줄·먹선·배경·그림자·카드 이동은 바뀌지 않는다.
- **홈 서사 모먼트 5개**(`data-moment`, C08): ① Hero 잉크 밑줄 색 페이드 ② Manifesto 스크럽 ③ SolutionOverview ●점등 ④ DashboardPreview 차트 opacity 순차 ⑤ Comparison 행 액센트.
- **홈 무한 루프 0, 자동 진행 0**(C07). Hero 영상 없음(V3-A), LogoBar 정적 목록(X16), SolutionOverview 수동 탭, CaseStudies 수동 캐러셀.
- **stroke-dashoffset·`.draw-path` 사이트 전체 0**(C06). 장 머리 괘선은 정적이다(X04). 카운트업 0(C08).
- **이 스펙이 새로 만드는 토큰은 0개다.** 모션 토큰은 `app/styles/tokens.css`(X13), 모션 무장 CSS는 `app/styles/site-base.css`의 `@layer components` 안 `prefers-reduced-motion: no-preference` 블록 하나에 둔다(css_architecture).
- 공유 `components/ui/card.tsx`의 기본 출력은 바꾸지 않는다(C17·X05). 공개 화면은 명시한 `family`로만 새 모양을 받는다.

---

## 1. 원칙

1. **카드와 배경은 정지한다.** 섹션 배경 처리는 plain 한 가지이고(C19), 모눈은 도해 figure 자체의 정지 배경(`pattern-grid`, 페이지당 1개)뿐이다. 카드 안에도 루프·스윕·빛·카운터가 없다(V7-A).
2. **위계는 선의 농도와 글자로 만든다.** 1px `--line-hair`(.08) → `--line-strong`(.16) → `--line-ink`. 먹선은 닫힌 목록 5곳에만 쓴다(X04, §3-0). 번호는 한 페이지 2종 이하(C24)이고, 홈은 Act 폴리오 01–06만 쓴다.
3. **움직임은 투명도다.** 움직이는 속성은 opacity가 기본이다. 예외는 셋으로 닫는다: Reveal의 translateY(≤12px, 2D), 사례 캐러셀의 translateX(조작 전환), 잉크 밑줄의 `text-decoration-color`(C25). scale·회전·dashoffset·그림자·filter 애니메이션은 0이다.
4. **보이는 상태가 기본이다.** SSR·JS 없음·동작 줄이기에서는 처음부터 완성 상태다. 미완 상태는 JS가 "아직 화면 밖"이라고 확인한 요소의 `[data-reveal="out"]`에서만, 그것도 `prefers-reduced-motion: no-preference` 안에서만 무장한다(X07).
5. **한 번이고, 사람이 넘긴다.** 서사 모먼트는 1회다. 자동 진행·자동 넘김·마키는 없다. 탭과 캐러셀은 조작 전환만 있다(C07).
6. **hover는 보조 신호다.** 끝 상태는 경계 한 단계 + 화살표 2px이다. 상태 전달의 책임은 전역 focus outline(2px `--fg-accent`)이 진다(C13).
7. **정직하다.** 근거 없는 수치는 지면에 없다(ProblemCost 수치 0, 카운트업 0). 목업은 Frame 안 점선 태그 '예시 화면'으로, 사진은 출처 라벨로 표시한다(C05·X11).

---

## 2. 토큰 (CSS + Tailwind @theme)

### 2-1. 소비하는 토큰 — 정의는 `app/styles/tokens.css` 한 곳(X13)

토큰의 값과 선언은 `app/styles/tokens.css`(`:root`·미디어 재정의·`.surface-ink`·`@theme inline`) 한 곳에만 있다(X01·X13·C01·C02, css_architecture). 이 스펙은 블록을 옮겨 적지 않고 이름만 참조한다. 이 스펙이나 다른 파일에서 다시 선언하지 않는다(가드: tokens.css 밖의 `--(surface|fg|line)-` 선언 금지).

- 시간: `--motion-fast`(hover 경계·화살표, index-tab 막대, 링크 색) · `--motion-base`(탭 패널 교체, 사례 캐러셀 이동, os-node 현재 열 윤곽) · `--motion-slow`(Reveal, 잉크 밑줄, ●점등, 차트 레이어, 행 액센트) · `--motion-rise`(Reveal 이동 상한) · `--motion-stagger`(●점등 노드 간격 전용, X07). reduced 재정의도 tokens.css 몫이다.
- 곡선: `--ease-soft`만 쓴다. Manifesto 스크럽은 `linear`라 `--ease-drift`는 소비하지 않는다.
- 색·선·획: `--surface-paper|sheet|sunken`, `--fg-ink|body|muted|accent`, `--line-hair|strong|ink|control`, `--stroke-pen|accent`. 먹 지면 재정의는 C01 블록을 따른다.

### 2-2. Tailwind 4 유틸

`@theme inline` 매핑도 tokens.css 정본이다(C02, naming 1·2). 이 스펙이 쓰는 결과 유틸: `ease-soft`, `bg-surface-paper|sheet|sunken`, `text-fg-*`, `border-/divide-line-hair|strong|ink|control`, `aspect-case|screen|portrait`, `max-w-deck|page`. `--color-surface-ink`는 매핑되지 않는다.

**쓰는 법**
- 시간과 곡선: `transition-colors duration-(--motion-fast) ease-soft`. 리터럴 `duration-200`·`duration-[400ms]`는 쓰지 않는다.
- 색: `bg-surface-sheet` · `text-fg-body` · `border-line-hair` · `hover:border-line-strong` · `divide-line-hair`. 먹 지면은 `surface-ink` 클래스(또는 `Section surface="ink"`)로만 칠한다. `bg-surface-ink`·`bg-[#111110]`·`text-(--fg-*)`는 없다(C02).
- 비율: 사례 사진 `aspect-case`, 화면 캡처 `aspect-screen`(X06).
- 반경: `rounded-lg`(8) · `rounded-xl`(12)만. `rounded-2xl` 이상과 `rounded-[≥16px]`는 가드가 막는다(C09).
- 그림자: 카드·Frame·표·섹션 0. 떠 있는 레이어만 `shadow-deep`(X05).

### 2-3. 이 스펙이 소유하는 CSS 이름 (site-base.css `@layer components`)

| 이름 | 종류 | 용도 |
|---|---|---|
| `.os-node` | 컴포넌트 클래스 | 수업 OS 지도 노드(윤곽 박스 + 현재 열 액센트 윤곽) |
| `.row-accent` | 컴포넌트 클래스 | Comparison Classin 열 셀의 좌측 2px 바(C21 ①) |
| `.case-slide`, `.case-body` | 컴포넌트 클래스 | 사례 캐러셀 슬라이드와 숨김 대상 본문(X06) |
| `@keyframes ink-fade` · `panel-in` · `scrub-in` | 키프레임 | 잉크 밑줄 색 페이드, 탭 패널 교체, Manifesto 스크럽 |
| 모션 무장 블록 | `@media (prefers-reduced-motion: no-preference)` | Reveal·잉크 밑줄·●점등·`[data-seq]`·행 액센트·탭 패널·스크럽(§3-14) |

**만들지 않는 것**: `--motion-story`·`--motion-progress`·`--motion-carousel`(소비처 0, X13), `--masthead-pt`(X04), `.on-ink`(C01), `.card-title`·`.card-band`·`.stagger`(C13·X07), `.draw-path`(C06), `.progress-track/.progress-rule`·`.autoplay-toggle`(C07·C12), `.masthead--draw`(X04), `.state-dot`(→ icons `status-dot`), `lib/motion.ts`(홈 framer 소비처 0, YAGNI), `usePauseWhenHidden`(홈 자동 진행·영상 0. 제품 영상 정지 장치는 imagery 소관).

`cn()` 병합 설정(15종 text 토큰 등)은 `lib/utils.ts` 한 곳에서 system 스펙이 소유한다(C18, naming 5). 이 스펙은 따로 목록을 두지 않는다.

---

## 3. 패턴과 값 (데스크톱 / 모바일)

### 3-0. 카드 공통 상태 (C13)

| 상태 | 경계 | 화살표(`ArrowRight` 16, `arrow-nudge`) | 바뀌지 않는 것 |
|---|---|---|---|
| rest | `--line-hair`(TocRow·FAQ 행은 위 테두리) | `--fg-muted`, 0 | — |
| hover (Tailwind v4 `hover:` = `@media (hover:hover)`) | `--line-strong`, `--motion-fast` 160ms `--ease-soft` | translateX(2px), 160ms | 제목 색, 밑줄, 배경, 그림자, 카드 위치·크기 |
| focus-within / focus-visible | `--line-strong` + 전역 outline 2px `var(--fg-accent)`, offset 2px(site-base 보증 ①) | 2px | 카드별 `ring-*` 금지 |
| pressed(`:active`) | `--line-strong`, `duration-0` | — | `active:scale-*`(버튼 `.97`만 controls 소관) |
| 정보 카드(링크 없음) | 변화 0 | 없음 | 전부 |

- 링크인 카드는 루트 자체가 `<a>`(`Link`)다. `arrow-nudge`(controls 유틸)는 조상 `a`·`button`의 hover·focus-visible에 반응하므로 루트가 링크여야 동작한다.
- `--line-ink`는 hover에 쓰지 않는다. **먹선 닫힌 목록 5곳**(X04): Act·장 머리 괘선(`masthead`) · 표 상단 · 숫자 열이 있는 장부의 합계 이중선 · CTA 띠 `rule-double` 윗선 · 추천 Plan 테두리.
- **의미 있는 좌측 2px 바 3곳**(C21): Comparison Classin 열 셀(`.row-accent`) · /pricing 선택 가이드가 고른 비교 행 · 세로 목차의 현재 항목. 장식용 좌측 컬러 바와 토스트 상태선은 없다.

### 3-1. 요약표

| # | 패밀리 | 면 | 테두리 | 반경 | 패딩 데스크톱 / 모바일 | 제목 | 본문·보조 | 상호작용 | 모션 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 인덱스 | sheet | 1px hair | 8 | 24 / 20(머리띠가 있으면 위 14) | `text-h3` | `text-body` `--fg-body` | 링크일 때만 | 섹션 Reveal 1개(자식 순차 없음) |
| 2 | 수치(Stat) | 없음 | 위 1px strong | — | 위 16 | `text-numeral` tabular | 라벨 `text-caption` 500, 출처 `text-note` `--fg-muted` | 없음 | 정지. SSR 값, 카운트업 0 |
| 3 | 인용 | 없음 | 위 1px hair | — | 위아래 24 | `text-quote` 500 | 바이라인 `text-caption` | 없음 | 정지 |
| 4 | 사례 | sheet | 1px hair | 12 | 본문 24 / 20 | `text-h3` | `text-body` + dl 사실 3칸 | 캐러셀 조작 | transform·opacity 320ms(조작 전환) |
| 5 | 요금(Plan) | sheet | 1px hair, 추천은 1px ink + '추천' 탭 | 12 | 28 / 24 | `text-h3` | 가격 `text-h1` 700 tabular | 링크·버튼 | 정지 |
| 6 | 목차 행 | 없음 | 위 1px hair | — | 열 56px·위아래 20 / 열 40px·위아래 16 | `text-body-l` 600 `leading-snug` | `text-caption` `--fg-muted` | 행 전체 링크 | hover 경계 160ms |
| 7 | Frame | sheet | 1px hair | 8 | 도판 + 캡션(제목줄 없음) | — | 캡션 13 `--fg-muted` | 없음 | 정지(안쪽 차트만 ④) |
| 8 | CTA 띠 | sunken(마지막) / paper(중간) | `rule-double`(마지막) / 위아래 hair(중간) | — | §3-10 | `text-h1`(마지막 h2) / 덱 1줄(중간) | `text-body-l` `--fg-body` | 버튼 | 정지(화살표 2px만) |

**글자 크기**: 임의 px(`text-[13px]` 등)는 쓰지 않는다. 13px는 `text-note`(400)·`text-label`(600)·`text-folio`(500), 14px는 `text-caption`, 15px `text-ui`는 컨트롤(버튼·탭·칩) 전용이라 카드·본문에는 쓰지 않는다(C18).

### 3-2. 인덱스 카드

```tsx
// 정보 카드
<Card family="index">
  {(category || folio || Icon) && (
    <div className="-mt-1.5 mb-4 flex items-center justify-between gap-3 border-b border-line-hair pb-3 sm:-mt-2.5">
      {folio
        ? <span className="text-folio tabular-nums text-fg-muted">No. {folio}</span>
        : category && <span className="text-label text-fg-accent">{category}</span>}
      {Icon && <Icon aria-hidden className="size-5 text-fg-muted" />}
    </div>
  )}
  <h3 className="text-h3 text-fg-ink">{title}</h3>
  <p className="mt-2 text-body text-fg-body">{body}</p>
</Card>

// 링크 카드 — 루트가 Link
<Link href={href} data-card="index" className={cardVariants({ family: "index", interactive: true })}>
  …같은 내용…
  <ArrowRight aria-hidden className="arrow-nudge mt-4 size-4 text-fg-muted" />
</Link>
```

- **머리띠 여백**: 카드 위 패딩 20/24에서 음수 마진(−6/−10px)으로 위 14px을 맞춘다.
- **번호 'No. 01'**: 순서가 실제로 있는 묶음(수업 전·중·후, 도입·온보딩 단계)에만 쓴다. 병렬 카드는 오른쪽 범주 `text-label text-fg-accent`(13/600, 바 없음 — Kicker 아님, X15)이거나, 범주가 없으면 머리띠 없이 제목부터 시작한다. 홈에는 순서 있는 카드 묶음이 없으므로 홈의 번호 체계는 Act 폴리오 1종이다(C24).
- **아이콘**: 머리띠 오른쪽 `size-5`(20) `--fg-muted` 1개까지. 민트·그라데이션 타일은 없다. 강조 아이콘(#084734)은 한 뷰포트에 1그룹까지(C11).
- **배치**
  - 기본: `grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3`. Reveal 1개로 그리드 컨테이너를 감싼다. 카드마다 감싸지 않고, 자식 순차 페이드는 없다(X07).
  - 헤어라인 변형: 바깥 `grid overflow-hidden rounded-lg border border-line-hair bg-surface-sheet divide-y divide-line-hair sm:grid-cols-3 sm:divide-y-0 sm:divide-x`, 셀 `p-5 sm:p-6`(Card 아님, `data-card` 없음). 셀 사이 선은 divide 유틸로 긋고 `bg-line-*`는 쓰지 않는다(C02 어휘). 셀은 3개 이하(한 줄)일 때만 쓰고, 바깥이 paper·sunken 위에 있을 때만 쓴다.

### 3-3. 수치(Stat) — 박스 없음

- 한 칸: ① 위 1px `--line-strong` ② 16px ③ `Numeral factId=…`(typography, `text-numeral` 600 tabular) + 단위 ④ 라벨 `text-caption font-medium text-fg-body` ⑤ 출처 `text-note text-fg-muted` — `{source.name} · {asOf} 기준`.
- **값의 출처는 `lib/facts.ts`뿐이다**(system §7). Numeral은 `factId`만 받고 숫자 prop은 받지 않는다. 등록되지 않은 수치(감사 D3·D5: ProblemCost 4종, HW 12개국·1,200+ 등)는 칸째 빠진다.
- 데스크톱: 3~4칸, 둘째 칸부터 `border-l border-line-hair pl-6`. 모바일(`< 40rem`): 2열, 세로선 없음, 행 간격 24.
- 카운트업은 사이트 전체 0이다(C08). 예외가 없다.
- 예시 수치(목업 KPI)는 이 패밀리가 아니다. Frame(mock) 안의 목업 UI로만 그리고 같은 줄에 '예시'(14/600 `--fg-ink`)를 붙인다(X11).

### 3-4. 인용(Quote) — 박스 없음

- 바깥: `columns-[2_22rem] gap-x-14 [column-rule:1px_solid_var(--line-hair)]`. 모바일은 1단(22rem 미만이면 자동 1단).
- figure: `break-inside-avoid border-t border-line-hair py-6`.
- 인용문: `text-quote text-fg-ink`(Pretendard 500, V2-A). 여는 따옴표 “만 `text-fg-accent`.
- 바이라인: 24px 폭 1px 막대 `<span aria-hidden class="block w-6 border-t border-line-strong">`(`bg-line-*` 아님, C02) → 이름 `text-caption font-semibold text-fg-ink` → 소속 `text-caption text-fg-muted`.
- 제한: 섹션당 6개, 인용 하나 120자 이하. 별점·금색·박스·그림자는 없다. 실명 표기는 감사 D4(공개 동의 범위)를 따른다.

### 3-5. 사례(Case)

- **루트**: `<Card family="case">` → `rounded-xl overflow-hidden border border-line-hair bg-surface-sheet text-fg-ink` + `data-card="case"`.
- **사진**: `relative aspect-case`(3:2, X06), `next/image fill`, `sizes="(width >= 48rem) 480px, 82vw"`, `unoptimized` 삭제, hover scale 0, 테두리는 `fig-edge`(imagery).
  - 출처: imagery `FigureSource`가 필수다(X10·X11). 실제 사진은 `사진 · {credit}`(credit 필수, '○○' 금지), 화면이면 capture 라벨. 캡션은 사진 바로 아래 C05 캡션 문법(12px → 1px hair → 8px, 오른쪽 라벨 `text-note text-fg-muted`)을 카드 본문 첫 줄로 둔다.
  - 출처·동의(감사 D4)가 확인되지 않은 컷은 **사진 없이** 간다(imagery와 같은 기본). 사진 칸이 없는 사례 카드는 본문만 렌더한다.
- **본문** `case-body p-5 sm:p-6`
  1. 지역·과목: `text-label text-fg-accent`(바 없음, Kicker 아님 — X15). `ui/badge`는 import하지 않는다.
  2. 이름 `text-h3`. 마스킹 표기는 그대로.
  3. 과제·변화 두 문단: 각 문단 앞에 `text-label text-fg-ink` 라벨, 본문 `text-body text-fg-body`(기존 `challenge`·`result`).
  4. dl 사실 3칸: 지역(`badge` 필드) · 유형(`meta` 첫 절) · 운영(`meta` 둘째 절). 쉼표가 없으면 2칸. 성과 수치 칸 금지.
     - `mt-5 grid grid-cols-3 border-t border-line-hair pt-4`, 둘째 칸부터 `border-l border-line-hair pl-4`
     - dt `text-note text-fg-muted`, dd `mt-1 text-body font-semibold text-fg-ink`
  5. PullQuote 소형(기존 `quote`·`attribution`).
- **캐러셀**(X06, 수동 전용)
  - 슬라이드 상태는 `data-pos="active|near|far"`로 준다(인라인 opacity를 쓰지 않는다 — SSR 인라인 `opacity:0` 0건 기준).
  - active: opacity 1. near(이웃 1칸): opacity .72, `.case-body` opacity 0(사진과 제목만), 안쪽 래퍼 `inert`. far: opacity 0, `pointer-events: none`(X06). 이 스펙은 far 안쪽 래퍼에도 `inert`를 건다 — X06에 없는 **보강**으로, 투명한 슬라이드를 보조기기가 읽지 않게 하려는 것이다(열린 질문 7에서 X06 문구 보강 요청).
  - 이동: transform `--motion-base` 320ms `--ease-soft`, scale 0, 자동 넘김 0.
  - 슬라이드 폭 `min(82vw, 480px)`, 간격 24px. 캐러셀 컨테이너에 `isolate`(인라인 zIndex가 바깥 스택으로 새지 않게).
  - 키보드·보조기기 경로는 기존 이전·다음 버튼과 점 버튼이고, 이웃 슬라이드 클릭은 포인터 지름길이다.

### 3-6. 요금(Plan)

- 루트: `<Card family="plan" featured?>` → `relative rounded-xl border border-line-hair bg-surface-sheet p-6 sm:p-7`.
- **추천**(C21): 테두리 1px `--line-ink` + 상단 '추천' 탭 `absolute -top-[0.7em] left-5 px-2 text-label text-fg-ink` + 탭 배경 = 섹션 바닥색(`bg-surface-paper` 또는 `bg-surface-sunken`). 카드에 좌측 바·채움·ring·scale·테두리 빛은 없다(V7-A).
- 가격: `text-h1 font-bold tabular-nums`, 단위 `text-caption text-fg-muted`. 결제 플래그 OFF면 USD를 노출하지 않는다(감사 D6).
- 포함 항목: `mt-6 divide-y divide-line-hair border-t border-line-hair`, 행 `flex gap-2.5 py-3 text-body text-fg-body`, `Check` `size-4`. **추천 Plan의 Check만 `text-fg-accent`, 나머지 Plan은 `text-fg-muted`**(C11).

### 3-7. 목차 행(TocRow) — 신규 `components/ui/toc-row.tsx`

소비처: docs, updates, events, resources, 온보딩 단계 목록. FAQ 행(`details`)은 controls 소관이지만 hover 문법은 같다(C13).

```tsx
<Link href={href} data-card="toc"
  className="group grid min-h-16 grid-cols-[40px_1fr_auto] gap-x-3 border-t border-line-hair py-4
    transition-colors duration-(--motion-fast) ease-soft
    hover:border-line-strong focus-visible:border-line-strong active:border-line-strong active:duration-0
    sm:grid-cols-[56px_1fr_auto] sm:gap-x-4 sm:py-5">
  <span className="pt-0.5 text-folio tabular-nums text-fg-muted">{folio /* 01 또는 formatDate(d,'meta') */}</span>
  <span className="min-w-0">
    <span className="block text-body-l font-semibold leading-snug text-fg-ink">{title}</span>
    <span className="mt-1 block text-caption text-fg-muted">{meta}</span>
  </span>
  <ArrowRight aria-hidden className="arrow-nudge mt-1 size-4 text-fg-muted" />
</Link>
```

- 목록의 마지막 행에 `border-b border-line-hair`를 붙인다.
- 폴리오 열(01 또는 날짜)은 페이지 번호 체계 1종으로 센다(C24). 날짜는 `lib/format.ts` `formatDate(d,'meta')`(system §8).
- 썸네일 변형: 셋째 열을 사진 `aspect-case` / 화면 `aspect-screen` 이미지로 바꾼다. 폭 96px(모바일) / 160px(≥40rem).
- 먹선 `::before`, 제목 색 변화, 제목 밑줄은 없다(C13).

### 3-8. Frame — imagery 소유(`components/ui/figure.tsx`, X10)

이 스펙은 카드 계열과의 관계만 적는다. 규격의 정본은 imagery다.

- sheet + 1px hair + r8 + `overflow-hidden isolate`, 제목줄 없음, 그림자 0(X05). Card가 아니다(`family="frame"` 없음).
- 목업(mock)은 Frame 안 오른쪽 위 점선 태그 '예시 화면'(C05), 실제 화면은 캡션 '실제 화면 · YYYY.MM 캡처'.
- 섹션당 1개. 탭 패널마다 Frame이 있는 섹션(KeyUseCases)은 **활성 패널에만 Frame을 렌더**해 HTML 안 Frame 수를 1로 둔다(§3-15).
- 카드·Frame 자체는 움직이지 않는다. 안쪽 차트의 `[data-seq]` 순차만 ④ 모먼트다.
- 도해(수업 OS 지도)는 화면이 아니므로 Frame 대신 `<figure>` + 캡션을 쓴다.

### 3-9. 상태 점 ○ ● – — icons 소유(`status-dot`)

- 상태에만 쓴다: `data-state="off"` ○ 꺼짐·미해결 / 기본 ● 켜짐·진행 중 / `data-state="na"` – 해당 없음.
- 항상 13px 이상의 텍스트 라벨과 함께 쓰고, 점 자체는 `aria-hidden`이다(1.4.1).
- 라벨·불릿·로고 장식·'예시' 표기에는 쓰지 않는다(C05).
- 이 스펙에서 쓰는 곳: ProblemCost ○ 6개(끝까지 꺼짐), 수업 OS 지도 ● 6개(③ 점등), ai-report '자동 녹화', 행사 '모집 중'.

### 3-10. CTA 띠

**마지막 띠 — FinalCTA (V5-A)**
- `Section surface="sunken" rhythm="act"`. 먹 Footer와 분리한다.
- 안쪽 첫 요소 `rule-double`(surfaces 유틸: 1px 먹 + 3px + 1px hair) → `pt-6 md:pt-8`.
- 제목 `<h2 className="text-h1 text-fg-ink">`(32→48/700, C10. Display 아님) → 덱 `mt-4 max-w-deck text-body-l text-fg-body` → 행동 `mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6`.
- 버튼: `<Button size="cta">`(default, 52px, C15) + ghost 텍스트 링크(X03). 모바일(`< 40rem`)에서 primary는 폭 전체.
- 글로우·블롭·노이즈·그라데이션·고스트 글래스 버튼·ping·`hover:scale`은 없다. 화살표 2px만 움직인다.

**중간 띠 ×2** (홈 KeyUseCases 뒤, TestimonialWall 뒤 — C19 paper)
- `Section surface="paper" rhythm="band"` 안 `border-y border-line-hair py-6 sm:py-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`.
- 덱 `text-body-l text-fg-body` 한 줄.
- `<Button variant="line" size="cta">쇼룸에서 직접 보기</Button>`(C15 중간 띠 = line cta) — `TrackedLink ctaId="home_mid_showroom"`.

### 3-11. `components/ui/card.tsx` — 기본 출력 불변 + 공개 family

공개 소비처는 CaseStudies·KeyUseCases·contact 3곳이고, CheckoutSuccessClient·CheckoutFailClient는 `/checkout`(isInternalPath, `.site` 밖)이다. 공유 컴포넌트 기본값은 바꾸지 않는다(C17·X05). 그래서 `family` 기본값은 현행 문자열을 그대로 담은 `legacy`다.

```tsx
import { cva, type VariantProps } from "class-variance-authority"

export const cardVariants = cva("", {
  variants: {
    family: {
      // 현행 출력 그대로(어드민·checkout·미이관 소비처). 문자열을 바꾸지 않는다.
      legacy: "rounded-xl border border-black/[0.08] bg-white text-[#111110] shadow-[rgba(0,0,0,0.04)_0px_4px_18px,rgba(0,0,0,0.027)_0px_2px_7.8px,rgba(0,0,0,0.02)_0px_0.8px_2.9px,rgba(0,0,0,0.01)_0px_0.175px_1px]",
      plain: "rounded-xl border border-line-hair bg-surface-sheet text-fg-ink",            // 패딩은 CardHeader/CardContent(contact)
      index: "rounded-lg border border-line-hair bg-surface-sheet text-fg-ink p-5 sm:p-6",
      case:  "rounded-xl overflow-hidden border border-line-hair bg-surface-sheet text-fg-ink",
      plan:  "relative rounded-xl border border-line-hair bg-surface-sheet text-fg-ink p-6 sm:p-7",
    },
    interactive: {
      true: "group block transition-colors duration-(--motion-fast) ease-soft hover:border-line-strong focus-within:border-line-strong active:border-line-strong active:duration-0",
      false: "",
    },
    featured: { true: "", false: "" },
  },
  compoundVariants: [{ family: "plan", featured: true, class: "border-line-ink" }],
  defaultVariants: { family: "legacy", interactive: false, featured: false },
})

type CardProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>
const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, family, interactive, featured, ...props }, ref) => (
  <div ref={ref}
    data-card={family && family !== "legacy" ? family : undefined}   // 예산 검사용 — legacy 는 표지 없음
    className={cn(cardVariants({ family, interactive, featured }), className)} {...props} />
))
```

- 공개 소비처는 `family`를 반드시 명시한다. 카드 루트에 `border-*` 색 유틸·`shadow-*`를 덧붙이지 않는다.
- 링크 카드는 `<Link className={cardVariants({ family, interactive: true })} data-card=…>`로 루트를 링크로 만든다(§3-0).
- `legacy` 문자열의 hex·`shadow-[` 는 가드 베이스라인(`scripts/design-baseline.json`)에 기존 건수로 남고, 늘지 않는다.

### 3-12. 카드와 바닥의 짝

paper와 sheet는 대비 1.04:1, hair 테두리는 1.18:1이다. '흰 바탕 위 흰 카드'는 야외 iPhone에서 경계가 사라진다.

- sheet 면 카드(index·case·plan)와 Frame은 **paper나 sunken 섹션 위에만** 둔다(C19).
- sheet 섹션에는 박스 없는 패밀리만 둔다: 수치, 인용, TocRow, 표, 도해, dl, 장부.
- **먹 지면**(Manifesto·Footer·SW FullscreenQuote 등)에는 카드·Frame·표·사진·채움 버튼을 두지 않는다(surfaces 먹 지면 허용 목록, C14).
- 검사: `Section`(system)이 `data-surface`를, Card가 `data-card`를 단다. 빌드 HTML 예산 모드에서 `[data-surface="sheet"] [data-card]:not([data-card="toc"])`가 0건이어야 한다(system §6). Frame 표지 속성은 imagery에 요청 중이다(열린 질문 3).

### 3-13. 모션 인벤토리

**홈 서사 모먼트 — `data-moment`는 모먼트 루트에 1개씩, 홈 5개(상한 6)**

| # | 모먼트 | `data-moment` | 트리거 | 메커니즘 | 시간 | reduced·no-JS·SSR |
|---|---|---|---|---|---|---|
| ① | Hero 잉크 밑줄 | `hero-underline` | CSS 키프레임(JS 0) | `text-decoration-color` transparent → `--fg-accent` | 700ms `--ease-soft`, 지연 240ms, 1회 | reduced 정적 완성 · no-JS도 CSS라 같은 페이드 |
| ② | Manifesto 스크럽 | `manifesto` | `view()` 스크롤 타임라인, `@supports` + no-preference + `(height >= 500px)` | 두 줄 opacity .18→1, 둘째 줄 밑줄 색 스크럽 | 스크롤 연동 | 정적 완성(미지원·reduced·낮은 뷰포트) |
| ③ | SolutionOverview ●점등 | `os-light` | `Reveal bare`(.12) | 6노드 `status-dot` opacity .25→1 | 700ms, 노드 간격 `--motion-stagger` 80ms, 1회 | ● 완성 |
| ④ | DashboardPreview 차트 | `dashboard-chart` | `Reveal bare threshold={0.4}` | `[data-seq]` 3레이어 opacity 0→1, transform 0 | 700ms, 지연 0/240/480ms, 1회 | 완성 |
| ⑤ | Comparison 행 액센트 | `row-accent` | `Reveal bare`(.12) | Classin 열 `.row-accent::before` opacity 0→1(전 행 동시) | 700ms, 지연 240ms, 1회 | 완성 |
| (6) | 사실 레지스트리 슬롯 | — | — | `lib/facts.ts`에 출처 있는 수치가 생기면 ProblemCost 장부 위 Numeral 1개, **정적 SSR 값** | 모션 0 | — |

- ⑤의 바는 그려지지 않고 켜진다(opacity). 순차(`--motion-stagger`)는 ●점등 전용이라 행 순차는 없다(X07).
- 잉크 밑줄은 페이지당 1개(`.ink-underline`) + Manifesto 안 1개(`.ink-underline-scrub`)다(C25). 제품 페이지의 1개는 Reveal 조상(`[data-reveal="in"]`)에서 같은 색 페이드로 켜진다.
- 장 머리 괘선(`masthead`)은 정적이다. 긋기 애니메이션은 없다(X04).

**조작 전환** (모먼트가 아니다)

| 전환 | 값 |
|---|---|
| 탭 패널 교체(SolutionOverview·KeyUseCases) | opacity `--motion-base` 320ms. 첫 페인트에는 돌지 않고 `[data-switched]` 이후에만 |
| index-tab 막대(controls) | opacity 160ms(C12) |
| 사례 캐러셀 | transform·opacity 320ms(X06) |
| 링크 카드·TocRow·FAQ 행 hover | 경계 160ms + 화살표 2px 160ms |
| Reveal | opacity 700ms + translateY `--motion-rise`(≤12px, 2D) |
| Dialog | controls(`dialog-in`) |
| 페이지 이동(RouteTransition) | 공개 셸은 opacity만(이동 0) |

**홈 합계**

| 구분 | 수 | 근거 |
|---|---|---|
| `[data-moment]` | 5(상한 6) | C08 |
| 무한 루프 | 0(로딩 스켈레톤 점멸은 로딩 상태 한정이라 집계 제외) | C07 |
| 자동 진행 | 0 | C07 |
| `video[loop]` | 0 | V3-A |
| `.ink-underline` / `.ink-underline-scrub` | 1 / 1 | C25 |
| stroke-dashoffset | 0 | C06 |
| 섹션당 `[data-reveal]` | ≤1 | X07·system §6 |
| `.pattern-grid` | 1(OS 지도 figure) | C19 |

### 3-14. CSS — `app/styles/site-base.css` `@layer components` (cards_motion 몫)

모든 셀렉터는 `:where(.site)`로 시작한다(특이도 0, C17). 이 블록은 site-base.css의 `@layer components` 안에 들어가고, 무장 규칙은 같은 파일의 **no-preference 블록 하나**에 모은다. 값 소유: `[data-seq]` = imagery, `.ink-underline` 모양 = typography, `status-dot` 모양 = icons. 이 스펙은 무장과 시간만 소유한다.

```css
/* ═══ app/styles/site-base.css — @layer components 안. 소유: cards_motion ═══ */

/* ── 정적 모양(모든 상태에서 같다) ── */
:where(.site) .os-node {                          /* 수업 OS 지도 노드 — dg-box 와 같은 윤곽 */
  position: relative;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: var(--surface-sheet);               /* 모눈(pattern-grid)이 라벨 뒤로 지나가지 않게 */
}
:where(.site) .os-node::after {                   /* 현재 탭 열의 액센트 윤곽(조작 전환) */
  content: ""; position: absolute; inset: -1px; border-radius: inherit;
  border: 1px solid var(--fg-accent); opacity: 0; pointer-events: none;
  transition: opacity var(--motion-base) var(--ease-soft);
}
:where(.site) [data-current] .os-node::after { opacity: 1; }

:where(.site) .row-accent { position: relative; }  /* C21 ① — Comparison Classin 열 셀 */
:where(.site) .row-accent::before {
  content: ""; position: absolute; inset: 0 auto 0 0; width: 2px;
  background: var(--fg-accent); pointer-events: none;
}

:where(.site) .case-slide {                        /* X06 — --offset 은 인라인 style */
  transform: translateX(calc(-50% + var(--offset, 0) * (min(82vw, 480px) + 24px)));
  transition: transform var(--motion-base) var(--ease-soft), opacity var(--motion-base) var(--ease-soft);
}
:where(.site) .case-slide[data-pos="near"] { opacity: 0.72; }
:where(.site) .case-slide[data-pos="far"]  { opacity: 0; pointer-events: none; }
:where(.site) .case-slide .case-body { transition: opacity var(--motion-base) var(--ease-soft); }
:where(.site) .case-slide:not([data-pos="active"]) .case-body { opacity: 0; }

@media (forced-colors: active) {
  :where(.site) .row-accent::before { forced-color-adjust: none; background: CanvasText; }
  :where(.site) .os-node::after { border-color: Highlight; }
}

@keyframes ink-fade  { from { text-decoration-color: transparent; } }
@keyframes panel-in  { from { opacity: 0; } }
@keyframes scrub-in  { from { opacity: 0.18; } to { opacity: 1; } }

/* ── 모션 무장 — 이 블록 밖에는 미완 상태가 없다 → SSR·no-JS·reduced = 항상 완성 ── */
@media (prefers-reduced-motion: no-preference) {
  /* Reveal(X07). bare 는 reveal-anim 클래스가 없으므로 자식 무장만 일어난다 */
  :where(.site) .reveal-anim {
    transition: opacity var(--motion-slow) var(--ease-soft), transform var(--motion-slow) var(--ease-soft);
  }
  :where(.site) .reveal-anim[data-reveal="out"] { opacity: 0; transform: translateY(var(--motion-rise)); }

  /* ① Hero 잉크 밑줄 — JS 0. 제목 진입(50+560ms)과 겹쳐 시작해 940ms 에 끝난다 */
  :where(.site) [data-moment="hero-underline"] .ink-underline {
    animation: ink-fade var(--motion-slow) var(--ease-soft) 240ms both;
  }
  /* 그 외 페이지의 잉크 밑줄 1개 — Reveal 조상 */
  :where(.site) [data-reveal="out"] .ink-underline { text-decoration-color: transparent; }
  :where(.site) [data-reveal="in"] .ink-underline {
    transition: text-decoration-color var(--motion-slow) var(--ease-soft) 240ms;
  }

  /* ② Manifesto 스크럽 — 조상에 overflow hidden/auto/scroll 금지(clip 만 허용) */
  @supports (animation-timeline: view()) {
    @media (height >= 500px) {
      :where(.site) [data-moment="manifesto"] h2 > span {
        animation: scrub-in linear both;
        animation-timeline: view();               /* 반드시 animation 단축 속성 뒤 */
        animation-range: entry 10% cover 40%;     /* 화면 가운데(읽는 위치)에 오기 전에 1 */
      }
      :where(.site) [data-moment="manifesto"] .ink-underline-scrub {
        animation: ink-fade linear both;
        animation-timeline: view();
        animation-range: cover 30% cover 50%;
      }
    }
  }

  /* ③ ●점등 — 점만 흐렸다 켠다. 라벨·윤곽은 흐리지 않는다 */
  :where(.site) [data-reveal="out"] .os-node .status-dot { opacity: 0.25; }
  :where(.site) [data-reveal="in"] .os-node .status-dot {
    transition: opacity var(--motion-slow) var(--ease-soft) calc(var(--i, 0) * var(--motion-stagger));
  }
  :where(.site) [data-reveal="out"] [data-current] .os-node::after { opacity: 0; }

  /* ④ 차트 opacity 순차(C06, 값 소유 imagery) — 비교 0 → 강조 240 → 끝점·라벨 480ms */
  :where(.site) [data-reveal="out"] [data-seq] { opacity: 0; }
  :where(.site) [data-reveal="in"] [data-seq] {
    transition: opacity var(--motion-slow) var(--ease-soft) calc(var(--seq, 0) * 240ms);
  }

  /* ⑤ 행 액센트 — 전 행 동시, 표 등장 뒤 240ms */
  :where(.site) [data-reveal="out"] .row-accent::before { opacity: 0; }
  :where(.site) [data-reveal="in"] .row-accent::before {
    transition: opacity var(--motion-slow) var(--ease-soft) 240ms;
  }

  /* 탭 패널 교체 — 첫 페인트 제외 */
  :where(.site) [data-switched] [role="tabpanel"][data-state="active"] {
    animation: panel-in var(--motion-base) var(--ease-soft);
  }
}
```

- 240ms 지연은 C06·C25의 정본 리터럴이다. 가드의 '토큰 밖 리터럴 ms' 규칙은 site-base.css의 이 블록을 허용한다.
- 무장 상태(`out`)에는 전환을 두지 않고 `in`에만 둔다. 무장은 화면 밖에서 일어나므로 흐려지는 순간이 보이지 않는다.
- `text-decoration-color` 애니메이션은 페인트 속성이다. 대상이 한 구절(Hero) + 한 줄(Manifesto)뿐이라 허용하고, 성능 예산에서 long task 0으로 확인한다(§6).

**globals.css에서 할 일**(새 규칙은 쓰지 않는다)
- 삭제: `.reveal-anim` 3규칙(HEAD :476-492, `will-change` :483 포함)과 전역 reduced 블록 안 `.reveal-anim` 2줄(:914-918) — 무장이 no-preference 안으로 옮겨져 쓸모가 없다. `.hero-soft-enter`의 `will-change`(:232).
- 값 수정: `.route-transition-public`의 `--route-enter-y: 12px` → `0px`(:213). 기존 무레이어 규칙이라 레이어 규칙으로는 덮을 수 없어서 값만 바꾼다. 공개 셸 페이지 이동은 opacity만 남는다.
- 사용 0 삭제(삭제 직전 grep 0 재확인): `.prism-glass`(:735-760), `.animate-blob*`(:762-765), `@theme`의 `--animate-blob1~3` + `@keyframes blob1~3`(:90-112, :113의 `@theme` 닫는 괄호는 남긴다), `.animate-progress-fill` + `@keyframes progress-fill`(:884, :894), `.animate-draw-line` + `@keyframes draw-line`(:859, :889), `.animate-cursor-blink` + keyframes(:864, :890), `.animate-marquee` + `@keyframes marquee`(:879, :893). surfaces 스펙의 삭제 목록과 겹치는 줄은 한 커밋에서 한 번만 지운다.
- 사용처 정리 뒤 삭제: `.animate-dot-pulse`·`.animate-float-tag` + keyframes(:869-878, :891-892) — `app/product/sw/page.tsx` 사용처를 먼저 지운다.

### 3-15. JS 배선

#### ① Reveal — `components/landing/Reveal.tsx` (X07)

```tsx
"use client"
import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react"

type RevealProps = {
  children: ReactNode
  as?: ElementType
  /** 기존 호출 호환용. 새 코드는 쓰지 않는다(카드·그리드 순차 금지) */
  delay?: number
  className?: string
  /** IntersectionObserver threshold. 기본 .12, 차트(DashboardPreview)는 .4 */
  threshold?: number
  /** true 면 reveal-anim(페이드·상승) 없이 data-reveal 만 단다 — 자식 모먼트 무장 전용 */
  bare?: boolean
}

export function Reveal({ children, as, delay = 0, className = "", threshold = 0.12, bare = false }: RevealProps) {
  const Tag = (as ?? "div") as ElementType
  const ref = useRef<HTMLElement | null>(null)
  const [state, setState] = useState<"idle" | "out" | "in">("idle")

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const reduce = typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduce || typeof IntersectionObserver === "undefined") return
    // 마운트 시 이미 화면 안이면 무장하지 않는다 — SSR 로 보이던 것이 사라졌다 나타나는 깜빡임 방지
    const rect = node.getBoundingClientRect()
    if (rect.top < window.innerHeight && rect.bottom > 0) return
    // 60vh 보다 큰 요소는 높은 threshold 에 닿지 못한다 → .12 로 낮춘다
    const t = node.offsetHeight > window.innerHeight * 0.6 ? 0.12 : threshold
    let observer: IntersectionObserver | null = null
    const frame = window.requestAnimationFrame(() => {
      setState("out")
      observer = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { setState("in"); observer?.disconnect() }
      }, { threshold: t, rootMargin: "0px 0px -48px 0px" })
      observer.observe(node)
    })
    return () => { window.cancelAnimationFrame(frame); observer?.disconnect() }
  }, [threshold])

  const armed = state !== "idle"
  return (
    <Tag ref={ref} data-reveal={armed ? state : undefined}
      style={armed && delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`${className} ${armed && !bare ? "reveal-anim" : ""}`.trim()}>
      {children}
    </Tag>
  )
}
```

**사용 규칙**
- 섹션당 1개다. 서사 모먼트 섹션은 모먼트 대상의 `bare` Reveal이 그 1개이고, 머리(`masthead`·Kicker·h2)는 감싸지 않는다. 나머지 섹션은 본문 블록 1개를 감싼다.
- 첫 화면 요소(Hero·LogoBar), Manifesto(스크럽), 전환 지점(LeadMagnet·FinalCTA·중간 CTA 띠), 읽기 면·콘텐츠 목록(TocRow 목록)에는 쓰지 않는다.
- `will-change`는 쓰지 않는다. 이동은 2D `translateY`다(3D는 숨김 상태에서도 상시 합성 레이어를 만든다).
- Reveal은 나머지 props를 넘기지 않는다. `data-moment`는 Reveal을 감싸는 요소나 모먼트 루트에 단다.

#### ② SolutionOverview — 수동 탭 + ●점등 (C07)

걷어내는 것: `useInView`, `AUTO_SLIDE_DELAY_MS 2600`과 `setTimeout`(SolutionOverview.tsx:38-53), framer `AnimatePresence`(:112-150), 활성 카드 그림자(:81), 먹 패널(:111), 그라데이션 pill(:59).

```tsx
// components/sections/SolutionOverview.tsx — 섹션 머리는 서버 부모(Section sunken, masthead, Kicker 04 솔루션)
"use client"
import * as Tabs from "@radix-ui/react-tabs"
import { useState, type CSSProperties } from "react"
import { Reveal } from "@/components/landing/Reveal"

const PHASES = [
  { phase: "수업 전", nodes: [{ label: "EDB 교안", i: 0 }] },
  { phase: "수업 중", nodes: [{ label: "전자칠판", i: 1 }, { label: "수업 녹화", i: 2 }] },
  { phase: "수업 후", nodes: [{ label: "LMS", i: 3 }, { label: "학생 관리", i: 4 }, { label: "관리자 데이터", i: 5 }] },
]

export function SolutionTabs({ steps }: { steps: Step[] }) {
  const [active, setActive] = useState(0)
  const [switched, setSwitched] = useState(false)   // 첫 페인트에는 패널 페이드 없음

  return (
    <>
      <figure data-moment="os-light" className="pattern-grid rounded-lg border border-line-hair p-4 sm:p-6">
        <Reveal bare className="grid gap-6 lg:grid-cols-3">
          {PHASES.map((p, c) => (
            <div key={p.phase} data-current={c === active ? "" : undefined}>
              <p className="text-label text-fg-muted">{p.phase}</p>
              <ul className="mt-3 grid gap-2">
                {p.nodes.map((n) => (
                  <li key={n.label} className="os-node flex min-h-11 items-center gap-2.5 px-3"
                    style={{ "--i": n.i } as CSSProperties}>
                    <span aria-hidden className="status-dot" />
                    <span className="text-caption font-medium text-fg-body">{n.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Reveal>
        <figcaption className="mt-3 border-t border-line-hair pt-2 text-note text-fg-muted">
          수업 OS 지도 — 6개 모듈이 수업 전·중·후로 이어진다
        </figcaption>
      </figure>

      <Tabs.Root value={String(active)} className="mt-10"
        onValueChange={(v) => { setActive(Number(v)); setSwitched(true) }}
        data-switched={switched ? "" : undefined}>
        <Tabs.List aria-label="수업 전·중·후" className="flex gap-6 border-b border-line-hair">
          {steps.map((s, i) => (
            <Tabs.Trigger key={s.id} value={String(i)} className="index-tab">{s.phase}</Tabs.Trigger>
          ))}
        </Tabs.List>
        {steps.map((s, i) => (
          /* 3패널 모두 SSR — 검색·no-JS 에도 HTML 에 있다. 비활성은 display:none */
          <Tabs.Content key={s.id} value={String(i)} forceMount
            className="mt-6 rounded-xl border border-line-hair bg-surface-sheet p-5 sm:p-6 data-[state=inactive]:hidden">
            …headline · desc · points(기존 문구 그대로)
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </>
  )
}
```

- 탭은 Radix가 APG 동작(roving tabindex, ←/→/Home/End, `aria-controls`)을 맡는다. 활성 표시는 `index-tab`(controls, C12): 글자 15/500 고정, 막대 opacity 160ms. 굵기가 변하지 않아 전환 CLS가 0이다.
- 탭 라벨과 지도 열 머리에 01–03 번호를 붙이지 않는다(홈 번호 체계는 Act 폴리오 1종, C24).
- 지도의 ●은 계속 켜져 있다('OS가 켜졌다'는 상태). 탭을 바꾸면 해당 열 노드의 액센트 윤곽만 바뀐다(opacity 320ms). ProblemCost의 ○는 끝까지 꺼진 채다.
- 노드 매핑: 6모듈은 `lib/classin-positioning.ts:10`의 정본 목록이다. 녹화를 '중'에 둔 것은 2단계 points의 "수업 녹화와 참여 도구"를 따른 것이다. 열 사이 연결선은 imagery 도해 규격(정적, `--stroke-pen` `--line-control`)을 따른다.
- 면: 섹션 sunken(C19), 패널 sheet r12, 지도 figure는 모눈 1개(페이지 예산 1).

#### ③ CaseStudies — 수동 전용, framer 제거

| 위치 | 지금 | 바꾸는 것 |
|---|---|---|
| :104, :110-116 | `AUTO_ADVANCE_MS 8500` + `setInterval` | 삭제(수동 전용) |
| :140-153 | `motion.article` animate(x·scale·opacity·zIndex), spring | `<article className="case-slide absolute left-1/2 top-4 w-[min(82vw,480px)] cursor-pointer" data-pos={isActive ? "active" : distance === 1 ? "near" : "far"} style={{ "--offset": offset, zIndex: cases.length - distance } as CSSProperties} onClick={() => goToSlide(index)}>` |
| :153 | `aria-hidden={!isActive}` | 삭제. 안쪽 래퍼 `<div inert={!isActive}>`로 옮긴다. article이 inert이면 이웃 슬라이드 클릭이 죽는다 |
| :154 | 활성 그림자 `0_28px_90px`, 테두리 #084734/30 | `<Card family="case">`(그림자 0) |
| :162 | `unoptimized` | 삭제, `aspect-case` |
| :170 | 민트 원 배지 | `text-label text-fg-accent` |
| :190 | 이탤릭 인용 박스 | PullQuote 소형 |
| 컨테이너 | — | `isolate` |
| reduced | 처리 없음 | 따로 두지 않는다. 전역 reduced 블록이 transition을 0.001ms로 만든다 |

#### ④ ProblemCost — 정성 장부 (C08, V4-A)

지우는 것: `CountUp`(ProblemCost.tsx:7-41), `countTarget`(:48, :56, :64), 수치 문구(20%, 1,200만원, 3개월, 85/42/67%), 글래스 카드·글로우·scale·그라데이션 숫자·ping·`width` 막대·shimmer·블롭·노이즈.

```tsx
// 서버 컴포넌트. 행 문구는 콘텐츠 담당이 확정한다(열린 질문 1)
const ROWS = [
  { module: "칠판", question: "강사가 바뀌면 수업 품질도 바뀌나요?" },
  { module: "교안", question: "…" }, { module: "녹화", question: "…" },
  { module: "LMS", question: "…" }, { module: "학생 관리", question: "…" }, { module: "관리자 데이터", question: "…" },
]

<Section surface="sheet" rhythm="act" id="problem">
  <header className="masthead"><Kicker folio="03">공감</Kicker><h2 className="mt-3 text-h2 text-fg-ink">…</h2></header>
  <ul aria-label="지금 따로 움직이는 6가지" className="mt-8 border-b border-line-hair sm:mt-10">
    {ROWS.map((r) => (
      <li key={r.module}
        className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 border-t border-line-hair py-4 sm:grid-cols-[auto_10rem_1fr] sm:gap-x-6 sm:py-5">
        <span aria-hidden className="status-dot" data-state="off" />
        <span className="text-label text-fg-ink">{r.module}</span>
        <p className="col-start-2 text-body text-fg-body sm:col-start-3">{r.question}</p>
      </li>
    ))}
  </ul>
</Section>
```

- 6행은 수업 OS 지도 6노드와 1:1로 대응한다(○ 꺼짐 → Solution에서 ● 켜짐).
- 숫자 열·합계 이중선·카운터·배경 괘선(ruled)은 0이다. 행 구분은 1px hair 테두리다.
- 사실 레지스트리에 출처 있는 수치가 생기면 장부 위에 Numeral 1개를 정적 SSR 값으로 둘 수 있다(6번째 슬롯).

#### ⑤ DashboardPreview — 서버 컴포넌트, 차트 opacity 순차 (C06)

지우는 것: `DashboardPreviewCharts.tsx`, `dynamic(..., { ssr:false })`(DashboardPreview.tsx:8-13), IO·idle 예약(:46-97), 스켈레톤(:22-42), 그라데이션 바닥·오브 3개·글래스. 클라이언트는 Reveal뿐이고, 공개 화면의 Recharts import는 0이 된다.

```tsx
<Section surface="paper" rhythm="act" id="dashboard">
  <header className="masthead"><Kicker folio="05">화면·사례</Kicker><h2 className="mt-3 text-h2 text-fg-ink">…</h2></header>
  <div data-moment="dashboard-chart" className="mt-8 sm:mt-10">
    <Frame source={{ kind: "mock" }} summary="예시 화면: 반별 주차 출석률이 8주 동안 오르는 대시보드">
      {/* KPI 3칸은 목업 UI — 수치마다 같은 줄에 '예시'(X11). Numeral(factId 전용)을 쓰지 않는다 */}
      <Reveal bare threshold={0.4}>
        <LineChart example /* components/charts/LineChart(imagery §3-8): 비교·강조·라벨이 [data-seq] 0/1/2 */ … />
      </Reveal>
    </Frame>
  </div>
</Section>
```

- 차트 등장은 페이지당 1개이고 홈은 이것이다. ScienceBased의 망각 곡선은 정적이다.
- 그림자 0, '그림 n' 번호 없음(홈, C05), '지역 평균' 비교선 삭제, 툴팁 없음.

#### ⑥ Manifesto — 먹 서사 지면 (V4-A)

```tsx
// 서버 컴포넌트. overflow-hidden(:7)·800px 블러(:9)·framer 4곳·그라데이션 텍스트(:38)·인라인 자간 삭제
<Section surface="ink" rhythm="act" id="manifesto">   {/* overflow-x-clip 만 — view() 를 얼리지 않는다 */}
  <div data-moment="manifesto">
    <h2 className="text-poster text-fg-ink">
      <span className="block">{line1}</span>
      <span className="block"><span className="ink-underline-scrub">{line2}</span></span>
    </h2>
    <p className="mt-6 max-w-deck text-body-l text-fg-body">{bridge}</p>
  </div>
</Section>
```

- 먹 위에서 밑줄 색은 `.surface-ink`가 재정의한 `--fg-accent` #6EE7B7이다(C01).
- `html`/`body`의 `overflow-x: hidden; overflow-x: clip` 쌍(HEAD :363-364)을 유지해야 한다.

#### ⑦ Hero — 잉크 밑줄 1개 (V3-A·C25)

- `<h1 className="hero-soft-enter hero-soft-enter-title text-display" data-moment="hero-underline">…<span className="ink-underline">{구절}</span>…</h1>`.
- `white-space: nowrap`은 쓰지 않는다. 줄이 바뀌면 줄마다 밑줄이 붙는다.
- 그라데이션 텍스트·ping(:42)·덮개 반경·그림자·group-hover 글로우(:85-86, 102-105) 삭제. Reveal은 쓰지 않는다(첫 화면).
- 오른쪽 capture Frame과 대체 전 도판 라벨('AI 생성 이미지' 하나)은 imagery 소관(C09).

#### ⑧ KeyUseCases — 탭 + Frame 1개

- index-tab + Radix Tabs(forceMount로 텍스트 3패널 SSR). Frame은 **활성 패널 안에만** 렌더한다(`{i === active && <Frame …/>}`) — HTML 안 Frame 1개, 패널 교체와 함께 페이드된다.
- spring, `rounded-[2rem]`, 블롭, whileHover 회전, 체크 타일 hover 채움을 지운다. 체크는 `Check` `size-4`.
- 바닥 paper(C19).

### 3-16. 금지 (카드·섹션 배경)

- **카드·배경 모션**: shimmer, 스캔 라인, 헤어라인 스윕, conic 테두리 빛(V7-A), 글로우 펄스, 노이즈 드리프트, `animate-ping/pulse/bounce`, bob, 파티클, 블롭 드리프트, 카운트업·라이브 카운터, 무한 웨이브폼·점멸.
- **자동**: 자동 진행 탭, 캐러셀 자동 넘김, 마키(X16에서 다시 열지 않음), 진행 괘선.
- **hover**: 들림, 확대, 기울임, 3D tilt, 사진 hover scale, 제목 색·밑줄 변화, 먹선 hover, 배경 채움 변화, 그림자 변화.
- **애니메이션 속성**: `stroke-dashoffset`, `filter`, `box-shadow`, `background-position`, `width`·`height`·`padding`, `@property` 보간, 큰 `backdrop-filter`, 상시 `will-change`, `background-attachment: fixed`.
- **구조·JS**: 스크럽 대상 조상의 `overflow: hidden/auto/scroll`, framer `repeat: Infinity`, 한국어 글자·단어 쪼개기, 활성·비활성 탭의 굵기 차이, SSR 인라인 `opacity:0`, Reveal 섹션의 `content-visibility: auto`, 그리드 섹션의 `contain: paint`.

---

## 4. 사용 규칙과 대상 파일

### 4-1. 쓰는 곳 / 모션 0

**모먼트를 쓰는 곳**: 홈 5곳(§3-13), 제품 페이지마다 잉크 밑줄 1개 + 차트 등장 1개(HW LatencyProof는 감사 D5 수치 확정 뒤).

**모션 0(정지)**
- 읽기 면: 블로그 본문, 문서 본문, 폼, 법무, 계정, checkout, receipt.
- 모든 카드 내부(hover 제외), 수치, 인용, 사진, 아이콘, 표 본문, 장 머리 괘선.
- LogoBar, HomeLeadMagnet, 중간 CTA 띠, FinalCTA, 404·오류·빈 상태(StateBlock, controls).
- 콘텐츠 목록(블로그·문서·행사·업데이트·자료의 TocRow 목록)에는 Reveal도 쓰지 않는다.

**범위 밖**: `/admin`, `/checkout`, `/receipt`(isInternalPath, `.site` 밖), 정적 랜딩 `/l/*`(백로그).

### 4-2. 홈 — `app/page.tsx` 순서(C19 시퀀스)

| 파일:행 | 지금 | 면 · 패밀리 · 모션 | 바뀌는 것 |
|---|---|---|---|
| Hero.tsx:42, 57, 85-86, 102-105 | ping, `animate-text-gradient` 구절, 덮개 반경·그림자, 글로우 | paper · ① `hero-underline` | §3-15 ⑦. Kicker `folio={null}`(V9-A, typography) |
| LogoBar.tsx:42-76 | `border-y`, 그라데이션 페이드 div, 28s 인라인 keyframes, 34곳 마키 | sunken `rhythm="band"` · 정적 목록 | `<ul className="flex flex-wrap justify-center gap-x-6 gap-y-3">` 앞 12곳 + `외 {academies.length - 12}곳`(배열에서 계산). 이름 `text-body font-medium text-fg-muted`, 앞 점 삭제. `"use client"`·인라인 `<style>`·복제 세트 삭제 → 서버 컴포넌트(X16) |
| HomeEntitySummary.tsx:22-40 | `border-y` 블록, dl `border-l #084734/20` | sheet · 01 선언 `masthead`(정적) · 정지 dl | dl 칸 구분 `border-line-hair` |
| EraVision.tsx:30-37, 41-127 | 80px 그린 격자, framer 5곳, 셀 hover `#ECFDF5/40`(:91), text-shadow(:94) | paper · 02 시대 · 인덱스 헤어라인 그리드 · Reveal 1 | 격자 삭제(모눈 없음), hover 채움·uppercase·text-shadow 삭제, 서버 컴포넌트 |
| ProblemCost.tsx:7-258 | 글래스, 글로우·scale, 그라데이션 숫자, ping, `width` 막대, shimmer, 블롭, 노이즈, CountUp | sheet · 03 공감 · 정성 장부 · 정지 | §3-15 ④ |
| HomeLeadMagnet.tsx:79-110 | 중첩 박스 그림자, 민트 타일(:90), `border-l-2 + #ECFDF5` 메모(:105) | sunken · 인덱스 카드 · 정지 | 그림자·민트 타일 삭제, 메모는 위 hair + `text-note` |
| Manifesto.tsx:7-73 | `overflow-hidden`(:7), 800px 블러(:9), framer 4곳, 그라데이션(:38) | ink · ② `manifesto` | §3-15 ⑥ |
| SolutionOverview.tsx:38-155 | 2.6초 자동, 활성 카드 그림자(:81), 먹 패널(:111), AnimatePresence | sunken · 04 솔루션 · ③ `os-light` + 수동 탭 | §3-15 ② |
| KeyUseCases.tsx:159-250 | spring, `rounded-[2rem]`, 블롭, whileHover 회전, 체크 타일 hover 채움 | paper · Frame 1 + index-tab · 패널 교체만 | §3-15 ⑧ |
| (신규) KeyUseCases 뒤 | — | paper · 중간 CTA 띠 | `home_mid_showroom`, line cta |
| DashboardPreview.tsx:1-182 | 그라데이션 바닥, 오브 3개, 글래스, Recharts `ssr:false` | paper · 05 화면·사례 · ④ `dashboard-chart` | §3-15 ⑤ |
| ScienceBased.tsx:9-160 | 노이즈·블러, spring, 이탤릭 그라데이션 인용, 글래스 태그 | sheet · PullQuote + 정적 곡선 · Reveal 1 | 곡선은 imagery 차트 문법(정적), 원문 대조 뒤 |
| SatisfyingClass.tsx:48-200 | 회전 콜라주 5장 spring, 블롭 | sunken · 인덱스 카드 2×2 · Reveal 1 | 회전·spring·블롭 삭제, 범주 라벨(번호 없음) |
| CaseStudies.tsx:104-236 | spring 캐러셀, 8.5초 자동, 그림자, `unoptimized`, 민트 배지, 이탤릭 인용 | paper · 사례 카드 · 조작 전환만 | §3-15 ③ |
| GlobalScale.tsx:15-58 | #ECFDF5 바닥, `rounded-[20px]`, 민트 원 아이콘 | sheet · 수치 칸(정지) | 아이콘 삭제, `lib/facts.ts` 등록 수치만, 출처 캡션 상시(열린 질문 5) |
| TestimonialWall.tsx:28-145 | #F7F8F5, #0B3328 먹 피겨, 금색 별, 그림자 | paper · 인용 columns · Reveal 1 | 별·금색·박스·그림자 삭제, framer → Reveal 1 |
| (신규) TestimonialWall 뒤 | — | paper · 중간 CTA 띠 | `home_mid_showroom`, line cta |
| Outcomes.tsx:64-96 | hover 들림 + `shadow-lg`, 그라데이션 After 셀 + 장식 바 | sunken · `table-paper` 3열(행 액센트 없음) · Reveal 1 | 들림·그라데이션·장식 바 삭제 |
| Comparison.tsx:58-102 | 표 들림(:63), zebra(:87), `green-400/500` | sheet · 06 확신 · `table-paper--stack` + ⑤ `row-accent` | Classin 열 `td.row-accent`, `<div data-moment="row-accent"><Reveal bare>…</Reveal></div>`. 머리 셀·기존 방식 열 글자(#615D59)는 controls·icons |
| FinalCTA.tsx:11-88 | 그라데이션·노이즈·블러, ping, `hover:scale-105 rounded-full` | sunken · CTA 띠(마지막) · 정지 | 전부 삭제, §3-10 |

- 감사 D8(섹션 통합)이 승인되면 CaseStudies~TestimonialWall(사이의 GlobalScale 포함, C19 · 감사 §5-4 원안 'Voices(CaseStudies+Testimonial)+GlobalScale')을 한 섹션으로 합친다. 순서는 사례 → GlobalScale 수치 칸 → 인용이고, 바닥은 paper 하나다(사례 카드가 sheet라 sheet 바닥 불가, C19). 그때 섹션의 Reveal은 인용 블록 1개이고 캐러셀은 조작 전환만 둔다.
- 홈 Kicker는 Hero 1 + Act 6 = 7개다(C22). 그 밖의 eyebrow는 지운다.

### 4-3. 제품

| 파일:행 | 지금 | 바꾸는 것 |
|---|---|---|
| app/product/sw/page.tsx:367-394, 544, 2124 | AmbientParticle 무한, 블롭 드리프트, bob | 삭제 |
| sw:527-529 | 4.2초 라이브 카운터 | 삭제(감사 P0-9) |
| sw:2009 등 | `animate-dot-pulse`, `animate-float-tag` | 삭제 → 그 뒤 globals의 두 클래스와 keyframes 삭제 |
| sw:451-500 | TestimonialCard hover 들림·그림자 | 인용 패밀리 |
| sw:1103 | AI 기능 카드 hover 들림 | 인덱스 카드 |
| sw:1878-1880 | 도구 타일 글래스 + 들림 + 그라데이션 아이콘 | 목차 행(아이콘 20, LessonToolIcons) |
| sw:1900-1903, 2036 | 활동 카드 들림, 아이콘 scale | 인덱스 카드, scale 삭제 |
| sw:1272, 1276 | feTurbulence 노이즈, 블러 | 삭제(FullscreenQuote는 `Section surface="ink"` + PullQuote) |
| sw:209 WaveDivider | 웨이브 | 삭제(surfaces) |
| sw:745-752 | TypographyHook 2px 바(framer) | 이 페이지의 잉크 밑줄 1개: Reveal + `.ink-underline`(색 페이드) |
| hw/DesignDetails.tsx:99 | hover `shadow-lg -translate-y-1` | 인덱스 카드(사진형), 바닥 paper |
| hw/SizeChooser.tsx:76-87 | `rounded-[28px]` 들림, 그라데이션 사진 바닥 | 요금(선택) 카드 r12, 바닥 sunken |
| hw/ClassroomStudioSection.tsx:85 | 아이콘 타일 scale | IconFrame(투명, 정적, icons) |
| hw·sw OnboardingRoadmap | 원형 아이콘 scale-110 | 목차 행, 폴리오 01–04(순서 있음) |
| hw/LatencyProof.tsx:46 | `rounded-3xl` #0D1A12 `shadow-2xl` | Frame r8 + 차트 `[data-seq]` opacity 순차(감사 D5 뒤, dashoffset 0) |
| hw/ValueAnchor.tsx:62, 66, 119 | 블롭, 글래스 카드 | 삭제. 먹 위에는 카드 금지 → 박스 없는 수치(facts 등록분)·인용 |
| app/product/ai-report/page.tsx:471-475, 598-603, :662 | '자동 녹화 중' 무한 점멸, 무한 웨이브폼, #ECFDF5 면, OutlineIcon, 10px #A39E98 라벨 | 정적 `status-dot` + '자동 녹화', 정적 막대, `bg-surface-paper`, IconFrame, 점선 '예시 화면' 태그(C26). 구조·레이아웃·카피는 유지 |
| app/pricing/page.tsx:47, 72 | `rounded-[20px] shadow-sm`, `#F5FBF7` 박스 | 요금 카드(바닥 paper), 안내문은 위 hair + 캡션 |
| app/product/page.tsx:119-122, 165, 178 | 그림자 카드, 민트 타일, #ECFDF5 띠, 들림 | 인덱스 카드(interactive), 띠는 sunken |

### 4-4. 콘텐츠·전환·기타

| 파일:행 | 지금 | 바꾸는 것 |
|---|---|---|
| components/docs/DocsArticleCard.tsx:25, 50 | `active:scale-[0.98]`, 화살표 4px | TocRow |
| app/updates/page.tsx:113, 177, 220 | 그라데이션 `rounded-3xl` 카드, `rounded-2xl` 행 | 인덱스 카드 r8 / TocRow |
| app/events/EventsClient.tsx:134 | `animate-pulse` 점 | 정적 `status-dot` + '모집 중' |
| events:155, 306-339 | `rounded-2xl` 먹 카드, 목록 | sheet 인덱스 카드 r8(먹 카드 금지), TocRow 썸네일 변형 |
| app/events/[slug]/page.tsx:251-350 | `rounded-[22~36px]`, 들림 | r12, 들림 삭제 |
| components/seminars/SeminarCard.tsx:16-30 | 들림, 그림자, 백드롭 배지, Play scale | 사례 패밀리(미디어), 배지 → `text-label` |
| BlogPostCard.tsx:34 · BlogPageClient.tsx:212, 331 | 사진 hover scale, 블러 | scale·블러만 삭제. 대표 + 3열 카드 구조 유지(블로그 세션 커밋 뒤) |
| app/about/AboutPageClient.tsx:288-1002 | 20~24px 반경, 들림, 사진 scale | r12, 들림·scale 삭제 |
| app/contact/page.tsx:379-679 | `rounded-[24px]/2rem` slate 카드 | `Card family="plain"`(controls 폼 스펙과 함께) |
| components/landing/SegmentLandingPage.tsx:98-250, 288, 357 | 항목마다 Reveal + delay 순차, 그라데이션 `shadow-deep` 블록, `rounded-[14px] shadow-card` 들림 | 섹션당 Reveal 1개(delay 삭제), CTA 띠, 인덱스 카드 |
| app/docs/page.tsx:310, 357 | 섹션 단위 Reveal | 유지(섹션당 1개 규칙 안) |
| components/PublicRouteLoading.tsx | `animate-shimmer`, `bg-white/70`, `shadow-[0_24px_80px]` | `bg-surface-skeleton` + `animate-skeleton`(opacity 1↔.4, 1.6s — controls 스켈레톤) |

### 4-5. 공용 파일

| 파일 | 할 일 |
|---|---|
| `app/styles/site-base.css` | §3-14 블록(`@layer components`) |
| `app/globals.css` | §3-14 'globals.css에서 할 일'(삭제·값 수정만, 새 규칙 0) |
| `components/landing/Reveal.tsx` | §3-15 ① |
| `components/ui/card.tsx` | §3-11(`cardVariants` export, 기본 `legacy`) |
| `components/ui/toc-row.tsx` | 신규, §3-7 |
| `components/sections/SolutionOverview.tsx` | §3-15 ② |
| `tests/ui/card.test.tsx` | 신규 1개: 기본 출력 문자열이 현행과 같다 · `family="index"`에 `shadow` 없음 · `data-card` 표지 |

---

## 5. 접근성·대비

### 5-1. 상태 매트릭스

| 상태 | ① 밑줄 | ② 스크럽 | ③ ● | ④ 차트 | ⑤ 행 액센트 | 탭 | 카드 hover |
|---|---|---|---|---|---|---|---|
| SSR 첫 페인트 | Hero는 240ms 뒤 색 페이드, 그 외 완성 | 완성 | 완성 | 완성 | 완성 | 3패널 HTML 존재, 활성 1 | — |
| JS 없음 | Hero 동일(CSS), 그 외 완성 | 지원 시 스크럽 / 미지원 시 완성 | 완성 | 완성 | 완성 | 첫 패널만 보임(나머지 HTML에 있음) | 동작 |
| reduced | 완성 | 완성 | 완성 | 완성 | 완성 | 즉시 교체 | 즉시(0.001ms) |
| no-preference, 마운트 시 화면 안 | Hero 페이드 / 그 외 무장 안 함 | — | 무장 안 함 | 무장 안 함 | 무장 안 함 | 320ms | 160ms |
| 높이 < 500px | — | 정적 완성 | — | — | — | — | — |

### 5-2. 접근성

- **WCAG 2.2.2**: 홈에 5초 넘는 자동 움직임이 없다(루프 0, 자동 진행 0). 제품 페이지 배경 영상의 정지 장치는 imagery 소관(C07: ≥64rem, hover 기기, no-preference, 정지 버튼 + 화면 밖 정지).
- **탭(APG)**: Radix Tabs — `tablist/tab/tabpanel`, roving tabindex, 방향키, `aria-controls`가 실제 id. 3패널 모두 DOM에 있다.
- **정보의 중복(1.4.1)**: ○●–는 항상 텍스트 라벨과 함께, 점·장식 괘선·행 액센트 바는 `aria-hidden`(의사요소). Classin 열은 열 머리 텍스트가 의미를 맡는다.
- **보조기기**: 비활성 슬라이드는 안쪽 래퍼 `inert`. 차트는 imagery 규격(sr-only 요약·표). mock Frame 본문은 `aria-hidden` + sr-only '예시 화면: …'(C05).
- **포커스(2.4.7·2.4.13)**: site-base 보증 ① `outline: 2px solid var(--fg-accent); outline-offset: 2px`(var 폴백 없음, X01). 공개 Dialog 5곳·토스트도 `.site`라 같은 링을 받는다(C17). 카드별 `focus-visible:ring-*`는 삭제한다.
- **hover 신호**: 경계 strong(1.41:1)은 보조 단서다. 상태 판별은 focus outline과 링크 문맥이 맡고, hover는 1.4.11 대상 상태가 아니다.
- **줌·리플로(1.4.4·1.4.10)**: 스크럽은 `(height >= 500px)` 가드로 200~400% 줌과 가로 모드에서 정적이다. 잉크 밑줄은 nowrap이 없어 줄바꿈 시에도 안전하다. 확대 4상태 기준은 system §9.
- **강제 색상**: `.row-accent::before` CanvasText, `.os-node::after` Highlight. `status-dot`은 icons가 처리한다.

### 5-3. 대비 실측 (WCAG 2.x 상대휘도)

| 요소 | 값 | sheet #FFF | paper #FAFAF8 | sunken #F6F5F4 | 판정 |
|---|---|---|---|---|---|
| 카드 제목 | #111110 | 18.89 | 18.08 | 17.35 | AAA |
| 카드 본문 | #31302E | 13.18 | 12.62 | 12.11 | AAA |
| 메타·폴리오·출처·캡션 | #615D59 | 6.53 | 6.24 | 5.99 | AA |
| 액센트(범주, ●, 행 액센트, 잉크 밑줄) | #084734 | 10.71 | 10.25 | 9.83 | AAA |
| ○ 링·– 막대·도해선 | #8F8A84 | 3.42 | 3.27 | 3.14 | 비텍스트 3:1 통과 |
| hover·pressed 경계 strong | .16 | 1.41 | — | — | 보조 단서(장식) |
| hair 테두리 | .08 | 1.18 | — | — | 장식 |
| 추천 Plan 테두리 | #111110 | 18.89 | — | — | 통과 |
| 포커스 outline | #084734 | 10.71 | 10.25 | 9.83 | 2.4.13 통과 |
| 이웃 슬라이드 제목 | #111110@.72 | — | 7.47 | — | AA(본문·메타 숨김) |
| (금지) 읽는 글자 #A39E98 | — | 2.66 | 2.54 | 2.44 | 장식·비활성 전용 |

**먹 지면**(`.surface-ink`, #111110 기준, C01)

| 요소 | 대비 |
|---|---|
| 제목 `--fg-ink` #FAFAF8 | 18.08 |
| 본문 `--fg-body` /.72 | 9.61 |
| 보조 `--fg-muted` /.56 | 6.14 |
| 액센트·포커스·밑줄 `--fg-accent` #6EE7B7 | 12.40 |
| (금지) #084734 | 1.76 — 먹 위에서는 토큰이 자동으로 #6EE7B7로 바뀐다 |

**전이 상태**(정지 상태가 아님)

| 상태 | 대비 | 처리 |
|---|---|---|
| ● 무장 .25 | 1.58 | 장식 점. 라벨은 항상 opacity 1 |
| Manifesto .18 | 1.68 | 진입 구간에서만. axe는 `reducedMotion: 'reduce'`로 돌린다 |
| 잉크 밑줄 페이드 중 | — | 장식. 글자는 처음부터 완전 대비 |

---

## 6. 성능 예산

| 항목 | 예산 | 측정 |
|---|---|---|
| 애니메이션 속성 | opacity·transform(Reveal translateY, 캐러셀 translateX). 예외 `text-decoration-color` 2곳(Hero 1회, Manifesto 스크럽). hover의 경계 색 160ms | rg + 코드 리뷰 |
| stroke-dashoffset | 사이트 0 | `rg 'stroke-dashoffset\|draw-path' app components` |
| 무한 루프 | 홈 0(로딩 스켈레톤 제외), `video[loop]` 홈 0 | `getAnimations()` iterations, DOM 카운트 |
| 자동 진행 | 0 | `rg 'setInterval\|AUTO_(SLIDE\|ADVANCE)' components/sections` |
| 한 뷰포트 동시 진행 | ≤ 10(최대 ●점등 6) | 셀렉터를 좁힌 `getAnimations()` 샘플 |
| 숨김 상태 합성 레이어 | 2D translate만, 상시 레이어 승격 0 | Chromium Layers 패널 전후 비교 |
| `will-change` | 공개 CSS·클래스 0 | `rg will-change app/styles app/globals.css components` |
| 신규 JS | 순감소: 홈 섹션 framer 12 → 0, setTimeout·setInterval 2 → 0, Recharts 공개 0, `"use client"` 홈 섹션은 SolutionTabs·CaseStudies·Reveal만 | 빌드 산출물 비교, `rg -l framer-motion components/sections` |
| Recharts 청크 | 공개 페이지 요청 0 | 네트워크 로그 |
| 스크롤 중 long task | 애니메이션 원인 > 50ms 0건(4× CPU, 스크럽 구간 포함) | Performance 패널 |
| CLS | 모션 기여 0, 홈 ≤ 0.05(탭 굵기 고정, 스켈레톤 교체 없음) | Lighthouse 모바일 3회 중앙값 |
| INP | 탭·캐러셀 p75 < 200ms | Web Vitals |
| SSR | 공개 HTML 인라인 `opacity:0` 0건 | §8 정규식 |

---

## 7. 마이그레이션 (system §11 단계에 맞춤)

순서 규칙: (a) globals.css·블로그 파일은 블로그 세션 커밋이 들어간 뒤 손댄다. (b) 대체 도판 커밋이 들어간 뒤에만 기존 도판을 뺀다(C09). (c) 서사 모먼트 1개 = 커밋 1개. (d) #A39E98은 hex→토큰 치환만 하고, 먹 구간을 `surface-ink`로 옮긴 뒤에 한다.

| step | 단계 | 내용 | 노력 | 시안 |
|---|---|---|---|---|
| 1 | P0(화면 변화 0) | site-base.css에 §3-14 블록 추가(tokens·utilities·site-base 3파일 PR에 포함). Reveal을 X07 시그니처로(bare·threshold·이미 보이면 무장 안 함). globals.css `.reveal-anim`·`will-change`(:232, :483) 삭제, 사용 0 CSS 삭제. `card.tsx`를 cva로(기본 `legacy` = 현행 출력) + `tests/ui/card.test.tsx`. — `app/styles/site-base.css`, `app/globals.css`, `components/landing/Reveal.tsx`, `components/ui/card.tsx`, `tests/ui/card.test.tsx` | S | 불필요 |
| 2 | P1 빼기 | 공개 카드 hover 들림·확대·그림자·`active:scale-[0.98]`·사진 hover scale·ping·shimmer·블롭·글로우 일괄 삭제. 링크 카드 hover는 `hover:border-line-strong` + `arrow-nudge`. `.route-transition-public` 이동 0px. LogoBar 정적 목록. — Comparison, Outcomes, KeyUseCases, ProblemCost, FinalCTA, Hero, LogoBar, DocsArticleCard, SeminarCard, BlogPostCard, BlogPageClient, product/page, sw/page, hw/DesignDetails·SizeChooser·ClassroomStudioSection·OnboardingRoadmap, sw/OnboardingRoadmap, events/[slug], events/videos/[slug], resources/[slug], AboutPageClient, SegmentLandingPage, contact, `app/globals.css`:213 | S | 불필요 |
| 3 | P2 프리미티브 | `Card` 공개 family 적용(CaseStudies·KeyUseCases·contact), `toc-row.tsx` 신규, 인용·수치·CTA 띠 패턴. contact 전후 캡처 비교(패딩 이중 적용 확인). — `components/ui/card.tsx`, `components/ui/toc-row.tsx`, `app/contact/page.tsx` | S | 카드 시트 ③ |
| 4 | P3 홈 Act 01–02 | HomeEntitySummary·EraVision 서버 컴포넌트화, `masthead` 정적 괘선, 헤어라인 그리드, Reveal 1. HomeLeadMagnet 정지. | S | 필수 ② |
| 5 | P3 Act 03 | ProblemCost 정성 장부(수치 0) | S | 필수 ② |
| 6 | P3 모먼트 ① | Hero 잉크 밑줄(V3-A Hero 커밋과 함께) | S | 필수 ② |
| 7 | P3 모먼트 ② | Manifesto 먹 지면 + 스크럽(overflow 제거) | S | 필수 ② |
| 8 | P3 모먼트 ③ | SolutionOverview 수동 탭 + ●점등 + OS 지도 | M | 필수 ② |
| 9 | P3 Act 04–05 | KeyUseCases(Frame 1, 탭), 중간 CTA 띠 2개, ScienceBased·SatisfyingClass·TestimonialWall·GlobalScale·Outcomes 서버 컴포넌트화 | M | 필수 |
| 10 | P3 모먼트 ④ | DashboardPreview 서버 컴포넌트 + 차트 opacity 순차, Recharts 공개 0 | M | 필수 |
| 11 | P3 사례 | CaseStudies 수동 캐러셀, framer 제거, inert 래퍼, `data-pos`, 사실 dl, 출처 확인 컷만 사진 | M | 필수 |
| 12 | P3 모먼트 ⑤ | Comparison `table-paper` + 행 액센트, FinalCTA sunken 띠 | S | 필수 |
| 13 | P4 제품 | sw 다이어트(파티클·블롭·bob·카운터·노이즈·WaveDivider·dot-pulse·float-tag → globals 키프레임 삭제), TypographyHook 밑줄, hw 카드 수렴, LatencyProof(감사 D5 뒤), ai-report(C26), pricing Plan, product 허브 | L | 페이지별 |
| 14 | P5 콘텐츠·전환 | updates·events·docs TocRow, events 상태 점, about, SegmentLandingPage Reveal 정리, PublicRouteLoading 스켈레톤, 블로그 카드 hover(블로그 세션 뒤) | M | 페이지별 |

각 단계 배포 뒤 14일 동안 system §11 지표(ctaId 클릭, 리드 제출, 랩 LCP·CLS·INP)로 비교하고 다음 단계로 간다. 되돌림 트리거도 system §11을 따른다.

---

## 8. 수용 기준

**정적 검사**(이 스펙의 대상 경로: `app/{about,blog,contact,docs,events,pricing,product,resources,showroom,updates,page.tsx}`, `components/{sections,product,blog,docs,events,seminars,landing}`, `components/ui/{card,toc-row}.tsx`, `components/PublicRouteLoading.tsx`. 그 밖의 `components/ui/*`(dialog·toast·input·button·FloatingChatbot 등)는 controls·icons 소관이라 여기서 세지 않는다)
1. [hover] `rg -n 'hover:(-?translate-y|scale-|shadow-)|group-hover(/[\w-]+)?:(scale-|-?translate-y)|whileHover|active:scale-\[0\.98\]'` 0건.
2. [루프] `rg -n 'repeat: *Infinity|animate-(ping|pulse|bounce|shimmer|text-gradient|float-tag|dot-pulse|digit-glow|shake)|(^|[^-\w])blur-(sm|md|lg|xl|2xl|3xl|\[)|backdrop-blur'` 0건(로딩 스피너 `animate-spin`·`*/loading.tsx` 제외). `rg -n infinite app/globals.css app/styles`에 남는 키프레임은 허용 목록(spin, admin 전용 셀렉터, 스켈레톤 점멸)뿐.
3. [반경·그림자] `rg 'rounded-(2xl|3xl|\[(1[6-9]|[2-9][0-9])px\]|\[[0-9.]+rem\])'` 0건. `rg '\bshadow-(sm|md|lg|xl|2xl|card)\b|shadow-\['` 0건(예외: `components/ui/card.tsx`의 `legacy` 문자열 1건). `shadow-deep`은 Dialog·드롭다운·토스트·모바일 메뉴 파일에만.
4. [dashoffset] `rg 'stroke-dashoffset|draw-path|pathLength' app components` 0건.
5. [자동] `rg 'setInterval|AUTO_SLIDE|AUTO_ADVANCE|useInView' components/sections` 0건.
6. [정직성] `rg -n 'countTarget|CountUp|1,200만원|[0-9]+%' components/sections/ProblemCost.tsx` 0건. CaseStudies dl에 숫자 성과 칸 0. 렌더되는 모든 사례 사진에 `FigureSource`가 있고 credit에 '○○'가 없다. DashboardPreview Frame에 점선 '예시 화면' 태그가 있고 목업 수치마다 '예시'가 있다.
7. [토큰] 이 스펙이 정의하는 CSS 변수 0: `rg -- '--motion-(story|progress|carousel)|--masthead-pt' app components` 0건. `.on-ink`·`.card-title`·`.stagger`·`.progress-rule` 0건.
8. [card] `npx vitest run tests/ui/card.test.tsx` 통과 — `<Card />` 기본 className이 현행 문자열과 같다.

**렌더 검사**(Playwright 375×812·1440×900, 홈·/pricing·/product·/product/hw·/product/sw·/docs)
9. [카드] `[data-card]`의 computed box-shadow가 전부 `none`(예외 없음), border-radius ∈ {8px, 12px}. 빌드 HTML 예산 `[data-surface="sheet"] [data-card]:not([data-card="toc"])` 0건.
10. [hover] 마우스 hover 시 링크 카드의 computed transform 변화 0, border-color `rgba(17, 17, 16, 0.16)`, 제목 color와 text-decoration 변화 0, 화살표 `translate: 2px 0`. 정보 카드는 hover 전후 computed style 차이 0. 터치 `:active` border-color strong(iOS 실기기 1회).
11. [SSR·no-JS] 운영 프리뷰 홈 HTML에서 `grep -oE 'style=.[^>]*opacity: *0(\.0+)?[;\x22]'` 0건. SolutionOverview 3단계 headline이 HTML에 각 1회. `javaScriptEnabled: false`에서 모든 섹션 텍스트가 보이고, `.os-node .status-dot` opacity 1, `[data-seq]` opacity 1, `.row-accent::before` opacity 1, `.masthead::before` 애니메이션 0.
12. [무장 깜빡임 0] no-preference에서 마운트 시 뷰포트 안에 있던 Reveal에는 `data-reveal`이 생기지 않는다. 첫 화면을 1.8초와 3.5초에 캡처한 픽셀 차이가 0(Hero 밑줄 페이드는 940ms에 끝난다).
13. [reduced] `reducedMotion: 'reduce'`로 홈을 끝까지 스크롤하는 동안 `.reveal-anim, .os-node, .row-accent, [data-seq], [data-moment]` 하위의 running 애니메이션 0. Manifesto 두 줄 opacity 1, 밑줄 색 = `--fg-accent`.
14. [탭] SolutionOverview·KeyUseCases: 30초 관찰 동안 활성 인덱스 변화 0. ←/→/Home/End 동작. axe aria 위반 0. 탭 전환 중 tablist의 layout-shift 기여 0(굵기 500 고정). 로드 직후 활성 패널의 `getAnimations()` 0(첫 페인트 페이드 없음), 탭 클릭 뒤 1회 320ms. KeyUseCases HTML 안 Frame 1개.
15. [CaseStudies] `setInterval` 0, framer import 0, 30초 동안 활성 인덱스 변화 0, 이웃 슬라이드 마우스 클릭으로 활성 변경, article에 `inert`·`aria-hidden` 0이고 안쪽 래퍼에만 `inert`, near opacity 0.72 + `.case-body` opacity 0, 이동 transition 320ms, scale 0.
16. [잉크 밑줄·스크럽] iPhone Safari 실기기에서 Hero 밑줄 색 페이드가 보인다(실패하면 키프레임을 빼고 정적 밑줄로 둔다, C25). iOS 26 Safari 실기기·Chrome에서 Manifesto 두 줄 opacity .18→1 스크럽. iOS 18 Safari·Firefox 안정판·reduced·높이 499px에서는 처음부터 opacity 1, 밑줄 완성(캡처 4장). 스크럽 대상 조상 체인의 computed overflow-x/y에 hidden·auto·scroll 0(clip만). html/body `overflow-x: hidden; overflow-x: clip` 쌍 유지.
17. [상한] 홈 DOM: `[data-moment]` 5(≤6), `.ink-underline` 1, `.ink-underline-scrub` 1, `.pattern-grid` 1, `.masthead` 6, 섹션당 `[data-reveal]` ≤1, `video[loop]` 0, `getAnimations()`에서 `iterations === Infinity` 0(스피너·스켈레톤 제외), LogoBar 애니메이션 0, 홈 Kicker 7.

**성능·접근성·게이트**
18. [성능] 모바일 Lighthouse 3회 중앙값으로 홈·/product/hw·/product/sw CLS ≤ 0.05, TBT는 기준선보다 나빠지지 않는다. 4× CPU 트레이스에서 홈을 끝까지 스크롤하는 동안 애니메이션 원인 50ms 초과 long task 0. 홈 네트워크 로그에 recharts 청크 0. `rg -l framer-motion components/sections` 0개.
19. [접근성] axe 4.x(`reducedMotion: 'reduce'`)로 홈·/pricing·/product에서 color-contrast·aria 위반 0. 카드 메타 #615D59, ○ 링 #8F8A84. 상태 점은 항상 텍스트 라벨과 함께. Hero 밑줄 구절이 360px 폭에서 줄바꿈되어도 가로 스크롤 0.
20. [포털 포커스] 공개 페이지에서 DemoModal을 열고 Tab으로 이동한 버튼의 outline이 `2px solid rgb(8, 71, 52)`. `/admin`의 Dialog·토스트에는 `.site` 조상이 없다.
21. [게이트] `npm run typecheck` → `npx eslint app components lib --max-warnings=0` → `npm run build`(prebuild `check:design-tokens` 포함) → `npx vitest run` 통과. 가드는 처음 2주 warn, 그 뒤 규칙별 error(system §6).

---

## 9. DESIGN.md 반영안 (cards_motion 몫)

DESIGN.md는 system §10에 따라 '적용 범위: public(.site) / admin'으로 구획하고 토큰마다 상태 배지(in force / target / retired)를 단다. 아래는 붙여넣기용이다. 보더·섀도 토큰 정의(§2)와 먹선 목록은 surfaces 반영안이 정본이고, 여기서는 카드·모션 절만 낸다.

**[교체] §4 「카드」(DESIGN.md:211-216)**

```markdown
### 카드 — 지면 블록 8종  `public(.site)` · target
어드민 카드(흰 바탕·hair·12px·Card Shadow)는 그대로다 `admin` · in force. `components/ui/card.tsx` 기본 출력은 바꾸지 않고, 공개 화면은 `family`를 명시한다.

공통
- 그림자 0, 반경 8·12만. 테두리 1px `--line-hair`.
- 링크인 카드·목차 행·FAQ 행의 hover·focus-within: 경계 hair→strong(160ms, ease-soft) + 화살표 2px. 제목 색·밑줄·배경·그림자·카드 위치는 바뀌지 않는다. pressed는 같은 끝 상태를 즉시.
- 정보 카드(링크 없음)는 hover 0. 포커스는 전역 2px #084734 outline.
- 금지: 들림, 확대, 기울임, 그림자 증가, 채움 변화, 아이콘 확대, 사진 hover 확대, 장식용 좌측 컬러 바.
- 의미 있는 좌측 2px 바는 세 곳: Comparison Classin 열, /pricing 선택 행, 세로 목차 현재 항목.
- 번호 'No. 01'은 순서 있는 묶음만. 병렬 카드는 범주 라벨(13/600 #084734, 바 없음). 한 페이지 번호 체계 2종 이하.
- 바닥 짝: sheet 면 카드(인덱스·사례·요금)와 Frame은 paper·sunken 위에만. sheet 섹션에는 박스 없는 블록만. 먹 지면에는 카드 0.

| 블록 | 면·반경 | 패딩 데스크톱 / 모바일 | 제목 / 본문 | 쓰는 곳 |
|---|---|---|---|---|
| 인덱스 | sheet · 8 | 24 / 20(머리띠 위 14 + 아래 hair) | H3 600 / 16·1.75 #31302E | 기능·특징 그리드, 헤어라인 그리드 |
| 수치 | 박스 없음 · 위 1px strong | 위 16 | Numeral 600 tabular / 출처 13 #615D59 | lib/facts.ts 등록 수치만(SSR 값, 카운트업 0) |
| 인용 | 박스 없음 · 위 1px hair | 위아래 24 | Quote 500 / 바이라인 14 | 후기(최대 6, 120자, 2단 column-rule) |
| 사례 | sheet · 12 | 본문 24 / 20 | H3 / 16·1.75 + dl 사실 3칸 | 도입 사례(사진 3:2, 출처 라벨 필수, 미확인 컷은 사진 없이) |
| 요금 | sheet · 12(추천 1px #111110 + '추천' 탭) | 28 / 24 | H3 / 가격 700 tabular | 요금·선택. Check는 추천 Plan만 #084734 |
| 목차 행 | 박스 없음 · 위 1px hair | 56px 열·위아래 20 / 40px 열·위아래 16 | Body L 600 / 14 #615D59 | 문서·자료·행사·업데이트 목록 |
| Frame | sheet · 8, 제목줄 없음 | 도판 + 캡션 | 캡션 13 #615D59 | 목업(안쪽 점선 '예시 화면')·실제 화면. 섹션당 1 |
| CTA 띠 | sunken(마지막, rule-double) / paper(중간, 위아래 hair) | — | h2=text-h1 / Body L | FinalCTA(primary cta 52), 중간 띠(line cta) |

상태 점 ○ ● –는 상태에만 쓰고 항상 텍스트와 함께 쓴다.
```

**[교체] §7 5번(DESIGN.md:268)**
`5. 섀도: 공개 화면(.site)은 떠 있는 레이어(Dialog·드롭다운·토스트·모바일 메뉴)만 --shadow-deep이고 카드·Frame·표·컨트롤·섹션은 0이다. 어드민은 Card Shadow를 유지한다.`

**[추가] §7 9·10번**
- `9. (public) 카드 hover는 경계 hair→strong 160ms와 화살표 2px뿐이다. 들림·확대·그림자·채움·제목 색·밑줄 변화는 금지한다.`
- `10. (public) 카드와 섹션 배경은 움직이지 않는다. 움직임은 §8 목록 안에서만 쓰고, 미완 상태는 [data-reveal="out"]과 prefers-reduced-motion: no-preference 안에서만 정의한다.`

**[신설] §8 「모션 — 카드·배경」 `public(.site)` · target**

```markdown
## 8. 모션 — 카드·배경

원칙
- 지면은 평면이고 배경은 정지한다. 움직임은 투명도다(예외: Reveal 12px 이하 상승, 사례 캐러셀 이동, 잉크 밑줄 색).
- SSR·JS 없음·동작 줄이기에서는 항상 완성 상태. 미완 상태는 site-base.css의 no-preference 블록 한 곳에만.
- 홈 무한 루프 0, 자동 진행 0, 마키 0, 카운트업 0, stroke-dashoffset 0.

토큰(app/styles/tokens.css): --motion-fast 160ms · --motion-base 320ms · --motion-slow 700ms · --motion-rise 12px · --motion-stagger 80ms(●점등 전용) · --ease-soft cubic-bezier(.22,1,.36,1). reduced에서 rise 0, stagger 0.

홈 서사 모먼트(data-moment, 상한 6)
| # | 모먼트 | 메커니즘 |
|---|---|---|
| ① | Hero 잉크 밑줄 | text-decoration-color 페이드 700ms, 지연 240ms, CSS만 |
| ② | Manifesto 스크럽 | view() opacity .18→1 + 밑줄 색. @supports·no-preference·높이 500px 이상 |
| ③ | SolutionOverview ●점등 | 6노드 opacity .25→1, 700ms, 80ms 간격, 1회 |
| ④ | DashboardPreview 차트 | [data-seq] 3레이어 opacity, 0/240/480ms, 40% 노출 |
| ⑤ | Comparison 행 액센트 | Classin 열 2px 바 opacity, 700ms, 1회 |
| (6) | 사실 레지스트리 | 출처 있는 수치 1개를 정적 값으로(모션 0) |

조작 전환: 탭 패널 320ms(첫 페인트 제외) · 캐러셀 320ms · 카드 hover 160ms · Reveal 700ms(섹션당 1개, 카드 순차 없음) · 페이지 이동 opacity만.

금지: shimmer, 스윕, conic 테두리 빛, 글로우 펄스, ping, bob, 파티클, 블롭, 라이브 카운터, 무한 점멸·웨이브폼, 자동 전환, filter·box-shadow·width·height 애니메이션, 상시 will-change, 한국어 글자 쪼개기, 탭 굵기 변화.

예산: 한 뷰포트 동시 진행 10 이하 · 애니메이션 원인 long task 0 · 모션의 CLS 기여 0 · 공개 Recharts 0 · 홈 섹션 framer 0.
```

**결정 로그·문서 동기화(cards_motion 몫)**
- 결정 로그(system §10)에 V4-A·V5-A·V7-A의 카드·모션 결과를 적는다: 먹 서사 1곳, ProblemCost 정성 장부, FinalCTA sunken 띠, 배경·카드 정지(V7-B는 보드 비교 칸 정지 이미지만, 코드 없음).
- 감사 문서 동기화: §5-2(`--motion-story`·`--motion-progress`·`--motion-carousel` 토큰 삭제(X13), `lib/motion.ts` 미작성), §5-4(LogoBar 정적 목록, SolutionOverview 수동 탭, ProblemCost 정성 장부·카운터 0, DashboardPreview opacity 순차·Recharts 0, CaseStudies 수동, 장 머리 괘선 정적), §5-8(자동 진행 0, 예외 마키 삭제).

---

## 10. 하지 말 것

| Do | Don't |
|---|---|
| 링크 카드 hover: 경계 hair→strong 160ms + 화살표 2px | `hover:-translate-y-*`, `hover:scale-*`, `hover:shadow-*`, `whileHover`, 제목 색·밑줄 hover, 먹선 hover |
| pressed: 같은 끝 상태, `duration-0` | 카드 `active:scale-*` |
| 순서 있는 묶음만 `No. 01`, 병렬 카드는 범주 라벨 | 병렬 카드 번호, 민트·그라데이션 아이콘 타일, 카드에 Kicker |
| sheet 카드는 paper·sunken 위에 | 흰 섹션 위 흰 카드, 먹 위 카드·Frame |
| 숨김 상태는 `[data-reveal="out"]` + no-preference 안에서만 | framer `initial={{opacity:0}}`, SSR 인라인 `opacity:0` |
| Reveal은 섹션당 1개, 모먼트는 `bare` | 카드마다 Reveal, 그리드 자식 순차 페이드, 항목별 delay |
| 움직임은 opacity(선은 켜진다) | stroke-dashoffset, `width` 막대, scaleX 긋기, 머리 괘선 긋기 |
| 탭·캐러셀은 사람이 넘긴다 | 자동 진행, 진행 괘선, 캐러셀 자동 넘김, 마키 |
| 수치는 `lib/facts.ts` 등록분을 SSR 값으로 | 카운트업, 근거 없는 수치를 장부·표·KPI로 권위화 |
| ○●–는 상태 표시에만, 텍스트와 함께 | '○ 예시 화면', 로고 앞 점, 장식 불릿 |
| 그림자는 떠 있는 레이어만 `shadow-deep` | 카드·Frame·표·버튼 그림자, 'featured' Frame 그림자 |
| 반경 8 / 12 | `rounded-2xl` 이상, `rounded-[16px+]` |
| 먹 지면은 `Section surface="ink"` / `surface-ink` | `bg-[#111110]`, `bg-surface-ink`, 먹 위 #084734 하드코딩 |
| 의미 있는 좌측 2px 바 3곳 | 모든 카드·토스트의 좌측 컬러 바 |
| 공유 `card.tsx` 기본 출력 유지, 공개는 `family` 명시 | 기본값을 바꿔 어드민·checkout 화면을 흔들기 |

---

## 11. 열린 질문

1. **ProblemCost 6행 질문형 문구는 누가 확정하나요?** 이 스펙은 행 구조(○ + 모듈명 + 질문형 문장)와 수치 0만 정했고, 예시는 1줄("강사가 바뀌면 수업 품질도 바뀌나요?")뿐입니다. 콘텐츠 담당 확정 전에는 step 5를 머지하지 않습니다.
2. **사례 사진 7건의 출처(credit)와 공개 동의(감사 D4)를 확인할 수 있나요?** `FigureSource`가 필수라 확인되지 않은 컷은 사진 없이 본문만 렌더합니다(imagery와 같은 기본). 전부 미확인이면 캐러셀이 사진 없는 카드 7장이 됩니다.
3. **imagery에 요청: Frame 루트에 예산 검사용 표지 속성(`data-frame`)을 달아 줄 수 있나요?** system §6의 '섹션당 Frame ≤1'과 '[data-surface=sheet] 안 sheet 면 0' 검사가 Frame을 셀 셀렉터가 필요합니다. Card의 `data-card`와는 분리합니다(Frame은 Card가 아님, X10).
4. **수업 OS 지도 노드를 '전 1 / 중 2 / 후 3'으로 확정해도 될까요?** 기존 SolutionOverview 문구를 따른 배정입니다. 2/2/2로 맞추려면 학생 관리를 '전'으로 옮기고 1단계 points 문구를 바꿔야 합니다.
5. **GlobalScale은 `lib/facts.ts`에 출처 있는 수치가 하나도 등록되지 않으면 어떻게 할까요?** 기본은 칸 수를 등록분만큼 줄이고, 0이면 섹션을 렌더하지 않는 것입니다. 감사 D3·D8(섹션 통합) 결정과 함께 정해 주세요.
6. **블로그 목록 카드는 '대표 + 3열 카드' 구조를 유지하고 사진 hover 확대와 블러만 빼는 안이 맞나요?** 블로그 세션의 미커밋 변경이 같은 파일에 있어, 그 커밋 뒤에 step 14에서 반영합니다.
7. **X06 보강: 캐러셀 far 슬라이드 안쪽 래퍼에도 `inert`를 명시해도 될까요?** X06은 near에만 `inert`를 적고 far는 opacity 0·`pointer-events: none`만 둡니다. 그대로면 보이지 않는 far 슬라이드를 스크린리더가 읽습니다. 이 스펙은 비활성 전체(`inert={!isActive}`, §3-15 :153 행·§5-2 보조기기)에 거는 쪽으로 쓰고, X06에 "far도 안쪽 래퍼 inert" 한 구절 추가를 요청합니다.
