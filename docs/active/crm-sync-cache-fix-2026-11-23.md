# 홈페이지 · Compass · NEO(어드민 CRM) 싱크 실패와 재로딩 정리 (2026-11-23)

브랜치 `fix/crm-sync-cache`. 운영 로그·DB 는 이번에 읽지 못했다(Vercel·Supabase 연결이 이 프로젝트 범위에 닿지 않음) — 아래 원인은 코드 근거다.

## 원인

1. **NEO 동기화가 함수 상한에 끊기면 30분 잠김** — `lib/external-crm/xiaoshouyi-sync.ts`
   - 두 동기화 라우트에 `maxDuration` 이 없고 체인에 시간 예산이 없었다. 객체 × 최대 20페이지 × (요청당 30초 타임아웃·재시도 3회)라
     큰 런은 300초를 넘길 수 있다. 끊기면 잠금 행이 `running` 으로 남는다.
   - 잠금 판정은 `running` 이면 무엇이든 30분, heartbeat 는 객체가 끝날 때만. 잠금 확인이 `force` 확인보다 먼저라 「강제」도 못 푼다.
   - 그 30분 동안 수동·크론 동기화는 HTTP 200 `{ ok: true, locked: true }` — 성공처럼 보이며 아무것도 안 한다.
2. **동기화 뒤에도 옛 화면** — `revalidateTag(tag, "max")` 는 Next 16 에서 "오래됨" 표시만 한다(다음 한 번은 옛 값).
   - 크론 경로는 매출 태그만 걸고 NEO 고객·지역 지도 캐시는 건드리지 않았다(`lib/admin-crm-customers-neo.ts` 주석에 적힌 빈칸).
   - NEO 값을 품은 바깥 캐시(통합 고객·우선순위 큐 스냅샷, os-summary 재연락 원천 300초, CRM 개요)는 어느 경로도 만료하지 않았다.
   - 소스 링크 확정·해제·생성, 쓰기 요청, 딜 라이트 라우트도 "max" — 버튼을 누르고 다시 불러온 화면이 옛 값.
3. **Compass 새로고침이 서버에 닿지 않음** — 화면은 `?force=1` 을 붙이지만 `compass-pipeline`·`compass-summary` 라우트가 읽지 않아
   브리지 60초 인스턴스 메모가 그대로 나갔다.
4. **5분 크론(리드 상태 MKT 반영)이 리드가 많으면 통째로 건너뜀** — 링크(`compass_lead_refs_v`)·id 조회를 100·200개 청크로 **순차** 조회하는데
   메모 마감이 10초라, 신규·연락함 리드가 수천 건이면 마감을 넘겨 `Compass read timeout` → 전체 `bridge_down`(503).
5. **홈페이지 → Compass 리드 전달**은 코드상 정상(실시간 + 매시 대조, event_id 멱등). Compass 는 `source` 를 거르지 않아 `chatbot` 도 받는다.
   다만 라벨이 없어 경로가 영문 `chatbot` 으로 찍혔다(crm 저장소에서 고침). 운영 실패는 주로 env(`COMPASS_BRIDGE_URL`·
   `COMPASS_LEAD_WEBHOOK_TOKEN` ↔ Compass `HOME_LEAD_TOKEN`) 불일치로 난다(11-06 토큰 누락 선례).

## 고친 것

- `xiaoshouyi-sync.ts`: 시간 예산(`XIAOSHOUYI_SYNC_TIME_BUDGET_MS`, 기본 240초)으로 페이지·객체를 멈추고 잠금을 정상으로 닫는다(남은 객체는
  `skipped: time-budget`, `complete: false`). heartbeat 를 페이지마다. 이 서버의 런은 heartbeat 6분 없으면 죽은 런으로 닫는다
  (로컬 MCP 스크립트 런은 30분 유지).
- 두 동기화 라우트 `maxDuration = 300`, 캐시는 `lib/external-crm/sync-cache.ts` → `sync-cache-tags.ts` 의 `neoSync`·`crmSourceLinks` 묶음을
  `{ expire: 0 }` 으로 즉시 만료(새 데이터가 있을 때만).
- 소스 링크·쓰기 요청·딜 라이트 라우트: `{ expire: 0 }`.
- `lib/compass/bridge.ts`: `runWithFreshCompassReads` — `?force=1` 이면 끝난 메모를 건너뛴다(진행 중 조회는 공유). 두 Compass 라우트에 배선.
  링크·id 청크는 4개씩 동시에.

## 운영에서 할 일(코드 밖)

- NEO: 운영 env `XIAOSHOUYI_BASE_URL` + 토큰(또는 서비스 OAuth 4종)이 있는지 설정 화면(연동 상태)에서 확인. 2026-09-14 문서 기준 운영 접속 설정이 없어
  크론이 건너뛰는 중이었다(`docs/superpowers/specs/2026-09-14-vercel-pro-cron-freshness-design.md` §3 표).
- Compass 전달: 홈페이지 `COMPASS_BRIDGE_URL`·`COMPASS_LEAD_WEBHOOK_TOKEN` 과 Compass `HOME_LEAD_TOKEN` 이 같은 값인지.
- 배포 뒤 확인: `/api/cron/lead-contact-sync?dryRun=true`(CRON_SECRET) 가 200 인지, NEO 수동 동기화 뒤 고객 목록·개요가 바로 바뀌는지.

## 남은 일 (TODO)

이 저장소에는 따로 쓰는 TODO·백로그 문서가 없다(후속 과제는 주제별 문서 끝에 적는 관례 — 예: `integration-followups-2026-10-28.md` §4·§8-4).
그래서 이 문서에 둔다. 담당: **코드** = 저장소 수정 · **운영** = env·설정·DB·사람 결정.

### 코드

- [ ] **Compass 광고 라우트 새로고침이 브리지 메모까지 뚫게** — 담당: 코드
  - 대상: `app/api/admin/compass/ads/route.ts`, `adsets/route.ts`, `ad-conversion/route.ts`.
  - 지금: `fresh=1` 이면 자기 Data Cache 는 `revalidateTag(tag, { expire: 0 })` 로 만료하지만, 그 안의 `getCompassAdsDaily`·`getCompassAdsetsDaily`
    (`lib/compass/bridge.ts`)가 60초 인스턴스 메모를 그대로 돌려줘 옛 값이 다시 캐시된다.
  - 방법: ① 캐시 콜백 호출을 `runWithFreshCompassReads(fresh, () => getCachedCompassAds(period))` 로 감싼다(unstable_cache 미스 때 콜백이
    같은 비동기 문맥에서 돌므로 AsyncLocalStorage 가 이어진다 — 테스트로 확인). ② ad-conversion 은 `fresh` 판정을 `isCompassFreshRequest(url)` 로 통일
    (`force=1` 도 받게). ③ `tests/compass/bridge-fresh-reads.test.ts` 와 같은 방식으로 라우트 단위 테스트 추가.

- [ ] **멈춘 페이지부터 이어받기(커서 재개)** — 담당: 코드
  - 대상: `lib/external-crm/xiaoshouyi-sync.ts` `syncXiaoshouyiObject`, `lib/external-crm/incremental-window.ts`.
  - 지금: 시간 예산·페이지 상한으로 멈춘 런은 `cursor_value = "offset:<n>"` 를 남기지만, 다음 런은 처음(offset 0)부터 다시 읽는다.
  - 방법: ① 객체 시작 때 같은 객체의 가장 최근 런이 `success` + `offset:<n>` + 같은 `mode`·`whereClause`·`orderBy` 이고 N시간(예: 24h) 이내면 그 offset 부터
    시작. ② 이어받은 런은 metadata 에 `resumedFrom` 을 남기고, 끝까지 읽은 경우에만 `complete` 로 본다. ③ 이어받은 런은 stale 표시를 하지 않는다
    (처음부터 다 본 런이 아니다) — `staleMarked` 판정 조건에 `resumedFrom == null` 추가. ④ offset 기반이라 사이에 행이 끼면 경계가 밀릴 수 있다 —
    겹침 1페이지(offset − pageSize)부터 다시 읽고 payload_hash 로 중복을 접는다. ⑤ 단위 테스트: 계획 함수(`planResume`)를 순수 함수로 빼서 고정.

- [ ] **뒤쪽 객체가 매번 굶지 않게(순서 회전·객체별 예산)** — 담당: 코드
  - 대상: `xiaoshouyi-sync.ts` `syncXiaoshouyiSnapshots` 의 객체 루프(`runtimeObjects` 는 `syncPriority` 순).
  - 지금: 앞 객체가 240초 예산을 다 쓰면 뒤 객체는 매번 `skipped: time-budget`.
  - 방법(둘 중 하나 또는 둘 다): ① **회전** — 직전 코디네이터 런 metadata 의 `budgetSkippedObjects` 를 읽어 그 객체들을 이번 런 맨 앞으로.
    ② **객체별 예산** — 객체마다 `min(남은 예산, 전체 예산 × 가중치)` 를 상한으로 주고(카탈로그 `metadata.budgetShare`, 기본 균등), 넘으면 그 객체만
    truncated 로 멈추고 다음 객체로. 큰 객체(ResourceInformation__c 6.7만 행)는 이어받기(위 항목)와 함께 써야 끝까지 간다.
    ③ 테스트: 순서 계획 함수를 순수 함수로 빼서 "직전에 건너뛴 객체가 먼저" 를 고정.

- [ ] **maxDuration ↔ 죽은 잠금 6분을 상수 하나에서 유도** — 담당: 코드
  - 대상: `xiaoshouyi-sync.ts`(`SERVER_RUN_STALE_MS`·`DEFAULT_SYNC_TIME_BUDGET_MS`), `app/api/admin/crm/external-sync/route.ts`,
    `app/api/cron/sync-external-crm/route.ts`(`maxDuration = 300`).
  - 지금: 세 값이 따로 적혀 있고 테스트(`tests/external-crm/sync-lock-budget.test.ts`)만 관계를 본다.
  - 방법: ① `lib/external-crm/sync-limits.ts` 에 `EXTERNAL_CRM_SYNC_MAX_DURATION_S = 300` 하나를 두고 예산 = 그 값 − 60초, 죽은 잠금 = 그 값 + 60초로 계산.
    ② Next 는 라우트의 `maxDuration` 이 **정적 리터럴**이어야 해서 import 한 상수를 못 쓴다 — 라우트는 숫자 그대로 두고, 테스트가 라우트 소스의
    리터럴 == 상수 를 검사한다(지금 테스트를 이 방식으로 바꾼다). ③ `XIAOSHOUYI_SYNC_TIME_BUDGET_MS` 상한(270초)도 같은 상수에서 유도.

### 운영·설정

- [ ] **NEO 크론 주기 올리기** — 담당: 운영(배포 설정, `vercel.json` 한 줄 + 승인)
  - 지금: `/api/cron/sync-external-crm` 은 `0 1 * * *`(하루 1번, KST 10:00).
  - 방법: 접속 설정(아래 항목)이 살아난 뒤 하루 3번(예: `0 1,5,9 * * 1-5` = KST 10·14·18시)으로. 빌드 가드 `scripts/check-vercel-crons.mjs` 와
    크론 개수 상한(40)을 같이 본다. 이어받기·회전이 들어가면 큰 객체도 하루 안에 따라잡는다.

- [ ] **운영 NEO 접속 설정 확인** — 담당: 운영
  - Vercel 운영 env 에 `XIAOSHOUYI_BASE_URL` 와, `XIAOSHOUYI_ACCESS_TOKEN` 또는 서비스 OAuth 4종(`XIAOSHOUYI_CLIENT_ID`·`CLIENT_SECRET`·`USERNAME`·`PASSWORD`)이 있는지.
  - 확인 방법: 어드민 설정 → 연동 상태(외부 CRM configured), 또는 딜 화면 「외부 CRM 동기화」 버튼의 사전 점검 문구(`missingEnvGroups`). 값은 화면·로그에 찍지 않는다.

- [ ] **Compass 전달 토큰 일치 확인** — 담당: 운영
  - 홈페이지 운영 env `COMPASS_BRIDGE_URL`(https Compass 오리진) · `COMPASS_LEAD_WEBHOOK_TOKEN` 과 Compass 운영 env `HOME_LEAD_TOKEN` 이 같은 값인지
    (11-06 토큰 누락으로 이틀 전달이 빠진 선례). 다르면 실시간 전달·매시 대조가 둘 다 401 → 「리드 전달 경고」.

- [ ] **배포 뒤 확인** — 담당: 운영
  - ① `GET /api/cron/lead-contact-sync?dryRun=true`(Authorization: Bearer CRON_SECRET) 가 200 이고 `scanned`·`matched` 가 0 이 아닌지(503 `bridge_down` 이면 청크 동시 조회가 부족한 것).
  - ② 딜 화면에서 「외부 CRM 동기화」 → 끝난 직후 NEO 고객 목록·CRM 개요·통합 고객 숫자가 바로 바뀌는지, 응답이 `locked` 로 멈춰 있지 않은지.
  - ③ CRM 홈 Compass 밴드 「새로고침」 → Compass 에서 방금 바꾼 단계가 1분 기다리지 않고 보이는지.

- [ ] **`app/api/admin/crm/coverage/route.ts` 미확인 삭제 결정** — 담당: 사람 결정
  - `/workspace/classinkr-web` 작업 트리(브랜치 `feat/rev-future-week-pending`)에 커밋 안 된 삭제로 남아 있다. 누가 지웠는지 모른다. 이 브랜치에는 넣지 않았다.
  - 방법: 쓰는 곳 확인(`rg "crm/coverage"` — 화면·os-summary 가 같은 원천을 쓴다) → 쓰면 `git checkout -- app/api/admin/crm/coverage/route.ts` 로 되돌리고, 안 쓰면 따로 정리 PR.

- [ ] **로그 검증용 읽기 권한(Vercel·Supabase)** — 담당: 운영
  - 이번 원인은 코드 근거뿐이다. Vercel MCP 는 팀 `muuuuoouuuns-projects` 범위 403, Supabase MCP 는 ClassIn 프로젝트가 목록에 없다.
  - 방법: Vercel 연결에 그 팀 접근을 승인하고, Supabase 연결에 ClassIn 운영 프로젝트를 추가(읽기). 그러면 `external_crm_sync_runs`(남은 `running` 행·`locked` 빈도),
    `lead-contact-sync` 503 빈도, `[compass-reconcile]` 로그로 원인을 실측 확인한다.
