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
| `GA4_MEASUREMENT_ID`, `GA4_API_SECRET` | GA4 Measurement Protocol 비밀키 | 서버 측 generate_lead 가 안 나간다 — **§5-6 결정 전에는 비워 둔다** |

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

`generate_lead` 는 상담뿐 아니라 뉴스레터·자료 신청에도 발화한다. 전체를 상담 전환으로 지정하면 상담 건수가 부풀므로 **GA4 에서 상담용 파생 이벤트를 따로 만든다**. 기존 이벤트명과 광고 발화 코드는 이 작업으로 바꾸지 않는다.

1. 먼저 `form_type` 별 접수와 실제 문의 건수를 대조하고, 영업이 상담으로 셀 유형을 확정한다. 시작 기준은 `contact`, `demo`, `showroom`, `checkout_request` 다. `event` 는 행사 신청, `newsletter`·`resource`·`lead_magnet`·`event_alert` 는 구독·자료 신청이므로 별도로 본다.
2. GA4 관리 → 이벤트 → 이벤트 만들기에서 `sales_lead` 를 생성한다. 조건은 `event_name` 이 `generate_lead` 와 정확히 일치하고, `form_type` 이 정규식 `^(contact|demo|showroom|checkout_request)$` 에 일치하는 것이다. 원본 매개변수를 복사하도록 설정한다. 최종 유형이 달라지면 조건도 함께 수정한다.
3. DebugView에서 상담과 쇼룸 예약 각각에 `generate_lead` 및 `sales_lead` 가 1회씩 나타나고, 뉴스레터·자료·행사 신청에는 `sales_lead` 가 없는지 확인한다. 파생 이벤트는 설정 이후의 이벤트에만 적용된다.
4. Google Ads 가져오기·기존 입찰 목표와 현재 주요 이벤트 설정을 먼저 조사한다. 확인 후 `sales_lead` 를 주요 이벤트로 지정하고 `generate_lead` 전체를 상담 주요 이벤트에서 제외한다. 기존 광고 전환을 바꾸면 입찰에 영향을 줄 수 있으므로 담당자가 전환 설정과 중복을 함께 검토한다.

`contact_start`, `showroom_start`, `click_to_call`, `click_email`, `pricing_view`, `file_download` 는 퍼널 분석용 보조 이벤트로 둔다. `form_type` 이 없는 접수는 `sales_lead` 에 포함되지 않으므로 누락 사례를 점검한다.

### 5-6. 서버 Measurement Protocol — 지금은 끈 상태를 유지

서버는 `GA4_MEASUREMENT_ID` 와 `GA4_API_SECRET` 이 **둘 다 있을 때만** `/api/lead`·뉴스레터 접수 성공 뒤 MP 로 `generate_lead` 를 한 번 더 보낸다. 브라우저도 같은 접수에 `generate_lead` 를 보내므로 둘 다 켜면 **문의가 두 배**로 잡힌다(GA4 는 `event_id` 로 중복을 걸러 주지 않고, 서버 쪽에는 `form_type` 도 없다).

- 결정: 당분간 브라우저 이벤트만 쓴다. Vercel 에서 두 변수를 비워 둔다(이미 값이 있으면 지우고 재배포).
- 서버 전송이 꼭 필요해지면(광고 차단 보정 등) 그때 서버 이벤트 이름을 `generate_lead_server` 처럼 분리하거나 브라우저 쪽을 끄는 코드 변경을 먼저 한다(워크리스트 D9).

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

## 7. 광고 전환 — Google Ads·네이버

- 기본 전환 중복 점검: gtag 전환 라벨(`NEXT_PUBLIC_GOOGLE_ADS_DEMO_CONVERSION_LABEL`)과 GA4 가져오기 전환을 모두 기본 전환으로 두면 같은 접수가 입찰에 두 번 반영될 수 있다. 각 액션의 범위·가져오기 상태·입찰 사용 여부를 조사하고, 광고 담당자가 중복 없이 기준을 정한 뒤 변경한다. §5-5의 `sales_lead` 는 GA4에서 생성하는 이벤트이며 Google Ads 전환 설정까지 자동으로 바꾸지 않는다.
- 네이버 전환은 현재 코드에서 `submit_demo_request` 와 `submit_newsletter` 모두 발화한다. 뉴스레터·자료 신청이 광고 전환에 포함되는 것이 의도인지 네이버 설정과 함께 확인한다. 의미를 정하기 전에는 유형이나 발화 조건을 임의로 바꾸지 않는다.
- 라벨 발급·검증 절차는 [활성화 런북](ad-channel-activation-runbook-2026-09-14.md) §3 을 따른다.

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
| GA4 파생 이벤트 설정 후 상담·쇼룸 접수 | 각각 `sales_lead` 1회. 뉴스레터·자료·행사 신청에는 `sales_lead` 없음 |
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
| 전환 | `generate_lead` 를 `form_type` 별로, `pricing_view` → `sales_lead` 전환율. 상담과 뉴스레터·자료·행사 신청은 분리 | GA4 보고서(맞춤 측정기준 적용) |
| 영업 | 유효 문의·상담·계약 건수와 채널 | CRM |
| AEO | 같은 질문 3개("학원 결석생에게 녹화 수업을 제공하려면?", "클래스인과 Zoom 의 차이는?", "학원 전자칠판 도입 시 확인할 점은?")를 ChatGPT 등에 월 1회 넣고 브랜드 언급·출처 링크·정확성 기록 | 수기 표 |
| 속도 | 모바일 LCP·INP·CLS | PageSpeed Insights, GSC Core Web Vitals |

---

## 10. 법무·개인정보 같이 할 것

- 개인정보처리방침(`/privacy`, 최종 2026-06-14)에 쿠키 목록과 제3자(Google Analytics·Google Ads·네이버·Meta CAPI 의 해시 연락처·Solapi·WeCom), 위탁·국외이전, 보호책임자를 보강한다([공개 사이트 점검](public-site-audit-motion-plan-2026-10-26.md) §2-1).
- 자료 다운로드 폼의 묶음 동의(같은 문서 P0-8)와 Meta 철회 처리(P0-6)는 이 런북 범위 밖이며 코드 작업이 따로 필요하다.

### 동의 저장 프로토콜 전환과 운영 검증

- 새 클라이언트는 선택을 먼저 기록하고 서버 확인 전(`s:0`)에는 선택 쿠키를 사용하지 않는다. 감사 로그 저장까지 확인된 선택(`s:1`)만 분석·마케팅에 적용하며, 실패·시간초과 시 보류 상태를 다음 방문에 재시도한다. 거절은 네트워크 응답을 기다리지 않고 반영한다.
- 같은 브라우저의 새 탭들은 Web Locks와 공유 저장소로 선택 순서를 조정한다. 새 API 응답은 Set-Cookie를 내보내지 않고, 클라이언트가 최신 선택 식별자를 확인한 경우에만 결과를 반영한다. 탭 간 쿠키 변경을 구독하는 Cookie Store, Web Locks, 공유 저장소 또는 안전한 난수를 쓸 수 없으면 기존 허용도 복원하지 않고 필수 쿠키만 유지한다. 서버 전환 역시 해당 클라이언트의 관찰 가능 신호가 필요하다.
- 거절 시 분석·마케팅 각각의 철회 식별자를 별도 쿠키에 먼저 남긴다. 확인된 허용 기록이 그 철회를 관측한 경우에만 해당 카테고리를 다시 켠다. 따라서 한 탭에서 잠금·공유 저장소가 실패해도 이전에 시작된 다른 탭의 허용 응답은 새 철회를 덮어 유효한 허용으로 바꿀 수 없다. 서버 추적과 최초 Consent Mode 복원도 같은 표식을 확인한다.
- 거절 탭에서 철회 쿠키를 쓸 수 없으면 다른 탭의 즉시 철회는 보장할 수 없다. 탭 간 메시지가 전달되더라도 수신 탭은 이전 쿠키를 읽을 수 있기 때문이다. 해당 탭은 거절로 전환하고 오류를 표시한다. 사용자는 브라우저 쿠키 설정과 다른 탭을 확인해야 한다. 거절 이전에 이미 전송된 추적 요청이나 이전 서버에서 이미 출발한 응답도 회수할 수 없다.
- Cookie Store 변경 알림은 비동기다. 다른 탭이 알림을 처리하기 전 진행된 브라우저 태그 요청은 회수할 수 없으므로 모든 탭이 철회 순간 원자적으로 중단한다고 보장하지 않는다. 서버는 요청의 철회 표식을 별도로 확인한다.
- 같은 이름·경로 쿠키를 교체할 때 변경 알림이 오는지는 브라우저별 확인이 필요하다. 실험한 Chromium에서는 다른 탭의 교체 알림이 도착했지만 이를 모든 브라우저에서 보장하지 않는다. 관찰 capability 헤더는 정직한 클라이언트가 보내는 신호이며 위조할 수 있는 비인증 값이다.
- Cookie Store는 Chrome 87+, Firefox 140+, Safari 및 iOS Safari 18.4+에서 제공된다([MDN 호환성 데이터](https://github.com/mdn/browser-compat-data/blob/main/api/CookieStore.json)). 각 브라우저의 Web Locks, 저장소 정책과 확장 프로그램도 실제 사용 가능 여부에 영향을 준다. 접속 통계가 없어 차단되는 사용자의 비율은 아직 모른다. 이 환경의 광고·분석 허용과 서버 전환 계측이 감소할 수 있으므로 배포 전 사용 브라우저별 비율과 전환 감소를 확인한다.
- 철회 표식이 없는 기존 허용 쿠키는 재선택이 필요하다. 배너 표시 시 빈 표식을 미리 준비하지만 표시 전 선택하거나 준비가 경쟁으로 무효화되면 다시 선택해야 한다. 필수 쿠키만 사용은 계속 가능하다.
- 호환 우선 대안은 Cookie Store 미지원 브라우저에도 과거 허용을 복원하고 탭 간 storage/BroadcastChannel 신호로 철회를 알리는 방식이다. 그러나 철회 탭의 두 기능이 차단되면 다른 탭에서 이미 켜진 태그를 즉시 끄지 못하고 지연 응답이 허용을 되살릴 수 있다. 이는 지원 범위를 넓히는 대신 철회 우선 보장을 포기하는 제품 선택이다.
- 새 서버에 접근한 구버전 탭의 요청에는 성공 형태의 거절 기록과 거절 쿠키만 반환한다. 구버전 코드가 메모리의 Google Consent Mode도 거절로 갱신하도록 하기 위해서다. 허용을 선택한 사용자는 구버전 UI에서 허용된 것으로 오인할 수 있고, 새로고침 안내를 담은 응답 본문·헤더를 해당 UI가 표시하지 않는다. 배포 후 동의 설정이 저장되지 않는 사용자에게 페이지 새로고침을 안내한다.
- 배포 전에 이미 처리된 이전 서버의 Set-Cookie 응답이나 장기간 유지된 구버전 캐시까지 새 서버가 회수할 수는 없다. 운영 배포 후 구버전 탭·새 탭을 함께 열어 허용/철회, 지연된 응답, 오프라인, 타임아웃, 미지원 브라우저를 확인하고 캐시 갱신 상태를 점검한다. 서버 감사 기록은 끊긴 요청이 늦게 완료될 수 있어 기록 순서만으로 최종 사용자 선택을 추정하지 않는다.
