# 공개 사이트 전수 점검 + 모션·디자인 디벨롭 기획 (2026-10-26)

기준 시점: 2026-10-26 · 범위: 공개 사이트 전체(홈, 셸·내비, 제품·가격, 콘텐츠, 전환·계정·법무, 캠페인 랜딩, 쿠키·동의·추적)
방식: 영역별 에이전트 7개(Opus 2, Sonnet 5)가 코드를 읽기 전용으로 점검하고, 핵심 주장은 메인 세션이 코드·운영 사이트(classin.co.kr)·헤드리스 브라우저로 다시 확인했다. 파일 수정·배포·운영 쓰기는 하지 않았다.

확인 표기

- **[운영]** classin.co.kr 에서 직접 재현·측정함
- **[코드]** 코드로 확인함(운영 재현은 안 함)
- **[추정]** 근거는 있으나 확정 못 함

운영 배포는 main 보다 오래된 빌드로 보인다(블로그 본문 마크업이 HEAD 와 다름). [운영] 항목은 배포본 기준이고, 같은 원인 코드가 HEAD 에도 있는지는 따로 확인했다.

---

## 0. 한눈에

지금 바로 돈·리드·법무에 닿는 문제가 9건 있다. 대부분 수 줄짜리 수정이다.

| # | 문제 | 확인 | 영향 |
|---|---|---|---|
| P0-1 | 캠페인 랜딩 5종(`/l/enterprise·managed·kids·online·omo1`)의 상담 신청이 전부 400 으로 거절됨 | [운영] | 광고 유입 리드 전량 손실 |
| P0-2 | 모바일 하단 "도입 문의하기" 버튼이 눌리지 않음(챗봇 위젯의 투명 띠가 가로챔) | [운영] | 모바일 전 페이지 CTA 무력화 |
| P0-3 | `position: sticky` 가 공개 사이트 전체에서 동작하지 않음 | [운영] | 히어로 커버, 제품 탭, 문서 목차, 블로그 목차 등 8곳 |
| P0-4 | `/l/omo1` 이 동의 없이 구글 광고 쿠키(`_gcl_au`)를 심고 doubleclick 으로 수집 요청을 보냄 | [운영] | 동의 없는 마케팅 픽셀 금지 위반 |
| P0-5 | 견적·계약 공유 토큰 URL, 영수증, 결제 성공 쿼리, 수신거부 이메일 쿼리가 페이지 주소째 구글로 전송됨 | [코드] | 토큰·개인정보 외부 유출 |
| P0-6 | 마케팅 동의를 철회해도 Meta 픽셀이 페이지 이동마다 PageView 를 계속 보냄 | [코드] | 철회 무효 |
| P0-7 | 카카오 로그인이 미인증 이메일로 기존 계정 세션을 발급할 수 있음 | [코드] | 계정 탈취 가능성(카카오 정책 의존) |
| P0-8 | 자료 다운로드 폼이 마케팅 수신 동의를 필수·사전 체크로 묶고 서버엔 항상 `true` 전송 → Meta 로 해시 연락처 전송 | [코드] | 개인정보보호법 선택 동의 분리 위반 소지 |
| P0-9 | 근거 없는 수치·보장 문구가 홈·제품 페이지에 노출("100ms 이하 지연 보장", "도입 학원 2,400+", 가짜 라이브 카운터 등) | [운영] | 표시광고 실증 리스크 |

정책 결정이 필요한 항목은 §4, 실행 순서는 §6, 모션·디자인 기획은 §5 에 있다.

---

## 1. P0 상세

### P0-1. 캠페인 랜딩 리드 전량 거절 [운영]

- 원인: `app/api/lead/route.ts:23-33` 의 문의 유형 가드가 `source:"contact_page"` 이면 `sourceDetail` 을 `CONTACT_TOPICS` 7종으로만 허용한다. 정적 랜딩은 `landing_segment:*`, `omo1_diagnosis` 를 보낸다(`public/l/enterprise/index.html:3959-3960` 외 4곳).
- 재현: 운영에 연락처 없는 요청(`{"source":"contact_page","sourceDetail":"landing_segment:enterprise"}`)을 보내 `400 문의 유형이 올바르지 않습니다.` 를 받음. 연락처가 없어 어떤 경우에도 리드가 생기지 않는 요청이다.
- 시점: 가드는 2026-09-10 병합(`Hom v4 (#33)`). 운영 반영일과 실제 끊긴 날짜는 운영 DB 확인이 필요하다(§7).
- 같이 볼 것: 랜딩의 규모 옵션 4종이 `lib/contact/academy-size.ts` 정본과 달라 점수 계산이 틀어진다.
- 최소 수정: 가드에 `/^(landing_segment:[a-z0-9_-]+|omo1_diagnosis)$/` 예외(또는 `lib/contact/topics.ts` 에 `isLandingSourceDetail`) + `tests/contact/lead-topic-guard.test.ts` 에 랜딩 값 1건.

### P0-2. 모바일 하단 CTA 탭 불가 [운영]

- 원인: `components/ui/FloatingChatbot.tsx:1301` 래퍼가 모바일에서 `fixed inset-x-0 bottom-0 z-50` 전폭 박스이고 `pointer-events-none` 이 없다. `MobileFloatingCTA.tsx:100` 은 `z-40` 이라 통째로 덮인다.
- 재현(헤드리스 375×667, 운영): 래퍼 rect `[0,595,375,72]`. "도입 문의하기" 중심점의 `elementFromPoint` 가 챗봇 래퍼 div. CTA 의 닫기 버튼은 챗봇 버튼(FAB) 아래에 깔림.
- 최소 수정: 래퍼에 `pointer-events-none`, 패널·티저·FAB·백드롭에 `pointer-events-auto`. CTA 는 FAB 옆으로 비킨다(`right-[5.5rem]` 등). 장기적으로 FAB 와 CTA 를 하나의 하단 독으로 합친다.

### P0-3. sticky 전체 고장 [운영]

- 원인: `app/globals.css:356-361` 의 `html, body { overflow-x: hidden }`. body 가 스크롤 컨테이너가 되어 그 아래 sticky 가 body 기준으로 계산되는데, body 는 스크롤되지 않는다. 2026-06-22 커밋 `b18ab718` 부터.
- 재현(헤드리스, 운영 홈): 스크롤 0 에서 히어로 top 76 → 400px 스크롤 후 −324(붙지 않음). body 만 `overflow-x: clip` 으로 바꾸면 71 로 붙음.
- 영향: `Hero.tsx:17`(히어로 커버 효과), `ProductTabNav.tsx:19`, `FAQ.tsx:13`, `DocsSidebarLayout.tsx:138,145`, `app/blog/[slug]/page.tsx:276`, `app/resources/[slug]/page.tsx:600`, `SegmentLandingPage.tsx:240`, `PricingCalculator.tsx:765`.
- 최소 수정: `html { overflow-x: hidden; overflow-y: auto }` 는 두고 `body { overflow-x: clip }` 로 바꾼다. 수정하면 6월 이후 처음으로 히어로 커버 효과가 켜지므로 다음 섹션 배경·z-index 를 화면으로 확인한다. 헤더 높이 토큰(§2-2 셸 첫 항목)과 같이 한다.

### P0-4. `/l/omo1` 무동의 구글 광고 태그 [운영]

- 위치: `public/l/omo1/index.html:4-11`(`gtag('config','AW-18252550128')`, consent default 없음). React·AppChrome 을 거치지 않는 정적 HTML 이라 동의 배너도 없다.
- 재현: 새 상태에서 열자 `_gcl_au` 쿠키 생성, `ad.doubleclick.net/ccm/s/collect` 요청 발생.
- 최소 수정: 4-11행 삭제(리드는 이미 `/api/lead` 로 들어옴). 측정이 꼭 필요하면 `app/layout.tsx` 의 consent-default 스니펫을 앞에 복사.

### P0-5. 토큰·개인정보 URL 의 구글 전송 [코드]

- 원인: `components/AppChrome.tsx:130` 에서 `GoogleAdsScript` 가 동의 게이트 밖에 있고 `/admin` 만 제외한다(`GoogleAdsScript.tsx:14`). `gtag('config')` 는 동의 거부 상태에서도 쿠키 없는 핑을 보내며 `page_location` 에 전체 URL 이 실린다(홈에서 `gcs=G100` 핑 [운영] 확인). `PageViewTracker.tsx:16` 도 쿼리 문자열째 보낸다.
- 새는 URL: `/share/quote/[token]`, `/share/contract/[token]`(고객 이름·이메일 표시), `/receipt/[orderId]`, `/checkout/success?checkoutToken=…&paymentKey=…`, `/unsubscribe?email=`, `/contact?prefill=<챗봇 질문 원문>`.
- 부가: `/contact` 지도 iframe 의 `referrerPolicy="no-referrer-when-downgrade"`(`app/contact/page.tsx:739`)로 prefill 전체가 Referer 로 구글 지도에 감. `app/api/track/event/route.ts:97-101` 의 PII 정규식은 `@`→`%40` 인코딩을 못 잡는다.
- 최소 수정: AppChrome 에 추적 제외 경로 함수 하나(`/admin /checkout /receipt /share /unsubscribe /account /auth /login /signup /forgot-password`)를 두고 GoogleAds·GTM·PageViewTracker·Meta 에 모두 적용. PageViewTracker 는 pathname(+utm·clid 허용 목록)만. 챗봇 초안은 URL 대신 sessionStorage 로 넘기고 `/contact` 에서 `history.replaceState` 로 쿼리 제거.

### P0-6. Meta 픽셀 철회 무효 [코드]

- 원인: 철회하면 `MetaPixelScript` 는 언마운트되지만 `fbevents.js` 는 남는다. `lib/consent/consent.ts:88-98` 의 `applyConsentMode` 는 구글에만 신호를 보내고, `fbq.disablePushState` 도 없다. Meta 픽셀은 기본적으로 history 변경마다 PageView 를 자동 전송한다(Meta 공식 동작 기준).
- 최소 수정: `fbq('init')` 앞에 `fbq.disablePushState=true`, `applyConsentMode` 에 `window.fbq?.('consent', marketing ? 'grant' : 'revoke')`. 수정 후 운영 네트워크 탭으로 한 번 확인.

### P0-7. 카카오 로그인 미인증 이메일 [코드]

- 위치: `app/api/auth/kakao/callback/route.ts:113,120,153-172`. 카카오가 준 이메일을 계정 키로 쓰고, `emailVerified` 는 신규 생성의 `email_confirm` 에만 쓴다. 같은 이메일 계정이 있으면 "already" 에러를 삼키고 매직링크 세션을 발급한다.
- 대조: 네이버는 합성 주소(`naver_<id>@naver.invalid`)로 이미 막았다.
- 최소 수정: `!profile.emailVerified` 이면 `kakao_<id>@kakao.invalid` 를 쓴다.

### P0-8. 자료 다운로드 폼 묶음 동의 [코드]

- 위치: `app/resources/[slug]/ResourceDownloadForm.tsx:46,133-136,158,414-425`. 체크박스 문구가 "자료 제공과 … 제품 소식 수신에 동의", `required`, 서버로 `marketingConsent: true` 고정. 이 값이 `lib/server/lead-capture.ts:700` 의 `allowHashedUserData` 를 켜서 해시 이메일·전화가 Meta CAPI 로 간다.
- 같은 계열: `LeadMagnetGate.tsx:259-262`(체크박스 없이 10px 암묵 동의), `EventAlertSignup.tsx:34`(고지 없이 `true`), 뉴스레터 "동의한 것으로 간주됩니다", 결제 경로의 무조건 `allowHashedUserData: true`(`app/api/billing/checkout/prepare/route.ts:55`, `confirm/route.ts:66`).
- 최소 수정: 필수(수집·이용)와 선택(마케팅) 체크박스 분리, 선택 값만 전송. 서버가 `body.marketingConsent` 를 받게 한다. 법무 확인 권장.

### P0-9. 근거 없는 수치·보장 문구 [운영·코드]

| 위치 | 문구 | 비고 |
|---|---|---|
| `app/product/sw/page.tsx:1155` | "100ms 이하의 지연 시간을 보장합니다" | [운영] 노출 확인 |
| `sw:2024,2030-2031` | "보장", "< 100ms", "99.9% 가동률" | SLA 근거 없음 |
| `sw:1630` | "도입 학원 2,400+" (카운트업, SSR 에선 0+) | 국내 수 단정 금지 위반 |
| `sw:537,529` | 1,560,000 에서 4.2초마다 +1 하는 "지금 이 순간에도" 카운터 | 가짜 라이브 데이터 |
| `sw:562,585,588` | "200개 기업 고객사", "98% 응답률" | 근거 문서 없음 |
| `app/product/hw/page.tsx:465-467` | "1,200+ 도입 학교·기관 / 35,000+ 활성 교사 / 12개국" | 근거 없음 |
| `sw:1147` | Google Classroom·Canvas·Moodle 연동 지원 | company-facts 상 "미확인" |
| `components/sections/ProblemCost.tsx:43-68,167,180-184,250` | "20% 재등록률 하락", "1,200만원 연간 손실", "85%가…" | 출처·예시 표기 없음 |
| `Outcomes.tsx:43` / `SatisfyingClass.tsx:43` | "주 평균 15시간" / "70% 단축" | 서로 다른 근거 없는 값 |
| `DashboardPreview.tsx:16-20,172-174` | 출석률 98.2% 등 목업 KPI | "예시 화면" 표기 없음 |
| `ScienceBased.tsx:87,144` | AI 퀴즈 자동 전송 기능, Freeman 인용 | 기능 인벤토리에 없음, 인용 원문 대조 필요 |

- 허용되는 수치는 EEO 공식 5개(160+개국·6만+ 기관·5,000만 사용자·월 3,000만 수업·누적 2억+)와 "전 세계 누적 · EEO 공식 소개 기준" 캡션뿐이다(`docs/active/brand-canon/company-facts.md`). SW 페이지 안에서도 국가 수가 150+/160+/160 으로 갈린다.
- 최소 수정: 위 문구 삭제 또는 정성·질문형으로 교체. 수치는 공용 `ScaleFacts` 컴포넌트 하나(§5-4)에서만 쓴다.

---

## 2. P1 — 영역별

### 2-1. 쿠키·동의·추적

- **고급 동의 모드(advanced)로 동작** [운영]: 동의 전에도 GTM·GA4·구글 광고 스크립트가 로드되고 쿠키 없는 핑(`gcs=G100`)을 보낸다. 쿠키는 심지 않는다(홈 새 상태 실측 쿠키 0개). `AppChrome.tsx` 주석("동의 없는 방문자에게는 나가지 않는다")과 다르다. 유지할지 기본 모드로 바꿀지는 정책 결정(§4).
- 동의 기록 IP 해시가 솔트 없는 SHA-256(`app/api/consent/route.ts:118`) → IPv4 는 역산 가능. `null` 로 저장하거나 서버 비밀값 HMAC.
- 유입 귀속 localStorage(`classinkr.leadAttribution.v1`)가 동의와 무관하게 매 페이지뷰 기록, 만료 없음, 전체 URL 저장(`lib/marketing-attribution.ts:77-86`). 90일 TTL + pathname·허용 파라미터만.
- 철회해도 `_ga*`·`_gcl_au`·`_fbp` 가 남고 다른 탭에 반영 안 됨(`lib/consent/useConsent.ts:25-29`). 철회 시 알려진 쿠키 삭제 + `visibilitychange` 에서 재적용.
- 배너 접근성: `aria-modal`·`aria-describedby`·포커스 이동·Esc·focus-visible 링 없음, 저장 실패 시 `console.warn` 만(`ConsentBanner.tsx:84-106`).
- 배너(z-120)가 챗봇 버튼과 하단 링크를 덮음 [운영 헤드리스], 데모 모달(z-50)도 덮을 것 [추정]. safe-area 미반영.
- 개인정보처리방침(`app/privacy/page.tsx`, 최종 2026-06-14)에 쿠키 목록, Google Ads·네이버·Meta CAPI(해시 연락처·IP)·Solapi·WeCom, 위탁·국외이전, 개인정보 보호책임자가 없다.
- CSP `frame-src` 에 `youtube-nocookie.com`, `img-src` 에 `i.ytimg.com` 이 없어 회원 세미나 영상(`SeminarPlayer.tsx:76`)이 재생되지 않는다 [운영 헤더 확인].
- 마케팅 동의 대기 플래그(`cln_pending_marketing_consent`)가 만료·계정 결속 없이 localStorage 에 남아, 공용 PC 의 다른 계정에 마케팅 동의가 기록될 수 있다.
- 실제 설정되는 쿠키·스토리지(요약): `cln_consent`(필수, 391일), `cln_aid`(분석 동의 시), OAuth state 쿠키(10분), Supabase 세션, `admin_session`(HttpOnly·Strict), localStorage 의 `classinkr.leadAttribution.v1`·`classinkr_chatbot_anonymous_id`·`classin_chatbot_muted`·`cln_pending_marketing_consent`·`classinkr.purchaseTracked.<orderId>`, sessionStorage `classin.chatbot.teaser`. 제3자: `_ga*`·`_gcl_au`(동의 시, omo1 은 무동의), `_fbp`/`_fbc`, 네이버·카카오·채널톡, 구글 지도 iframe(동의 무관).

### 2-2. 셸·내비(헤더·푸터·전환·모바일 위젯)

- **헤더 높이 불일치** [운영]: 헤더가 스크롤 전 92px(모바일)/87px(데스크톱), 스크롤 후 77/72px 로 padding 을 애니메이션한다(`Header.tsx:54-58`). 히어로는 76/80px 에 붙어 있어 스크롤 전에 헤더가 히어로를 16px/7px 덮는다(첫 화면 헤더 아래 회색 띠). 같은 76/80 이 `ProductTabNav`·`PublicRouteLoading`·`HomeLeadMagnet` 에도 박혀 있다. → 헤더 높이를 `--header-h` 하나로 고정하고 배경·보더·그림자만 전환.
- 모바일 메뉴에 Esc·스크롤 잠금·백드롭·포커스 관리 없음 [운영], 열린 채 768px 이상으로 리사이즈하면 닫을 수 없음 [코드].
- `RouteTransition` 의 `key={pathname}` 이 매 이동마다 하위 트리 전체를 다시 마운트 → 제품 탭이 누를 때마다 다시 페이드, 문서 사이드바 상태 초기화.
- 공개 링크 대부분이 `prefetch={false}`(헤더·푸터·CTA 19곳) → 매 클릭이 콜드 요청. 로딩 화면이 빈 40vh → 다른 모양 스켈레톤으로 두 번 바뀌며 푸터가 튄다.
- `SessionNavEntry` 가 이동할 때마다 `/api/auth/session` 을 호출하고, 로그인 링크가 늦게 끼어들며 헤더 우측이 약 90px 밀린다.
- Dialog 진입·퇴장 클래스(`animate-in`, `fade-in-0` 등)가 정의돼 있지 않아 모든 모달이 모션 없이 튄다(`components/ui/dialog.tsx`).
- 768px 부근에서 헤더 메뉴 "제품 소개"·"회사 소개"가 두 줄로 꺾임 [운영].
- 공개 셸에 브랜드 포커스 링·스킵 링크·`aria-current`·nav `aria-label` 없음.
- 푸터 `© 2025`, 사업자 정보 `text-white/25~40`(AA 미달), `/pricing` 은 sitemap 에 있지만 어디서도 링크되지 않음.
- 토스트가 3초 고정·hover 정지 없음·헤더 햄버거를 덮음, 에러색이 Danger 토큰과 다름.

### 2-3. 홈(`/`)

- `SolutionOverview` 가 2.6초마다 자동으로 넘어가고 정지 수단·동작 줄이기 분기 없음(`SolutionOverview.tsx:38`). WCAG 2.2.2.
- framer-motion 에 `MotionConfig` 가 저장소 어디에도 없어 홈 12개 섹션(그리고 제품·블로그·행사)이 OS "동작 줄이기"를 무시한다. 전역 CSS 규칙은 CSS 애니메이션만 끈다.
- framer `initial={{opacity:0}}` 가 SSR HTML 에 인라인으로 들어가 하이드레이션 전·JS 실패 시 섹션이 비어 보이고, 카운터는 "0%·0만원"으로 보인다. SSR 안전한 `components/landing/Reveal.tsx` 가 이미 있는데 홈은 쓰지 않는다.
- `CaseStudies` 8.5초 자동 순환이 화면 밖에서도 계속 돈다, 조작 후에도 리셋 안 됨.
- 히어로 영상 `public/video/home-hero.mp4` 35.7MB(1080p 20Mbps). 720p 약 5MB 로 재인코딩 + `saveData` 시 미로드.
- 본문·라벨에 `#A39E98`(흰 배경 대비 2.66:1) 사용: `KeyUseCases`, `Outcomes`, `Comparison` "기존 방식" 열, `CaseStudies`, `LogoBar`. 본문은 `#615D59` 로.
- `Manifesto` 의 가장 큰 문장이 heading 이 아닌 span 이고 인라인 `letterSpacing: -0.05em` 이라 모바일 0 규칙을 깬다. 인라인 자간은 홈 12개 파일 15곳 이상.
- 깨진 앵커: `lib/docs.ts:6184` 의 `/#case-studies` — 섹션에 id 없음.
- 사례 익명화("청주 이**")와 같은 페이지 `LogoBar` 실명·이미지 파일명 실명이 충돌.
- `ProblemCost` 전체가 팔레트 이탈(오렌지·옐로·테라코타 그라데이션, 글래스 카드, `rounded-3xl`, ping·shimmer).
- `DashboardPreviewCharts` 툴팁 배경이 남보라 `rgba(15,12,41,.9)`.
- Manifesto 부터 Outcomes 까지 10개 섹션 연속으로 전환 CTA 가 없다. 포지셔닝 문서상 가장 강한 CTA(목동 쇼룸)는 맨 아래에만 있다.
- 데모 모달 필수 7필드(`DemoModal.tsx`) — 첫 접점 마찰.
- 메시지 중복: "흩어진 도구를 한 흐름으로" 4회, "역할별 이득" 3회, 후기 인용 CaseStudies 7 + TestimonialWall 7. 18개 섹션 → 12~13개로 줄이는 안은 §5-3.

### 2-4. 제품·가격

- 응답속도가 페이지 안에서 "0.03초"와 스펙표 "2ms"(`lib/hardware/board-specs.ts:79`)로 충돌, 경쟁 비교표 "고급 IFP 30~50ms vs Classin 30ms", "분필보다 빠른" 모순.
- HW 스펙 오기: NFC(S98 Pro 전용인데 전 모델처럼), 베젤 8mm vs 22mm, 교사 교육 2시간 vs 4시간, "24시간 원격지원 … 평일", OPS "i7"·"16GB"(S110 은 8GB), 두께·투과율·수용 인원 3곳 불일치.
- 라인업: 인벤토리·챗봇은 S98 Pro 를 안내하는데 제품 페이지·`lib/hardware` 어디에도 없음. 규격서 없는 S65 는 검증 표시 없이 노출.
- SW: "설치 없이 웹 브라우저", AI 8종 중 근거 없는 4종, "AI 기능 모두 기본 포함", 금지 명칭 "수식 편집기", 집중도·"상위 15%" 목업에 "예시 화면" 표기 없음, 결제·출결 과장(`honestLimit` 위반).
- SW 사례: 실명 학원·인용이 `lib/testimonials.ts` 밖에 있고 같은 사례가 두 섹션에 반복. 노출 동의 확인 필요.
- `lib/seo.ts:300-307` JSON-LD `AggregateOffer USD 99~199` 하드코딩(Enterprise 299 와 불일치), 결제 플래그가 꺼져도 SW 페이지에 USD 단가 노출.
- `/pricing` 이 `NEXT_PUBLIC_SW_CHECKOUT_ENABLED` 와 무관하게 `/checkout` 으로 "온라인 결제" 안내. SW 페이지는 플래그 OFF 에서 "카드 등록 불필요"라고 하지만 도착지는 상담 폼.
- HW 히어로 H1·이미지가 SSR 에서 `opacity:0`(페이지 전체 `"use client"`) → LCP 지연. SW 히어로 영상 15.6MB 즉시 로드, HW 루프 영상은 포스터·정지·동작 줄이기 없음.
- 접근성: HW 탭이 tab 시맨틱 없음, SW FAQ 가 `aria-expanded` 없고 접힌 답변을 계속 읽힘, 가격 계산기 슬라이더 Thumb 이름 없음.
- 가격 시뮬레이터 숫자 입력이 키마다 clamp 되어 "30" 을 치면 "50" 이 된다(`PricingCalculator.tsx:125-127`).
- PainPointsV2 가 어드민 전용 Danger 색과 파스텔 채움을 공개 페이지에 사용.

### 2-5. 콘텐츠(블로그·문서·행사·자료·업데이트)

- **sitemap 에 블로그 23편 누락** [운영]: sitemap 블로그 19건 vs RSS 42건. `app/sitemap.ts` 에 `revalidate` 가 없어 빌드 시점에 굳는다. `/resources`·`/download` 도 없다. → `export const revalidate = 3600` + 두 경로 추가, 당장은 재배포.
- `/docs?q=a&q=b` 가 빈 본문(30KB, 정상 137KB)으로 렌더 오류 [운영]. `q` 배열에서 `.trim()` TypeError. 3개 라우트 공통 헬퍼로.
- `/docs/search` 가 대소문자를 구분: `?q=EDB` 결과 없음, `?q=edb` 결과 있음 [운영]. 같은 쿼리가 zero-result 로그를 오염. 1줄 수정.
- `/docs`·`/docs/[category]` 가 `searchParams` 때문에 매 요청 SSR(`no-store`, TTFB 약 0.56초). 문서 상세는 `revalidate` 가 없어 채널톡 동기화 본문이 배포 전까지 반영 안 됨(운영 age 약 5일).
- 행사 조회 실패가 `[]`/`null` 로 Data Cache 1시간 저장(`lib/repositories/public-events.ts`) → 목록 빔·상세 404 캐시. 블로그 목록도 장애 UI 를 ISR 로 1시간 캐시. 행사 상태(예정/종료)가 캐시 시점 계산이라 최대 약 2시간 stale.
- 블로그 본문 이미지가 원본 PNG(한 글 14장 약 5.4MB), `width/height/srcset` 없음.
- 블로그·행사 히어로 h1 이 SSR 에서 `opacity:0` [운영].
- 한글 행사 슬러그가 블로그와 같은 ISR 500 위험 경로 [추정]. `/download` 6.0.8 vs `/updates` 6.0.9 표기 불일치.
- 허브(`/blog`, `/docs`, `/docs/start`)에 canonical·og:image 없음, 문서 상세 공유 카드에 이미지 없음, `?q=` URL 색인 가능.
- XSS 는 이상 없음(렌더러 이스케이프 확인), RSS 유효.

### 2-6. 전환·계정·법무·캠페인 랜딩

- 로그인 `next` 오픈 리다이렉트: `lib/auth/next-path.ts:18` 이 `/\evil.com` 을 통과시킨다. origin 비교로 교체.
- 수신거부 경로 고장: 메일 링크는 영문 HTML → 버튼 누르면 JSON 원문이 브라우저에 뜸. 한국어 `/unsubscribe` 는 메일에서 링크되지 않고 token 을 보내지 않아 항상 400.
- 정적 랜딩 4종(+omo1, meets-july)에 개인정보 수집·이용 고지·필수 동의·`/privacy` 링크 없음. 서버는 `privacyConsent` 를 저장하지 않아 contact·showroom·checkout 의 필수 동의도 증빙이 없다.
- 가입·로그인이 "동의하는 것으로 간주됩니다" 평문, 약관·방침 링크 없음.
- 정적 랜딩의 `<base>` 주입(`app/l/[slug]/route.ts:32-35`) 때문에 `href="#…"` 앵커 클릭이 페이지 리로드가 되고 `?gclid` 가 사라진다. 상대 경로 참조가 0건이라 `addBaseTag` 제거로 해결.
- 끝난 설명회(meets-july, 7/30·31) 신청이 계속 접수됨.
- 쇼룸: 409 직후 재조회가 60초 캐시를 맞아 같은 슬롯이 계속 열려 보임, 공휴일 경고는 `sources` 를 버려 죽은 코드.
- 주문 신청 폼 검증 실패 시 포커스·스크롤·요약 없음(먹통으로 오인). 결제 성공 오류 화면에 개발자 문구·고객센터 연락처 없음, `/checkout/fail?message=` 임의 문구 노출.
- 기본 OG 이미지에 한글 폰트가 없어 공유 카드 한글이 깨질 가능성 [추정].
- 잘 된 점: 폼 가짜 성공 없음, 이중 제출 방지, `collectLeadAttribution()` 1회 사용, contact 의 필수/선택 동의 분리, 네이버 OAuth state·합성 이메일, `/auth/callback`·`confirm` 의 next 검증.

### 2-7. 사이트 전반

- 운영 사이트맵 121개 주소 전부 200 [운영]. robots 차단 5종·noindex(share, login, signup, account, test 랜딩, simulator) 정상.
- 홈 첫 로드 JS+CSS 약 411KB(brotli), 그중 CSS 56KB [운영]. Pretendard 를 jsDelivr 외부 CSS 로 렌더 블로킹 로드.
- 디자인 토큰 가드(`scripts/check-design-tokens.mjs`)가 `components/admin/branch` 만 본다. 공개 화면의 팔레트 이탈(contact 의 `slate-*` 56회, 결제 결과 화면 `rounded-[32px]`, 404 파스텔 카드 등)은 CI 에 걸리지 않는다.

---

## 3. P2 — 정리 대상(요약)

- 미사용 코드·자산: `NewsletterModal.tsx`(315줄), `components/product/sw/LessonToolIcons.tsx`(287줄)와 PNG 28개, HW 원본 이미지 약 20MB, `globals.css` 의 blob·prism·calculator·glow·draw-line·cursor-blink·marquee·progress-fill 키프레임, 아무 데도 안 쓰는 `.dark` 토큰.
- 중첩 `<main>`(AppChrome + 페이지 7곳 이상), h2→h4 건너뜀, 표 `th` scope 없음, 장식 이미지 alt 중복.
- 헤더·내비·토스트·404·에러 페이지의 파스텔 활성 상태 → 아웃라인·좌측 바(§5).
- `/receipt/[orderId]` noindex·`Cache-Control: private` 없음, 링크를 Host 헤더로 생성.
- `/data-deletion` 에 Meta 대시보드용 운영자 지시문과 다른 도메인(`classin.ai.kr`) 노출, 내부 테이블명 노출.
- 정적 랜딩 푸터에 내부 식별자("landing_bigs segment landing" 등) 노출, `/privacy`·사업자 정보 없음.
- 허니팟 필드명이 `website` 라 자동완성이 채우면 실제 사용자가 봇 처리될 수 있음 [추정].
- 에러 텔레메트리 없음(`error.tsx`·404 추적 없음), 인쇄 시 헤더·챗봇·배너가 함께 인쇄.
- sitemap lastModified 하드코딩(4월·5월 값 정체).

---

## 4. 운영자 결정이 필요한 항목

| # | 결정 | 선택지 | 권장 |
|---|---|---|---|
| D1 | 구글 동의 모드 | 고급(현행, 동의 전 쿠키 없는 핑) vs 기본(동의 후에만 로드) | 기본. 배너 문구("허락해 주신 경우에만")와 맞고 P0-5 노출면도 줄어든다. 고급 유지 시 주석·방침 수정 |
| D2 | 유입 귀속 저장을 필수로 볼지 | 동의 전 기록 허용 vs 분석 동의 후 | 허용하되 TTL 90일 + pathname·허용 파라미터만 |
| D3 | 근거 없는 수치·보장 문구 | 삭제 vs 출처 확보 후 유지 | 일단 삭제, 확보되는 대로 `ScaleFacts` 로 복귀 |
| D4 | 실명 사례·인용 | 동의 확보 vs 익명 통일 | 기관별 공개 동의 범위 표로 확정 후 한쪽으로 통일 |
| D5 | 응답속도 공식 표기 | 0.03초 vs 2ms(측정 정의) | 측정 정의 하나 + 각주, 경쟁사 행 삭제 |
| D6 | 결제 플래그 OFF 일 때 SW USD 단가 | 노출 vs 숨김 | 숨김(가격 단정 금지 원칙) |
| D7 | 정적 랜딩 동의 블록·개인정보처리방침 개정·가입 동의 UI | — | 법무 확인 후 contact 동의 블록 이식 |
| D8 | 홈 섹션 18 → 12~13 통합 | 유지 vs 통합 | §5-3 순서안으로 통합(시안 먼저) |

---

## 5. 모션·디자인 디벨롭 기획

### 5-1. 현황 진단

- **도구는 이미 있다.** SSR 에서 보이고 동작 줄이기까지 처리된 `hero-soft-enter`(CSS)와 `Reveal`(IO+CSS)이 있고, CSS 쪽은 이징 `cubic-bezier(.22,1,.36,1)` 하나로 이미 수렴했다. 문제는 홈·제품 대부분이 이것 대신 framer 를 쓴다는 것.
- **일관성 없음.** framer duration 30종(0.2~20s), 명시 이징 5종 + 암묵 기본값 2종(`duration` 만 주면 easeInOut, 없으면 오버슈트 스프링). Tailwind duration 200/300/500/700 혼재.
- **동작 줄이기 누락.** `MotionConfig` 부재로 iOS "동작 줄이기"를 켠 원장도 y 100px, 16° 회전, 스프링을 그대로 본다. 카운터·Recharts·자동 전환·`useScroll` 도 미대응.
- **성능.** SSR `opacity:0`, `width`·`padding`·`height`·`filter` 애니메이션, 큰 `backdrop-filter`, 상시 `will-change`, 화면 밖 영상·타이머, 리빌 때문에만 `"use client"` 인 홈 섹션 10개.
- **취향과 정면충돌.** bounce 스프링 24곳, hover scale 1.03~1.05·표 들림·기울임, `animate-ping` 6곳, 모바일 CTA 상하 bob(모바일에서 가장 자주 보이는 모션), 파티클·블롭·글로우, 그라데이션 텍스트, 글래스 카드, 파스텔 hover 채움.
- **위계 없음.** 모든 섹션이 같은 fade-up 이라 이야기의 꼭짓점(전환점·증거·결정)이 구분되지 않고, 덜 중요한 곳(ProblemCost 장식, SatisfyingClass 콜라주, SW FinalCTA)이 가장 시끄럽다.

방향: 대부분은 **빼기와 기존 도구로 수렴**이고, 새로 만드는 것은 Act 별 서사 모먼트 5~6개뿐이다.

### 5-2. 원칙과 토큰

운영자 취향 "은은·길게·바깥 투명도"를 이렇게 읽는다: 투명도가 주인공, 이동은 12px 이하, 700ms 안팎의 긴 ease-out, 가장자리에서 서서히 사라지는 처리.

```css
/* app/globals.css :root */
--motion-fast: 160ms;    /* hover·press·색 */
--motion-base: 320ms;    /* 탭·메뉴·패널 교체 */
--motion-slow: 700ms;    /* 섹션 리빌(현행 Reveal 값) */
--motion-story: 1200ms;  /* Act 당 1회 서사 모먼트 */
--motion-rise: 12px;     /* 이동 상한 */
--motion-stagger: 80ms;  /* 최대 3단 */
--header-h: 76px;        /* md: 80px — 헤더·히어로·탭·scroll-mt 공용 */

/* @theme inline */
--ease-soft: cubic-bezier(0.22, 1, 0.36, 1);   /* 정본 */
--ease-drift: cubic-bezier(0.45, 0, 0.55, 1);  /* 스크럽 전용 */

@media (prefers-reduced-motion: reduce) { :root { --motion-rise: 0px; --motion-stagger: 0ms; } }
```

- Tailwind 4.1: `ease-soft duration-(--motion-slow)`.
- TS 미러 `lib/motion.ts`(10줄 이내): `EASE_SOFT`, `DUR`. 기존 `lib/chatbot/motion.ts` 의 같은 값은 여기서 import.
- 동작 줄이기 3층: ① CSS 전역 블록 유지 ② framer 를 쓰는 페이지 루트에 `<MotionConfig reducedMotion="user">`(transform 만 끄고 opacity 는 유지). 셸(AppChrome)에는 넣지 않는다 — framer 가 모든 공개 페이지 첫 청크로 끌려온다. ③ JS 모션(카운터·Recharts·자동 전환·`useScroll`)은 `matchMedia` 로 최종 상태를 즉시 렌더.

### 5-3. 프리미티브 선택

| 후보 | 판정 | 근거 |
|---|---|---|
| `Reveal`(IO + CSS) | 기본 프리미티브 | SSR 에서 보이고 동작 줄이기 처리 완료, 1KB 미만. 보강: 이미 뷰포트 안이면 무장하지 않기, `will-change` 제거, 토큰 적용 |
| CSS `animation-timeline: view()` | 1~2곳 한정 점진적 향상 | Chrome 115+, Safari 26(iOS 26, 실기기 확인 권장). 스크롤에 묶여 되감기므로 '스크럽'에만. `@supports` + `no-preference` 로 감싸고 대체는 정적 완전 표시 |
| View Transitions | 지금은 보류, Phase 3 실험 | Next 16 `experimental.viewTransition` 은 실험 API. 현행 RouteTransition 을 opacity 전용 200ms 로 단순화하면 충분 |
| framer-motion(설치됨) | 상태 있는 곳만 유지 | exit 애니메이션(챗봇·모바일 CTA), CaseStudies 위치 계산. 순수 리빌은 빼서 섹션을 서버 컴포넌트로 |
| GSAP·Lottie·Lenis | 추가 금지 | 위 조합으로 전부 해결 |

### 5-4. 홈 6-Act 안무

원칙: 서사 모먼트 6개 이하. 나머지는 Reveal 페이드(섹션당 3개 이하)이거나 정지.

| Act | 섹션 | 모먼트 | 메커닉 | 노력 |
|---|---|---|---|---|
| 1 선언 | Hero | 기존 진입 유지 + "학원의 시스템으로" 아래 2px 액센트 바가 제목 등장 후 그려짐. 그라데이션 텍스트·ping·hover scale 제거, 영상 화면 밖 정지 + 정지 버튼 | CSS `scaleX 0→1` 700ms, JS 0 | S |
| 1 | LogoBar | 마키 유지(유일한 상시 앰비언트), 40s 로 감속, hover·focus 정지, 복제 세트 `aria-hidden`, 상하 하드 보더 제거 | CSS | S |
| 1~2 | HomeEntitySummary, EraVision | 정지 / Reveal 페이드만. hover 파스텔 채움 → 좌측 2px 바 | 서버 컴포넌트화 | S |
| 3 공감 | ProblemCost | 카운터 하나만(수치 근거 확보 시). SSR 은 최종값, 50% 보이면 0→목표 1200ms 1회, `tabular-nums`. 글래스·테라코타·ping·shimmer·블롭 제거 | rAF + reduced 시 즉시값 | M |
| 3 | HomeLeadMagnet | 정지 — 전환 지점은 고요하게 | — | — |
| 3' 전환점 | Manifesto | 스크롤 스크럽 타이포: 두 줄이 화면 중앙을 지나며 opacity .18→1, 둘째 줄 아래 2px 바가 그려짐. `h2` 승격, 800px 블러 글로우 제거 | CSS `view()` + 정적 대체 | S~M |
| 4 솔루션 | SolutionOverview | 자동 전환을 "보이는 타이머"로: 활성 단계 아래 2px 바가 6초 동안 차오르고 다음 단계로. hover·focus·화면 밖에서 정지, 패널은 320ms 크로스페이드 | CSS `scaleX` + `animationend`. **함정:** 전역 동작 줄이기가 duration 을 0.001ms 로 만들어 `animationend` 가 즉시 발화 → reduced 시 자동 전환 핸들러를 붙이지 않는다 | M |
| 4 | KeyUseCases | 정지(탭 패널 페이드만), 기울임 스프링·블롭 제거 | — | S |
| 5 증거 | DashboardPreview | 데이터가 그려진다: 선 1200ms, 막대 900ms, 40% 보일 때. backdrop-filter → 단색, "예시 화면" 캡션, 툴팁 `#111110` | Recharts `animationDuration`, reduced 시 `isAnimationActive={false}` | M |
| 5 | ScienceBased·SatisfyingClass·GlobalScale·TestimonialWall·Outcomes | 정지 또는 Reveal 페이드. GlobalScale 의 EEO 공식 수치는 정적(카운트업 금지) | — | S |
| 5 | CaseStudies | 조작 위주. 자동 전환은 hover·focus·화면 밖·reduced 에서 정지, 스프링 → `ease-soft` 480ms, 비활성 슬라이드는 `inert` | — | M |
| 6 확신 | Comparison | 행 액센트: 표가 들어올 때 Classin 열 셀의 2px 좌측 바가 위→아래로(행당 80ms). 표 들림 제거, `text-green-500` → `#084734` | `::before scaleY` | S |
| 6 | FinalCTA | 정지. 화살표 hover 2px 이동만, 블롭 → `radial-gradient` | — | S |

전환 보강: `KeyUseCases` 뒤와 `TestimonialWall` 뒤에 헤어라인 CTA 띠(쇼룸, `TrackedLink` ctaId `home_mid_showroom`).

섹션 통합안(D8, 시안 먼저): Hero → LogoBar + 정의 띠 → Manifesto(+시대 3칩) → ProblemCost(정성) → HomeLeadMagnet → SolutionOverview → KeyUseCases(+역할별 Before/After) → DashboardPreview(예시) → Voices(CaseStudies+Testimonial)+GlobalScale → Comparison → FinalCTA. ProblemCost 직후 HomeLeadMagnet 흐름과 Comparison 의 "한계와 연동" 행은 유지한다.

### 5-5. 제품 페이지·셸

1. **HW 히어로 SSR 가시화(S, 최우선):** `hw/page.tsx:791-845` 의 framer `initial/animate` 를 `hero-soft-enter` 로. HW 서사 모먼트는 LatencyProof 의 펜 획 SVG 그리기 하나(수치 확정 D5 뒤). `AllInOneStatement`+`BigBackdropImage` 를 "보드→OPS→카메라→소프트웨어" sticky 스테이지 하나로 합치는 안은 Phase 3(1024px 미만·reduced 는 정적 스택).
2. **SW 다이어트(L, 2,197줄):** 가짜 카운터·파티클·블롭 드리프트·filter blur 애니메이션 제거. `TypographyHookSection`(`sw:720-760`)의 "줄 단위 등장 + 2px 그린 바"는 취향에 맞는 정본 패턴이라 유지하고 Manifesto 에도 쓴다. 26개 동일 아이콘 타일은 대표 4~5개 도구의 마이크로 데모(타이머 링, 랜덤 선택, 퀴즈 막대, 레이저 포인터; 한 번에 하나만 재생)로 대체하고, 쓰지 않던 `LessonToolIcons.tsx` 를 재활용.
3. **`/pricing` 선택 가이드(M):** 가격 없이 "규모·수업 패턴·하드웨어 유무" 3문항 칩 → 해당 비교 행에 좌측 그린 바, 나머지는 흐리게. CTA 는 `isSoftwareCheckoutEnabled()` 로 분기.
4. **공용 `ScaleFacts`(S):** 검증된 EEO 수치 3개 + 캡션 상시, SSR 최종값, 진입 1회 카운트업. P0-9 와 SW·HW 수치 불일치를 한 번에 정리.
5. **셸(각 S):** 헤더 높이 고정 + 배경·보더·그림자 opacity 만 400ms 전환(스크롤 감지는 상단 1px 센티넬 IO), 활성 표시를 파스텔 채움 → 하단 2px 그린 바 `scaleX`(제품 탭은 인디케이터 하나가 `translateX`), 모바일 메뉴 `@starting-style` opacity + 4px 페이드 + 백드롭 + Esc·잠금·`inert`, RouteTransition opacity 전용 200ms + 키를 최상위 세그먼트로, 모바일 CTA bob·ping 제거 후 1회 페이드만, Dialog 에 `dialog-in` 키프레임(opacity + scale .98→1, 220ms) 하나.
6. **CTA 마이크로 인터랙션 통일(S):** hover scale 금지. 색 전환 160ms, 화살표 2px 이동, press scale .97(`button.tsx` 에 이미 있음), 포커스 링 `#084734` 2px. CTA 반경 6px 통일(현재 `rounded-2xl`·`rounded-full` 혼재).
7. **전환 화면(M):** 쇼룸 폼 좌측 진행 레일(01~04, 현재 단계만 그린), 3개 폼 공용 오류 피드백(좌측 2px Danger 바, 흔들기 → 600ms 보더 색 페이드, 첫 오류 필드 포커스), 성공 화면은 접수번호 중심 타이포 + "다음 3단계" 아웃라인 리스트, 쇼룸 날짜 셀에 남은 슬롯 수 1px 틱·막힌 이유 안내.
8. **콘텐츠(S~M):** 블로그 읽기 진행바를 본문 범위로 + 목차 현재 항목 2px 바, 본문 이미지 `#F0F0EC` 자리표시 + 600~700ms opacity, 목록 hover 를 배경 채움·형제 흐림 대신 2px 바 `scaleY`, 행사 D-day 텍스트 상태 라인(마운트 후 KST 계산), 문서 단계 체크(localStorage, try/catch).
9. **쿠키 배너(S):** 900ms 뒤 `hero-soft-enter` 로 떠오름, 상세 설정을 회색 박스 → 1px 구분선 + 스위치, "필수만 사용"과 "모두 허용"을 같은 크기·같은 줄(거부는 그린 아웃라인), 저장 후 1.6초 확인 문구("언제든 푸터 '쿠키 설정'에서 바꿀 수 있어요").

### 5-6. 모션 외 디자인 요소

- **타이포 리듬:** 헤딩 3단(Display — Hero·Manifesto 전용 clamp / Section 40·48px 700 / Card 22~26px). 인라인 `letterSpacing` 15곳 이상을 유틸로 교체해 모바일 0 규칙 복구. eyebrow 는 13px/600 `#084734` + 왼쪽 16×2px 바, 공개 화면 pill 은 Hero 배지 1개만.
- **배경 리듬(하드 보더 없음):** Hero dark → LogoBar warm → Entity white → Era `#FAFAF8` → ProblemCost dark → LeadMagnet white → Manifesto dark → Solution warm → KeyUseCases white → Dashboard dark → ScienceBased white → SatisfyingClass warm → CaseStudies white → GlobalScale `#ECFDF5` → Testimonial warm → Outcomes white → Comparison warm → FinalCTA dark. 다크는 꼭짓점에만. 비토큰 배경(`#F9F8F4`, `#F7F8F5`, `#FDFCF8` 등) 정리.
- **다이어그램:** 1.5px 선, `#A39E98` 선에 강조 노드만 `#084734`, 채움 없음. 3D·글래스·글로우 금지.
- **아이콘:** lucide 유지, stroke 1.75, 기본 `#615D59`, 강조만 `#084734`. 그라데이션 아이콘 타일·채움 원 → 타일 없이 또는 whisper 아웃라인.
- **마케팅 차트:** 강조 시리즈 1개(라이트 `#084734` / 다크 `#6EE7B7`), 나머지 `#A39E98`, 직접 라벨, `tabular-nums`, 목업은 "예시 화면" 필수, 차트 애니메이션은 페이지당 1회.
- **사진:** HW 기획서 톤(3200~4000K, 채도 −10%)을 사이트 전체에, radius 16px, 오버레이는 하단 `black/40` 이하 하나.
- **본문 대비:** 읽는 텍스트는 `#615D59` 이상. `#A39E98` 은 플레이스홀더·캡션·비활성에만.

### 5-7. 단계별 계획

| Phase | 내용 | 완료 기준 | 시안 |
|---|---|---|---|
| 0 토큰·정리 (화면 변화 0) | 토큰 추가, 미사용 CSS 삭제(삭제 직전 grep 0건 재확인), LogoBar 인라인 keyframes 정리, `lib/motion.ts`, Reveal 보강, 페이지 루트 `MotionConfig`, 카운터 SSR 최종값, `DESIGN.md` 에 "모션" 절 추가 | typecheck·eslint 통과, 375×812·1440×900 전후 스크린샷 동일, reduced 에뮬레이션에서 transform 이동 0 | 불필요 |
| 1 고효과·저위험 (대부분 빼기) | HW 히어로 SSR 가시화, 홈 리빌 framer → Reveal(서버 컴포넌트화), ping·hover scale·들림·shimmer·bob·bounce 제거, SolutionOverview·CaseStudies 자동 전환 교정, 헤더 높이 고정, ProblemCost `width`→`scaleX`, 영상 화면 밖 정지·정지 버튼·재인코딩, backdrop-filter 제거, RouteTransition opacity 전용, 인라인 자간 → 유틸 | 모바일 Lighthouse(3회 중앙값) 홈·hw·sw 악화 0·hw LCP 개선, CLS ≤ 0.05, 탭 INP < 200ms, reduced 에서 이동·자동 전환·무한 루프 0, JS 끈 상태에서 홈 전 섹션 텍스트 보임, iPhone Safari 스크롤 프레임 저하 없음 | Hero 그라데이션 텍스트 제거·액센트 바, 모바일 CTA 정적화(전후 비교). SW 가짜 카운터 제거는 D3 |
| 2 서사 모먼트 (모먼트 1개 = 커밋 1개) | Manifesto 스크럽, ProblemCost 단일 카운터 + 재디자인, SolutionOverview 진행 바, DashboardPreview 그리기 + 예시 캡션, Comparison 행 액센트, 타이포 3단·eyebrow·배경 리듬 | 각 모먼트의 정적 대체를 Firefox·iOS 18 Safari·reduced 에서 캡처, iOS 26 실기기 스크럽 확인, 스크롤 중 long task 증가 0, 모먼트로 인한 CLS 0 | 전부 필수 |
| 3 제품·선택 | HW 스테이지·LatencyProof SVG, SW 다이어트·도구 마이크로 데모, `/pricing` 선택 가이드, AI 리포트 무한 펄스 in-view 한정, (실험) 제품 탭 View Transitions, (선택) 공개 컴포넌트에 `bounce:`·`repeat: Infinity`·`hover:scale-1xx`·`animate-ping` 신규 유입 가드 | 위와 동일 | SW FinalCTA 재구성, HW 영상 컷 |

### 5-8. 하지 말 것

- 새 애니메이션 라이브러리, 스무스 스크롤 하이재킹(iOS 관성 스크롤을 깸).
- 패럴랙스 남발(스크롤 연동은 Manifesto·BigBackdrop 2곳 상한), 모든 수치 카운트업(홈 1개, EEO 수치는 정적).
- bounce 스프링, hover scale > 1, 기울임·회전 hover, 3D tilt.
- 무한 앰비언트(ping, bob, 파티클, 블롭 드리프트, 글로우 펄스). 예외는 정지 가능한 마키와 히어로 영상 둘.
- 그라데이션 텍스트, 글래스모피즘, 블러 블롭 장식.
- `width`·`height`·`padding`·`filter` 애니메이션(opacity·transform, 작은 SVG `stroke-dashoffset` 만).
- JS 전에 콘텐츠를 숨기는 모션(SSR `opacity:0`).
- 가짜 라이브 데이터, "예시" 표기 없는 목업 수치.
- 읽기 시간보다 빠른 자동 전환, 정지 수단 없는 자동 재생.
- 한국어 글자·단어 단위 쪼개기 애니메이션(`keep-all` 줄바꿈과 스크린리더를 깸).

---

## 6. 실행 순서 제안

| 웨이브 | 묶음 | 담당 파트 | 크기 |
|---|---|---|---|
| W0 핫픽스 | P0-1 랜딩 가드 예외 + 테스트 · P0-2 챗봇 래퍼 pointer-events · P0-3 `body { overflow-x: clip }` + 히어로 커버 화면 확인 · P0-4 omo1 태그 삭제 · P0-5 추적 제외 경로 + pathname 만 · P0-6 Meta `disablePushState`·consent revoke · sitemap `revalidate` + 재배포 · docs `q` 배열·소문자 · CSP YouTube · P0-7 카카오 합성 이메일 · `sanitizeNextPath` origin 비교 · P0-8 자료 폼 동의 분리 · 정적 랜딩 `addBaseTag` 제거 · meets-july 마감 | growth-crm(리드·동의·추적·랜딩) · chatbot(래퍼) · home-front(CSS·sitemap) · content-pub(docs) · platform-data(OAuth·CSP) | 각 수 줄 |
| W1 콘텐츠·컴플라이언스 | P0-9 수치·보장 문구 정리(D3) · HW/SW 스펙 정합(D5) · 사례 동의(D4) · 개인정보처리방침 개정 · 랜딩 동의 블록 · 수신거부 경로 · 가입 동의 UI · 결제 USD 노출(D6) · JSON-LD offers | home-front · growth-crm · 법무 | 결정 대기 |
| W2 모션 Phase 0+1 | §5-7 Phase 0·1 + 셸(헤더 높이·메뉴·Dialog·모바일 CTA) | home-front | M |
| W3 모션 Phase 2 | 서사 모먼트 5개(시안 승인 뒤 1개씩) + 홈 섹션 통합(D8) | home-front | M~L |
| W4 제품·선택 | Phase 3 + 콘텐츠·전환 화면 디벨롭(§5-5 7~9) | home-front · content-pub · growth-crm | L |

W0 는 서로 다른 파일을 건드리므로 병렬로 나눌 수 있다. 머지 뒤에는 기본 게이트(`npm run typecheck` → `npx eslint app components lib --max-warnings=0` → `npm run build`)와 `npx vitest run`, 그리고 운영 Promote 후 라이브 재확인(랜딩 제출, 모바일 CTA 탭, sticky, omo1 쿠키)을 한다.

---

## 7. 확인 방법과 한계

- 운영 재현: 리드 API 가드(연락처 없는 요청), `/l/omo1` 쿠키·수집 요청, 홈 동의 전 쿠키·핑, 헤더 높이, sitemap 121개 상태, sitemap 블로그 수 vs RSS, docs 검색 오류·대소문자, CSP 헤더, SW 보장 문구는 classin.co.kr 에서 직접 확인했다. sticky·모바일 CTA·쿠키 배너 겹침은 헤드리스 Chromium(iPhone 13 프로필, 새 상태)으로 운영 페이지를 열어 확인했다. 쿠키 배너는 화면에서만 지웠고 동의를 저장하지 않았다.
- 운영 DB 읽기(정적 랜딩 리드가 언제부터 끊겼는지)는 자동 승인 모드에서 막혀 하지 못했다. 확인하려면 `tmp/db-probe-landing-leads-20261026.mjs`(집계만 출력, 쓰기 없음)를 직접 실행한다.
- 측정하지 않은 것: Lighthouse·번들 분석·실기기 iOS Safari, GTM 컨테이너 내부 태그 설정, 카카오 실제 미인증 이메일 허용 여부, Radix 모달과 쿠키 배너의 실제 겹침, OG 이미지 한글 렌더.
