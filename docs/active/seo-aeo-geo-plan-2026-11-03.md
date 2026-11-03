# SEO·AEO·GEO 개선안 — 현황 대조와 실행 목록 (2026-11-03)

- 기준: `origin/main` `5c719c25`, 운영 사이트 classin.co.kr(10-30 배포본) 실측
- 선행 문서: [SEO·AEO 워크리스트](./seo-aeo-improvement-worklist-2026-10-28.md)(분류·D1~D13·90일 순서의 정본), [콘솔 런북](./seo-analytics-console-runbook-2026-10-28.md)
- 이 문서는 워크리스트 이후 **새로 찾은 것**과 **이번 PR 범위**만 적는다. 워크리스트의 결정 번호(D1~D13)를 그대로 쓴다.
- 승인(2026-11-03): 묶음 1·2·3 전부 승인. N1 허용 유지, N2 네이버 블로그 + classin.com, N3~N5 는 결정 목록에만 둔다. 구현 결과는 §5.

## 0. 현황 — 이미 된 것과 남은 것

### 운영에서 확인된 것(148개 URL 전수, 2026-11-03)

| 항목 | 결과 |
|---|---|
| canonical | 148/148 자기 주소. 불일치 0 |
| H1 | 148/148 정확히 1개 |
| og:image | 147/148 (행사 1건만 없음) |
| 이미지 alt | 909/912 |
| 홈 제목·설명 | D1 A안 반영(`클래스인 Classin \| 학원 전자칠판·수업 녹화·운영 플랫폼`) |
| 구조화 데이터 | Organization·WebSite 전 페이지, FAQPage(`/faq` 21문항·`/product/ai-report` 7문항), SoftwareApplication, Product, BlogPosting, Article, Event, BreadcrumbList |
| robots | `/admin` `/api`(OG 이미지 제외) `/checkout` `/receipt` `/unsubscribe` 차단, AI 크롤러 허용 |
| 사이트맵 | 148개 URL, 전부 lastmod 있음 |
| Lighthouse SEO 점수(모바일) | 홈·제품 2종·요금 모두 100 |

워크리스트 §11(1~5차 커밋)은 전부 `main` 에 있고 운영에도 나가 있다. 단 `20261028_blog_posts_content_updated_at.sql` 운영 DB 적용 여부는 이 세션에서 확인하지 못했다.

### 워크리스트에서 아직 남은 것

- **사람 확인:** D2(정율 사례 수치), D3(Zoom 비교 기준일), D4(성능·규모 수치 근거), D5(국내 가격 조건), D6(자료실 상세 색인), D7(문서 unlisted 색인), D11(홈 수치 출처), D13(하이브리드 가이드). D8·D9 는 GA4 세션이 정리 중.
- **코드 가능인데 보류된 것:** SoftwareApplication 가격을 `plans.ts` 에서 파생, `/product/sw` FAQ 문구(Zoom 단정·LMS 제품명·녹화 다운로드·2주 체험), FAQ 다음 행동 링크, 헤더 `/pricing` 링크, 플랜명·환율 상수 단일화, CTA 3갈래.
- **D12(정본 도메인):** 사실상 결정됨 — `classin.ai.kr` 은 `classin.co.kr` 로 308 리다이렉트한다. `public/llms.txt` 만 옛 도메인을 쓴다.

### 이번에 새로 찾은 것

| # | 발견 | 근거 |
|---|---|---|
| F1 | **`/faq` 답변 21개가 HTML 에 없다.** 질문만 있다. 하드웨어·사용법 탭은 질문조차 없다(활성 탭만 렌더). Radix 아코디언은 닫힌 항목의 자식을 렌더하지 않는다(`forceMount` 를 줘도 `isOpen && children`). JS 를 실행하지 않는 AI 크롤러는 답을 못 읽는다 | 운영 `/faq` 본문 텍스트 1,005자, `@radix-ui/react-collapsible` 1.1.12 |
| F2 | `llms.txt` 링크 8개가 전부 `classin.ai.kr`(리다이렉트), 영어, 회사 사실·FAQ 없음 | `public/llms.txt` |
| F3 | 문서 제목 77개가 `… \| ClassIn 가이드 \| Classin` 으로 브랜드가 두 번 붙는다. 관리자가 적은 검색 제목에 이미 접미사가 있는데 루트 템플릿이 또 붙인다. 강사·학생 "프로필 설정" 은 제목이 똑같다 | 운영 스캔 |
| F4 | 문서가 0건인 가이드 허브 6개(`/docs/quick-start` `guides` `help` `manual` `troubleshooting` `board`)가 사이트맵에 있다(본문 800자 남짓) | 운영 스캔 |
| F5 | 행사 3건 description 이 비어 있고 1건은 6자. 문서 1건 15자 | 운영 스캔 |
| F6 | `www.classin.co.kr` 이 DNS 에 없다(접속 불가) | `dig` |
| F7 | `classin.co.kr` TXT 레코드 0개 — GSC 소유 확인 전 | `dig` |
| F8 | 모바일 LCP(Lighthouse, 로컬 측정) 홈 7.1s · `/product/sw` 9.5s · `/product/hw` 13.6s · `/pricing` 5.2s. CLS 0, TBT 낮음. `/product/hw` 는 화면 아래 영상(3MB)을 자동재생이라 처음부터 받는다. 구글 태그 JS 약 630KB(Ads 태그 `AW-18252550128` 이 두 번 받아지는 것으로 보인다 — 직접 로드 + `&cx=c` 로드) | Lighthouse 12.8 |
| F9 | `/product/sw` FAQ 답변은 HTML 에 있어 크롤러가 읽는데, 근거 없는 단정이 그대로다(Zoom "기능이 없다", Google Classroom·Canvas·Moodle 연동, 외부 다운로드 차단·워터마크, 녹화본 저작권 단정, 2주 무료 체험) | `app/product/sw/page.tsx` FAQS |
| F10 | `/pricing` 은 구조화 데이터가 없고 description 이 "합리적인 가격으로 학원 운영의 모든 것을 해결" — `honestLimit` 과 어긋난다 | `app/pricing/layout.tsx` |
| F11 | Organization 에 `sameAs`·`foundingDate`·`parentOrganization` 이 없다. 브랜드 정본(company-facts §1)은 한국 법인 2022-10 설립, 모회사 EEO 를 ✅ 확정으로 둔다 | `lib/seo.ts` |
| F12 | `/product/hw` 한 카드에 "20+ 강의 도구" 와 "30+ 수업 도구" 가 같이 나온다. `/product/sw` "12개 언어"(company-facts △ 미확정, 공식 5개) | 페이지 소스 |

## 1. 개선안 — 영향 큰 순

크기: S = 반나절 이하, M = 하루. "승인" 은 문구를 사용자가 확인해야 한다는 뜻.

### 묶음 1 — 문구 승인 없이 할 수 있는 코드(권장: 이번 PR)

| ID | 영역 | 작업 | 크기 | 기대 효과 | 사용자 몫 |
|---|---|---|---|---|---|
| B1 | AEO | `/faq` 를 네이티브 `<details>` 로 바꿔 21개 답변과 세 탭 전부를 HTML 에 싣는다. 질문마다 앵커 id(`/faq#…`)를 준다. 겉모습은 그대로 | M | **가장 큼.** AI 답변 엔진·검색이 답 본문을 읽고 인용한다. 질문 단위 링크가 생긴다 | 없음 |
| C1 | GEO | `llms.txt` 를 정본(포지셔닝·회사 팩트 ✅·공개 FAQ)에서 만드는 라우트로 바꾼다. classin.co.kr, 한국어, 핵심 페이지·답변·정직한 한계·출처 표기 | S | AI 가 브랜드를 정본대로 요약. 다시는 도메인·문구가 따로 놀지 않는다 | 없음 |
| A1 | 기술 | 문서 제목 접미사 중복 제거(77건) + 같은 제목 문서는 카테고리로 구분 | S | 검색 결과 제목이 잘리지 않고, 중복 제목 신호 제거 | 없음 |
| A2 | 기술 | 문서 0건인 허브를 사이트맵에서 빼고 noindex | S | 빈 페이지 6개 색인 제거 | 없음 |
| A3 | 기술 | 행사·문서 description 이 짧거나 없으면 제목·일시·장소로 폴백 | S | 검색 스니펫 품질 | 없음 |
| C2 | GEO | Organization 에 `foundingDate`(2022-10)·`parentOrganization`(EEO)·`sameAs`(네이버 블로그 `classinkorea`, classin.com) | S | 지식 그래프·AI 엔티티 연결 | sameAs 목록 확인(유튜브·카카오 채널 등 추가할 주소) |
| C3 | GEO | robots 의 AI 크롤러 정책을 명시: 검색·답변용(OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User)과 학습용(GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot) | S | 정책 명확화. 지금도 전부 허용이라 동작은 같다 | 학습용 봇 허용 여부 결정 |
| A4 | 기술 | SoftwareApplication 가격을 `plans.ts` 에서 파생(하드코딩 제거), 단위·URL 정리 | S | 가격 변경 시 구조화 데이터 표류 방지 | 없음 |
| A6 | CWV | `/product/hw` 아래쪽 영상을 화면 근처에서만 재생·다운로드 | S | 첫 로드 3MB 절감, LCP 경쟁 제거 | 없음 |
| A7 | 기술 | 사이트맵 정적 페이지 lastmod 를 실제 마지막 내용 변경일(git)로 갱신 | S | lastmod 신뢰도 | 없음 |
| C5 | GEO | 코드 안 옛 도메인 링크(`lib/docs.ts` omo1 안내) 정리 | S | 정본 도메인 일관성 | 없음 |

### 묶음 2 — 새 FAQ 2문항(승인 필요)

| ID | 작업 | 크기 | 기대 효과 |
|---|---|---|---|
| B2 | `/faq` 소프트웨어 탭에 2문항 추가(아래 초안). FAQPage JSON-LD·llms.txt 에 자동 반영 | S | 워크리스트 우선 질문 Q5(결석 녹화)·Q1(대상·범위)의 공백을 메운다 |

**Q. 결석한 학생에게 녹화 수업을 제공할 수 있나요?**
가능합니다. 교사가 수업 녹화를 켜 두면 끝난 수업을 학생이 다시보기로 볼 수 있고, 결석 보강용으로는 녹화 수업 활동을 코스에 올려 시청 마감일과 확인 과제를 함께 붙일 수 있습니다. 학생별 시청 횟수와 완료율도 기록됩니다. 녹화는 유료 요금제 결제와 계정 인증을 마친 학원에서 교사로 등록된 계정만 켤 수 있습니다. 녹화본은 학원 스토리지 용량에 포함되며, 자동 삭제는 기본으로 꺼져 있어 관리자가 [저장 설정]에서 보관 기간을 정합니다. 무료 제공 용량은 요금제·계약마다 달라 상담에서 확인합니다.
(근거: `lib/docs.ts` 녹화 수업 활동·계정 인증·저장 설정 문서)

**Q. Classin은 어떤 학원에 맞나요?**
수업 품질과 운영을 강사 개인이 아니라 학원의 기준으로 관리하려는 원장·운영 책임자에게 맞습니다. 한국 학원에서는 대면 수업 교실에 전자칠판·녹화·수업 관리부터 들이는 경우가 가장 많고, 학생이 개인 기기를 쓰지 않는 교실에서도 판서·녹화·다시보기만으로 결석 보강과 복습 자료가 생깁니다. 강사와 반이 많거나 여러 지점을 운영할수록 효과가 커집니다. 결제, 오프라인 출석, 고급 경영 리포트는 기존 시스템이나 API 연동으로 역할을 나누는 편이 정직합니다.
(근거: `lib/classin-positioning.ts` primaryAudience·localReality·honestLimit, `lib/docs.ts` 도입 순서 문서, brand-canon what-is-classin §8)

### 묶음 3 — 제품 페이지 문구·제목(승인 필요)

| ID | 작업 | 크기 | 기대 효과 |
|---|---|---|---|
| B3 | `/product/sw` FAQ 4문항을 정본 문구로 교체하고 FAQPage JSON-LD 추가(아래) | S | 틀릴 수 있는 사실이 AI 답변에 인용되는 위험 제거 + 제품 페이지 답변 노출 |
| C4 | `/product/sw` "12개 언어" 삭제(160+개국만, EEO 공식 기준 표기), `/product/hw` "20+ 강의 도구" → "30+ 수업 도구" | S | 표시광고 위험 축소, 같은 카드 안 모순 제거 |
| A5 | `/pricing` description 교정 + WebPage·Breadcrumb JSON-LD | S | 요금 검색 스니펫이 정직해진다 |
| K1 | 제품 페이지 제목에 국내 검색어 반영(아래) | S | "전자칠판"(월 1천~1만)·"학원 lms" 류 검색어와 제목 일치. 네이버 비중이 커서 한글 일반어가 앞에 와야 한다 |

B3 교체 문구

- Zoom 비교 → "Zoom은 화상회의 중심 도구이고, Classin은 수업 전 준비부터 실시간 판서, 녹화, LMS, 관리자 데이터까지 수업 운영을 잇는 구조입니다. 실시간 연결만 필요하면 Zoom으로 충분할 수 있고, 수업 뒤 복습·과제·출결 기록까지 한 흐름으로 남겨야 한다면 Classin이 맞습니다."
- 기존 시스템 연동 → 공개 FAQ 와 같은 단계별 연동 문구(`apiStages`). 제품명(Google Classroom·Canvas·Moodle) 삭제.
- "녹화본의 저작권은 누가 갖나요?" → 질문을 "수업 녹화본은 어떻게 관리되나요?" 로 바꾸고: "녹화본은 학원 코스 안에서 학생이 다시보기로 보고, 관리자는 콘솔에서 열람하거나 내려받습니다. 보관 기간과 자동 삭제는 관리자가 저장 설정에서 정합니다. 콘텐츠 소유권처럼 계약에 걸린 사항은 도입 상담에서 확인해 주세요." (브랜드 정본 §9: 소유권 단정 금지)
- 요금제 → "Standard·Plus는 계정당 월 요금제로 이 페이지 요금표에 있고, Enterprise와 전자칠판·설치가 들어가는 구성은 학원 규모에 맞춰 견적을 드립니다. 체험 가능 여부와 조건은 도입 상담에서 안내합니다." ("2주 무료 체험" 삭제 — 정책 문서 없음)

A5 `/pricing` description → "Classin 소프트웨어 Standard·Plus 계정당 요금과 충전형 결제, 전자칠판·설치가 포함된 맞춤 견적을 한곳에서 확인하세요. 최종 금액은 결제·상담 단계에서 확정됩니다."

K1 제목 후보

| 페이지 | 지금 | 제안 |
|---|---|---|
| `/product/hw` | Classin Board 전자칠판 \| Classin | 학원 전자칠판 Classin Board — 판서·AI 카메라 녹화 \| Classin |
| `/product/sw` | Classin 소프트웨어: 수업·과제·AI 채점 \| Classin | 학원 수업 관리·LMS Classin 소프트웨어 — 수업·과제·AI 채점 \| Classin |
| `/pricing` | 요금제 \| Classin | 클래스인 요금제·도입 견적 \| Classin |

### 이번 PR 에서 하지 않는 것

- **홈(`/`)**: PR #54 가 통째로 다시 쓴다. 홈 답변 블록·LCP(히어로 진입 애니메이션이 텍스트 LCP 를 늦춤)는 #54 병합 뒤 다시 잰다.
- **계측 파일**(`lib/analytics*.ts`, `app/contact/page.tsx`, `lib/marketing/server-conversions.ts`): PR #52·#56·#57·#58 영역.
- **HowTo 스키마**: 구글이 2023-09 리치 결과를 없앴다. 문서 단계는 이미 HTML 본문에 있어 추가 효과가 작다.
- **IndexNow**(빙·네이버 즉시 색인 알림): 효과는 있지만 공개 키 파일 + 글 저장 시 알림 코드가 콘텐츠 파트에 걸린다. 후속 작업으로 둔다.
- **LCP 전면 개선**: 공용 CSS 렌더 차단(약 630ms)·구글 태그 무게는 PR #28(성능)·GA4 세션과 겹친다. 이번에는 A6 만 한다.

## 2. 사람이 할 일

| 순서 | 할 일 | 누가 | 메모 |
|---|---|---|---|
| 1 | GSC 소유 확인 TXT 를 `classin.co.kr` DNS 에 **추가**(기존 레코드 유지) → 확인 → `https://classin.co.kr/sitemap.xml` 제출 → URL 검사 5개(홈·`/product/sw`·`/pricing`·`/faq`·Zoom 비교 글) | DNS 담당 + 마케팅 | 런북 §3 |
| 2 | `www.classin.co.kr` CNAME 을 Vercel 로 걸고 Vercel 프로젝트 도메인에 추가(→ apex 308) | DNS 담당 | 지금은 접속 불가 |
| 3 | 네이버 서치어드바이저 등록 → `NAVER_SITE_VERIFICATION` Vercel env → 재배포 → 소유 확인 → 사이트맵·`/blog/rss.xml` 제출 | 마케팅 + 개발 | 런북 §4. 국내 검색 비중상 GSC 다음 우선 |
| 4 | Bing Webmaster Tools 에서 "Google Search Console 에서 가져오기" | 마케팅 | 빙 색인은 ChatGPT 검색·Copilot 의 근거다. GSC 확인 뒤 5분 |
| 5 | (선택) Daum 웹마스터도구 등록 | 마케팅 | robots.txt 에 PIN 한 줄 방식. 값을 주면 코드로 넣는다 |
| 6 | 이 PR 과 #54 병합 뒤 Promote to Production, 블로그 `content_updated_at` 마이그레이션 적용 확인(`npm run check:db`) | 개발 | 운영 배포는 사용자 실행 |
| 7 | GSC 의 Core Web Vitals·페이지 경험 보고서로 실사용자 LCP 기준선 기록(28일 뒤) | 마케팅 | 로컬 Lighthouse 는 참고치 |
| 8 | 월 1회 AI 답변 점검: "학원 결석생 녹화 수업 제공 방법", "클래스인과 Zoom 차이", "학원 전자칠판 도입 시 확인할 점" 을 ChatGPT·Perplexity·네이버 큐에 넣고 브랜드 언급·출처 링크·정확성 기록 | 마케팅 | 런북 §9 |

## 3. 결정할 것

| # | 결정 | 기본안 |
|---|---|---|
| N1 | ~~AI 학습용 크롤러 허용~~ **결정됨(11-03): 허용 유지** | `app/robots.ts` 에 봇 이름을 명시해 반영 |
| N2 | ~~Organization 공식 채널~~ **결정됨(11-03): 네이버 블로그 + classin.com** | 네이버 블로그는 `sameAs`, classin.com 은 모회사 EEO 의 사이트라 `parentOrganization.url` 로 실었다(같은 법인이 아니므로). 유튜브·카카오 채널·인스타그램 공식 주소가 생기면 `ORGANIZATION_SAME_AS` 에 추가 |
| N3 | `/product/hw` LatencyProof "Classin Board 30ms / 일반 IFP 80~120ms" — 규격서는 응답 속도 2ms, 경쟁 수치 출처 없음 | 근거 확보 전까지 섹션 숨김 또는 출처 표기 |
| N4 | `/product/hw` "30일 만족 보장" — 정책 문서 없음 | 정책이 없으면 삭제 |
| N5 | `/product/sw` CTA "지금 무료로 시작하기"·"무료 체험 시작"(결제 플래그 OFF 일 때 문의로 감) | "도입 상담 받기" 로 교체 |
| — | 워크리스트 D2~D7·D11·D13 | 워크리스트 §9 그대로 |

## 4. 다른 세션에 넘긴 것

- 구글 Ads 태그(`AW-18252550128`) JS 가 한 페이지에서 두 번 받아진다(`gtag/js?id=AW-…` 와 `…&cx=c&gtm=…`, 각 167KB). GTM 컨테이너(`GTM-PJH3SWVL`) 안 Ads 태그와 겹치는지 GA4·Ads 정비 세션이 확인할 몫으로 공유 노트에 남겼다.

## 5. 이번 PR 에서 구현한 것

| ID | 파일 | 변경 |
|---|---|---|
| B1 | `components/sections/FAQ.tsx` | Radix 아코디언 → 네이티브 `<details>`(같은 탭 안에서 하나만 열림, `name`). 탭은 `forceMount` + 비활성 탭 CSS 숨김. 질문마다 `id`, `/faq#<id>` 로 들어오면 해당 탭·질문을 연다. 겉모습(글자·여백·색) 유지. 한 칸 레이아웃(모바일)에서 왼쪽 제목이 `sticky` 로 답변을 덮던 것을 데스크톱 전용(`md:sticky`)으로 |
| B1·B2 | `lib/public-faq.ts` | 질문마다 고정 `id`(바꾸지 않는다), 신규 2문항 `who-is-it-for`·`absent-student-recording`. FAQPage JSON-LD·llms.txt 에 자동 반영(21 → 23문항) |
| C1 | `lib/llms-txt.ts`, `app/llms.txt/route.ts`, `public/llms.txt` 삭제 | 정본(포지셔닝·company-facts 수치·공개 FAQ)에서 빌드 때 생성. classin.co.kr, 한국어, 질문별 출처 링크, 단정 금지 항목 |
| C2 | `lib/seo.ts` | Organization `foundingDate`·`sameAs`·`parentOrganization` |
| C3 | `app/robots.ts` | 검색·답변용 6종과 학습용 5종을 한 규칙에 이름으로 명시(전부 허용) |
| A4 | `lib/seo.ts` | `createSoftwareOffersJsonLd` — `plans.ts` 셀프서브 플랜에서 low/high/offerCount 파생, URL `/pricing` |
| A1·A3 | `app/docs/_utils.tsx`, `app/docs/[category]/[slug]/page.tsx` | `buildDocSeoTitle`(브랜드 접미사 제거 + "문서명 — 카테고리 \| Classin"), `buildDocMetaDescription`(40자 미만이면 문서 요약으로) |
| A2 | `app/docs/[category]/page.tsx`, `app/sitemap.ts` | 공개 문서 0건인 허브는 noindex·follow, 사이트맵 제외 |
| A3 | `lib/public-event-dates.ts`, `app/events/[slug]/page.tsx` | `buildPublicEventMetaDescription` — 40자 미만이면 제목·일정·장소 문장 덧붙임 |
| A7 | `app/sitemap.ts` | 정적 페이지 lastmod 를 파일의 마지막 내용 변경일로 |
| B3 | `lib/product-sw-faq.ts`, `app/product/sw/page.tsx`, `app/product/sw/layout.tsx` | FAQ 6문항을 공용 모듈로 옮기고 4문항 정본 문구로 교체, FAQPage JSON-LD 추가 |
| C4 | `app/product/sw/page.tsx`, `app/product/hw/page.tsx` | "12개 언어" 삭제(160+개국 · EEO 공식 기준), "20+ 강의 도구" → "30+ 수업 도구" |
| A5·K1 | `app/pricing/layout.tsx`, `app/pricing/pricing-copy.ts`, `app/pricing/page.tsx`, `app/product/{sw,hw}/layout.tsx` | 요금·제품 제목과 설명 교체, `/pricing` WebPage·Breadcrumb JSON-LD |
| A6 | `app/product/hw/page.tsx` | 아래쪽 자동재생 영상은 화면 300px 앞에서만 `src` 를 준다 |
| C5 | `lib/docs.ts` | omo1 안내 링크 classin.ai.kr → classin.co.kr |
| — | `lib/blog-ai-prompts.ts` | `COMPANY_SCALE`·`COMPANY_SCALE_SOURCE` export(llms.txt 재사용, 값 무변경) |
| 테스트 | `tests/seo/aeo-geo-surfaces.test.tsx`, `tests/seo/seo-jsonld.test.ts`, `tests/seo/content-hub-seo.test.ts` | FAQ 23문항 답변이 서버 HTML 에 있는지, 앵커 고유성, llms.txt 도메인·출처, sw FAQ 금지어, 제목·설명 폴백, Organization·가격 파생, robots AI 봇, 빈 허브 사이트맵 제외 |

배포 뒤 확인: `view-source:https://classin.co.kr/faq` 에서 답변 문장 검색, `https://classin.co.kr/llms.txt`, 문서 상세 `<title>`, `/sitemap.xml` 에 빈 허브 없음, GSC URL 검사로 `/faq` 렌더링 HTML 확인.

PR #54(홈 개편)와 겹치는 파일: `app/pricing/page.tsx`·`app/product/{sw,hw}/page.tsx`·`app/docs/[category]/page.tsx`·`app/docs/[category]/[slug]/page.tsx`·`app/events/[slug]/page.tsx`. 이 PR 의 변경은 문구·메타데이터 줄이라 #54 의 색 토큰 변경과 줄이 거의 겹치지 않는다. 나중에 병합하는 쪽이 충돌을 푼다.
