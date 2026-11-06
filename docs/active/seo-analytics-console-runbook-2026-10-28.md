# 검색·분석 콘솔 실행 런북 — GSC · 네이버 서치어드바이저 · GA4 · GTM · Vercel (2026-10-28)

- 상태: **실행 대기**. 코드 쪽 준비는 끝났다([SEO·AEO 워크리스트](seo-aeo-improvement-worklist-2026-10-28.md) §11).
- 대상: 각 콘솔의 관리자 권한을 가진 마케팅 담당과, 환경변수·배포를 맡는 개발 담당.
- 소유: 마케팅/그로스/CRM 파트([playbook/04-growth-crm.md](playbook/04-growth-crm.md)) + 홈 파트([playbook/01-home-front.md](playbook/01-home-front.md))
- 선행 문서: 광고 전환(네이버 검색광고·Google Ads 라벨)은 [광고 채널 활성화 런북](ad-channel-activation-runbook-2026-09-14.md)이 정본이다. 여기서는 겹치는 부분을 다시 쓰지 않고 링크만 건다.

**이 문서가 있는 이유:** 외부 설정 제안서는 "무엇을 하라"까지만 있다. 이 저장소에서는 그 설정이 **어느 환경변수·어느 코드 경로에 걸리는지**, 그리고 **무엇을 보면 켜진 걸 아는지**가 정해져 있다. 단계마다 그것을 같이 적는다.

**원칙 — 새로 만들기 전에 기존 것을 찾는다.** GA4 속성·GTM 컨테이너·네이버 계정이 이미 있을 수 있다. 같은 사이트에 태그가 두 벌 돌면 페이지뷰·문의가 두 배로 잡히고, 그 뒤로는 어떤 숫자도 믿을 수 없다.

---

## 0. 순서

| 순서 | 단계 | 담당 | 걸리는 시간 |
|---|---|---|---|
| 1 | 기존 계정·태그 조사(§1) | 마케팅 | 반나절 |
| 2 | Vercel 환경변수 확인·재빌드(§2) | 개발 | 1시간 + 배포 |
| 3 | Google Search Console 도메인 속성(§3) | 마케팅 + DNS 담당 | DNS 전파 포함 하루 |
| 4 | 네이버 서치어드바이저(§4) | 마케팅 + 개발(메타태그 배포) | 반나절 |
| 5 | GA4 설정(§5) | 마케팅 | 2시간 |
| 6 | GTM 컨테이너 점검(§6) | 마케팅 + 개발 | 1시간 |
| 7 | Google Ads 전환 정리(§7) | 마케팅 | 30분 |
| 8 | 검증(§8)과 기준선 확보(§9) | 마케팅 + 개발 | 배포 뒤 1주 |

§2 가 끝나야 §3~§5 의 "확인" 이 가능하다. §3 의 DNS TXT 는 전파 시간이 있으니 먼저 걸어 두고 다른 단계를 진행한다.

---

## 1. 기존 계정·태그 조사

새 속성·컨테이너를 만들기 전에 다음을 표로 적는다.

| 항목 | 어디서 보나 | 적을 것 |
|---|---|---|
| GA4 속성 | analytics.google.com → 관리 → 데이터 스트림 → 웹 | 측정 ID `G-…`, 스트림 URL 이 classin.co.kr 인지, 최근 48시간 데이터 유무 |
| GTM 컨테이너 | tagmanager.google.com | 컨테이너 ID `GTM-…`, 안에 든 태그 목록(특히 GA4 구성 태그·History Change 트리거) |
| Google Ads | ads.google.com → 목표 → 전환 | 전환 액션 목록, gtag 라벨, "GA4 에서 가져온 전환" 유무 |
| Search Console | search.google.com/search-console | classin.co.kr 속성 존재 여부(도메인 속성인지 URL 접두 속성인지) |
| 네이버 서치어드바이저 | searchadvisor.naver.com | 사이트 등록 여부, 소유 확인 방식 |
| 네이버 애널리틱스·검색광고 | analytics.naver.com, searchad.naver.com | 공통키(`wcs_add["wa"]`), 전환 유형 문자열 |
| Vercel | vercel.com → 프로젝트 → Settings → Environment Variables | §2 의 변수 중 Production 에 값이 있는 것 |

운영 사이트에서 지금 무엇이 도는지는 브라우저로 확인한다(개발자 도구 → Network, 새 시크릿 창):

- `gtm.js?id=GTM-…` 요청 → GTM 이 켜져 있음
- `g/collect?…tid=G-…` 요청 → GA4 가 켜져 있음(동의 전에는 `gcs=G100` 핑만 나간다)
- `wcslog.js` 요청 → 네이버 로그분석이 켜져 있음(마케팅 동의 뒤에만)
- 콘솔에서 `window.google_tag_manager` → 로드된 컨테이너 ID 목록

**원본 HTML(`view-source:`)에는 이 ID 들이 안 보인다.** 로더가 전부 클라이언트 전용(`ssr:false`)이라 정상이다. 보이지 않는다고 "미설치"로 판단하지 않는다.

---

## 2. Vercel 환경변수와 재빌드

`NEXT_PUBLIC_*` 는 **빌드할 때 값이 박힌다.** 변수를 넣거나 바꾼 뒤에는 반드시 다시 빌드·배포해야 한다(값만 저장하면 아무 일도 안 일어난다).

| 변수 | 값의 출처 | 없으면 어떻게 되나 |
|---|---|---|
| `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | GA4 웹 스트림 측정 ID `G-…` | GA4 로 아무것도 안 간다(Google Ads 태그만 돈다) |
| `NEXT_PUBLIC_GTM_ID` | GTM 컨테이너 ID `GTM-…` | GTM 이 안 뜬다. §6 결정에 따라 비워 둘 수도 있다 |
| `GOOGLE_SITE_VERIFICATION` | §3 에서 HTML 태그 방식을 택했을 때의 content 값 | 메타태그가 안 나간다(DNS TXT 방식이면 불필요) |
| `NAVER_SITE_VERIFICATION` | §4 서치어드바이저가 준 `naver-site-verification` content 값 | 메타태그가 안 나간다 |
| `NEXT_PUBLIC_NAVER_WCS_ID` | 네이버 애널리틱스 공통키 | 네이버 로그분석·전환이 안 돈다 |
| `NEXT_PUBLIC_NAVER_LEAD_CONVERSION_TYPE` | 네이버 검색광고 전환 유형 문자열 | 리드 전환이 네이버로 안 간다([활성화 런북](ad-channel-activation-runbook-2026-09-14.md) §4) |
| `NEXT_PUBLIC_GOOGLE_ADS_DEMO_CONVERSION_LABEL` | Google Ads 전환 액션 라벨(AW- 접두 제외) | Ads 전환이 안 나간다(같은 런북 §3) |
| `GA4_MEASUREMENT_ID`, `GA4_API_SECRET` | 측정 ID `G-6MWTJ8C0L2`(웹 스트림과 같은 값)와 Measurement Protocol API 비밀(관리 → 데이터 스트림 → 웹 → Measurement Protocol API 비밀). 서버 전용 — `NEXT_PUBLIC_` 아님 | 리드 품질 이벤트(`qualify_lead`·`close_convert_lead`)가 안 나간다. 접수 이벤트(`generate_lead`)는 이 변수와 무관하게 브라우저만 보낸다 — **마이그레이션 적용·코드 배포 뒤에 넣는다(§5-6)** |

- **2026-10-30 확인(Vercel API)**: 운영에 있는 것은 `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GOOGLE_ADS_DEMO_CONVERSION_LABEL`, `NEXT_PUBLIC_SUPABASE_URL` 뿐이다. `NEXT_PUBLIC_GA4_MEASUREMENT_ID`, `GOOGLE_SITE_VERIFICATION`, `NAVER_SITE_VERIFICATION`, `NEXT_PUBLIC_NAVER_WCS_ID`, `NEXT_PUBLIC_NAVER_LEAD_CONVERSION_TYPE` 은 아직 없다(= GA4 로 아무것도 안 가고, 소유확인 메타태그도 안 나간다). `GA4_MEASUREMENT_ID`·`GA4_API_SECRET` 은 그때 결정대로 비어 있었다 — 2026-11-02 코드 변경(서버 MP 는 리드 품질 이벤트만) 뒤에는 §5-6 순서대로 넣는다.
- 소유확인 값(`*_SITE_VERIFICATION`)은 비밀이 아니다(페이지 소스에 그대로 노출된다). 값이 비어 있으면 태그 자체를 내보내지 않는다(`app/layout.tsx` → `createSiteVerification`).
- 운영 배포는 main push 가 아니라 Promote to Production 이다(AGENTS.md "인프라 현황"). 재빌드 뒤 라이브에서 §8 을 돈다.

---

## 3. Google Search Console

### 3-1. 속성 확인 — 도메인 속성 + DNS TXT 권장

1. 기존 `classin.co.kr` 속성이 있으면 그대로 쓴다. URL 접두 속성(`https://classin.co.kr/`)만 있다면 도메인 속성을 추가로 만든다.
2. 속성 추가 → **도메인** → `classin.co.kr` → Google 이 주는 TXT 레코드를 DNS 에 **추가**한다(기존 TXT 는 지우지 않는다).
3. 전파 뒤 "확인".

왜 DNS 인가: "Google 애널리틱스/태그 관리자로 확인" 방식은 서버 HTML 에 스니펫이 있어야 하는데 이 사이트는 클라이언트에서 늦게 붙여서 실패할 가능성이 높다. HTML 태그 방식을 쓰려면 `GOOGLE_SITE_VERIFICATION` 에 content 값을 넣고 재배포한 뒤 확인을 누른다. `classin.com` 은 별도 도메인이라 이 속성에 포함되지 않는다.

### 3-2. 사이트맵 제출

```
https://classin.co.kr/sitemap.xml
```

이미 제출돼 있으면 중복 제출 대신 상태가 "성공"인지, 발견된 URL 수가 사이트맵 항목 수와 맞는지 본다. 사이트맵은 1시간마다 다시 만들어지고, 어드민에서 글을 저장하면 즉시 갱신된다.

### 3-3. URL 검사(우선 5개)

| 순위 | URL | 보는 이유 |
|---|---|---|
| 1 | `https://classin.co.kr/` | 새 제목·설명·Organization 구조화 데이터 반영 |
| 2 | `https://classin.co.kr/product/sw` | 핵심 제품·도입 정보 |
| 3 | `https://classin.co.kr/pricing` | 가격 탐색(이제 푸터·홈에서 링크됨) |
| 4 | `https://classin.co.kr/faq` | 구매 전 질문(FAQPage 구조화 데이터) |
| 5 | Zoom 비교 글 — `https://classin.co.kr/blog` 목록에서 "줌이 맞을까" / "Zoom이면 충분할까요" 글의 현재 주소 | 비교 검색 수요(저장소에는 라이브 slug 가 없다) |

각 URL 에서 색인 여부, 수집 차단 여부, Google 이 선택한 대표 URL 이 canonical 과 같은지, 수정 내용 반영 여부를 본다. 수정한 페이지는 "색인 생성 요청"을 누른다(검토 요청일 뿐 보장은 아니다).

### 3-4. `?q=` 변종 정리

색인 → 페이지에서 `/docs?q=` 또는 `/docs/start?q=` 로 시작하는 URL 이 보이면 이제 noindex·follow 이므로 다시 수집되면서 빠진다. 많이 남아 있으면 상위 몇 개만 URL 검사로 재수집을 요청한다.

### 3-5. 매주 볼 보고서

실적 → 검색결과, 기간 3개월, 국가 = 대한민국. 검색어를 네 묶음으로 나눠 본다.

| 묶음 | 예 | 해석 |
|---|---|---|
| 브랜드 | 클래스인, Classin | 기존 수요 |
| 기능 탐색 | 학원 전자칠판, 수업 녹화 | 문제 해결 수요(새 제목이 겨냥하는 묶음) |
| 비교 | 클래스인 줌 비교 | 검토 단계 |
| 구매 | 클래스인 가격, 클래스인 도입 | 상담에 가까운 수요 |

제목·설명을 바꾼 뒤 4주 이상은 묶음별 노출·CTR 추이만 보고 다시 바꾸지 않는다.

---

## 4. 네이버 서치어드바이저

1. 회사 네이버 계정으로 로그인 → 웹마스터 도구에서 기존 등록 여부 확인.
2. 없으면 `https://classin.co.kr` 등록 → 소유 확인 방식에서 **HTML 태그** 선택 → 발급된 `<meta name="naver-site-verification" content="…">` 의 content 값을 `NAVER_SITE_VERIFICATION` 에 넣고 재배포 → 라이브 `view-source:https://classin.co.kr/` 에서 메타태그가 보이는지 확인 → 서치어드바이저에서 "소유 확인".
   - HTML 파일 방식으로 이미 인증돼 있을 수 있으니 새로 등록하기 전에 기존 계정을 확인한다.
3. 요청 → 사이트맵 제출: `https://classin.co.kr/sitemap.xml`
4. 요청 → RSS 제출: `https://classin.co.kr/blog/rss.xml` (최근 50편, `lastBuildDate` 포함)
5. 검증 → URL 검사: §3-3 의 5개 URL. 문제가 있거나 중요한 수정이 있을 때만 요청 → 웹페이지 수집 요청.
6. 리포트 → 사이트 진단: 수집 제한 URL, 색인 제외 원인, 제목·설명 반영 상태를 정기적으로 본다.

소유 확인과 제출은 노출을 보장하지 않는다. 수집·색인 상태는 리포트에서 확인한다. 네이버 검색 로봇(Yeti)은 `robots.txt` 에서 허용돼 있다.

---

## 5. GA4

### 5-1. 데이터 스트림

관리 → 데이터 스트림 → 웹 → `classin.co.kr` 스트림의 측정 ID 가 `NEXT_PUBLIC_GA4_MEASUREMENT_ID` 와 같은지 확인한다. 다르면 코드가 아니라 **변수**를 맞춘다.

### 5-2. 향상된 측정 — 세 가지를 끈다

스트림 → 향상된 측정 → 톱니.

| 항목 | 끄는 이유 |
|---|---|
| 브라우저 기록 이벤트 기반 페이지 변경 | 사이트가 소프트 내비게이션마다 직접 `page_view` 를 보낸다. 켜 두면 두 번 집계되고, 자동 이벤트는 URL 정화를 거치지 않는다 |
| 파일 다운로드 | 사이트가 실제 자료 다운로드 시점에 `file_download` 를 보낸다. 켜 두면 소개서 링크 클릭이 중복되고 링크 URL 이 그대로 실린다 |
| 양식 상호작용 | 자동 `form_submit` 은 접수 실패에도 집계된다. 사이트는 서버가 접수 성공을 돌려준 뒤에만 `generate_lead` 를 보낸다 |

스크롤·이탈 클릭·동영상·사이트 검색은 그대로 둬도 된다(사이트 검색은 `/docs/search?q=` 가 noindex 라도 GA4 에는 검색어가 남는다 — 필요 없으면 끈다).

### 5-3. 데이터 수정(Data redaction)

스트림 → 데이터 수정: "이메일" 켜기, "URL 쿼리 매개변수" 에 다음을 넣는다.

```
prefill, email, token, checkoutToken, paymentKey, orderId, q
```

코드가 이미 허용 파라미터(`utm_*`, `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `n_*`) 외의 쿼리를 지우고 보내지만, 자동 수집 이벤트와 과거 데이터를 위해 콘솔에서도 건다.

### 5-4. 맞춤 측정기준(이벤트 범위)

관리 → 맞춤 정의 → 맞춤 측정기준 만들기. 범위는 전부 **이벤트**.

| 측정기준 이름 | 이벤트 매개변수 | 어디에 쓰나 |
|---|---|---|
| 문의 유형 | `form_type` | generate_lead 를 contact / demo / event / showroom / checkout_request 로 나눔. newsletter / resource / lead_magnet / event_alert 도 같은 키 |
| 리드 소스 | `lead_source` | 폼이 보낸 `source` 값(어느 화면·캠페인에서 왔는지) |
| 리드 종류 | `lead_type` | demo_request / newsletter (기존 값, 호환용) |
| 연락 위치 | `link_location` | click_to_call / click_email 이 어느 영역의 링크였는지(footer, header, contact_page …) |
| 요금 화면 | `pricing_surface` | pricing / pricing_simulator / pricing_simulator_krw |
| 페이지 경로 | `page_path` | 보조 이벤트의 발생 경로(정화된 pathname) |

### 5-5. 주요 이벤트(key event)

관리 → 이벤트 → `generate_lead` 를 주요 이벤트로 지정한다. 브라우저 이벤트 중에서는 **이것 하나만** 지정한다. `contact_start`, `showroom_start`, `click_to_call`, `click_email`, `pricing_view`, `file_download` 는 퍼널 분석용 보조 이벤트로 두고 주요 이벤트로 올리지 않는다(버튼 클릭을 성과로 세지 않기 위해).

서버가 보내는 리드 품질 이벤트 `qualify_lead`·`close_convert_lead`(§5-6)도 주요 이벤트다 — 2026-11-02 기준 속성에 이미 만들어 두었다.

### 5-6. 서버 Measurement Protocol — 리드 품질 이벤트만 보낸다(2026-11-02)

Google Ads 가 폼 제출 수가 아니라 **좋은 리드**에 맞춰 입찰하도록, 영업 단계가 바뀌면 서버가 MP 로 GA4 권장 리드 이벤트를 보낸다. 서버 MP 는 **브라우저가 보낼 수 없는 이 두 이벤트만** 보낸다.

| 이벤트 | 언제 나가나 | 거는 자리 |
|---|---|---|
| `qualify_lead` | 리드 상태가 `converted`(전환 — 고객·거래로 전환. 단건·단체 전환, 상태 직접 변경 모두) | `updateLead`(`lib/repositories/leads.ts`) |
| `close_convert_lead` | 그 리드가 전환·연결된 고객(`crm_source_links` 확정 lead→customer 링크)의 딜이 `confirmed`(확정 — 오더 승인) 이후 단계(`installation`·`payment`·`closed`)에 닿음 | `updateDeal`(`lib/portal/repositories/deals.ts`) |

- 접수·결제 이벤트(`generate_lead`·`begin_checkout`·`purchase`)는 **브라우저(gtag)만** 보낸다. 예전에는 두 변수가 있으면 서버도 같은 이름을 MP 로 한 번 더 보냈고, GA4 는 `event_id` 로 중복을 걸러 주지 않아 두 배로 잡혔다 — 그래서 변수를 비워 두고 있었다(워크리스트 D9). 이제 `sendServerConversion`(`lib/marketing/server-conversions.ts`)은 Meta CAPI 만 보낸다.
- 매핑 정본은 `lib/marketing/lead-quality-signal.ts` 의 `LEAD_QUALITY_SIGNAL_TRIGGERS` 하나다. 연락중(`contacted`)은 연락 기록일 뿐이라, 딜 계약(`contract`)은 견적에서 계약서 초안을 만든 단계일 뿐이라 넣지 않았다. 리드 `closed` 는 이탈(Compass lost)이다.
  - 결정 대기 대안: qualify 를 더 이르게(딜 `quote` — 견적 단계) / close 를 더 이르게(딜 `contract`, 또는 계약서 서명 완료) / close 를 고객 단위 대신 전환이 만든 딜 하나로 좁히기.
- 결합 키는 제출 때 남긴다: `_ga` 쿠키 client_id → `leads.ga_client_id`, `_ga_6MWTJ8C0L2` 쿠키 세션 ID → `ga_session_id`, 쿠키 동의 마케팅 항목 → `ga_ad_consent`. **쿠키 동의의 분석 항목이 켜진 제출만** 남는다. 그래서 분석 비동의, 이 기능 배포 전 리드, Meta 리드애즈, 도입 신청·쇼룸 예약 미러(요청 쿠키를 넘기지 않는 경로), 재문의 병합(기존 리드 값 유지)은 신호가 나가지 않는다.
- 보내는 본문: `client_id` + `consent.ad_user_data`·`ad_personalization`(`ga_ad_consent`) + 파라미터 `session_id`(있을 때)·`engagement_time_msec: 1`.
- 리드당 이벤트별 한 번: 보내기 전에 `ga_qualify_sent_at`/`ga_close_sent_at` 이 비어 있는 행만 조건부 UPDATE 로 선점한다. GA 가 2xx 가 아닌 응답을 주면 선점을 풀어 다음 같은 전이(예: 확정 → 설치)에서 다시 보낸다. 네트워크 오류·시간 초과는 받았는지 몰라 선점을 유지한다(두 번 세느니 한 번 놓친다).
- 상태 변경 응답을 막지 않는다(응답 뒤 `after()`). 건너뜀·실패는 런타임 로그 `[lead-quality-signal]` 에 리드 id 만 남는다.

켜는 순서(뒤집지 않는다):

1. 마이그레이션 `supabase/migrations/20261102_leads_ga_quality_signals.sql` 을 서울 프로젝트에 적용하고 `npm run check:db` 로 확인한다. 코드보다 늦으면 그 사이 리드의 client_id 가 안 남아 영영 신호를 못 보낸다.
2. 코드 운영 배포(Promote to Production).
3. Vercel Production 에 `GA4_MEASUREMENT_ID=G-6MWTJ8C0L2`, `GA4_API_SECRET` 을 넣고 다시 배포한다. 로컬 `.env.local` 에는 넣지 않는다 — 로컬은 운영 DB 를 보므로 로컬에서 상태를 바꾸면 운영 GA4 로 나간다.
4. 확인한다고 실제 리드를 시험 삼아 전환하지 않는다(되돌릴 수 없다). 영업이 실제로 전환한 뒤 런타임 로그와 GA4 실시간·이벤트 보고서에서 `qualify_lead` 를 본다. Google Ads 로 가져오는 일은 §7.

### 5-7. 그 밖의 설정

- 원치 않는 추천: `toss`, `tosspayments.com`, `nid.naver.com`, `kauth.kakao.com`, `accounts.google.com`(결제·로그인 리다이렉트가 새 세션으로 끊기지 않게).
- 내부 트래픽: 사무실·쇼룸 IP 를 내부 트래픽으로 정의하고 데이터 필터를 "활성".
- 데이터 보관 기간: 14개월.
- Search Console 연결: 관리 → 제품 연결 → Search Console → §3 속성과 웹 스트림 연결 → 보고서 → 라이브러리에서 Search Console 컬렉션 게시. 클릭수(GSC)와 세션수(GA4)는 집계 방식이 달라 같지 않다.

---

## 6. GTM 컨테이너 점검

사이트 코드는 GTM 이 있어도 **GA4 로 직접(gtag) 보낸다.** 그래서 GTM 안에 GA4 가 또 있으면 이중 집계다. 컨테이너를 열어 다음을 본다.

| 확인 | 있으면 |
|---|---|
| 같은 `G-…` 를 쓰는 "Google 태그"(구 GA4 구성 태그)가 All Pages 로 발화 | 둘 중 하나를 없앤다. 권장: GTM 의 GA4 태그를 **일시중지**하고 코드(gtag)만 남긴다. GTM 단독으로 가려면 반대로 `NEXT_PUBLIC_GA4_MEASUREMENT_ID` 를 비우고 dataLayer 이벤트로 GA4 태그를 구성한다(워크리스트 D8 — 둘 중 하나를 문서에 적어 둔다) |
| History Change 트리거로 GA4 page_view 를 보내는 태그 | 끈다(코드가 이미 보낸다) |
| `submit_demo_request`·`submit_newsletter`·`click_cta` 같은 dataLayer 이벤트로 GA4 이벤트 태그를 쏘는 설정 | 코드의 gtag 이벤트와 두 번 간다. 끄거나 코드 쪽을 끈다 |
| 동의 설정 없이 도는 비구글 태그 | 동의 모드(ad_storage/analytics_storage) 요구 조건을 건다 |
| GA4 태그의 page_location 변수 | 코드가 `gtag('set', {page_location})` 으로 정화한 값을 쓰므로, GTM 에서 Page URL 변수를 덮어쓰지 않게 한다 |

점검 뒤 미리보기(Tag Assistant)로 홈 → 제품 → 요금 → 문의 순서로 이동하며 **page_view 가 이동 1회당 1번**인지 센다.

---

## 7. Google Ads

- **계정(2026-11-03 결정)**: 운영 계정은 `395-174-3288`(태그 `AW-18551599540`, PR #52)이다. GA4 속성(`G-6MWTJ8C0L2`)은 395 와 예전 계정 `924-032-2833`(태그 `AW-18252550128`) 둘 다에 연결돼 있다. #52 를 배포할 때 함께 한다:
  1. 924 의 실적 최대화·유튜브 캠페인을 일시중지한다 — 사이트 전환이 395 로 옮겨 가 924 는 전환 신호 없이 돈만 쓴다.
  2. 395 의 "ClassIn KR Web (web) generate_lead"(GA4 가져오기)를 기본 → 보조로 내린다 — 라벨 전환 '도입 상담 신청'·'쇼룸 예약 완료'와 같은 문의가 입찰에 두 번 잡힌다. 배포 전에는 이것이 395 의 유일한 문의 전환이라 그대로 둔다.
- 기본 전환은 하나만: gtag 전환 라벨(`NEXT_PUBLIC_GOOGLE_ADS_DEMO_CONVERSION_LABEL`)로 들어오는 전환과 "GA4 에서 가져온 generate_lead" 를 둘 다 기본 전환으로 두면 입찰에 두 번 반영된다. 라벨 전환을 기본으로, GA4 가져오기는 보조(관찰)로 둔다.
- 라벨 발급·검증 절차는 [활성화 런북](ad-channel-activation-runbook-2026-09-14.md) §3 을 따른다.
- `qualify_lead`·`close_convert_lead`(§5-6)를 GA4 에서 가져올 때: 둘 다 영업 단계가 바뀔 때만 나가서 건수가 적고 클릭보다 며칠~몇 주 늦다. 가져온 전환 액션의 클릭 후 전환 기간(기본 30일)과 GA4 주요 이벤트 전환 확인 기간을 넘기면 광고에 귀속되지 않으니 기간을 길게(최대 90일) 잡는다. 기본·보조 여부는 마케팅이 정한다.

---

## 8. 검증 — 배포 뒤 라이브에서

GA4 → 관리 → DebugView(또는 브라우저 확장 GA Debugger)와 Network 탭을 같이 연다. 새 시크릿 창에서 시작한다.

| 시나리오 | 기대 |
|---|---|
| 홈 첫 진입(동의 전) | GA4 로 쿠키 없는 핑 1회(`gcs=G100`). 쿠키 0개 |
| 동의 "수락" | 같은 화면에서 `page_view` 가 **다시 나가지 않음**(이전 버그 수정됨). 이후 이벤트에 `gcs=G111` |
| 홈 → 제품 → 요금 이동 | 이동 1회당 `page_view` 1회, `page_location` 에 쿼리 없음. `/pricing` 진입 시 `pricing_view{pricing_surface:"pricing"}` 1회 |
| 문의 폼 첫 입력 | `contact_start{form_type:"contact"}` 1회(같은 탭에서 다시 입력해도 재발화 없음) |
| 필수항목 누락 제출 | `generate_lead` 없음 |
| 정상 문의 접수 | `generate_lead{form_type:"contact", lead_source:…}` 1회. 새로고침해도 재발화 없음 |
| 같은 연락처로 60초 안에 재제출 | 서버가 `stored:false` → `generate_lead` 없음 |
| 쇼룸 예약 접수 | `generate_lead{form_type:"showroom"}` 1회 |
| 푸터 전화번호 클릭 | `click_to_call{link_location:"footer"}` — 번호 값은 어디에도 없음 |
| 자료실에서 PDF 받기 | `generate_lead{form_type:"resource"}` 1회 + `file_download{file_name:<slug>}` 1회 |
| `/contact?prefill=테스트` 로 직접 진입 | 주소창에서 쿼리가 즉시 사라지고, GA4 `page_location` 에 `prefill` 없음 |
| `/share/quote/<토큰>` 열기 | gtag·GTM 요청 자체가 없음 |
| 동의 "거절" 뒤 이동 | Meta·네이버·카카오 요청 없음, GA4 는 쿠키 없는 핑만 |

하나라도 어긋나면 코드 문제일 수 있으니 개발 담당에게 시나리오 이름과 Network 스크린샷을 넘긴다.

GA4 숫자와 실제 접수 건수는 광고 차단기·동의 거절 때문에 완전히 같지 않다. 문의 건수의 기준은 CRM(`/admin/crm`)이고, GA4 는 **어느 검색어·콘텐츠가 문의로 이어졌는지** 보는 도구다.

---

## 9. 기준선과 월간 보고

첫 달은 목표를 정하지 말고 기준선만 적는다.

| 영역 | 매월 적을 것 | 어디서 |
|---|---|---|
| 색인 | 주요 URL 5개 색인 여부, 제외 사유 | GSC·서치어드바이저 |
| 검색 수요 | 브랜드·기능·비교·구매 묶음별 노출·클릭·CTR | GSC 실적, 서치어드바이저 |
| 콘텐츠 | 검색 유입 방문 페이지 → 제품·요금·문의로 이동한 비율 | GA4 탐색(경로) |
| 전환 | `generate_lead` 를 `form_type` 별로, `pricing_view` → `generate_lead` 전환율 | GA4 보고서(맞춤 측정기준 적용) |
| 영업 | 유효 문의·상담·계약 건수와 채널 | CRM |
| AEO | 같은 질문 3개("학원 결석생에게 녹화 수업을 제공하려면?", "클래스인과 Zoom 의 차이는?", "학원 전자칠판 도입 시 확인할 점은?")를 ChatGPT 등에 월 1회 넣고 브랜드 언급·출처 링크·정확성 기록 | 수기 표 |
| 속도 | 모바일 LCP·INP·CLS | PageSpeed Insights, GSC Core Web Vitals |

---

## 10. 법무·개인정보 같이 할 것

- 개인정보처리방침(`/privacy`, 최종 2026-06-14)에 쿠키 목록과 제3자(Google Analytics·Google Ads·네이버·Meta CAPI 의 해시 연락처·Solapi·WeCom), 위탁·국외이전, 보호책임자를 보강한다([공개 사이트 점검](public-site-audit-motion-plan-2026-10-26.md) §2-1).
- 자료 다운로드 폼의 묶음 동의(같은 문서 P0-8)와 Meta 철회 처리(P0-6)는 이 런북 범위 밖이며 코드 작업이 따로 필요하다.
