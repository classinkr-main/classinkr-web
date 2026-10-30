# 홈 랜딩 개편 — 설계 (2026-10-30)

상태: 설계안, 사용자 승인 대기. 시안 캔버스: https://claude.ai/artifact/GiX5L3g1DCMhHjPxGn4jSn

## 1. 목표

홈(`/`)을 "더 직관적이고, 이해하기 쉽고, 디자인이 단순하게" 만들고 공개 사이트의 강조색을 바꾼다.

- 섹션 19개(약 2,400줄)를 화면 6개로 줄인다. 화면마다 메시지 하나.
- 히어로를 밝은 정적 한 화면으로 바꾼다. 영상·스티키·워터마크·다크 그라데이션을 없앤다.
- 홈의 행동 목표를 **파일럿 상담 신청** 하나로 정한다. 진단지 다운로드는 보조 텍스트 링크로 내린다.
- 강조색을 `#084734`(포레스트 그린)에서 **`#0B7A52`(선명한 그린)** 으로 바꾼다. 범위는 공개 사이트만. 어드민은 그대로 둔다.
- 홈 섹션은 hex 리터럴 없이 `app/styles/tokens.css` 토큰 유틸만 쓴다. 그래야 다음 색 변경이 한 줄이 된다.

사용자가 확정한 것: 기준 브랜치 `design/p1-visual`, 공개 사이트만, 파일럿 상담 단일 목표, 밝은 정적 히어로, 노션×토스 구조. 색과 세부 구조는 "판단은 Fable"에 따라 아래와 같이 정했다.

## 2. 결정과 근거

### 2-1. 강조색 = A 선명한 그린 `#0B7A52`

| 후보 | 값 | 결론 |
| --- | --- | --- |
| A 선명한 그린 | `#0B7A52` (hover `#0A6E4A`) | **채택.** 브랜드 연속성 유지, 현행보다 밝고 선명. paper 위 5.1:1, 흰 글자 5.4:1로 AA 통과. 먹 지면 민트 `#6EE7B7`는 그대로 |
| B 딥 블루 | `#1F5EEB` | 기각. `DESIGN.md`·홈 플레이북의 "파랑·보라 금지" 원칙 위반, 어드민 확도 파랑 `#1E5DA8`과 혼동 |
| C 먹 + 오렌지 | `#111110` + `#C2410C` | 기각. 오렌지가 어드민 Warning 축(`#A8741A`)과 의미 충돌, 변화 폭이 커서 제품·가격 페이지와 어긋남 |

현행 `#084734`는 10.3:1로 과하게 어둡다. 새 값은 AA를 넉넉히 넘기면서 가장 밝은 그린이다. 색이 토큰 한 줄이 되므로 이후 교체는 트리비얼하다.

### 2-2. 구조 = 노션 뼈대 × 토스 밀도, 6화면

노션: 히어로 → 신뢰 띠 → 제품 블록 → 증거 → CTA. 토스: 화면당 헤드라인 하나, 보조 한 줄, 시각물 하나, 넓은 여백.

| # | 화면 | 내용 | 출처(현행) |
| --- | --- | --- | --- |
| 1 | 히어로 + 신뢰 띠 | 칩 "학원 수업 운영 OS" · H1 "좋은 수업을, 강사의 개인기에서 학원의 시스템으로" · 리드 한 줄 · 주 CTA "파일럿 상담 신청"(DemoModal) · 보조 링크 "34문항 운영 진단지 받기" · 제품 화면 1장 · 숫자 4개(3,000만+ 월간 수업 / 5,000만+ 교사·학습자 / 6만+ 기관 / 160+ 국가, "EEO 공식 기준" 표기) | Hero, LogoBar, GlobalScale |
| 2 | 문제 | H2 "강사가 바뀌면, 수업도 바뀝니다." · 장면 3장(에이스 강사 퇴사 / 같은 교재 다른 성적 / 상담마다 같은 질문) · 마무리 한 줄 "수업은 개인기가 아니라, 시스템입니다." | ProblemCost, Manifesto |
| 3 | 작동 방식 | H2 "수업 전·중·후를 하나의 흐름으로" · 블록 3개(EDB 교안 / 보드와 수업 연결 / 녹화와 관리자 데이터), 글·시각물 좌우 교차 | SolutionOverview, DashboardPreview |
| 4 | 증거 | H2 "먼저 바꾼 학원들" · 사례 3건(청주 이** 국어 / 부산 과** / 대치 세**) 한 줄 결과 | CaseStudies |
| 5 | 비교 | H2 "제품을 보는 기준이 달라집니다" · 3행 표(수업 자료와 판서 / 수업 후 관리 / 관리자 관점 × 도구 따로 vs Classin) | Comparison |
| 6 | 파일럿 + 마지막 CTA | H2 "1개 교실, 90일 파일럿부터" · 3단계(대표 수업 선정 / 교실 설치·온보딩 / 결과 확인 후 확대) · 정직한 범위 한 줄 · 주 CTA + 보조 링크 | FinalCTA, 도입 현실 카피(신규) |

시안의 7화면에서 파일럿과 마지막 CTA를 한 화면으로 합쳤다. "어떻게 시작하나"와 "시작하기"는 같은 질문이다.

삭제: EraVision, HomeEntitySummary, HomeAudiencePaths, HomeLeadMagnet(섹션), SatisfyingClass, TestimonialWall, Outcomes, ScienceBased, KeyUseCases(홈에서만; 파일은 `/product/sw`가 써서 유지).
이동 없음: HomeAudiencePaths의 세 갈래(자료실·FAQ·가이드)는 헤더·푸터에 이미 있다.
SEO: `createPublicMetadata`·JSON-LD(WebPage, Breadcrumb)는 그대로. HomeEntitySummary가 담던 엔티티 용어(전자칠판·EDB 교안·녹화·LMS·관리자 데이터·수업 시스템 OS)는 히어로 리드와 3화면 카피가 그대로 품는다.

### 2-3. 디자인 규칙 (홈 한정, `DESIGN.md`·`public-site-design-language` 위)

- 바탕 `surface-paper` ↔ `surface-sunken` 교차. 카드는 `surface-sheet` + `border-line-hair`, 반경 12px. 채움·파스텔 카드 금지, 그라데이션·emoji·핑 애니메이션 금지.
- 강조색은 **누를 수 있는 것에만**: 주 CTA 채움, 링크, 화살표, 포커스 링(`DESIGN.md` §2 `--fg-accent` 규칙). 제목·칩·라벨·단계 번호에는 쓰지 않는다. 시안 캔버스가 H1 구절과 칩에 강조색을 쓴 것은 이 규칙에 맞춰 버린다. 칩은 `text-fg-muted` 키커, H1 구절은 먹 900 굵기, 비교표 "Classin" 헤더는 먹 굵게. 틴트가 필요하면 `bg-fg-accent/8` 불투명도 수식으로 만들고 새 틴트 토큰을 추가하지 않는다.
- 타이포는 토큰(`--trk-*`)과 기존 스케일. 모바일 ≤640px 자간 0은 토큰이 처리한다. `break-keep`.
- 모션은 `components/landing/Reveal.tsx`의 은은한 상승만. 히어로는 모션 없음.
- 섹션 패딩 데스크톱 120px, 모바일 72px. 컨테이너 `max-w-[1120px]`.
- 시각물: 1화면·3-3블록은 `/images/hero-dashboard.webp`. 3-1(EDB 교안)·3-2(보드 수업)는 **스크린샷이 없다** → 헤어라인 프레임 + 라벨 플레이스홀더로 넣고, 사용자가 캡처를 주면 교체한다.

## 3. 변경 범위

### 3-1. 파일

새 폴더 `components/home/`:

| 파일 | 역할 |
| --- | --- |
| `HomeHero.tsx` | 1화면. 헤더 높이 토큰(`--header-h`)만큼 상단 패딩, 제품 이미지 `priority`, 신뢰 띠 포함 |
| `HomeProblem.tsx` | 2화면 |
| `HomeHow.tsx` | 3화면. 블록 데이터 배열 + 좌우 교차 |
| `HomeProof.tsx` | 4화면 |
| `HomeCompare.tsx` | 5화면. 모바일은 가로 스크롤 박스 |
| `HomePilotCta.tsx` | 6화면 |
| `home-copy.ts` | 6화면의 카피 상수. H1·리드·메타는 `lib/classin-positioning.ts`에서 가져오고, 나머지 문장은 여기 둔다 |

`app/page.tsx`: 위 6개만 조립. 2~6화면은 지금처럼 `next/dynamic`.

삭제(홈 전용이라 다른 참조 없음을 확인함): `components/sections/{Hero,LogoBar,HomeEntitySummary,HomeAudiencePaths,EraVision,ProblemCost,HomeLeadMagnet,Manifesto,SolutionOverview,DashboardPreview,DashboardPreviewCharts,ScienceBased,SatisfyingClass,CaseStudies,GlobalScale,TestimonialWall,Outcomes,Comparison,FinalCTA}.tsx`, `public/video/home-hero.mp4`(35MB, Hero만 참조). `DashboardPreviewCharts`·`lib/testimonials.ts`는 삭제 전 참조를 다시 확인한다. `hero-soft-enter` CSS는 `/docs`·`/download`가 써서 남긴다.

유지: `DemoModal`, `Header`, `Footer`, `KeyUseCases`(제품 페이지), `HeroVideoBackdrop`(제품 페이지).

### 3-2. 토큰·색

- `app/styles/tokens.css`: `--fg-accent: #0B7A52`, `--fg-accent-hover: #0A6E4A`, `--line-link: rgb(11 122 82 / .6)`. `.surface-ink` 블록은 그대로.
- `lib/design-tokens.ts` 미러의 `accent`와 `tests/lib/design-tokens.test.ts` 기대값을 같은 커밋에서 바꾼다.
- `components/ui/button.tsx`: `#084734`·`#065c41`·`#ECFDF5`·`#D1FAE5` 리터럴을 `bg-fg-accent`·`hover:bg-fg-accent-hover`·`text-fg-on-accent`·`ring-fg-accent`·`bg-fg-accent/8`로 바꾼다. 공용 버튼이라 색 변경이 사이트 전체 버튼에 흐른다.
- `DESIGN.md` §2 Primary와 `docs/active/playbook/01-home-front.md` §4 팔레트 줄: 공개 사이트 강조색 `#0B7A52`(hover `#0A6E4A`), 어드민은 `#084734` 유지라고 적는다.
- `scripts/check-design-tokens.mjs`의 `HEX_ALLOW`에 `#084734`가 있으면 공개 범위에서는 뺀다.

### 3-3. 공개 사이트 나머지 hex → 토큰 (3단계, 배포 전 필수)

홈만 새 색으로 가고 제품·가격·컨택이 옛 색이면 사이트가 두 가지 그린을 보인다. 그래서 아래도 같은 작업의 일부다. 기계적 치환이며 Opus 위임 대상.

| 영역 | `#084734` 출현 | 처리 |
| --- | --- | --- |
| `app/product/**` | 217 | `text-[#084734]`→`text-fg-accent`, `bg-[#084734]`→`bg-fg-accent`, `hover:bg-[#065c41]`→`hover:bg-fg-accent-hover`, `border/ring/outline-[#084734]`→`…-fg-accent`, `text-white` on accent→`text-fg-on-accent`, `rgba(8,71,52,…)` 그림자→`color-mix` 또는 제거 |
| `components/ui/**` | 95 | 같은 규칙 |
| `app/contact`, `app/pricing`, `components/landing` | 58 | 같은 규칙 |
| `app/globals.css` | 15 | 토큰 참조로 |

규칙: hex→hex 치환 금지(가드 정책). 한 파일씩 가드(`npm run check:design-tokens`)로 확인한다. `#ECFDF5`·`#D1FAE5` 틴트는 `bg-fg-accent/8`·`/14`로 바꾼다.

### 3-4. 계측

기존 `click_cta` 버튼 id를 그대로 쓴다. `hero_demo`(DemoModal), `hero_lead_magnet`, `final_consultation`(DemoModal), `final_lead_magnet`. 새 id는 만들지 않는다. 신뢰 띠·사례·비교엔 CTA가 없다.

### 3-5. 브랜치·병합

- 작업 위치: 워크트리 `classin_home-design-p0`(`design/p1-visual`, `.env.local` 심링크 있음).
- 선행: `main`을 `design/p1-visual`에 병합. `merge-tree` 결과 충돌 14개. 해결 정책: 디자인 언어 문서 8개(add/add)는 design 쪽, `docs/README.md`는 양쪽 합침, `Hero.tsx`·`ProblemCost.tsx`는 main 쪽(어차피 삭제), `app/product/sw/page.tsx`·`components/AppChrome.tsx`·`components/ui/FloatingChatbot.tsx`는 양쪽 변경을 손으로 합친다. 병합 뒤 게이트와 `npx vitest run`이 필수다(AGENTS.md).
- 완료 후 PR → `main` 스쿼시(저장소 관례). 운영 배포는 사용자가 실행한다.

## 4. 검증

1. `npm run typecheck` → `npx eslint app components lib --max-warnings=0` → `npm run build`(prebuild에 디자인 토큰 가드 포함) → `npx vitest run`.
2. `components/home/**`와 `app/page.tsx`에 hex 리터럴 0건(가드 출력 기준).
3. 새 테스트 `tests/home/landing-sections.test.tsx` 하나: 6개 컴포넌트가 H1/H2를 렌더하고, 주 CTA 문구 "파일럿 상담 신청"이 히어로와 6화면에 각 1회, 진단지 링크 href가 `/resources/academy-system-checklist#download`인지 확인한다.
4. 브라우저 확인: 데스크톱 1280·모바일 375에서 6화면 스크린샷, 콘솔 오류 0, 히어로 LCP 이미지가 `priority`로 로드되는지.
5. 시각 대조: 시안 캔버스의 Main 보드(팔레트 A)와 구조·여백이 맞는지 본다.

## 5. 범위 밖

- 어드민 색 변경(hex 2,600여 곳). 별도 작업.
- 제품·가격 페이지의 구조 개편. 3-3은 색 치환만이다.
- 3-1·3-2 스크린샷 제작. 플레이스홀더로 두고 사용자 자산을 기다린다.
- `cloud_<월>.<버전>` 브랜치 규칙: 사용자가 `design/p1-visual`을 지정해 예외로 둔다.

## 6. 실행 순서 (각 단계는 Opus 위임, 검토·결정은 Fable)

1. main → design/p1-visual 병합 + 게이트 + vitest.
2. 토큰·버튼·문서 색 변경(3-2) + 토큰 테스트.
3. `components/home/` 6개 + `app/page.tsx` + 섹션 삭제 + 홈 테스트.
4. 공개 사이트 hex → 토큰(3-3), 영역별로 가드 확인.
5. 게이트·vitest·브라우저 스크린샷, 설계와 대조, PR.
