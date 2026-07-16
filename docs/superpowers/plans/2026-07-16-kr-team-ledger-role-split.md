# KR Team × 매출 장부 역할 재배분 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시각화는 KR Team(`/admin/branch`)으로, 수치 검수는 매출 장부(`/admin/branch/ledger`)로 역할을 재배분하고 두 화면을 크로스 링크로 잇는다.

**Architecture:** 프론트 재배치 중심. 장부 DSH 렌즈의 차트(PacingChart·RevWeekForecastChart, `ledger/shared.tsx` 소재)를 KR Team 개요가 직접 소비하고, 장부 KPI 렌즈의 병목 계산을 KR Team 파이프라인 탭의 신규 섹션으로 이식한다. 장부 DSH 렌즈는 summary API에 새로 노출하는 `dsh_breakdown`(파서가 이미 만드는 `DshBreakdownRow[]`)으로 수치 그리드를 그린다. 데이터 레이어(미러·동기화)는 건드리지 않는다.

**Tech Stack:** Next.js 16 App Router, React 19 클라이언트 컴포넌트, Tailwind 4 (DESIGN.md 팔레트), vitest.

**기준 문서:** 스펙 [docs/superpowers/specs/2026-07-16-kr-team-ledger-merge-design.md](../specs/2026-07-16-kr-team-ledger-merge-design.md) · 목업 [docs/active/mockups/kr-team-unified-2026-07-16.html](../../active/mockups/kr-team-unified-2026-07-16.html) (승인본 — 레이아웃·배지·링크 문구의 정본)

**워크스트림 분할 (병렬 실행):**
- **WS-A (KR Team 쪽)**: Task 1 → 2 → 3. 수정 파일: `components/admin/branch/BranchDashboardClient.tsx`, `components/admin/branch/sections/*`(신규 2개).
- **WS-B (장부 쪽)**: Task 4 → 5. 수정 파일: `components/admin/branch/SalesLedgerWorkbench.tsx`, `components/admin/branch/ledger/*`, `app/api/admin/branch/summary/route.ts`, `components/admin/branch/types.ts`.
- 두 스트림은 파일이 겹치지 않는다. WS-B의 링크가 가리키는 `?tab=pipeline`은 WS-A Task 1이 구현하지만, 링크 자체는 독립적으로 커밋 가능.
- 공통 철칙: 확도 색은 `lib/branch/confidence-tokens.ts`의 `CONFIDENCE_TOKENS`만 사용. 색 리터럴 재정의 금지. 그린은 액센트만. 각 Task 완료 시 개별 커밋.

---

### Task 1 (WS-A): KR Team 탭 딥링크 지원

**Files:**
- Modify: `components/admin/branch/BranchDashboardClient.tsx:80` (activeTab state), `:24` (BranchTab 타입 근처)

**목적:** 장부에서 `/admin/branch?tab=pipeline`으로 진입 시 해당 탭이 열리게 한다. 탭 전환 시 URL도 동기화(뒤로가기 히스토리 오염 방지 위해 `replaceState`).

- [ ] **Step 1:** `useSearchParams`(next/navigation)로 초기 탭 결정. 유효값 검증 후 fallback "overview":

```tsx
import { useSearchParams } from "next/navigation"
// BranchDashboardClient 내부, useState 초기화 교체:
const searchParams = useSearchParams()
const initialTab = ((): BranchTab => {
  const t = searchParams.get("tab")
  return BRANCH_TABS.some((x) => x.id === t) ? (t as BranchTab) : "overview"
})()
const [activeTab, setActiveTab] = useState<BranchTab>(initialTab)
```

- [ ] **Step 2:** 탭 변경 시 URL 반영 — `setActiveTab` 호출부를 감싸는 헬퍼:

```tsx
const selectTab = useCallback((tab: BranchTab) => {
  setActiveTab(tab)
  const url = new URL(window.location.href)
  if (tab === "overview") url.searchParams.delete("tab")
  else url.searchParams.set("tab", tab)
  window.history.replaceState(null, "", url.toString())
}, [])
```
기존 `setActiveTab(...)` 직접 호출부(탭 버튼 onClick, onTabKeyDown)를 `selectTab(...)`으로 교체.

- [ ] **Step 3:** 페이지가 `useSearchParams` 사용 시 Suspense 경계 필요 여부 확인 — `app/admin/branch/page.tsx`는 `force-dynamic`이므로 빌드 에러가 나면 `<Suspense>`로 감싼다.

- [ ] **Step 4:** 검증 & 커밋

```bash
npx eslint components/admin/branch/BranchDashboardClient.tsx --max-warnings=0
npm run build   # useSearchParams Suspense 에러 없는지
git add -A && git commit -m "feat(branch): KR Team 탭 딥링크(?tab=) 지원"
```

---

### Task 2 (WS-A): KR Team 개요 — 매출 누적 흐름 섹션 (장부 DSH 시각화 흡수)

**Files:**
- Create: `components/admin/branch/sections/RevenueFlowSection.tsx`
- Modify: `components/admin/branch/BranchDashboardClient.tsx:322-331` (FiscalRoadmap 자리 교체)

**목적:** 목업 "매출 누적 흐름" 카드 구현. 장부 DSH 렌즈의 두 차트(PacingChart=누적 페이싱, RevWeekForecastChart=주차별 확도)를 개요 탭으로 옮기고, 기존 FiscalRoadmap은 이 섹션으로 대체(중복 제거). 헤더에 "수치 검수 →" 링크.

- [ ] **Step 1:** 데이터 확인 — 차트 두 개의 입력을 파악한다 (구현 전 필독):
  - `PacingChart`: `ledger/shared.tsx` 소재, `summary: BranchSummaryResponse | null` 입력 → KR Team의 기존 `summary.data` 그대로 사용 가능.
  - `RevWeekForecastChart`: `data: RevWeekPoint[]`(주차 프로젝션) + `monthGoal`. 프로젝션은 `buildRevWeekProjection(rows, selectedMonth)`로 파생 — `SalesLedgerWorkbench.tsx:3814` 참조. `rows`는 `/api/admin/branch/pipeline` 응답의 REV 행. 이 유틸의 정의 위치(`ledger/shared.tsx` 또는 workbench 내부)를 grep으로 확인하고, workbench 내부에 있으면 `ledger/shared.tsx`로 export 이동(workbench는 import로 교체 — WS-B와 조율 불필요, shared는 양쪽 모두 read-only 소비).

- [ ] **Step 2:** `RevenueFlowSection.tsx` 작성 — 자체적으로 pipeline을 fetch(개요 탭엔 pipeline fetch가 없음):

```tsx
"use client"
import Link from "next/link"
import { useMemo } from "react"
import { useBranchJson } from "../client-api"
import type { BranchPipelineResponse, BranchSummaryResponse, Period } from "../types"
import { PacingChart, RevWeekForecastChart, buildRevWeekProjection, LoadingPanel } from "../ledger/shared"

interface Props {
  summary: BranchSummaryResponse | null
  loading: boolean
  team: string
  period: Period
  selectedMonth: string
  refreshKey: number
}

export default function RevenueFlowSection({ summary, loading, team, period, selectedMonth, refreshKey }: Props) {
  const monthQuery = period === "M" ? `&month=${encodeURIComponent(selectedMonth)}` : ""
  const pipeline = useBranchJson<BranchPipelineResponse>(
    `/api/admin/branch/pipeline?team=${team}&period=${period}${monthQuery}`, refreshKey)
  const weekProjection = useMemo(
    () => buildRevWeekProjection(pipeline.data?.rows ?? [], selectedMonth),
    [pipeline.data, selectedMonth])
  // ... 카드 마크업: 목업 "매출 누적 흐름" 카드 — 좌 PacingChart / 우 RevWeekForecastChart,
  // 헤더 우측에 <Link href="/admin/branch/ledger" ...>수치 검수 →</Link> (점선 보더 스타일)
}
```
(pipeline 응답의 행 필드명·monthGoal 파생은 Step 1에서 확인한 실제 시그니처를 따른다. 카드 스타일은 기존 개요 카드와 동일: `rounded-xl border border-[rgba(0,0,0,0.08)] bg-white`.)

- [ ] **Step 3:** `BranchDashboardClient.tsx` 개요 탭에서 `<FiscalRoadmap …/>`를 `<RevenueFlowSection …/>`로 교체. `FiscalRoadmap` dynamic import(72-74행)와 미사용 import 제거. `BranchUpcomingDeals`는 그대로(grid 우측 컬럼 유지).

- [ ] **Step 4:** FiscalRoadmap이 다른 곳에서 안 쓰이면 파일 삭제는 하지 **않는다**(이 계획 밖 스코프 — 미사용 상태로 두고 커밋 메시지에 명시).

- [ ] **Step 5:** 검증 & 커밋

```bash
npx eslint components/admin/branch --max-warnings=0
npx vitest run tests/branch
npm run build
git add -A && git commit -m "feat(branch): 개요 탭에 매출 누적 흐름 섹션 (장부 DSH 시각화 흡수, FiscalRoadmap 대체)"
```

---

### Task 3 (WS-A): KR Team 파이프라인 — 활동 병목·담당자 섹션

**Files:**
- Create: `components/admin/branch/sections/ActivityBottleneckSection.tsx`
- Modify: `components/admin/branch/BranchDashboardClient.tsx:339-341` (파이프라인 탭, BranchKpiAccordion 주변)

**목적:** 목업 파이프라인 탭의 "활동 병목 · 담당자" 카드. 장부 `ledger/KpiLensSection.tsx`(322줄)의 병목 계산 로직을 **이식**(컴포넌트 통째 이동 아님 — 워크벤치 state에 결합돼 있음).

- [ ] **Step 1:** `KpiLensSection.tsx`와 그 props를 만드는 워크벤치 파생부(`kpiActivityRows`, `kpiActivityPct`, `kpiMemberGaugeRows` 등 — `SalesLedgerWorkbench.tsx` 5642-5660행에서 역추적)를 읽고, **BranchKpiResponse만으로** 계산 가능한 병목 지표(멤버별 지표 중 달성률 최저 = 병목)를 추출한다.

- [ ] **Step 2:** `ActivityBottleneckSection.tsx` 작성:

```tsx
"use client"
import Link from "next/link"
import { useMemo } from "react"
import type { BranchKpiResponse } from "../types"

// 멤버별로 goal>0인 지표 중 달성률(actual/goal) 최저 지표를 병목으로 판정.
// 임계: <30% 페이스 미달(위험) / <60% 주의 / 그 외 양호 — 목업 배지 3단과 일치.
export default function ActivityBottleneckSection({ kpi, loading }: { kpi: BranchKpiResponse | null; loading: boolean }) {
  const rows = useMemo(() => {
    /* kpi 데이터에서 멤버별 { member, metric, pct, tone } 계산, pct 오름차순 정렬 */
  }, [kpi])
  // 테이블 마크업은 목업 "활동 병목 · 담당자" 카드 그대로:
  // 위험=text-[#B43E3E]+예정 배지톤, 주의=#A8741A, 양호=#084734. NEW 배지 불필요(목업 주석용이었음).
  // 카드 헤더 우측: <Link href="/admin/branch/ledger">딜 수치 편집 →</Link>
}
```
(정확한 계산은 Step 1에서 확인한 KpiLensSection의 기존 로직을 따른다 — 이 계획의 임계값은 기본값이며 기존 로직에 이미 임계가 있으면 그걸 우선한다.)

- [ ] **Step 3:** 파이프라인 탭 배치 — `BranchKpiAccordion`과 신규 섹션을 `grid gap-6 xl:grid-cols-2`로 나란히 (목업과 동일). 기존 파이프라인 테이블/칸반 카드는 그 아래 그대로.

- [ ] **Step 4:** 검증 & 커밋

```bash
npx eslint components/admin/branch --max-warnings=0
npm run build
git add -A && git commit -m "feat(branch): 파이프라인 탭에 활동 병목·담당자 섹션 (장부 KPI 렌즈 이식)"
```

---

### Task 4 (WS-B): 장부 DSH 렌즈 — 수치 상세 그리드로 재구성

**Files:**
- Modify: `app/api/admin/branch/summary/route.ts` (`:267` 근처 — breakdown이 이미 스코프에 있음), `components/admin/branch/types.ts:44-51` (BranchSummaryResponse)
- Create: `components/admin/branch/ledger/DshNumericGrid.tsx`
- Modify: `components/admin/branch/SalesLedgerWorkbench.tsx:5000-5031` (DSH 렌즈 블록)
- Test: `tests/api/admin-branch-summary-breakdown.test.ts` (신규)

**목적:** 목업 장부 DSH 탭의 "목표 · 실적 상세 (단위: 천)" 그리드. 시각화(DshOverviewSection)는 KR Team으로 이동했으므로 이 렌즈에서 제거하고 수치 그리드 + 기존 WeeklyCloseSection만 남긴다.

- [ ] **Step 1:** summary API에 `dsh_breakdown` 노출 — 라우트에서 이미 로드하는 `dsh.breakdown`(`DshBreakdownRow[]`, `lib/branch/parsers/dsh.ts:23-31` 형태: kind goal/status · category · status_type · channel · annual · quarters[4] · months{ym:number})을 응답에 추가:

```ts
// app/api/admin/branch/summary/route.ts 응답 객체에:
dsh_breakdown: breakdown,
```

```ts
// components/admin/branch/types.ts BranchSummaryResponse에:
dsh_breakdown?: Array<{
  kind: "goal" | "status"
  category: string        // "Software" | "Hardware"
  status_type: string     // "New" | "Renew"
  channel: string         // "Direct" | "Channel"
  annual: number
  quarters: [number, number, number, number]
  months: Record<string, number>
}>
```
주의: summary는 unstable_cache 캐시 — 필드 추가는 하위호환. 팀 필터(team=BD 등)와 breakdown의 관계를 라우트에서 확인하고, breakdown이 팀 무관 전사 수치라면 그대로 노출하고 그리드 헤더에 "Team KR 전사" 표기.

- [ ] **Step 2:** 실패 테스트 — 응답에 dsh_breakdown이 실리는지 (기존 summary 라우트 테스트 패턴 모방, `tests/api/` 참조):

```ts
// tests/api/admin-branch-summary-breakdown.test.ts
// 기존 summary 테스트의 목킹 방식을 그대로 따라 breakdown 미러/파서 목킹 후:
expect(json.dsh_breakdown).toBeDefined()
expect(json.dsh_breakdown[0]).toHaveProperty("quarters")
```
Run: `npx vitest run tests/api/admin-branch-summary-breakdown.test.ts` → FAIL 확인 → Step 1 구현 → PASS 확인.

- [ ] **Step 3:** `DshNumericGrid.tsx` 작성 — 목업 그리드 충실 재현:
  - Props: `{ breakdown: NonNullable<BranchSummaryResponse["dsh_breakdown"]>; view: "goal" | "status" | "gap"; onViewChange: (v) => void }`
  - Goal/Status는 kind 필터, **Gap = status − goal** (행 매칭 키: category+status_type+channel, 음수는 `text-[#B43E3E]`).
  - 구조: Total 행(민트 배경 `bg-[#ECFDF5]`) → Software 블록 → Hardware 블록, 열 = 연간·Q1~Q4·회계월(4월~) 전개·비율(연간 대비). 단위 천 표기, `tabular-nums`, 첫 열 sticky, 가로 스크롤 컨테이너.
  - 상단 우측 세그먼트 토글 [Goal|Status|Gap] + "차트로 보기 → KR Team 개요" 링크(`/admin/branch`).

- [ ] **Step 4:** 워크벤치 DSH 렌즈 교체 — `lens === "dsh"` 블록(5000-5031행)에서 `<DshOverviewSection …/>`를 `<DshNumericGrid breakdown={summary.data?.dsh_breakdown ?? []} …/>`로 교체(view state는 렌즈 로컬 useState). `WeeklyCloseSection`은 그대로 유지. `DshOverviewSection` import 제거 — 파일은 다른 소비자가 없으면 삭제(`grep -rn "DshOverviewSection" components app`으로 확인 후).

- [ ] **Step 5:** 탭 라벨 갱신 — `LENSES`(`SalesLedgerWorkbench.tsx:379-382`)의 dsh description을 `"수치 상세 · 목표/실적 그리드"`로.

- [ ] **Step 6:** 검증 & 커밋

```bash
npx eslint app/api/admin/branch components/admin/branch --max-warnings=0
npx vitest run tests/api tests/branch
npm run build
git add -A && git commit -m "feat(ledger): DSH 렌즈를 수치 상세 그리드로 재구성 (시각화는 KR Team으로)"
```

---

### Task 5 (WS-B): 장부 KPI 렌즈 제거 + 크로스 링크

**Files:**
- Modify: `components/admin/branch/SalesLedgerWorkbench.tsx:5642-5660` (KPI 렌즈 블록), `:379-382` (LENSES), 헤더 영역
- Delete(조건부): `components/admin/branch/ledger/KpiLensSection.tsx`

**목적:** KPI 렌즈를 링크 카드로 교체(전환기 안내), 장부 헤더에 "대시보드 보기 →" 추가.

- [ ] **Step 1:** `lens === "kpi"` 블록을 목업 "KPI 링크 카드"로 교체:

```tsx
{lens === "kpi" && (
  <section className="rounded-xl border-[1.5px] border-dashed border-[#BDEFD8] bg-[#ECFDF5] p-10 text-center">
    <p className="text-[15px] font-extrabold text-[#084734]">활동 KPI는 KR Team으로 이동했습니다</p>
    <p className="mt-2 text-[12.5px] leading-relaxed text-[#615D59]">
      목표 대비 활동과 병목·담당자 렌즈는 이제 <b>KR Team › 파이프라인 탭</b>에서 봅니다.
    </p>
    <Link href="/admin/branch?tab=pipeline"
      className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-dashed border-[rgba(0,0,0,0.15)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#084734]">
      KR Team 파이프라인으로 가기 →
    </Link>
  </section>
)}
```

- [ ] **Step 2:** `LENSES`의 kpi description → `"→ KR Team으로 이동"`. `KpiLensSection` import와 그 props를 만들던 파생 변수 중 **KPI 렌즈에서만 쓰이던 것**(kpiActivityRows·kpiTeamGaugeRows 등 — grep으로 다른 사용처 없음을 확인한 것만) 제거. REV 렌즈나 DSH가 공유하는 파생은 남긴다.

- [ ] **Step 3:** `KpiLensSection.tsx` 소비자가 없어졌으면 파일 삭제. (Task 3의 KR Team 신규 섹션은 이 파일을 import하지 않고 로직을 이식했으므로 안전 — 삭제 전 `grep -rn "KpiLensSection" components app` 필수.)

- [ ] **Step 4:** 장부 헤더(제목/새로고침 영역)에 `대시보드 보기 →` 링크 버튼(`/admin/branch`) 추가 — 목업 헤더와 동일 위치.

- [ ] **Step 5:** 검증 & 커밋

```bash
npx eslint components/admin/branch --max-warnings=0
npx vitest run tests/branch
npm run build
git add -A && git commit -m "feat(ledger): KPI 렌즈를 KR Team 링크 카드로 교체 + 대시보드 크로스 링크"
```

---

### Task 6 (통합 게이트 — 오케스트레이터 수행)

- [ ] **Step 1:** `npx eslint app components lib --max-warnings=0`
- [ ] **Step 2:** `npx vitest run`
- [ ] **Step 3:** `npm run build`
- [ ] **Step 4:** 브라우저 검증 — dev 서버로 `/admin/branch`(개요 누적 흐름·파이프라인 병목 섹션·?tab=pipeline 딥링크), `/admin/branch/ledger`(DSH 수치 그리드·KPI 링크 카드·헤더 링크) 확인, 스크린샷.
- [ ] **Step 5:** 스펙 v2 요구사항 대조(개요 흡수 / 파이프라인 흡수 / DSH 재구성 / KPI 제거 / 크로스 링크 5종) 후 최종 커밋.
