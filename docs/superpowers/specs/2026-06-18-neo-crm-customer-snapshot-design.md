# Neo CRM 고객 스냅샷 설계

- 작성일: 2026-06-18
- 브랜치: 2.24
- 상태: 설계 승인됨 (구현 계획 대기)

## 1. 배경 / 문제

어드민 CRM 고객 목록(`/admin/crm/customers` 계열)은 `lib/admin-crm-customers-neo.ts`의
`getNeoCrmCustomers()`가 **매 요청마다** `external_crm_records`에서
`object_api_key`별로 account / `ShroffAccount__c` / opportunity 행을 페이징 스캔하고
(`fetchExternalCrmRows`, `SCAN_LIMIT=5000`), owner 이름 맵(`User` 객체 최대 20k행 스캔)과
제외 owner 목록까지 읽은 뒤 **메모리에서 account별로 3중 조인·집계**한다.

요청당 대략적인 비용:

- account 스캔(최대 2페이지) + ShroffAccount__c(최대 2) + opportunity(최대 2)
- owner 이름 맵(`User` 최대 20페이지, 60s 메모로 일부 완화) + 제외 owner + 최신 synced_at
- 그 뒤 메모리 3중 조인 + 집계(balance 합, expireAt 최소, lastClass 최대, orderAmount 합 …)

클라이언트(`components/admin/crm/NeoCrmCustomersClient.tsx`)는 이 결과를 1회 로드
(`adminFetchJsonCached`, ttl 60s)한 뒤 query/owner/expiring 필터 + 5종 정렬 + 50행 DOM
페이지네이션을 **메모리에서 즉시** 수행한다.

문제는 조립 비용이 행 수에 비례한다는 점이다. 현 규모(한국팀 고객 수백~低수천)에서는
체감되지 않지만 데이터가 수만 건 규모로 커지면 초기 페이로드/조립 비용이 함께 커진다.

## 2. 목표 / 비목표

### 목표
- 고객 행을 **미리 비정규화·집계해 두는 스냅샷 테이블**을 만들어, 읽기 시 조립 비용을
  O(1)(사전 조인된 테이블 1스캔)로 만든다.
- **숫자 회귀 0**: 스냅샷의 모든 집계 값(balance/expireAt/lastClass/orderAmount/orderCount,
  summary, owners)이 기존 `getNeoCrmCustomers` 로직과 1:1로 일치한다.
- **반응성 유지**: API 응답 shape를 그대로 두어 클라의 즉시 필터/정렬/페이지네이션 UX를 보존한다.
- **적용 전·후 모두 안 깨짐**: 마이그레이션 미적용/첫 sync 전에도 라이브 계산으로 폴백한다.

### 비목표 (이번 작업에서 제외)
- 서버측 정렬/필터/페이지네이션 엔드포인트. 스냅샷이 이를 *가능하게만* 해두고, 행이
  ~5k+로 페이로드가 무거워질 때 후속 작업으로 한다(`search_text` + 정렬 인덱스 추가만으로 가능).
- 고객 상세 드릴다운(`getNeoCrmCustomerDetail`)은 이미 인덱스 단건 조회라 **무변경**.
- 실시간 갱신/트리거 기반 무효화. 갱신은 기존 동기화 주기(하루 4회 cron + 수동)에 맞춘다.

## 3. 조사 근거 (의사결정 배경)

- **데이터 규모**: 동기화 설정상 객체당 상한 = `pageSize 100 × maxPages 20` = 최대 2,000행
  (`20260610_crm_source_priority_aliases_catalog.sql` 시드). 제외 owner(중국팀) 필터 후 한국팀
  고객은 수백~低수천 행. 전체 테이블 ~2만 행 규모.
- **갱신 빈도**: Vercel cron 하루 4회(`vercel.json`: 22/01/04/07 UTC) +
  어드민 수동 동기화. 둘 다 `runExternalCrmSyncChain`을 거친다. 실시간 아님 → 명확한 적재 훅 존재.
- **선례 패턴**: `20260613_admin_crm_overview_snapshot.sql`(스냅샷 테이블 + RPC, 폴백 내장),
  `20260618_*`(인덱스 + SQL 함수/뷰 + 호출부 폴백). account 링크용 payload 인덱스는
  `20260617_external_crm_query_performance.sql`에 이미 있음.

### MV vs 동기화-시점 테이블 결정
`getNeoCrmCustomers`의 집계에는 `toIso`(에폭 ms / ISO 문자열 / `≤0`은 null 처리), owner 한국이름
우선 해석(`crm_xiaoshouyi_owner_names.korean_name` → `display_name` → raw id), 제외 owner 필터가
얽혀 있다. 이를 SQL(Materialized View)로 포팅하면 **숫자 회귀 위험**이 크다. 사용자가 회귀 0을
하드 요구하므로, **같은 TS 코드로 계산해 적재하는 동기화-시점 스냅샷 테이블**을 택한다(회귀 위험을
구조적으로 제거). 갱신은 배치(4회/일)라 동기화 시점 적재가 자연스럽다.

## 4. 설계

### 4.1 스냅샷 테이블 `neo_crm_customer_snapshot` (마이그레이션 신규)

`NeoCrmCustomerRow`를 평탄화한 1고객=1행.

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `account_id` | `text PRIMARY KEY` | `NeoCrmCustomerRow.accountId` (external_id) |
| `name` | `text NOT NULL` | |
| `owner_id` | `text` | null 가능 |
| `owner_name` | `text NOT NULL` | 해석된 이름 |
| `phone` | `text` | |
| `balance` | `numeric` | **null ⇔ EEO 미연결**. 기존 `eeo ? eeo.balance : null` 의미 보존 |
| `expire_at` | `timestamptz` | EEO expireTime 최소값 |
| `last_class_at` | `timestamptz` | EEO LastClassDate 최대값 |
| `uid` | `text` | EEO uid |
| `order_amount` | `numeric NOT NULL DEFAULT 0` | opportunity 금액 합 |
| `order_count` | `integer NOT NULL DEFAULT 0` | opportunity 건수 |
| `created_at` | `timestamptz` | account createdAt |
| `customer_updated_at` | `timestamptz` | account updatedAt (테이블 자체 bookkeeping과 구분) |
| `search_text` | `text` | `lower(name + ' ' + uid + ' ' + phone + ' ' + owner_name)` — 추후 서버 검색용(무비용 선반영) |
| `snapshot_run_id` | `uuid NOT NULL` | 원자 교체 마커 |
| `source_synced_at` | `timestamptz` | 적재 시점 소스 신선도(latestSyncedAt) |
| `snapshot_at` | `timestamptz NOT NULL DEFAULT now()` | 이 행이 적재된 시점 |

**파생 규칙 (별도 컬럼 불필요)**:
- `withEeoCount` = `balance is not null` 인 행 수 (TS에서 `eeo`가 있으면 balance는 항상 number,
  없으면 null이므로 정확히 일치).

**인덱스 / RLS**:
- PK(`account_id`) + `snapshot_run_id` 인덱스(교체 후 stale 정리 delete용).
- `ENABLE ROW LEVEL SECURITY` + `is_active_admin()` SELECT 정책(기존 스냅샷 테이블과 동일).
  쓰기/읽기는 어드민 service_role 클라이언트가 RLS를 바이패스. (RLS 미적용 시 빈 배열 회귀 방지)
- 서버 정렬용 인덱스(balance/expire/order/owner)는 **YAGNI로 보류** — 후속 서버 페이지네이션 때 추가.

마이그레이션은 `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` / `DROP POLICY IF EXISTS`
패턴으로 멱등하게 작성한다.

### 4.2 집계 빌더 (숫자 회귀 0을 구조적으로 보장)

`lib/admin-crm-customers-neo.ts`:
- 현재 `getNeoCrmCustomers`의 **본문을 그대로** `computeNeoCrmCustomersLive(): Promise<NeoCrmCustomerList>`
  로 추출한다(로직 변경 0). 이것이 라이브 계산이자 폴백이자 스냅샷 적재의 단일 소스.
- summary/owners 계산을 `summarize(rows, now)` / `buildOwners(rows)` 헬퍼로 추출해
  **라이브 경로와 스냅샷-읽기 경로가 공유**한다. → 동일 rows면 summary/owners도 동일.

`lib/external-crm/neo-crm-snapshot.ts` (신규, 쓰기 측):
- `refreshNeoCrmCustomerSnapshot(): Promise<{ ok: boolean; rowCount: number; error: string | null }>`
  1. `const list = await computeNeoCrmCustomersLive()`
  2. `if (!list.ok) return` — 에러 결과로 양호한 스냅샷을 덮어쓰지 않는다.
  3. `runId = crypto.randomUUID()`, `snapshotAt = now`.
  4. `list.rows` → 스냅샷 행 매핑(search_text, source_synced_at = `list.latestSyncedAt`,
     snapshot_run_id = runId, snapshot_at).
  5. 청크(예: 500행) upsert, `onConflict: "account_id"`.
  6. `delete where snapshot_run_id <> runId` — 사라진 고객 제거.
  7. 테이블 없음/권한 오류 등은 catch → 로그 + no-op(적용 전 비파괴).

**원자성 / 빈 윈도우**: upsert(in-place 갱신)는 행을 항상 유지하고, delete는 사라진 고객만
제거하므로 **읽기가 빈 결과를 보는 구간이 없다**. 기존 `xiaoshouyi-sync.ts`의 run_id +
is_stale 패턴과 동일한 관용구.

### 4.3 동기화 훅

`lib/external-crm/sync-chain.ts`의 `runExternalCrmSyncChain`에서 `if (sync.ok && !sync.skipped)`
블록(candidates 생성 뒤)에 `refreshNeoCrmCustomerSnapshot()`을 try/catch로 추가하고,
결과를 `ExternalCrmSyncChainResult`에 포함한다. 수동 동기화도 같은 chain을 타므로 자동 커버.
→ 하루 4회 cron + 수동 시 갱신. (notify 메시지 변경은 선택 — 최소 변경으로 둔다)

### 4.4 읽기 경로 (응답 shape 동일 → 라우트/클라 무수정)

`getNeoCrmCustomers()`는 이름/시그니처/반환 타입(`NeoCrmCustomerList`)을 유지한 채 재작성:
1. `neo_crm_customer_snapshot` 전체를 `fetchSupabasePages`(maxRows 충분히 큼, 예 50,000)로 1쿼리.
2. 에러(테이블 없음) **또는 0행** → `return computeNeoCrmCustomersLive()` (적용 전/첫 sync 전 폴백).
3. 정상이면 스냅샷 행 → `NeoCrmCustomerRow[]` 매핑 후:
   - `rows`: 동일 shape.
   - `summary` = `summarize(rows, Date.now())` — **읽기 시점 fresh now**로 `expiringSoonCount`를
     계산(만료 임박은 날짜가 매일 흐르므로 정확성 유지). 나머지 합계는 행 값 그대로.
   - `owners` = `buildOwners(rows)`.
   - `latestSyncedAt` = 스냅샷 행들의 `source_synced_at` 최대값.
   - `generatedAt` = now.

numeric 컬럼은 기존 코드처럼 `Number(...)`로 강제 변환해 읽는다.

`getNeoCrmCustomerDetail`은 **변경 없음**.

### 4.5 파일 배치
- `lib/admin-crm-customers-neo.ts`: types + `computeNeoCrmCustomersLive` + `summarize`/`buildOwners`
  + `getNeoCrmCustomers`(스냅샷 읽기 + 폴백) + 기존 detail(무변경).
- `lib/external-crm/neo-crm-snapshot.ts`(신규): `refreshNeoCrmCustomerSnapshot`.
- `lib/external-crm/sync-chain.ts`: 훅 추가(neo-crm-snapshot import). 순환 의존 없음
  (sync-chain → neo-crm-snapshot → admin-crm-customers-neo → admin client/owner-names, 단방향).

## 5. 데이터 흐름

```
[cron 4회/일 | 수동]
  → runExternalCrmSyncChain
     → syncXiaoshouyiSnapshots (external_crm_records 갱신)
     → generateExternalCrmLinkCandidates
     → refreshNeoCrmCustomerSnapshot
          → computeNeoCrmCustomersLive()  (3중 조인·집계, 기존 로직)
          → upsert rows (run_id) → delete stale (run_id<>)
                                                   neo_crm_customer_snapshot

[어드민 화면 로드]
  → GET /api/admin/crm/customers-neo
     → getNeoCrmCustomers()
          → 스냅샷 1스캔 → 있으면 매핑+summarize(fresh now)
                         → 없으면/0행 computeNeoCrmCustomersLive() 폴백
     → 클라: 즉시 필터/정렬/50행 페이지네이션 (변경 없음)
```

## 6. 엣지 케이스 / 에러 처리

- **마이그레이션 미적용**: 읽기 스냅샷 쿼리 에러 → 라이브 폴백. 적재는 catch→no-op. (비파괴)
- **적용됐으나 첫 sync 전**: 스냅샷 0행 → 라이브 폴백.
- **sync 실패/부분 실패**: `list.ok=false`면 적재 스킵 → 직전 양호 스냅샷 유지(staleness만 증가,
  소스 자체가 6h 주기이므로 허용 범위).
- **동시 읽기 중 적재**: upsert in-place + 사라진 행만 delete → 항상 완전한 행 집합. 빈 윈도우 없음.
- **balance null 의미**: EEO 미연결을 null로 보존(0과 구분). `withEeoCount`는 `balance is not null`.

## 7. 검증

- **숫자 파리티(필수)**: 일회성 스크립트로 `computeNeoCrmCustomersLive()`와 스냅샷-읽기
  `getNeoCrmCustomers()` 결과를 `accountId` 정렬 후 deep-equal 비교(rows 전 필드 + summary + owners).
  불일치 0 확인.
- **품질 게이트**: `npx eslint app components lib --max-warnings=0` + `npm run build`.
- **마이그레이션 멱등성**: `IF NOT EXISTS` / `DROP ... IF EXISTS` 로 재실행 안전.

## 8. 롤아웃 순서

1. 마이그레이션 추가(테이블/인덱스/RLS) — 적용 전에도 앱은 라이브 폴백으로 동작.
2. 코드 머지(빌더 + 훅 + 읽기 폴백).
3. 마이그레이션 적용.
4. 수동 동기화 1회 트리거 → 스냅샷 최초 적재.
5. 파리티 스크립트로 회귀 0 확인.
