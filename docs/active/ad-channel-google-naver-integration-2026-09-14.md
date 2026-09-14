# 광고 채널 확장 — Google Ads · 네이버 검색광고 연동 설계

- 상태: **코드 구현 완료 · 자격증명 발급과 마이그레이션 적용 대기** (2026-09-14).
  아래 §6 실행 순서의 **2·3·5·6·7·8·9번이 코드로 들어갔다.** 남은 것은 사람이 해야 하는 일뿐이다 —
  0(Google 전환 라벨), 1(네이버 API 라이선스), 4(Google Cloud Reporting 등급), 그리고
  `supabase/migrations/20260914_*.sql` 3건 적용.
  자격증명이 없으면 크론은 503으로 조용히 서고 화면은 해당 채널을 **미연동**으로 표기한다 —
  없는 데이터를 0으로 포장하지 않는다.
- 소유: 마케팅/그로스/CRM 파트 ([playbook/04-growth-crm.md](playbook/04-growth-crm.md))
- 관련 정본: [DESIGN.md](../../DESIGN.md) §2 제3자 채널 식별색, [campaign-entity-d1-d3-plan-2026-07-24.md](campaign-entity-d1-d3-plan-2026-07-24.md), [lead-funnel-consent-auth-scoring-plan-2026-06-14.md](lead-funnel-consent-auth-scoring-plan-2026-06-14.md) WS1-4·6

**목표:** 지금 Meta 하나만 실데이터로 도는 마케팅 성과 파이프라인에 Google Ads와 네이버 검색광고를 **같은 등급의 원천**으로 붙인다. 채널 enum·색·예산칸은 이미 7종이 다 있으므로, 없는 것은 **① 집행 데이터 수집(광고 플랫폼 → 우리 DB)** 과 **② 유입 귀속(그 광고가 데려온 리드 식별)** 두 축이다.

**정직 규칙(기존과 동일):** 통화가 다른 집행(Meta USD · Google 계정통화 · 네이버 KRW)은 한 칸에 합산하지 않는다. 측정 없는 채널은 0이 아니라 null(`—`). 이 규칙은 채널이 늘어도 완화하지 않는다.

---

## 0. 구현 산출물 (2026-09-14)

| 층 | 파일 |
|---|---|
| 마이그레이션 | `supabase/migrations/20260914_ad_channel_daily.sql` (google_ads_daily · naver_ads_daily)<br>`20260914_leads_naver_attribution.sql` (leads.naver_ad JSONB)<br>`20260914_campaign_links_ad_channels.sql` (ref_type CHECK 확장) |
| API 클라이언트 | `lib/naver/searchad.ts` (HMAC 서명 · /stats)<br>`lib/google/ads.ts` (OAuth refresh · GAQL · cost_micros) |
| 저장소 | `lib/repositories/naver-ads-daily.ts` · `lib/repositories/google-ads-daily.ts` |
| 크론 | `/api/cron/sync-naver-ads` (05 21, trailing 3일)<br>`/api/cron/sync-google-ads` (35 20, trailing 7일) |
| 중립 집계 | `lib/marketing/ad-insights.ts` — 세 채널을 한 형태로 접는다 |
| 커버리지 판정 | `lib/marketing/channel-coverage.ts` — 실제 설정값으로 3축 상태를 낸다 |
| perf 계약 | `lib/marketing/perf.ts` `channelLive[]` · `channelMix[].liveSpend` · 스코어보드 `channels`/`channelSpend` |
| 네이버 귀속 | `lib/naver-ad-params.ts` (n_* SSOT) → `marketing-attribution` → `leads.naver_ad` → `lead-attribution` |
| 전환 추적 | `components/NaverAnalyticsScript.tsx` (wcs.trans) · `lib/analytics.ts` `trackNaverConversion` · CSP 3줄 |
| 화면 | `ChannelLiveStrip` · `ChannelCoverageMatrix` (요약탭), 스코어보드 채널 칩 |
| 테스트 | `tests/marketing/ad-channel-clients.test.ts` · `ad-insights.test.ts` · `tests/crm/naver-ad-attribution.test.ts` · `tests/campaigns/channel-{live-strip,coverage-matrix}.test.tsx` |

**설계에서 바뀐 것 하나** — 네이버 일자 집계를 `/stat-reports`(대용량 보고서)가 아니라
`/stats`로 받는다. 보고서는 **헤더 없는 TSV**라 컬럼 순서로 읽어야 하는데, 순서가 바뀌면
광고비가 클릭수 자리로 조용히 밀린다. `/stats`는 JSON에 필드명이 붙어 오므로 그 사고가
구조적으로 불가능하고, 요청이 틀리면 400으로 시끄럽게 죽는다. 호출 수는 (일수 × 캠페인 청크)로
늘지만 trailing 3일 × 수십 캠페인이면 문제가 되지 않는다.

---

## 1. 현재 상태 (실측)

### 1.1 채널별 연동 등급

| 채널 | 집행 데이터(지출·노출·클릭) | 리드 귀속 | 사이트 전환 추적 | 등급 |
|---|---|---|---|---|
| **Meta** | Graph API 라이브 (`lib/meta/marketing.ts`) → `meta_insights_daily` (크론 매일 20:50) | 리드애즈 웹훅 + `fbclid` + `utm_*` | Pixel + CAPI (`lib/marketing/server-conversions.ts`) | **A — 완전 자동** |
| **Google** | 없음 (수기 입력만) | `gclid` 컬럼은 **저장 중**, 집행 데이터와 이어지지 않음 | gtag.js 상시 로드 (`AW-18252550128`), 전환 라벨 env 미설정 시 **전환 미발송** | **C — 반쪽** |
| **네이버** | 없음 (수기 입력만) | **전무** — `n_*` 파라미터 미수집 | **전무** — wcs 스크립트 없음, CSP에도 도메인 없음 | **D — 이름만** |
| 카카오·YouTube·오프라인·기타 | 수기 입력만 | — | 카카오 픽셀만 | C~D |

### 1.2 이미 있는 것 (재사용 가능)

- **채널 enum SSOT** — `lib/types/event-metrics.ts`의 `AD_CHANNELS` 7종(`google`·`meta`·`naver`·`kakao`·`youtube`·`offline`·`other`), `AD_CHANNEL_LABEL`, `AD_CHANNEL_COLOR`. 저장소·API·UI가 이 목록 하나를 공유한다.
- **채널 식별색** — DESIGN.md §2에 Google `#4285F4`, 네이버 `#03C75A`가 **이미 등재**돼 있다. 차트·범례·채널 점에만 허용.
- **채널 예산 테이블** — `public.channel_budgets` (CHECK로 7종 고정, KRW 배정액). `/admin/campaigns` 요약탭의 `ChannelBudgetTable`이 읽고 쓴다.
- **행사별 채널 광고비** — `event_metrics.adSpendEntries[]` (채널 + KRW + 메모, 수기).
- **우산 캠페인 + 링크** — `marketing_campaigns` / `campaign_links`. `ref_type` CHECK가 `email_campaign|sms_campaign|event|meta_campaign` 4종.
- **리드 귀속 컬럼** — `public.leads`에 `utm_source/medium/campaign/term/content`, `gclid`, `fbclid`, `msclkid`, `ttclid`, `landing_page`, `referrer` 전부 존재 (`20260608_lead_attribution_fields.sql`). 클라이언트 수집기는 `lib/marketing-attribution.ts`(localStorage 영속).
- **일별 스냅샷 패턴** — `meta_insights_daily` 테이블 + `upsertMetaInsightsDaily` + trailing 3일 재적재 크론. 이 패턴을 그대로 복제하면 된다.

### 1.3 없는 것 (이번 작업 범위)

1. Google Ads API 클라이언트·일별 스냅샷 테이블·크론
2. 네이버 검색광고 API 클라이언트·일별 스냅샷 테이블·크론
3. `campaign_links.ref_type`에 `google_campaign` / `naver_campaign`
4. 네이버 `n_*` 유입 파라미터 수집 + `leads` 컬럼
5. 네이버 전환 추적 스크립트(wcs.trans) + CSP 갱신 + 동의 게이트
6. Google Ads 전환 라벨 설정 (env 하나 — 지금 리드 전환이 Google Ads로 **안 돌아가고 있다**)
7. perf API 응답 계약의 채널 확장 (`metaSpendUsd` 단일 필드 → 채널별 라이브 집행)

### 1.4 컴파스(crm 저장소)는 별개다

`classinkr-main/crm`의 `/ads`·`lib/adReport.ts`·`crm.ad_spend_monthly` 계열은 **100% Meta 전용**이고 Google·네이버 흔적이 0이다. 본사 월간 광고성과표(`adReport.ts`)의 지출·노출·클릭 줄도 전부 메타 API 미러다.

> **결정 필요:** 컴파스 성과표를 "전 채널 합계"로 바꿀지, "Meta 전용"으로 두고 채널별 표를 새로 세울지는 이 문서의 범위 밖이다. 다만 **classinkr-web을 먼저 채널 중립으로 만들고, 컴파스는 그 집계를 읽어가는 순서**를 권한다 — 양쪽에 API 클라이언트를 두 벌 두면 수치가 갈린다(전화번호 정규화 사본 13벌과 같은 사고).

---

## 2. 연동 방법

### 2.1 Google Ads — 집행 데이터

**⚠️ 2026-09-10 부로 접근 체계가 바뀌었다.** developer token은 2026-09-09 sunset됐고, API 접근 등급이 **manager 계정의 developer token이 아니라 OAuth 자격증명을 발급한 Google Cloud 프로젝트**에 붙는다. 기존 토큰은 헤더에 보내도 무시되며(향후 메이저 버전에서 거부 예정), 9/10 시점 심사 대기 중이던 Basic Access 신청은 **일괄 종료**돼 새 페이지에서 재신청해야 한다.

**발급 절차**

1. Google Cloud 프로젝트 생성 → Google Ads API 활성화
2. 그 프로젝트에서 OAuth 2.0 클라이언트(웹) 발급 → `refresh_token` 1회 획득 (offline access)
3. Cloud Console에서 해당 프로젝트의 **API 접근 등급** 신청. 읽기 전용 집계만 필요하므로 **Reporting 등급으로 충분** — `GoogleAdsService.Search` / `SearchStream` + 읽기 호출만 허용된다. 승인이 빠르고 심사 부담이 적다.
4. 광고 계정(고객 ID)과 MCC(manager) 관계 확인 → `login-customer-id` 헤더 필요 여부 결정

**호출 형태** (REST, 현행 v25)

```
POST https://googleads.googleapis.com/v25/customers/{CUSTOMER_ID}/googleAds:searchStream
Authorization: Bearer {access_token}
login-customer-id: {MCC_ID}        # MCC 하위 계정일 때만
```

```sql
SELECT campaign.id, campaign.name, campaign.status,
       segments.date,
       metrics.cost_micros, metrics.impressions, metrics.clicks,
       metrics.conversions, metrics.all_conversions
FROM campaign
WHERE segments.date BETWEEN '2026-09-01' AND '2026-09-14'
```

**주의점**

- `cost_micros`는 **마이크로 단위**(1,000,000 = 계정 통화 1단위). Meta의 `lifetime_budget` 최소단위 처리(`normalizeBudgetAmount`)와 **다른 규칙**이다 — 같은 함수를 재사용하지 말 것.
- `metrics.conversions`는 **전환 시각이 아니라 클릭 시각에 귀속**된다. 그래서 과거 일자 수치가 계속 바뀐다 → Meta와 동일하게 **trailing 재적재**가 필수고, 3일보다 넉넉히(7일 권장) 잡는다.
- `customer.currency_code`를 함께 읽어 저장한다. KRW 환산 금지.
- access_token은 1시간 만료 — `refresh_token`으로 매 호출 갱신하거나 짧게 캐시한다.

**env**

```
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_CUSTOMER_ID=            # 하이픈 없이
GOOGLE_ADS_LOGIN_CUSTOMER_ID=      # MCC 하위일 때만
```

### 2.2 네이버 검색광고 — 집행 데이터

Google·Meta와 달리 **심사가 없다.** 광고주센터 → 도구 → API Manager에서 액세스 라이선스/비밀키를 즉시 발급받는다. 가장 빨리 붙일 수 있는 채널이다.

**인증** — OAuth가 아니라 요청마다 HMAC 서명을 만든다.

```
Base: https://api.searchad.naver.com
X-Timestamp: {epoch millis}
X-API-KEY:   {access license}
X-Customer:  {고객 ID(숫자)}
X-Signature: base64( HMAC_SHA256( secret, "{timestamp}.{METHOD}.{path}" ) )
```

서명 문자열은 **path만** 쓴다 — 쿼리스트링을 넣으면 `invalid-signature`가 난다. 타임스탬프는 초가 아니라 **밀리초**다.

**엔드포인트**

| 용도 | 경로 |
|---|---|
| 캠페인 목록(마스터) | `GET /ncc/campaigns` |
| 광고그룹 | `GET /ncc/adgroups?nccCampaignId=…` |
| 실시간 통계 | `GET /stats?ids=…&fields=…&timeRange=…` |
| 대용량 보고서 | `POST /stat-reports` → 생성 후 다운로드 URL 폴링 |
| 마스터 보고서 | `POST /master-reports` |

**수집 전략**

- 캠페인 수십 개 규모면 `/stats`로 충분하다. `ids`에 캠페인 ID 배열, `fields`에 `["impCnt","clkCnt","salesAmt","ctr","cpc","avgRnk","ccnt"]`, `timeRange`에 `{"since":"2026-09-01","until":"2026-09-14"}`.
- `/stats`는 **ids 개수 제한**이 있으므로 청크로 나눠 호출한다.
- 일자별로 쪼개려면 `timeIncrement=1` 대신 **날짜별 호출**이거나 `/stat-reports`(비동기 생성 → 폴링 → TSV 다운로드)를 쓴다. 일별 시계열이 필요한 우리 계약상 `/stat-reports` 쪽이 안정적이다.
- 금액 필드(`salesAmt`)는 **KRW·VAT 별도**다. 표기할 때 VAT 포함 여부를 라벨에 명시한다.

**env**

```
NAVER_SEARCHAD_API_KEY=
NAVER_SEARCHAD_SECRET_KEY=
NAVER_SEARCHAD_CUSTOMER_ID=
```

### 2.3 네이버 — 유입 귀속 (여기가 진짜 빈칸이다)

집행 데이터만 붙이면 "네이버에 얼마 썼다"까지만 보이고 **"네이버가 리드를 몇 개 데려왔다"가 안 보인다.** Meta는 `fbclid`, Google은 `gclid`가 그 일을 하는데 네이버는 그 자리가 비어 있다.

**네이버가 랜딩 URL에 붙이는 파라미터**(프리미엄 로그분석 연동 시)

`n_media` · `n_query` · `n_rank` · `n_ad_group` · `n_ad` · `n_keyword_id` · `n_keyword` · `n_campaign_type` · `n_contract` · `n_ad_type`

**할 일**

1. `lib/marketing-attribution.ts`의 `ATTRIBUTION_PARAM_MAP`에 위 파라미터 추가 (최소 `n_ad`·`n_keyword`·`n_campaign_type`·`n_media`)
2. `leads` 테이블에 컬럼 추가 — 개별 컬럼 10개를 늘리는 대신 **`naver_ad` JSONB 한 칸** 권장. 기존 `gclid`/`fbclid` 패턴과 다르지만, 네이버는 파라미터 수가 많고 앞으로도 늘어난다.
3. `lib/crm/lead-attribution.ts`
   - `hasTrackingSignal()`에 네이버 신호 추가
   - `getLeadChannelLabel()`에 `gclid → "google / cpc"`와 대칭으로 `naver_ad → "naver / cpc"` 폴백 추가
   - `SOURCE_GROUP_*`에 `naver` 그룹을 넣을지 결정 — 현재 7묶음이 채널이 아니라 *유입 경로*(meta/homepage/resources/…) 축이라, 네이버 검색광고 리드는 결국 홈페이지 폼으로 들어온다. **`homepage` 그룹을 유지하고 트래킹 축(`TrackingDimension`)에서 채널로 가르는 쪽**이 기존 설계와 맞다.
4. `lib/crm/capture/origin.ts`의 `AD_LEAD_SOURCES`/클릭ID 판정에 네이버 포함

### 2.4 사이트 전환 추적 스크립트

**Google** — gtag.js는 이미 전 공개 페이지에 로드된다. 빠진 건 **전환 액션 라벨 하나**다.

```
NEXT_PUBLIC_GOOGLE_ADS_DEMO_CONVERSION_LABEL=
```

이 값이 없으면 `lib/analytics.ts`가 전환 이벤트를 아예 보내지 않는다. Google Ads에서 "도입문의 제출" 전환 액션을 만들고 발급된 라벨을 넣으면 즉시 산다. **가장 싼 개선이다.**

**네이버** — 신 스크립트(`wcs.trans`)로 붙인다. 구 스크립트(`wcs.cnv`)는 신·구 중복전환 필터링 로직이 있어 섞어 쓰면 구 전환이 영구 필터링된다 — **처음부터 trans로 간다.**

- 공통 스크립트(`wcs.naver.net/wcslog.js` + `wcs_add.wa` + `wcs.inflow()` + `wcs_do()`)는 전 페이지, 전환 태그보다 **항상 아래**
- 신규 컴포넌트 `components/NaverAnalyticsScript.tsx` — `AppChrome.tsx`에서 `consentChoice.marketing` 게이트 안에 마운트 (Meta Pixel과 같은 자리)
- 테스트는 전환유형 문자열에 `test_` prefix를 붙여 돌리고, 확정 시 제거
- **검수 신청을 끝내야 데이터가 쌓인다** — 스크립트만 넣고 끝내면 조용히 0이 나온다
- `lib/analytics-config.ts`에 `NEXT_PUBLIC_NAVER_WCS_ID` 검증 추가

**CSP** (`next.config.ts`) — 지금 네이버 도메인이 하나도 없다. 추가할 것:

```
script-src  … https://wcs.naver.net
img-src     … https://wcs.naver.net https://wcs.naver.com
connect-src … https://wcs.naver.net https://wcs.naver.com
```

주석으로 용도를 남기는 것이 이 파일의 규약이다.

### 2.5 우산 캠페인 링크 확장

```sql
ALTER TABLE public.campaign_links DROP CONSTRAINT campaign_links_ref_type_check;
ALTER TABLE public.campaign_links ADD CONSTRAINT campaign_links_ref_type_check
  CHECK (ref_type IN ('email_campaign','sms_campaign','event',
                      'meta_campaign','google_campaign','naver_campaign'));
```

`lib/types/marketing-campaign.ts`의 `CampaignRefType`·`CAMPAIGN_REF_TYPES`·`CAMPAIGN_REF_TYPE_LABEL` 세 곳을 같이 늘린다(런타임 SSOT 규약).

`CampaignRollup`은 `metaSpend`/`metaCurrency`/`metaLeads` 3필드가 Meta에 박혀 있다. 채널이 셋이 되면 **`spendByChannel: Record<AdChannel, {amount, currency, leads} | null>`** 형태로 바꾸는 게 맞다 — 채널마다 필드 3개씩 늘리면 넷째 채널에서 무너진다.

---

## 3. 목표 아키텍처

```
 광고 플랫폼                수집(크론)                    저장                     읽기                 화면
┌──────────────┐   ┌──────────────────────┐   ┌────────────────────┐
│ Meta Graph   │──▶│ /api/cron/           │──▶│ meta_insights_daily│─┐
│ v25          │   │   sync-meta-insights │   │ (있음)             │ │
└──────────────┘   └──────────────────────┘   └────────────────────┘ │
┌──────────────┐   ┌──────────────────────┐   ┌────────────────────┐ │  ┌──────────────┐   ┌─────────────────┐
│ Google Ads   │──▶│ /api/cron/           │──▶│ google_ads_daily   │─┼─▶│ ad-insights  │──▶│ /admin/campaigns│
│ API v25      │   │   sync-google-ads    │   │ (신규)             │ │  │ (채널 중립   │   │  요약·채널·캠페인│
└──────────────┘   └──────────────────────┘   └────────────────────┘ │  │  집계 레이어)│   └─────────────────┘
┌──────────────┐   ┌──────────────────────┐   ┌────────────────────┐ │  └──────────────┘
│ 네이버       │──▶│ /api/cron/           │──▶│ naver_ads_daily    │─┘         ▲
│ 검색광고 API │   │   sync-naver-ads     │   │ (신규)             │           │
└──────────────┘   └──────────────────────┘   └────────────────────┘           │
                                                                                │
  사이트 전환 추적                      유입 귀속                                │
┌──────────────────────────┐   ┌──────────────────────────┐                    │
│ gtag(Google) · Pixel+CAPI│   │ leads: utm_*, gclid,     │────────────────────┘
│ (Meta) · wcs.trans(네이버)│──▶│ fbclid, naver_ad(JSONB)  │
│  ↳ 전부 동의 게이트 뒤    │   └──────────────────────────┘
└──────────────────────────┘
```

**핵심 설계 결정: 채널별 테이블 + 중립 집계 레이어**

채널 하나로 통합한 `ad_insights_daily(channel, date, campaign_id, …)` 단일 테이블도 가능하지만 **권하지 않는다.** 채널마다 고유 필드가 다르다 — Google은 `conversions`/`all_conversions`(클릭 귀속), 네이버는 `avgRnk`·`ccnt`·키워드 축, Meta는 `reach`·`actions[]`. 한 테이블에 몰면 NULL 밭이 되고 CHECK도 못 건다.

대신 **읽기 레이어(`lib/marketing/ad-insights.ts`)를 채널 중립으로** 두고, 거기서 `{channel, date, campaignId, campaignName, spend, currency, impressions, clicks, leads}` 공통 형태로 접는다. `perf-assemble.ts`와 UI는 이 중립 형태만 본다.

**크론 시각** — 기존 슬롯과 안 겹치게: Google `35 20 * * *`, 네이버 `05 21 * * *` (Meta가 `50 20`). `npm run check:vercel-crons`가 형식을 검사한다.

---

## 4. 화면 설계

### 4.1 `/admin/campaigns` 요약탭 — 채널 스트립 신설

지금 KPI 스트립은 `spendUsd`(Meta 전용) 한 줄이다. 채널이 셋이 되면 이 칸이 거짓말을 한다.

```
┌─────────────────────────────────────────────────────────────────┐
│  집행 (기간: 최근 30일)                              연동 3 · 수기 4│
├──────────────┬──────────────┬──────────────┬────────────────────┤
│ ● Meta       │ ● Google     │ ● 네이버     │ ○ 카카오·YT·기타    │
│ $1,240.50    │ ₩1,840,000   │ ₩920,000     │  ₩— 미측정          │
│ 리드 62      │ 리드 18      │ 리드 —       │  리드 —             │
│ CPL $20.0    │ CPL ₩102,222 │ CPL —        │                     │
│ ↑ 12%        │ ↓ 4%         │ 신규          │                     │
└──────────────┴──────────────┴──────────────┴────────────────────┘
   통화가 달라 합계를 내지 않는다 ⓘ
```

- **한 줄 합계를 만들지 않는다.** 통화 축이 다르면 칸을 나란히 두되 총합 칸은 비운다. 기존 `budgetExecutionPct`가 이미 "KRW 소스만" 규칙을 쓰고 있다.
- 채널 점(`●`)은 연동 채널, 빈 점(`○`)은 수기 채널. **연동/수기를 시각적으로 갈라야** 숫자의 신뢰도가 읽힌다.
- 네이버는 집행은 있는데 리드 귀속이 아직이면 `리드 —`. 0으로 채우지 않는다.

### 4.2 채널 효율 차트 — 기존 컴포넌트 그대로

`ChannelEfficiencyChart`는 이미 `{channel, label, color, spend, leads, cpl}` 행 배열을 받고 `AD_CHANNEL_COLOR`로 셀을 칠한다. **컴포넌트 수정 없이 데이터만 실값으로 바꾸면 된다.** 단 KRW/USD 혼재 시 축이 무의미해지므로 **통화별로 차트를 가르거나** KRW 채널만 한 차트에 둔다.

### 4.3 캠페인 스코어보드 — 채널 뱃지

`PerfScoreboardRow`에 `channel: AdChannel` 추가. 행 왼쪽에 채널 색 점 + 라벨. `spendUsd`/`cpl` 필드명을 `spend`/`currency`로 일반화한다.

### 4.4 `/admin/campaigns/manage` — 링크 피커

`LinkPicker`에 Google·네이버 캠페인 탭 추가. Meta 동기화(`meta-sync`)와 대칭으로 `google-sync`·`naver-sync`를 두되, **자동 생성은 Meta만 유지**하고 신규 채널은 수동 링크부터 시작하는 것을 권한다 — 미러 자동생성은 고아·중복 처리가 까다롭고, 이미 Meta에서 보상 삭제 로직까지 붙어 있다.

---

## 5. 디자인 · 시각 요소

### 5.1 지금 쓸 수 있는 토큰 (추가 등재 불필요)

| 요소 | 값 | 정본 |
|---|---|---|
| Google 식별색 | `#4285F4` | `AD_CHANNEL_COLOR.google`, DESIGN.md §2 |
| 네이버 식별색 | `#03C75A` | `AD_CHANNEL_COLOR.naver` |
| Meta 식별색 | `#0866FF` | `AD_CHANNEL_COLOR.meta` |
| 브랜드 액센트 | `#084734` (유일 포화색) | DESIGN.md §2 Primary |
| 차트 토큰 | `CHART.*` (grid `#f0f0ec`, axis `#1a1a1a`/40%, tooltip `#111110`) | `components/admin/viz/theme.ts` |
| 톤 4종 | neutral·brand·caution·danger | `TONE` |
| 미측정 표기 | `—` | perf 정직 규칙 |

**제약(어기면 팔레트 위반):** 채널 브랜드색은 **차트·범례·채널 점 표시에만**. CTA·버튼 채움·뱃지 배경·텍스트 강조에 쓰면 안 된다. Google/Meta 블루는 특히 "냉색 금지" 원칙의 명시적 예외라서 범위를 넘기면 바로 눈에 띈다.

`scripts/check-design-tokens.mjs`는 현재 `components/admin/branch/`만 스캔하므로 campaigns 쪽은 자동 검사 대상이 아니다 — 리뷰에서 사람이 봐야 한다.

### 5.2 시각적으로 표현해야 하는 구분 3가지

이번 확장에서 **UI가 반드시 구별해 보여줘야 할 것**은 색이 아니라 신뢰도 축이다.

1. **연동 ↔ 수기** — API로 들어온 수치와 사람이 타이핑한 수치가 같은 서체·같은 칸에 있으면 안 된다. 채워진 점(`●`)/빈 점(`○`), 또는 수기 칸에 연필 아이콘.
2. **통화 축** — USD/KRW가 같은 줄에 있으면 합산 착시가 생긴다. 통화 기호를 항상 붙이고, 합계 칸은 통화가 섞이면 비운다.
3. **측정 없음 ↔ 0** — `—`와 `0`은 다른 말이다. 이미 perf 계약이 null/0을 가르고 있으므로 UI가 무너뜨리지 않게만 하면 된다.

### 5.3 새 시각 요소 제안

- **채널 커버리지 매트릭스** — 채널 × (집행데이터 / 리드귀속 / 전환추적) 3열 신호등. §1.1 표의 화면판. 어디가 비었는지 한 장으로 보인다. `/admin/campaigns` 요약탭 하단 또는 `/admin/settings` 연동 상태에 둔다.
- **채널 스택 영역 차트** — 일별 집행을 채널별로 쌓되 **KRW 채널만**. Meta는 별도 축.
- **귀속 폭포(waterfall)** — 총 리드 → UTM 있는 리드 → 채널 식별된 리드 → 캠페인까지 이어진 리드. 귀속이 어디서 끊기는지 보여준다. 네이버 붙이고 나면 이 그림이 크게 바뀐다.

---

## 6. 실행 순서 (의존성 순)

| # | 작업 | 규모 | 선행 | 효과 |
|---|---|---|---|---|
| 0 | `NEXT_PUBLIC_GOOGLE_ADS_DEMO_CONVERSION_LABEL` 설정 | env 1줄 | Google Ads 전환 액션 생성 | 지금 안 도는 Google 전환이 즉시 돈다 |
| 1 | 네이버 검색광고 API 라이선스 발급 | 반나절 | 없음(심사 없음) | 2·3의 선행 |
| 2 | `naver_ads_daily` + `lib/naver/searchad.ts` + 크론 | 1~2일 | 1 | 네이버 집행이 화면에 뜬다 |
| 3 | 네이버 `n_*` 수집 + `leads.naver_ad` + 귀속 로직 | 1~2일 | — | **네이버 CPL이 계산 가능해진다** |
| 4 | Google Cloud 프로젝트 + Reporting 등급 신청 | 대기 있음 | 없음 | 5의 선행 |
| 5 | `google_ads_daily` + `lib/google/ads.ts` + 크론 | 2일 | 4 | Google 집행이 화면에 뜬다 |
| 6 | `lib/marketing/ad-insights.ts` 중립 집계 + perf 계약 확장 | 2일 | 2·5 | 화면이 채널 중립이 된다 |
| 7 | `campaign_links.ref_type` 확장 + 링크 UI | 1일 | 6 | 우산 캠페인에 채널이 붙는다 |
| 8 | 네이버 wcs.trans + CSP + 동의 게이트 + 검수 | 2일 + 검수 대기 | — | 네이버 쪽 전환 최적화가 산다 |
| 9 | 채널 스트립·커버리지 매트릭스 UI | 2일 | 6 | §4·§5 화면 |

**0번은 오늘 할 수 있고 효과가 가장 크다.** 1~3번(네이버)이 4~5번(Google)보다 먼저인 이유는 심사 대기가 없어서다.

---

## 7. 검증

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build            # prebuild 가 check:vercel-crons · check:design-tokens 를 돈다
npm run test
```

크론 추가 시 `scripts/check-vercel-crons.mjs`, 컬럼 추가 시 `npm run check:db`를 같이 돌린다.

**연동 단계에서 반드시 확인할 것**

- 네이버 서명 실패(`invalid-signature`) — 서명 문자열에 쿼리가 섞였거나 타임스탬프가 초 단위인 경우가 대부분이다.
- Google `cost_micros` ÷ 1,000,000 누락 — 지출이 100만 배로 뜬다.
- 과거 일자 수치 변동 — Google 전환은 클릭 귀속이라 계속 바뀐다. trailing 재적재 없으면 어제 숫자가 영원히 틀린 채 남는다.
- 동의 없는 픽셀 발화 — 네이버 스크립트를 `consentChoice.marketing` 게이트 밖에 두면 플레이북 위반이다.
