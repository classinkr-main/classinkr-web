# 행사 참석자 → 리드 → 전환 트래킹 설계

> 작성: 2026-06-29 · 파트: 4 Growth (CRM) + 6 Platform(마이그레이션) · 관련 에이전트: `growth-crm`

## 1. 배경 / 문제

행사(`public_events`) 참석자는 **출신이 섞여** 있다:

- 마케팅 광고 리드
- 홈페이지 리드
- 기존 고객(직판)
- 파트너 고객 / Neo CRM 계정

원하는 것: **참석자 → 리드 → 전환을 출신별로 추적**(행사가 신규를 만들었나 + 기존/파트너 관계를 키웠나).

현재 상태:

- 행사↔사람 연결은 리드 `notes`의 `[event:<id|slug>]` 토큰뿐 → 리드만 커버, 깨지기 쉬움.
- 행사 참석자 수는 `event-metrics`의 `attendeesCount` **수동 카운트**뿐, 사람 단위 없음.
- 캡처 레이어(`lib/crm/capture/*`, `crm_capture_*` 테이블)는 "명단 붙여넣기 → 매칭 → 체크 확정 → 리드/고객에 활동 기록"을 이미 백엔드로 구현했으나 **(a) UI 없음, (b) 공개 행사 연결 없음.**

## 2. 핵심 결정 — SSOT는 `crm_customer_events`

참석자 명부의 단일 소스는 **`crm_customer_events`(폴리모픽 CRM 활동 레이어)** + 신규 `public_event_id`.

**왜 리드 테이블이 아닌가:** 참석자는 리드뿐 아니라 기존/파트너 고객을 포함한다. `leads`에는 "참석한 기존 고객"을 담을 수 없다. `crm_customer_events.target_type`은 이미 `lead | neo_account | customer | deal | unknown`을 받으므로 4종 신원을 모두 수용한다. 캡처 apply가 이미 매칭 대상에 `event_attended` 활동을 쓴다([lib/crm/capture/apply.ts](../../lib/crm/capture/apply.ts)).

→ "행사 X 참석자" = `crm_customer_events WHERE public_event_id = X AND activity = 행사참석`. 각 행의 `target_type`(+리드면 source)이 출신을 말해준다.

## 3. 출신(origin) 분류 규칙

확정(apply) 시점에 도출해 `attendee_origin`에 스냅샷으로 박는다(리드 source/고객 소속은 나중에 바뀔 수 있으므로 비정규화).

| origin | 도출 규칙 |
|---|---|
| `ad_lead` (광고 리드) | `target_type=lead` & `lead.source` ∈ 광고(`meta_lead_ads`, 향후 google ads) 또는 `gclid/fbclid` 존재 |
| `site_lead` (홈피 리드) | `target_type=lead` & `lead.source` ∈ 사이트(`demo_modal`, `contact_page`, `newsletter` 등) |
| `new_lead` (행사 신규) | 매칭 안 됨(`new_lead_candidate`) → 캡처가 새로 만든 리드(`source=crm_capture`) |
| `existing_customer` (기존 고객) | `target_type=customer` & partner_account = 직판("Classin Direct Sales") |
| `partner_customer` (파트너 고객) | `target_type=neo_account` 또는 `customer` & partner_account = 실제 파트너 |
| `unknown` | 그 외/미상 |

## 4. 데이터 모델 변경

마이그레이션 [supabase/migrations/20260629_event_attendance_link.sql](../../supabase/migrations/20260629_event_attendance_link.sql):

- `crm_customer_events.public_event_id` (FK → `public_events`, ON DELETE SET NULL) + `attendee_origin` (enum) + 인덱스 `(public_event_id, attendee_origin)`
- `crm_capture_batches.public_event_id` (FK → `public_events`)

리드 테이블은 **변경 없음**(SSOT가 활동 레이어이므로). 단, 캡처가 신규 리드를 만들 때 일관성을 위해 `notes`에 `[event:<slug>]` 토큰을 함께 부착한다.

## 5. 운영 워크플로 (capture 인박스)

`/admin/crm` 하위 신규 인박스:

1. **행사 선택** — 이 명단은 행사 X 소속 (`crm_capture_batches.public_event_id`)
2. **명단 붙여넣기** — 웨비나 출석 export / 오프라인 시트 (표 또는 자유 텍스트)
3. **파싱 + 매칭** — 기존 리드/고객/Neo와 자동 매칭(`matchCaptureRows`)
4. **행별 리뷰** — 체크로 확정 대상 선택, 매칭 수정, 활동 타입(`event_attended` 기본)
5. **확정(apply)** — 매칭된 대상에 활동 기록(+`public_event_id`+`attendee_origin`), 신규는 리드 생성, 후속 task 옵션

폼으로 들어온 신청자는 이미 리드(status=new)이므로 별도 명단 입력 없이 리드 보드에서 처리되며, 행사 토큰으로 같은 집계에 포함된다.

## 6. 리포팅 — 출신 × 성과 매트릭스

`/admin/campaigns` 행사 탭에 **읽기 전용** 매트릭스. 행사별로 `crm_customer_events(public_event_id)`를 `attendee_origin`으로 묶고, 대상의 다운스트림 성과를 조인:

| 출신 | 참석 | 신규 전환(딜) | 기존/파트너 확장 |
|---|---|---|---|
| 광고 리드 | n | 리드 `status=converted` 비율 | — |
| 홈피 리드 | n | 리드 `status=converted` 비율 | — |
| 행사 신규 | n | 리드 `status=converted` 비율 | — |
| 기존 고객 | n | — | 후속 딜 |
| 파트너 고객 | n | — | 파트너 경유 딜 |

- 리드-출신 전환: `leads.status` + `convert-v2` 산출물(customer/deal)
- 고객-출신 확장: 해당 customer/deal의 후속 거래

## 7. 3분할 요약

| 역할 | 위치 |
|---|---|
| 하는 곳(명단→체크 확정=신원/출신 결정) | CRM capture 인박스 |
| 데이터 SSOT(참석·출신·행사연결) | `crm_customer_events` + `public_event_id` |
| 보는 곳(출신×성과 전환율) | `/admin/campaigns` 행사 탭 (읽기 전용) |

## 8. 구현 단계

1. 마이그레이션(§4) + `database.types.ts` 타입 확장
2. 출신 도출 유틸 + `applyCaptureBatch`에 `public_event_id`/`attendee_origin` 스탬프 + 신규 리드 토큰
3. `createCaptureBatch`/배치 POST API에 `publicEventId`
4. capture 인박스 UI(§5)
5. campaigns 출신×성과 매트릭스(§6) + 집계 repository
6. CRM 사이드바 진입점
7. 검증: `npx eslint app components lib --max-warnings=0` + `npm run build`

## 9. 결정 필요 / 미해결

- 신청(registered) vs 참석(attended) 구분을 v1에서 둘 다 둘지(활동 타입 2종) 또는 참석만 둘지. v1은 `event_attended` 단일로 시작 권장.
- 광고 리드 판별에서 `gclid/fbclid` 기준 포함 여부(현재 source 매핑으로 충분한지).
- 운영 마이그레이션 적용 시점(공통 철칙 3: 적용 전엔 INSERT 무음 실패 위험).
