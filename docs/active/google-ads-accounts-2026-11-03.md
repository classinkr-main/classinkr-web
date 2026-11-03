# Google Ads 계정·캠페인·전환 현황 (2026-11-03)

- 상태: **395 충전과 캠페인 승인 대기.** Google Ads·GA4 화면을 직접 점검한 기록이다(Google Ads API는 미연동).
- 출처: Claude 문서 'ClassIn 유튜브 광고 점검 & 캠페인 설계안' — https://claude.ai/artifact/JJwV3XUBSdNjkJGnMxfKYj (비공개, 소유자 계정으로만 열린다)
- 어드민 표시: `/admin/campaigns?tab=data#google` (마케팅 › 데이터 › Google Ads, Meta 캠페인 바로 다음 섹션).
  값은 `lib/marketing/google-ads-setup.ts`의 정적 데이터다. **계정·쿠폰·캠페인이 바뀌면 이 문서와 그 파일을 같이 고친다.**
- 소유: 마케팅/그로스/CRM 파트 ([playbook/04-growth-crm.md](playbook/04-growth-crm.md))
- 관련: [광고 채널 활성화 런북](ad-channel-activation-runbook-2026-09-14.md) · [Google·네이버 연동 설계](ad-channel-google-naver-integration-2026-09-14.md)

---

## 1. 계정 구조 — 395로 간다

| 계정 | 로그인 | 역할 | 현황 |
|---|---|---|---|
| **395-174-3288** | classinkorea@gmail.com | **주 계정** | 프로모션 쿠폰 때문에 유지한다. 선불. 유튜브 채널이 연결돼 있고, 유튜브 스튜디오 프로모션 2개도 이 선불 잔액에서 빠진다. 스튜디오 프로모션 랜딩을 `classin.co.kr/contact`로 고쳤다(11/2). |
| 924-032-2833 '클래스인' | classinkr@classin.com | 기존 | PMax 'Campaign #1'이 하루 ₩10,000으로 돌지만 전환은 페이지 조회 2건뿐이다. 유튜브 캠페인 '유튜브 채널 광고(쇼츠+메타영상)_261030'이 395와 **같은 영상을 중복 집행**한다. Visa 후불. 전환 '도입문의 제출(submit_demo_request)' 운영 중. |
| 145-679-4327 | — | 미사용 | 설정만 해 둔 빈 계정. |

계정은 합칠 수 없고 쿠폰이 395에 묶여 있으므로 395로 계속 간다. 924 중복 캠페인을 끌지는 사용자가 정한다.

## 2. 395 결제·쿠폰

- **쿠폰**: ₩180만을 쓰면 ₩120만 크레딧. 예약된 지출 ₩347,777(19%). 남은 59일(12/31까지) 동안 하루 약 ₩30,500이 필요하다.
- **결제**: 선불 · 잔액 ₩0 · 자동 충전 꺼짐 · 카드 미등록. **충전 전에는 광고가 나가지 않는다.**

## 3. 395 캠페인 계획 — 총 ₩1,822,000 (승인 대기)

| 캠페인 | 유형·설정 | 일 예산 | 기간 | 기간 예산 |
|---|---|---|---|---|
| C1 인지 | 동영상 조회(기존 캠페인 수정) · 타깃 CPV ₩40 · 맞춤 세그먼트 3개 · 동영상 파트너 제외 · 게재빈도 7일 3회 | ₩8,000 | 11/3~12/31 (59일) | ₩472,000 |
| C2 리드 | 디맨드젠 · 전환 목표 `generate_lead` | ₩14,000 | 11/9~12/31 (53일) | ₩742,000 |
| C3 리타게팅 | 디맨드젠 · GA4 잠재고객 활용 | ₩5,000 | 11/23~12/31 (39일) | ₩195,000 |
| C4 검색 | 검색 | ₩7,000 | 11/3~12/31 (59일) | ₩413,000 |

11/23 이후 하루 합계는 ₩34,000이다. 계획 합계는 쿠폰 조건(₩180만)을 넘는다 — `tests/campaigns/google-ads-panel.test.tsx`가 이 계산을 잠근다.

## 4. 전환 추적 — 395는 GA4 가져오기로 리드를 받는다

- **GA4 'ClassIn KR Web'**: `G-6MWTJ8C0L2`, 속성 543942005, 웹 스트림 classin.co.kr. 주요 이벤트는 `generate_lead`(lead_type: `demo_request` · `newsletter`). 최근 7일 0건.
- **11/3 GA4 → 395 연결**: 맞춤 광고와 자동 태그 추가를 켰다. 연결하려고 classinkorea@gmail.com을 GA4 속성 편집자로 추가했다.
- **395 기본 전환**: `generate_lead`를 '리드 양식 제출' 기본 전환 'ClassIn KR Web (web) generate_lead'로 가져왔다 — 1회 집계 · 클릭 후 90일 · 데이터 기반 기여. 상태는 '최근 전환 없음'이고, 다음 리드부터 24시간 안에 반영된다.
- **사이트 코드**(`lib/analytics.ts`): 상담 폼이 성공하면 `submit_demo_request`가 GA4 `generate_lead`(lead_type demo_request)로 나간다. 같은 순간 `trackDemoRequestAdsConversion`이 `gtag('event','conversion',{send_to:'AW-18252550128/<라벨>'})`를 보낸다. 운영 번들에 이 라벨이 들어가 있음을 11/3에 확인했다. 두 호출 모두 Consent Mode v2 동의를 따른다.
- **사이트 태그는 395 것이 아니다**: `GOOGLE_ADS_ID = AW-18252550128`(`lib/analytics-config.ts`)은 다른 계정(924로 추정)의 태그다. 395 태그 `AW-18551599540`은 사이트에 없다. 그래서 395에 원래 있던 '도입 상담 신청'·'쇼룸 예약 완료' 전환은 작동하지 않는다.

### 하지 말 것

- **395 태그(`AW-18551599540`)나 그 전환 호출을 사이트에 넣지 않는다.** 395는 GA4 가져오기로 리드를 받으므로 같은 리드가 두 번 잡힌다.
- `GOOGLE_ADS_ID`·`NEXT_PUBLIC_GOOGLE_ADS_DEMO_CONVERSION_LABEL`을 395 것으로 바꾸지 않는다. 924의 '도입문의 제출' 전환이 끊긴다.

### 제안 (미결정)

- 395의 '도입 상담 신청'·'쇼룸 예약 완료'는 태그가 없어 영원히 0이다. 살리려고 태그를 붙이지 말고, 정리가 필요하면 Google Ads 화면에서 보조 전환으로 내리거나 끈다.

### 나중 과제

- 뉴스레터 구독도 `generate_lead`(lead_type newsletter)로 잡혀 395 기본 전환에 섞인다. 문의만 세는 이벤트로 나누는 일은 나중 과제다.

## 5. Google Ads API — 집행 데이터 자동 수집

코드는 다 들어가 있다. 크론 `/api/cron/sync-google-ads`(매일 05:35 KST, trailing 7일)가 `google_ads_daily`에 쌓고,
어드민 Google Ads 섹션이 그 집계로 **캠페인 실적 표**(광고비·노출·클릭·전환·전환당 비용)를 그린다. 기간은 허브의 기간 토글을 따른다.

**인증은 공용 서비스 계정** `classin-admin@classin-home.iam.gserviceaccount.com`(Sheets·Calendar와 같은 키)이라 새 비밀 값이 없다.
자세한 확인법은 [런북 §3](ad-channel-activation-runbook-2026-09-14.md).

1. ✅ GCP 프로젝트 `classin-home`에 Google Ads API 사용 설정 + **Explorer** 등급 신청 — 11/3 완료(자동 승인)
2. ✅ Google Ads 395 › 관리자 › 액세스 및 보안에 위 서비스 계정을 **읽기 전용** 사용자로 추가 — 11/3 완료
3. ✅ 로컬 확인 — `npm run check:google-ads` 읽기 성공(KRW), 크론과 같은 `fetchGoogleAdsDaily` 경로로
   11/3 `유튜브 전반성장_1102` 1행(₩3,030 · 노출 649 · 클릭 2)까지 받아 왔다
4. ⬜ PR #55 배포 + Vercel에 `GOOGLE_ADS_CUSTOMER_ID=3951743288`(주 계정 395) 넣고 재배포 — 켜는 스위치.
   서비스 계정 인증과 아래 pageSize 수정이 운영에 있어야 하므로 **배포가 먼저**다

실호출에서 찾은 버그: 9/14 클라이언트가 search 본문에 `pageSize`를 보내 `PAGE_SIZE_NOT_SUPPORTED`로 요청 전체가
거부됐다(현행 API는 페이지 1만 행 고정). 자격증명이 있었어도 크론은 매번 실패했을 것이다 — 11/3 수정, 테스트로 잠갔다.

어드민 Google Ads 섹션 헤더의 'API …' 표시와 남은 일의 'API 연동' 줄은 실제 설정값을 읽으므로, 켜면 저절로 바뀌고 사라진다.
API 버전 `v25`는 2027년 8월 지원 종료 예정이다.

## 6. 남은 일 (사용자)

1. 395에 카드 등록 + 충전(최소 ₩347,777)
2. 924 중복 유튜브 캠페인을 끌지 결정
3. C1 수정 · C2~C4 생성 진행 승인
