# SEO·AEO 개선 워크리스트 — 진단서 ↔ 코드 대조 (2026-10-28)

기준 시점: 2026-10-28 · 대조 대상 코드: `6a08b84`(main) · 입력: 외부 예비 진단(2026-10-27, SEO 75/100·AEO 70/100)과 검색·분석 도구 설정 제안서
방식: 영역별 읽기 전용 조사 에이전트 6개(Opus 2, Sonnet 2, Haiku 2)가 코드·문서를 대조하고, 메인 세션이 교차 확인했다. 그 뒤 사실 확인이 필요 없는 기술 항목만 파트별 구현 에이전트 3개(콘텐츠·홈·그로스)로 나눠 같은 커밋에 반영했다(§11).
운영 사이트(classin.co.kr)·Search Console·GA4·운영 DB는 이 세션에서 접근하지 못했다. 아래 [운영] 표기는 [공개 사이트 전수 점검 2026-10-26](./public-site-audit-motion-plan-2026-10-26.md)의 실측을 인용한 것이다.

상태 표기

- **반영** — 이번 커밋에서 코드로 고침
- **코드 가능** — 사실 확인 없이 고칠 수 있으나 범위·결정 때문에 이번에 보류
- **사람 확인** — 원자료·정책·법무 확인 뒤에만 고칠 수 있음(누가·무엇을 §9)
- **콘솔** — 코드가 아니라 GA4·GTM·네이버·GSC·Vercel 에서 운영자가 하는 일(§8)

줄번호는 조사 시점 `6a08b84` 기준이다. 이번 커밋으로 몇 줄 밀린 파일이 있으니 문구로 찾는 편이 안전하다.

---

## 0. 한눈에

진단서가 "가장 시급하다"고 한 것은 새 콘텐츠가 아니라 **기존 페이지의 수치·비교·요금 조건 정리**다. 코드 대조 결과도 같다.

| 진단 우선순위 | 항목 | 코드 대조 결과 | 상태 |
|---|---|---|---|
| P0 | 사례 수치 정합(50% vs 3주→3일) | 같은 사례(부천 정율사관)가 한 카드 안에서 두 수치를 동시에 보여준다. 출처 주석 없음 | 사람 확인 |
| P0 | Zoom 비교 단정 | `/product/sw` 한 페이지에만 "기능이 없다"식 단정이 5곳. `/faq`·포지셔닝 SSOT·블로그는 보수적 | 사람 확인(기준일 결정) + 코드 가능(SSOT 문구로 교체) |
| P0 | 성능·효과 수치 | "100ms 이하 보장", "99.9% 가동률", 홈 ProblemCost 85/42/67% 등 근거 문서가 저장소에 없음. 카운트업은 SSR HTML 에 0 으로 들어감 | 사람 확인(근거 없으면 삭제) |
| P1 | 국내 요금 조건 | `/pricing` 에는 금액이 없고, 금액은 `/product/sw`(USD 기호만)와 noindex 인 `/checkout`·시뮬레이터에만 있다. 부가세·결제 주기·확인일 표기 없음. JSON-LD 가격은 하드코딩 | 사람 확인(통화·세금·정기결제) + 코드 가능 |
| P1 | 홈 제목 | `<title>` "Classin \| 수업 시스템 OS" 와 og:title "수업 시스템 OS \| Classin" 어순 불일치. "클래스인" 한글 병기는 규칙 위반 아님. 범주어 교체는 브랜드 결정 | 반영(어순 정합) + 사람 확인(문구) |
| P1 | 허브화·내부 링크 | `/pricing` 으로 가는 링크 0개, `/faq` 는 푸터 1개, `/product/sw`→요금·FAQ 0개 | 반영(푸터·홈 하단·요금·FAQ·제품 링크) |
| P1 | 답변형 콘텐츠 | 우선 질문 6개 중 Q5(결석 녹화)는 FAQ 없음, Q3(비용)은 색인 페이지에 근거 없음 | 코드 가능(초안 §6) + 사람 확인 |
| P2 | canonical·저자 | `/blog`·`/docs`·`/docs/[category]` canonical·og:image 없음, `?q=` 색인 가능. 블로그 저자 전부 Person | 반영 |
| P2 | 사이트맵 lastmod | 10-26 군집은 네이버 이관 23편 실제 개정일이라 날짜 자체는 맞다. 문제는 트리거가 메타 수정에도 갱신하는 메커니즘과 `/resources`·`/download` 누락 | 반영(누락 경로) + 사람 확인(DB 트리거) |
| 계측 | GA4·GTM·네이버 | 태그 ID 가 HTML 에 없는 이유는 전부 `ssr:false` 클라이언트 로더라서다(동의·idle 때문이 아님). generate_lead 는 있으나 `stored` 미확인·form_type 없음. URL 쿼리(prefill·token)가 구글로 감 | 반영(이벤트·정화) + 콘솔 |

---

## 1. P0 — 수치·주장 정합성

### 1-1. `/product/sw` 고객 사례 (`app/product/sw/page.tsx`)

| 위치 | 현재 문구 | 문제 | 조치 | 상태 |
|---|---|---|---|---|
| `CINEMATIC_CASES[0]` 603-617행 — 610 "신규 강사 적응 3주", 611 "강사 온보딩 3일로 단축", 615-616 `num:"50%"` "강사 온보딩 시간 단축" | 한 카드(부천 정율사관학원, "원장 김O준")에 50%와 3주→3일이 같이 렌더 | 3주→3일은 약 86%(영업일 기준 80%). 50%라면 약 10.5일이어야 한다. 출처·측정 기간·동의 주석 없음 | 원자료 확인 뒤 하나만 남긴다. 확인 전 잠정안: `num` 을 "3주 → 3일", 라벨 "신규 강사 적응 기간(원장 인터뷰 기준)" 으로 통일하고 50% 삭제 | 사람 확인 |
| `CASES[0]` 1324-1337행 — 1332 `{label:"강사 온보딩 시간", value:"50% 단축"}` | 같은 사례 중복 정의 | 두 배열이 따로 산다(사례 SSOT 없음) | 위와 같은 값으로 통일. 장기: `lib/testimonials.ts` 처럼 사례 SSOT 한 곳으로 | 사람 확인 |
| `data/blog-posts.json` 95-96행 | 정율사관학원 대표 "곽정율" | 페이지의 "원장 김O준" 과 인물 불일치 | 같은 기관의 다른 사람인지 확인 | 사람 확인 |
| `components/product/sw/OnboardingRoadmap.tsx` 39-41행 | "전담 온보딩 팀이 1~3일 안에" | Classin 측 온보딩 주장이 사례의 "3일"과 섞여 읽힘. `lib/classin-positioning.ts:18` "보통 3개월 안팎" 과도 충돌 | 라벨 분리: 설치 소요 / 계정·교육 온보딩 / 운영 정착(§6 Q4) | 사람 확인 |

### 1-2. `/product/sw` 성능·규모 수치

| 위치 | 문구 | 조치 | 상태 |
|---|---|---|---|
| 1154-1155 (`FAQS[3]`) | "글로벌 CDN을 통해 전 세계 어디서든 100ms 이하의 지연 시간을 보장합니다" | 근거 없으면 삭제. 대체안: "네트워크 품질은 교실 회선과 기기 환경에 따라 달라집니다. 관리자가 수업별 네트워크 상태를 확인할 수 있으니 도입 전 실제 회선에서 시범 수업으로 확인하시길 권합니다."(근거 `CLASSIN_POSITIONING.adminDataSummary`) | 사람 확인 |
| 2037, 2043, 2044 | "보장", `< 100ms` 지연, `${net99}.9%` 가동률 | SLA 문서 없으면 삭제. `useCountUp` 이 `useState(0)` 에서 시작해 **크롤러가 받는 HTML 에는 "0.9% 가동률", "0+ 지원 국가"** 가 들어간다(221행) | 사람 확인 + 코드 가능(SSR 최종값) |
| 1629·2042 "150+", 1308 "160+", 1426 "160개국" / 1426 "12개 언어" | 같은 페이지 안 국가 수 3종. 언어 수는 company-facts 상 미확정(공식 5) | "160+ · 전 세계 누적 · EEO 공식 소개 기준" 하나로 | 코드 가능 |
| 1630 "도입 학원 2,400+", 562·585 "200개 기업 고객사", 588 "98% 응답률", 537 1,560,000 에서 4.2초마다 +1 카운터 | 국내 수 단정 금지(`docs/active/brand-canon/company-facts.md`), 가짜 라이브 데이터 | 삭제 또는 EEO 공식 5수치로 교체 | 사람 확인(데이터 소유자) |
| 1146-1147 (`FAQS[1]`) "Google Classroom, Canvas, Moodle 등 주요 LMS와의 연동을 지원" | company-facts 39행 "미확인", 같은 페이지 1486행은 Canvas 를 "별도 구독" 으로 분류(자기모순) | `lib/public-faq.ts:60-62` 패턴(apiStages)으로 교체, 제품명 삭제 | 코드 가능 |
| 1158-1159 (`FAQS[4]`), `lib/ai-report-content.ts:20-22` "외부 다운로드 차단", "워터마크" | `lib/internal-cs-chat/knowledge.ts:144` "관리자 설정과 계약 범위에 따라 다름", `lib/docs.ts` 871·1643·3278 은 관리자가 녹화를 내려받는다고 안내 | "관리자 설정과 계약 범위에 따라 다름" 으로 정정 | 코드 가능 |
| 1121-1122 "AI 기능 모두 기본 포함" | `docs/active/classin-609-update.html:986` 일부 AI 기능 기본 비활성 | 조건 표기 | 코드 가능 |
| 1418-1429 INCLUDED "최대 1,000명", "전담 고객 지원" | `lib/billing/plans.ts` Standard 는 반별 50명·이메일 지원 | 플랜별 features/limits 를 plans.ts 에서 렌더 | 코드 가능 |
| 1163, `OnboardingRoadmap.tsx:31-35`, `lib/docs.ts:1088` "2주 무료 체험" | 챗봇(`lib/chatbot/service.ts:1355`)은 비단정. 정책 문서 없음 | 체험 조건(대상·기간·카드) 확정 전까지 단정 금지 | 사람 확인 |
| Acadsoc 4,000만+·15,000명·$63.6M(625·629·1342-1346), 왕보 "287" | 팩트 문서에 없음, 두 섹션 중복 | 원자료 | 사람 확인 |

### 1-3. 홈(`/`) 수치 (`components/sections/`)

| 위치 | 문구 | 성격 | 조치 | 상태 |
|---|---|---|---|---|
| `ProblemCost.tsx` 47-50 "20% 재등록률 하락", 56-58 "1,200만원 연간 손실", 64-66 "3개월 적응", 167 "시스템 미도입 학원 평균 데이터", 181-183 85%·42%·67%, 235-241 "종합 운영 비효율 지수 85%", 250 "멀티 지점 학원의 85%가" | 통계처럼 제시됐지만 출처·표본·기간이 저장소 어디에도 없음. "지수 85" 는 세 지표 평균(64.7)이 아니라 첫 값 복제. 최초 반입 커밋 `fb5f79f`(2026-07-18) | 출처 확보 또는 "예시 시나리오(실측 아님)" 표기, 종합 지수·250행 문장 삭제 | 사람 확인 |
| `Outcomes.tsx:43` "주 평균 15시간 절감" / `SatisfyingClass.tsx:43` "행정 시간 70% 단축" | 서로 다른 값, 둘 다 근거 없음. 가이드 §11 보장형 문구 | 둘 중 하나로 통일하거나 "파일럿에서 먼저 측정" 문구 + `/resources/academy-resource-reduction-calculator` 연결 | 사람 확인 |
| `DashboardPreview.tsx` 17-19·172-174, `DashboardPreviewCharts.tsx` 16-30, `SatisfyingClass.tsx` 69·78 | 목업 KPI(출석률 98.2%, 학부모 열람율 76% "24h 기준" 등) | "예시 화면(가상 데이터)" 캡션 추가 | 코드 가능 |
| `GlobalScale.tsx` 7-10·59 | EEO 5수치 + "전 세계 누적 · EEO 공식 소개 기준" | 허용. 31행 "유니콘" 은 실증자료(IR/확인서) 확보가 company-facts §5 미완 | 사람 확인(법무) |
| `LogoBar.tsx` 4-37 | 34개 기관 실명 | 같은 페이지 `CaseStudies` 익명화("청주 이**")와 충돌, 비학원 4곳 포함 | 계약·노출 동의 확인 | 사람 확인 |
| `ScienceBased.tsx` 79·144·87 | Ebbinghaus 42%/67%, Freeman "1.5배·55%", "AI 요약 퀴즈 자동 전송" | 인용 원문 대조(Freeman 2014 는 왜곡 가능성), 기능은 인벤토리에 없음 | 사람 확인 |
| `KeyUseCases.tsx` 41·100-102 | "30여가지 수업 도구", "일정 및 결제 알림" | 결제는 `honestLimit` 와 긴장 | 사람 확인(제품) |
| `HomeLeadMagnet.tsx:74` "도입 자료 13종" / `Hero.tsx:76` "34문항" | 자료실은 16종(`data/lead-magnets.json`) | 건수를 데이터에서 계산 | 코드 가능 |

---

## 2. P0 — Zoom 비교 문구

단정 표현은 `/product/sw` 한 파일에만 있다. 나머지 표면은 이미 보수적이다.

| 표면 | 위치 | 현재 | 판정 |
|---|---|---|---|
| `/product/sw` FAQ | `app/product/sw/page.tsx:1142-1143` | "학생이 화면 안에서 직접 참여(판서, 문제 풀기, 퀴즈 대결)하는 기능이 없습니다" | 단정. 교체 대상 |
| `/product/sw` 비교표 | 1720 머리 "일반 화상 도구 (Zoom 등)", 1731-1738 "채팅 또는 음소거 해제" / "없음 (별도 앱 필요)" / "기본적인 그리기 위주" / "화상 회의 1가지" / "파일 수동 관리" | 단정 셀 5개 | 교체 대상 |
| `/product/sw` 기타 | 1256-1258, 1485 "Zoom · Teams 등 / 화상 수업만", 555 | 단정 | 교체 대상 |
| 포지셔닝 SSOT | `lib/classin-positioning.ts:39-44` `comparisonPoints[0]` | "Zoom은 화상회의 중심이고, Classin은 수업 전 준비부터 … 수업 운영을 잇는 구조" | 기준 문구 |
| `/faq` | `lib/public-faq.ts:35-37` | "Zoom은 회의 중심 도구이고, Classin은 수업 운영을 위해 설계된 시스템" | 적정 |
| 블로그(네이버 이관) | `naver-2026-01-02-화상강의-플랫폼-결국-줌이-맞을까`, `naver-2026-02-13-온라인-학원-창업-zoom이면-충분할까요`(저장소 스냅샷 slug, 10-26 재발행 뒤 라이브 slug 는 DB 확인) | 01-02 글 구 원고: "회의 플랫폼이 기본 제공하는 것은 사실상 '화면 공유' 하나뿐", "사용자의 90%가 기존 Zoom 사용자"(출처 없음). 02-13 글: "출결·과제·판서·녹화·복습… 책임지지는 않습니다" | 라이브 본문 확인 뒤 범위 한정 |

진단서가 가리킨 `/blog/zoom-vs-classin-for-academies` 는 저장소에 없다. 위 두 편 중 하나의 10-26 영문 slug 일 가능성이 높다 [추정].

조치 순서

1. 마케팅+법무가 **비교 기준일**과 Zoom 요금제별 기능(화이트보드·주석·투표·소회의실·클라우드 녹화) 을 확인한다. 표시광고법 비교광고 기준도 같이 본다. — 사람 확인
2. 확인 전이라도 FAQ 1143행은 `comparisonPoints[0].point` 재사용 + "실시간 연결만 필요한지, 수업 후 복습·과제까지 이어져야 하는지가 선택 기준입니다" 로 바꿀 수 있다. 비교표 머리는 "회의 중심 구성 / 수업 운영 구성", 단정 셀은 운영 흐름 표현으로. — 코드 가능
3. 비교 글·제품 페이지·FAQ 에 같은 **검토일**을 붙인다(§6 형식 ⑤).

---

## 3. P1 — 국내 요금 정보

| 항목 | `/product/sw`(색인) | `/pricing`(색인) | JSON-LD `lib/seo.ts:300-307` | `/checkout`(noindex) | `/pricing/simulator`(noindex) |
|---|---|---|---|---|---|
| 금액 | Standard $99 · Plus $199 · Enterprise "맞춤 견적"(1524-1542, `lib/billing/plans.ts` 파생) | **없음** | low 99 / high 199, offerCount 3(**하드코딩**, env override 안 따름) | 월 $99/$199, 연 $990/$1,990 | $99/$199/**$299** |
| 통화 | `$` 기호만, "USD" 글자 없음 | — | USD | USD + 원화 승인 안내(`KrwConversionNote`) | 환율 1,440 |
| 계정 기준 | "/계정/월", 계정 정의 없음 | "계정 수 조정" 1회 | 단위 없음 | "/ 계정 / 월" | 강사 계정 수 |
| 부가세 | 없음 | 없음 | 없음 | SW 없음(HW 만 "부가세 별도") | 없음 |
| 결제 주기 | "연 결제 시 약 2개월 절감"(연 금액 미표시) | 없음 | 없음 | 월/연 토글 | 월 |
| 최종 확인일 | 없음 | 없음("체크아웃·상담 단계에서 최종 확인" 73행) | `priceValidUntil` 없음 | 없음 | 없음 |

같이 드러난 불일치

- 플랜 명칭 3종: `/pricing` "Learning Space 구독형 / Business 충전형", `plans.ts` "Standard / Plus / Enterprise", `lib/docs.ts` 1038·1073 "Pro / 비즈니스 / Enterprise".
- 환율 상수 4곳: `lib/billing/fx.ts:40-41` 1,400 · `PricingCalculator.tsx:24-27` 1,440 · `app/pricing/simulator/krw/page.tsx:7-10` 1,500 · `SubscriptionCheckoutPanel.tsx:181` 1,400.
- `NEXT_PUBLIC_SW_CHECKOUT_ENABLED`(기본 false)가 꺼져 있으면 `/product/sw` 의 CTA 5개("지금 무료로 시작하기", "무료 체험 시작", "도입 상담" …)가 전부 `/contact#contact-form` 으로 가고 `?topic=` 도 없다(28-39행). 가격은 플래그와 무관하게 노출된다. `/pricing` 은 플래그와 무관하게 "온라인 결제 → /checkout" 을 안내한다.
- `/product/sw` FAQ 1162-1163 "맞춤 요금제… 2주 무료 체험" 은 같은 페이지 고정가와 모순. 1442-1443 "월 수십만 원" 원화 비교는 근거 없음.
- `app/pricing/layout.tsx:5-6` description "합리적인 가격으로 학원 운영의 모든 것을 해결" 은 `honestLimit` 와 어긋난다.
- 색인 문제: 금액 근거 페이지가 전부 noindex 라 검색·AI 답변에서 Q3(비용)의 근거가 빠진다.

조치

| 조치 | 상태 |
|---|---|
| 한국 법인 사업·재무가 확정: 국내 판매 통화(USD 표기·원화 승인 유지 여부), 부가세 포함/별도, 월 자동 갱신 여부(`docs/software-billing-phase1.md:36` 정기결제 미구현 표기), "계정" 정의, Enterprise $299 공개 여부, PDF 요금표 원본과 기준일 | 사람 확인 |
| 가격 아래 캡션: "USD 기준 · 계정 1개당 월 요금 · 연 결제 $990 / $1,990 · 국내 카드 결제 시 결제일 환율로 원화 승인 · 부가세 [확인 후] · 가격 기준일 YYYY-MM-DD" | 코드 가능(확정값 대기) |
| JSON-LD 를 `getSelfServeSoftwarePlan()` 에서 파생, offerCount 를 실제 가격 플랜 수로, `UnitPriceSpecification`(unitText "계정/월")·`priceValidUntil` 추가, `url` 을 `/pricing` 으로 | 코드 가능 |
| 플랜명·환율 상수 단일화(`plans.ts`, `fx.ts`) | 코드 가능 |
| CTA 3갈래 분리: "플랜·가격 자세히 → /pricing" / "도입 상담 → /contact?topic=…" / "쇼룸에서 보기 → /showroom", 플래그 OFF 라벨에서 "무료"·"카드 등록 불필요" 삭제, 이벤트 이름 뒤바뀜(히어로 `sw_final_checkout` ↔ 마지막 `sw_story_checkout`) 정정 | 코드 가능 |
| `lib/contact/topics.ts` 에 "요금·견적", "연동·API" 유형 추가(기존 value 는 집계 키라 변경 금지) | 코드 가능 |
| `/pricing` 에 조건 블록(통화·결제 주기·세금·계정 기준·포함 기능·한도·최종 확인일·환불 조건 `/terms` 7번·시뮬레이터 링크) | 코드 가능(확정값 대기) |

---

## 4. P1 — 홈 제목·설명·구조화 데이터

### 4-1. 현재 조립 경로

| 레이어 | 위치 | 값 |
|---|---|---|
| 상수 | `lib/seo.ts:5-9` | `SITE_NAME` "Classin", `DEFAULT_SITE_TITLE` "Classin — 학원 운영의 새로운 기준"(2026-06-29 "수업 시스템 OS" 통일 이전 문구 잔존) |
| 루트 | `app/layout.tsx:21-45` | title 템플릿 `%s \| Classin`, description = `CLASSIN_POSITIONING.metadataDescription`(85자) |
| 홈 | `app/page.tsx:15-23` | `createPublicMetadata({title:"수업 시스템 OS", …})` 뒤 `title.absolute` 로 "Classin \| 수업 시스템 OS" 덮어씀 → og:title 은 빌더 규칙(`seo.ts:42`)대로 "수업 시스템 OS \| Classin" |
| OG 이미지 | `app/opengraph-image.tsx:80-83,96-98` | "학원 운영의 새로운 기준", "데이터 기반의 학원 관리 플랫폼… 행정 업무를 자동화" — 현재 포지셔닝(§7 "관리 프로그램 전부 대체 금지")과 어긋남. 한글 폰트 미지정, `alt` 없음 |
| `public/llms.txt` | 7-14행 | 도메인 `classin.ai.kr`, 영문 설명. `SITE_URL`(classin.co.kr)과 불일치 |

### 4-2. 제목 변경 판단

- "클래스인" 한글 병기를 금지하는 규칙은 `docs/active/classin-korea-positioning-guidelines.md`, `docs/active/brand-canon/*` 어디에도 없다. 홈 본문(`GlobalScale.tsx:28`, `Footer.tsx:54`)은 이미 쓴다.
- 충돌은 범주어 쪽이다. 가이드 §1 "Classin은 … **수업 시스템 OS**로 설명한다", `lib/classin-positioning.ts:5` "카테고리명 통일". 진단서 개선안의 "운영 플랫폼" 은 가이드 §7(학원 관리 프로그램 대체 금지)과 긴장한다.
- 후보
  - A(진단안) `클래스인 Classin | 학원 전자칠판·수업 녹화·운영 플랫폼` (35자)
  - B(범주어 유지) `클래스인 Classin | 학원 전자칠판·수업 녹화·수업 시스템 OS` (38자)
  - description(진단안, 79자) `전자칠판, 수업 녹화, 교안, LMS와 관리자 데이터를 연결하는 클래스인. 학원 규모와 운영 방식에 맞는 도입 방법과 요금 상담을 확인하세요.` — "요금 상담" 이 가격 비단정 원칙과 맞는지 영업 승인 필요
- 바꿀 때 손댈 곳: `app/page.tsx`(absoluteTitle), `lib/classin-positioning.ts:11-12`(description 은 layout·page·WebPage JSON-LD 공용), `app/page.tsx:43` WebPage name, `app/opengraph-image.tsx` 문구, `lib/seo.ts:7` DEFAULT_SITE_TITLE, `public/llms.txt`.
- 변경 뒤 Search Console 에서 검색어별 노출·CTR 을 4주 이상 비교한다.

### 4-3. 구조화 데이터

| 노드 | 현재(`lib/seo.ts`) | 보강 | 상태 |
|---|---|---|---|
| Organization 79-103 | name·url·logo·brand·contactPoint(sales) | `alternateName` ["클래스인","ClassIn"], `legalName`·`address`(푸터 공개값), `description` | 반영 |
| | | `sameAs`(공식 YouTube·네이버 블로그·카카오 채널·classin.com URL), `foundingDate`(2022-10), 고객지원 contactPoint 분리 | 사람 확인(마케팅·경영지원) |
| WebSite 105-124 | SearchAction → 색인 가능한 `/docs?q=` | `alternateName`, SearchAction 을 noindex 인 `/docs/search?q=` 로 | 반영 |
| WebPage(홈) `app/page.tsx:39-48` | name "Classin 수업 시스템 OS", BreadcrumbList 1개 | 제목 결정 뒤 name 정렬 | 사람 확인 뒤 코드 |
| Article 179-210 | author 항상 Person | 팀명("… 팀", "ClassIn Korea") 이면 Organization | 반영 |
| SoftwareApplication 278-309 | AggregateOffer USD 99~199 하드코딩 | §3 | 코드 가능 |

### 4-4. 첫 화면에서 "어떤 서비스인가" 답하기

- 지금 직접 답하는 블록은 3번째 `HomeEntitySummary`(`app/page.tsx:52`) 뿐이다. 히어로 H1(`Hero.tsx:51-58`)은 슬로건이고 `positioning.heroHeadline`(14행)은 어디서도 쓰이지 않는다(SSOT 이원화). **온라인·오프라인 적용 범위는 홈 어디에도 없다.** `positioning.localReality`(17-18행)는 챗봇·문서에서만 렌더된다.
- 넣을 자리: ① `heroBody`(`positioning.ts:15-16`)를 정의형으로 ② eyebrow(13행)에 범주 키워드 ③ `HomeEntitySummary.tsx:3-16` 에 4번째 항목 "적용 범위(오프라인 교실 수업이 기본, 반별로 온라인·하이브리드 확장)". 하이브리드 범위 문구는 가이드 §3("일부 선도 학원")과 맞춰 제품·영업 승인 뒤.

---

## 5. P1 — 허브화·내부 링크

### 5-1. 조사 시점 링크 매트릭스(본문 href 리터럴)

| 출발 \ 도착 | /pricing | /faq | /blog | /docs | /resources | /showroom | /contact | /product/sw | /product/hw |
|---|---|---|---|---|---|---|---|---|---|
| 홈 | 0 | 0 | 2 | 0 | 4 | 1 | 0(모달) | 0 | 0 |
| /product/sw | 0 | 0 | 0 | 0 | 0 | 0 | 2(+플래그 OFF 3) | — | 1 |
| /product/hw | 0 | 0 | 0 | 0 | 0 | 0 | 4 | 0 | — |
| /pricing | — | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 |
| /faq | 0 | — | 0 | 2 | 0 | 0 | 0 | 0 | 0 |
| /blog 허브 | 0 | 0 | — | 0 | 0 | 0 | 0 | 0 | 0 |
| 헤더 | ✗ | ✗ | ✓ | ✓ | ✗ | ✓(lg) | ✓ | ✓(드롭다운) | ✓(드롭다운) |
| 푸터 | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ |

`/pricing` 은 sitemap 에만 있고 어디서도 링크되지 않았다. 챗봇과 모바일 CTA 도 `/pricing` 에서 숨는다(`FloatingChatbot.tsx:159`, `MobileFloatingCTA.tsx:79`).

### 5-2. 검색 의도별 허브(기존 경로 재사용)

| 의도 | 허브 | 묶을 자산 | 빠진 것 |
|---|---|---|---|
| 문제 인식(결석 보강·녹화 관리·판서 저장) | `/docs/admin`, `/resources` | `/resources/academy-system-checklist`, `/resources/classroom-recording-replay-setup-guide`, `/resources/parent-replay-retention-script-kit`, `/docs/software/lesson-activities`, `/docs/software/admin-monitoring-analytics`, `/docs/admin/course-management`, `/docs/admin/storage-management`, `/docs/student/class-join-replay`, `/docs/hardware/board-writing-touch`, 블로그 명절 보강 글 | 제목에 "결석 보강"·"판서 저장" 이 들어간 글·문서 없음(본문 언급만) |
| 해결책 탐색(학원 전자칠판·수업 관리 프로그램·하이브리드) | `/product/hw`, `/product/sw`, `/docs/hardware` | `/resources/electronic-whiteboard-classroom-checklist`, `/resources/classroom-install-av-readiness-checklist`, `/docs/hardware/board-lineup-specs`, `/docs/hardware/board-overview`, `/docs/hardware/mic-dt2-pro`, `/docs/software/app-capabilities-map`, 블로그 2025-12-11 전자칠판 선택 글 | **하이브리드 수업 전용 가이드 0건**(유일한 신규 필요 콘텐츠) |
| 대안 비교(Zoom·화상수업 플랫폼) | `/product/sw`, `/faq` | `/resources/academy-software-selection-worksheet`, `/docs/start/why-classin-needs`, `/docs/start/academy-system-os-positioning`, 블로그 Zoom 2편 | Zoom 외 플랫폼 비교 없음(비교표에 행 추가가 최소안). 자료실 "비교표"는 실제로 0/1 체크 42문항 |
| 도입 결정(가격·기간·연동·개인정보) | `/pricing`, `/faq`, `/docs/start` | `/docs/start/pre-adoption-faq-22-questions`, `/docs/start/adoption-journey-90days`, `/docs/software/software-pricing-quote-bundle-faq`, `/docs/start/customer-stories`, `/resources/classin-pre-adoption-questions-checklist`, `/resources/classin-90-day-adoption-roadmap`, `/resources/academy-data-automation-brief` | `/docs/start/value-and-cost-framing`(도입 비용 유일 문서)이 **비공개(unlisted)** |

### 5-3. 링크 추가 위치

| 위치 | 링크 | 상태 |
|---|---|---|
| `components/sections/Footer.tsx` | `/pricing`, `/resources` | 반영 |
| `components/sections/FinalCTA.tsx` 탐색 줄 | `/faq`, `/pricing` | 반영 |
| `app/pricing/page.tsx` 하단 | `/faq`, 요금 FAQ 문서, `/pricing/simulator`(고아 페이지였음), `/showroom` | 반영 |
| `app/faq/page.tsx` 상단 | `/pricing`, 22질문 문서, `/contact#contact-form` | 반영 |
| `app/product/sw/page.tsx` FAQ 섹션 | `/faq`, `/pricing` | 반영 |
| `app/product/hw/page.tsx` | `/faq`, 하드웨어 FAQ 문서 | 반영 |
| `components/sections/Header.tsx:20-23` productTabs | `/pricing`(상단 내비는 md 구간이 빠듯해 드롭다운 안으로) | 코드 가능(디자인 확인) |
| `lib/public-faq.ts` 항목별 next-link, `FAQ.tsx:64-65` 딥링크 id | Q3→요금, Q4→90일 문서, Q6→API 문서 | 코드 가능 |
| `app/contact/page.tsx` 폼 위 | `/faq`, `/pricing` | 코드 가능 |
| `app/blog/BlogPageClient.tsx` | `/faq`, `/resources` | 코드 가능 |
| 블로그 `lead_magnet_slug` | 녹화·보강 글 → replay 가이드, 비교 글 → selection worksheet, 도입 글 → 22질문 키트(저장소 백업 11건은 전부 null, 운영 DB 확인) | 사람 확인(콘텐츠) |
| 중복 쌍 정본 지정 | `docs/admin/academy-system-checklist`(unlisted)↔`resources/academy-system-checklist`, `docs/hardware/electronic-whiteboard-classroom-checklist`↔동명 자료실, `docs/start/pre-adoption-faq-22-questions`↔`resources/classin-pre-adoption-questions-checklist`, `docs/start/adoption-journey-90days`↔`resources/classin-90-day-adoption-roadmap`, `docs/hardware/board-install-readiness`↔`resources/classroom-install-av-readiness-checklist` | 사람 확인(콘텐츠) |

---

## 6. P1 — 답변형 콘텐츠(우선 질문 6개)

권장 형식: ① 직접 답 2~3문장 ② 조건 ③ 근거 ④ 다음 행동 ⑤ 검토일.
현재 `/faq` 는 `lib/public-faq.ts` 21개(FAQPage JSON-LD 21/21)이고 홈에는 FAQ 섹션이 없다. `/product/sw` FAQS 6개는 JSON-LD 없이 별도로 산다.

| Q | 지금 답하는 곳 | 충족 | 빠진 것 |
|---|---|---|---|
| Q1 어떤 서비스 | FAQ1(`public-faq.ts:31-32`), `HomeEntitySummary` | ① 부분 | 대상 고객(`positioning.primaryAudience` 가 FAQ 에 없음), 온·오프라인 범위(오프라인 출석 미지원 `lib/docs.ts:921,4174`), ②③④⑤ |
| Q2 Zoom 차이 | FAQ2, `/product/sw` FAQ·표 | ① 부분 | 요금제 조건, "Zoom 이 맞는 경우", 비교 기준일 |
| Q3 비용 | FAQ9(금액 없음), `/pricing`(금액 없음) | ① 부분 | 공개 가격·통화·주기·세금·계정 기준·확인일. 근거 페이지가 전부 noindex |
| Q4 도입 기간 | FAQ3 "3개월 안팎" | ① 충족 | 설치 1일 / 온보딩 1~3일 / 정착 3개월 라벨 분리, 준비 사항(`/docs/hardware/board-install-readiness`), 기간 변동 조건 |
| Q5 결석 녹화 | **FAQ 없음**(FAQ18 은 교사 설정). 문서 `lib/docs.ts` 682-688(녹화 수업=결석 보강)·871·886(플레이백)·3038(자동 삭제 기본 꺼짐)·3278·3322(유료·계정 인증·교사 계정) | ✗ | FAQ 항목 자체, 보관 기간, 학생 접근 경로, 요금제 조건 |
| Q6 연동 | FAQ7(apiStages) | ① 부분 | 확인 방법([계정 정보] > API 도킹 `lib/docs.ts:3068`), 별도 개발 주체·비용, `/product/sw` 제품명 충돌 |

FAQ 추가·보강 초안 — 근거가 코드·문서에 있는 문장만 썼고, [확인] 표시는 게시 전 확인이 필요하다.

**Q1. Classin 은 어떤 학원과 어떤 수업에 쓰는 서비스인가요?**
① 학원 원장과 운영 책임자를 위한 수업 시스템 OS 다. 전자칠판, EDB 교안, 녹화, LMS, 관리자 데이터를 수업 전·중·후 한 흐름으로 묶는다. 주 대상은 대면 수업이다.
② 오프라인 칠판 필기는 가능하지만 클라우드 동기화·온라인 수업·녹화 업로드·LMS 배포는 네트워크가 필요하다. 오프라인 출석 체크 기능은 없다. 학생은 웹과 앱으로 접속한다.
③ `lib/classin-positioning.ts:7,9-10`, `lib/ai-report-content.ts:15-17`, `lib/docs.ts:410,921,4174` ④ `/showroom`, `/docs/start/academy-system-os-positioning` ⑤ [게시일]

**Q2. Zoom 과 무엇이 다른가요?**
① Zoom 은 화상회의 중심 도구다. Classin 은 판서, EDB 교안, 퀴즈, 녹화, LMS, 관리자 데이터를 수업 운영 흐름으로 묶은 수업 전용 시스템이다.
② 실시간 연결만 필요하면 Zoom 으로 충분할 수 있다. 수업 후 복습·과제·출결 기록까지 한 흐름으로 남겨야 하면 Classin 이 맞다. [확인: Zoom 요금제별 기능 비교 기준일]
③ `lib/classin-positioning.ts:39-44`, `lib/docs.ts:400-404` ④ `/product/sw`, 비교 워크시트 ⑤ [게시일]

**Q3. 도입 비용은 얼마인가요?**
① 소프트웨어는 계정당 월·연 요금제가 있다(USD 표기, 결제는 원화 승인) [확인: 금액 공개 정책]. 충전형은 원화 선충전이다. 전자칠판·카메라·스탠드/벽걸이·설치·온보딩은 구성별 견적이고 하드웨어 금액은 부가세 별도다.
② 계정 수, 결제 주기, 플랜(Enterprise 는 맞춤), 하드웨어 구성·설치 방식, 연동 범위, 결제 후 계정 인증. 소프트웨어 세금 처리 [확인]
③ `lib/billing/plans.ts:33-76`, `HardwareCheckoutPanel.tsx:251`, `lib/docs.ts:1034-1122` ④ `/pricing`, `/contact#contact-form`, `/docs/software/software-pricing-quote-bundle-faq` ⑤ [게시일]

**Q4. 학원에 도입하는 데 얼마나 걸리나요?**
① 1개 교실 파일럿부터 시작한다. 정착은 보통 3개월 안팎, 범위가 넓은 기관은 6개월~1년이다(보장 수치 아님). 하드웨어 설치는 현장 실측 뒤 일정을 잡는다. [확인: 설치 1일, 온보딩 1~3일, 2주 무료 체험]
② 교실 수와 대표 수업 범위, API 연동 여부, 설치 방식(스탠드·벽걸이·매립)과 벽면 보강·전원·네트워크, 교사 온보딩 인원
③ `lib/docs.ts:6313`, `lib/public-faq.ts:42`, `lib/docs.ts:1683` ④ `/docs/start/adoption-journey-90days`, `/docs/hardware/board-install-readiness`, `/resources/classin-90-day-adoption-roadmap`, `/showroom` ⑤ [게시일]

**Q5. 결석한 학생에게 녹화 수업을 제공할 수 있나요?**
① 가능하다. 교사가 수업 녹화를 켜면 끝난 수업을 학생이 다시보기로 본다. 결석 보강용으로는 녹화 수업 활동을 코스에 올리고 시청 기한과 확인 과제를 붙인다. 녹화는 유료 요금제 결제와 계정 인증을 마친 학원에서, 교사로 등록된 계정만 켤 수 있다.
② 유료 전환·계정 인증(며칠 소요), 현장 녹화는 카메라 구성 전제, 자동 삭제는 기본 꺼짐이며 [일반 설정] > [저장 설정]에서 기간·보호 잠금 설정, 스토리지 용량·요금은 계약별 [상담 확인], 학부모 공개 범위는 학원이 정함
③ `lib/docs.ts:682-688,871,886,3038,3278,3322,1643` ④ `/docs/software/lesson-activities`, `/docs/admin/billing-upgrade`, `/docs/admin/account-verification`, `/docs/admin/storage-management` ⑤ [게시일]

**Q6. 기존 LMS 나 학원 관리 시스템과 연동되나요?**
① 단계별로 연동한다. 1단계 앱 푸시로 안내·알림 정리, 2단계 데이터 구독과 코스·수업 정보 조회 API, SDK·가상계정·수업 중계는 공식 API 문서 기준 별도 설계. 결제·오프라인 출결·고급 리포트는 기존 시스템과 역할을 먼저 나눈다.
② API 활성화(관리자 [계정 정보] > API 도킹), 데이터 구독 범위, 호출 주체, 개발·운영 책임, 개인정보 동의. 지원 LMS 제품명은 근거 확인 전까지 쓰지 않는다.
③ `lib/classin-positioning.ts:25-31`, `lib/docs.ts:438-460,3060-3068` ④ `/docs/admin/admin-operation-standardization`, `/resources/academy-data-automation-brief`, 공식 API 문서 ⑤ [게시일]

선행 정정(§1-2·§3): LMS 제품명, 녹화 외부 다운로드 차단·워터마크, 2주 무료 체험, 도입 기간 라벨, 플랜명, 환율, "30일 만족 보장"(`components/product/hw/ValueAnchor.tsx:170`).

자료실 PDF 는 이미 `/resources/[slug]` 가 **전 문항을 HTML 로 렌더**한다(요약이 아니라 전문). 다만 그 페이지가 noindex 이고 `/resources` 허브가 sitemap 에 없었다. 허브는 이번에 sitemap 에 넣었고(§11), 상세 페이지 색인 여부(이메일 게이트 유지 vs HTML 공개)는 결정 사항이다(§9 D6). 비교 워크시트에는 실제 비교 매트릭스 표가 없고 `checklistBullets` 는 어디서도 렌더되지 않는다.

---

## 7. P2 — canonical·저자·사이트맵·RSS

| 항목 | 조사 결과 | 조치 | 상태 |
|---|---|---|---|
| `/blog` 허브 | `app/blog/page.tsx:8-24` 직접 metadata → canonical·og:image 없음 | `createPublicMetadata` + RSS alternates 유지 | 반영 |
| `/docs`, `/docs/[category]` | canonical·og:image 없음, `?q=` 색인 가능(`SEARCH_CHIPS` 내부 링크 5개, WebSite SearchAction 도 `/docs?q=`). title 에 "\| Classin 가이드" 가 템플릿과 이중 접미사 | `createPublicMetadata`, `q` 있으면 noindex·follow, SearchAction → `/docs/search` | 반영 |
| `?q=a&q=b` 배열 TypeError | `docs/page.tsx:115`, `[category]/page.tsx:101`, `search/page.tsx:24`(10-26 점검 미수정) | 공용 `readQuery` | 반영 |
| 문서 상세 | canonical 있음, og:url·og:image·twitter:image 없음 | 기본 OG 추가 | 반영 |
| 문서 `shouldIndex = !doc.noindex`(`[slug]/page.tsx:59`) | `visibility: unlisted` 문서도 색인 가능(채널톡 동기화 draft 가 unlisted+noindex:false) | 정책 결정 뒤 `visibility === "public"` 조건 추가 | 사람 확인(§9 D7) |
| 행사 상세 og:image | 행사 이미지 없으면 없음 | 기본 OG 폴백 | 반영 |
| 블로그 Article author | `lib/seo.ts:207` 항상 Person. 저자 컬럼은 자유 텍스트(`blog_posts.author_name`), 유형 컬럼 없음. 네이버 이관 23편 "ClassIn Korea 팀", WordPress 이관분은 개인명 | 팀명 패턴이면 Organization, 아니면 Person. 장기 `author_type` 컬럼 | 반영(패턴) / 사람 확인(컬럼) |
| 블로그 `datePublished` | `published_at` null 이면 생략(화면은 `created_at` 폴백 → 불일치). 이관 글의 `published_at` 이 원본일인지 10-26 인지 미확인 | 운영 DB 조회(§9 SQL) | 사람 확인 |
| 사이트맵 누락 | `/resources`, `/download`, `/events/videos/[slug]` | 추가(lastmod 근거 없는 것은 생략) | 반영 |
| 사이트맵 lastmod 10-26 군집 | 블로그 `updated_at` 은 `supabase/migrations/20260610_blog_posts_backfill_schema.sql:62-73` 트리거가 **모든 UPDATE 에 무조건** 갱신. 10-26 은 네이버 이관 23편 일괄 다듬기·영문 슬러그·공개(42−19=23 일치) → **실제 개정일이라 날짜는 정확**. 앞으로 featured·공개 토글(`app/admin/blog/page.tsx:291,299,308`)만 해도 바뀌는 것이 문제 | 옵션 A `content_updated_at` 컬럼(본문·제목·요약·SEO·대표 이미지 변경 시만) 권장, 옵션 B 트리거 `IS DISTINCT FROM`. 마이그레이션 + 백필 | 사람 확인(플랫폼·콘텐츠) |
| 문서 lastmod | `last_reviewed_at ?? published_at ?? updated_at`(`lib/docs-content.ts:282`). `patchDocsArticle` 은 `last_reviewed_at` 을 갱신하지 않아 **반대로 낡는다** | 본문 수정 시 갱신 또는 "검토 완료" 동작 분리 | 사람 확인 |
| 정적 lastmod | `app/sitemap.ts:9-32` 하드코딩(`/updates`·`/about`·`/contact` 04-01 정체), 카테고리 허브 05-20 | `/docs`·카테고리 허브는 문서 updatedAt 최댓값으로 계산 | 반영 |
| RSS | `lastBuildDate`·`ttl` 없음, 50편 상한, `updated_at` 미반영, 스크립트 공개 시 revalidate 미호출(최대 1시간 지연) | lastBuildDate·ttl 추가 | 반영 |
| robots | `Disallow: /api` 가 `/api/og/blog/[slug]` OG 폴백 이미지도 차단 | `Allow: /api/og/` | 반영 |
| 문서 fallback | `lib/docs.ts:102-152` 정적 `docsCategories` 에 `updates` 없음 → Supabase 장애 시 `/docs/updates/*` 404 | 카테고리 추가 | 반영 |

---

## 8. 계측 — GA4·GTM·네이버

### 8-1. 현황(코드)

| 도구 | 로더 | ID | 로드 조건 | HTML 에 안 보이는 이유 |
|---|---|---|---|---|
| Consent 기본값 | `app/layout.tsx:59-61` beforeInteractive | — | 전 경로, 기본 denied | 이것만 HTML 에 있음 |
| Google Ads gtag | `components/GoogleAdsScript.tsx`, `AppChrome.tsx:130` | `AW-18252550128` 하드코딩(`lib/analytics-config.ts:24`) | 동의 게이트 밖, `/admin` 만 제외 | `dynamic(..., {ssr:false})` |
| GA4 | 별도 로더 없음. Ads 로더 인라인에 `gtag('config', G-…, {send_page_view:false})` | `NEXT_PUBLIC_GA4_MEASUREMENT_ID`(없으면 `NEXT_PUBLIC_GA_ID`) | 위와 같음(동의 전 고급 모드 핑) | 같음. G- ID 는 JS 청크 안 문자열 |
| GTM | `components/GTMScript.tsx` | `NEXT_PUBLIC_GTM_ID` | `/admin`·`/checkout`·`/receipt` 제외, 동의 게이트 없음 | 같음 |
| 네이버 wcs | `components/NaverAnalyticsScript.tsx` | `NEXT_PUBLIC_NAVER_WCS_ID` | 마케팅 동의 후. `inflow()` 미호출 가능성 [추정] | 같음 + 동의 전 DOM 없음 |
| Meta / 카카오 | `MetaPixelScript.tsx` / `AnalyticsProviders.tsx` | `NEXT_PUBLIC_META_PIXEL_ID` / `NEXT_PUBLIC_KAKAO_PIXEL_ID` | 마케팅 동의 후 | 같음 |
| 정적 랜딩 `/l/*` | AppChrome 미경유 | — | GA4·GTM·동의 배너 없음. `omo1` 은 무동의 AW(10-26 P0-4 잔존) | — |
| 소유확인 메타 | 없음 | — | — | — |

제안서의 "동의 후 idle 마운트라서" 가설은 절반만 맞다. idle 마운트는 챗봇·모바일 CTA 뿐이고 GA4·GTM·Ads 는 동의도 idle 도 없이 하이드레이션 직후 클라이언트에서 렌더된다. **Vercel 빌드 시점에 `NEXT_PUBLIC_*` 가 비어 있었다면 JS 에도 ID 가 없다** — 운영 env 와 재빌드 여부를 먼저 확인한다.

### 8-2. page_view 와 이벤트

- page_view: `PageViewTracker` 가 내비게이션 1회당 1회. **확정 중복 1건**: 중복 키에 동의 플래그가 들어 있어 동의를 바꾸는 순간 같은 페이지에서 다시 보냈다(이번에 제거). 나머지 중복 가능성은 GTM 컨테이너 안 GA4 태그·GA4 향상된 측정(history) 등 저장소 밖 설정이다(§8-4).
- `trackEvent` 는 dataLayer push 와 `gtag('event')` 를 둘 다 한다 → GTM 에 GA4 이벤트 태그가 있으면 모든 이벤트가 2회 갈 수 있다. GA4 로더를 하나로 정해야 한다(D8).
- 권장 7개 이벤트 대응

| 권장 | 조사 시점 | 이번 반영 |
|---|---|---|
| generate_lead(form_type, 서버 성공 직후 1회) | `submit_demo_request → generate_lead` 5곳 있으나 `stored` 미확인·`form_type` 없음·재시도 중복 방지 없음. 서버 MP 도 같은 이름을 보내 이중 집계 | `trackLeadSubmitted`(stored=false 차단, dedupeKey 1회, form_type contact/demo/event/showroom/checkout_request). 서버 MP 는 미수정(D9) |
| contact_start / showroom_start | 없음(click_cta 대용) | 폼 첫 포커스 1회 |
| click_to_call / click_email | 없음(`tel:` 은 `Footer.tsx:80` 뿐, 계측 없음) | 문서 위임 리스너, 번호·주소 값 미전송 |
| file_download | 소개서 Notion 클릭만(실제 파일 아님, Meta 에는 Lead 로 매핑돼 부풀림). 실제 PDF 다운로드는 내부 DB 만 | 실제 다운로드 시점에 `download_materials`(asset_id) |
| pricing_view | 없음(`/pricing` click_cta 뿐, 시뮬레이터 계측 없음) | `/pricing` 레이아웃 트래커(pricing_surface) |

### 8-3. 개인정보·URL

- 폼 입력값(이름·전화·이메일·내용)은 이벤트 파라미터로 가지 않는다(5곳 확인).
- 대신 **URL 로 샌다**(10-26 P0-5, HEAD 미수정이었음): `page_location` 이 `location.href` 그대로라 `/contact?prefill=<챗봇 초안>`, `/unsubscribe?email=`, `/checkout/success?checkoutToken&paymentKey`, `/share/quote/[token]` 이 구글로 갔다. 이번에 추적 제외 경로와 URL 정화(허용 파라미터 `utm_*`·`gclid`·`gbraid`·`wbraid`·`fbclid`·`msclkid`·`n_*`)를 넣었다(§11).
- 남은 것: `app/api/track/event/route.ts:97-101` PII 정규식이 `%40` 인코딩 이메일을 못 잡음, `lib/marketing-attribution.ts:77-86` 가 동의와 무관하게 전체 href 를 localStorage 에 저장(Meta CAPI `event_source_url`), 지도 iframe `referrerPolicy`, 10-26 P0-4/6/8.

### 8-4. 운영자 콘솔 체크리스트(코드 밖)

| 도구 | 할 일 |
|---|---|
| Vercel | `NEXT_PUBLIC_GA4_MEASUREMENT_ID`, `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_NAVER_WCS_ID`, `NEXT_PUBLIC_NAVER_LEAD_CONVERSION_TYPE`, `NEXT_PUBLIC_GOOGLE_ADS_DEMO_CONVERSION_LABEL`, (신규) `GOOGLE_SITE_VERIFICATION`, `NAVER_SITE_VERIFICATION` 확인 뒤 **재빌드**. 확인: 네트워크 탭 `gtm.js?id=`, `g/collect?…tid=G-`, `wcslog.js` |
| GSC | DNS TXT 로 도메인 속성(classin.co.kr) 확인 권장(GA/GTM 확인 방식은 서버 HTML 에 스니펫이 없어 실패 가능). `/sitemap.xml` 제출. `/docs?q=…` 색인 URL 목록 확인 뒤 재수집. 홈·`/product/sw`·`/pricing`·`/faq`·Zoom 글 URL 검사 |
| 네이버 서치어드바이저 | 사이트 등록 → HTML 태그 값을 `NAVER_SITE_VERIFICATION` 에 넣고 배포(또는 HTML 파일 업로드) → `/sitemap.xml`, `/blog/rss.xml` 제출 → 사이트 진단 |
| GA4 | 향상된 측정의 "브라우저 기록 기반 페이지 변경"·"양식 상호작용" OFF(접수 실패도 form_submit 으로 집계됨), Data redaction 에 이메일과 쿼리 `prefill, email, token, checkoutToken, paymentKey, orderId`, `generate_lead` 주요 이벤트 지정, 맞춤 측정기준 `form_type`·`lead_source`·`pricing_surface`·`link_location`(이벤트 범위), 원치 않는 추천(toss, tosspayments, nid.naver.com, kauth.kakao.com, accounts.google.com), 내부 트래픽 필터, DebugView 로 접수 1건당 generate_lead 1회 확인, Search Console 연결 + 라이브러리에서 컬렉션 게시 |
| GTM | 컨테이너 점검: 같은 G- 의 Google 태그(All Pages)·History Change 트리거·동의 설정 없는 비구글 태그. Tag Assistant 로 page_view 횟수 |
| Google Ads | gtag 전환 라벨과 GA4 가져온 generate_lead 를 둘 다 "기본 전환" 으로 두면 이중 집계 |
| 네이버 애널리틱스·검색광고 | 공통키 발급, 전환 유형 `test_` 접두로 테스트 뒤 접두 제거, 검수 신청 |
| 법무 | 개인정보처리방침(`app/privacy/page.tsx`, 2026-06-14) 쿠키·제3자(Google Ads·네이버·Meta CAPI·Solapi·WeCom) 목록 갱신(10-26 §2-1) |

---

## 9. 결정·확인 대기

| # | 결정 | 누가 | 무엇을 |
|---|---|---|---|
| D1 | 홈 title 방향(A 진단안 / B 범주어 유지)과 description "요금 상담" 문구 | SEO 담당 + 브랜드 오너 + 영업 | §4-2. 결정 뒤 가이드 §11 에 "클래스인 Classin" 병기 허용 한 줄 추가 |
| D2 | 정율 사례 50% vs 3주→3일, "원장 김O준" vs 곽정율, 실명·인용 동의 | 해당 고객 담당 영업/CS | §1-1 |
| D3 | Zoom 비교 기준일·요금제별 기능, 비교광고 법무 검토 | 마케팅 + 법무 | §2 |
| D4 | 성능 수치(100ms·99.9%) SLA 근거, 국가·언어 수, 2,400+·200+·98%·1,560,000·Acadsoc·287 | EEO 본사 기술팀, CRM·마케팅 데이터 소유자 | §1-2. 없으면 삭제 |
| D5 | 국내 가격: 통화·부가세·정기결제·계정 정의·Enterprise 공개·요금표 기준일, 무료 체험 조건, 회신 SLA("당일" vs "1영업일") | 한국 법인 사업·재무, 영업/CS 리드 | §3 |
| D6 | 자료실 상세(`/resources/[slug]`) 색인 여부와 PDF 직접 접근(현재 `storagePath` 전부 빈값이라 정적 PDF 가 열림) | 마케팅 | §6 끝 |
| D7 | 문서 `unlisted` 색인 정책, `value-and-cost-framing` 공개 전환 | 콘텐츠 | §7 |
| D8 | GA4 로더 단일화(gtag 직접 vs GTM 단독), 동의 모드 기본/고급(10-26 D1) | 마케팅 + 개발 | §8-2 |
| D9 | 서버 MP generate_lead 유지 여부(브라우저와 이중 집계) | 마케팅 + 개발 | `lib/server/lead-capture.ts:687-711` |
| D10 | 블로그 `content_updated_at` 컬럼(옵션 A) vs 트리거 조건(옵션 B), 문서 `last_reviewed_at` 갱신 규칙 | 플랫폼 + 콘텐츠 | §7 |
| D11 | 홈 ProblemCost·Outcomes·SatisfyingClass 수치 출처, LogoBar 34개 기관 동의, 후기 별점 근거, ScienceBased 인용, "유니콘" 실증자료 | 마케팅(최초 반입 `fb5f79f` 작성자), 영업·CS, 법무 | §1-3 |
| D12 | 정본 도메인(`classin.co.kr` vs `llms.txt`·데이터 삭제 안내의 `classin.ai.kr`), JSON-LD `sameAs` 공식 URL 목록, `foundingDate` 표기 | 인프라·마케팅·경영지원 | §4 |
| D13 | 하이브리드 수업 가이드 1편 신규 작성 여부(의도 2 의 유일한 공백) | 콘텐츠 + 제품 | §5-2 |

운영 DB 에서 바로 확인할 수 있는 것(읽기 전용):

```sql
-- 10-26 군집이 정확히 23편인지, 이관 글 published_at 상태
select date_trunc('day', updated_at) d, count(*) from blog_posts
 where status = 'PUBLISHED' and deleted_at is null group by 1 order by 1;
select slug, author_name, created_at, published_at, updated_at from blog_posts
 where status = 'PUBLISHED' and deleted_at is null order by updated_at desc;
-- 저자 분포(팀명 vs 개인명)
select author_name, author_role, count(*) from blog_posts
 where status = 'PUBLISHED' and deleted_at is null group by 1, 2;
-- Zoom 2편의 라이브 slug 와 lead_magnet_slug
select slug, title, lead_magnet_slug from blog_posts
 where status = 'PUBLISHED' and (title ilike '%zoom%' or title ilike '%줌%');
```

---

## 10. 실행 순서(진단서 90일 로드맵에 대응)

| 기간 | 작업 | 담당 | 완료 기준 |
|---|---|---|---|
| 이번 커밋 | §11 기술 항목(허브 canonical·noindex, 저자 유형, 사이트맵·RSS·robots, Organization 보강, 소유확인 env 슬롯, 내부 링크, generate_lead·보조 이벤트·URL 정화) | 개발 | typecheck·eslint·vitest 통과, 운영 배포 뒤 `view-source` 로 canonical·JSON-LD 확인 |
| 1주 | Vercel env·재빌드, GSC DNS TXT, 서치어드바이저 등록·태그 env 배포, sitemap·RSS 제출, GA4 설정(§8-4) | 마케팅 + 개발 | 두 콘솔에서 사이트맵 "성공", DebugView 에서 generate_lead 1회 |
| 1~2주 | D2·D3·D4·D5 확인 → `/product/sw` 수치·Zoom·가격·CTA·연동·녹화 문구 수정, 홈 수치 정리 | 제품·영업·법무 + 콘텐츠 + 개발 | 상업 페이지에 근거 없는 수치 0건, 가격 캡션·기준일 노출 |
| 3~4주 | D1 결정 → 홈 title·description·OG 이미지·llms.txt, WebPage name; FAQ Q1~Q6 게시(§6 초안, 검토일 포함); `/pricing` 조건 블록; contact topics 추가 | 브랜드·콘텐츠 + 개발 | 홈 첫 화면에서 대상·기능·적용 범위가 읽힘, `/faq` JSON-LD 에 6개 반영 |
| 2개월 | 허브 5개 정비(`/product/sw`·`/pricing`·`/faq`·`/docs/start`·`/resources`): 의도별 링크 묶음(§5-2), 중복 쌍 정본 지정, 블로그 `lead_magnet_slug` 연결, Zoom 글 2편 범위 한정 + 검토일, 하이브리드 가이드 1편(D13) | 콘텐츠 | 5개 페이지에 같은 답변 형식·검토일 적용 |
| 2개월 | D10 마이그레이션(`content_updated_at` 또는 트리거), 문서 `last_reviewed_at` 규칙, `shouldIndex` visibility | 플랫폼 + 콘텐츠 | sitemap lastmod 가 본문 변경일만 반영 |
| 3개월 | GSC·서치어드바이저 검색어별 노출·클릭, GA4 generate_lead(form_type 별)·pricing_view→문의 전환, 동일 질문 AI 테스트 반복("학원 결석생에게 녹화 수업을 제공하려면?", "클래스인과 Zoom 차이는?", "학원 전자칠판 도입 시 확인할 점은?") | 마케팅 + 영업 | 기준선 대비 변화 보고, 후속 과제 |

월간 지표는 진단서 §7 을 그대로 쓴다(비브랜드 노출·클릭·CTR, 색인 상태, generate_lead form_type 별 건수, AI 브랜드 언급·출처 링크·정확성, 모바일 LCP·INP·CLS).

---

## 11. 이번에 반영한 것

두 커밋으로 나눴다. 1차는 콘텐츠·홈 파트(메타·구조화 데이터·사이트맵·링크), 2차는 그로스 파트(계측). 마케팅 문구·수치·가격·제목 문구는 한 글자도 바꾸지 않았다.

### 11-1. 콘텐츠 파트(1차 커밋)

| 파일 | 변경 |
|---|---|
| `app/docs/_utils.tsx` | `readQuery`(배열 `q` 안전 처리), `withSearchNoIndex`(쿼리 있으면 `index:false, follow:true`) 공용 헬퍼 |
| `app/docs/page.tsx`, `app/docs/[category]/page.tsx` | `createPublicMetadata` 로 canonical(쿼리 제거)·og:image·twitter 출력, `?q=` 는 noindex·follow, 카테고리 title 의 "\| Classin 가이드" 이중 접미사 제거, 본문도 `readQuery` 사용 |
| `app/docs/search/page.tsx` | `readQuery` 사용(배열 TypeError 회귀 방지) |
| `app/docs/[category]/[slug]/page.tsx` | og:url·og:image·twitter:image 추가(type article·robots 분기 유지) |
| `app/blog/page.tsx` | `createPublicMetadata` 기반 canonical·og:image + RSS alternates 유지 |
| `app/events/[slug]/page.tsx` | 행사 이미지 없을 때 기본 OG 폴백 |
| `app/sitemap.ts` | `/resources`(monthly 0.7)·`/download`(weekly 0.8) 추가(근거 날짜 없어 lastmod 생략), `/events/videos/[slug]` 추가, `/docs`·카테고리 허브 lastmod 를 문서 updatedAt 최댓값으로, 문서 항목은 `canonicalPath` 우선, URL 중복 제거 |
| `app/blog/rss.xml/route.ts` | `<lastBuildDate>`·`<ttl>60</ttl>`, pubDate 는 publishedAt → createdAt 폴백 |
| `lib/blog-types.ts`, `lib/repositories/blog.ts` | 사이트맵·RSS 용 매퍼에만 `createdAt` 노출 |
| `app/robots.ts` | 모든 규칙에 `Allow: /api/og/`(OG 폴백 이미지 크롤 허용) |
| `lib/docs.ts` | 정적 `docsCategories` 에 `updates` 복원(DB 시드 값 그대로). 부수 효과: `/docs/updates` 허브와 사이드바 "업데이트" 그룹이 정적 모드에서도 보이고, 2026-05-14 마이그레이션의 `/docs/updates → /docs/start` 301 행은 더 이상 조회되지 않는다(`/updates` 페이지가 이미 `/docs/updates/*` 를 링크하고 있었다) |
| `tests/docs/search-query.test.ts`, `tests/seo/content-hub-seo.test.ts` | 회귀 테스트 |

### 11-2. 홈 파트(1차 커밋)

| 파일 | 변경 |
|---|---|
| `lib/seo.ts` | `createPublicMetadata` 에 `absoluteTitle` 옵션(탭 제목과 og/twitter 제목 동일화). Organization 에 `alternateName`(클래스인·ClassIn)·`legalName`·`address`(푸터 공개값)·`description`. WebSite `alternateName`, SearchAction → `/docs/search?q=`. `isOrganizationAuthor` 로 Article author 를 Organization/Person 분기. `createSiteVerification` |
| `app/page.tsx` | 홈 제목을 `absoluteTitle` 로 한 번만 지정(문구 동일) |
| `app/layout.tsx`, `.env.local.example` | `GOOGLE_SITE_VERIFICATION`·`NAVER_SITE_VERIFICATION` → `metadata.verification`(값 없으면 태그 없음) |
| `components/sections/Footer.tsx` | `/pricing`("요금 안내"), `/resources`("자료실") |
| `components/sections/FinalCTA.tsx` | `/pricing`, `/faq` |
| `app/pricing/page.tsx` | 하단 "더 확인하기": `/faq`, 요금 FAQ 문서, `/pricing/simulator`, `/showroom` |
| `app/faq/page.tsx` | 상단: 22질문 문서, `/pricing`, `/contact#contact-form` |
| `app/product/sw/page.tsx` | FAQ 섹션 아래 `/faq`·`/pricing` 링크(문구·수치 무변경) |
| `app/product/hw/page.tsx` | 하드웨어 FAQ 문서·`/faq` 링크 |
| `tests/seo/seo-jsonld.test.ts`, `tests/seo/internal-doc-links.test.ts` | JSON-LD·메타·링크 대상 문서 실존 테스트 |

### 11-3. 그로스 파트(2차 커밋)

| 파일 | 변경 |
|---|---|
| `lib/tracking-paths.ts`(신규) | 추적 경계 정본. `isTrackingExcludedPath`(`/admin` 느슨 매칭 + `/share` `/unsubscribe` `/account` `/auth` `/login` `/signup` `/forgot-password` `/receipt` 경로 경계 매칭, `/checkout` 은 결제 전환 때문에 제외하지 않음), `sanitizeTrackingUrl`/`sanitizeTrackingPath`(허용 파라미터 `utm_*` `gclid` `gbraid` `wbraid` `fbclid` `msclkid` `n_*` 만, 값이 이메일이면 버림), `sanitizeTrackingTarget`(`tel:`·`mailto:` 는 스킴만), `stashContactPrefill`/`takeContactPrefill`(sessionStorage, 30분) |
| `components/AppChrome.tsx`, `GoogleAdsScript.tsx`, `GTMScript.tsx`, `MetaPixelScript.tsx`, `NaverAnalyticsScript.tsx`, `AnalyticsProviders.tsx` | 제외 경로를 한 함수로 통일. gtag 는 config 앞에 `gtag('set', {page_location, page_referrer})` 로 정화 주소를 고정(config 파라미터는 소프트 내비의 `set` 을 덮으므로 쓰지 않음). 마케팅 동의 게이트는 그대로 |
| `components/PageViewTracker.tsx` | 중복 키에서 동의 플래그 제거(동의 변경 시 GA4 page_view 재발화 금지, 내부 적재만 재전송). 내비마다 `gtag('set', …)` 뒤 `page_title`·`page_location`·`page_referrer` 명시. `path` 는 정화값 |
| `lib/analytics.ts` | `trackLeadSubmitted({formType, source, dedupeKey, stored})` — `stored === false` 면 미전송, `classinkr.leadTracked.<key>` 로 1회(sessionStorage 불가 시 메모리). Ads 전환도 같은 중복 방지 안. `trackFormStart`(form_type 별 탭 세션 1회). GA4 로 가는 파라미터를 allowlist 로 선별(`lead_id`·`stored`·`title`·`referrer` 등 제외), generate_lead 에 `form_type`·`lead_source`. `submit_newsletter` form_type 은 없으면 source 로 추론. `trackEvent` 3번째 인자 `{skipMarketingPixels}`. 내부 적재 fetch `referrer` 정화 |
| `app/api/track/event/route.ts` | ALLOWED_EVENTS 에 `contact_start` `showroom_start` `click_to_call` `click_email` `pricing_view`, 파라미터 키에 `form_type` `lead_source` `link_location` `pricing_surface` `page_path` |
| `app/contact/page.tsx`, `components/sections/DemoModal.tsx`, `components/events/EventSignupModal.tsx`, `components/showroom/ShowroomBookingForm.tsx`, `components/checkout/CheckoutRequestForm.tsx` | 리드 성공 발화를 `trackLeadSubmitted` 로(form_type contact / demo / event / showroom / checkout_request, dedupeKey conversionEventId·leadId·bookingId·requestId). contact·쇼룸은 첫 포커스에 `contact_start`/`showroom_start`, DemoModal 은 자동 포커스 때문에 첫 입력·포인터로 |
| `app/contact/page.tsx` 추가 | prefill 을 sessionStorage 우선, 구 `?prefill=` 도 읽은 뒤 `history.replaceState` 로 제거. 전화번호를 `tel:` 링크로(`data-track-location="contact_page"`) |
| `components/ui/FloatingChatbot.tsx` | `/contact?prefill=` 대신 `stashContactPrefill` |
| `components/ContactLinkTracker.tsx`(신규) | 문서 단위 캡처 클릭으로 `tel:`/`mailto:` → `click_to_call`/`click_email`(`link_location`, `page_path` 만, 번호·주소 미전송) |
| `components/PricingViewTracker.tsx`(신규), `app/pricing/layout.tsx` | `pricing_view`(`pricing_surface` = pricing / pricing_simulator / pricing_simulator_krw) |
| `app/resources/[slug]/ResourceDownloadForm.tsx`, `components/blog/LeadMagnetGate.tsx` | 실제 다운로드 시작 직후 `download_materials{asset_id, lead_magnet, gate, source, page_path}`(픽셀 미전송 — Meta `Lead` 이중 방지). `submit_newsletter` 에 form_type, `stored === false` 면 미전송 |
| `tests/lib/tracking-paths.test.ts`, `tests/lib/analytics-lead-tracking.test.ts`, `tests/lib/tracking-surfaces.test.ts`, `tests/api/track-event.test.ts`, `tests/admin/admin-gtag-scope.test.ts` | 신규·갱신 |

남은 위험(코드 밖 또는 범위 밖): 서버 MP generate_lead 와 이중 집계(D9), 허용 파라미터가 아닌 쿼리만 바뀔 때(`?category`, `?q`) page_view 가 나가지 않음, Meta·네이버·카카오 픽셀은 `location.href` 를 스스로 읽음, 서버 측 Referer·CAPI `event_source_url` 은 전체 URL, gtag.js 는 로드 뒤 제외 경로로 소프트 이동해도 남음(향상된 측정 OFF 필요). 제품 페이지 소개서 클릭(`download_materials`)이 Meta `Lead` 로 가는 기존 매핑은 유지했다(운영 결정).

---

## 12. 조사 방법과 한계

- 읽기 전용 조사 에이전트 6개: `/product/sw`(Opus), 홈 메타·수치(Sonnet), canonical·저자·lastmod(Sonnet), GA4·GTM·네이버(Opus), FAQ·요금·내부링크(Haiku), 콘텐츠 인벤토리(Haiku). 구현 에이전트 3개: 콘텐츠(Sonnet), 홈(Sonnet), 그로스(Opus). 메인 세션이 보고를 교차 확인하고 문구·범위를 정했다.
- 운영 사이트·GSC·GA4·운영 DB·Vercel env 는 접근하지 못했다. [운영] 은 10-26 점검 인용이고, 나머지는 코드(`6a08b84`)와 저장소 문서 기준이다.
- 블로그 본문 정본은 Supabase 라 저장소 스냅샷(2026-06-21 DRAFT)과 라이브(10-26 재발행)가 다를 수 있다. Zoom 글 인용은 스냅샷·구 원고 기준이다.
- Zoom 의 현재 기능·요금제, Ebbinghaus·Freeman 인용 정확성, 제목 잘림 길이는 저장소 밖 지식이라 [추정]이다.
- 기능 인벤토리 대조는 키워드 검색 수준이라 "미발견" 이 "없음" 을 뜻하지는 않는다.
