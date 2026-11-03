# 카드·배경 애니메이션 (cards_motion) — 최종 스펙 v3

> **방향** 「편집 지면 · OS판」 · **기준** HEAD `4c9e509c`(2026-10-26) · **정본** canonical C01–C28·X01–X16, naming, css_architecture, system 스펙(시스템 기반)
> **결정 번호** 방향 문서 결정은 V1–V9, 감사·모션 플랜 문서(`docs/active/public-site-audit-motion-plan-2026-10-26.md` §4) 결정은 '감사 D#'로 적는다(C03).
> **이 스펙이 적용한 결정**(V1–V9 A 확정 2026-10-27) V3-A(Hero 지면 표지) · V4-A(먹 서사 1곳 + 정성 장부) · V5-A(FinalCTA sunken 띠) · V6-A(획 1.5px, DPR1 2px) · V7-A(배경·카드 정지) · V9-A(Hero 배지 → Kicker). V2-A(인용 Pretendard 500)는 인용 카드에 반영했다.
> **고급화 반영** V10–V18 A 반영 2026-10-28(운영자 승인). 이 스펙에 닿는 것: V10-A(홈 11지면·중간 띠 1·사례 정적) · V11-A(캡처 전 무도판 표지) · V12-A·V13-A(Kicker·굵기, typography 정본을 참조만) · V14-A(반경) · V15-A(지면·먹 값) · V17-A(인쇄된 표지 + 잉크 템포)와 결정 없이 채택된 CO-9(열린 단)·C11 그린 배급·X06 개정·MO-2·MO-4·MO-9·MO-10·MO-8. 근거는 `docs/active/public-site-premium-elevation-2026-10-28.md`다. 이 스펙은 목표를 적고, 구현 여부를 말하지 않는다.
> **행 번호** `app/globals.css`는 HEAD 기준이다(다른 세션이 작업 트리를 고치는 중이라 작업 트리에서는 약 8행 밀린다). 나머지 파일은 작업 트리와 HEAD가 같다.

## 0. 요약

카드와 섹션 배경은 움직이지 않는다. 지면은 종이처럼 평면이고, 카드 그림자는 0이다. **둥근 것은 누를 수 있는 것뿐이다**(V14-A · 2026-10-28): 카드·도판·표·띠는 r0, 컨트롤과 떠 있는 층은 r6, 칩·점·스위치 썸은 원형이다. 글만 있는 카드는 상자 없는 **열린 단**이다(CO-9). 움직임은 **투명도와 색**이고, 홈의 서사 모먼트는 4개다(①②③⑤, 상한 6. ④ 자리는 DashboardPreview가 홈에서 빠져 비고, 6번째 슬롯은 출처 있는 수치를 정적 값으로 둘 자리).

- **카드·블록 8종**: 열린 단(column) · 수치 · 인용 · 사례 · 요금 · 목차 행 · Frame(imagery 소유, 참조) · CTA 띠. 링크인 단·카드·목차 행·FAQ 행의 hover·focus-within은 **경계 hair→strong + 화살표 2px** 두 가지뿐이다(C13). 손이 닿으면 160ms로 들어가고 떠나면 320ms로 돌아온다(V17-A). 제목 색·밑줄·먹선·배경·그림자·카드 이동은 바뀌지 않는다.
- **홈 서사 모먼트 4개**(`data-moment`, C08): ① Hero 잉크 밑줄 색(240ms 뒤 900ms) ② Manifesto 스크럽 ③ 03 흐름 OS 지도 ○→● 점등(02 공감 장부의 콜백, MO-2) ⑤ 06 확신 Comparison 행 액센트.
- **첫 화면은 인쇄된 표지다**(V17-A). Hero는 첫 프레임부터 정지해 있고, 움직이는 것은 잉크 밑줄 한 획뿐이다. 캡처가 커밋되기 전 Hero는 도판이 없다(V11-A).
- **홈 무한 루프 0, 자동 진행 0**(C07). Hero 영상 없음(V3-A), LogoBar 정적 목록(X16), SolutionOverview 수동 탭, 홈 사례는 3건 정적 배치(캐러셀은 4건 이상인 목록 지면에서만, X06 개정). 지금 운영 홈에는 무한·자동 루프가 4개 있다(LogoBar 마키, CaseStudies 8.5초 자동 넘김, 챗봇 ping·앰비언트 글로우).
- **공개 페이지 이동 모션 0**(MO-10). 느린 이동은 300ms 뒤에야 나타나는 숨쉬는 스켈레톤이 받는다(MO-9). 도판은 decode 전일 때만 opacity로 현상한다(MO-4). Dialog·메뉴·드롭다운·토스트는 닫힐 때 160ms 페이드로 빠진다(V17-A).
- **stroke-dashoffset·`.draw-path` 사이트 전체 0**(C06). 장 머리 괘선은 정적이다(X04). 카운트업 0(C08).
- **이 스펙이 정의하는 토큰은 0개다.** 모션 토큰은 `app/styles/tokens.css`(X13)에 있고, V17-A로 그곳에 더해지는 `--motion-beat`·`--ease-fade`·`--focus-offset`을 이 스펙이 소비한다. 모션 무장 CSS는 `app/styles/site-base.css`의 `@layer components` 안 `prefers-reduced-motion: no-preference` 블록 하나에 둔다(css_architecture).
- 공유 `components/ui/card.tsx`의 기본 출력(`legacy`)은 바이트 그대로 둔다(C17·X05). 공개 화면은 명시한 `family`(column·case·plan·plain)로만 새 모양을 받는다.

---

## 1. 원칙

1. **카드와 배경은 정지한다.** 섹션 배경 처리는 plain 한 가지이고(C19), 모눈은 도해 figure 자체의 정지 배경(`pattern-grid`, 페이지당 1개)뿐이다. 카드 안에도 루프·스윕·빛·카운터가 없다(V7-A).
2. **위계는 선의 농도와 글자로 만든다.** 1px `--line-hair`(.08) → `--line-strong`(.16) → `--line-ink`. 먹선은 닫힌 목록 5곳에만 쓴다(X04, §3-0). 번호는 한 페이지 2종 이하(C24)이고, 홈은 Act 폴리오 01–06과 05 기록 각주 번호(¹) 2종이다(system §5-5 개정).
3. **움직임은 투명도와 색이다.** 움직이는 속성은 opacity가 기본이다. 변위 예외는 둘로 닫는다: Reveal의 translateY(≤12px, 2D), 사례 캐러셀의 translateX(4건 이상 목록 지면의 조작 전환). 색 전이는 셋이다: 잉크 밑줄의 `text-decoration-color`(C25), OS 지도 ●점등(MO-2)과 폼 성공 패널(`success-panel`, controls 소유)의 `status-dot` 테두리·채움 색, hover 경계 색. 긴 글 읽기 괘선은 스크롤에 직결된 선이라 자동 재생이 아니다(§3-16). 도판·카드의 scale·회전·dashoffset·그림자·filter·clip-path·mask 애니메이션은 0이다.
4. **보이는 상태가 기본이다.** SSR·JS 없음·동작 줄이기에서는 처음부터 완성 상태다. 미완 상태는 JS가 "아직 화면 밖"이라고 확인한 요소의 `[data-reveal="out"]`에서만, 그것도 `prefers-reduced-motion: no-preference` 안에서만 무장한다(X07). Hero는 첫 프레임부터 완성이다(진입 애니메이션 0, V17-A).
5. **한 번이고, 사람이 넘긴다.** 서사 모먼트는 1회다. 자동 진행·자동 넘김·마키는 없다. 탭과 캐러셀은 조작 전환만 있다(C07). 홈 사례는 넘기지 않고 3건을 함께 둔다(X06 개정).
6. **hover는 보조 신호다.** 끝 상태는 경계 한 단계 + 화살표 2px이다(C13). 반응은 즉각, 퇴장은 여운이다: 진입 160ms, 이탈 320ms(V17-A). 상태 전달의 책임은 전역 focus outline(2px `--fg-accent`, offset `--focus-offset`)이 진다.
7. **정직하다.** 근거 없는 수치는 지면에 없다(ProblemCost 수치 0, 카운트업 0). 목업은 Frame 안 점선 태그 '예시 화면'으로, 사진은 출처 라벨로 표시한다(C05·X11). 라벨은 출처 장부(`data/image-credits.json`)에서 나오고, 출처를 확인하지 못한 도판은 싣지 않으며 어떤 라벨도 짐작해 달지 않는다(X10·X11 개정).
8. **둥근 것은 누를 수 있다**(V14-A). 반경 값은 0·6·원형 셋뿐이다. 반경이 장식이 아니라 '누를 수 있음'의 정보가 된다(§2-2).

---

## 2. 토큰 (CSS + Tailwind @theme)

### 2-1. 소비하는 토큰 — 정의는 `app/styles/tokens.css` 한 곳(X13)

토큰의 값과 선언은 `app/styles/tokens.css`(`:root`·미디어 재정의·`.surface-ink`·`@theme inline`) 한 곳에만 있다(X01·X13·C01·C02, css_architecture). 이 스펙은 블록을 옮겨 적지 않고 이름만 참조한다. 이 스펙이나 다른 파일에서 다시 선언하지 않는다(가드: tokens.css 밖의 `--(surface|fg|line)-` 선언 금지).

- 시간: `--motion-fast` 160ms(hover·focus 진입, index-tab 막대, 링크 색, 오버레이 닫힘) · `--motion-base` 320ms(hover 이탈, 탭 패널 교체, 사례 캐러셀 이동, os-node 현재 열 윤곽, 입력 오류 테두리 페이드 — controls) · `--motion-slow` 900ms(Reveal, 잉크 밑줄, ●점등, 차트 레이어, 행 액센트, 도판 현상. 컨트롤은 쓰지 않는다. V17-A · 2026-10-28, 지금 700ms) · `--motion-beat` 240ms(모먼트 지연과 차트 순차 간격, V17-A 신설) · `--motion-rise`(Reveal 이동 상한) · `--motion-stagger`(●점등 노드 간격 전용, X07). reduced 재정의도 tokens.css 몫이다.
- 곡선: `--ease-soft`는 변위(Reveal 상승·캐러셀)와 조작 전환(hover·탭 패널)에, `--ease-fade` `cubic-bezier(.33,1,.68,1)`(V17-A 신설)는 opacity·색만 바꾸는 모먼트와 도판 현상에 쓴다. `--ease-drift`는 로딩 스켈레톤 숨쉬기 `--animate-skeleton`(`skeleton-breathe` 2.4s, MO-9. 정의는 system §3-4/§13-3 한 곳)이 소비한다. Manifesto 스크럽은 `linear`다.
- 포커스: `--focus-offset` 2px(보증 ①의 outline-offset, V17-A 신설). 카드·단은 2px이고, 글 링크 3px·입력 −1px 겹침은 controls 소관이다(MO-5).
- 색·선·획: `--surface-paper|sheet|sunken`, `--fg-ink|body|muted|accent`, `--line-hair|strong|ink|control`, `--stroke-pen|accent`. 먹 지면 재정의는 C01 블록을 따른다. 값은 V15-A를 따른다(§5-3).

### 2-2. Tailwind 4 유틸

`@theme inline` 매핑도 tokens.css 정본이다(C02, naming 1·2). 이 스펙이 쓰는 결과 유틸: `ease-soft`, `bg-surface-paper|sheet|sunken`, `text-fg-*`, `border-/divide-line-hair|strong|ink|control`, `aspect-case|screen|portrait`, `max-w-deck|page`. `--color-surface-ink`는 매핑되지 않는다.

**쓰는 법**
- 시간과 곡선: hover 대상은 `transition-colors duration-(--motion-base) ease-soft hover:duration-(--motion-fast) focus-visible:duration-(--motion-fast)`로 쓴다. 기본 상태의 320ms가 이탈 시간이 되고, hover·focus의 160ms가 진입 시간이 된다(V17-A · 2026-10-28, C13 끝 상태는 그대로). 리터럴 `duration-200`·`duration-[400ms]`는 쓰지 않는다.
- 색: `bg-surface-sheet` · `text-fg-body` · `border-line-hair` · `hover:border-line-strong` · `divide-line-hair`. 먹 지면은 `surface-ink` 클래스(또는 `Section surface="ink"`)로만 칠한다. `bg-surface-ink`·`bg-[#111110]`·`text-(--fg-*)`는 없다(C02). 지금 `surface-ink`에 붙은 하드코딩 bg는 토큰을 덮으므로 V15 토큰 PR에서 함께 지운다(surfaces 소관).
- 비율: 사례 사진 `aspect-case`, 화면 캡처 `aspect-screen`(X06).
- 반경(V14-A · 2026-10-28): **둥근 것은 누를 수 있는 것뿐이다.** 값은 0·6·원형 셋이다.
  - 물건 r0(`rounded-*` 없음): 카드·열린 단·Figure·Frame·표·띠·IconFrame·도해 노드·'예시 화면' 태그.
  - r6(`rounded-md`): 컨트롤(V8 입력·버튼·스위치)과 떠 있는 층(Dialog·드롭다운·토스트·모바일 메뉴).
  - 원형(`rounded-full`): 필터 칩·상태 점·스위치 썸(스위치 트랙은 r6). chatbot 파트 합의 전까지 기존 챗봇 런처도 원형 예외다.
  - 가드는 허용목록 방식이다. 공개 파일에서 `rounded-md`는 컨트롤·떠 있는 층 파일에만, `rounded-full`은 필터 칩·상태 점·스위치 썸(·기존 챗봇 런처)에만 허용하고, 그 밖의 `rounded-*`는 막는다. 공유 `card.tsx`의 `legacy` 문자열(`rounded-xl` 포함)은 바이트 그대로 두고 베이스라인 예외로 센다.
- 그림자: 카드·Frame·표·섹션 0. 떠 있는 레이어만 `shadow-deep`(X05).

### 2-3. 이 스펙이 소유하는 CSS 이름 (site-base.css `@layer components`)

| 이름 | 종류 | 용도 |
|---|---|---|
| `.os-node` | 컴포넌트 클래스 | 수업 OS 지도 노드(윤곽 박스 + 현재 열 액센트 윤곽) |
| `.row-accent` | 컴포넌트 클래스 | Comparison Classin 열 셀의 좌측 2px 바(C21 ①) |
| `.case-slide`, `.case-body` | 컴포넌트 클래스 | 사례 캐러셀 슬라이드와 숨김 대상 본문(X06, 4건 이상 목록 지면만. 홈 0) |
| `@keyframes ink-fade` · `panel-in` · `scrub-in` | 키프레임 | 잉크 밑줄 색 페이드, 탭 패널 교체, Manifesto 스크럽 |
| 모션 무장 블록 | `@media (prefers-reduced-motion: no-preference)` | Reveal·잉크 밑줄·●점등·`[data-seq]`·행 액센트·탭 패널·스크럽(§3-14) |

**만들지 않는 것**: `--motion-story`·`--motion-progress`·`--motion-carousel`(소비처 0, X13), `--masthead-pt`(X04), `.on-ink`(C01), `.card-title`·`.card-band`·`.stagger`(C13·X07), `.draw-path`(C06), `.progress-track/.progress-rule`·`.autoplay-toggle`(C07·C12, 자동 진행 괘선용. 긴 글 읽기 괘선은 §3-16), `.masthead--draw`(X04), `.state-dot`(→ icons `status-dot`), `lib/motion.ts`(홈 framer 소비처 0, YAGNI), `usePauseWhenHidden`(홈 자동 진행·영상 0. 제품 영상 정지 장치는 imagery 소관).

`cn()` 병합 설정(15종 text 토큰 등)은 `lib/utils.ts` 한 곳에서 system 스펙이 소유한다(C18, naming 5). 이 스펙은 따로 목록을 두지 않는다.

---

## 3. 패턴과 값 (데스크톱 / 모바일)

### 3-0. 카드 공통 상태 (C13)

| 상태 | 경계 | 화살표(`ArrowRight` 16, `arrow-nudge`) | 바뀌지 않는 것 |
|---|---|---|---|
| rest | `--line-hair`(열린 단·TocRow·FAQ 행은 위 테두리) | `--fg-muted`, 0(링크 단·카드는 늘 보인다) | — |
| hover (Tailwind v4 `hover:` = `@media (hover:hover)`) | `--line-strong`. 진입 `--motion-fast` 160ms, 이탈 `--motion-base` 320ms, `--ease-soft`(V17-A) | translateX(2px), 진입 160 · 이탈 320ms | 제목 색, 밑줄, 배경, 그림자, 카드 위치·크기 |
| focus-within / focus-visible | `--line-strong` + 전역 outline 2px `var(--fg-accent)`, offset `var(--focus-offset)` 2px(site-base 보증 ①) | 2px | 카드별 `ring-*` 금지 |
| pressed(`:active`) | `--line-strong`, `duration-0` | — | `active:scale-*`(버튼 `.98`, 누름 0ms · 뗌 320ms만 controls 소관, V17-A) |
| 정보 카드(링크 없음) | 변화 0 | 없음 | 전부 |

- 끝 상태(경계 strong + 화살표 2px)는 바뀌지 않는다. V17-A가 바꾸는 것은 타이밍뿐이다(진입 160 / 이탈 320, C13).
- 링크인 카드·단은 루트 자체가 `<a>`(`Link`)이고 히트 영역은 단 전체다. `arrow-nudge`(controls 유틸)는 조상 `a`·`button`의 hover·focus-visible에 반응하므로 루트가 링크여야 동작한다.
- **그린 배급**(C11 개정 · 2026-10-28): 비상호작용 그린 표지(잉크 밑줄·● 묶음·좌측 2px 바·차트 강조 계열·인용 여는 따옴표)는 뷰포트당 2개 이하다. 그린 채움은 primary 1개다. 강조 아이콘은 한 뷰포트에 1그룹까지다. 링크·버튼·포커스·index-tab은 세지 않는다. 카드 범주·사례 지역 라벨은 `text-fg-muted`다.
- `--line-ink`는 hover에 쓰지 않는다. **먹선 닫힌 목록 5곳**(X04): Act·장 머리 괘선(`masthead`) · 표 상단 · 숫자 열이 있는 장부의 합계 이중선 · CTA 띠 `rule-double` 윗선 · 추천 Plan 테두리.
- **의미 있는 좌측 2px 바 3곳**(C21): Comparison Classin 열 셀(`.row-accent`) · /pricing 선택 가이드가 고른 비교 행 · 세로 목차의 현재 항목. 장식용 좌측 컬러 바와 토스트 상태선은 없다.

### 3-1. 요약표

| # | 패밀리 | 면 | 테두리 | 반경 | 패딩 데스크톱 / 모바일 | 제목 | 본문·보조 | 상호작용 | 모션 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 열린 단(column) | 없음 | 위 1px hair(64rem 이상 단 사이 세로 hair) | 0 | 위 24 / 20, 단 간격 48 / 32 | `text-h3` | `text-body` `--fg-body` | 링크일 때만(단 전체) | 섹션 Reveal 1개(자식 순차 없음) |
| 2 | 수치(Stat) | 없음 | 위 1px strong | — | 위 16 | `text-numeral` 비례 숫자(X14 개정) | 라벨 `text-caption` 500, 출처 이름 `text-caption` 500 `--fg-ink` · asOf `text-note` `--fg-muted` | 없음 | 정지. SSR 값, 카운트업 0 |
| 3 | 인용 | 없음 | 위 1px hair | — | 위아래 24 | `text-quote` 500 | 바이라인 `text-caption` | 없음 | 정지 |
| 4 | 사례 | sheet(사진 있는 사례만) | 1px hair | 0 | 본문 24 / 20 | `text-h3` | `text-body` + dl 사실 4칸 | 홈 없음(정적 3건) / 목록 지면 캐러셀 조작 | 홈 정지 / 캐러셀 transform·opacity 320ms |
| 5 | 요금(Plan) | sheet | 1px hair, 추천은 1px ink + '추천' 탭 | 0 | 28 / 24 | `text-h3` | 포함 항목 `text-body`(금액 칸 없음 — 체크아웃·요금 시뮬레이터 밖 금액 0) | 링크·버튼 | 정지 |
| 6 | 목차 행 | 없음 | 위 1px hair | — | 열 56px·위아래 20 / 열 40px·위아래 16 | `text-body-l` 600 `leading-snug` | `text-caption` `--fg-muted` | 행 전체 링크 | hover 경계 진입 160 · 이탈 320ms |
| 7 | Frame | sheet(40rem 이상 sunken 매트 안) | 1px hair | 0 | 도판 + 캡션(제목줄 없음) | — | 캡션 13 `--fg-muted` | 없음 | 정지(도판 현상 MO-4, 제품 페이지 안쪽 차트는 ④) |
| 8 | CTA 띠 | sunken(마지막) / paper(중간 1) | `rule-double`(마지막) / 위아래 hair(중간) | 0 | §3-10 | `text-h1`(마지막 h2) / 덱 1줄(중간) | `text-body-l` `--fg-body` | 버튼 | 정지(화살표 2px만) |

반경 열은 V14-A(2026-10-28)이고, 열린 단은 CO-9가 인덱스 카드를 대신한 것이다.

**글자 크기**: 임의 px(`text-[13px]` 등)는 쓰지 않는다. 13px는 `text-note`(400)·`text-label`(600)·`text-folio`(500), 14px는 `text-caption`, 15px `text-ui`는 컨트롤(버튼·탭·칩) 전용이라 카드·본문에는 쓰지 않는다(C18).

### 3-2. 열린 단(column) — 글만 있는 카드 (CO-9 · 고급화 2026-10-28)

글만 있는 카드(인덱스·후기·가치)는 상자 없이 지면에 바로 놓는다. 채움 0, 사방 테두리 0, 그림자 0, 반경 0이다. 단 위 1px hair 괘선과 여백이 단을 나눈다. sheet 상자는 물건(Frame·plate·요금·사진 있는 사례·폼·표)에만 쓴다. `card.tsx`의 공개 family `index`(sheet 상자)는 `column`으로 바뀐다.

```tsx
// 정보 단
<Card family="column">
  {(category || folio || Icon) && (
    <div className="mb-4 flex items-center justify-between gap-3">
      {folio
        ? <span className="text-folio tabular-nums text-fg-muted">No. {folio}</span>
        : category && <span className="text-label text-fg-muted">{category}</span>}
      {Icon && <Icon aria-hidden className="size-5 text-fg-muted" />}
    </div>
  )}
  <h3 className="text-h3 text-fg-ink">{title}</h3>
  <p className="mt-2 text-body text-fg-body">{body}</p>
</Card>

// 링크 단 — 루트가 Link, 히트 영역은 단 전체
<Link href={href} data-card="column" className={cardVariants({ family: "column", interactive: true })}>
  …같은 내용…
  <ArrowRight aria-hidden className="arrow-nudge mt-4 size-4 text-fg-muted" />
</Link>
```

- **위 괘선과 머리줄**: 단 위 1px `--line-hair`가 단의 시작이다. 위 여백은 데스크톱 24 / 모바일 20(기존 인덱스 패딩 값)이다. 머리줄(범주·번호·아이콘) 아래에는 hair를 따로 긋지 않는다(위 괘선과 겹친다).
- **링크 단**: 화살표는 늘 보인다. hover·focus-within은 위 괘선 hair→strong + 화살표 2px이고 C13 끝 상태와 같다(진입 160 · 이탈 320ms). 세로 hair는 hover에 바뀌지 않는다. 포커스 outline(보증 ①)은 단 전체를 감싼다.
- **번호 'No. 01'**: 순서가 실제로 있는 묶음(수업 전·중·후, 도입·온보딩 단계)에만 쓴다. 병렬 단은 오른쪽 범주 `text-label text-fg-muted`(13/600, Kicker 아님 — X15. C11 개정으로 그린에서 muted로)이거나, 범주가 없으면 머리줄 없이 제목부터 시작한다. 홈의 번호 체계는 Act 폴리오와 05 기록 각주 번호(¹) 2종이라 홈 카드 묶음에는 'No. 01'을 쓰지 않는다(C24, system §5-5 개정).
- **아이콘**: 머리줄 오른쪽 `size-5`(20) `--fg-muted` 1개까지. 민트·그라데이션 타일은 없다. 강조 아이콘(#084734)은 한 뷰포트에 1그룹까지이고, 비상호작용 그린 표지 예산(§3-0, C11)에 함께 든다.
- **배치**
  - 단 간격 32/48: 쌓일 때 단 사이 32px(`gap-y-8`), 64rem 이상 가로 단 사이 48px. 64rem 이상에서는 둘째 단부터 `lg:border-l lg:border-line-hair lg:pl-6` + 그리드 `lg:gap-x-6`으로 단 사이 가운데에 세로 hair를 둔다(24 + 24 = 48). 세로선은 border 유틸로 긋고 `bg-line-*`는 쓰지 않는다(C02 어휘).
  - Reveal 1개로 그리드 컨테이너를 감싼다. 단마다 감싸지 않고, 자식 순차 페이드는 없다(X07).
  - 기존 '헤어라인 변형'(sheet 바깥 상자 + divide)은 열린 단이 일반화해 대신한다. 바깥 상자를 두지 않는다.
  - 열린 단은 면이 아니므로 paper·sunken 어느 지면에도 놓는다. 먹 지면에는 두지 않는다(C14).

### 3-3. 수치(Stat) — 박스 없음

- 한 칸: ① 위 1px `--line-strong` ② 16px ③ `Numeral factId=…`(typography, `text-numeral` 600, 비례 숫자 — X14 개정 · 2026-10-28. 표·가격·폴리오·날짜는 tabular 그대로) + 단위 ④ 라벨 `text-caption font-medium text-fg-body` ⑤ 출처 — 이름 `text-caption font-medium text-fg-ink`(14/500) + asOf `text-note text-fg-muted`: `{source.name} · {asOf} 기준`(typography·imagery와 같은 값, 2026-10-28).
- **값의 출처는 `lib/facts.ts`뿐이다**(system §7). Numeral은 `factId`만 받고 숫자 prop은 받지 않는다. 등록되지 않은 수치(감사 D3·D5: ProblemCost 4종, HW 12개국·1,200+ 등)는 칸째 빠진다.
- **EEO 규모 수치**(system §5-5 개정): company-facts §3 값을 `lib/facts.ts`에 등록한다(source 'EEO 공식 소개(classin.com)', asOf '2026-06'). 홈 05 기록에는 160+개국·5,000만+ 교육자·학습자·월 3,000만+ 수업을 한 줄로 싣고, 같은 뷰포트에 13px 각주 '¹ EEO 공식 소개(classin.com) 기준 … 국내 도입 실적이 아닙니다'를 단다. 6만+ 기관·2억+ 누적은 About에만 싣는다.
- 데스크톱: 3~4칸, 둘째 칸부터 `border-l border-line-hair pl-6`. 모바일(`< 40rem`): 2열, 세로선 없음, 행 간격 24.
- 카운트업은 사이트 전체 0이다(C08). 예외가 없다.
- 예시 수치(목업 KPI)는 이 패밀리가 아니다. Frame(mock) 안의 목업 UI로만 그리고 같은 줄에 '예시'(14/600 `--fg-ink`)를 붙인다(X11).

### 3-4. 인용(Quote) — 박스 없음

- 바깥: `columns-[2_22rem] gap-x-14 [column-rule:1px_solid_var(--line-hair)]`. 모바일은 1단(22rem 미만이면 자동 1단).
- figure: `break-inside-avoid border-t border-line-hair py-6`.
- 인용문: `text-quote text-fg-ink`(Pretendard 500, V2-A). 여는 따옴표 “만 `text-fg-accent`이고, 비상호작용 그린 표지 예산(§3-0, C11)에 든다. 따옴표 매달기(−0.45em)는 typography 소관이다(TY-7).
- 바이라인: 24px 폭 1px 막대 `<span aria-hidden class="block w-6 border-t border-line-strong">`(`bg-line-*` 아님, C02) → 이름 `text-caption font-medium text-fg-ink`(14/500, P2 `small-semibold` 가드) → 소속 `text-caption text-fg-muted`.
- 제한(X06 개정 · 2026-10-28): 섹션당 **4개 이하**, 인용 하나 120자 이하. 운영 명사 1개와 바뀐 행동 1개가 있는 인용만 고른다. 별점·금색·박스·그림자·이니셜 원 아바타는 없다. 그린 채움 대표 후기 패널도 없다.
- 바이라인 표기: 별표 마스킹을 금지한다. 감사 D4(공개 동의 범위)에 따라 실명이나 서술형 익명 중 하나로 쓴다. 동의 행이 없는 인용은 렌더하지 않는다.

### 3-5. 사례(Case)

- **루트**: `<Card family="case">` → `overflow-hidden border border-line-hair bg-surface-sheet text-fg-ink` + `data-card="case"`. 반경 0(V14-A). sheet 상자는 **사진 있는 사례에만** 쓴다. 사진이 없는 사례는 상자 없이 열린 단(§3-2) 문법으로 본문만 렌더한다(CO-9).
- **홈 배치**(X06 개정 · V10-A · 2026-10-28): 홈 05 기록의 사례는 **3건을 정적으로** 둔다. 64rem 이상 3열, 모바일은 세로로 쌓는다. 캐러셀·자동 넘김·`.case-slide`는 홈에 없다. 공개 동의가 2건 이하면 2열로 둔다. 동의 행이 없는 사례는 렌더하지 않는다. 지금 `CaseStudies`는 8.5초 자동 넘김이다(바꿀 대상).
- **사진**: `relative aspect-case`(3:2, X06), `next/image fill`, `sizes="(width >= 48rem) 480px, 82vw"`, `unoptimized` 삭제, hover scale 0, 테두리는 `fig-edge`(imagery).
  - 출처: imagery Figure에 출처 장부 `data/image-credits.json`의 id 하나만 넘기고, 라벨은 장부에서 나온다(X10·X11 개정, IM-2). 실제 사진은 `사진 · {credit}`(credit 필수, '○○' 금지), 화면이면 capture 라벨. 캡션은 사진 바로 아래 C05 캡션 문법(12px → 1px hair → 8px, 오른쪽 라벨 `text-note text-fg-muted`)을 카드 본문 첫 줄로 둔다.
  - 장부에서 출처·동의(감사 D4, consentDocId·verifiedAt)가 확인되지 않은 컷은 **사진 없이** 간다(imagery와 같은 기본).
  - 홈 사례 사진 3장(대구·천안·대치)은 중립 패치 WB와 공통 그레이드를 거친다(IM-6, 흰점 = paper). 보정은 imagery 소관이다.
- **본문** `case-body p-5 sm:p-6`
  1. 지역·과목: `text-label text-fg-muted`(C11 개정. 바 없음, Kicker 아님 — X15). `ui/badge`는 import하지 않는다.
  2. 제목 `text-h3`은 변화 한 줄로 쓴다(TR-3). 기관 표기는 동의 범위에 따라 실명이나 서술형 익명이고, 별표 마스킹은 금지한다.
  3. 과제·변화 두 문단: 각 문단 앞에 `text-label text-fg-ink` 라벨, 본문 `text-body text-fg-body`(기존 `challenge`·`result`).
  4. dl 사실 **4칸**(X06 개정): 학원 유형 · 지역 · 도입 구성(제품명만, 대수 없음) · 운영 기간(YYYY.MM~). 성과 수치 칸 금지.
     - `mt-5 grid grid-cols-2 gap-y-4 border-t border-line-hair pt-4`(4칸 → 2열 2행), 둘째 열에 `border-l border-line-hair pl-4`
     - dt `text-note text-fg-muted`, dd `mt-1 text-body font-semibold text-fg-ink`
  5. PullQuote 소형(기존 `quote`·`attribution`, §3-4 선정 기준과 바이라인 규칙을 따른다).
- **캐러셀**(X06, 수동 전용 — **사례가 4건 이상인 목록 지면에서만**)
  - 슬라이드 상태는 `data-pos="active|near|far"`로 준다(인라인 opacity를 쓰지 않는다 — SSR 인라인 `opacity:0` 0건 기준).
  - active: opacity 1. near(이웃 1칸): opacity .72, `.case-body` opacity 0(사진과 제목만), 안쪽 래퍼 `inert`. far: opacity 0, `pointer-events: none`(X06). 이 스펙은 far 안쪽 래퍼에도 `inert`를 건다 — X06에 없는 **보강**으로, 투명한 슬라이드를 보조기기가 읽지 않게 하려는 것이다(열린 질문 7에서 X06 문구 보강 요청).
  - 이동: transform `--motion-base` 320ms `--ease-soft`, scale 0, 자동 넘김 0.
  - 슬라이드 폭 `min(82vw, 480px)`, 간격 24px. 캐러셀 컨테이너에 `isolate`(인라인 zIndex가 바깥 스택으로 새지 않게).
  - 키보드·보조기기 경로는 기존 이전·다음 버튼과 점 버튼이고, 이웃 슬라이드 클릭은 포인터 지름길이다.

### 3-6. 요금(Plan)

- 루트: `<Card family="plan" featured?>` → `relative border border-line-hair bg-surface-sheet p-6 sm:p-7`. 반경 0(V14-A · 2026-10-28). 추천 Plan은 1px 먹 테두리 + '추천' 탭의 각진 상자다.
- **추천**(C21 추천 표시): 테두리 1px `--line-ink` + 상단 '추천' 탭 `absolute -top-[0.7em] left-5 px-2 text-label text-fg-ink` + 탭 배경 = 섹션 바닥색(`bg-surface-paper` 또는 `bg-surface-sunken`). 카드에 좌측 바·채움·ring·scale·테두리 빛은 없다(V7-A). 좌측 2px 바(C21)는 요금 카드가 아니라 `/pricing` 선택 가이드가 고른 비교 행에 있다.
- 금액 칸은 없다. 체크아웃과 요금 시뮬레이터(`/pricing/simulator`, `/pricing/simulator/krw`) 밖 공개 화면의 금액은 0이고, `/pricing` 카드에도 금액이 없다(현행과 같음, 2026-10-28). 금액·'~부터'·할인 문구 대신 견적 구성표 `QuoteAnatomy`로 안내한다(TR-5, `/pricing`은 P5에서 상단 카드 3장 → 2장). 시뮬레이터 결과 금액은 `text-h2 tabular-nums`(C18 개정, TY-6. 굵기는 토큰 값 — V13-A), 단위 `text-caption text-fg-muted`다. 시뮬레이터를 공개로 계속 둘지는 운영자 열린 질문이다. 결제 플래그 OFF면 USD를 노출하지 않는다(감사 D6).
- 포함 항목: `mt-6 divide-y divide-line-hair border-t border-line-hair`, 행 `flex gap-2.5 py-3 text-body text-fg-body`, `Check` `size-4`. **추천 Plan의 Check만 `text-fg-accent`, 나머지 Plan은 `text-fg-muted`**(C11).

### 3-7. 목차 행(TocRow) — 신규 `components/ui/toc-row.tsx`

소비처: docs, updates, events, resources, 온보딩 단계 목록. FAQ 행(`details`)은 controls 소관이지만 hover 문법은 같다(C13).

```tsx
<Link href={href} data-card="toc"
  className="group grid min-h-16 grid-cols-[40px_1fr_auto] gap-x-3 border-t border-line-hair py-4
    transition-colors duration-(--motion-base) ease-soft hover:duration-(--motion-fast) focus-visible:duration-(--motion-fast)
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

- sheet + 1px hair + r0(V14-A · 2026-10-28) + `overflow-hidden isolate`, 제목줄 없음, 그림자 0(X05). Card가 아니다(`family="frame"` 없음).
- 매트(V16-A): 40rem 이상에서 capture·mock 둘레에 sunken 여백판(20px, 64rem 이상 32px)을 두고, 40rem 미만은 매트 없이 전폭이다. 규격 정본은 imagery다.
- Figure·Frame은 출처 장부 id 하나만 받고, 루트에 `data-figure`·`data-frame` 표지를 단다(X10·X11 개정). 코드 목업 Frame도 장부에 kind 'mock' 행(id)으로 등록하고, 목업 컴포넌트는 자식으로 받는다(2026-10-28). 표지는 도판 현상(MO-4)과 렌더 검사(§8 9·12)가 쓴다.
- 목업(mock)은 Frame 안 오른쪽 위 점선 태그 '예시 화면'(C05), 실제 화면은 캡션 '실제 화면 · YYYY.MM 캡처'.
- 섹션당 1개. 탭 패널마다 Frame이 있는 섹션(SW로 옮긴 KeyUseCases)은 **활성 패널에만 Frame을 렌더**해 HTML 안 Frame 수를 1로 둔다(§3-15).
- 카드·Frame 자체는 움직이지 않는다. 도판은 decode 전일 때만 opacity로 현상하고(MO-4), 제품 페이지 안쪽 차트의 `[data-seq]` 순차가 ④ 문법이다.
- 도해(수업 OS 지도)는 화면이 아니므로 Frame 대신 `<figure>` + 캡션을 쓴다.

### 3-9. 상태 점 ○ ● – — icons 소유(`status-dot`)

- 상태에만 쓴다: `data-state="off"` ○ 꺼짐·미해결 / 기본 ● 켜짐·진행 중 / `data-state="na"` – 해당 없음.
- 항상 13px 이상의 텍스트 라벨과 함께 쓰고, 점 자체는 `aria-hidden`이다(1.4.1).
- 라벨·불릿·로고 장식·'예시' 표기에는 쓰지 않는다(C05).
- 이 스펙에서 쓰는 곳: 02 공감 ProblemCost ○ 6개(끝까지 꺼짐), 03 흐름 수업 OS 지도 ○→● 6개(③ 점등, 장부와 같은 이름·같은 순서 — MO-2), ai-report '자동 녹화', 행사 '모집 중'.
- off→on 색 전이(○→●)는 닫힌 목록 두 곳에서만 쓴다: OS 지도 노드(`.os-node .status-dot`)와 폼 성공 패널(`.success-panel .status-dot`, 클래스·전이 규칙은 controls 소유). 그 밖의 상태 점은 정지 표지다. 점은 원형이다(V14-A).

### 3-10. CTA 띠

**마지막 띠 — FinalCTA (V5-A)**
- `Section surface="sunken" rhythm="act"`. 먹 Footer와 분리한다. 왼쪽 정렬이다(가운데 정렬 금지, system §4-4 개정).
- 안쪽 첫 요소 `rule-double`(surfaces 유틸: 1px 먹 + 3px + 1px hair) → `pt-6 md:pt-8`.
- 제목 `<h2 className="text-h1 text-fg-ink">`(36→56/600 — C18 개정·V13-A. C10, Display 아님) → 덱 `mt-4 max-w-deck text-body-l text-fg-body` → 행동 `mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6`.
- 버튼: `<Button size="cta">`(default, 52px, C15) + ghost 텍스트 링크(X03). 모바일(`< 40rem`)에서 primary는 폭 전체. 라벨은 `lib/cta.ts` 사전의 결정 단계('도입 상담 신청', 운영자 확인 뒤 확정)이고 CTA 컴포넌트는 ctaId만 받는다(C15 개정, TR-2). 상담 CTA에 '무료'·한정·마감은 0이다.
- 글로우·블롭·노이즈·그라데이션·고스트 글래스 버튼·ping·`hover:scale`은 없다. 화살표 2px만 움직인다.

**중간 띠 ×1** (홈 04 화면 Section 안 마지막 요소 — paper, V10-A · 2026-10-28. TestimonialWall 뒤 띠는 빠진다)
- 별도 Section·`data-surface`가 없다(홈 `[data-surface]` = 11 + 푸터). `<div className="mt-16 border-y border-line-hair py-6 sm:py-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">`.
- 덱 `text-body-l text-fg-body` 한 줄.
- line cta 버튼 하나(C15 중간 띠 = line cta). 라벨은 `lib/cta.ts` 사전의 확인 단계('쇼룸 방문 예약', 운영자 확인 뒤 확정)이고 CTA 컴포넌트는 ctaId `home_mid_showroom`만 받는다(C15 개정, TR-2). 자유 문자열 라벨 prop은 없다.
- 홈 결정 CTA(default cta)는 5곳(Hero `hero_demo` · Comparison `comparison_demo` · FinalCTA `final_consultation` · 헤더 · 모바일 플로팅) 그대로이고 뷰포트당 1개다. 이 띠는 결정 CTA가 아니라 확인 단계 line cta 하나다.

### 3-11. `components/ui/card.tsx` — 기본 출력 불변 + 공개 family

공개 소비처는 CaseStudies·KeyUseCases·contact 3곳이고, CheckoutSuccessClient·CheckoutFailClient는 `/checkout`(isInternalPath, `.site` 밖)이다. 공유 컴포넌트 기본값은 바꾸지 않는다(C17·X05). 그래서 `family` 기본값은 현행 문자열을 그대로 담은 `legacy`이고, 이 문자열은 바이트 그대로 둔다.

공개 family는 column·case·plan·plain이다(고급화 2026-10-28). 글만 있는 카드는 `column`(CO-9)이고, 공개 family는 모두 반경 0이다(V14-A). sheet 상자 family(case·plan·plain)는 사진 있는 사례·요금·폼 패널에만 쓴다.

```tsx
import { cva, type VariantProps } from "class-variance-authority"

export const cardVariants = cva("", {
  variants: {
    family: {
      // 현행 출력 그대로(어드민·checkout·미이관 소비처). 문자열을 바꾸지 않는다.
      legacy: "rounded-xl border border-black/[0.08] bg-white text-[#111110] shadow-[rgba(0,0,0,0.04)_0px_4px_18px,rgba(0,0,0,0.027)_0px_2px_7.8px,rgba(0,0,0,0.02)_0px_0.8px_2.9px,rgba(0,0,0,0.01)_0px_0.175px_1px]",
      plain:  "border border-line-hair bg-surface-sheet text-fg-ink",                       // 폼 패널. 패딩은 CardHeader/CardContent(contact)
      column: "border-t border-line-hair pt-5 text-fg-ink sm:pt-6",                         // 열린 단 — 채움·사방 테두리 0(CO-9)
      case:   "overflow-hidden border border-line-hair bg-surface-sheet text-fg-ink",       // 사진 있는 사례만
      plan:   "relative border border-line-hair bg-surface-sheet text-fg-ink p-6 sm:p-7",
    },
    interactive: {
      // 이탈 320(기본 상태) · 진입 160(hover·focus) — V17-A
      true: "group block transition-colors duration-(--motion-base) ease-soft hover:duration-(--motion-fast) focus-visible:duration-(--motion-fast) active:duration-0",
      false: "",
    },
    featured: { true: "", false: "" },
  },
  compoundVariants: [
    // 열린 단은 위 괘선만 진해진다(세로 hair는 그대로)
    { family: "column", interactive: true, class: "hover:border-t-line-strong focus-within:border-t-line-strong active:border-t-line-strong" },
    { family: ["plain", "case", "plan"], interactive: true, class: "hover:border-line-strong focus-within:border-line-strong active:border-line-strong" },
    { family: "plan", featured: true, class: "border-line-ink" },
  ],
  defaultVariants: { family: "legacy", interactive: false, featured: false },
})

type CardProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>
const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, family, interactive, featured, ...props }, ref) => (
  <div ref={ref}
    data-card={family && family !== "legacy" ? family : undefined}   // 렌더 검사용(§8-9) — legacy 는 표지 없음
    className={cn(cardVariants({ family, interactive, featured }), className)} {...props} />
))
```

- 공개 소비처는 `family`를 반드시 명시한다. 카드 루트에 `border-*` 색 유틸·`shadow-*`를 덧붙이지 않는다.
- 링크 카드는 `<Link className={cardVariants({ family, interactive: true })} data-card=…>`로 루트를 링크로 만든다(§3-0).
- `legacy` 문자열의 hex·`shadow-[`·`rounded-xl`은 가드 베이스라인(`scripts/design-baseline.json`)에 기존 건수로 남고, 늘지 않는다(반경 허용목록 가드에서도 베이스라인 예외).

### 3-12. 카드와 바닥의 짝

paper(#F9F8F5, V15-A)와 sheet는 대비 1.06:1, hair 테두리는 1.18:1이다. '흰 바탕 위 흰 카드'는 야외 iPhone에서 경계가 사라진다. 그래서 sheet는 섹션 지면이 아니고 물건에만 쓴다(C19 개정 · RA-7 · 2026-10-28).

- 공개 `Section`의 surface에 sheet는 없다. 섹션 지면은 paper가 기본이고, sunken은 도해(페이지당 1)·부록·FinalCTA 3역할, 먹은 Manifesto + 푸터다.
- sheet 상자(사진 있는 사례·요금·Frame·plate·폼·표)는 **paper나 sunken 지면 위에만** 둔다.
- 글만 있는 블록은 상자 없이 둔다: 열린 단(§3-2), 수치, 인용, TocRow, 표, 도해, dl, 장부.
- **먹 지면**(Manifesto·Footer·SW FullscreenQuote 등)에는 카드·Frame·표·사진·컨트롤을 두지 않는다(surfaces 먹 지면 허용 목록, C14 개정: 먹 위 컨트롤 0, 푸터 뉴스레터 line 예외 폐지).
- 검사: `Section`(system)이 `data-surface`를, Card가 `data-card`를, Figure·Frame이 `data-figure`·`data-frame`을 단다. 공개 빌드 HTML에서 `[data-surface="sheet"]`가 0건이어야 한다(system §6).

### 3-13. 모션 인벤토리

**홈 서사 모먼트 — `data-moment`는 모먼트 루트에 1개씩, 홈 4개(상한 6)** (V10-A·V17-A · 2026-10-28)

| # | 모먼트 | `data-moment` | 트리거 | 메커니즘 | 시간 | reduced·no-JS·SSR |
|---|---|---|---|---|---|---|
| ① | Hero 잉크 밑줄 | `hero-underline` | CSS 키프레임(JS 0) | `text-decoration-color` transparent → `--fg-accent`. Hero의 다른 요소는 첫 프레임부터 정지(진입 애니메이션 0) | `--motion-slow` 900ms `--ease-fade`, 지연 `--motion-beat` 240ms, 1회(1140ms에 끝남) | reduced 정적 완성 · no-JS도 CSS라 같은 페이드 |
| ② | Manifesto 스크럽 | `manifesto` | `view()` 스크롤 타임라인, `@supports` + no-preference + `(height >= 500px)` | 두 줄 opacity .18→1, 둘째 줄 밑줄 색 스크럽 | 스크롤 연동 | 정적 완성(미지원·reduced·낮은 뷰포트) |
| ③ | 03 흐름 OS 지도 ○→● 점등 | `os-light` | `Reveal bare`(.12) | 6노드 `status-dot`이 꺼진 점(○)과 같은 링에서 채움(●)으로 색 전이(테두리 `--line-control`→`--fg-accent`, 채움 transparent→`--fg-accent`). 02 공감 장부 ○ 6행과 같은 이름·같은 순서(MO-2) | `--motion-slow` 900ms `--ease-fade`, 노드 간격 `--motion-stagger` 80ms, 1회 | ● 6개 완성 |
| ④ | (빈 자리) | — | — | DashboardPreview가 홈에서 빠졌다(V10-A). `[data-seq]` 차트 순차 문법은 제품 페이지 차트 등장 1개에 쓴다(§4-1) | — | — |
| ⑤ | 06 확신 Comparison 행 액센트 | `row-accent` | `Reveal bare`(.12) | Classin 열 `.row-accent::before` opacity 0→1(전 행 동시) | `--motion-slow` 900ms `--ease-fade`, 지연 `--motion-beat` 240ms, 1회 | 완성 |
| (6) | 사실 레지스트리 슬롯 | — | — | `lib/facts.ts`에 출처 있는 수치가 생기면 ProblemCost 장부 위 Numeral 1개, **정적 SSR 값** | 모션 0 | — |

- 05 기록의 EEO 수치 한 줄(§3-3)도 정적 SSR 값이고 모먼트가 아니다.
- ⑤의 바는 그려지지 않고 켜진다(opacity). 순차(`--motion-stagger`)는 ●점등 전용이라 행 순차는 없다(X07).
- 느린 곡선(`--ease-fade`, 900ms)은 서사 모먼트와 도판 현상에만 쓴다. 조작 응답은 160/320ms로 빠르게 둔다(V17-A).
- 잉크 밑줄은 페이지당 1개(`.ink-underline`) + Manifesto 안 1개(`.ink-underline-scrub`)다(C25). 제품 페이지의 1개는 Reveal 조상(`[data-reveal="in"]`)에서 같은 색 페이드로 켜진다.
- 장 머리 괘선(`masthead`)은 정적이다. 긋기 애니메이션은 없다(X04).

**조작 전환** (모먼트가 아니다)

| 전환 | 값 |
|---|---|
| 탭 패널 교체(SolutionOverview, SW KeyUseCases) | opacity `--motion-base` 320ms. 첫 페인트에는 돌지 않고 `[data-switched]` 이후에만 |
| index-tab 막대(controls) | opacity 160ms(C12) |
| 사례 캐러셀(4건 이상 목록 지면만) | transform·opacity 320ms(X06). 홈 0 |
| 링크 단·카드·TocRow·FAQ 행 hover | 경계 + 화살표 2px. 진입 160ms(`--motion-fast`) · 이탈 320ms(`--motion-base`), `--ease-soft`(V17-A) |
| Reveal | opacity 900ms(`--motion-slow`) + translateY `--motion-rise`(≤12px, 2D), `--ease-soft` |
| Dialog·scrim·모바일 메뉴·드롭다운·토스트 | 열림은 controls(`dialog-in` 등). **닫힘 160ms opacity 페이드**(V17-A). 퇴장 애니메이션 없는 오버레이는 0 |
| 도판 현상(MO-4, 배선은 imagery) | decode 전 도판만 opacity `--motion-slow` 900ms `--ease-fade`. 액자·캡션·출처 라벨은 즉시 보이고, 캐시된 도판은 페이드 0. scale·clip-path·mask·와이프 0 |
| 지연 스켈레톤(MO-9. 컴포넌트는 controls, `skeleton-breathe` keyframes는 system §3-4/§13-3) | 300ms가 지나야 나타나고, opacity 1↔.7, 2.4s, `--ease-drift`로 숨쉰다. 300ms 안에 끝나는 이동에서는 한 번도 보이지 않는다 |
| 페이지 이동 | **공개 셸 모션 0**(MO-10 · 2026-10-28). AppChrome 공개 분기에서 RouteTransition 래퍼를 뺀다. 느린 이동은 지연 스켈레톤이 받는다. 어드민 `tone="admin"`은 그대로. View Transitions는 보류 |

**홈 합계**

| 구분 | 수 | 근거 |
|---|---|---|
| `[data-moment]` | 4(상한 6) | C08 · V10-A |
| 무한 루프 | 0(로딩 스켈레톤 숨쉬기는 로딩 상태 한정이라 집계 제외). 지금 운영 홈은 4개(LogoBar 마키, CaseStudies 8.5초 자동 넘김, 챗봇 ping·앰비언트 글로우) | C07 |
| 자동 진행 | 0 | C07 |
| 사례 캐러셀(`.case-slide`) | 0(사례 3건 정적) | X06 개정 |
| Hero 진입 애니메이션 | 0(첫 뷰포트 움직임은 ① 하나) | V17-A |
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
:where(.site) .os-node {                          /* 수업 OS 지도 노드 — r0, 윤곽 --stroke-pen --line-control(정보 경계, C23 · 2026-10-28) */
  position: relative;
  border: var(--stroke-pen) solid var(--line-control);
  background: var(--surface-sheet);               /* 모눈(pattern-grid)이 라벨 뒤로 지나가지 않게 */
}
:where(.site) .os-node::after {                   /* 현재 탭 열의 액센트 윤곽(조작 전환) */
  content: ""; position: absolute; inset: calc(var(--stroke-pen) * -1);
  border: var(--stroke-pen) solid var(--fg-accent); opacity: 0; pointer-events: none;
  transition: opacity var(--motion-base) var(--ease-soft);
}
:where(.site) [data-current] .os-node::after { opacity: 1; }

:where(.site) .row-accent { position: relative; }  /* C21 ① — Comparison Classin 열 셀 */
:where(.site) .row-accent::before {
  content: ""; position: absolute; inset: 0 auto 0 0; width: 2px;
  background: var(--fg-accent); pointer-events: none;
}

:where(.site) .case-slide {                        /* X06 — 4건 이상 목록 지면만(홈 0). --offset 은 인라인 style */
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

  /* ① Hero 잉크 밑줄 — JS 0. Hero 진입 애니메이션은 0이고(V17-A), 한 박자(--motion-beat) 뒤 --motion-slow 동안 색만 스민다 */
  :where(.site) [data-moment="hero-underline"] .ink-underline {
    animation: ink-fade var(--motion-slow) var(--ease-fade) var(--motion-beat) both;
  }
  /* 그 외 페이지의 잉크 밑줄 1개 — Reveal 조상 */
  :where(.site) [data-reveal="out"] .ink-underline { text-decoration-color: transparent; }
  :where(.site) [data-reveal="in"] .ink-underline {
    transition: text-decoration-color var(--motion-slow) var(--ease-fade) var(--motion-beat);
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

  /* ③ ○→● 점등(MO-2) — 무장 상태는 02 공감 장부의 꺼진 점(○)과 같은 링이고, 켜질 때 색만 바뀐다.
     라벨·윤곽은 처음부터 완전 대비. 점의 크기·모양 값은 icons status-dot 소유 */
  :where(.site) [data-reveal="out"] .os-node .status-dot {
    border-color: var(--line-control); background-color: transparent;
  }
  :where(.site) [data-reveal="in"] .os-node .status-dot {
    transition: border-color var(--motion-slow) var(--ease-fade) calc(var(--i, 0) * var(--motion-stagger)),
                background-color var(--motion-slow) var(--ease-fade) calc(var(--i, 0) * var(--motion-stagger));
  }
  :where(.site) [data-reveal="out"] [data-current] .os-node::after { opacity: 0; }

  /* ④ 차트 opacity 순차(C06, 값 소유 imagery) — 제품 페이지 차트. 비교 0 → 강조 1박자 → 끝점·라벨 2박자 */
  :where(.site) [data-reveal="out"] [data-seq] { opacity: 0; }
  :where(.site) [data-reveal="in"] [data-seq] {
    transition: opacity var(--motion-slow) var(--ease-fade) calc(var(--seq, 0) * var(--motion-beat));
  }

  /* ⑤ 행 액센트 — 전 행 동시, 표 등장 뒤 한 박자(--motion-beat) */
  :where(.site) [data-reveal="out"] .row-accent::before { opacity: 0; }
  :where(.site) [data-reveal="in"] .row-accent::before {
    transition: opacity var(--motion-slow) var(--ease-fade) var(--motion-beat);
  }

  /* 탭 패널 교체 — 첫 페인트 제외 */
  :where(.site) [data-switched] [role="tabpanel"][data-state="active"] {
    animation: panel-in var(--motion-base) var(--ease-soft);
  }
}
```

- 240ms 지연은 C06·C25의 박자이고, 이제 `--motion-beat` 토큰으로 쓴다(V17-A · 2026-10-28). 이 블록에 240ms 리터럴은 없다. 규칙 문장은 '그린은 언제나 글자보다 한 박자 늦게 온다'이다.
- 곡선은 opacity·색만 바꾸는 모먼트(①③④⑤)에 `--ease-fade`, 변위가 있는 Reveal에 `--ease-soft`, 조작 전환(탭 패널·os-node 현재 열)에 `--ease-soft`다.
- 무장 상태(`out`)에는 전환을 두지 않고 `in`에만 둔다. 무장은 화면 밖에서 일어나므로 흐려지는 순간이 보이지 않는다.
- `text-decoration-color`·`border-color`·`background-color` 전이는 페인트 속성이다. 대상이 한 구절(Hero) + 한 줄(Manifesto) + 점 6개(③)뿐이라 허용하고, 성능 예산에서 long task 0으로 확인한다(§6).
- hover 진입·이탈 비대칭(160/320)은 이 블록이 아니라 소비처 유틸(§2-2)이 맡는다. 오버레이 닫힘 160ms 키프레임은 controls 소관, 도판 현상 배선은 imagery 소관, 지연 스켈레톤 컴포넌트는 controls 소관이다(`skeleton-breathe` keyframes는 system §3-4/§13-3 한 곳).

**globals.css에서 할 일**(새 규칙은 쓰지 않는다)
- 삭제: `.reveal-anim` 3규칙(HEAD :476-492, `will-change` :483 포함)과 전역 reduced 블록 안 `.reveal-anim` 2줄(:914-918) — 무장이 no-preference 안으로 옮겨져 쓸모가 없다.
- 삭제(V17-A · 2026-10-28): `.hero-soft-enter` 계열 클래스(`-badge`·`-title`·`-copy`·`-actions`)와 keyframes 전부. 먼저 Hero·download·docs 사용처에서 클래스를 지우고(grep 0 재확인) 같은 커밋에서 정의를 지운다. Hero 진입 애니메이션은 0이다.
- 삭제(MO-10 · 2026-10-28): AppChrome 공개 분기에서 RouteTransition 래퍼를 뺀 뒤 소비처가 없어지는 `.route-transition-public` 규칙. 어드민 `tone="admin"` 규칙은 한 글자도 바꾸지 않는다. (P1의 `--route-enter-y: 0px` 값 수정은 이 삭제로 대체된다.)
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
  /** IntersectionObserver threshold. 기본 .12, 차트(제품 페이지 ④)는 .4 */
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
- 첫 화면 요소(Hero·LogoBar), Manifesto(스크럽), 전환 지점(LeadMagnet·FinalCTA·중간 CTA 띠), 읽기 면·콘텐츠 목록(TocRow 목록)에는 쓰지 않는다. Hero 진입은 Reveal로도, 다른 클래스로도 만들지 않는다(V17-A).
- `will-change`는 쓰지 않는다. 이동은 2D `translateY`다(3D는 숨김 상태에서도 상시 합성 레이어를 만든다).
- Reveal은 나머지 props를 넘기지 않는다. `data-moment`는 Reveal을 감싸는 요소나 모먼트 루트에 단다.

#### ② SolutionOverview(03 흐름) — 수동 탭 + ○→● 점등 (C07 · MO-2)

걷어내는 것: `useInView`, `AUTO_SLIDE_DELAY_MS 2600`과 `setTimeout`(SolutionOverview.tsx:38-53), framer `AnimatePresence`(:112-150), 활성 카드 그림자(:81), 먹 패널(:111), 그라데이션 pill(:59).

```tsx
// components/sections/SolutionOverview.tsx — 섹션 머리는 서버 부모(Section sunken, masthead, Kicker 03 흐름)
// 노드 라벨·순서는 02 공감 ProblemCost ROWS와 같다(MO-2, 단위 테스트로 대조)
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
      <figure data-moment="os-light" className="pattern-grid border border-line-hair p-4 sm:p-6">
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
            className="mt-6 border-t border-line-hair pt-5 sm:pt-6 data-[state=inactive]:hidden">
            …headline · desc · points(기존 문구 그대로)
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </>
  )
}
```

- 탭은 Radix가 APG 동작(roving tabindex, ←/→/Home/End, `aria-controls`)을 맡는다. 활성 표시는 `index-tab`(controls, C12): 글자 15/500 고정, 막대 opacity 160ms. 굵기가 변하지 않아 전환 CLS가 0이다.
- 탭 라벨과 지도 열 머리에 01–03 번호를 붙이지 않는다(홈 번호 체계는 Act 폴리오 + 05 기록 각주 번호 2종으로 찼다, C24).
- 지도의 ●은 점등 뒤 계속 켜져 있다('OS가 켜졌다'는 상태). 탭을 바꾸면 해당 열 노드의 액센트 윤곽만 바뀐다(opacity 320ms). ProblemCost의 ○는 끝까지 꺼진 채다.
- **○→● 콜백**(MO-2): 02 공감 장부의 꺼진 여섯 칸이 03 흐름 지도에서 켜진다. 장부 6행과 지도 6노드는 같은 이름·같은 순서(EDB 교안 · 전자칠판 · 수업 녹화 · LMS · 학생 관리 · 관리자 데이터, `--i` 0–5)다. 점은 링에서 채움으로 색만 바뀌고(80ms 간격, 1회), reduced·no-JS·SSR에서는 ● 6개가 완성 상태로 보인다.
- 노드 매핑: 6모듈은 `lib/classin-positioning.ts:10`의 정본 목록이다. 녹화를 '중'에 둔 것은 2단계 points의 "수업 녹화와 참여 도구"를 따른 것이다. 열 사이 연결선은 imagery 도해 규격(정적, `--stroke-pen` `--line-control`)을 따른다. 도해 작도 기준(1.5px 펜 선, 13px 라벨, r0 노드 · 윤곽 1.5px `--stroke-pen` `--line-control`(C23), 아이콘 원 금지)은 SY-3이다.
- 면: 섹션 sunken(C19, 도해 역할), 탭 패널은 상자 없이 위 hair(CO-9), 지도 figure는 r0 + 모눈 1개(페이지 예산 1).

#### ③ CaseStudies → 05 기록 사례 서류 3건 — 정적 배치, framer 제거 (X06 개정 · V10-A · 2026-10-28)

홈 CaseStudies는 TestimonialWall·GlobalScale·Outcomes와 함께 05 기록 한 지면(paper)이 된다(§4-2). 홈 사례는 캐러셀 없이 3건을 정적으로 둔다. 아래 캐러셀 배선(`case-slide`·`data-pos`·안쪽 `inert`)은 사례가 4건 이상인 목록 지면에서만 쓴다.

| 위치 | 지금 | 바꾸는 것 |
|---|---|---|
| :104, :110-116 | `AUTO_ADVANCE_MS 8500` + `setInterval`(지금 8.5초 자동 넘김) | 삭제 |
| :140-153 | `motion.article` animate(x·scale·opacity·zIndex), spring | 홈: 삭제. 사례 3건을 목록으로 정적 배치(64rem 이상 3열, 모바일 세로, 동의 2건 이하면 2열). 4건 이상 목록 지면: `<article className="case-slide absolute left-1/2 top-4 w-[min(82vw,480px)] cursor-pointer" data-pos={isActive ? "active" : distance === 1 ? "near" : "far"} style={{ "--offset": offset, zIndex: cases.length - distance } as CSSProperties} onClick={() => goToSlide(index)}>` |
| :153 | `aria-hidden={!isActive}` | 삭제. (목록 지면 캐러셀만) 안쪽 래퍼 `<div inert={!isActive}>`로 옮긴다. article이 inert이면 이웃 슬라이드 클릭이 죽는다 |
| :154 | 활성 그림자 `0_28px_90px`, 테두리 #084734/30 | 사진 있는 사례는 `<Card family="case">`(그림자 0, r0), 사진 없는 사례는 열린 단 문법(§3-5) |
| :162 | `unoptimized` | 삭제, `aspect-case`, 출처 장부 id(§3-5) |
| :170 | 민트 원 배지 | `text-label text-fg-muted`(C11 개정) |
| :190 | 이탤릭 인용 박스 | PullQuote 소형 |
| 바이라인 | 별표 마스킹 | 실명 또는 서술형 익명(§3-4). 동의 행이 없으면 렌더하지 않는다 |
| 클라이언트 | `"use client"` + framer | 홈 05 기록은 서버 컴포넌트(캐러셀 JS 0) |
| 컨테이너(목록 지면 캐러셀) | — | `isolate` |
| reduced | 처리 없음 | 따로 두지 않는다. 전역 reduced 블록이 transition을 0.001ms로 만든다 |

#### ④ ProblemCost(02 공감) — 정성 장부 (C08, V4-A)

지우는 것: `CountUp`(ProblemCost.tsx:7-41), `countTarget`(:48, :56, :64), 수치 문구(20%, 1,200만원, 3개월, 85/42/67%), 글래스 카드·글로우·scale·그라데이션 숫자·ping·`width` 막대·shimmer·블롭·노이즈.

```tsx
// 서버 컴포넌트. 행 이름·순서는 03 흐름 OS 지도 노드와 같다(MO-2 · 2026-10-28).
// 질문형 문구는 콘텐츠 담당이 확정한다(열린 질문 1)
const ROWS = [
  { module: "EDB 교안", question: "…" },
  { module: "전자칠판", question: "강사가 바뀌면 수업 품질도 바뀌나요?" },
  { module: "수업 녹화", question: "…" },
  { module: "LMS", question: "…" }, { module: "학생 관리", question: "…" }, { module: "관리자 데이터", question: "…" },
]

<Section surface="paper" rhythm="act" id="problem">
  <header className="masthead"><Kicker folio="02">공감</Kicker><h2 className="mt-3 text-h2 text-fg-ink">…</h2></header>
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

- 6행은 수업 OS 지도 6노드와 1:1로 대응한다(02 공감 ○ 꺼짐 → 03 흐름에서 ○→● 켜짐, MO-2). 장부 행 이름 배열과 지도 노드 라벨 배열이 같은 순서·같은 문자열인지 단위 테스트로 대조한다. 지면은 paper다(C19 개정: sheet는 섹션 지면이 아니다).
- 숫자 열·합계 이중선·카운터·배경 괘선(ruled)은 0이다. 행 구분은 1px hair 테두리다.
- 사실 레지스트리에 출처 있는 수치가 생기면 장부 위에 Numeral 1개를 정적 SSR 값으로 둘 수 있다(6번째 슬롯).

#### ⑤ DashboardPreview — 홈에서 빠짐, 차트 opacity 순차는 제품 페이지로 (V10-A · 2026-10-28, C06)

- 홈 목차(11지면)에서 빠진다. 컴포넌트와 함께 `DashboardPreviewCharts.tsx`, `dynamic(..., { ssr:false })`(DashboardPreview.tsx:8-13), IO·idle 예약, 스켈레톤, 그라데이션 바닥·오브 3개·글래스를 지운다. 공개 화면의 Recharts import는 0이다.
- 모먼트 ④ 자리는 비어 있다. 같은 문법 — `Reveal bare threshold={0.4}` 안 `components/charts/LineChart`(imagery §3-8)의 비교·강조·라벨 `[data-seq]` 0/1/2를 opacity로 `calc(var(--seq,0) * var(--motion-beat))` 지연(`--ease-fade`) — 는 제품 페이지의 차트 등장 1개(§4-1)에 쓴다.
- 목업 차트는 mock Frame 안에만 두고, 수치마다 같은 줄에 '예시'(X11)를 붙이며 Numeral(factId 전용)을 쓰지 않는다. Frame은 장부 kind 'mock' 행 id만 받고 목업 컴포넌트를 자식으로 받는다(X10 개정 · 2026-10-28).
- 그림자 0, '그림 n' 번호 없음, '지역 평균' 비교선 삭제, 툴팁 없음.

#### ⑥ Manifesto — 먹 서사 지면 (V4-A)

```tsx
// 서버 컴포넌트. overflow-hidden(:7)·800px 블러(:9)·framer 4곳·그라데이션 텍스트(:38)·인라인 자간 삭제
// 하드코딩 bg-[#111110](:7)도 지운다 — 먹 면은 surface-ink 토큰 값(V15-A #1A1917)을 받는다
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

- 먹 위에서 밑줄 색은 `.surface-ink`가 재정의한 `--fg-accent` 세이지 #8FC4AC다(C01, CO-3 · 2026-10-28. 먹 #1A1917 위 8.92:1). 공개 CSS에서 #6EE7B7은 0이다.
- poster 700은 Manifesto 한 곳뿐이다(V13-A, C10).
- `html`/`body`의 `overflow-x: hidden; overflow-x: clip` 쌍(HEAD :363-364)을 유지해야 한다.

#### ⑦ Hero — 인쇄된 표지, 잉크 밑줄 1개 (V3-A·V11-A·V17-A·C25 · 2026-10-28)

- `<h1 className="text-display" data-moment="hero-underline">…<span className="ink-underline">{구절}</span>…</h1>`. `hero-soft-enter hero-soft-enter-title` 클래스는 지운다.
- **Hero 진입 애니메이션 0**(V17-A): Kicker·H1·덱·CTA 두 개가 첫 프레임부터 완전 대비로 서 있다. LCP 후보인 H1을 opacity .001에서 시작시키지 않는다. 첫 뷰포트에서 움직이는 것은 잉크 밑줄 한 획뿐이다: `--motion-beat` 240ms 뒤 900ms `--ease-fade`로 색만 스민다(모먼트 ①, 1회).
- `hero-soft-enter` 계열은 Hero만이 아니라 download·docs 사용처까지 지우고, globals.css의 클래스·keyframes도 지운다(§3-14).
- `white-space: nowrap`은 쓰지 않는다. 줄이 바뀌면 줄마다 밑줄이 붙는다.
- 그라데이션 텍스트·ping(:42)·덮개 반경·그림자·group-hover 글로우(:85-86, 102-105) 삭제. Reveal은 쓰지 않는다(첫 화면).
- **도판**(V11-A·C09): 출처를 확인한 캡처가 커밋되기 전 Hero는 무도판 비대칭 표지다 — H1은 왼쪽 9칸, 덱과 CTA 두 개는 오른쪽 8~12칸 H1 마지막 줄 아래, 도판 0, LCP = H1. 출처 미확인 도판(`hero-dashboard.webp`)은 내리고, 어떤 라벨도 짐작해 달지 않는다. 출처 확인된 capture가 커밋되면 V3-A 7/5 분할로 바꾸고, 그 capture Frame 규격은 imagery 소관이다. 같은 이미지 파일은 페이지당 1회만 쓴다(배경·포스터 포함).
- Kicker는 라벨 '수업 시스템 OS'만 쓴다(V12-A, typography).

#### ⑧ KeyUseCases — /product/sw로 옮김, 탭 + Frame 1개 (V10-A · 2026-10-28)

- 홈 목차에서 빠지고 `/product/sw`로 옮긴다(P4). 아래 문법은 SW 페이지에서 그대로 쓴다.
- index-tab + Radix Tabs(forceMount로 텍스트 3패널 SSR). Frame은 **활성 패널 안에만** 렌더한다(`{i === active && <Frame …/>}`) — HTML 안 Frame 1개, 패널 교체와 함께 페이드된다. Frame 안은 영역 캡처(매트, V16-A)다.
- spring, `rounded-[2rem]`, 블롭, whileHover 회전, 체크 타일 hover 채움을 지운다. 체크는 `Check` `size-4`.
- 바닥 paper(C19).

### 3-16. 금지 (카드·섹션 배경)

- **카드·배경 모션**: shimmer, 스캔 라인, 헤어라인 스윕, conic 테두리 빛(V7-A), 글로우 펄스, 노이즈 드리프트, `animate-ping/pulse/bounce`, bob, 파티클, 블롭 드리프트, 카운트업·라이브 카운터, 무한 웨이브폼·점멸.
- **자동**: 자동 진행 탭, 캐러셀 자동 넘김, 홈 사례 캐러셀, 마키(X16에서 다시 열지 않음), 자동 진행 괘선.
- **hover**: 들림, 확대, 기울임, 3D tilt, 사진 hover scale, 제목 색·밑줄 변화, 먹선 hover, 배경 채움 변화, 그림자 변화.
- **애니메이션 속성**: `stroke-dashoffset`, `filter`, `box-shadow`, `background-position`, `width`·`height`·`padding`, `@property` 보간, 큰 `backdrop-filter`, 상시 `will-change`, `background-attachment: fixed`. 도판의 scale·`clip-path`·`mask` 와이프, 커튼 리빌, 확대 안착, 패럴랙스, 켄 번스(MO-4).
- **첫 화면·이동**: Hero 진입 애니메이션(덩어리 순차 상승, opacity .001 시작), 공개 페이지 이동 페이드, Next `experimental.viewTransition`(앱 전역·어드민까지 걸린다).
- **구조·JS**: 스크럽 대상 조상의 `overflow: hidden/auto/scroll`, framer `repeat: Infinity`, 한국어 글자·단어 쪼개기, 활성·비활성 탭의 굵기 차이, SSR 인라인 `opacity:0`, Reveal 섹션의 `content-visibility: auto`, 그리드 섹션의 `contain: paint`, Lenis 스무스 스크롤·커스텀 커서·자석 버튼.

**허용 — 긴 글 읽기 괘선**(고급화 2026-10-28, TY-9·MO-8, P5): 금지는 '자동 진행 괘선'만이다. 긴 글(블로그·docs)은 헤더 하단 hair 위 1px 읽기 괘선 1개를 둔다. CSS 스크롤 타임라인으로 스크롤에 직결하고(JS 0), 지원 브라우저와 no-preference에서만 움직인다. 미지원·reduced에서는 hair만 보인다. `ReadingProgress` 3px JS 막대는 삭제하고 z 표에서도 뺀다(X09). 블로그 세션의 렌더러 커밋 뒤에 착지한다.

---

## 4. 사용 규칙과 대상 파일

### 4-1. 쓰는 곳 / 모션 0

**모먼트를 쓰는 곳**: 홈 4곳(§3-13, V10-A), 제품 페이지마다 잉크 밑줄 1개 + 차트 등장 1개(HW LatencyProof는 감사 D5 수치 확정 뒤).

**모션 0(정지)**
- 읽기 면: 블로그 본문, 문서 본문, 폼, 법무, 계정, checkout, receipt. 예외는 도판 현상(MO-4)과 긴 글 1px 읽기 괘선(§3-16)뿐이다.
- Hero: 진입 애니메이션 0. 잉크 밑줄 ①만 움직인다(V17-A).
- 모든 카드·단 내부(hover 제외), 수치, 인용, 사진(도판 현상 제외), 아이콘, 표 본문, 장 머리 괘선, 홈 사례(정적 3건).
- LogoBar, HomeLeadMagnet, 중간 CTA 띠, FinalCTA, 404·오류·빈 상태(StateBlock, controls).
- 콘텐츠 목록(블로그·문서·행사·업데이트·자료의 TocRow 목록)에는 Reveal도 쓰지 않는다.

**범위 밖**: `/admin`, `/checkout`, `/receipt`(isInternalPath, `.site` 밖), 정적 랜딩 `/l/*`(백로그).

### 4-2. 홈 — `app/page.tsx` 순서(V10-A 11지면 + 푸터, C19 개정 · 2026-10-28)

홈은 11지면 + 푸터다. paper가 기본이고, sunken은 부록(진단표)·03 흐름(OS 지도)·FinalCTA 3곳이며 연속하지 않는다. 먹은 Manifesto 1 + 푸터다. sheet는 섹션 지면으로 쓰지 않는다. 인접 지면 바뀜은 6회 이하다. 1440 기준 길이 목표는 약 11,400px(게이트 ≤11,500px, 375는 ≤16,000px)이고, 지금은 18섹션(+ 띠 2) + 푸터, 지면 바뀜 약 17회, 18,406px이다. '흩어진 도구를 한 흐름으로' 계열 주장은 지금 다섯 섹션 이상에 나오고, 목표는 2회 이하다.

| 파일:행 | 지금 | 면 · 패밀리 · 모션 | 바뀌는 것 |
|---|---|---|---|
| Hero.tsx:42, 57, 85-86, 102-105 | ping, `animate-text-gradient` 구절, 덮개 반경·그림자, 글로우, `hero-soft-enter` 순차 상승 | paper · 무도판 표지(V11-A) · ① `hero-underline`만 | §3-15 ⑦. Kicker `folio={null}`, 라벨 '수업 시스템 OS'(V9-A·V12-A, typography). 진입 애니메이션 0(V17-A) |
| LogoBar.tsx:42-76 | `border-y`, 그라데이션 페이드 div, 28s 인라인 keyframes, 34곳 마키 | paper 띠 + 위아래 hair `rhythm="band"` · 정적 목록 | `<ul className="flex flex-wrap justify-center gap-x-6 gap-y-3">`. 숫자 없이 공개 동의를 받은 이름만 가나다순으로 싣고, 동의 기관이 6곳 미만이면 렌더하지 않는다(X16 개정). 이름 `text-body font-medium text-fg-muted`, 앞 점 삭제. `"use client"`·인라인 `<style>`·복제 세트 삭제 → 서버 컴포넌트 |
| HomeEntitySummary.tsx:22-40 | `border-y` 블록, dl `border-l #084734/20` | paper · 01 선언 `masthead`(정적) · 정지 dl | dl 칸 구분 `border-line-hair` |
| ProblemCost.tsx:7-258 | 글래스, 글로우·scale, 그라데이션 숫자, ping, `width` 막대, shimmer, 블롭, 노이즈, CountUp | paper · 02 공감 · 정성 장부(○ 6) · 정지 | §3-15 ④. 행 이름·순서 = OS 지도(MO-2) |
| HomeLeadMagnet.tsx:79-110 | 중첩 박스 그림자, 민트 타일(:90), `border-l-2 + #ECFDF5` 메모(:105) | sunken · 부록(진단표) · 정지 | 진단표 미리보기는 sheet 상자 1개(중첩 상자·그림자·민트 타일 0, r0). 메모는 위 hair + `text-note` |
| Manifesto.tsx:7-73 | `overflow-hidden`(:7), 800px 블러(:9), framer 4곳, 그라데이션(:38) | ink · ② `manifesto` | §3-15 ⑥ |
| SolutionOverview.tsx:38-155 | 2.6초 자동, 활성 카드 그림자(:81), 먹 패널(:111), AnimatePresence | sunken · 03 흐름 · ③ `os-light`(○→●) + 수동 탭 | §3-15 ② |
| (신규) 04 화면 | — | paper · 04 화면 · Frame 1(새 영역 캡처 1장, 매트 V16-A) + 섹션 끝 중간 CTA 띠 1(섹션 안 요소) · 도판 현상만(MO-4) | 출처 장부에서 확인된 캡처만 쓴다. 캡션 '실제 화면 · YYYY.MM 캡처'. 띠는 `home_mid_showroom`, line cta(§3-10) |
| 05 기록 ← CaseStudies.tsx:104-236 · TestimonialWall.tsx:28-145 · GlobalScale.tsx:15-58 · Outcomes.tsx:64-96 | spring 캐러셀·8.5초 자동 넘김·그림자·`unoptimized`·민트 배지·이탤릭 인용 / #F7F8F5·#0B3328 먹 피겨·금색 별·그림자 / #ECFDF5 바닥·`rounded-[20px]`·민트 원 아이콘 / hover 들림 + `shadow-lg`·그라데이션 After 셀·장식 바 | paper · 05 기록 · 사례 서류 3(정적) + 인용 ≤4 + EEO 수치 한 줄 · Reveal 1(인용 블록) | 한 지면으로 합친다. 순서는 사례 서류 3건(§3-5) → 인용 4개 이하(§3-4, PullQuote, 위 hair, 2단) → EEO 각주 수치 한 줄(§3-3). 캐러셀·framer·별·금색·박스·그림자·그린 채움 대표 후기 패널 0. Outcomes 내용도 여기로 합치고 독립 섹션은 없다. 감사 D4 동의가 먼저다: 동의 2건 이하면 2열, 사례가 없으면 인용 + 각주 수치 한 줄 |
| Comparison.tsx:58-102 | 표 들림(:63), zebra(:87), `green-400/500` | paper · 06 확신 · `table-paper--stack` + ⑤ `row-accent` | Classin 열 `td.row-accent`, `<div data-moment="row-accent"><Reveal bare>…</Reveal></div>`. 머리 셀·기존 방식 열 글자(#615D59)는 controls·icons. `comparison_demo` 결정 CTA(default cta) 유지 |
| FinalCTA.tsx:11-88 | 그라데이션·노이즈·블러, ping, `hover:scale-105 rounded-full` | sunken · CTA 띠(마지막) · 정지 · 왼쪽 정렬 | 전부 삭제, §3-10 |

**홈에서 빠지는 것**(V10-A)

| 파일 | 어디로 |
|---|---|
| EraVision.tsx | 삭제 |
| KeyUseCases.tsx | `/product/sw`로 옮긴다(§3-15 ⑧, P4) |
| DashboardPreview.tsx | 삭제(§3-15 ⑤). 모먼트 ④ 자리는 빈다 |
| ScienceBased.tsx | 원문 각주를 단 블로그 글로 옮긴다 |
| SatisfyingClass.tsx | 삭제 |
| TestimonialWall 뒤 중간 CTA 띠 | 만들지 않는다(중간 띠는 04 화면 섹션 안 1개) |

- 홈 Kicker는 Hero 1 + Act 6 = 7개다(C22). Act 이름은 01 선언 · 02 공감 · 03 흐름 · 04 화면 · 05 기록 · 06 확신이다(X15). 그 밖의 eyebrow는 지운다.
- 홈 결정 CTA(default cta)는 5곳 그대로이고 뷰포트당 1개다. 04 화면 섹션 끝 띠는 확인 단계 line cta 1개다(§3-10).

### 4-3. 제품

| 파일:행 | 지금 | 바꾸는 것 |
|---|---|---|
| app/product/sw/page.tsx:367-394, 544, 2124 | AmbientParticle 무한, 블롭 드리프트, bob | 삭제 |
| sw:527-529 | 4.2초 라이브 카운터 | 삭제(감사 P0-9) |
| sw:2009 등 | `animate-dot-pulse`, `animate-float-tag` | 삭제 → 그 뒤 globals의 두 클래스와 keyframes 삭제 |
| sw:451-500 | TestimonialCard hover 들림·그림자 | 인용 패밀리 |
| sw:1103 | AI 기능 카드 hover 들림 | 열린 단(CO-9) |
| sw:1878-1880 | 도구 타일 글래스 + 들림 + 그라데이션 아이콘 | 목차 행(아이콘 20, LessonToolIcons) |
| sw:1900-1903, 2036 | 활동 카드 들림, 아이콘 scale | 열린 단, scale 삭제 |
| sw:1272, 1276 | feTurbulence 노이즈, 블러 | 삭제(FullscreenQuote는 `Section surface="ink"` + PullQuote) |
| sw:209 WaveDivider | 웨이브 | 삭제(surfaces) |
| sw:745-752 | TypographyHook 2px 바(framer) | 이 페이지의 잉크 밑줄 1개: Reveal + `.ink-underline`(색 페이드) |
| KeyUseCases(홈에서 옮김, V10-A) | — | SW 페이지 안 탭 + Frame 1(영역 캡처, 매트). §3-15 ⑧ |
| hw/DesignDetails.tsx:99 | hover `shadow-lg -translate-y-1` | 열린 단 + 사진은 imagery Figure(장부 id), 바닥 paper |
| hw/SizeChooser.tsx:76-87 | `rounded-[28px]` 들림, 그라데이션 사진 바닥 | 요금(선택) 카드 r0, 바닥은 C19 지면 배정을 따른다 |
| hw/ClassroomStudioSection.tsx:85 | 아이콘 타일 scale | 카드 3장은 열린 단(CO-9), 아이콘은 IconFrame(r0, 투명, 정적, icons) |
| hw·sw OnboardingRoadmap | 원형 아이콘 scale-110 | 목차 행, 폴리오 01–04(순서 있음) |
| hw/LatencyProof.tsx:46 | `rounded-3xl` #0D1A12 `shadow-2xl` | Frame r0 + 차트 `[data-seq]` opacity 순차(감사 D5 뒤, dashoffset 0, `--ease-fade`) |
| hw/ValueAnchor.tsx:58, 62, 66, 119 | 먹 지면(`surface-ink` + 하드코딩 bg :58), 블롭, 글래스 카드 | P4-HW에서 지면을 paper로 옮기고 `surface-ink`·하드코딩 bg를 지운다(HW 먹 장은 AllInOne 하나, CO-8 · 2026-10-28). 블롭·글래스 카드 삭제 → 박스 없는 수치(facts 등록분)·인용 |
| app/product/ai-report/page.tsx:471-475, 598-603, :662 | '자동 녹화 중' 무한 점멸, 무한 웨이브폼, #ECFDF5 면, OutlineIcon, 10px #A39E98 라벨 | 정적 `status-dot` + '자동 녹화', 정적 막대, `bg-surface-paper`(sunken은 Pipeline 도해만), IconFrame, 점선 '예시 화면' 태그(C26). 구조·레이아웃·카피는 유지 |
| app/pricing/page.tsx:47, 72 | `rounded-[20px] shadow-sm`, `#F5FBF7` 박스 | 요금 카드(r0, 바닥 paper), 안내 박스는 상자 없이 위 hair + 안내문(CO-9). P5에서 상단 카드 3장 → 2장, 카드 금액 없음(현행과 같음), 견적 구성표(TR-5) |
| app/product/page.tsx:119-122, 165, 178 | 그림자 카드, 민트 타일, #ECFDF5 띠, 들림 | 열린 단(interactive), 띠는 paper + 위아래 hair(sunken은 도해·부록·FinalCTA 3역할만, RA-7) |

### 4-4. 콘텐츠·전환·기타

| 파일:행 | 지금 | 바꾸는 것 |
|---|---|---|
| components/docs/DocsArticleCard.tsx:25, 50 | `active:scale-[0.98]`, 화살표 4px | TocRow |
| app/updates/page.tsx:113, 177, 220 | 그라데이션 `rounded-3xl` 카드, `rounded-2xl` 행 | 열린 단 / TocRow |
| app/events/EventsClient.tsx:134 | `animate-pulse` 점 | 정적 `status-dot` + '모집 중' |
| events:155, 306-339 | `rounded-2xl` 먹 카드, 목록 | 열린 단(먹 카드 금지), TocRow 썸네일 변형 |
| app/events/[slug]/page.tsx:251-350 | `rounded-[22~36px]`, 들림 | r0, 들림 삭제 |
| components/seminars/SeminarCard.tsx:16-30 | 들림, 그림자, 백드롭 배지, Play scale | 사례 패밀리(미디어), 배지 → `text-label` |
| BlogPostCard.tsx:34 · BlogPageClient.tsx:212, 331 | 사진 hover scale, 블러 | scale·블러만 삭제. 대표 + 3열 카드 구조 유지(블로그 세션 커밋 뒤) |
| app/about/AboutPageClient.tsx:288-1002 | 20~24px 반경, 들림, 사진 scale | r0, 들림·scale 삭제. 01/02/03·가치 카드는 열린 단(CO-9) |
| app/contact/page.tsx:379-679 | `rounded-[24px]/2rem` slate 카드 | `Card family="plain"`(controls 폼 스펙과 함께) |
| components/landing/SegmentLandingPage.tsx:98-250, 288, 357 | 항목마다 Reveal + delay 순차, 그라데이션 `shadow-deep` 블록, `rounded-[14px] shadow-card` 들림 | 섹션당 Reveal 1개(delay 삭제), CTA 띠, 열린 단 |
| app/docs/page.tsx:310, 357 | 섹션 단위 Reveal | 유지(섹션당 1개 규칙 안) |
| download·docs의 `hero-soft-enter` 사용처 | 진입 순차 상승 | 클래스 삭제(V17-A). 그 뒤 globals.css 정의 삭제(§3-14) |
| components/PublicRouteLoading.tsx | `animate-shimmer`, `bg-white/70`, `shadow-[0_24px_80px]` | `bg-surface-skeleton` + 지연 스켈레톤: 300ms가 지나야 나타나고 opacity 1↔.7, 2.4s, `--ease-drift`로 숨쉰다(MO-9 · 2026-10-28, `--animate-skeleton` = `skeleton-breathe`, 정의 system §3-4/§13-3) |
| components/blog/ReadingProgress.tsx | 화면 맨 위 3px JS 막대 | 삭제. 헤더 하단 hair 위 1px CSS 읽기 괘선(§3-16, P5, 블로그 세션 커밋 뒤) |

### 4-5. 공용 파일

| 파일 | 할 일 |
|---|---|
| `app/styles/site-base.css` | §3-14 블록(`@layer components`) |
| `app/globals.css` | §3-14 'globals.css에서 할 일'(삭제만, 새 규칙 0) |
| `components/landing/Reveal.tsx` | §3-15 ① |
| `components/ui/card.tsx` | §3-11(`cardVariants` export, 기본 `legacy` 바이트 유지, 공개 family column·case·plan·plain) |
| `components/ui/toc-row.tsx` | 신규, §3-7 |
| `components/sections/SolutionOverview.tsx` | §3-15 ② |
| AppChrome 공개 분기 | RouteTransition 래퍼 제거(MO-10, 어드민 `tone="admin"` 무변경) · 도판 현상 클라이언트 효과 1개(MO-4, 규격은 imagery) |
| `tests/ui/card.test.tsx` | 신규 1개: 기본 출력 문자열이 현행과 같다 · `family="column"`에 `shadow`·`bg-`·`rounded` 없음 · 공개 family에 `rounded` 없음 · `data-card` 표지 |
| ProblemCost·OS 지도 라벨 대조 테스트 | 신규 1개: 장부 행 이름 배열 = 지도 노드 라벨 배열(같은 순서·같은 문자열, MO-2) |

---

## 5. 접근성·대비

### 5-1. 상태 매트릭스

| 상태 | ① 밑줄 | ② 스크럽 | ③ ○→● | ④ 차트(제품 페이지) | ⑤ 행 액센트 | 탭 | 카드·단 hover |
|---|---|---|---|---|---|---|---|
| SSR 첫 페인트 | Hero는 나머지가 모두 완성인 채로 240ms 뒤 색 페이드, 그 외 완성 | 완성 | ● 6 완성 | 완성 | 완성 | 3패널 HTML 존재, 활성 1 | — |
| JS 없음 | Hero 동일(CSS), 그 외 완성 | 지원 시 스크럽 / 미지원 시 완성 | ● 6 완성 | 완성 | 완성 | 첫 패널만 보임(나머지 HTML에 있음) | 동작 |
| reduced | 완성 | 완성 | ● 6 완성 | 완성 | 완성 | 즉시 교체 | 즉시(0.001ms) |
| no-preference, 마운트 시 화면 안 | Hero 페이드 / 그 외 무장 안 함 | — | 무장 안 함 | 무장 안 함 | 무장 안 함 | 320ms | 진입 160 · 이탈 320ms |
| 높이 < 500px | — | 정적 완성 | — | — | — | — | — |

### 5-2. 접근성

- **WCAG 2.2.2**: 홈에 5초 넘는 자동 움직임이 없다(루프 0, 자동 진행 0, 홈 사례 캐러셀 0). 제품 페이지 배경 영상의 정지 장치는 imagery 소관(C07: ≥64rem, hover 기기, no-preference, 정지 버튼 + 화면 밖 정지).
- **탭(APG)**: Radix Tabs — `tablist/tab/tabpanel`, roving tabindex, 방향키, `aria-controls`가 실제 id. 3패널 모두 DOM에 있다.
- **정보의 중복(1.4.1)**: ○●–는 항상 텍스트 라벨과 함께, 점·장식 괘선·행 액센트 바는 `aria-hidden`(의사요소). Classin 열은 열 머리 텍스트가 의미를 맡는다.
- **보조기기**: 4건 이상 목록 지면 캐러셀의 비활성 슬라이드는 안쪽 래퍼 `inert`. 차트는 imagery 규격(sr-only 요약·표). mock Frame 본문은 `aria-hidden` + sr-only '예시 화면: …'(C05).
- **포커스(2.4.7·2.4.13)**: site-base 보증 ① `outline: 2px solid var(--fg-accent); outline-offset: var(--focus-offset)`(2px, var 폴백 없음, X01·V17-A). 링크 단·카드는 이 2px를 받고, 글 링크 3px·입력 −1px 겹침은 controls 소관이다(MO-5). 공개 Dialog 5곳·토스트도 `.site`라 같은 링을 받는다(C17). 카드별 `focus-visible:ring-*`는 삭제한다.
- **hover 신호**: 경계 strong(1.41:1)은 보조 단서다. 상태 판별은 focus outline과 링크 문맥이 맡고, hover는 1.4.11 대상 상태가 아니다. 링크 단은 화살표가 늘 보여 누를 수 있음을 hover 없이도 알린다(CO-9).
- **줌·리플로(1.4.4·1.4.10)**: 스크럽은 `(height >= 500px)` 가드로 200~400% 줌과 가로 모드에서 정적이다. 잉크 밑줄은 nowrap이 없어 줄바꿈 시에도 안전하다. 확대 4상태 기준은 system §9.
- **강제 색상**: `.row-accent::before` CanvasText, `.os-node::after` Highlight. `status-dot`(○→● 포함)은 icons가 처리한다.

### 5-3. 대비 실측 (WCAG 2.x 상대휘도, V15-A 값 · 2026-10-28)

| 요소 | 값 | sheet #FFF | paper #F9F8F5 | sunken #F3F2EE | 판정 |
|---|---|---|---|---|---|
| 카드 제목·Numeral 출처 이름 | #111110 | 18.89 | 17.79 | 16.87 | AAA |
| 카드 본문 | #31302E | 13.18 | 12.41 | 11.77 | AAA |
| 메타·폴리오·asOf·캡션·범주·지역 라벨 | #615D59 | 6.53 | 6.14 | 5.82 | AA(P2 게이트 muted ≥5.5 통과) |
| 액센트(●, 행 액센트, 잉크 밑줄, 인용 따옴표) | #084734 | 10.71 | 10.08 | 9.56 | AAA |
| ○ 링·– 막대·도해선·조작 경계 | #8A857F | 3.66 | 3.44 | 3.26 | 비텍스트 3:1 통과(P2 게이트 ≥3.2) |
| hover·pressed 경계 strong | .16 | 1.41 | — | — | 보조 단서(장식) |
| hair 테두리 | .08 | 1.18 | — | — | 장식 |
| 추천 Plan 테두리 | #111110 | 18.89 | — | — | 통과 |
| 포커스 outline | #084734 | 10.71 | 10.08 | 9.56 | 2.4.13 통과 |
| 이웃 슬라이드 제목(목록 지면 캐러셀) | #111110@.72 | — | 7.40 | — | AA(본문·메타 숨김) |
| (금지) 읽는 글자 #A39E98 | — | 2.66 | 2.50 | 2.37 | 장식·비활성 전용 |

**먹 지면**(`.surface-ink`, #1A1917 기준, C01 · V15-A. 글자 #111110·masthead #111110은 그대로)

| 요소 | 대비 |
|---|---|
| 제목 `--fg-ink` #FAFAF8 | 16.81 |
| 본문 `--fg-body` /.72 | 9.14 |
| 보조 `--fg-muted` /.56 | 6.00 |
| 액센트·포커스·밑줄 `--fg-accent` 세이지 #8FC4AC | 8.92(CO-3, 먹 위 읽는 글자 게이트 ≥4.5 통과) |
| (금지) #084734 | 1.64 — 먹 위에서는 토큰이 자동으로 세이지 #8FC4AC로 바뀐다 |

**전이 상태**(정지 상태가 아님)

| 상태 | 대비 | 처리 |
|---|---|---|
| ③ 무장(○ 링, sunken 위) | 3.26 | 꺼진 점과 같은 링이라 비텍스트 3:1 통과. 라벨은 항상 완전 대비 |
| Manifesto .18 | 1.74 | 진입 구간에서만. axe는 `reducedMotion: 'reduce'`로 돌린다 |
| 잉크 밑줄 페이드 중 | — | 장식. 글자는 처음부터 완전 대비 |

---

## 6. 성능 예산

| 항목 | 예산 | 측정 |
|---|---|---|
| 애니메이션 속성 | opacity·transform(Reveal translateY, 목록 지면 캐러셀 translateX). 색 예외: `text-decoration-color` 2곳(Hero 1회, Manifesto 스크럽), `status-dot` 테두리·채움 색(OS 지도 6개 + 성공 패널 1개), hover 경계 색(진입 160 · 이탈 320ms). 도판 scale·clip-path·mask 0 | rg + 코드 리뷰 |
| stroke-dashoffset | 사이트 0 | `rg 'stroke-dashoffset\|draw-path' app components` |
| 무한 루프 | 홈 0(로딩 스켈레톤 제외), `video[loop]` 홈 0 | `getAnimations()` iterations, DOM 카운트 |
| Hero 첫 뷰포트 | t=0에 Hero 루트 `getAnimations()` 1개(ink-fade), reduced 0. LCP 요소 = H1 | `getAnimations()`, Lighthouse |
| 로딩 스켈레톤 | 300ms 안에 끝나는 이동에서 노출 0회, opacity 최저 .7(MO-9) | Performance 녹화 |
| 자동 진행 | 0 | `rg 'setInterval\|AUTO_(SLIDE\|ADVANCE)' components/sections` |
| 한 뷰포트 동시 진행 | ≤ 10(최대 ●점등 6) | 셀렉터를 좁힌 `getAnimations()` 샘플 |
| 숨김 상태 합성 레이어 | 2D translate만, 상시 레이어 승격 0 | Chromium Layers 패널 전후 비교 |
| `will-change` | 공개 CSS·클래스 0 | `rg will-change app/styles app/globals.css components` |
| 신규 JS | 순감소: 홈 섹션 framer 12 → 0, setTimeout·setInterval 2 → 0, Recharts 공개 0, `"use client"` 홈 섹션은 SolutionTabs·Reveal만(사례는 정적 서버 컴포넌트). 공개 셸은 도판 현상 효과 1개를 더하고(MO-4) RouteTransition 래퍼를 뺀다(MO-10) | 빌드 산출물 비교, `rg -l framer-motion components/sections` |
| Recharts 청크 | 공개 페이지 요청 0 | 네트워크 로그 |
| 스크롤 중 long task | 애니메이션 원인 > 50ms 0건(4× CPU, 스크럽 구간 포함) | Performance 패널 |
| CLS | 모션 기여 0, 홈 ≤ 0.05(탭 굵기 고정, 스켈레톤 교체 없음, 도판 현상은 aspect 고정) | Lighthouse 모바일 3회 중앙값 |
| INP | 탭·캐러셀 p75 < 200ms | Web Vitals |
| SSR | 공개 HTML 인라인 `opacity:0` 0건 | §8 정규식 |

---

## 7. 마이그레이션 (system §11 단계에 맞춤)

순서 규칙: (a) globals.css·블로그 파일은 블로그 세션 커밋이 들어간 뒤 손댄다. (b) 대체 도판 커밋이 들어간 뒤에만 기존 도판을 뺀다(C09). 단 출처 미확인 Hero 도판은 대체 없이 내리고 무도판 표지로 둔다(V11-A). 다른 도판도 대체 전에 빈 Frame을 두지 않는다. (c) 서사 모먼트 1개 = 커밋 1개. (d) #A39E98은 hex→토큰 치환만 하고, 먹 구간을 `surface-ink`로 옮긴 뒤에 한다. (e) P2 토큰 PR은 V10–V18 선택이 DESIGN.md §9에 기록된 뒤에만 머지한다(P2-0). (f) P3 첫 커밋 전에 V10 목차를 확정한다.

정직성 핫픽스(H)는 디자인 브랜치와 별개로 main에서 P2 전에 진행한다(고급화 기획 §7). 이 스펙의 몫은 출처 미확인 Hero 도판에 생성 이미지 라벨을 달라는 지시를 문서에서 지우는 것이고, 이 스펙에는 이제 그 지시가 없다(§3-15 ⑦).

| step | 단계 | 내용 | 노력 | 시안 |
|---|---|---|---|---|
| 1 | P0(정지 화면 변화 0. 동작 줄이기 off 의 Reveal 동작만 바뀜: 상승 18→12px, 이미 보이는 요소 무장 안 함 — system §8-1 예외 ⑨) | site-base.css에 §3-14 블록 추가(tokens·utilities·site-base 3파일 PR에 포함). Reveal을 X07 시그니처로(bare·threshold·이미 보이면 무장 안 함). globals.css `.reveal-anim`·`will-change`(:232, :483) 삭제, 사용 0 CSS 삭제. `card.tsx`를 cva로(기본 `legacy` = 현행 출력) + `tests/ui/card.test.tsx`. — `app/styles/site-base.css`, `app/globals.css`, `components/landing/Reveal.tsx`, `components/ui/card.tsx`, `tests/ui/card.test.tsx` | S | 불필요 |
| 2 | P1 빼기 | 공개 카드 hover 들림·확대·그림자·`active:scale-[0.98]`·사진 hover scale·ping·shimmer·블롭·글로우 일괄 삭제. 링크 카드 hover는 `hover:border-line-strong` + `arrow-nudge`. `.route-transition-public` 이동 0px. LogoBar 정적 목록. — Comparison, Outcomes, KeyUseCases, ProblemCost, FinalCTA, Hero, LogoBar, DocsArticleCard, SeminarCard, BlogPostCard, BlogPageClient, product/page, sw/page, hw/DesignDetails·SizeChooser·ClassroomStudioSection·OnboardingRoadmap, sw/OnboardingRoadmap, events/[slug], events/videos/[slug], resources/[slug], AboutPageClient, SegmentLandingPage, contact, `app/globals.css`:213 | S | 불필요 |
| 3 | P2 프리미티브·셸 | `Card` 공개 family column·case·plan·plain(r0, V14-A·CO-9, `legacy` 바이트 유지) 적용(CaseStudies·KeyUseCases·contact), `toc-row.tsx` 신규, 인용·수치·CTA 띠 패턴. hover 진입 160 · 이탈 320(V17-A). site-base 무장 블록이 `--motion-beat`·`--ease-fade`를 소비(토큰은 토큰 PR). 반경 허용목록 가드(warn 래칫). 공개 RouteTransition 래퍼 제거(MO-10), 지연 스켈레톤(MO-9), 도판 현상(MO-4), 오버레이 닫힘 160ms(controls). contact 전후 캡처 비교(패딩 이중 적용 확인). — `components/ui/card.tsx`, `components/ui/toc-row.tsx`, `app/contact/page.tsx`, `app/styles/site-base.css`, `app/globals.css`, AppChrome 공개 분기, `components/PublicRouteLoading.tsx` | M | 카드 시트 ③ + V14·V17 보드 |
| 4 | P3 홈 01 선언·부록 | HomeEntitySummary 서버 컴포넌트화(paper), `masthead` 정적 괘선, Reveal 1. HomeLeadMagnet 정지(sunken 부록). LogoBar paper 띠(동의 이름만) | S | 필수 ② |
| 5 | P3 02 공감 | ProblemCost 정성 장부(수치 0, paper), 행 이름·순서 = OS 지도 + 라벨 대조 테스트(MO-2) | S | 필수 ② |
| 6 | P3 모먼트 ① | Hero 무도판 표지(V11-A) + 진입 애니메이션 0 + 잉크 밑줄 900ms(V17-A). Hero·download·docs의 `hero-soft-enter` 사용처와 globals.css 정의 삭제. 출처 확인된 EDB 캡처가 커밋되면 V3-A 7/5로 | S | 필수 ② + V11·V17 보드 |
| 7 | P3 모먼트 ② | Manifesto 먹 지면 + 스크럽(overflow 제거) | S | 필수 ② |
| 8 | P3 모먼트 ③ | SolutionOverview(03 흐름) 수동 탭 + ○→● 점등 + OS 지도(r0 노드, 윤곽 1.5px `--line-control`) | M | 필수 ② |
| 9 | P3 04 화면 | 새 영역 캡처 1장 + 매트 Frame(V16-A) + 중간 CTA 띠 1(`home_mid_showroom`) | S | 필수 |
| 10 | P3 05 기록 | CaseStudies·TestimonialWall·GlobalScale·Outcomes → 한 지면: 사례 서류 3 정적(dl 4칸), 인용 ≤4, EEO 각주 수치 한 줄. framer·setInterval·캐러셀 제거, 출처 장부에서 확인된 컷만 사진. 감사 D4 동의가 먼저 | M | 필수 + V10 보드 |
| 11 | P3 홈에서 빼기 | EraVision·DashboardPreview·SatisfyingClass 삭제, KeyUseCases는 SW로(step 13), ScienceBased는 각주 단 블로그 글로. 삭제 섹션 내용은 SW·블로그에 남겨 색인 유지 | S | 필수 |
| 12 | P3 모먼트 ⑤ | Comparison `table-paper` + 행 액센트(paper), FinalCTA sunken 띠(왼쪽 정렬) | S | 필수 |
| 13 | P4 제품 | sw 다이어트(파티클·블롭·bob·카운터·노이즈·WaveDivider·dot-pulse·float-tag → globals 키프레임 삭제), TypographyHook 밑줄, KeyUseCases 이관(탭 + 영역 캡처 Frame 1), hw 카드 수렴(열린 단), LatencyProof(감사 D5 뒤), ai-report(C26), pricing Plan, product 허브 | L | 페이지별 |
| 14 | P5 콘텐츠·전환 | updates·events·docs TocRow·열린 단, events 상태 점, about(열린 단), SegmentLandingPage Reveal 정리, 블로그 카드 hover(블로그 세션 뒤), `ReadingProgress` 삭제 + 1px 읽기 괘선(블로그 세션 렌더러 커밋 뒤), `/pricing` 상단 카드 2장 + 견적 구성표 | M | 페이지별 |

각 단계 배포 뒤 14일 동안 system §11 지표(ctaId 클릭, 리드 제출, 랩 LCP·CLS·INP)로 비교하고 다음 단계로 간다. 되돌림 트리거도 system §11을 따른다.

---

## 8. 수용 기준

**정적 검사**(이 스펙의 대상 경로: `app/{about,blog,contact,docs,events,pricing,product,resources,showroom,updates,page.tsx}`, `components/{sections,product,blog,docs,events,seminars,landing}`, `components/ui/{card,toc-row}.tsx`, `components/PublicRouteLoading.tsx`. 그 밖의 `components/ui/*`(dialog·toast·input·button·FloatingChatbot 등)는 controls·icons 소관이라 여기서 세지 않는다)
1. [hover] `rg -n 'hover:(-?translate-y|scale-|shadow-)|group-hover(/[\w-]+)?:(scale-|-?translate-y)|whileHover|active:scale-\[0\.98\]'` 0건.
2. [루프] `rg -n 'repeat: *Infinity|animate-(ping|pulse|bounce|shimmer|text-gradient|float-tag|dot-pulse|digit-glow|shake)|(^|[^-\w])blur-(sm|md|lg|xl|2xl|3xl|\[)|backdrop-blur'` 0건(로딩 스피너 `animate-spin`·`*/loading.tsx` 제외). `rg -n infinite app/globals.css app/styles`에 남는 키프레임은 허용 목록(spin, admin 전용 셀렉터, 스켈레톤 숨쉬기 `skeleton-breathe`, 동작 줄이기 스피너 `skeleton-blink`)뿐.
3. [반경·그림자] 반경 허용목록(V14-A · 2026-10-28): `rg 'rounded-(sm|lg|xl|2xl|3xl|\[)'` 0건, `rounded-md`는 컨트롤·떠 있는 층 파일에만, `rounded-full`은 필터 칩·상태 점·스위치 썸(·기존 챗봇 런처)에만(예외: `components/ui/card.tsx`의 `legacy` 문자열 1건). `rg '\bshadow-(sm|md|lg|xl|2xl|card)\b|shadow-\['` 0건(예외: 같은 `legacy` 문자열 1건). `shadow-deep`은 Dialog·드롭다운·토스트·모바일 메뉴 파일에만.
4. [dashoffset] `rg 'stroke-dashoffset|draw-path|pathLength' app components` 0건.
5. [자동] `rg 'setInterval|AUTO_SLIDE|AUTO_ADVANCE|useInView' components/sections` 0건. 홈 섹션에 `case-slide` 0건.
6. [정직성] `rg -n 'countTarget|CountUp|1,200만원|[0-9]+%' components/sections/ProblemCost.tsx` 0건. 사례 dl에 숫자 성과 칸 0. 렌더되는 모든 사례 사진이 출처 장부 id를 받고, 장부 행에 credit(‘○○’ 없음)·consentDocId·verifiedAt이 있다. 바이라인에 '*' 0. mock Frame에는 점선 '예시 화면' 태그가 있고 목업 수치마다 '예시'가 있다. 이 스펙 문서에 Hero 도판 라벨을 짐작해 달라는 지시 0건.
7. [토큰] 이 스펙이 정의하는 CSS 변수 0: `rg -- '--motion-(story|progress|carousel)|--masthead-pt' app components` 0건. `.on-ink`·`.card-title`·`.stagger`·`.progress-rule` 0건. `rg '240ms' app/styles components`는 tokens.css의 `--motion-beat` 1곳뿐(주석 포함). `rg 'hero-soft-enter' app components` 0건, `rg 'route-transition-public'` 0건(V17-A·MO-10). P5 뒤 `rg ReadingProgress` 0건.
8. [card] `npx vitest run tests/ui/card.test.tsx` 통과 — `<Card />` 기본 className이 현행 문자열과 같다(`legacy` 바이트 유지). 장부·지도 라벨 대조 테스트(MO-2) 통과.

**렌더 검사**(375×812·1440×900, 홈·/pricing·/product·/product/hw·/product/sw·/docs. 저장소 의존성 밖 브라우저 도구로 돌리고 새 devDependency는 0이다. iPhone 실기기와 Windows Chrome 1366×768 DPR1에서도 본다 — SY-1)
9. [카드] `[data-card]`·`[data-figure]`·`[data-frame]`의 computed box-shadow가 전부 `none`(예외 없음), border-radius `0px`(V14-A). 공개 빌드 HTML에서 `[data-surface="sheet"]` 0건. `[data-card="column"]`의 computed background는 투명이다.
10. [hover] 마우스 hover 시 링크 카드·단의 computed transform 변화 0, border-color(열린 단은 위 테두리만) `rgba(17, 17, 16, 0.16)`, 제목 color와 text-decoration 변화 0, 화살표 `translate: 2px 0`. computed transition-duration은 기본 상태 .32s, hover 중 .16s다(진입 160 · 이탈 320, V17-A). 정보 카드는 hover 전후 computed style 차이 0. 터치 `:active` border-color strong(iOS 실기기 1회).
11. [SSR·no-JS] 운영 프리뷰 홈 HTML에서 `grep -oE 'style=.[^>]*opacity: *0(\.0+)?[;\x22]'` 0건. SolutionOverview 3단계 headline이 HTML에 각 1회. `javaScriptEnabled: false`에서 모든 섹션 텍스트가 보이고, `.os-node .status-dot` 6개가 채움(●) 완성, `[data-seq]` opacity 1, `.row-accent::before` opacity 1, `.masthead::before` 애니메이션 0.
12. [무장 깜빡임 0·인쇄된 표지] no-preference에서 마운트 시 뷰포트 안에 있던 Reveal에는 `data-reveal`이 생기지 않는다. 첫 화면을 1.8초와 3.5초에 캡처한 픽셀 차이가 0(Hero 밑줄 페이드는 1140ms에 끝난다). Lighthouse 모바일 필름스트립 첫 프레임에서 H1이 완전 대비로 보이고 LCP 요소가 H1이다. t=0에 Hero 루트 `getAnimations()`는 ink-fade 1개, reduced에서 0개(V17-A). 출처 확인된 캡처가 커밋되기 전까지 Hero 안 `[data-figure]`·`[data-frame]` 0(V11-A).
13. [reduced] `reducedMotion: 'reduce'`로 홈을 끝까지 스크롤하는 동안 `.reveal-anim, .os-node, .row-accent, [data-seq], [data-moment]` 하위의 running 애니메이션 0. Manifesto 두 줄 opacity 1, 밑줄 색 = `--fg-accent`.
14. [탭] 홈 SolutionOverview·SW KeyUseCases: 30초 관찰 동안 활성 인덱스 변화 0. ←/→/Home/End 동작. axe aria 위반 0. 탭 전환 중 tablist의 layout-shift 기여 0(굵기 500 고정). 로드 직후 활성 패널의 `getAnimations()` 0(첫 페인트 페이드 없음), 탭 클릭 뒤 1회 320ms. KeyUseCases HTML 안 Frame 1개.
15. [05 기록·사례] 홈: `setInterval` 0, framer import 0, 캐러셀 JS 0, 사례 3건이 정적으로 보인다(64rem 이상 3열, 375 세로), 인용 ≤4, 바이라인 '*' 0, 이니셜 원 아바타 0, 그린 채움 후기 패널 0, 사례·지역 라벨 color = `--fg-muted`. 4건 이상 목록 지면의 캐러셀: 30초 동안 활성 인덱스 변화 0, 이웃 슬라이드 마우스 클릭으로 활성 변경, article에 `inert`·`aria-hidden` 0이고 안쪽 래퍼에만 `inert`, near opacity 0.72 + `.case-body` opacity 0, 이동 transition 320ms, scale 0.
16. [잉크 밑줄·스크럽] iPhone Safari 실기기에서 Hero 밑줄 색 페이드가 보인다(실패하면 키프레임을 빼고 정적 밑줄로 둔다, C25). iOS 26 Safari 실기기·Chrome에서 Manifesto 두 줄 opacity .18→1 스크럽. iOS 18 Safari·Firefox 안정판·reduced·높이 499px에서는 처음부터 opacity 1, 밑줄 완성(캡처 4장). 스크럽 대상 조상 체인의 computed overflow-x/y에 hidden·auto·scroll 0(clip만). html/body `overflow-x: hidden; overflow-x: clip` 쌍 유지.
17. [상한] 홈 DOM: `[data-moment]` 4(≤6), `.ink-underline` 1, `.ink-underline-scrub` 1, `.pattern-grid` 1, `.masthead` 6, 섹션당 `[data-reveal]` ≤1, `video[loop]` 0, `getAnimations()`에서 `iterations === Infinity` 0(스피너·스켈레톤 제외), LogoBar 애니메이션 0, 홈 Kicker 7. 비상호작용 그린 표지는 뷰포트당 2개 이하, 그린 채움은 primary 1개(스크린샷으로 센다, C11).
17-1. [○→● 콜백] 02 공감의 `status-dot[data-state="off"]` 6, 03 흐름 지도의 최종 ● 6. 장부 행 이름과 지도 노드 라벨이 같은 순서·같은 문자열. reduced 첫 페인트에서 ● 6. 한 뷰포트 동시 진행 6 이하(MO-2).
17-2. [오버레이·이동·로딩·도판] Dialog·scrim·모바일 메뉴·드롭다운·토스트를 닫으면 `getAnimations()`에 160ms 이하 opacity 퇴장이 있다. 공개 내비게이션 직후 main 하위 `getAnimations()` 0(MO-10). 프리페치된 빠른 이동에서 스켈레톤 노출 0회, 느린 3G에서 300ms 뒤 등장, opacity 최저 .7(MO-9). 4G 스로틀에서 액자·캡션·출처 라벨이 사진보다 먼저(또는 동시에) 보이고 사진이 opacity로 차오르며, 캐시 재방문에서는 페이드 0, 이미지 대상 scale·clip-path·mask 애니메이션 0(MO-4). `/admin` 이동 애니메이션과 스크린샷 차이 0.

**성능·접근성·게이트**
18. [성능] 모바일 Lighthouse 3회 중앙값으로 홈·/product/hw·/product/sw CLS ≤ 0.05, TBT는 기준선보다 나빠지지 않는다. 4× CPU 트레이스에서 홈을 끝까지 스크롤하는 동안 애니메이션 원인 50ms 초과 long task 0. 홈 네트워크 로그에 recharts 청크 0. `rg -l framer-motion components/sections` 0개.
19. [접근성] axe 4.x(`reducedMotion: 'reduce'`, 저장소 의존성 밖 실행)로 홈·/pricing·/product에서 color-contrast·aria 위반 0. 카드 메타 #615D59, ○ 링 #8A857F(V15-A). 상태 점은 항상 텍스트 라벨과 함께. Hero 밑줄 구절이 360px 폭에서 줄바꿈되어도 가로 스크롤 0. 링크 단 키보드 포커스 시 outline이 단 전체를 감싼다.
20. [포털 포커스] 공개 페이지에서 DemoModal을 열고 Tab으로 이동한 버튼의 outline이 `2px solid rgb(8, 71, 52)`, outline-offset이 `var(--focus-offset)` 값. `/admin`의 Dialog·토스트에는 `.site` 조상이 없다.
21. [게이트] `npm run typecheck` → `npx eslint app components lib --max-warnings=0` → `npm run build`(prebuild `check:design-tokens` 포함) → `npx vitest run` 통과. 가드는 처음 2주 warn, 그 뒤 규칙별 error(system §6).

---

## 9. DESIGN.md 반영안 (cards_motion 몫)

DESIGN.md는 system §10에 따라 '적용 범위: public(.site) / admin'으로 구획하고 토큰마다 상태 배지(in force / target / retired)를 단다. 아래는 붙여넣기용이다. 보더·섀도 토큰 정의(§2)와 먹선 목록은 surfaces 반영안이 정본이고, 여기서는 카드·모션 절만 낸다.

**[교체] §4 「카드」(DESIGN.md:211-216)** — V10–V18 A 반영 2026-10-28

```markdown
### 카드 — 지면 블록 8종  `public(.site)` · target
어드민 카드(흰 바탕·hair·12px·Card Shadow)는 그대로다 `admin` · in force. `components/ui/card.tsx` 기본 출력(legacy)은 바이트 그대로 두고, 공개 화면은 `family`(column·case·plan·plain)를 명시한다.

공통
- 그림자 0. 둥근 것은 누를 수 있는 것뿐이다(V14-A): 카드·열린 단·Frame·표·띠는 r0, 컨트롤·떠 있는 층은 r6(스위치 트랙 포함), 칩·상태 점·스위치 썸은 원형. 테두리 1px `--line-hair`.
- 글만 있는 카드(인덱스·후기·가치)는 열린 단이다: 채움·상자 없이 위 hair 괘선, 단 간격 32/48, 64rem 이상 단 사이 세로 hair. sheet 상자는 사진 있는 사례·요금·Frame·plate·폼·표에만 쓴다(CO-9).
- 링크인 단·카드·목차 행·FAQ 행의 hover·focus-within: 경계 hair→strong + 화살표 2px. 진입 160ms, 이탈 320ms(ease-soft, V17-A). 제목 색·밑줄·배경·그림자·카드 위치는 바뀌지 않는다. pressed는 같은 끝 상태를 즉시. 링크 단은 화살표가 늘 보이고 히트 영역은 단 전체다.
- 정보 카드(링크 없음)는 hover 0. 포커스는 전역 2px #084734 outline, offset `--focus-offset`.
- 금지: 들림, 확대, 기울임, 그림자 증가, 채움 변화, 아이콘 확대, 사진 hover 확대, 장식용 좌측 컬러 바, 글만 있는 카드의 흰 상자.
- 의미 있는 좌측 2px 바는 세 곳: Comparison Classin 열, /pricing 선택 행, 세로 목차 현재 항목.
- 번호 'No. 01'은 순서 있는 묶음만. 병렬 단은 범주 라벨(13/600 #615D59, 바 없음). 한 페이지 번호 체계 2종 이하.
- 그린 배급: 비상호작용 그린 표지(잉크 밑줄·● 묶음·좌측 2px 바·차트 강조·인용 여는 따옴표)는 뷰포트당 2개 이하, 그린 채움은 primary 1개. 범주·지역 라벨은 muted.
- 바닥 짝: sheet는 섹션 지면이 아니다. sheet 상자는 paper·sunken 위에만. 먹 지면에는 카드·컨트롤 0.

| 블록 | 면·반경 | 패딩 데스크톱 / 모바일 | 제목 / 본문 | 쓰는 곳 |
|---|---|---|---|---|
| 열린 단 | 상자 없음 · 위 1px hair · r0 | 위 24 / 20, 단 간격 48 / 32 | H3 / 16·1.75 #31302E | 기능·특징·후기·가치처럼 글만 있는 묶음 |
| 수치 | 박스 없음 · 위 1px strong | 위 16 | Numeral 600 비례 숫자 / 출처 이름 14/500 #111110 · asOf 13 #615D59 | lib/facts.ts 등록 수치만(SSR 값, 카운트업 0). EEO 수치는 각주와 함께 |
| 인용 | 박스 없음 · 위 1px hair | 위아래 24 | Quote 500 / 바이라인 14 | 후기(4개 이하, 120자, 운영 명사 + 바뀐 행동, 실명 또는 서술형 익명, 별표 마스킹 금지, 2단 column-rule) |
| 사례 | sheet · r0(사진 있는 사례만) | 본문 24 / 20 | H3(변화 한 줄) / 16·1.75 + dl 사실 4칸 | 도입 사례(사진 3:2, 출처 장부 라벨, 미확인 컷은 사진 없이). 홈은 3건 정적, 캐러셀은 4건 이상 목록 지면만 |
| 요금 | sheet · r0(추천 1px #111110 + '추천' 탭) | 28 / 24 | H3 / 포함 항목 16(금액 칸 없음) | 요금·선택. 체크아웃·요금 시뮬레이터 밖 금액 0(견적 구성표), 시뮬레이터 결과 금액은 text-h2 tabular. Check는 추천 Plan만 #084734 |
| 목차 행 | 박스 없음 · 위 1px hair | 56px 열·위아래 20 / 40px 열·위아래 16 | Body L 600 / 14 #615D59 | 문서·자료·행사·업데이트 목록 |
| Frame | sheet · r0, 제목줄 없음, 40rem 이상 sunken 매트 | 도판 + 캡션 | 캡션 13 #615D59 | 목업(안쪽 점선 '예시 화면')·실제 화면. 섹션당 1 |
| CTA 띠 | sunken(마지막, rule-double) / paper(중간 1, 위아래 hair) | — | h2=text-h1 / Body L | FinalCTA(primary cta 52, 왼쪽 정렬), 홈 04 화면 섹션 끝 중간 띠(line cta, 섹션 안 요소) |

상태 점 ○ ● –는 상태에만 쓰고 항상 텍스트와 함께 쓴다. ○→● 색 전이는 OS 지도 노드(.os-node)와 폼 성공 패널(.success-panel) 두 곳만.
```

**[교체] §7 5번(DESIGN.md:268)**
`5. 섀도: 공개 화면(.site)은 떠 있는 레이어(Dialog·드롭다운·토스트·모바일 메뉴)만 --shadow-deep이고 카드·Frame·표·컨트롤·섹션은 0이다. 어드민은 Card Shadow를 유지한다.`

**[추가] §7 9·10·11번**
- `9. (public) 카드·단 hover는 경계 hair→strong(진입 160ms·이탈 320ms)과 화살표 2px뿐이다. 들림·확대·그림자·채움·제목 색·밑줄 변화는 금지한다.`
- `10. (public) 카드와 섹션 배경은 움직이지 않는다. 움직임은 §8 목록 안에서만 쓰고, 미완 상태는 [data-reveal="out"]과 prefers-reduced-motion: no-preference 안에서만 정의한다.`
- `11. (public) 둥근 것은 누를 수 있는 것뿐이다. 반경 값은 0(물건)·6(컨트롤·떠 있는 층)·원형(칩·점·스위치 썸) 셋이다.`

**[신설] §8 「모션 — 카드·배경」 `public(.site)` · target**

```markdown
## 8. 모션 — 카드·배경

원칙
- 지면은 평면이고 배경은 정지한다. 움직임은 투명도와 색이다(변위 예외: Reveal 12px 이하 상승, 4건 이상 목록 지면의 사례 캐러셀 이동).
- 첫 화면은 인쇄된 표지다. Hero 진입 애니메이션은 0이고, 첫 뷰포트에서 움직이는 것은 잉크 밑줄 한 획뿐이다.
- 반응은 즉각, 퇴장은 여운: hover 진입 160ms·이탈 320ms, 오버레이(Dialog·scrim·메뉴·드롭다운·토스트) 닫힘 160ms 페이드. 느린 곡선(--ease-fade, 900ms)은 서사 모먼트와 도판 현상에만.
- SSR·JS 없음·동작 줄이기에서는 항상 완성 상태. 미완 상태는 site-base.css의 no-preference 블록 한 곳에만.
- 홈 무한 루프 0, 자동 진행 0, 마키 0, 카운트업 0, stroke-dashoffset 0, 홈 사례 캐러셀 0.

토큰(app/styles/tokens.css): --motion-fast 160ms · --motion-base 320ms · --motion-slow 900ms · --motion-beat 240ms · --motion-rise 12px · --motion-stagger 80ms(●점등 전용) · --ease-soft cubic-bezier(.22,1,.36,1)(변위·조작) · --ease-fade cubic-bezier(.33,1,.68,1)(opacity·색 모먼트) · --ease-drift(로딩 스켈레톤) · --focus-offset 2px. reduced에서 rise 0, stagger 0.

홈 서사 모먼트(data-moment, 홈 4개, 상한 6)
| # | 모먼트 | 메커니즘 |
|---|---|---|
| ① | Hero 잉크 밑줄 | text-decoration-color 페이드 900ms ease-fade, 지연 240ms, CSS만 |
| ② | Manifesto 스크럽 | view() opacity .18→1 + 밑줄 색. @supports·no-preference·높이 500px 이상 |
| ③ | 03 흐름 OS 지도 ○→● | 02 공감 장부와 같은 6노드가 링에서 채움으로 색 전이, 900ms, 80ms 간격, 1회 |
| ④ | (빈 자리) | DashboardPreview는 홈에서 빠졌다. 차트 [data-seq] 순차는 제품 페이지 차트에 |
| ⑤ | 06 확신 Comparison 행 액센트 | Classin 열 2px 바 opacity, 900ms, 지연 240ms, 1회 |
| (6) | 사실 레지스트리 | 출처 있는 수치 1개를 정적 값으로(모션 0) |

조작 전환: 탭 패널 320ms(첫 페인트 제외) · 목록 지면 캐러셀 320ms · 카드·단 hover 진입 160 / 이탈 320 · Reveal 900ms(섹션당 1개, 카드 순차 없음) · 오버레이 닫힘 160ms 페이드 · 도판은 decode 전일 때만 opacity 현상 · 스켈레톤은 300ms 뒤에만, 1↔.7 2.4s · 공개 페이지 이동 모션 0.

금지: shimmer, 스윕, conic 테두리 빛, 글로우 펄스, ping, bob, 파티클, 블롭, 라이브 카운터, 무한 점멸·웨이브폼, 자동 전환, 자동 진행 괘선, Hero 순차 진입, 공개 페이지 이동 페이드, 도판 와이프·확대 안착·패럴랙스, filter·box-shadow·width·height 애니메이션, 상시 will-change, 한국어 글자 쪼개기, 탭 굵기 변화. 긴 글의 1px 스크롤 읽기 괘선은 허용(ReadingProgress 막대는 삭제).

예산: 한 뷰포트 동시 진행 10 이하 · 애니메이션 원인 long task 0 · 모션의 CLS 기여 0 · 공개 Recharts 0 · 홈 섹션 framer 0.
```

**결정 로그·문서 동기화(cards_motion 몫)**
- 결정 로그(system §10)에 V4-A·V5-A·V7-A의 카드·모션 결과를 적는다: 먹 서사 1곳, ProblemCost 정성 장부, FinalCTA sunken 띠, 배경·카드 정지(V7-B는 보드 비교 칸 정지 이미지만, 코드 없음).
- 결정 로그(DESIGN.md §9)에 V10-A·V14-A·V17-A의 카드·모션 결과를 적는다(2026-10-28 운영자 승인): 홈 11지면·중간 띠 1·사례 3건 정적·모먼트 4, 물건 r0·컨트롤과 떠 있는 층 r6·칩과 점 원형, Hero 진입 0·잉크 밑줄 240ms 뒤 900ms·hover 160/320·오버레이 닫힘 160.
- 감사 문서 동기화: §5-2(`--motion-story`·`--motion-progress`·`--motion-carousel` 토큰 삭제(X13), `lib/motion.ts` 미작성), §5-4(LogoBar 정적 목록, SolutionOverview 수동 탭, ProblemCost 정성 장부·카운터 0, DashboardPreview 홈에서 삭제·Recharts 0, 홈 사례 3건 정적, 장 머리 괘선 정적), §5-8(자동 진행 0, 예외 마키 삭제).

---

## 10. 하지 말 것

| Do | Don't |
|---|---|
| 링크 카드·단 hover: 경계 hair→strong + 화살표 2px, 진입 160ms · 이탈 320ms | `hover:-translate-y-*`, `hover:scale-*`, `hover:shadow-*`, `whileHover`, 제목 색·밑줄 hover, 먹선 hover, 끝 상태를 바꾸는 hover |
| pressed: 같은 끝 상태, `duration-0` | 카드 `active:scale-*` |
| 순서 있는 묶음만 `No. 01`, 병렬 단은 muted 범주 라벨 | 병렬 카드 번호, 그린 범주·지역 라벨, 민트·그라데이션 아이콘 타일, 카드에 Kicker |
| 글만 있는 카드는 열린 단(위 hair + 여백) | 글 카드의 흰 상자, sheet 바깥 상자 헤어라인 그리드 |
| sheet 상자는 물건(사진 있는 사례·요금·Frame·plate·폼·표)에만, paper·sunken 위에 | sheet 섹션 지면, 흰 섹션 위 흰 카드, 먹 위 카드·Frame·컨트롤 |
| 숨김 상태는 `[data-reveal="out"]` + no-preference 안에서만 | framer `initial={{opacity:0}}`, SSR 인라인 `opacity:0` |
| Reveal은 섹션당 1개, 모먼트는 `bare` | 카드마다 Reveal, 그리드 자식 순차 페이드, 항목별 delay |
| 움직임은 opacity(선은 켜진다) | stroke-dashoffset, `width` 막대, scaleX 긋기, 머리 괘선 긋기 |
| 탭·캐러셀은 사람이 넘긴다. 홈 사례는 3건 정적, 캐러셀은 4건 이상 목록 지면만 | 자동 진행, 자동 진행 괘선, 캐러셀 자동 넘김, 홈 사례 캐러셀, 마키 |
| Hero는 첫 프레임부터 정지, 잉크 밑줄 한 획만(240ms 뒤 900ms) | `hero-soft-enter` 순차 상승, H1 opacity .001 시작, 출처 미확인 Hero 도판, 짐작해 단 출처 라벨 |
| 공개 페이지 이동은 즉시 교체, 느리면 300ms 뒤 숨쉬는 스켈레톤 | 빈 paper에서 떠오르는 RouteTransition 페이드, `experimental.viewTransition`, 즉시 깜빡이는 스켈레톤 |
| 오버레이는 닫힐 때도 160ms 페이드 | 닫힘 애니메이션 없이 사라지는 Dialog·메뉴·드롭다운·토스트 |
| 도판은 decode 전일 때만 opacity 현상, 액자·캡션·출처는 즉시 | 도판 확대 안착, clip-path·mask 와이프, 커튼, 패럴랙스, 켄 번스 |
| 인용은 4개 이하, 운영 명사 + 바뀐 행동, 실명 또는 서술형 익명 | 별표 마스킹 바이라인, 이니셜 원 아바타, 별점, 그린 채움 대표 후기 패널 |
| 수치는 `lib/facts.ts` 등록분을 SSR 값으로 | 카운트업, 근거 없는 수치를 장부·표·KPI로 권위화 |
| ○●–는 상태 표시에만, 텍스트와 함께 | '○ 예시 화면', 로고 앞 점, 장식 불릿 |
| 그림자는 떠 있는 레이어만 `shadow-deep` | 카드·Frame·표·버튼 그림자, 'featured' Frame 그림자 |
| 반경: 물건 r0, 컨트롤·떠 있는 층 r6, 칩·점·스위치 썸 원형(V14-A) | 카드·Frame·표·띠의 둥근 모서리, 허용목록 밖 `rounded-*`, 반경 이원화(Frame만 r8 등) |
| 먹 지면은 `Section surface="ink"` / `surface-ink`, 먹 위 accent는 토큰이 주는 세이지 | `bg-[#111110]`, `bg-surface-ink`, 먹 위 #084734 하드코딩, #6EE7B7 |
| 의미 있는 좌측 2px 바 3곳 | 모든 카드·토스트의 좌측 컬러 바 |
| 공유 `card.tsx` 기본 출력(`legacy`) 바이트 유지, 공개는 `family` 명시 | 기본값을 바꿔 어드민·checkout 화면을 흔들기 |

---

## 11. 열린 질문

1. **ProblemCost 6행 질문형 문구는 누가 확정하나요?** 이 스펙은 행 구조(○ + 모듈명 + 질문형 문장)와 수치 0, 그리고 모듈명·순서를 OS 지도와 같게 두는 것(MO-2)만 정했고, 예시는 1줄("강사가 바뀌면 수업 품질도 바뀌나요?")뿐입니다. 고급화 기획 §9는 담당을 콘텐츠로 둡니다. 확정 전에는 step 5를 머지하지 않습니다.
2. **홈 사례 3건(대구·천안·대치)의 사진 출처와 공개 동의(감사 D4)를 확인할 수 있나요?** (V10-A로 질문 범위를 7건에서 3건으로 좁혔습니다.) 라벨은 출처 장부에서 나오므로 장부에 consentDocId·verifiedAt이 없는 컷은 사진 없이 열린 단으로 렌더합니다. 동의가 2건 이하면 2열, 사례가 없으면 인용 + 각주 수치 한 줄로 둡니다. 장부 1차 검증 담당은 P2-0에서 지정합니다.
3. ~~imagery에 요청: Frame 루트에 예산 검사용 표지 속성(`data-frame`)을 달아 줄 수 있나요?~~ **정리됨(2026-10-28)**: X10 개정과 MO-4로 Figure·Frame은 루트에 `data-figure`·`data-frame`을 반드시 출력하고, P2 Figure/Frame 프리미티브에 들어간다. Card의 `data-card`와는 분리한다(Frame은 Card가 아님, X10).
4. **수업 OS 지도 노드를 '전 1 / 중 2 / 후 3'으로 확정해도 될까요?** 기존 SolutionOverview 문구를 따른 배정입니다. 2/2/2로 맞추려면 학생 관리를 '전'으로 옮기고 1단계 points 문구를 바꿔야 합니다. ○→● 콜백(MO-2)은 장부 6행 순서를 이 노드 순서에 묶으므로, 배정을 바꾸면 장부 순서도 같이 바뀝니다.
5. ~~GlobalScale은 `lib/facts.ts`에 출처 있는 수치가 하나도 등록되지 않으면 어떻게 할까요?~~ **정리됨(2026-10-28)**: V10-A로 GlobalScale은 05 기록에 합쳐지고, system §5-5 개정으로 EEO 수치(160+개국·5,000만+·월 3,000만+)를 `lib/facts.ts`에 등록해 각주와 함께 한 줄로 싣는다(§3-3). 6만+·2억+는 About에만. 등록 근거 보관·법무 확인은 운영자 몫이다(고급화 기획 §9).
6. **블로그 목록 카드는 '대표 + 3열 카드' 구조를 유지하고 사진 hover 확대와 블러만 빼는 안이 맞나요?** 블로그 세션의 미커밋 변경이 같은 파일에 있어, 그 커밋 뒤에 step 14에서 반영합니다.
7. **X06 보강: 캐러셀 far 슬라이드 안쪽 래퍼에도 `inert`를 명시해도 될까요?** (X06 개정으로 캐러셀은 4건 이상인 목록 지면에만 남으므로, 이 질문도 그 지면에만 해당한다.) X06은 near에만 `inert`를 적고 far는 opacity 0·`pointer-events: none`만 둡니다. 그대로면 보이지 않는 far 슬라이드를 스크린리더가 읽습니다. 이 스펙은 비활성 전체(`inert={!isActive}`, §3-15 :153 행·§5-2 보조기기)에 거는 쪽으로 쓰고, X06에 "far도 안쪽 래퍼 inert" 한 구절 추가를 요청합니다.
