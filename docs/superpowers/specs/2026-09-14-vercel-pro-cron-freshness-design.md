# Vercel Pro 전환 — 크론 정리와 동기화 즉시 반영 설계

- 작성: 2026-09-14
- 상태: 설계 승인(2026-09-14). 문서 검토 뒤 구현 계획으로 넘어간다.
- 사용자 결정 (모두 2026-09-14)
  - 이번 라운드 범위는 "크론 정리 + 신선도" 묶음 하나다. 방화벽, 실행 시간·CPU 튜닝, 배포·비용 정리는 다음 라운드로 미룬다.
  - 동기화 주기는 보수적으로 올린다(하루 3~4회). CRM 개요는 지금처럼 읽을 때 갱신한다.
  - 동기화 버튼은 누르면 바로 동기화되고, 화면에도 바로 반영돼야 한다.
  - 마케팅 자동화는 매칭·시각만 고친다(매시 정각 실행).
  - 방식은 A안이다. 크론은 `vercel.json` 에 직접 적고, 동기화가 끝나면 관련 캐시를 즉시 만료한다.
  - 리드 연락 상태 MKT 반영 작업에는 Pro 전환을 알려 전용 크론으로 옮기게 했다(그 작업에 반영 완료).

## 1. 왜

### 1.1 플랜이 바뀌었다

2026-09-14 Vercel API로 확인했다. 팀 플랜은 **Pro(활성)** 이고 14:31 KST에 바뀌었다. 공식 문서 기준(같은 날 확인)으로 이번 설계에 걸리는 한도는 아래와 같다.

| 항목 | Hobby | Pro |
|---|---|---|
| 크론 최소 간격 | 하루 1회 | 1분 |
| 크론 실행 정밀도 | ±59분 | 분 단위 정시 |
| 크론 수 (프로젝트당) | 100 | 100 |
| 함수 최대 실행 (Fluid) | 300초 | 800초 |
| 런타임 로그 보존 | 1시간 | 1일 |

운영 배포는 Fluid, 기본 실행 상한 300초, standard CPU다. 하루 사용량(Active CPU 0.06시간, 함수 호출 3,161회)으로 보면 이번 변경으로 늘어나는 비용은 월 몇 달러 안쪽이다.

### 1.2 Hobby를 전제로 남은 것

- **발송 크론 24개.** `vercel.json` 에 `/api/cron/dispatch/00`~`/23` 이 따로 있다. 이 때문에 아침 카드 발송 시각은 "시"만 고를 수 있다(`lib/notifications/schedule.ts:4`).
- **줄어든 동기화 주기.** 매출·HW 시트는 원래 4시간마다 돌려야 했지만 지금은 하루 1회다. 채널톡과 Meta 광고 지표도 하루 1회다.
- **순서 방어 코드.** 인사이트 크론은 크론 순서를 믿을 수 없어서 스스로 확인한다(`app/api/cron/sync-branch-insights/route.ts:21`).
- **실패 알림 중복 방지.** 실패 알림은 크론이 하루에 한 번만 돈다는 가정으로 중복을 막는다(`lib/branch/sync/failure-streak.ts:83`).
- **자동화 크론 버그.** 자동화 크론은 하루 1회(09:00 UTC = 18:00 KST)만 돈다. 매일 규칙이 아닌 규칙은 매 호출마다 실행된다(`app/api/cron/automation/route.ts:46`). 프리셋 이름은 "오전 9시"인데 실제로는 KST 18시에 돈다. 지금은 운영 규칙 3개가 전부 초안이라 피해가 없다.
- **빌드 가드와 규칙 문구.** 빌드 가드 `scripts/check-vercel-crons.mjs` 는 하루 1회를 넘는 식을 실패로 처리한다. 규칙 문구 `AGENTS.md` 59~64행도 Hobby 기준이다.
  - 리드 연락 상태 MKT 반영 크론(`50 0,1,4,6,8 * * 1-5`)이 이미 들어와 있어서, 현재 작업 줄기 HEAD는 이 가드에서 실패한다. 아직 원격에 올라가지 않았다. **푸시 전에 가드부터 바뀌어야 한다.**
- **틀린 경고 카드.** 설정 화면에 사실과 다른 경고 카드가 있다(`components/admin/settings/IntegrationControlPanel.tsx:699`). "하루 3회/4회 등록"이라고 되어 있지만 실제로는 하루 1회다.

### 1.3 동기화 버튼이 "바로" 반영되지 않는 이유

버튼을 누르면 동기화는 곧바로 돌고, 끝날 때까지 기다린다. 그런데 반영이 바로 보이지 않는 이유가 세 가지다.

1. **끝나도 화면이 옛 값이다.** 동기화 경로가 캐시 태그를 `revalidateTag(tag, "max")` 로 무효화한다. Next 16.2.4에서 이 호출은 캐시에 "오래됨" 표시만 한다. 그래서 바로 다음 조회는 옛 값을 받고, 새로 만드는 일은 뒤에서 일어난다. 캐시가 겹겹이면(예: 지사 KPI 묶음 캐시 안에 DSH·KPI 미러 캐시) 바깥 캐시가 안쪽의 옛 값으로 다시 채워질 수도 있다. 다음 조회에서 새로 만들게 하려면 `revalidateTag(tag, { expire: 0 })` 를 써야 한다. `updateTag` 는 Server Action 밖에서는 쓸 수 없다.
2. **건너뛰거나 잠겨 있어도 성공처럼 보인다.**
   - 매출 시트 동기화는 10분 실행 잠금에 걸리면 200 `{ ok: false, skipped: true }` 를 돌려준다(`app/api/admin/branch/sync/route.ts:54`). 그런데 화면 네 곳이 모두 이걸 완료로 보여 준다.
   - NEO 동기화는 잠금 확인이 강제 옵션 확인보다 먼저라서(`lib/external-crm/xiaoshouyi-sync.ts:1087`) "강제 CRM"으로도 죽은 잠금을 풀지 못한다.
   - 채널톡과 NEO가 한도에 걸려 일부만 받아 와도 화면에 표시되지 않는다.
3. **일부 새로고침은 서버 캐시를 뚫지 못한다.**
   - 인스타그램: 300초 캐시에 우회 파라미터가 없다(`lib/meta/marketing.ts:824`).
   - 캘린더 연결 상태: 120초 캐시다(`app/api/admin/calendar/health/route.ts:251`).
   - HW 가져오기: 가져온 직후 대시보드가 120초 캐시다(`lib/repositories/hardware-inventory.ts:2023`).
   - 캠페인 헤더 "동기화": 이름과 달리 다시 읽기만 하고 Meta 지표를 받아 오지 않는다(`app/admin/campaigns/page.tsx:636`).

브라우저 쪽은 문제가 없다. POST가 성공하면 `/api/admin/<segment>` 캐시를 지우고, 60초 동안 HTTP 캐시를 우회한다(`lib/admin-client.ts:271`).

## 2. 목표 / 비목표

**목표**
- 크론 규칙과 빌드 가드를 Pro 기준으로 바꾼다.
- 매출·HW 시트, 채널톡, Meta 광고 지표를 하루 3번 동기화한다. 자동화는 매시 정각에 돈다.
- 아침 카드 발송 시각을 분 단위(5분 간격)로 고를 수 있게 하고, 기본값은 지금과 같게 둔다.
- 동기화 버튼과 크론이 끝나면 다음 조회가 새 데이터를 받는다. 결과(완료·이미 실행 중·건너뜀·일부만·실패)는 있는 그대로 화면에 보인다.
- 자동화가 규칙의 시각과 요일에 맞게 돌고, 저장소의 외부 발송 크론 안전 규칙(발송 상한·중복 방지·밀린 건 중지)을 갖춘다.

**비목표**
- **다음 라운드로 미룸:** Vercel 방화벽 레이트리밋, `maxDuration = 60` 일괄 정리, Performance CPU, 배포 흐름, 빌드 비용
- **NEO:** 동기화 이어받기 커서와 운영 접속 설정 복구
- **CRM 개요:** 미리 갱신하는 크론(읽을 때 갱신 유지)
- **Compass 새로고침:** 60초 인스턴스 메모를 우회하는 일. `lib/compass/bridge.ts` 를 다른 작업이 고치고 있어 그 뒤에 따로 한다.
- **저장소 함수 안의 `"max"` 호출:** 교체하지 않는다. 라우트 끝의 즉시 만료가 최종 상태를 정한다. HW 저장소 파일은 다른 작업이 고치는 중이다.
- **옛 스펙 문서:** 날짜가 박힌 문서의 Hobby 문구는 기록이므로 손대지 않는다.
- **새 버튼:** 주간 광고 리포트, 채널톡 문서 가져오기 버튼은 만들지 않는다.

## 3. 크론 스케줄

식은 UTC로 적는다. KST는 UTC+9다.

| 경로 | 지금 | 바꾼 뒤 (UTC 식) | KST |
|---|---|---|---|
| `/api/cron/sync-branch` | `0 8 * * *` | `0 0,4,8 * * *` | 매일 09:00·13:00·17:00 |
| `/api/cron/channel-talk-sync` | `15 0 * * *` | `15 0,4,8 * * *` | 매일 09:15·13:15·17:15 |
| `/api/cron/sync-meta-insights` | `50 20 * * *` | `50 3,8,20 * * *` | 매일 05:50·12:50·17:50 |
| `/api/cron/automation` | `0 9 * * *` | `0 * * * *` | 매시 정각 |
| `/api/cron/dispatch/00`~`/23` (24개) | 시마다 1개 | `/api/cron/dispatch` 하나, `*/5 * * * *` | 5분마다 |
| `/api/cron/sync-branch-insights` | `30 9 * * *` | 그대로 | 18:30 (17:00 동기화 뒤, 자기 방어 유지) |
| `/api/cron/lead-contact-sync` | `50 0,1,4,6,8 * * 1-5` | 그대로 | 평일 09:50·10:50·13:50·15:50·17:50 |
| `/api/cron/sync-external-crm` | `0 1 * * *` | 그대로 | 10:00 (운영 접속 설정이 없어 건너뛰는 중) |
| `/api/cron/lead-weekly-digest` | `0 4 * * 4` | 그대로 | 목 13:00 |
| `/api/cron/lead-monthly-digest` | `0 0 1 * *` | 그대로 | 매월 1일 09:00 |
| `/api/cron/ledger-weekly-close` | `30 14 * * 5` | 그대로 | 금 23:30 |
| `/api/cron/sync-marketing-insights` | `20 0 * * 1` | 그대로 | 월 09:20 |

항목 수는 35개에서 12개로 준다. 시트 403이 풀리지 않는 동안 `sync-branch` 는 하루 3번 실패 기록을 남긴다. 알림은 §6 규칙으로 하루 한 번만 판정한다.

## 4. 빌드 가드와 규칙 문구

### 4.1 `scripts/check-vercel-crons.mjs`

기존 "하루 1회 초과 실패" 검사를 아래 정책으로 바꾼다. 필드 해석(`expandCronField`)과 동적 세그먼트 라우트 탐색(`routeFileForCronPath`)은 그대로 쓴다.

| 검사 | 기준 | 실패 메시지 요지 |
|---|---|---|
| 식 형식 | 5필드, 숫자·범위·목록·스텝 | 기존과 같음 |
| 경로당 하루 실행 수 | 분 값 개수 × 시 값 개수 ≤ **288** (5분 간격) | "5분보다 잦은 크론은 금지" |
| 경로 중복 | 같은 `path` 항목은 하나만 | "경로당 항목 하나" |
| 전체 항목 수 | ≤ **40** (Vercel 한도 100) | "크론 항목이 너무 많다" |
| 라우트 파일 | 존재 | 기존과 같음 |

실패 안내 예시 문구를 `"0 0,4,8 * * *"` 형태로 바꾼다.

### 4.2 `AGENTS.md` "배포 / Cron 안전 규칙"

59~64행을 아래로 교체한다. 인증 규칙(57~58행)과 외부 발송 크론 규칙(65행 이후)은 그대로 둔다.

```md
- Vercel 플랜은 Pro다(2026-09-14 API 확인). 크론은 분 단위 정시에 실행된다.
- `vercel.json` cron 식은 UTC로 적는다. 경로마다 항목은 하나만 두고, 하루 288회(5분 간격) 이하로 둔다. 전체 항목은 40개 이하로 유지한다.
  - 허용 예: `0 0,4,8 * * *`(KST 09·13·17시), `*/5 * * * *`, `50 0,1,4,6,8 * * 1-5`
  - 금지 예: `* * * * *`(하루 1,440회), 같은 경로를 여러 항목으로 나누기
- 주기를 올릴 때는 외부 API 한도, 하루 1회를 전제로 한 실패 알림·중복 방지 코드, 실행 잠금 시간을 함께 확인한다.
- `vercel.json`을 수정한 뒤에는 반드시 `npm run check:vercel-crons`를 실행한다. `npm run build` 전에도 자동 실행된다.
```

같은 뜻으로 `docs/active/playbook/06-platform-data.md:52` 와 `.claude/agents/platform-data.md:13` 을 고친다. 현재 기준 문서 두 곳에는 "2026-09-14 Pro 전환으로 이 제약은 해소, 현재 기준은 AGENTS.md" 한 줄을 덧붙인다. 대상은 `docs/active/admin-settings-design.md` §(Hobby 플랜 안전성 경고)와 `docs/active/admin-settings-webhook-toggles-and-schedule-2026-09-07.md` §4다.

### 4.3 설정 화면 경고 카드

`components/admin/settings/IntegrationControlPanel.tsx` 의 `IntegrationOpsNotice` 카드를 지우고, 이 카드를 렌더하는 곳도 함께 지운다. 담긴 내용이 사실이 아니고, 크론 시각은 이 화면에서 바꾸지 않는다.

## 5. 리드 아침 카드 — 5분 크론

### 5.1 설정 모델 (`lib/notifications/schedule.ts`)

- `LeadDailySchedule` 에 `deliveryMinuteKst` 를 추가한다. 0~55 사이 5분 간격이고, 기본값은 0이다. 그래서 기본 발송은 지금과 같은 11:00 KST다.
- `mergeNotificationSchedule` 은 5로 나눠떨어지지 않거나 범위를 벗어난 값을 기본값으로 되돌린다. 저장된 JSON에 이 키가 없으면 0이다.
- 순수 함수 `findDueNotificationJobs(now, schedule)` 를 추가한다.
  - 오늘 KST 발송 시각 `HH:MM` 을 기준으로, `now` 가 `[발송 시각, 발송 시각 + 30분)` 안이면 그 잡을 돌려준다.
  - `weekdaysOnly` 인데 토·일이면 돌려주지 않는다.
- `kstHourToUtcSlot`, `utcSlotToKstHour` 는 옛 슬롯 라우트와 `tests/server/lead-morning-schedule.test.ts` 에서만 쓴다. 그래서 해당 테스트 케이스와 함께 지운다.

### 5.2 라우트

- `app/api/cron/dispatch/route.ts` 를 새로 만들고 `app/api/cron/dispatch/[slot]/route.ts` 는 지운다.
- 인증은 `Authorization: Bearer ${CRON_SECRET}` 하나다. `maxDuration = 60` 은 유지한다.
- 설정을 읽지 못하면 503을 돌려준다(기존 동작).
- `findDueNotificationJobs` 가 돌려준 잡만 순서대로 실행한다. 30분 따라잡기 창에서 5분마다 여러 번 호출되더라도, 아침 카드는 기존 `lead_digest_runs` 창 단위 선점이 있어 한 번만 나간다.
- `?dryRun=true&at=HH:MM` 은 그 KST 시각을 기준으로 판정하고 미리보기만 돌려준다. `at` 이 없으면 현재 시각을 쓴다.

### 5.3 설정 화면 (`app/admin/settings/page.tsx`)

- 발송 시각 선택에 5분 간격 "분" 선택을 추가한다. 1948행 근처다.
- 1987~1990행 안내 문구를 바꾼다. "한 시간 단위로 예약"과 "정각부터 도착" 문장을 지우고 아래 두 문장으로 적는다.
  - "매일 HH:MM(KST)에 발송합니다."
  - "크론이 늦어져도 30분 안에는 한 번 발송합니다."

## 6. 실패 알림 중복 방지

- `lib/branch/sync/failure-alert.ts` 의 `notifyBranchSyncFailureStreaks` 는 소스별로, 이번 실패 실행이 **KST 그날의 첫 실패 실행**일 때만 알림 여부를 판정한다.
- 판정은 순수 함수 `isFirstFailedRunOfKstDay(runs, source, now)` 로 분리한다. 기존 `shouldAlertSyncFailureStreak`(2·5·8일째)은 그대로다.
- DB 변경은 없다. 판정은 이미 읽고 있는 실행 기록으로 한다.

## 7. 동기화가 끝나면 바로 최신

### 7.1 캐시 태그 묶음과 즉시 만료

`lib/server/sync-cache-tags.ts` 를 새로 만든다.

- `SYNC_CACHE_TAG_BUNDLES`: 동기화가 쓰는 테이블을 읽는 모든 캐시의 태그를 소스별로 묶는다. 바깥·안쪽 캐시 태그를 함께 넣는다.
- `expireSyncCacheTags(...bundleKeys)`: 묶음 안의 태그마다 `revalidateTag(tag, { expire: 0 })` 를 부른다.

| 묶음 | 태그 |
|---|---|
| `branchRev` | `branch-seg`, `branch-dsh`, `branch-kpi`, `branch-rev-deals`, `admin-crm-revenue`, `sales-ledger-imports`, `branch-sync-runs` |
| `branchHw` | `branch-seg`, `branch-hw`, `hardware-inventory`, `branch-sync-runs` |
| `hardwareImport` | `hardware-inventory`, `branch-hw` |
| `neo` | `admin-crm-revenue`, `admin-crm-neo-customers`, `admin-crm-overview`, `admin-crm-unified-snapshot`, `admin-crm-matching-snapshot`, `admin-crm-region-map` |
| `metaDaily` | `marketing-perf` |
| `instagram` | `meta-instagram-dashboard` |
| `calendarHealth` | `admin-calendar-health` |

태그 문자열은 각 모듈이 export 하는 상수를 가져다 쓴다. `branch-seg` 와 `meta-instagram-dashboard` 는 지금 export 되지 않으므로 상수로 export 한다.

**만료 규칙**
- 데이터를 쓴 소스의 묶음만 만료한다. 매출 시트 라우트의 기존 원칙(REV만 성공하면 REV 계열, HW가 있으면 HW 계열)을 따른다.
- 건너뜀(잠김·설정 누락)이면 만료하지 않는다.
- 크론 라우트도 같은 함수를 부른다. `sync-branch`, `sync-meta-insights`, `sync-external-crm` 이 해당된다.

### 7.2 결과 계약

수동 동기화 응답에 공통 필드를 더한다. 매출 시트, HW 가져오기, NEO, 채널톡, Meta 수동 동기화가 대상이다. 기존 필드와 HTTP 상태 코드는 바꾸지 않는다. 지금 매출 시트는 잠김·건너뜀에 200, NEO는 설정 누락에 409, 실패에 500이다.

```ts
type SyncOutcome = "done" | "running" | "skipped" | "partial" | "failed"
interface SyncOutcomeFields {
  outcome: SyncOutcome
  outcomeReason?: string // 사람이 읽는 한 줄, 비밀값·URL 금지
  startedAt?: string // running 일 때 잠금을 잡은 실행의 시작 시각
  warnings?: string[] // 범위 한도·일부만 동기화 같은 경고
}
```

매출 시트 동기화(`runAll` 결과)의 `outcome` 은 아래 규칙으로 정한다.

- `ok` 이면 `done`
- `skipped` 이면 `running`. 잠금을 잡고 있는 실행의 시작 시각을 `startedAt` 에 담는다.
- `ok` 가 아니고 `revOk` 이거나 `hw` 결과가 있으면 `partial`
- 나머지는 `failed`

`lib/admin/sync-outcome.ts`(클라이언트에서도 쓸 수 있는 순수 모듈)의 `describeSyncOutcome(result)` 가 `{ tone: "success" | "info" | "warning" | "error", message }` 를 돌려준다. 버튼 화면은 이 함수로 알림을 띄운다.

- **running:** "이미 동기화 중입니다 (N분 전 시작)"을 안내 톤으로 띄운다.
- **partial:** 경고 톤으로 띄우고 첫 경고를 붙인다.
- **skipped:** 사유를 그대로 보여 준다.

### 7.3 버튼별 변경

| 화면·버튼 | 서버 | 화면 |
|---|---|---|
| 장부 "동기화"(`components/admin/branch/SalesLedgerWorkbench.tsx:2728`), KR Team "새로고침"·"지금 동기화"(`BranchDashboardClient.tsx:500`, `SyncStatusBar.tsx:151`), 딜 "시트 동기화"(`app/admin/crm/deals/page.tsx:715`), "REV 동기화"(`app/admin/crm/deals/rev-sheet/page.tsx:373`) | `app/api/admin/branch/sync/route.ts`: 기존 `"max"` 무효화를 `expireSyncCacheTags` 로 바꾸고 §7.2 규칙으로 `outcome` 을 담는다. `runAll` 이 이미 싣는 `warnings`(REV 범위 한도 경고 등)는 그대로 넘긴다. `maxDuration = 300` | 네 곳 모두 `describeSyncOutcome` 으로 표시. 완료가 아니면 "완료" 문구를 띄우지 않는다 |
| HW "싱크·백업 후 가져오기" | `app/api/admin/hardware/import-sheet/route.ts`: 끝에서 `expireSyncCacheTags("hardwareImport")`, `outcome` 추가, `maxDuration = 300` | 변경 없음. 기존 `refresh()` 가 강제 재조회를 하므로 즉시 만료만으로 해결된다. HW 화면 파일은 다른 작업이 고치고 있어 건드리지 않는다 |
| 캠페인 헤더 "동기화"(`app/admin/campaigns/page.tsx:636`) | 새 `POST app/api/admin/marketing/meta-insights-sync/route.ts`(관리자 인증, `maxDuration = 60`). 크론과 같은 핵심 함수 `lib/marketing/meta-insights-sync.ts` 의 `syncMetaDailyInsights({ days: 3 })` 를 쓰고, 끝나면 `expireSyncCacheTags("metaDaily")`. 같은 인스턴스에서 60초 안에 다시 누르면 직전 성공 결과를 재사용한다. 인스턴스가 여럿이면 두 번 돌 수 있지만 upsert라 해가 없다 | 버튼이 Meta 동기화를 먼저 부르고, 결과를 알린 뒤 `refreshCurrent` 를 강제로 재조회. Meta 설정이 없으면 사유를 보여 주고 재조회만 한다 |
| 인스타그램 "동기화"(`app/admin/blog/page.tsx:736`) | `app/api/admin/meta/instagram/route.ts` 가 `fresh=1` 을 받으면 조회 전에 `expireSyncCacheTags("instagram")` | 버튼이 `fresh=1` 을 붙인다 |
| 캘린더 "연결 상태 새로고침"(`components/admin/calendar/CalendarRail.tsx:126` → `app/admin/calendar/page.tsx:397`) | `app/api/admin/calendar/health/route.ts` 가 `fresh=1` 을 받으면 조회 전에 `expireSyncCacheTags("calendarHealth")` | 새로고침 호출에 `fresh=1` |
| NEO "외부 CRM"·"강제 CRM"(`app/admin/crm/deals/page.tsx:693`) | `lib/external-crm/xiaoshouyi-sync.ts`: 강제일 때, 잠금을 잡은 실행이 **900초**(함수 상한 800초 + 여유)보다 오래됐으면 버려진 실행으로 표시하고 이어서 진행한다. 900초가 안 됐으면 `outcome: "running"`. 라우트는 `expireSyncCacheTags("neo")` 로 누락 태그를 채우고 `complete: false` 면 `outcome: "partial"`, `maxDuration = 800` | `describeSyncOutcome` 으로 표시. 설정 누락을 알리는 준비 점검 흐름은 그대로 |
| 채널톡 "지금 동기화"·"강제 갱신"(`app/admin/channel-talk/page.tsx:416`) | `app/api/admin/channel-talk/sync/route.ts`: 한도에 걸려 일부만 받으면 `outcome: "partial"` 과 `warnings`, `maxDuration = 300` | `describeSyncOutcome` 으로 표시 |
| 브랜치 인사이트 "새로 생성" | 변경 없음. 시트 캐시가 즉시 만료되면 입력이 최신이 된다. 60초 중복 방지는 유지 | 변경 없음 |

## 8. 마케팅 자동화 — 매시 정각

### 8.1 규칙 매칭 (`lib/automation-schedule.ts`, 순수)

- `findLatestOccurrenceKst(cron, now)`: 규칙의 5필드 cron을 **KST로** 해석한다. `now` 이전 60분 안에서 가장 최근의 예정 시각을 돌려주고, 없으면 `null` 이다.
  - 필드 문법은 숫자·`*`·범위·목록·스텝이다.
  - 요일은 0과 7이 일요일이다.
  - 일(day-of-month)과 요일이 둘 다 제한되면 둘 중 하나만 맞아도 된다(표준 cron).
- `isScheduledRuleDue({ cron, now, lastRunAt })`: 예정 시각이 있고, 마지막 실행 기록이 없거나 그 예정 시각보다 이전이면 `true` 다.
- `app/api/cron/automation/route.ts` 의 `isDue` 는 이 함수를 쓴다. 실행 기록 조회가 실패하면 **발송하지 않고**(fail closed) 오류 목록에 담는다. 지금은 실패하면 실행한다.
- 결과적으로 "매일 오전 9시"는 KST 09:00, "매주 월요일 오전 9시"는 월요일에만, "매주 금요일 오전 10시"는 금요일 KST 10:00, "매월 1일"은 1일에만 돈다.

### 8.2 발송 안전장치

| 장치 | 기준 | 위치 |
|---|---|---|
| 지연 큐 1회 처리 상한 | 100건. 남은 건은 다음 정각에 처리 | `lib/repositories/automation-delay.ts` `getDueDelayItems(limit)` |
| 지연 큐 선점 | `status = 'pending' AND processed_at IS NULL` 조건부 업데이트로 `processed_at` 을 먼저 기록한 항목만 보낸다. 보낸 뒤 `sent`/`failed`. 보내다 죽으면 그 항목은 다시 보내지 않고 사람이 확인한다 | 같은 파일에 선점 함수 추가, 조회는 `processed_at IS NULL` 만 |
| 밀린 건 중지 | 예정 시각보다 24시간 넘게 밀린 항목은 보내지 않고 `cancelled` 와 사유를 기록 | 크론 라우트 |
| 규칙 1회 수신자 상한 | 1,000명을 넘으면 보내지 않고 실행 로그를 실패와 사유로 남긴다 | `lib/automation-engine.ts` `executeRule` |
| 미리보기 | `?dryRun=true` 는 실행 대상 규칙과 지연 항목의 수와 ID만 돌려주고, 선점·발송은 하지 않는다 | 크론 라우트 |

DB 변경은 없다. `automation_delay_queue.status` 의 기존 값 `pending/sent/failed/cancelled` 와 `processed_at` 컬럼을 쓴다. 문서 머리 주석(1~16행)을 새 동작에 맞게 고친다.

## 9. 테스트

**순수 로직 (단위)**
- 가드 정책: 허용(`0 0,4,8 * * *`, `*/5 * * * *`, `50 0,1,4,6,8 * * 1-5`), 금지(`* * * * *`, 같은 경로 중복, 41개), 라우트 파일 누락
- `mergeNotificationSchedule` 분 값: 누락, 범위 밖, 5의 배수가 아닌 값
- `findDueNotificationJobs`: 정시, 29분 늦음, 30분 늦음(제외), 주말, `weekdaysOnly: false`
- `isFirstFailedRunOfKstDay`: 첫 실패, 같은 날 두 번째 실패, KST 자정 경계
- `findLatestOccurrenceKst` / `isScheduledRuleDue`: 매일, 매주 월, 매월 1일, 10시 프리셋, KST 자정 경계, 직전 실행 기록 유무
- `describeSyncOutcome`: 다섯 가지 결과와 경고·시작 시각 문구

**라우트**
- `tests/api/cron-dispatch-route.test.ts` 를 새 경로로 옮긴다. 확인할 것: 인증, `dryRun&at`, 대상 없음, 설정 조회 실패 503.
- 자동화 크론: `dryRun` 은 발송 0회, 상한 100건, 밀린 건 취소, 수신자 상한 초과 시 발송 안 함, 선점 실패 항목 건너뜀.
- 매출 시트 동기화: 잠김이면 `outcome: "running"`, 성공하면 `revalidateTag` 가 `{ expire: 0 }` 로 호출됨.
  - 기존 `tests/api/branch-sync-partial-failure-cache.test.ts` 기대값을 새 호출에 맞춘다.
- NEO: `tests/api/admin-crm-external-sync-neo-invalidation.test.ts` 에 새 태그와 900초 잠금 인수를 추가한다.
- Meta 수동 동기화: 인증, 60초 재사용, 설정 누락.
- 인스타그램·캘린더 상태: `fresh=1` 일 때만 만료.

**게이트** (저장소 기준 순서)

```bash
npm run typecheck
npx eslint app components lib --max-warnings=0
npm run build
npx vitest run tests
```

## 10. 배포와 확인

- DB 마이그레이션은 없다. 설정 JSON에 `deliveryMinuteKst` 가 늘지만 옛 코드의 `mergeNotificationSchedule` 은 모르는 키를 무시하므로 되돌려도 안전하다.
- 배포할 줄기의 `vercel.json` 이 `regions: ["icn1"]` 인지 먼저 확인한다. 일부 줄기는 아직 `sin1` 이다.
- **배포 직후**
  1. Vercel API `GET /v9/projects/<project>` 의 `crons.definitions` 에 12개가 새 식으로 올라왔는지 본다.
  2. 발송 크론 `GET /api/cron/dispatch?dryRun=true&at=11:00`, 자동화 크론 `GET /api/cron/automation?dryRun=true` 를 Bearer 인증으로 호출한다. 자동화는 규칙이 전부 초안이라 대상 0이 정상이다.
  3. 관리자 화면에서 장부 "동기화", 캠페인 "동기화", 인스타그램 "동기화", 캘린더 상태 새로고침을 눌러 본다. 매출 시트는 403이 풀리기 전까지 실패로 정직하게 떠야 하고, HW는 성공해야 한다.
- **다음 영업일:** 아침 카드가 11:00 KST에 오는지, 크론 런타임 로그(1일 보존)에 401·500이 없는지 확인한다. 시트 실패 알림은 해당 날에 한 번만 와야 한다.
- 운영 배포·운영 호출이 자동 모드에서 막히면 운영자 스크립트나 사용자 실행으로 넘긴다.

## 11. 커밋 순서

1. **가드와 규칙.** `scripts/check-vercel-crons.mjs` 정책, `AGENTS.md`, playbook 06, platform-data 에이전트 지침, 현재 기준 문서 두 곳에 한 줄, 설정 화면 경고 카드 삭제. 현재 HEAD의 가드 실패를 푸는 커밋이라 가장 먼저 한다.
2. **발송 5분 크론.** 분 단위 설정, 새 dispatch 라우트, 옛 슬롯 라우트와 `vercel.json` 24개 항목 삭제
3. **동기화 시각과 알림.** `sync-branch`·`channel-talk-sync`·`sync-meta-insights` 시각 변경, 실패 알림 그날 첫 실패 판정
4. **즉시 반영.** 캐시 태그 묶음과 즉시 만료, 결과 계약과 문구 함수, 버튼별 변경
5. **자동화.** KST 매칭, 매시 정각, 발송 안전장치, 미리보기
6. **기록.** 배포 확인이 끝나면 이 문서의 상태를 "구현·배포 완료"로 바꾸고, §10 확인 결과(크론 등록 수, 미리보기 응답, 다음 영업일 아침 카드 도착 시각)를 적는다.

각 커밋은 게이트를 통과한 상태로 남긴다. 공유 작업 트리이므로 커밋 전에 파일별 diff를 확인하고, 경로를 지정해 커밋한다.

## 12. 위험

| 위험 | 대응 |
|---|---|
| 즉시 만료로 동기화 뒤 첫 조회가 새로 만드는 동안 느려진다(수백 ms~1초대) | 수동 동기화 직후는 기다리는 것이 기대 동작이다. 크론 뒤 첫 조회 비용은 하루 3번뿐이다 |
| 5분 크론이 하루 288번 설정을 읽는다 | 설정 한 행 조회라 부담이 무시할 만하다. 잡이 없으면 바로 끝난다 |
| 따라잡기 창 안에서 아침 카드가 두 번 나간다 | 기존 `lead_digest_runs` 창 단위 선점이 막는다. 라우트 테스트로 고정한다 |
| 자동화 규칙을 켜는 날 과거분이 몰려 나간다 | 밀린 건 24시간 중지, 1회 100건, 수신자 1,000명 상한 |
| 같은 파일을 다른 작업이 고친다 | HW 화면·저장소 파일과 `lib/compass/bridge.ts` 는 이번 범위에서 뺐다. `vercel.json` 은 커밋 직전에 최신 HEAD 기준으로 다시 맞춘다 |
| 시트 403이 계속되면 실패 기록이 하루 3건으로 는다 | 실패 일수(`failedDays`) 계산은 날짜 단위라 영향이 없다. 알림은 §6으로 하루 한 번만 판정한다 |
