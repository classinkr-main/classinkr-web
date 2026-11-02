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
- 타이포는 토큰 스케일만: H1 `text-display`, H2 `text-h2`, 카드 제목 `text-h3`, 본문 `text-body text-fg-body`, 라벨 `text-label text-fg-muted`, 숫자 `text-h3 tabular-nums`, 캡션 `text-note text-fg-muted`. `break-keep`. 모바일 자간 0은 토큰이 처리한다.
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

- `app/styles/tokens.css`: `--fg-accent: #0B7A52`, `--fg-accent-hover: #0A6E4A`, `--line-link: rgb(11 122 82 / .6)`. `.surface-ink` 블록은 그대로.
- `lib/design-tokens.ts` 미러의 `accent`를 같은 커밋에서 바꾼다(`tests/lib/design-tokens.test.ts`가 대조).
- `components/ui/button.tsx`: `#084734`·`#065c41`·`#ECFDF5`·`#D1FAE5`·`#111110`·`#F6F5F4` 리터럴을 토큰 유틸로 바꾼다(`bg-fg-accent`, `hover:bg-fg-accent-hover`, `text-fg-on-accent`, `focus-visible:ring-fg-accent`, `text-fg-accent`, `bg-fg-accent/8`, `hover:bg-fg-accent/14`, `text-fg-ink`, `hover:bg-surface-sunken`). 공용 버튼이라 색 변경이 사이트 전체 버튼에 흐른다. 어드민도 이 버튼을 쓰지만 어드민 DOM에는 `tokens.css` `:root` 값이 똑같이 걸리므로 어드민 버튼도 새 그린이 된다 — 이것은 받아들인다(버튼 하나만 두 색으로 유지하는 비용이 더 크다). 어드민의 다른 hex 2,600곳은 그대로다.
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
| `app/globals.css` 공개 블록 | `--primary`·`--primary-hover`·`--accent-foreground`·`--ring`·`.rich-editor-*`·`[data-admin-crm]` 등은 어드민·shadcn 공용이라 **건드리지 않는다**. 공개 화면 전용 규칙만 `var(--fg-accent)` 참조로 | — |

치환 규칙: `text-[#084734]`→`text-fg-accent`, `bg-[#084734]`→`bg-fg-accent`, `hover:bg-[#065c41]`→`hover:bg-fg-accent-hover`, `hover:text-[#065c41]`→`hover:text-fg-accent-hover`, `border/ring/outline/divide-[#084734]`→`…-fg-accent`, `bg-[#084734]/N`→`bg-fg-accent/N`, 액센트 채움 위 `text-white`→`text-fg-on-accent`, `bg-[#ECFDF5]`→`bg-fg-accent/8`, `bg-[#D1FAE5]`→`bg-fg-accent/14`, `rgba(8,71,52,a)` 그림자→`color-mix(in srgb, var(--fg-accent) a%, transparent)` 또는 제거, 인라인 `style={{ color: '#084734' }}`→클래스. `.surface-ink` 안의 `#6EE7B7`은 `text-fg-accent`(먹 지면이 변수로 민트를 준다). hex→hex 치환 금지(가드 정책). 어드민 공용 컴포넌트(`components/ui/**`)는 토큰 유틸이 어드민 DOM에서도 `:root` 값을 읽으므로 안전하다. 파일 묶음마다 `npm run check:design-tokens`로 확인한다.

### 3-4. 계측

기존 `click_cta` 버튼 id를 그대로 쓴다. `hero_demo`(DemoModal), `hero_lead_magnet`(TrackedLink), `final_consultation`(DemoModal), `final_lead_magnet`(TrackedLink). 새 id는 만들지 않는다. 관문 링크(문제→진단지, 카드→제품, 사례→블로그, 페이지 줄)는 `next/link` 그대로 — 도착 페이지의 page_view가 센다.

### 3-5. 브랜치·병합

- 작업 위치: 워크트리 `classin_home-design-p0`(`design/p1-visual`, `.env.local` 심링크 있음).
- 선행: 로컬 `main`(3bf9b41c, origin/main보다 159 커밋 앞 — 사용자의 10-30 통합 커밋)을 `design/p1-visual`에 병합. `merge-tree` 결과 충돌 14개. 해결 정책: 디자인 언어 문서 8개(add/add)는 design 쪽(`git checkout --ours`), `AGENTS.md`·`docs/README.md`는 양쪽 합침, `Hero.tsx`·`ProblemCost.tsx`는 main 쪽(어차피 삭제), `app/product/sw/page.tsx`·`components/AppChrome.tsx`·`components/ui/FloatingChatbot.tsx`는 양쪽 변경을 손으로 합친다. 병합 뒤 게이트와 `npx vitest run`이 필수다(AGENTS.md).
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
