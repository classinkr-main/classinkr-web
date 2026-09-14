# 리드 연락 상태 — MKT(Compass) 매시간 반영 설계

- 작성: 2026-09-14
- 상태: 설계 승인(2026-09-14). 사용자 결정 = "매시간 자동 반영" + "이탈 리드는 종료로 반영"
- 성격: **러프한 연동**. 콜 기록을 복제하지 않고, 리드 상태 한 칸만 MKT 처리 결과에 맞춘다.
- 쓰기 범위: 어드민 `public.leads` 만. Compass(`crm` 스키마)에는 아무것도 쓰지 않는다.

## 1. 왜

2026-09-14 읽기 전용 집계(건수만, 개인정보 미출력):

| 항목 | 값 |
|---|---|
| 어드민 최근 60일 리드 | 368건 — `new` 366 · `closed` 2 |
| 어드민 연락 기록(`lead_contact_logs`) | **0건** (전체 기간) |
| 전화 있는 리드 중 Compass 리드와 전화 키 매칭 | 363건 중 352건 |
| 매칭된 `new` 350건 중 MKT가 이미 처리한 리드 | **350건 전부** (단계 이동 227 · 사람 손 활동 276, 중복 포함) |
| Compass 활동 분포(매칭 리드) | call 505 · note 202 · system 219 · inflow 59 · stage_change 53 · meeting 32 · alimtalk 28 · sms 2 |

MKT팀은 리드를 Compass에서 처리한다. 어드민은 그 결과를 모르기 때문에 아래 숫자가 전부 사실과 어긋난다.

- 위컴 아침 카드 "미응대", 주간 보고 "미접촉"·접촉률
- 캠페인 허브 신규 리드 탭 "미연락"
- 리드 보드 미확인·컬럼 분포, CRM 홈 우선순위 큐

반대 방향(어드민 → MKT)은 넘길 연락 기록이 없어서 이번 범위에서 뺀다.

## 2. 목표 / 비목표

**목표**
- MKT에서 연락했거나 이탈 처리한 리드를 어드민에서도 각각 연락함(`contacted`)·종료(`closed`)로 보이게 한다.
- 매시간 자동으로 반영하고, 한 방향으로만 바꾼다.
- 위 숫자들을 소비 코드 수정 없이 맞춘다. 전부 `leads.status` 를 읽기 때문이다.

**비목표**
- 어드민 연락 기록(`lead_contact_logs`)을 만들지 않는다. 가짜 기록이 생기면 CRM 타임라인과 NeoCRM 되밀기에 흘러간다.
- 어드민 → Compass 방향 반영
- 되돌리기와 재오픈. `closed` 를 다시 여는 일도 하지 않는다.
- 전환(`converted`) 반영. 어드민 전환은 고객사·딜을 실제로 생성하는 비가역 동작이다.
- 이메일 매칭, 화면(UI) 변경. 기존 Compass 칩이 옆에서 MKT 단계와 담당자를 이미 보여 준다.

## 3. 판정 규칙

**매칭 키**: 전화 키 하나만 쓴다. `normalizePhoneKey`(`lib/compass/normalize.ts`)는 `compass_leads_v.phone_key` 와 같은 식이다.

**대표 행**: 같은 전화 키에 Compass 리드가 여러 건이면 최근성으로 한 건을 고른다. 기준은 `last_inflow_at` → `updated_at` → `created_at` 순 내림차순이고, 동률이면 id가 큰 쪽이다. Compass 칩(`buildCompassOverlayMap`)과 같은 행이 나오게 규칙을 공유한다. 복제하지 않는다.

**사람 손 활동**: `kind ∈ {call, sms, meeting, note, memo, stage_change}`. `alimtalk`·`system`·`inflow`·`import` 는 연락으로 치지 않는다.

| 어드민 현재 상태 | Compass 조건 | 결과 |
|---|---|---|
| `new` | 대표 행 `stage = lost` | `closed` |
| `new` | 매칭 행 중 하나라도 `stage ≠ new`, 또는 매칭 행에 사람 손 활동 1건 이상 | `contacted` |
| `contacted` | 대표 행 `stage = lost` | `closed` |
| `converted`·`closed` | — | 변경 없음 |
| 전화 없음·매칭 없음·위 조건 불충족 | — | 변경 없음 |

- 판정 순서: `lost` 를 먼저 보고, 해당하지 않을 때만 `contacted` 를 본다.
- 확인 도장: 상태가 바뀐 행은 `confirmed_at` 이 비어 있을 때만 현재 시각을 넣는다. 단건 PATCH 가 `new` 를 벗어날 때 도장을 찍는 규칙과 같다.
- 오늘 데이터 적용 결과(60일 `new` 366건): `contacted` 272 · `closed` 78 · 변경 없음 16.

## 4. 구성

| 단위 | 위치 | 역할 |
|---|---|---|
| 판정(순수) | `lib/compass/lead-contact-sync.ts` (신규) | 입력은 어드민 리드 상태, 같은 전화 키의 Compass 행들, 사람 손 활동이 있는 Compass lead id 집합이다. 결과는 `contacted` · `closed` · `null` 중 하나. 서버 의존 없음 |
| 대표 행 규칙 | `lib/compass/overlay.ts` | 지금 비공개인 최근성 규칙을 내보내 판정과 칩이 같이 쓴다 |
| 브리지 읽기 | `lib/compass/bridge.ts` | `compass_activities_v` 에서 kind 필터를 걸고 `lead_id` 만 읽는다. PostgREST 행 상한(1000)에 걸리지 않게 페이지를 나눠 끝까지 읽는다. 기존 계약(throw 안 함, 장애는 `down`)을 따른다 |
| 리드 읽기·쓰기 | `lib/repositories/leads.ts` | ① 대상 읽기: `status ∈ {new, contacted}` 이고 전화가 있는 리드의 `id·phone·status` 만 ② 조건부 적용: `contacted` 는 `status = new` 인 행만, `closed` 는 `status ∈ {new, contacted}` 인 행만 UPDATE → 바뀐 행 중 `confirmed_at` 이 null 인 행에 도장 → 바뀐 행이 있으면 캐시 무효화 1회. JSON 폴백 모드에서는 아무것도 하지 않는다 |
| 오케스트레이터 | `lib/server/lead-contact-compass-sync.ts` (신규) | 리드 읽기 → 전화 키 300개씩 `compass_leads_v` 조회 → 어드민 `new` 리드 중 매칭 행 단계가 전부 `new` 인 경우만 활동 조회(나머지는 단계만으로 판정이 끝남) → 판정 → `dryRun` 이면 건수만 반환, 아니면 적용하고 `audit_logs` 에 1행(바뀐 id 목록) 기록 |
| 실행 자리 | `app/api/cron/dispatch/[slot]/route.ts` | 매 슬롯(하루 24회)마다 **예약 잡(아침 카드)이 끝난 뒤** 실행한다. 예산 20초. 결과는 응답의 `leadContactSync` 필드로 내보낸다 |

**실행 자리 세부**
- 잡 뒤에 두는 이유: 브리지 조회가 느려져도 아침 카드가 60초 상한 안에서 밀려나지 않는다. 대신 아침 카드는 직전 슬롯(최대 약 1시간 전)에 반영된 상태를 본다.
- `?dryRun=true` 경로는 지금처럼 아침 카드 미리보기를 돌려주고, 동기화 예상 건수(`toContacted`·`toClosed`)를 함께 싣는다. 이 경로에서는 쓰지 않는다.
- 동기화 결과는 슬롯 응답의 `ok` 에 반영하지 않는다. MKT 연결이 한 시간 끊겼다고 슬롯이 500이 되면 아침 카드 모니터링 신호가 흐려진다.
- 알림 설정 조회 실패(기존 503 조기 반환)가 나면 동기화도 건너뛴다. 드문 경우이고 다음 슬롯이 따라잡는다.
- `vercel.json` 은 바꾸지 않는다. 기존 24 슬롯을 그대로 쓴다.

**감사 기록**
- `audit_logs` 에 `action = "lead.status.compass_sync"`, `target_type = "lead"` 로 남긴다.
- `payload` 는 `{ contacted: [id…], closed: [{ id, from }…] }` 이고, 실행자 표시명은 `MKT(Compass) 자동 반영` 이다.
- 바뀐 행이 없으면 기록하지 않는다. 기록 실패는 무시한다(기존 `logAudit` 계약).

## 5. 실패 처리

| 상황 | 동작 | 응답 `status` |
|---|---|---|
| 브리지 조회 중 하나라도 `down` | 이번 실행 전체를 건너뛴다. 쓰기 0. 빈 결과를 "매칭 없음"으로 취급하지 않는다 | `bridge_down` |
| 어드민 리드 읽기 실패 | 쓰기 0 | `failed` |
| 20초 예산 초과 | 응답만 먼저 반환한다. UPDATE 가 조건부라 일부만 적용돼도 다음 실행이 이어서 맞춘다(멱등) | `timeout` |
| UPDATE 실패 | 에러 요약만 남긴다. 이미 적용된 부분은 조건부라 다시 실행해도 안전하다 | `failed` |
| 정상 | 판정 건수와 실제 적용 건수를 반환한다 | `ok` |

## 6. 러프하게 둔 것 (알고 감수)

- **재유입**: 예전에 MKT가 처리한 학원이 다시 문의하면 새 문의도 바로 `contacted`·`closed` 로 잡힐 수 있다. 오늘 데이터로는 결과가 달라지는 건이 0건이다.
- **재오픈 안 함**: MKT가 이탈 리드를 다시 살려도 어드민 `closed` 는 그대로 둔다.
- **MKT 판단 우선**: 어드민에서 직접 연락함으로 둔 리드도 MKT 대표 행이 이탈이면 `closed` 로 간다. 현재 어드민 연락 기록은 0건이다.
- **매칭·지연**: 전화 키로만 매칭한다. 반영은 최대 약 1시간 늦고, Hobby 트리거 오차(±59분)가 더해질 수 있다.
- **수동 규칙은 그대로**: 단건 PATCH 의 "연락중은 연락 기록 저장 뒤에만" 규칙은 유지한다. 자동 반영만 예외인데, 근거가 MKT 활동 기록에 있기 때문이다. `assignLeads` 주석의 "상태 필드 벌크 변경 금지" 원칙에 대해서도, 사전조건을 WHERE 에 거는 좁은 예외라는 점을 코드 주석으로 밝힌다.

## 7. 따라서 맞춰지는 숫자

모두 `leads.status`·`confirmed_at` 을 읽으므로 코드 변경 없이 따라온다.

- 아침 카드 — 미응대 / 상담 진행 / 종료 (`lib/server/lead-morning-brief.ts`, `lib/server/lead-digest-alerts.ts`)
- 주간 보고 — 미접촉·접촉률 (`lib/marketing/weekly-report.ts`), 퍼포먼스 퍼널 `contacted` (`lib/marketing/perf-assemble.ts`)
- 캠페인 허브 신규 리드 탭 — 미연락 (`lib/marketing/new-leads.ts`)
- 리드 보드 — 미확인 게이트·컬럼·응답 대기 (`lib/crm/leads-board-state.ts`, `lib/crm/lead-response-status.ts`)
- CRM 홈 우선순위 큐 (`lib/crm/priority.ts`)

## 8. 테스트

- **판정 규칙 단위 테스트**: 3장 표의 각 행, 사람 손이 아닌 kind 만 있는 경우, `+82 10-…` 형식 전화 매칭, 대표 행 동률(id 큰 쪽), `lost` 가 `contacted` 보다 먼저인 순서.
- **오케스트레이터**
  - 브리지 `down` → 쓰기 호출 0
  - `dryRun` → 쓰기 호출 0, 예상 건수 반환
  - 정상 → 조건부 적용 호출과 audit 1회
  - 바뀐 행 0 → audit 없음
- **dispatch 라우트** (`tests/api/cron-dispatch-route.test.ts` 확장)
  - 동기화가 throw 하거나 예산을 넘겨도 잡 실행과 `ok` 가 그대로다
  - 응답에 `leadContactSync` 가 포함된다
  - `dryRun=true` 에서 쓰기가 없다
- **게이트**: `npm run typecheck` → `npx eslint app components lib --max-warnings=0` → `npm run build`, 그리고 관련 vitest.
- **로컬에서 프로덕션 쓰기 검증은 하지 않는다.** 되돌리기 어렵기 때문에 배포 후 `dryRun` 으로 확인한다.

## 9. 배포 후 확인

1. `GET /api/cron/dispatch/<slot>?dryRun=true` 를 `Authorization: Bearer ${CRON_SECRET}` 로 호출한다. `leadContactSync.toContacted`·`toClosed` 가 설계 시점 실측(272·78)과 비슷한 규모인지 본다. 유입이 늘어난 만큼은 차이가 난다.
2. 다음 정시 슬롯이 지나면 읽기 전용 프로브로 리드 상태 분포를 다시 잰다.
3. 되돌려야 하면 `audit_logs`(`action = lead.status.compass_sync`)의 id 목록으로 SQL 복구한다.
