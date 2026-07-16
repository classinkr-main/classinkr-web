# KR Team 대시보드 DSH/KPI 자체 DB 미러 설계

- 날짜: 2026-07-16
- 파트: 마케팅/그로스/CRM (growth-crm) + 플랫폼 & 데이터 (platform-data)
- 상태: 설계 승인 → 구현 완료

## 배경 / 문제

매출시트 v2 전환(FY26-27 Sales Ledger) 직후 `/admin/branch`(KR Team) 화면 전체가 500으로 죽었다. 직접 원인은 새 시트에 서비스 계정 뷰어 공유가 아직 안 된 것(운영 액션)이지만, 그 장애가 화면 전체를 죽인 구조적 원인은 따로 있다:

- REV(계약)는 `branch_rev_deals` 미러 테이블이 있어 시트 장애에도 마지막 동기화 데이터로 응답한다.
- **DSH(목표/실적 분해)와 KPI(멤버 지표)는 미러가 없어** `summary`/`kpi`/`insights`가 요청마다 라이브 Google Sheets 읽기에 100% 의존했다. 시트 접근이 끊기면(권한 회수, 시트 교체, API 장애) 대시보드 전체가 즉시 500.

## 목표

시트 장애가 대시보드 가용성을 좌우하지 않게 한다 — 요청 경로는 자체 DB만 보고, 라이브 시트 읽기는 동기화 프로세스(크론/수동 버튼)로 격리한다. REV가 이미 쓰는 패턴을 DSH/KPI로 확장하는 것.

## 설계

### 데이터 읽기 사다리 (단일 규약)

`summary`/`kpi`/`insights` 전부 동일:

1. **매출장부 액티브 임포트** (`sales_ledger_active_sources` → `branch_dsh_rows`/`branch_kpi_rows`) — 수동 XLSX 업로드가 활성화된 경우 (기존)
2. **시트 미러** (`branch_dsh_mirror`/`branch_kpi_mirror`, 신규) — 마지막 동기화 스냅샷
3. **라이브 시트** — 미러가 한 번도 채워진 적 없는 초기 상태에서만 닿는 최후 수단

첫 동기화 이후에는 ③에 절대 닿지 않는다. 시트 편집 반영은 "요청당 60초 재읽기"에서 "마지막 동기화 시점"으로 바뀌며, 이 간극은 기존 `SyncStatusBar`의 시트-신선도 경고(sheetModifiedAt vs lastSync)가 이미 표면화한다.

### 신규 테이블 (마이그레이션 `20260716_branch_dsh_kpi_mirror.sql`)

- `branch_dsh_mirror` — 파싱된 DshRow/Breakdown 그대로: `fiscal_year`, `row_level`(team/member/breakdown), `row_kind`(goal/status), team/member/category/status_type/channel, annual, q1~q4, months(jsonb)
- `branch_kpi_mirror` — `fiscal_year`, `period_month`(null=FY 누계 블록), member, pairs(jsonb: 지표별 goal/actual)
- RPC `replace_branch_dsh_mirror`/`replace_branch_kpi_mirror` — FY 단위 delete+insert 단일 트랜잭션 (REV의 `replace_branch_rev_deals` 패턴)

### 동기화

`syncRev()`가 같은 스프레드시트의 REV/DSH/KPI 세 범위를 병렬로 읽어 REV 미러와 함께 DSH/KPI 미러도 교체한다. 같은 시트라 장애 도메인이 동일하므로 run-all의 기존 "rev" 소스 try/catch 격리에 그대로 포함된다. 미러 replace는 자체적으로 `revalidateTag`를 호출해 크론 경로에서도 캐시가 즉시 무효화된다.

### 변경 파일

- `supabase/migrations/20260716_branch_dsh_kpi_mirror.sql` (신규)
- `lib/repositories/branch-dsh-kpi-mirror.ts` (신규) — 읽기(60초 캐시, 기존 `branch-dsh`/`branch-kpi` 태그 공유)·교체, 마이그 미적용 시 테이블 부재를 null로 강등
- `lib/branch/read-dsh-kpi.ts` (신규) — `readDshPreferDb`/`readKpiBlocksPreferDb` 사다리
- `lib/branch/sync/sync-rev.ts` — DSH/KPI 스냅샷 추가
- `app/api/admin/branch/summary/route.ts`, `app/api/admin/branch/kpi/route.ts`, `lib/branch/insights/runner.ts` — 라이브 시트 직접 읽기 제거, 사다리 헬퍼로 교체

### 의도적으로 남긴 것

- `app/api/admin/branch/data-quality/route.ts` — 시트 QC 레인. 검사 대상이 "라이브 시트 그 자체"라 미러를 읽으면 목적이 무너진다(파일 상단 주석에 문서화돼 있음). 시트 장애 시 이 패널만 실패하는 것은 정직한 동작.
- `getSheetModifiedTime` 신선도 힌트 — 이미 실패 시 null 강등이라 비치명적.

## 검증

- `npx eslint app components lib --max-warnings=0` + `npm run build` 통과
- 마이그 미적용 상태에서 기존 동작 보존 확인(테이블 부재 → 강등 → 기존과 동일한 폴백/에러)
- 마이그 적용 후 합성 데이터로 미러 경로 E2E(RPC 적재 → summary/kpi 200 → 정리)

## 실패 매트릭스

| 상태 | 동작 |
|------|------|
| 시트 정상 + 미러 있음 | 미러 서빙 (시트 호출 없음) |
| 시트 장애 + 미러 있음 | 미러 서빙 — **이번 장애가 재발해도 대시보드 생존** |
| 시트 정상 + 미러 없음(첫 배포) | 라이브 시트 폴백 (기존 동작) |
| 시트 장애 + 미러 없음 | 500 + 명시적 에러 (데이터가 존재하지 않으므로 정직한 실패) |
