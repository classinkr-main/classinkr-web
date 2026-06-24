# 파트 가이드 — 홈 및 랜딩 (Public Front)

> 담당 에이전트: `.claude/agents/home-front.md` · 기준 시점: 2026-06-23
> 변경 검증: `npx eslint app components lib --max-warnings=0` + `npm run build`

## 1. 파트 한 줄 정의

학원 원장·관리자를 타깃으로 ClassIn을 "수업 시스템 OS"로 포지셔닝해 도입 상담·결제·자료 요청으로 전환시키는 공개 마케팅 사이트(`/`, `/product/*`, `/pricing`, `/about`, `/contact`, `/faq`, `/resources`, `/l/*` 캠페인 랜딩). Next.js 16 App Router + Tailwind 4, SEO·전환 퍼널·`DESIGN.md` 디자인 시스템이 핵심 제약.

## 2. 핵심 디렉토리/파일 맵

- `app/page.tsx` — 홈. 6-Act 스토리 구조로 섹션 조립(Hero→LogoBar→…→Comparison→FinalCTA), below-the-fold는 `next/dynamic`.
- `app/layout.tsx` — 루트 레이아웃. 글로벌 메타데이터, Consent Mode v2 `beforeInteractive` 스크립트, Pretendard preload, `<AppChrome>` 래핑.
- `components/AppChrome.tsx` — 공개/내부 경로 분기(`isInternalPath`), 헤더/푸터/챗봇/모바일 CTA/Consent/애널리틱스를 idle 타이밍에 마운트하는 클라이언트 셸.
- `app/globals.css` — Tailwind 4 `@theme` 토큰, 브랜드 컬러/radius 변수, 섹션 배경 유틸(`.section-white/warm/green`), `.border-whisper`, 모션 keyframes, `prefers-reduced-motion` 처리, 인쇄 스타일.
- `lib/classin-positioning.ts` — `CLASSIN_POSITIONING`/`CLASSIN_CHATBOT_REFERENCE`. 히어로 카피·메타·강점·경쟁비교·정직한 한계·챗봇 톤의 **단일 카피 소스(SSOT)**.
- `lib/seo.ts` — `createPublicMetadata`(canonical/OG/twitter) + JSON-LD 빌더. 기본 `SITE_URL=https://classin.co.kr`.
- `components/seo/JsonLd.tsx` — JSON-LD 주입.
- `components/sections/` — 홈 섹션 라이브러리(Hero, LogoBar, EraVision, ProblemCost, Manifesto, SolutionOverview, KeyUseCases, DashboardPreview, Comparison, FinalCTA, FAQ, Header/Footer 등).
- `components/sections/Header.tsx`+`ConditionalHeader.tsx` / `Footer.tsx`+`ConditionalFooter.tsx` — fixed 헤더(스크롤 상태 전환), `/admin`·`/checkout`에서 숨김.
- `components/product/hw/` + `sw/` — 제품 상세 below-the-fold 섹션들.
- `components/landing/SegmentLandingPage.tsx` — 세그먼트별(enterprise/managed/kids/online) 데이터 주도 랜딩 템플릿.
- `app/l/[slug]/route.ts` — `public/l/{slug}/index.html` **정적 HTML** 캠페인 랜딩 서빙 + slug 별칭 308 리다이렉트.
- `components/ui/` — 디자인 시스템 프리미티브 + `FloatingChatbot.tsx`, `MobileFloatingCTA.tsx`, `ChatbotTeaser.tsx`, `marketing-form.tsx`.
- `components/TrackedLink.tsx` — CTA 클릭을 `trackEvent("click_cta", {...})`로 계측하는 표준 링크.
- `app/sitemap.ts` / `app/robots.ts` / `app/opengraph-image.tsx` — 동적 사이트맵, 크롤 차단, 1200×630 OG 이미지.
- `DESIGN.md` — 디자인 시스템 SSOT(팔레트/타이포/컴포넌트/레이아웃/접근성).

## 3. 가장 중요한 업무

- 홈/제품/가격 페이지의 **스토리텔링 카피·섹션 조립**과 전환 퍼널 설계(상담·자료·결제 유도).
- **포지셔닝 일관성**: 모든 카피가 `lib/classin-positioning.ts`와 `docs/active/classin-korea-positioning-guidelines.md` 기준("수업 시스템 OS", 기능 나열 지양).
- **CTA 계측**: 신규 CTA는 `TrackedLink` 또는 `trackEvent`로 계측(`click_cta`, `begin_checkout`, `chatbot_*`).
- **SEO 메타/JSON-LD**: 신규 공개 페이지마다 `createPublicMetadata` + 적절한 JSON-LD + sitemap 등록.
- **세그먼트/캠페인 랜딩** 운영(`/l/*` 정적 HTML, `SegmentLandingPage` 데이터 주도).
- **성능**: below-the-fold `next/dynamic`, 히어로 영상은 데스크톱·idle·reduced-motion 조건부 로드.

## 4. 지침 & 규칙

- **팔레트**(`DESIGN.md` §2, `globals.css`): 유일 포화색 = ClassIn Green `#084734`(hover `#065c41`). 파랑·보라 금지. 페이지 bg `#FAFAF8`, 텍스트 `#111110`, 보조 `#615D59`.
- **섹션 배경 교차**: `#FFFFFF` ↔ `#F6F5F4`(웜) ↔ `#ECFDF5`(그린). 유틸 `.section-white/warm/green`.
- **보더**: whisper만 — `1px solid rgba(0,0,0,0.08)` / `border-black/[0.08]` / `.border-whisper`. 두껍게 금지.
- **타이포**: Pretendard Variable, `word-break: keep-all`. 헤딩 음수 letter-spacing, **모바일(≤640px)은 letter-spacing 0 강제**.
- **radius**: 버튼 6px, 표준카드 12px, 히어로/피처 16px, 배지 9999px.
- **모션·시각 취향**(운영 합의): AI 느낌의 파스텔 채움 박스 거부 → 아웃라인/좌측 액센트바/타이포 강조 선호. **넓은 면은 뉴트럴, 그린은 액센트로만**. 모션은 은은·길게·바깥 투명도. `prefers-reduced-motion` 존중. **시안을 먼저 보여주고** 합의 후 진행.
- **카피/포지셔닝**: "수업 시스템 OS" 중심. 약점(결제·오프라인 출석·고급 리포트)은 과장 없이 연동/별도 시스템으로. **가격은 단정 금지 → 상담 연결**. 국내 기관·보드 수 단정 금지(글로벌 수치는 "EEO 공식 기준"으로만).
- 모바일 우선 반응형, 컨테이너 `max-w-[1400px]` / 랜딩 `max-w-[1200px]`.

## 5. 절대 깨면 안 되는 것 / 주의점

- **Consent Mode v2**(`layout.tsx`): GTM 로드 전 `beforeInteractive` 기본 denied. 마케팅 동의 전엔 MetaPixel/AnalyticsProviders 미마운트 — 순서 깨면 개인정보 동의 위반.
- **robots disallow / noindex**: `/admin /api /checkout /receipt /unsubscribe` 항상 차단. `/pricing/simulator`는 `noIndex:true`. 새 비공개 페이지는 robots·noindex 확인.
- **canonical/sitemap 동기화**: 새 공개 라우트는 `createPublicMetadata`(canonical) + `app/sitemap.ts` 등록 둘 다.
- **CTA 계측 누락 금지**: 계측 안 된 CTA는 전환 데이터 신뢰 불가(PRD 1순위 문제).
- **성능 패턴 유지**: below-the-fold dynamic import, 히어로 영상 조건부+idle 로드. 무분별 eager 로드 금지.
- **챗봇/모바일 CTA 라이프사이클**(`AppChrome`): 챗봇은 idle 마운트 후 소프트 내비게이션에도 언마운트 안 됨(대화 상태 보존). `PublicWidgetBoundary`로 에러 격리.
- **a11y**: 포커스 링 `focus-visible:ring-2 ring-[#084734]`, 장식 아이콘 `aria-hidden`, 모바일 letter-spacing 0.
- **Hero sticky 레이아웃**: `sticky top-[76px]` + `100svh` — 헤더 높이(76px/md:80px) 변경 시 동반 수정.
- `app/l/[slug]/route.ts`는 `public/l/`의 **수기 정적 HTML** 서빙(React 아님). 별도 운영물.

## 6. 관련 문서

- `docs/active/prd.md` — 공개 사이트 기준 PRD(전환·리드·콘텐츠 운영).
- `docs/active/classin-korea-positioning-guidelines.md` — **포지셔닝 SSOT**(카피 변경 전 필독).
- `docs/active/classin-software-feature-inventory.md` — 제품 기능/HW 차별점 SSOT(제품 페이지 사실 검증용).
- `docs/active/visualization-map.md` — 사이트맵·전환 퍼널·컴포넌트↔라우트 매핑(일부 stale).
- `docs/hw-intro-visual-plan.md` — `/product/hw` 도입부 섹션 배경·자산 스펙.
- `docs/active/content-roadmap-blog-events-docs-2026-06-10.md` — 콘텐츠 기능 로드맵.
- `docs/active/classin-pre-adoption-question-matrix-2026-06-18.md` — 도입 전 22질문 → FAQ/자료실/상담 반영 기준.
- `docs/active/software-checkout-revamp-plan.md` — `/checkout` 재정렬(공개 결제 UI).

## 7. 현재 목표 & 백로그 (2026-06-23 스냅샷)

- **챗봇 상단 퍼널(구현 완료)**: 다음 로드맵 = C(세션 기억·재방문) / D(리드 캡처·핸드오프·예약). **`/pricing`은 챗봇/teaser 미노출(hidden 유지)**, 외부 CTA→챗봇 연결(`openChatbot`)은 비주얼 검토 후 적용. (챗봇 파트와 공유)
- **콘텐츠 로드맵 미착수 항목**: 리드 마그넷, OG 자동생성(edge 한글 폰트 번들 필요), 행사 리마인더 cron 등. (컨텐츠 파트와 공유)
- **PRD 미해결**: 일부 CTA가 실제 행동으로 안 이어짐, 전환 데이터 신뢰성 보강.
- **결제 활성화 플래그**: `NEXT_PUBLIC_SW_CHECKOUT_ENABLED`로 `/product/sw` CTA가 `/checkout` ↔ `/contact#contact-form` 분기.
- `app/l/test1~3`는 실험/임시 랜딩(운영 정리 후보).

## 8. 검증 방법

```bash
npx eslint app components lib --max-warnings=0
npm run build
```
수동 확인: 배경 교차·whisper 보더·그린 액센트 한정·radius 준수 / 모바일 letter-spacing 0·히어로 sticky·모바일 CTA / canonical·OG·JSON-LD·sitemap·noindex / CTA `trackEvent` 발화 / 포커스 링·reduced-motion / 포지셔닝(가격·기관수 단정 금지) 위반 여부.

## 9. 작업 시작 시 먼저 읽을 것

1. `DESIGN.md` — 모든 UI 작업의 전제.
2. `lib/classin-positioning.ts` — 카피·메시지 단일 소스.
3. `app/page.tsx` + `components/sections/Hero.tsx` — 홈 조립·모션·CTA·sticky 관례.
4. `app/globals.css` + `components/AppChrome.tsx` — 토큰/유틸 + 공개·내부 분기·위젯 라이프사이클.
5. `docs/active/classin-korea-positioning-guidelines.md` — 카피·시각 의사결정 기준.
