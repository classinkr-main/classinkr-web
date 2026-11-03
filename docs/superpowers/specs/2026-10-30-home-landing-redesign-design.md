# 홈 랜딩 개편 — 설계 (2026-10-30 · 11-02 개정)

상태: 설계안 v2. 시안 캔버스(v1, 7화면): https://claude.ai/artifact/GiX5L3g1DCMhHjPxGn4jSn — 구조·여백·팔레트 A 의 참고용이며, v2 는 아래가 정본이다.

11-02 개정 요지: "텍스트·여백·배치·길이 줄이기, 홈은 매우 컴팩트하게, 각 화면은 해당 페이지로 보내는 관문". 6화면 → 5화면, 시각물은 히어로 1장만, 화면마다 상세 페이지 링크 1개.

## 1. 목표

홈(`/`)을 "더 직관적이고, 이해하기 쉽고, 디자인이 단순하게" 만들고 공개 사이트의 강조색을 바꾼다.

- 섹션 19개(약 2,400줄)를 **화면 5개, 컴포넌트 합계 400줄 이하**로 줄인다. 화면마다 메시지 하나, 링크 하나.
- 홈은 설득을 다 하지 않는다. 각 화면은 한 문장으로 요점을 말하고 상세 페이지(`/product/sw`·`/product/hw`·`/product/ai-report`·`/blog`·`/resources/...`·`/showroom`·`/pricing`)로 보낸다.
- 히어로를 밝은 정적 한 화면으로 바꾼다. 영상·스티키·워터마크·다크 그라데이션을 없앤다.
- 홈의 행동 목표를 **파일럿 상담 신청** 하나로 정한다. 진단지 다운로드는 보조 텍스트 링크로 내린다.
- 강조색을 `#084734`(포레스트 그린)에서 **`#0B7A52`(선명한 그린)** 으로 바꾼다. 범위는 공개 사이트만. 어드민은 그대로 둔다.
- 홈 섹션은 hex 리터럴 없이 `app/styles/tokens.css` 토큰 유틸만 쓴다. 그래야 다음 색 변경이 한 줄이 된다.

사용자가 확정한 것: 기준 브랜치 `design/p1-visual`, 공개 사이트만, 파일럿 상담 단일 목표, 밝은 정적 히어로, 노션×토스 구조, **컴팩트 + 페이지 관문(11-02)**. 색과 세부 구조는 "판단은 Fable"에 따라 아래와 같이 정했다.

## 2. 결정과 근거

### 2-1. 강조색 = A 선명한 그린 `#0B7A52`

| 후보 | 값 | 결론 |
| --- | --- | --- |
| A 선명한 그린 | `#0B7A52` (hover `#0A6E4A`) | **채택.** 브랜드 연속성 유지, 현행보다 밝고 선명. paper 위 5.1:1, 흰 글자 5.4:1로 AA 통과. 먹 지면 민트 `#6EE7B7`는 그대로 |
| B 딥 블루 | `#1F5EEB` | 기각. `DESIGN.md`·홈 플레이북의 "파랑·보라 금지" 원칙 위반, 어드민 확도 파랑 `#1E5DA8`과 혼동 |
| C 먹 + 오렌지 | `#111110` + `#C2410C` | 기각. 오렌지가 어드민 Warning 축(`#A8741A`)과 의미 충돌, 변화 폭이 커서 제품·가격 페이지와 어긋남 |

현행 `#084734`는 10.3:1로 과하게 어둡다. 새 값은 AA를 넉넉히 넘기면서 가장 밝은 그린이다. 색이 토큰 한 줄이 되므로 이후 교체는 트리비얼하다.

### 2-2. 구조 = 5화면 관문

노션 뼈대(히어로 → 신뢰 → 제품 → 증거 → CTA)에 토스 밀도(화면당 헤드라인 하나, 보조 한 줄). 비교표 화면은 뺐다 — 그 내용은 `/product/sw`가 이미 다루고, 홈은 관문이다.

| # | 화면 | 지면 | 내용 (전부 한 줄 규칙) | 관문 링크 | 출처(현행) |
| --- | --- | --- | --- | --- | --- |
| 1 | 히어로 + 신뢰 띠 | paper | 키커 "학원 수업 운영 OS" · H1 `heroHeadline` 2줄 · 리드 `oneLine` 1줄 · 주 CTA "파일럿 상담 신청"(DemoModal) · 보조 링크 "34문항 운영 진단지 받기" · 제품 화면 1장 · 숫자 4개(3,000만+ 월간 수업 / 5,000만+ 교사·학습자 / 6만+ 기관 / 160+ 국가) + "EEO 공식 기준 · 전 세계 누적" | `/resources/academy-system-checklist#download` | Hero, LogoBar, GlobalScale |
| 2 | 문제 | sunken | H2 "강사가 바뀌면, 수업도 바뀝니다." · 장면 3개(제목 + 한 줄) · 마무리 "수업은 개인기가 아니라, 시스템입니다." | "우리 학원 운영 누수 진단하기" → `/resources/academy-system-checklist` | ProblemCost, Manifesto |
| 3 | 작동 방식 | paper | H2 "수업 전·중·후를 하나의 흐름으로" · 카드 3개(단계 라벨 + 제목 + 한 줄 + "자세히 보기") | 수업 전 → `/product/sw`, 수업 중 → `/product/hw`, 수업 후 → `/product/ai-report` | SolutionOverview, DashboardPreview, Comparison |
| 4 | 증거 | sunken | H2 "먼저 바꾼 학원들" · 사례 3건(학원명 + 결과 한 줄) | "도입 이야기 더 보기" → `/blog` | CaseStudies |
| 5 | 파일럿 + 마지막 CTA | paper | H2 "1개 교실, 90일 파일럿부터" · 3단계(번호 + 제목 + 한 줄) · 정직한 범위 한 줄 · 주 CTA + 보조 링크 · 페이지 줄(쇼룸 · 가격 · 자료실) | `/showroom` · `/pricing` · `/resources` | FinalCTA, 도입 현실 카피 |

카피 예산: H2 16자 이하, 보조 문장 1개(40자 안팎), 카드 본문 1문장. 화면 3·4·5의 항목 본문은 모두 한 줄이다. 전체 데스크톱 높이 목표 약 2,600px(현행 약 12,000px), 모바일 약 4,500px.

삭제: EraVision, HomeEntitySummary, HomeAudiencePaths, HomeLeadMagnet(섹션), SatisfyingClass, TestimonialWall, Outcomes, ScienceBased, Comparison(홈 화면으로서), KeyUseCases(홈에서만; 파일은 `/product/sw`가 써서 유지).
이동 없음: HomeAudiencePaths의 세 갈래(자료실·FAQ·가이드)는 헤더·푸터에 이미 있다. 사례 사진·대시보드 차트·비교표는 상세 페이지 몫이다.
SEO: `createPublicMetadata`·JSON-LD(WebPage, Breadcrumb)는 그대로. 엔티티 용어(전자칠판·EDB 교안·녹화·LMS·관리자 데이터·수업 시스템 OS)는 히어로 리드(`oneLine`)와 3화면 카드가 품는다.

### 2-3. 카피 (확정 문안, `components/home/home-copy.ts`에 둔다)

H1·리드는 `lib/classin-positioning.ts`의 `heroHeadline`·`oneLine`을 쓴다. 나머지는 아래 그대로.

**1 히어로**: 키커 "학원 수업 운영 OS" · 주 CTA "파일럿 상담 신청" · 보조 "34문항 운영 진단지 받기" · 숫자 라벨 "월간 수업 / 교사 · 학습자 / 교육기관 / 서비스 국가" · 캡션 "EEO 공식 기준 · 전 세계 누적"

**2 문제**: H2 "강사가 바뀌면, 수업도 바뀝니다."
- "에이스 강사가 퇴사했습니다." — "그 반 20명의 수업 품질은 누가 지킵니까."
- "같은 교재, 같은 시간." — "반마다 성적이 다른데, 어느 반이 왜 다른지 모릅니다."
- "상담마다 같은 질문." — "\"복습은 어떻게 하나요?\"에 매번 말로만 답합니다."
- 마무리 "수업은 개인기가 아니라, 시스템입니다." · 링크 "우리 학원 운영 누수 진단하기"

**3 작동 방식**: H2 "수업 전·중·후를 하나의 흐름으로"
- 수업 전 / "EDB 교안" / "우수 강사의 판서와 자료를 다시 쓰는 수업 파일로 남깁니다." → `/product/sw`
- 수업 중 / "Classin Board" / "전자칠판·카메라·OPS·소프트웨어가 한 교실 안에서 함께 돕니다." → `/product/hw`
- 수업 후 / "녹화 · AI 리포트 · 관리자 데이터" / "수업이 끝나도 기록과 관리 기준이 남습니다." → `/product/ai-report`
- 카드 링크 문구 "자세히 보기"

**4 증거**: H2 "먼저 바꾼 학원들"
- "청주 이** 국어" — "첨삭·과제 이력을 누적해 강사별 편차를 줄였습니다."
- "부산 과**" — "반별 수업 기록과 평가 데이터로 상담 준비 시간을 줄였습니다."
- "대치 세**" — "판서와 자료가 수업 흐름 안에 남아 복습·보강 밀도를 높였습니다."
- 링크 "도입 이야기 더 보기" → `/blog`

**5 파일럿**: H2 "1개 교실, 90일 파일럿부터"
- 1 "대표 수업 선정" — "가장 손이 많이 가는 수업 하나를 고릅니다."
- 2 "교실 설치 · 온보딩" — "보드 설치와 강사 온보딩을 함께 진행합니다."
- 3 "결과 확인 후 확대" — "녹화와 데이터로 결과를 보고 다음 교실을 정합니다."
- 정직한 범위 "결제 · 오프라인 출석 · 고급 리포트는 별도 시스템이나 연동으로 분리해 설계합니다."
- 주 CTA "파일럿 상담 신청" · 보조 "34문항 운영 진단지 받기" · 페이지 줄 "목동 쇼룸 / 가격 / 자료실"

### 2-4. 디자인 규칙 (홈 한정, `DESIGN.md`·`public-site-design-language` 위)

- 바탕 `bg-surface-paper` ↔ `bg-surface-sunken` 교차(1·3·5 paper, 2·4 sunken). 카드는 `bg-surface-sheet border border-line-hair rounded-xl`. 채움·파스텔 카드 금지, 그라데이션·emoji·핑 애니메이션·사진·차트 금지(히어로 1장 제외).
- 강조색은 **누를 수 있는 것에만**: 주 CTA 채움(`Button` 기본 variant), 링크 글자(`text-fg-accent`), 화살표, 포커스 링. 제목·칩·라벨·단계 번호에는 쓰지 않는다. 키커·단계 라벨은 `text-label text-fg-muted`, H1 구절은 먹 굵기. 틴트 토큰을 새로 만들지 않는다.
- 타이포는 토큰 스케일만: H1 `text-h1`(컴팩트 — display 72px는 25자 헤드라인이 3줄이 된다), H2 `text-h2`, 카드 제목 `text-h3`, 본문 `text-body text-fg-body`, 라벨 `text-label text-fg-muted`, 숫자 `text-h3 tabular-nums`, 캡션 `text-note text-fg-muted`. `break-keep`. 모바일 자간 0은 토큰이 처리한다.
- 여백: 섹션 `py-14 md:py-20`(56/80px). 컨테이너 `mx-auto max-w-[1040px] px-5`. 제목 블록과 본문 사이 `mt-8 md:mt-10`. 카드 3열은 `grid gap-4 md:grid-cols-3`.
- 모션: 2~5화면 루트만 `components/landing/Reveal.tsx`로 감싼다(은은한 상승 1회). 히어로는 모션 없음. 카드·항목 순차 등장 금지.
- 시각물: 히어로 `/images/hero-dashboard.webp`(1536×1024) 한 장, `priority`, `sizes="(min-width: 1040px) 960px, 100vw"`, `rounded-xl border border-line-hair`. 다른 화면은 시각물 없음 → 스크린샷 플레이스홀더 문제가 사라진다.
- 링크 모양: 텍스트 링크는 `inline-flex items-center gap-1 text-ui font-semibold text-fg-accent hover:underline underline-offset-4` + `ArrowRight` 16px(`aria-hidden`). 페이지 줄(5화면)은 `text-ui text-fg-muted hover:text-fg-ink`.

## 3. 변경 범위

### 3-1. 파일

새 폴더 `components/home/`:

| 파일 | 역할 |
| --- | --- |
| `home-copy.ts` | 2-3 카피 상수 전부. 컴포넌트는 문자열을 직접 쓰지 않는다 |
| `HomeHero.tsx` | 1화면. `pt-(--header-h)`, 제품 이미지 `priority`, 신뢰 띠 포함. 클라이언트(DemoModal) |
| `HomeProblem.tsx` | 2화면 |
| `HomeHow.tsx` | 3화면. 카드 3개 데이터 → 링크 |
| `HomeProof.tsx` | 4화면 |
| `HomePilotCta.tsx` | 5화면. 클라이언트(DemoModal) |

`app/page.tsx`: 위 5개만 조립. 2~5화면은 지금처럼 `next/dynamic`.

삭제(홈 전용이라 다른 참조 없음을 확인함 — `app/page.tsx` 외 참조 0): `components/sections/{Hero,LogoBar,HomeEntitySummary,HomeAudiencePaths,EraVision,ProblemCost,HomeLeadMagnet,Manifesto,SolutionOverview,DashboardPreview,DashboardPreviewCharts,ScienceBased,SatisfyingClass,CaseStudies,GlobalScale,TestimonialWall,Outcomes,Comparison,FinalCTA}.tsx`, `public/video/home-hero.mp4`(35MB, Hero만 참조). `DashboardPreviewCharts`는 DashboardPreview만 참조한다. `lib/testimonials.ts`는 `/product/sw`·`/product/hw`가 써서 남긴다. `hero-soft-enter` CSS는 `/docs`·`/download`가 써서 남긴다. `scripts/check-design-tokens.mjs`에 DashboardPreview 경로가 allow 목록으로 있으면 그 줄만 지운다.

유지: `DemoModal`, `Header`, `Footer`, `KeyUseCases`(제품 페이지), `HeroVideoBackdrop`(제품 페이지), `TrackedLink`.

### 3-2. 토큰·색

- `app/styles/tokens.css`: `:root`의 `--fg-accent: #0B7A52`, `--fg-accent-hover: #0A6E4A`, `--line-link: rgb(11 122 82 / .75)`(밑줄 대비 ≈3.2 유지). 그리고 **어드민 유지 블록** `:root:not(:has(.site)) { --fg-accent: #084734; --fg-accent-hover: #065C41; --line-link: rgb(8 71 52 / .6); }`을 같은 파일에 더한다 — `.site`는 `AppChrome`이 공개 크롬에만 두는 래퍼라, 공개 DOM(포털 포함)은 새 그린, 어드민·checkout DOM은 옛 그린을 읽는다. 덕분에 공용 `components/ui/**`를 토큰으로 바꿔도 어드민 색이 변하지 않는다. `.surface-ink` 블록은 그대로.
- `lib/design-tokens.ts` 미러의 `accent`를 같은 커밋에서 바꾼다(`tests/lib/design-tokens.test.ts`가 대조).
- `components/ui/button.tsx`: `#084734`·`#065c41`·`#ECFDF5`·`#D1FAE5`·`#111110`·`#F6F5F4`·`black/[0.08]`·`bg-white` 리터럴을 토큰 유틸로 바꾼다(`bg-fg-accent`, `hover:bg-fg-accent-hover`, `text-fg-on-accent`, `focus-visible:ring-fg-accent`, `text-fg-accent`, `bg-fg-accent/8`, `hover:bg-fg-accent/14`, `text-fg-ink`, `border-line-hair`, `bg-surface-sheet`, `hover:bg-surface-sunken`). 공용 버튼이라 색 변경이 공개 사이트 전체 버튼에 흐르고, 어드민은 위 유지 블록 덕에 옛 그린 그대로다. `destructive`(red-500)는 어드민 전용이라 손대지 않는다.
- `DESIGN.md` §2 Primary와 `docs/active/playbook/01-home-front.md` §4 팔레트 줄: 공개 사이트 강조색 `#0B7A52`(hover `#0A6E4A`), 어드민은 `#084734` 유지라고 적는다.
- `scripts/check-design-tokens.mjs`의 allow 목록에 `#084734`가 있으면 공개 범위에서는 뺀다.

### 3-3. 공개 사이트 나머지 hex → 토큰 (배포 전 필수)

홈만 새 색이고 제품·가격·컨택이 옛 색이면 사이트가 두 가지 그린을 보인다. 그래서 아래도 같은 작업의 일부다. 기계적 치환이며 Opus 위임 대상. 범위는 가드 `PUBLIC` 스캔 범위(어드민·API·checkout·receipt·portal 제외)와 같다.

| 영역 | 출현(그린 6종) | 처리 |
| --- | --- | --- |
| `components/sections/**`(남는 24파일: Header·Footer·DemoModal·KeyUseCases 등) | 190 | 아래 규칙 |
| `app/product/**` | 312 | 아래 규칙 |
| `components/ui/**` | 130 | 아래 규칙 |
| `app/about`, `app/contact`, `app/pricing/**`, `app/resources/**`, `app/docs/**`, `app/blog/**`, `app/events/**`, `app/showroom`, `app/download`, `app/updates`, `app/faq`, `app/premium/**`, `app/terms`, `app/privacy`, `app/unsubscribe`, `app/data-deletion`, `app/account`, `app/share/**`, `app/*.tsx` | 약 330 | 아래 규칙 |
| `components/{landing,product,docs,blog,seminars,showroom,events,premium,legal,consent,auth,billing,account,media,seo}/**` | 약 230 | 아래 규칙 |
| `app/globals.css` | `--primary`·`--primary-hover`·`--accent-foreground`·`--ring`·`.rich-editor-*`·`[data-admin-crm]`·`.admin-nav-progress`는 어드민·shadcn 공용이라 **건드리지 않는다**(15곳 전부 그쪽이다) | 0 |
| 제외 | `components/ui/card.tsx`(`tests/ui/card.test.tsx`가 옛 출력을 박제), `components/{billing,checkout,portal,auth,account}/**`·`app/{checkout,receipt,share,account,auth}/**`(`.site` 밖이라 토큰이 옛 그린을 주어 의미 없음, 가드 범위 밖), `lib/**` | — |

치환 규칙: `text-[#084734]`→`text-fg-accent`, `bg-[#084734]`→`bg-fg-accent`, `hover:bg-[#065c41]`→`hover:bg-fg-accent-hover`, `hover:text-[#065c41]`→`hover:text-fg-accent-hover`, `border/ring/outline/divide-[#084734]`→`…-fg-accent`, `bg-[#084734]/N`→`bg-fg-accent/N`, 액센트 채움 위 `text-white`→`text-fg-on-accent`, `bg-[#ECFDF5]`→`bg-fg-accent/8`, `bg-[#D1FAE5]`→`bg-fg-accent/14`, `rgba(8,71,52,a)` 그림자→`color-mix(in srgb, var(--fg-accent) a%, transparent)` 또는 제거, 인라인 `style={{ color: '#084734' }}`→클래스. `.surface-ink` 안의 `#6EE7B7`은 `text-fg-accent`(먹 지면이 변수로 민트를 준다). hex→hex 치환 금지(가드 정책). 어드민 공용 컴포넌트(`components/ui/**`)는 토큰 유틸이 어드민 DOM에서도 `:root` 값을 읽으므로 안전하다. 파일 묶음마다 `npm run check:design-tokens`로 확인한다.

### 3-4. 계측

기존 `click_cta` 버튼 id를 그대로 쓴다. `hero_demo`(DemoModal), `hero_lead_magnet`(TrackedLink), `final_consultation`(DemoModal), `final_lead_magnet`(TrackedLink). 새 id는 만들지 않는다. 관문 링크(문제→진단지, 카드→제품, 사례→블로그, 페이지 줄)는 `next/link` 그대로 — 도착 페이지의 page_view가 센다.

### 3-5. 브랜치·병합

- 작업 위치: 워크트리 `classin_home-design-p0`(`design/p1-visual`, `.env.local` 심링크 있음).
- 선행: **`origin/main`(b4bec0d5, 2026-10-30, 운영 배포본 = PR #48·#50 개인정보 핫픽스 포함)** 을 `design/p1-visual`에 병합한다. 로컬 `main`은 쓰지 않는다 — origin/main보다 159 커밋 뒤이고(핫픽스 없음) 다른 세션이 오늘도 커밋 중(d9b786c3)이라 기준이 흔들린다. `merge-tree` 결과 충돌 22파일. 해결 정책(HEAD=design, theirs=origin/main): 디자인 언어 문서 8개(add/add)와 `scripts/check-design-tokens.mjs`(규칙 레지스트리판)는 **ours**; `app/contact/page.tsx`·`app/product/sw/page.tsx`(정직성 수정으로 SlotDigit·"200개 고객사" 삭제)·`components/sections/{DemoModal,Hero,ProblemCost,KeyUseCases}.tsx`·`components/showroom/SlotPicker.tsx`·`AGENTS.md`는 **theirs**; `components/ui/FloatingChatbot.tsx`는 ours(`z-(--z-chatbot)`); `app/layout.tsx`(viewport + verification 둘 다)·`components/AppChrome.tsx`(design의 skip link·`.site` 래퍼·`cn` + main의 `hidesPublicChrome`/`isTrackingExcludedPath`/`ContactLinkTracker`/`showGoogleTag`)·`DESIGN.md`(design 두 줄 + main의 Form Label 한 줄)·`docs/README.md`(design 세 줄 + main의 신규 항목 세 개)는 **양쪽 합침**. 병합 뒤 게이트와 `npx vitest run`이 필수다(AGENTS.md).
- 완료 후 PR → `main` 스쿼시(저장소 관례). 운영 배포는 사용자가 실행한다.

## 4. 검증

1. `npm run typecheck` → `npx eslint app components lib --max-warnings=0` → `npm run build`(prebuild에 디자인 토큰 가드 포함) → `npx vitest run`.
2. `components/home/**`와 `app/page.tsx`에 hex 리터럴 0건(`grep -c '#[0-9A-Fa-f]\{6\}'`).
3. 새 테스트 `tests/home/landing-sections.test.tsx` 하나(`renderToStaticMarkup`, DemoModal·next/image·next/link는 mock): 5개 컴포넌트가 H1/H2를 렌더하고, "파일럿 상담 신청"이 히어로와 5화면에 각 1회, 진단지 링크 href가 `/resources/academy-system-checklist#download`, 관문 href 7개(`/resources/academy-system-checklist`, `/product/sw`, `/product/hw`, `/product/ai-report`, `/blog`, `/showroom`, `/pricing`)가 각 화면에 있는지 확인한다.
4. 브라우저 확인: 데스크톱 1280·모바일 375에서 전체 스크린샷, 콘솔 오류 0, 문서 높이 데스크톱 3,200px 이하.
5. 시각 대조: 시안 캔버스 Main 보드(팔레트 A)와 여백·위계가 맞는지 본다. 화면 수는 v2(5)가 정본이다.

## 5. 범위 밖

- 어드민 색 변경(hex 2,600여 곳). 별도 작업. (버튼 공용 컴포넌트 한 곳만 3-2 대로 흐른다.)
- 제품·가격 페이지의 구조 개편. 3-3은 색 치환만이다.
- 사례 사진·대시보드 차트·비교표의 홈 복귀. 상세 페이지 몫.
- `cloud_<월>.<버전>` 브랜치 규칙: 사용자가 `design/p1-visual`을 지정해 예외로 둔다.

## 6. 실행 순서 (각 단계는 Opus 위임, 검토·결정은 Fable)

1. main → design/p1-visual 병합 + 게이트 + vitest.
2. 토큰·버튼·문서 색 변경(3-2) + 토큰 테스트.
3. `components/home/` 5개 + `home-copy.ts` + `app/page.tsx` + 섹션 삭제 + 홈 테스트.
4. 공개 사이트 hex → 토큰(3-3), 묶음별로 가드 확인.
5. 게이트·vitest·브라우저 스크린샷, 설계와 대조, PR.

## 7. v3 — 폰트·여백·실제 화면·직접 문구 (2026-11-03, PR #54 위에 `design/home-v3`)

사용자 요청: "폰트, 여백, 직접 UI 화면, 직접적인 개선(적용·다가오는 문구·시각·이득)". §5의 "사례 사진의 홈 복귀 금지"는 이 절이 대체한다(실제 캡처·사진에 한함).

### 7-1 도판 7장 (모두 실제 화면·사진, 이름은 원본에서 블러)
| 자리 | 파일(`public/images/home/`) | 원본 | 비고 |
|---|---|---|---|
| 히어로 | 기존 `images/hero-dashboard.webp` 1536×1024 | 기존 | 전자칠판 사진 유지(사용자 결정 11-03 "처음에는 전자칠판이 필요"). 세로 쌓기 |
| 작동 방식 · 수업 전 | `how-before.webp` 1200×754 | 드라이브 `수업과정.png`(10-15, 블러본) | 코스 한 과정에 주차별 수업·자료·숙제·시험 |
| 작동 방식 · 수업 중 | `how-during.webp` 1200×750 | 드라이브 `11층칠판설치(4).jpg` 보드 중심 16:10 크롭 | 실제 교실, 사람 없음 |
| 작동 방식 · 수업 후 | `how-after.webp` 1174×734 | 드라이브 `리포트.png` 상하 트림 | AI 강의 분석 탭 |
| 사례 3 | 기존 `case-studies/{cheongju-imisook-korean-v3.jpg, busan-gwasaram.jpg, daechi-sejeong.webp}` | 이미 공개 중 | 새 파일 없음 |

가공 스크립트: 세션 스크래치 `home-images.mjs`(sharp, webp q82). 드라이브 접근은 공용 서비스 계정 읽기 전용.

### 7-2 문구 — 카드마다 '적용 한 줄 + 이득 한 줄'
- 작동 방식 카드(제목 "도입하면 바로 달라지는 세 가지"(11-03 "첫 수업부터 바로 생기는 것"은 어색하다는 피드백으로 교체)): `phase`(수업 전·중·후) → `product`(EDB 교안 / **자동 녹화** / **AI 강의 평가** — 사용자 지시 11-03 "직접적이고 즉시적인 이득") → 제목은 이득, 본문은 적용. 표현은 제품 페이지 정본("수업 자동 녹화 · 클라우드 저장", "AI 강의평가(수업 품질 진단)")과 맞춘다. 숫자·과장어·`→` 없음. 출석·결제는 "별도 시스템"이므로 이득에 끌어오지 않는다.
- H1·리드는 `lib/classin-positioning.ts` 정본 그대로. 사례 3건은 숫자 없이 유지(출처 있는 수치만 허용).

### 7-3 폰트
- Pretendard Variable 자체 호스팅: `pretendard` npm 패키지의 dynamic-subset CSS를 `app/layout.tsx`에서 import, jsDelivr preconnect·preload·stylesheet 3개 제거.
- `tokens.css`를 DESIGN.md §3 정본으로: `text-h1` 36→56, display·h1·h2 굵기 600. 레거시 `globals.css` 모바일 `letter-spacing: 0 !important` 두 블록은 어드민(`.site` 없는 DOM)으로 한정.

### 7-4 여백
- 홈 5화면 측면 거터 `px-5` → 시스템값 `px-4 sm:px-6`. 섹션 리듬 56/80은 DESIGN.md §5-A 표에 `compact`로 등재. 컨테이너 1040 유지.

### 7-5 검증
§4와 같다. 추가: 홈 `<img>` 7개 모두 alt 있음·`priority` 0, 데스크톱 문서 높이 4,600px 이하.

## 8. v4 — 시안 B 구조 + T2 타이포(IBM Plex Sans KR) 전체 사이트 (2026-11-03 사용자 선택)

시안 캔버스 https://claude.ai/artifact/Sqstbv5y41VNEviU2gxX1U 의 `B-T2`가 정본. 홈 구조는 B, 글꼴·두께·여백은 T2를 공개 사이트 전체에 적용한다.

### 8-1 홈 화면 순서 (헤더·푸터 제외 8)
1. 히어로 — v3 그대로(가운데 정렬, 전자칠판 사진 960, 숫자 4).
2. 학원 롤링 띠 — 캡션 "이미 시스템화를 선택한 학원들" + 옛 LogoBar 학원명 34곳이 왼쪽으로 흐름(양끝 마스크, `prefers-reduced-motion`이면 정지).
3. 섹션 머리 "수업 전 · 중 · 후" / "도입하면 바로 달라지는 세 가지".
4~6. 이득 3행, 이미지·글 좌우 교차(이미지 55%): 수업 중 · 자동 녹화(`gain-recording.webp`, 액자) / 수업 후 · AI 강의 평가(`win-ai.webp`, 창만 + 옅은 그림자, 캡션 "실제 화면 · AI 강의 분석") / 수업 전 · EDB 교안(`win-activity.webp` 대화창만 + 그림자, 최대 480, 캡션 "실제 화면 · 활동 게시"). 각 행 = 라벨(phase · product) → 제목 → 본문 → 체크 3 → "자세히 보기".
7. 역할마다 달라지는 것 — 관리자/강사/학생/학부모 Before·After 표(옛 Outcomes 문구 그대로).
8. 먼저 바꾼 학원들 — v3 그대로.
9. 상담 전에 둘러보기 — 처음 알아보기 `/resources` · 도입 검토하기 `/faq` · 이미 사용 중이신가요? `/docs`.
10. 파일럿 먹 띠 — 제목 "1개 교실 파일럿부터"(90일 없음), 3단계, 정직 문구, CTA 2, 신뢰 줄 "대표 수업 하나로 상담 받아보기 ∙ 도입 범위는 상담에서 함께 정합니다", 페이지 링크 3.
- 이득 3행 문구·체크 3줄은 캔버스 B 본문 그대로. 문제 3장면 화면은 뺀다(진단지 링크는 히어로·파일럿에 남음).

### 8-2 T2 타이포 — 공개 사이트 전체
- 글꼴: `IBM Plex Sans KR`(400·500·600·700, `@fontsource/ibm-plex-sans-kr` 자체 호스팅) → 폴백 Pretendard Variable → 시스템. DESIGN.md "Pretendard 하나"(V2-A·V18-A) 결정은 V20-A로 교체. 어드민은 `.site` 밖이라 영향 없음(폰트 토큰은 공개 전용으로 분기하지 않는다 — 어드민도 같은 스택을 상속하므로 어드민 글꼴도 바뀐다. 사용자 "전체 사이트" 지시의 범위를 공개 사이트로 읽고, 어드민은 `:root:not(:has(.site))`에서 `--font-sans`를 Pretendard로 되돌려 둔다).
- 토큰: `text-h1` 36→60px 행간 1.15 자간 −0.02em · `text-h2` 28→38px 행간 1.2 자간 −0.02em · `text-h3` 20→30px 행간 1.25 · `text-body-l` 18px 행간 1.8 · `text-body` 16px 행간 1.8 · `text-label` 12px/600 자간 +0.04em · `text-numeral` 44px/600. 굵기는 display·h1·h2·h3 600 유지.
- 버튼·입력 모서리 6px → 8px. 창 캡처 전용 그림자 유틸 `.plate-window`(`0 12px 32px rgb(17 17 16 / .14), 0 1px 2px rgb(17 17 16 / .08)`)를 `app/styles/utilities.css`에 두고 홈 창 캡처 2곳에만 쓴다(V14-A 그림자 0의 유일한 예외, V20-A).
- 섹션 리듬: 홈 `compact` 56/80 → 80/112(`py-20 md:py-28`), 히어로 상단 `+ 96px`.

### 8-3 검증
§4·§7-5와 같다. 추가: 모든 공개 페이지에서 `font-family` 계산값이 Plex로 시작, 어드민은 Pretendard. 홈 `<img>` 7개 alt·`priority` 0, 롤링 띠는 reduced-motion에서 정지.
