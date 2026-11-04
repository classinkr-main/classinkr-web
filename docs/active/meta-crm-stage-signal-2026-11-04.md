# 메타 리드 영업 단계 → Meta 전환 리드 신호 (2026-11-04)

메타 리드 광고로 들어온 리드가 Compass 에서 컨택·체험 계정·데모·결제로 넘어가면, 그 단계를 Meta Conversions API 로 보낸다.
Meta 가 "폼만 내는 사람" 대신 "데모까지 가는 사람"에 맞춰 광고를 보내게 하려는 것이다(Meta '전환 리드' 최적화, 단계별 맞춤 타겟).
5/1 이후 캠페인별 리드 1건 비용은 $8~$13 로 비슷하지만 데모 1건 비용은 $69~$236 이다 — 지금 Meta 는 리드 수로만 학습해 이 차이를 모른다.

**상태: 코드만 있고 꺼져 있다.** 법무 확인 전이라 `META_CRM_SIGNAL_ENABLED` 기본값은 끔이다. 원장 마이그레이션도 운영에 적용하지 않았다.

- 코드: `lib/marketing/meta-crm-signal.ts`(판정·발송), `app/api/cron/meta-crm-signal/route.ts`(매시간 40분), CAPI 전송은 `lib/marketing/server-conversions.ts` 의 `postMetaCapiEvents`(웹사이트 Lead 전송과 같은 경로)
- 원장: `supabase/migrations/20261104_meta_crm_signal_events.sql` → `public.meta_crm_signal_events`
- 테스트: `tests/marketing/meta-crm-signal.test.ts`

## 1. 무엇을 보내나

식별자는 **메타 리드 번호(leadgen_id) 하나**다 — `user_data.lead_id`. 전화번호·이메일은 보내지 않는다(고객 목록 업로드는 방침 개정 뒤 별도 일).
메타 리드 번호와 Compass 리드의 연결은 `crm.lead_refs`(`public.compass_lead_refs_v`, `system='meta_leadgen'`)다. 2026-09-15 이후 접수분부터 있다.

| event_name | 단계 | 시각(event_time) | 한 번만 보내는 단위 |
| --- | --- | --- | --- |
| `initial_lead` | 접수 | `lead_refs.created_at`(Compass 가 받은 시각) | 메타 리드마다 |
| `contacted` | 컨택 성공 | `compass_lead_contact_v.first_connected_at`(첫 연결) | Compass 리드마다 |
| `trial_account` | 체험 계정 | `compass_leads_v.account_at` | Compass 리드마다 |
| `demo` | 데모 | `demo_at`(잡아 둔 시각 — 지나야 보낸다). 비었는데 단계가 `demo` 면 `updated_at` | Compass 리드마다 |
| `paid` | 결제 | `bd_paid_at`. 비었는데 단계가 `won` 이면 `updated_at` | Compass 리드마다 |

- 보내지 않는 것: 종료(`lost`), BD인계(`bd`), 미팅(`quote`). BD인계는 메타 리드의 43%(115/265)인데 그중 106건이 연결 기록이 없어 품질 신호가 아니다.
- 컨택을 Compass 단계(`contact`)가 아니라 첫 연결 시각으로 잡는 이유: Compass 는 연결돼도 단계가 `new` 에 머무는 일이 많다(연결된 103건 중 60건이 `new`).
- 같은 사람이 광고로 두 번 신청하면(Compass 리드 1건 = 메타 리드 2건, 19명) 접수는 둘 다 보내고, 뒤 단계는 **그 단계 직전에 들어온 신청**에 붙인다.
- 데모는 잡아 둔 시각(`demo_at`)이 지나면 열린 것으로 본다. 취소됐는데 `demo_at` 이 남아 있으면 그대로 나간다 — Compass 에 데모 진행 여부 칸이 생기면 그걸로 바꾼다.
- 단계 시각이 첫 메타 신청보다 앞이면 보내지 않는다(이미 있던 Compass 리드가 다시 신청한 경우). Meta 는 리드 생성 전 시각을 버린다.
- `event_name` 은 Meta 이벤트 관리자의 퍼널 단계 이름이 된다. **켠 뒤에는 바꾸지 않는다** — 바꾸면 Meta 쪽 학습이 끊긴다.

### Meta 스펙(공식 문서, 2026-11-04 확인)

[Payload Specification](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/payload-specification) ·
[Implementing the CRM Integration](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/crm-integration/3-implementing-the-crm-integration) ·
[개요](https://developers.facebook.com/docs/marketing-api/conversions-api/conversion-leads-integration/)

- `action_source: "system_generated"`, `custom_data.event_source: "crm"`, `custom_data.lead_event_source`(CRM 이름 — 여기서는 `"Compass"`).
- `user_data.lead_id` 는 15~17자리 **숫자**(따옴표 없는 JSON 숫자). 16~17자리는 JS number 로 끝자리가 깨지므로 문자열로 들고 있다가 직렬화 때 따옴표만 뗀다(`postMetaCapiEvents`). 틀린 lead_id 는 거절된다.
- `event_time` 은 단계가 바뀐 시각 — **보내는 시각 기준 7일 안**, 리드 생성 뒤여야 한다. 그래서 과거분 백필은 7일까지만 된다.
- 첫 단계(접수)도 리드마다 보내고, 앞 단계가 뒤 단계보다 먼저 가게 한다. 최소 하루 한 번, 실시간~매시간 권장.
- 묶음(최대 1,000건) 안 이벤트 하나만 틀려도 **묶음 전체를 버린다** → 1건씩 보낸다.
- 최적화할 단계는 리드 생성 뒤 28일 안에 일어나야 하고, 그 단계 전환율이 1~40% 여야 한다.

## 2. 동작

- 크론 `/api/cron/meta-crm-signal`, 매시간 40분(UTC 기준 매시 40분). 인증은 `Authorization: Bearer ${CRON_SECRET}`.
- 꺼져 있으면 DB 도 읽지 않고 200 `disabled`. `?dryRun=true` 는 꺼져 있어도 돈다 — 단계별 건수만 돌려준다(Meta 호출·원장 쓰기 없음, 개인정보 없음).
- 읽기(메타 리드 연결·Compass 단계·연결 사실·원장)가 하나라도 실패하면 보내지 않는다. 원장 표가 없으면 켜져 있어도 보내지 않는다(dryRun 만 빈 원장으로 센다).
- 실행당 50건 상한 + 45초 마감. 오래된 것부터(7일 창을 먼저 벗어날 것부터) 보낸다.
- Meta 가 받은(2xx) 건만 원장에 남긴다. 거절·응답 불명은 남기지 않아 다음 실행이 다시 시도한다 — 7일 창을 벗어나면 저절로 멈춘다. 같은 `event_id` 로 다시 간다.
- 한 메타 리드의 앞 단계가 실패하면 그 실행에서 그 리드의 뒤 단계는 보내지 않는다.
- `META_TEST_EVENT_CODE` 가 있으면 테스트 이벤트로 보내고 **원장에 남기지 않는다**(진짜 발송이 아니므로). 응답의 `testMode: true` 로 보인다.
- 응답 코드: 정상·꺼짐 200, Meta 미설정 503, 읽기 실패·일부 실패(`partial`) 500 — 크론 대시보드에서 보이게.

## 3. dryRun 결과 (2026-11-04 18:50 KST, 운영 DB 읽기 전용, 원장 없음)

메타 리드 번호가 붙은 Compass 리드 265명(메타 리드 284건, 번호 형식 오류 0).

| 단계 | 지금 보낼 것(7일 안) | 7일 지남 | 아직(미래) | 접수 전 |
| --- | ---: | ---: | ---: | ---: |
| `initial_lead` | 47 | 237 | 0 | 0 |
| `contacted` | 27 | 59 | 0 | 17 |
| `trial_account` | 7 | 32 | 0 | 5 |
| `demo` | 5 | 7 | 5 | 2 |
| `paid` | 0 | 0 | 0 | 0 |
| **합계** | **86** | 335 | 5 | 24 |

- 켜면 첫 실행에 50건, 다음 실행에 36건이 나간다. 7일 지난 335건은 Meta 가 받지 않아 보내지 않는다(백필 한계).
- 누적 전환율(265명 기준, 대략): 컨택 39%(103) · 체험 계정 17%(44) · 데모 7%(19) · 결제 0. Meta 의 1~40% 조건으로 보면 **체험 계정 또는 데모**가 최적화 후보다. 결제(`bd_paid_at`·`won`)는 아직 메타 리드에 한 건도 없다.
- 다시 보려면: `curl -H "Authorization: Bearer $CRON_SECRET" "https://<배포 호스트>/api/cron/meta-crm-signal?dryRun=true"`

## 4. 켜기 전 확인

### 법무

1. 개인정보처리방침 이용 목적의 'Meta 광고 및 분석 도구 연동, 캠페인 성과 측정'에 **영업 단계 정보(컨택·체험 계정·데모·결제 여부와 시각)를 Meta 에 보내는 것**이 들어가는가.
2. Meta 가 이 정보를 자기 광고 최적화에 쓰므로 처리위탁이 아니라 **제3자 제공**으로 봐야 하는가. 그렇다면 별도 동의·고지가 필요한가.
3. **국외 이전**(Meta Platforms) 고지가 방침에 있는가.
4. 메타 인스턴트 양식(리드 폼)의 개인정보 고지 문구와 맞는가.
5. 보내는 것은 메타 리드 번호·단계 이름·시각뿐이고 전화·이메일·이름은 보내지 않는다는 점, 원장에도 연락처가 없다는 점을 전제로 검토받는다.

### Meta 이벤트 관리자

1. `META_DATASET_ID` 데이터셋(웹 픽셀과 같은 데이터셋)이 메타 리드 광고 **페이지와 연결된 CRM 데이터 소스**로 설정돼 있는가(이벤트 관리자 → 데이터 소스 → CRM 설정, 또는 리드 광고의 '전환 리드' 설정).
2. CAPI 토큰(`META_CAPI_ACCESS_TOKEN`)이 그 데이터셋에 쓸 수 있는가 — 웹사이트 Lead 가 이미 같은 토큰으로 가므로 대개 그렇다.
3. 테스트 이벤트로 모양 확인: 로컬에서 `META_CRM_SIGNAL_ENABLED=true`, `META_TEST_EVENT_CODE=<이벤트 관리자 테스트 코드>` 로 서버를 띄우고 `/api/cron/meta-crm-signal` 을 한 번 부른다 → 이벤트 관리자 '테스트 이벤트' 탭에 `initial_lead` 등이 `system_generated` 로 보이는지 본다. 테스트 모드는 원장에 남기지 않으므로 진짜 발송분이 사라지지 않는다.
4. 퍼널 단계 매핑: 이벤트 관리자 CRM 퍼널 설정에서 `initial_lead → contacted → trial_account → demo → paid` 순서로 잡고, 최적화 단계(체험 계정 또는 데모)를 고른다.

## 5. 켜는 순서

1. 법무 확인(4절) — 결과를 이 문서에 적는다.
2. 마이그레이션 `20261104_meta_crm_signal_events.sql` 을 서울 프로젝트에 적용 → `npm run check:db` 의 `meta_crm_signal_events` 프로브 확인.
3. 이벤트 관리자 설정·테스트 이벤트 확인(4절).
4. 운영 dryRun 한 번 더 — `ledgerMissing` 이 없어야 한다.
5. Vercel Production 에 `META_CRM_SIGNAL_ENABLED=true`(테스트 코드 `META_TEST_EVENT_CODE` 는 운영에 없어야 한다) → 재배포(환경 변수는 새 배포부터 반영).
6. 다음 정시 40분 실행의 응답·런타임 로그 `[cron/meta-crm-signal]` 에서 `sent`·`rejected` 확인, 이벤트 관리자에 이벤트가 들어오는지 확인.
7. 데이터가 쌓이면 리드 광고 세트의 성과 목표를 '전환 리드 수 최대화'로 바꾼다(광고 운영 판단).

**끄기**: `META_CRM_SIGNAL_ENABLED` 를 지우거나 `true` 가 아닌 값으로 두고 재배포. 원장은 남아 다시 켜도 보낸 건을 다시 보내지 않는다.

## 6. 한계·후속

- 백필은 7일까지 — 켜기 전 일들은 Meta 에 가지 않는다. 켜는 날부터 퍼널이 쌓인다.
- 메타 리드 연결(`lead_refs`)은 2026-09-15 접수분부터다. 그 전 메타 리드는 대상이 아니다.
- 크론 슬롯: 이 크론으로 `vercel.json` 크론이 40개(저장소 상한)가 됐다. 다음 크론은 시간 슬롯(`dispatch/*`) 통합을 먼저 해야 한다.
- 전량 읽기 — 메타 리드가 2만 건을 넘기면 조회를 접수 창으로 좁힌다(코드의 `ponytail:` 주석).
