# 어드민 시각화 인벤토리 & 공용화 설계 (2026-07-03)

[admin-os-unification-master-plan-2026-07-03.md](admin-os-unification-master-plan-2026-07-03.md) Phase C-1의 기초자료.
조사 방법: `components/admin/**` 114개 tsx + `app/admin/**` 페이지 인라인 컴포넌트 전수 스캔(서브에이전트).

## 1. 현황 요약

- Recharts 사용 파일 11개(어드민) 중 **`components/admin/viz/` 테마에 접속한 것은 3개뿐** (overview, crm 2종). 나머지 7개는 툴팁/축 스타일을 각자 재선언.
- **KPI 카드가 8벌 재구현** — `StatCard`×3(동명이인), `MetricCard`×3(동명이인), `SummaryCard`, `KpiCard`, CoreKpiGrid 로컬 카드. props 형태는 사실상 동일(icon/label/value/hint±trend).
- **퍼널이 3가지 방식** 공존: `viz/MiniFunnel`(CSS 비례바) vs `campaigns/FunnelWaterfall`(비례바+전환율·이탈) vs `CrmHomeCharts`(Recharts 수평 BarChart).
- **게이지/진행률 4벌**: `BranchHeroGauges.GaugeRing`(SVG 링)·`RoadmapGauge`, `GoalProgressPanel.Meter/MiniBar`, hardware 위치별 바.
- **금지색 파랑(#1E5DA8) 하드코딩 5파일**: FiscalRoadmap, SalesLedgerWorkbench, BranchHeroGauges, DealMixSection, BranchRegionHeatmap — DESIGN.md "그린 유일 포화색" 위반의 근원.
- 이미 잘 만들어진 공용 기반: `viz/theme.ts`(TONE/CHART/SERIES_PALETTE/gridProps), `viz/ChartTheme.tsx`(ChartTooltip), `viz/Sparkline.tsx`, `viz/MiniFunnel.tsx`, `viz/primitives.tsx`(StatTile·TrendBadge·Panel·EmptyState 등), `viz/index.ts` 배럴(번들 분리 의도 주석 있음).

## 2. 중복 그룹 (통합 대상)

| 그룹 | 벌 수 | 표준 채택 |
|------|------|----------|
| KPI 카드/그리드 | 8 | `viz/primitives.StatTile` 승격 → `viz/KpiCard`(+href/sparkline 슬롯 이식) |
| Recharts 툴팁 재선언 | 7 | `viz/ChartTheme.ChartTooltip` 강제 |
| 퍼널 | 3 | `MiniFunnel`에 `variant:"waterfall"`(전환율·이탈) 흡수 |
| 게이지/진행률 | 4 | `GaugeRing`·`ProgressRoadmap`을 viz로 추출 |
| 이중축 Bar+Line 트렌드 | 2 (MetaPerformance, CampaignTrend) | `viz/ComparisonBarChart` |
| 수평 랭킹 바 | 3 (CrmPerformance·CrmHome·ChannelEfficiency) | `viz/RankedHorizontalBars` |
| 목표선 트렌드 | 2 (CrmPerformance, FiscalRoadmap±Workbench) | `viz/TrendAreaChart`(goalKey) |
| 팔레트 재정의 | 5 | `viz/theme.CHART` 4톤으로 치환, blue 제거 |

## 3. 확장 컴포넌트 API 스케치

서브에이전트 보고의 props 스케치 요지 (구현 시 상세화):

- `viz/KpiCard` — `{ icon, label, value, hint?, trend?{value,label,format,invert}, tone?, sparkline?, href? }`
- `viz/KpiGrid` — `{ items, columns?{base,md,xl}, loading?, error? }` (현재 페이지마다 2/4/5/6열 제각각 → prop화)
- `viz/Funnel` — `{ stages, variant?: "bar"|"waterfall", showConversion? }`
- `viz/GaugeRing` — `{ value, goal, size?, stroke?, tone? }` (미지정 시 pct 자동 톤)
- `viz/ProgressRoadmap` — `{ actual, goal, label, milestones?, showHoverTooltip? }`
- `viz/TrendAreaChart` — `{ data, xKey, yKey, range?, goalKey?, tone? }`
- `viz/ComparisonBarChart` — `{ data, barKeys(≤2), lineKey?, barLabels?, formatBar?, formatLine? }`
- `viz/RankedHorizontalBars` — `{ rows, labelKey, valueKey, formatValue?, tone?, barSize? }`

## 4. 적용 우선순위

1. **KpiCard/KpiGrid** — 8곳 치환, 즉효 최대.
2. **팔레트 강제(blue 제거)** — FiscalRoadmap·BranchHeroGauges·DealMixSection·RegionHeatmap. (SalesLedgerWorkbench는 병행 트랙 충돌로 보류 — [마스터플랜 §6](admin-os-unification-master-plan-2026-07-03.md))
3. **ChartTooltip 강제** — campaigns 4종·analytics.
4. **Funnel 통합** → 5. **Gauge 추출** → 6. Recharts 래퍼 3종(Workbench 분해와 함께 ROI 최대).

신규 화면(스파인 커버리지·리콘실 인박스)은 처음부터 viz 표준만 사용한다.

## 비고

- `components/sections/DashboardPreviewCharts.tsx`는 공개 사이트용 — 이 트랙 비대상.
- hardware "위치 맵"은 지리 맵이 아니라 위치명 프로그레스바 목록 — 명칭과 실체 구분.
- `SalesLedgerWorkbench.tsx`는 6,999줄 단일 파일에 차트 5종 내장 — 분해는 원장 트랙과 조율 후.
