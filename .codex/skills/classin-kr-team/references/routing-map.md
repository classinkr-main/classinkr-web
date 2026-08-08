# KR Team 작업 라우팅 맵

먼저 요청과 일치하는 한 행만 읽는다. import 또는 API 계약이 직접 연결될 때만 다음 행으로 넓힌다.

| 작업면 | 시작 파일 | 필요할 때만 확장 | 우선 테스트 |
| --- | --- | --- | --- |
| 화면 셸·탭·필터·로딩 | `components/admin/branch/BranchDashboardClient.tsx`, `tab-data-needs.ts`, `client-api.ts`, `types.ts` | `app/admin/branch/page.tsx`, `lib/admin-client.ts` | `tests/branch/tab-data-needs.test.ts`, `touch-target-mobile.test.ts`, `pipeline-href-month-param.test.ts` |
| 개요 | `sections/CoreKpiGrid.tsx`, `BranchHeroGauges.tsx`, `RevenueFlowSection.tsx`, `DealMixSection.tsx` | `app/api/admin/branch/summary/route.ts`, `lib/branch/computations/` | `tests/api/admin-branch-summary-breakdown.test.ts`, `tests/branch/computations/` |
| 파이프라인 | `sections/PipelineTable.tsx`, `BranchPipelineKanban.tsx`, `BranchKpiAccordion.tsx`, `ActivityBottleneckSection.tsx` | `app/api/admin/branch/pipeline/route.ts`, `kpi/route.ts`, `lib/branch/computations/pipeline.ts` | `tests/api/branch-pipeline-weekly-payments.test.ts`, `tests/branch/computations/pipeline.test.ts` |
| 히트맵 | `sections/BranchRegionHeatmap.tsx` | `app/api/admin/branch/heatmap/route.ts`, `lib/branch/korea-province-map.ts`, `computations/heatmap.ts` | `tests/branch/computations/heatmap.test.ts`, `heatmap-pipeline-summary-mode.test.ts` |
| AI 인사이트 | `sections/BranchAiInsights.tsx` | `app/api/admin/branch/insights/route.ts`, `lib/branch/insights/` | `tests/branch/insights/` |
| 매출 장부 | `app/admin/branch/ledger/page.tsx`, `components/admin/branch/ledger/` | `SalesLedgerWorkbench.tsx`, `app/api/admin/branch/ledger/`, `lib/repositories/sales-ledger-*` | `tests/branch/ledger-*`, `tests/repositories/sales-ledger-*` |
| 동기화·정합성 | `SyncStatusBar.tsx`, `IntegrityStrip.tsx`, `CrmSyncStrip.tsx` | `app/api/admin/branch/sync/route.ts`, `data-quality/route.ts`, `lib/repositories/branch-sync.ts`, `lib/branch/data-source-freshness.ts` | `tests/branch/data-source-freshness.test.ts`, `crm-sync-*.test.ts`, `tests/api/branch-sync-partial-failure-cache.test.ts` |

## 계약 경계

- `summary` 기본 응답은 KR Team용 경량 응답이다. `dsh_breakdown`은 장부 요청의 `?breakdown=1`에서만 포함한다.
- `summary`는 상단 동기화 상태가 모든 탭에서 소비한다. KPI 요청은 개요·파이프라인에서만 허용한다.
- `pipeline`과 `heatmap`은 같은 REV 원천 사다리를 사용해야 한다. 별도 시트 직접 읽기를 추가하지 않는다.
- 장부 REV 금액·초안·주간 마감은 장부 정본이며, KR Team은 시각화와 탐색 링크만 제공한다.
- CRM 외부 동기화 변경은 `lib/external-crm/`와 CRM API·테스트로 분리한다. KR Team에서는 커버리지 요약만 소비한다.
