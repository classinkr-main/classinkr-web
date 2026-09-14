# 광고 채널 활성화 런북 — Google Ads · 네이버 검색광고

- 상태: **활성화 대기**. 코드는 전부 들어갔다([연동 설계](ad-channel-google-naver-integration-2026-09-14.md) §0 참조).
- 대상: 자격증명을 발급하고 환경변수를 채우는 사람.
- 소유: 마케팅/그로스/CRM 파트 ([playbook/04-growth-crm.md](playbook/04-growth-crm.md))

**이 문서가 있는 이유:** 광고 연동은 "설정했다"와 "실제로 데이터가 쌓인다" 사이가 멀다.
네이버는 검수를 안 하면 스크립트가 붙어도 조용히 0이고, Google 은 전환 라벨이 없으면
gtag 가 로드돼도 전환이 한 건도 안 나간다. **둘 다 화면에는 아무 오류가 안 뜬다.**
그래서 단계마다 "무엇을 보면 켜진 걸 아는가"를 같이 적는다.

**원칙 — 0을 성과로 읽지 마라.** 이 파이프라인은 측정 없음을 `—`로, 집행 없음을 `0`으로
구분한다. 활성화 도중의 `—`는 "아직 안 켜짐"이지 "성과 없음"이 아니다.

---

## 0. 먼저 — 마이그레이션 3건

나머지 전부의 선행이다. 미적용이면 크론이 upsert 에서 죽는다.

```
supabase/migrations/20260914_ad_channel_daily.sql          -- google_ads_daily · naver_ads_daily
supabase/migrations/20260914_campaign_links_ad_channels.sql -- ref_type CHECK 확장
supabase/migrations/20260914_leads_naver_attribution.sql    -- leads.naver_ad (JSONB)
```

파일명 사전순으로 적용한다(= 위 순서). Supabase SQL Editor 또는 CLI.

**확인**

```bash
npm run check:db
```

`google_ads_daily` · `naver_ads_daily` · `campaign_links` · `leads(naver_ad)` 프로브가
전부 ok 여야 한다. `campaign_links` 는 **warning 이 정상**이다 — CHECK 제약의 허용 집합은
REST 로 확인할 방법이 없어 컬럼 존재만 본다(그 프로브의 ok 가 확장을 보장하지 않는다).

CHECK 확장을 진짜 확인하려면 `/admin/campaigns/manage` 에서 캠페인 하나에 Google 캠페인을
링크해 본다. 미적용이면 `23514 check violation` 으로 거부된다.

> ⚠️ `leads.naver_ad` 는 선택 컬럼으로 다뤄져서(`OPTIONAL_LEAD_INSERT_COLUMNS`) **미적용이어도
> 리드 저장은 성공한다.** 대신 그 기간 네이버 유입은 사후에 복구할 방법이 없다 — 그래서 이게 0번이다.

---

## 1. Google Ads 전환 액션 — 가장 싸고 효과가 크다

**지금 전환이 한 건도 안 나가고 있다.** gtag.js 는 전 공개 페이지에 로드되는데
(`AW-18252550128`), 전환 액션 라벨이 없어서 `trackAdsConversion()` 이 조기 반환한다.

1. Google Ads → 목표 → 전환 → 전환 액션 만들기 (웹사이트, "도입문의 제출")
2. 발급된 **전환 라벨만** 복사한다 — `AW-` 접두는 코드가 붙인다
3. Vercel 환경변수에 넣고 재배포

```
NEXT_PUBLIC_GOOGLE_ADS_DEMO_CONVERSION_LABEL=<라벨>
```

**확인**

- `/admin/campaigns` 요약탭 → 채널 커버리지 펼치기 → Google 행 **전환 추적**이
  `반쪽 · 전환 미발송` → `연동 · gtag 전환 액션 발화` 로 바뀐다.
  (이 표는 문서가 아니라 **실제 설정값**을 읽으므로 재배포 즉시 반영된다.)
- 실제 발화는 공개 사이트에서 데모 문의를 한 건 넣고 브라우저 네트워크 탭에서
  `googleads.g.doubleclick.net` 요청을 본다. **마케팅 동의를 켠 상태여야 한다** —
  Consent Mode v2 가 `ad_storage` 로 발화를 막는다.
- Google Ads 전환 액션 화면의 "최근 전환"은 지연이 있다(수 시간).

---

## 2. 네이버 검색광고 API — 심사가 없어 가장 빠르다

1. 네이버 검색광고 광고주센터 → **도구 → API Manager** → 액세스 라이선스 생성
2. 액세스 라이선스 · 비밀키 · 고객 ID(숫자) 확보
3. Vercel 환경변수 (서버 전용 — `NEXT_PUBLIC_` 아님)

```
NAVER_SEARCHAD_API_KEY=
NAVER_SEARCHAD_SECRET_KEY=
NAVER_SEARCHAD_CUSTOMER_ID=
```

**확인 — 크론을 직접 한 번 돌린다**

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  https://<도메인>/api/cron/sync-naver-ads | jq
```

기대 응답:

```json
{ "ok": true, "since": "…", "until": "…",
  "campaignCount": 12, "fetched": 36, "upserted": 36, "failedDates": [] }
```

| 증상 | 원인 | 조치 |
|---|---|---|
| `503 · configured:false` | env 셋 중 하나가 비었다 | 값 확인 후 재배포 |
| `invalid-signature` 가 에러 본문에 | 서명 규칙 위반 | **거의 항상 둘 중 하나다** — 서명 문자열에 쿼리가 섞였거나 타임스탬프가 초 단위. 코드는 path·밀리초로 고정돼 있으니, 이 오류가 나면 비밀키가 잘못됐을 가능성이 더 크다 |
| `campaignCount: 0` | 계정에 캠페인이 없거나 고객 ID가 다른 계정 | 고객 ID 확인 |
| `failedDates` 가 비지 않음 | 일부 날짜만 실패(나머지는 저장됨) | 그 날짜만 다시 돌면 메워진다 — 다음 크론이 trailing 3일을 재적재하므로 대개 자동 복구 |
| `fetched > 0` 인데 `upserted: 0` | 있을 수 없다 | 있으면 저장소 버그다 — 보고할 것 |

> ⚠️ **`/stats` 요청 인코딩은 실계정으로 처음 돌릴 때 확인해야 한다.** `ids`·`fields`·`timeRange`
> 파라미터 형식은 문서 기준으로 맞췄지만 실호출로 검증하지 못했다. 틀리면 **400 으로 시끄럽게**
> 죽으므로 조용한 오답은 나지 않는다 — 에러 본문에 네이버가 준 사유가 그대로 실린다.

**화면 확인** — `/admin/campaigns` 요약탭 채널 스트립의 네이버 칸에 `₩` 금액이 뜬다.
크론이 돌기 전에는 `연동됨 · 스냅샷 없음 — 크론 첫 실행 대기`.

---

## 3. Google Ads API — 승인 대기가 있으니 일찍 걸어둔다

**⚠️ 2026-09-10 부로 체계가 바뀌었다.** developer token 은 9/9 sunset 됐고, 접근 등급이
**OAuth 자격증명을 발급한 Google Cloud 프로젝트**에 붙는다. 예전 안내문(매니저 계정에서
토큰 신청)은 전부 옛말이다.

1. Google Cloud 프로젝트 생성 → **Google Ads API 활성화**
2. OAuth 2.0 클라이언트(웹) 발급 → offline access 로 `refresh_token` 1회 획득
3. Cloud Console 에서 그 프로젝트의 **API 접근 등급 신청**.
   읽기 집계만 하므로 **Reporting 등급으로 충분하다** — 승인이 빠르다.
4. 광고 계정이 MCC 하위인지 확인 → 맞으면 `LOGIN_CUSTOMER_ID` 도 채운다

```
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_CUSTOMER_ID=          # 하이픈 없이 숫자만
GOOGLE_ADS_LOGIN_CUSTOMER_ID=    # MCC 하위일 때만. 아니면 비워 둔다
```

**확인**

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  https://<도메인>/api/cron/sync-google-ads | jq
```

| 증상 | 원인 | 조치 |
|---|---|---|
| `503 · configured:false` | env 넷 중 하나가 비었다 | 값 확인 후 재배포 |
| `invalid_grant` | refresh_token 만료·취소 | 재발급 |
| `PERMISSION_DENIED` / `USER_PERMISSION_DENIED` | 등급 미승인이거나 계정 접근 없음 | 승인 상태 확인 |
| `login-customer-id` 관련 오류 | MCC 아닌데 보냈거나, MCC인데 안 보냈다 | 해당 env 를 채우거나 **비운다** |
| 지출이 터무니없이 크다 | `cost_micros` 나눗셈 누락 | 있을 수 없다(순수함수 + 테스트로 잠갔다). 나오면 보고할 것 |
| `truncated: true` | 페이징 상한(20페이지) 도달 | 결과가 **잘렸다** — 캠페인이 많은 계정이면 상한을 올려야 한다. 그대로 두면 "집행이 줄었다"로 오독된다 |

> ⚠️ `metrics.conversions` 는 **클릭 시각에 귀속**된다. 어제 수치가 내일 바뀌는 게 정상이다 —
> 크론이 trailing 7일을 재적재하는 이유다. 과거 행을 확정값으로 인용하지 말 것.

---

## 4. 네이버 전환 추적 — 검수까지 끝나야 데이터가 쌓인다

1. 네이버 프리미엄 로그분석 신청 → 사이트 공통키 확보
2. 네이버 광고 관리에서 **전환 유형 문자열** 정의
3. 환경변수

```
NEXT_PUBLIC_NAVER_WCS_ID=
NEXT_PUBLIC_NAVER_LEAD_CONVERSION_TYPE=test_<유형>   # 테스트 중엔 test_ 접두
```

4. 공개 사이트에서 **마케팅 동의를 켜고** 리드를 한 건 넣는다 →
   네트워크 탭에서 `wcs.naver.net` 요청 확인
5. 네이버 쪽에서 테스트 전환이 잡히면 **`test_` 접두를 제거**하고 재배포
6. **검수 신청** — 이걸 안 하면 수집이 시작되지 않는다

**확인** — 커버리지 매트릭스 네이버 행 **전환 추적**:

| 표시 | 뜻 |
|---|---|
| `없음 · NEXT_PUBLIC_NAVER_WCS_ID 미설정` | 스크립트가 아예 안 붙는다 |
| `반쪽 · 로그분석만` | 공통키는 있는데 전환 유형이 없다 |
| `연동 · 네이버 검수 통과 후 수집 시작` | 코드는 다 됐다. **검수가 남았을 수 있다** |

> ⚠️ 마지막 상태의 문구가 "검수 통과 후"인 이유 — 코드로는 검수 여부를 알 수 없다.
> 이 표가 `연동`이어도 네이버 리포트가 0이면 십중팔구 검수 미완이다.

> ⚠️ **구 스크립트(`wcs.cnv`)를 같이 붙이지 마라.** 같은 전환 유형에서 신 스크립트 전환이
> 한 번 발생하면 그 유형의 구 전환은 네이버 쪽에서 **영구 필터링**된다. 이 저장소에
> `cnv` 호출이 생기면 그건 회귀다.

---

## 5. 전부 켜진 뒤 — 정합성 점검

첫 주에 한 번은 봐야 하는 것들.

**① 채널 스트립의 합계 칸**
통화가 섞이면 비어 있는 게 **정상**이다(Meta USD + 네이버 KRW). 합계가 떠 있는데
통화가 섞여 있으면 그건 버그다.

**② 리드 귀속이 실제로 붙는지**
`/admin/crm/customers/leads` 마케팅 렌즈에서 채널 축을 본다.
`naver / cpc` · `google / cpc` 가 보이기 시작해야 한다. 안 보이면:
- 광고 랜딩 URL 에 파라미터가 실제로 붙는지 (네이버는 프리미엄 로그분석 연동이 있어야 `n_*` 가 붙는다)
- 랜딩 → 본사이트 이탈 경로라면 `/l/attribution.js` 가 로드됐는지(브라우저 저장소에서
  `classinkr.leadAttribution.v1` 확인)

**③ 커버리지 매트릭스 "빈칸 N"**
고칠 수 있는 항목만 세도록 돼 있다(수기·해당없음은 분모에서 빠진다).
이 숫자가 0이 되면 세 채널 3축이 전부 연동된 것이다.

**④ 크론이 매일 도는지**
`google_ads_daily` / `naver_ads_daily` 의 `synced_at` 최댓값이 어제 이후여야 한다.
채널 스트립이 `수집 중 (~날짜)` 로 최신 일자를 보여주므로 화면으로도 확인된다.

---

## 6. 활성화 후에도 남는 것

| 항목 | 상태 |
|---|---|
| 컴파스(crm) 광고 성과표 | 여전히 Meta 전용 — 별도 설계 필요 |
| 카카오 · YouTube · 오프라인 · 기타 | 수기 입력만 |
| GA4 측정 ID | 비어 있으면 사이트 행동 지표가 안 쌓인다 |
| Google·네이버 캠페인 자동 링크 | 지금은 수동 링크만(피커는 있다) |
