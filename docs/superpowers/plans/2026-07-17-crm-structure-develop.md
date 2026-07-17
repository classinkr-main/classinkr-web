# CRM 구조 디벨롭 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고객DB 빠른 보기 모드·360 드로어 기록 승격·기록 탭 컴포저화·홈페이지 리드 태깅/전환·미응답 SLA·발송 딥링크를 기존 컴포넌트 재사용으로 구현한다.

**Architecture:** 스펙 = [docs/superpowers/specs/2026-07-16-crm-structure-develop-design.md](../specs/2026-07-16-crm-structure-develop-design.md). 새 표면 0, 마이그 1개(`site_inflow` CHECK 확장). 순수 규칙(뷰 매처·origin 분류)은 `lib/crm/`의 테스트 가능한 모듈로 분리하고, 서버 repo와 클라이언트가 이를 공유한다. 폼은 ActivityQuickForm SSOT에 `composer` variant 추가로 일원화.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Supabase(admin client) · vitest(`npm test`, tests/ 디렉토리) · Tailwind 4.

**전역 규칙 (모든 태스크 공통):**
- 검증 게이트: `npx eslint app components lib --max-warnings=0` && `npm run build`. 새 로직은 vitest 유닛 우선.
- 어드민 데이터 접근은 `createSupabaseAdminClient()`만 (server client는 RLS로 빈 배열).
- 팔레트: DESIGN.md 값만. 위험톤 `#B85C33`/`#FEF3EE`/`#F6D5C5`, 그린 `#084734`은 한 화면 1점. 보더 `border-[#e8e8e4]` 계열 유지.
- 커밋은 태스크 단위, 스테이징은 해당 태스크 파일만 (작업 트리에 이 계획과 무관한 수정 파일 3개가 있음 — `components/admin/branch/ledger/DshNumericGrid.tsx`, `components/admin/documents/HardwareQuotesPanel.tsx`, `lib/branch/parsers/dsh.ts`는 절대 스테이징 금지).
- 라인 번호 앵커는 2026-07-17 기준 — 편집 전 해당 심볼을 grep으로 재확인.

---

## Phase 1 — 데이터 기반 (D·E1 서버)

### Task 1: 리드 origin 분류 헬퍼

**Files:**
- Modify: `lib/crm/capture/origin.ts`
- Test: `tests/crm/lead-origin.test.ts` (신규)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/crm/lead-origin.test.ts
import { describe, expect, it } from "vitest"
import { classifyLeadOrigin } from "@/lib/crm/capture/origin"

describe("classifyLeadOrigin", () => {
  it("광고 source 또는 광고 클릭 ID → ad", () => {
    expect(classifyLeadOrigin("meta_lead_ads", false)).toBe("ad")
    expect(classifyLeadOrigin("google_ads", false)).toBe("ad")
    expect(classifyLeadOrigin("demo_modal", true)).toBe("ad")
  })
  it("팀 수기/내부 캡처 source → team", () => {
    expect(classifyLeadOrigin("admin_manual", false)).toBe("team")
    expect(classifyLeadOrigin("channel_talk", false)).toBe("team")
  })
  it("홈페이지 공개 폼 및 미상 → site", () => {
    expect(classifyLeadOrigin("demo_modal", false)).toBe("site")
    expect(classifyLeadOrigin("contact_page", false)).toBe("site")
    expect(classifyLeadOrigin("newsletter", false)).toBe("site")
    expect(classifyLeadOrigin("", false)).toBe("site")
  })
  it("대소문자/공백 무시", () => {
    expect(classifyLeadOrigin("  Meta_Lead_Ads ", false)).toBe("ad")
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/crm/lead-origin.test.ts`. Expected: FAIL (`classifyLeadOrigin` export 없음).

- [ ] **Step 3: 구현** — `lib/crm/capture/origin.ts`에 추가하고 `deriveAttendeeOrigin`의 lead 분기(현재 36-39행)를 이 헬퍼로 교체:

```ts
export type LeadOriginClass = "ad" | "team" | "site"

/** 리드 source 문자열 → 유입 출신. 홈페이지 공개 폼(또는 출처 미상)은 site. */
export function classifyLeadOrigin(source: string | null | undefined, hasAdClickId: boolean): LeadOriginClass {
  const normalized = (source ?? "").trim().toLowerCase()
  if (hasAdClickId || AD_LEAD_SOURCES.has(normalized)) return "ad"
  if (KR_TEAM_LEAD_SOURCES.has(normalized)) return "team"
  return "site"
}
```

`deriveAttendeeOrigin`의 `case "lead"` 본문을:

```ts
    case "lead": {
      const cls = classifyLeadOrigin(input.leadSource, Boolean(input.leadHasAdClickId))
      if (cls === "ad") return "ad_lead"
      if (cls === "team") return "kr_team_lead"
      return "site_lead"
    }
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run tests/crm/lead-origin.test.ts`. Expected: PASS. 회귀: `npm test` 전체 PASS.

- [ ] **Step 5: Commit** — `git add lib/crm/capture/origin.ts tests/crm/lead-origin.test.ts && git commit -m "feat(crm): 리드 origin 분류 헬퍼 classifyLeadOrigin 추출"`

### Task 2: 통합 뷰 규칙 모듈 분리 + 신규 뷰 2종

**Files:**
- Create: `lib/crm/unified-view-rules.ts`
- Modify: `lib/repositories/crm-unified-customers.ts` (타입·매처를 새 모듈로 이동, re-export 유지)
- Test: `tests/crm/unified-view-rules.test.ts` (신규)

배경: `matchesSavedView`·`CrmUnifiedCustomerRow`가 server-only repo 안에 있어 vitest 불가. 순수 규칙을 모듈로 빼서 테스트 가능하게 체계화한다(스펙 §3.A·§D·§E1).

- [ ] **Step 1: 실패하는 테스트 작성** — 핵심 케이스:

```ts
// tests/crm/unified-view-rules.test.ts
import { describe, expect, it } from "vitest"
import {
  matchesSavedView,
  rowVisibleInView,
  type CrmUnifiedCustomerRow,
} from "@/lib/crm/unified-view-rules"

const NOW = new Date("2026-07-17T09:00:00Z").getTime()

function leadRow(partial: Partial<CrmUnifiedCustomerRow>): CrmUnifiedCustomerRow {
  return {
    key: "lead:1", tags: [], source: "lead", sourceLabel: "데모 신청", name: "테스트학원",
    contact: "010-0000-0000", ownerName: null, ownerKeys: [], lifecycle: "new_lead",
    statusLabel: "신규 리드", nextActionLabel: "첫 응답", priorityReason: "-", score: 40,
    moneyLabel: null, href: "#", updatedAt: "2026-07-16T09:00:00Z", expireAt: null, balance: null,
    origin: "site", crmRegistered: false, provisional: false, slaTarget: true,
    firstResponseAt: null, createdAt: "2026-07-16T09:00:00Z",
    ...partial,
  }
}

describe("site_leads 뷰", () => {
  it("홈페이지 유입 & 미등록만 매칭", () => {
    expect(matchesSavedView(leadRow({}), "site_leads", new Set(), NOW)).toBe(true)
    expect(matchesSavedView(leadRow({ crmRegistered: true }), "site_leads", new Set(), NOW)).toBe(false)
    expect(matchesSavedView(leadRow({ origin: "ad" }), "site_leads", new Set(), NOW)).toBe(false)
    expect(matchesSavedView(leadRow({ source: "neo_account" }), "site_leads", new Set(), NOW)).toBe(false)
  })
})

describe("unanswered 뷰", () => {
  it("SLA 대상 & 첫 응답 없음만 매칭", () => {
    expect(matchesSavedView(leadRow({}), "unanswered", new Set(), NOW)).toBe(true)
    expect(matchesSavedView(leadRow({ firstResponseAt: "2026-07-16T10:00:00Z" }), "unanswered", new Set(), NOW)).toBe(false)
    expect(matchesSavedView(leadRow({ slaTarget: false }), "unanswered", new Set(), NOW)).toBe(false)
  })
})

describe("provisional(미확인 신규) 노출 규칙", () => {
  it("site_leads/unanswered 뷰에서만 보인다", () => {
    const row = leadRow({ provisional: true })
    expect(rowVisibleInView(row, "site_leads", new Set(), NOW)).toBe(true)
    expect(rowVisibleInView(row, "unanswered", new Set(), NOW)).toBe(true)
    expect(rowVisibleInView(row, "all", new Set(), NOW)).toBe(false)
    expect(rowVisibleInView(row, "new_leads", new Set(), NOW)).toBe(false)
  })
  it("비-provisional은 기존 뷰 규칙 그대로", () => {
    expect(rowVisibleInView(leadRow({}), "all", new Set(), NOW)).toBe(true)
    expect(rowVisibleInView(leadRow({ lifecycle: "new_lead" }), "new_leads", new Set(), NOW)).toBe(true)
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run tests/crm/unified-view-rules.test.ts`. Expected: FAIL (모듈 없음).

- [ ] **Step 3: 모듈 생성** — `lib/crm/unified-view-rules.ts`. repo에서 다음을 **이동**: `CrmUnifiedCustomerSource`/`CrmUnifiedLifecycle`/`CrmUnifiedSavedView`/`CrmUnifiedCustomerRow` 타입(23행·38-57행), `daysUntil`(278행), `rowMatchesOwner`(273행), `matchesSavedView`(301행). `server-only`·Supabase import 금지(타입과 순수 함수만). Row 타입에 신규 필드 6개 추가:

```ts
export type CrmUnifiedSavedView =
  | "all" | "my_owner" | "priority" | "new_leads" | "needs_care"
  | "expiring" | "dormant" | "hot_lead" | "upsell"
  | "site_leads" | "unanswered"

export interface CrmUnifiedCustomerRow {
  // ...기존 필드 그대로 이동...
  /** 리드 유입 출신 (lead 전용, 그 외 null) */
  origin: "site" | "ad" | "team" | null
  /** NEO(회사 CRM) 등록 확정 여부 — crm_source_links lead→external_account confirmed */
  crmRegistered: boolean
  /** 미확인(confirmed_at null)·status new 리드 — site_leads/unanswered 뷰에서만 노출 */
  provisional: boolean
  /** 응답 SLA 대상 소스(demo_modal/contact_page/meta_lead_ads) 여부 */
  slaTarget: boolean
  /** 이 리드를 대상으로 한 팀 최초 기록 시각 (없으면 null) */
  firstResponseAt: string | null
  /** 리드 생성 시각(SLA 경과 계산용, lead 전용) */
  createdAt: string | null
}
```

`matchesSavedView`에 두 분기 추가(기존 분기 아래):

```ts
  // 홈페이지 유입 & NEO 미등록 — "등록 대기 큐".
  if (view === "site_leads") return row.source === "lead" && row.origin === "site" && !row.crmRegistered
  // 응답 SLA 대상 & 팀 첫 기록 없음.
  if (view === "unanswered") return row.source === "lead" && row.slaTarget && !row.firstResponseAt
```

노출 규칙(매처 + provisional 게이트):

```ts
const PROVISIONAL_VISIBLE_VIEWS: ReadonlySet<CrmUnifiedSavedView> = new Set(["site_leads", "unanswered"])

export function rowVisibleInView(
  row: CrmUnifiedCustomerRow,
  view: CrmUnifiedSavedView,
  ownerKeys: Set<string>,
  nowMs: number
) {
  if (row.provisional && !PROVISIONAL_VISIBLE_VIEWS.has(view)) return false
  return matchesSavedView(row, view, ownerKeys, nowMs)
}
```

repo(`crm-unified-customers.ts`)는 이동한 심볼을 import + `export type`/`export`로 **re-export**(기존 소비자 경로 유지: `Account360Lens`·`CrmUnifiedCustomersClient` 등이 repo에서 타입을 import함).

- [ ] **Step 4: 통과 확인** — `npx vitest run tests/crm/unified-view-rules.test.ts` PASS. `npx eslint app components lib --max-warnings=0` && `npm run build` PASS (repo 컴파일 확인 — 이 시점에 repo의 row 생성부가 신규 필드를 아직 안 채우면 컴파일 에러가 나므로, Task 4 전까지는 각 생성부(`buildPortalCustomerRow` 199행, lead push 352행, neo push 386행 부근)에 `origin: null, crmRegistered: false, provisional: false, slaTarget: false, firstResponseAt: null, createdAt: null` 기본값을 먼저 채워 컴파일 그린 유지).

- [ ] **Step 5: Commit** — `git add lib/crm/unified-view-rules.ts lib/repositories/crm-unified-customers.ts tests/crm/unified-view-rules.test.ts && git commit -m "refactor(crm): 통합 뷰 규칙 모듈 분리 + site_leads/unanswered 뷰"`

### Task 3: `site_inflow` 마이그레이션 + 타입 확장

**Files:**
- Create: `supabase/migrations/20260717_crm_events_site_inflow.sql`
- Modify: `lib/supabase/database.types.ts` (crm_customer_events source_type 유니온 — 실제 심볼명은 `grep -n "meeting_minutes" lib/supabase/database.types.ts`로 확인)
- Modify: `components/admin/crm/rail/activity-contract.ts` (SourceType 9-19행, SOURCE_FILTERS 144-154행, sourceLabel 204-214행)

- [ ] **Step 1: 마이그레이션 SQL 작성** — [supabase/migrations/20260629_crm_events_contact_types.sql](../../../supabase/migrations/20260629_crm_events_contact_types.sql) 패턴 동일:

```sql
-- Add 'site_inflow' to crm_customer_events.source_type.
-- 홈페이지 리드 유입 시 자동 삽입되는 '홈페이지 상담 신청' 타임라인 이벤트 종류.

ALTER TABLE public.crm_customer_events
  DROP CONSTRAINT IF EXISTS crm_customer_events_source_type_check;

ALTER TABLE public.crm_customer_events
  ADD CONSTRAINT crm_customer_events_source_type_check
  CHECK (source_type IN (
    'manual_note',
    'meeting_minutes',
    'recording',
    'calendar_event',
    'lead_contact_log',
    'external_crm',
    'sheet',
    'call',
    'sms',
    'site_inflow'
  ));
```

- [ ] **Step 2: 타입 확장** — database.types의 해당 유니온과 activity-contract에 `"site_inflow"` 추가. activity-contract:

```ts
// SourceType 유니온에 추가
  | "site_inflow"
// SOURCE_FILTERS 배열 끝에 추가
  { key: "site_inflow", label: "홈페이지 유입" },
// sourceLabel에 분기 추가 (기존 if 체인 안, "메모" 폴백 위)
  if (source === "site_inflow") return "홈페이지 유입"
```

- [ ] **Step 3: 마이그레이션 적용** — 이 저장소의 기존 절차대로 적용(적용 방법은 `docs/active/` 마이그 런북 또는 직전 마이그 커밋 메시지 참조; 적용 권한이 없으면 SQL 파일 커밋 후 **적용 필요**를 작업 로그에 명시하고 다음 단계 진행 — 자동 이벤트 삽입(Task 5)은 적용 전까지 CHECK 위반으로 실패하므로 Task 5의 스모크는 적용 후에만 유효).

- [ ] **Step 4: 게이트** — eslint+build PASS.

- [ ] **Step 5: Commit** — `git add supabase/migrations/20260717_crm_events_site_inflow.sql lib/supabase/database.types.ts components/admin/crm/rail/activity-contract.ts && git commit -m "feat(crm): crm_customer_events source_type에 site_inflow 추가"`

### Task 4: 통합 repo 파생 필드 배선

**Files:**
- Modify: `lib/repositories/crm-unified-customers.ts`
- Modify: `lib/repositories/crm-source-links.ts` (`listConfirmedLeadNeoLinkLeadIds` 추가)
- Modify: `lib/repositories/crm-events.ts` (`getLeadFirstResponseMap` 추가)

- [ ] **Step 1: `listConfirmedLeadNeoLinkLeadIds`** — crm-source-links.ts에 추가(기존 `listConfirmedLeadCustomerLinks`(344행 부근, `source_object="leads"` 필터) 패턴 재사용):

```ts
/** NEO 등록 확정된 리드 id 집합 — source_object='leads' → target_type='external_account' confirmed. */
export async function listConfirmedLeadNeoLinkLeadIds(): Promise<Set<string>> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("crm_source_links")
    .select("source_record_key")
    .eq("source_object", "leads")
    .eq("target_type", "external_account")
    .eq("status", "confirmed")
  if (error) throw new Error(`crm_source_links lead→neo 조회 실패: ${error.message}`)
  return new Set((data ?? []).map((row) => String(row.source_record_key)))
}
```

- [ ] **Step 2: `getLeadFirstResponseMap`** — crm-events.ts에 추가. 팀 응답으로 치는 종류 allowlist:

```ts
const RESPONSE_SOURCE_TYPES = ["manual_note", "call", "sms", "meeting_minutes", "recording", "lead_contact_log"] as const

/** 리드별 팀 최초 기록 시각. 자동 유입(site_inflow)·동기화 소스는 응답으로 치지 않는다. */
export async function getLeadFirstResponseMap(): Promise<Map<string, string>> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("crm_customer_events")
    .select("target_id, occurred_at")
    .eq("target_type", "lead")
    .not("target_id", "is", null)
    .in("source_type", [...RESPONSE_SOURCE_TYPES])
    .order("occurred_at", { ascending: true })
  if (error) throw new Error(`리드 첫 응답 조회 실패: ${error.message}`)
  const map = new Map<string, string>()
  for (const row of data ?? []) {
    const id = String(row.target_id)
    if (!map.has(id)) map.set(id, String(row.occurred_at))
  }
  return map
}
```

- [ ] **Step 3: repo 배선** — `getCrmUnifiedCustomers`(331행)의 `Promise.allSettled` 배열에 `listConfirmedLeadNeoLinkLeadIds()`·`getLeadFirstResponseMap()` 2개 추가(실패는 warnings에 문자열 추가하고 빈 Set/Map 폴백 — 기존 소스 실패 처리 패턴과 동일). 리드 행 생성부(348-370행 부근) 변경:
  - `shouldIncludeLeadInUnifiedCustomers(lead)`가 false여도 **행은 생성**하되 `provisional: true`로 표시(기존 `continue` 제거).
  - 필드 채우기:

```ts
      const hasAdClickId = Boolean(lead.gclid || lead.fbclid || lead.msclkid || lead.ttclid)
      const originClass = classifyLeadOrigin(lead.source, hasAdClickId)
      rows.push({
        // ...기존 필드 그대로...
        origin: originClass,
        crmRegistered: neoLinkedLeadIds.has(lead.id),
        provisional: !shouldIncludeLeadInUnifiedCustomers(lead),
        slaTarget: lead.status === "new" && ["demo_modal", "contact_page", "meta_lead_ads"].includes(lead.source),
        firstResponseAt: firstResponseMap.get(lead.id) ?? null,
        createdAt: lead.timestamp,
      })
```

  (neo/portal 행은 Task 2에서 넣은 기본값 유지.) 필터링부(467행 부근 `filterRows` 또는 동등 로직)의 `matchesSavedView` 호출을 `rowVisibleInView`로 교체하고, `viewCounts` 집계도 동일 함수 기준으로 계산(뷰별로 provisional 게이트가 자동 적용됨). 요약 카운트(592-594행)는 필터 결과 기준이므로 변경 없음.

- [ ] **Step 4: 게이트** — `npm test` 전체 PASS, eslint+build PASS. 수동 스모크: `curl`이 아닌 기존 프로브 스타일(tmp/db-probe*.mjs 참고)로 unified API를 호출해 `site_leads`/`unanswered` viewCounts가 숫자로 나오는지 확인.

- [ ] **Step 5: Commit** — `git add lib/repositories/crm-unified-customers.ts lib/repositories/crm-source-links.ts lib/repositories/crm-events.ts && git commit -m "feat(crm): 통합 고객 행에 origin·NEO등록·SLA 파생 필드 + 신규 뷰 배선"`

### Task 5: 홈페이지 리드 유입 자동 이벤트

**Files:**
- Modify: `lib/server/lead-capture.ts` (리드 저장 성공 직후, 기존 notification emit(395행 부근)과 같은 블록)

- [ ] **Step 1: 구현** — `createCrmCustomerEvent`(lib/repositories/crm-events.ts 438행) fire-and-forget 호출. `classifyLeadOrigin`으로 site만 대상:

```ts
      // 홈페이지 유입 자동 타임라인 이벤트 — 실패해도 리드 저장에 영향 없음(스펙 §D).
      const hasAdClickId = Boolean(body.gclid || body.fbclid || body.msclkid || body.ttclid)
      if (savedLeadId && classifyLeadOrigin(body.source, hasAdClickId) === "site") {
        void createCrmCustomerEvent({
          targetType: "lead",
          targetId: savedLeadId,
          targetLabel: body.org || body.name || body.email || "홈페이지 리드",
          sourceType: "site_inflow",
          title: "홈페이지 상담 신청",
          summary: [LEAD_SOURCE_INFLOW_LABELS[body.source] ?? body.source, body.currentPage ?? body.landingPage]
            .filter(Boolean)
            .join(" · "),
          occurredAt: new Date().toISOString(),
        }).catch((error) => {
          console.error("[lead-capture] site_inflow event insert failed:", error)
        })
      }
```

파일 상단에 `import { createCrmCustomerEvent } from "@/lib/repositories/crm-events"`, `import { classifyLeadOrigin } from "@/lib/crm/capture/origin"` 추가. `LEAD_SOURCE_INFLOW_LABELS`는 로컬 상수 `{ demo_modal: "데모 신청", contact_page: "문의", newsletter: "뉴스레터" }`. `CrmCustomerEventCreateInput`의 실제 필드명은 crm-events.ts 306행 `buildCrmCustomerEventInsert` 시그니처로 확인 후 맞춘다(불일치 시 이 스니펫의 키 이름을 그 계약에 맞춰 조정).

- [ ] **Step 2: 게이트** — eslint+build PASS.

- [ ] **Step 3: 스모크(마이그 적용 후)** — 로컬에서 `/api/lead`에 데모 신청 페이로드 POST → `/admin/crm/activity`에서 '홈페이지 유입' 종류 기록 1건 확인.

- [ ] **Step 4: Commit** — `git add lib/server/lead-capture.ts && git commit -m "feat(crm): 홈페이지 리드 유입 시 site_inflow 타임라인 이벤트 자동 생성"`

### Task 6: 'NEO 등록됨' 수동 링크 repo + API

**Files:**
- Modify: `lib/repositories/crm-source-links.ts` (`confirmLeadNeoLink` 추가)
- Create: `app/api/admin/crm/leads/neo-link/route.ts`

- [ ] **Step 1: repo 함수** — 기존 confirmed 링크가 있으면 409 성격의 에러 대신 그대로 반환(멱등):

```ts
export async function confirmLeadNeoLink(input: {
  leadId: string
  neoAccountId: string
  normalizedName?: string | null
}): Promise<{ created: boolean }> {
  const supabase = createSupabaseAdminClient()
  const { data: existing, error: readError } = await supabase
    .from("crm_source_links")
    .select("id, status")
    .eq("source_object", "leads")
    .eq("source_record_key", input.leadId)
    .eq("target_type", "external_account")
    .eq("target_id", input.neoAccountId)
    .maybeSingle()
  if (readError) throw new Error(`lead→neo 링크 조회 실패: ${readError.message}`)
  const now = new Date().toISOString()
  if (existing) {
    if (existing.status === "confirmed") return { created: false }
    const { error } = await supabase
      .from("crm_source_links")
      .update({ status: "confirmed", confirmed_at: now, metadata: { manual: true } })
      .eq("id", existing.id)
    if (error) throw new Error(`lead→neo 링크 확정 실패: ${error.message}`)
    return { created: false }
  }
  const { error } = await supabase.from("crm_source_links").insert({
    source_system: "lead",
    source_object: "leads",
    source_record_key: input.leadId,
    normalized_name: input.normalizedName ?? null,
    target_type: "external_account",
    target_id: input.neoAccountId,
    confidence: 1,
    status: "confirmed",
    confirmed_at: now,
    metadata: { manual: true },
  })
  if (error) throw new Error(`lead→neo 링크 생성 실패: ${error.message}`)
  return { created: true }
}
```

insert 컬럼명은 같은 파일의 기존 insert(496행 부근 `source_object: decision.source_object` 블록)와 대조해 확정. `confirmed_by` 컬럼이 있으면 admin 표시 이름을 함께 기록.

- [ ] **Step 2: API 라우트** — [app/api/admin/crm/source-links/manual/route.ts](../../../app/api/admin/crm/source-links/manual/route.ts)의 인증·검증 패턴 복제:

```ts
import { NextRequest, NextResponse } from "next/server"
import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { confirmLeadNeoLink } from "@/lib/repositories/crm-source-links"

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const body = (await req.json().catch(() => null)) as {
    leadId?: unknown; neoAccountId?: unknown; name?: unknown
  } | null
  if (
    typeof body?.leadId !== "string" || !body.leadId.trim() ||
    typeof body?.neoAccountId !== "string" || !body.neoAccountId.trim()
  ) {
    return NextResponse.json({ error: "leadId와 neoAccountId가 필요합니다." }, { status: 400 })
  }
  try {
    const result = await confirmLeadNeoLink({
      leadId: body.leadId.trim(),
      neoAccountId: body.neoAccountId.trim(),
      normalizedName: typeof body.name === "string" ? body.name.trim().toLowerCase() : null,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error("[POST /api/admin/crm/leads/neo-link]", error)
    return NextResponse.json({ error: "NEO 등록 연결에 실패했습니다." }, { status: 500 })
  }
}
```

- [ ] **Step 3: 게이트** — eslint+build PASS.

- [ ] **Step 4: Commit** — `git add lib/repositories/crm-source-links.ts app/api/admin/crm/leads/neo-link/route.ts && git commit -m "feat(crm): 리드→NEO 수동 등록 확정 API"`

---

## Phase 2 — A. 고객DB 빠른 보기 모드

### Task 7: 칩 승격 + 신규 칩 + URL 동기화

**Files:**
- Modify: `components/admin/crm/CrmUnifiedCustomersClient.tsx`

- [ ] **Step 1: 칩 정의 확장** — `SAVED_VIEW_FILTERS`(82-95행)에 추가:

```ts
  { key: "site_leads", label: "홈페이지 유입", description: "홈페이지로 들어와 NEO 미등록" },
  { key: "unanswered", label: "미응답", description: "첫 응답 전 리드 (24h 초과 위험)" },
```

- [ ] **Step 2: 칩 행을 검색 섹션 위로 이동** — 저장 뷰 블록(535-569행)을 검색 `<section>`(462행) **앞**으로 이동해 독립 행으로 렌더(래퍼: `<div className="mb-3 flex flex-wrap items-center gap-2">`, "저장 뷰" 라벨 스팬은 "빠른 필터"로 변경).

- [ ] **Step 3: 칩 클릭 ↔ URL 동기화** — `selectSavedView`(377행)에서 상태 변경 후 URL 반영. 기존 `?view=` 착지 효과(294-307행)와의 루프 방지를 위해 `lastViewParamRef.current`를 먼저 갱신:

```ts
  const syncViewParam = useCallback(
    (view: SavedViewFilter) => {
      const params = new URLSearchParams(Array.from(searchParams.entries()))
      if (view === "all") params.delete("view")
      else params.set("view", view)
      lastViewParamRef.current = view === "all" ? null : view
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams]
  )
```

> **주의**: raw `window.history.replaceState`를 쓰면 안 된다 — Next `useSearchParams()`와 desync되어, searchParams 훅 값으로 URL을 재조립하는 `setDrawerUrl`이 드로어 열기/닫기 시 `?view=`를 유실한다. `setDrawerUrl`(243행)과 동일하게 **라우터 경유**(`router.replace`, `{ scroll: false }`)로 동기화한다.

`selectSavedView`의 모든 `setSavedView(next)` 경로에서 `syncViewParam(next)` 호출(토글 해제 시 `"all"`).

- [ ] **Step 4: 게이트** — eslint+build PASS. 수동: 칩 클릭 시 주소창 `?view=` 반영, 사이드바 세그먼트 딥링크 착지 동작 불변.

- [ ] **Step 5: Commit** — `git add components/admin/crm/CrmUnifiedCustomersClient.tsx && git commit -m "feat(crm): 고객DB 빠른 필터 칩 승격 + 홈페이지/미응답 칩 + URL 동기화"`

### Task 8: 빠른 보기 모드 렌더링

**Files:**
- Modify: `components/admin/crm/CrmUnifiedCustomersClient.tsx`

- [ ] **Step 1: 모드 파생** — `const quickMode = savedView !== "all"` (URL과 동기화되므로 `?view=` 존재와 동치 — 스펙 §A "파생, 별도 state 없음").

- [ ] **Step 2: 조건부 렌더** — `quickMode`일 때: 검색 `<section>`(462-533행 grid)·라벨 행(571-604행)·요약 타일(606행~)을 렌더하지 않고, 칩 행 옆에 컴팩트 결과줄만:

```tsx
{quickMode ? (
  <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#e8e8e4] bg-white px-4 py-3">
    <p className="text-[13px] font-semibold text-[#111110]">
      {SAVED_VIEW_FILTERS.find((f) => f.key === savedView)?.label}
      <span className="ml-2 text-[12px] font-medium text-[#1a1a1a]/45 tabular-nums">
        {data ? `${data.summary.total.toLocaleString("ko-KR")}건` : "불러오는 중"}
      </span>
    </p>
    <button
      type="button"
      onClick={() => selectSavedView(savedView)}  {/* 토글 해제 → all + 전체 UI 복원 */}
      className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#1a1a1a]/60 hover:bg-[#fafaf8]"
    >
      전체 보기 (검색·필터)
    </button>
  </div>
) : (
  /* 기존 검색 섹션 + 라벨 행 + 요약 타일 그대로 */
)}
```

주의: 숨김이지 초기화가 아님 — 검색어·담당자 필터 상태는 유지되나, 기존 `?view=` 착지 정합 로직(294-307행)이 로컬 필터를 초기화하므로 딥링크 착지 동작은 현행 유지. 알 수 없는 `?view=` 값은 기존대로 `all` 폴백 → quickMode 미진입(스펙 §5).

- [ ] **Step 3: 게이트** — eslint+build PASS.

- [ ] **Step 4: Commit** — `git add components/admin/crm/CrmUnifiedCustomersClient.tsx && git commit -m "feat(crm): 고객DB 빠른 보기 모드 — 칩 진입 시 검색 UI 접힘"`

### Task 9: 리드 행 배지 (홈페이지·정식 리드·미응답 SLA)

**Files:**
- Modify: `components/admin/crm/CrmUnifiedCustomersClient.tsx` (행 렌더부 — 데스크톱 테이블 행(755행 부근)과 모바일 카드(820행 부근) 모두)

- [ ] **Step 1: 배지 헬퍼** — 파일 상단 컴포넌트 밖에:

```tsx
function leadBadges(row: CrmUnifiedCustomerRow, nowMs: number) {
  if (row.source !== "lead") return null
  const badges: Array<{ label: string; tone: "neutral" | "green" | "risk" }> = []
  if (row.origin === "site") badges.push(row.crmRegistered
    ? { label: "정식 리드 · NEO", tone: "green" }
    : { label: "홈페이지", tone: "neutral" })
  if (row.slaTarget && !row.firstResponseAt && row.createdAt) {
    const hours = Math.floor((nowMs - new Date(row.createdAt).getTime()) / 3_600_000)
    badges.push({ label: `미응답 ${hours}h`, tone: hours >= 24 ? "risk" : "neutral" })
  }
  return badges
}
```

톤 클래스: neutral=`border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/55`, green=`border-[#D7EBDD] bg-[#ECFDF5] text-[#084734]`, risk=`border-[#F6D5C5] bg-[#FEF3EE] text-[#B85C33]`. 렌더는 이름 옆 `rounded-full border px-2 py-0.5 text-[11px] font-bold` 스팬(기존 CrmCustomerFlags와 같은 줄).

- [ ] **Step 2: 게이트** — eslint+build PASS. 수동: 홈페이지 유입 칩 → 배지 표시 확인.

- [ ] **Step 3: Commit** — `git add components/admin/crm/CrmUnifiedCustomersClient.tsx && git commit -m "feat(crm): 리드 행 홈페이지/정식리드/미응답 SLA 배지"`

---

## Phase 3 — C. 기록 탭 컴팩트

### Task 10: ActivityQuickForm `composer` variant

**Files:**
- Modify: `components/admin/crm/rail/ActivityQuickForm.tsx`

- [ ] **Step 1: prop 확장** — `compact?: boolean`을 유지하되 내부적으로 `variant: "full" | "compact" | "composer"`로 정규화(`variant` prop 신설, `compact===true`→`"compact"` 매핑 — 기존 호출부 무수정):

```ts
export interface ActivityQuickFormProps {
  compact?: boolean
  /** composer = 한 줄 컴포저(기록 탭·드로어 pin용). 미지정 시 compact 여부로 결정. */
  variant?: "full" | "compact" | "composer"
  /** composer에서 대상 피커 숨김(드로어처럼 대상이 고정된 컨텍스트) */
  lockTarget?: boolean
  // ...기존 props 유지...
}
```

- [ ] **Step 2: composer 렌더** — `variant === "composer"`일 때 기존 폼 대신:

```tsx
<div className="rounded-2xl border border-[#e8e8e4] bg-white p-2.5">
  <div className="flex flex-wrap items-center gap-1.5">
    {MODE_OPTIONS.map((option) => { /* 기존 compact 모드칩과 동일, h-8 */ })}
  </div>
  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
    {!lockTarget ? (
      <div className="sm:w-52 shrink-0"><CrmCustomerPicker ... /* 기존 picker 배선 그대로 */ /></div>
    ) : null}
    <textarea
      value={body}
      onChange={(event) => setBody(event.target.value)}
      rows={2}
      placeholder={targetLabel ? `${targetLabel} 기록 남기기` : "무슨 일이 있었나요? (본문만 적어도 저장됩니다)"}
      className="min-w-0 flex-1 resize-none rounded-lg border border-[#e8e8e4] bg-[#fafaf8] px-3 py-2 text-[13px] leading-5 outline-none focus:border-[#084734]"
    />
    <button type="button" onClick={() => void handleSubmit()} disabled={saving}
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-[#084734] px-4 text-[13px] font-semibold text-white disabled:opacity-45">
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} 저장
    </button>
  </div>
  <div className="mt-1.5 flex items-center justify-between">
    <p className="text-[11px] text-[#1a1a1a]/35">{targetId ? "고객 360 타임라인에 연결됩니다." : "고객 미선택 시 미연결 기록"}</p>
    <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="text-[11px] font-semibold text-[#1a1a1a]/50 hover:text-[#111110]">
      {showAdvanced ? "상세 접기" : "+ 상세 (제목·다음 액션 등)"}
    </button>
  </div>
  {showAdvanced ? ( /* 기존 필드 스택(제목·요약·시각·담당·모드별 필드·다음 액션·태그 등) 그대로 재사용 */ ) : null}
</div>
```

구현 방식: 기존 JSX를 삭제하지 말고, 필드 스택 부분을 함수/조각으로 추출해 composer의 `showAdvanced` 영역과 full/compact 레이아웃이 **같은 조각을 공유**하게 한다(SSOT 유지). 유일한 검증 규칙(제목/요약/본문/다음액션/파일 중 1개, 125행)은 불변 — composer는 본문만으로 저장 가능.

- [ ] **Step 3: 게이트** — eslint+build PASS. 기존 소비처(기록 탭 full·레일 compact·현황 홈 레일) 렌더 회귀 확인.

- [ ] **Step 4: Commit** — `git add components/admin/crm/rail/ActivityQuickForm.tsx && git commit -m "feat(crm): ActivityQuickForm composer variant — 한 줄 기록 입력"`

### Task 11: 기록 리스트 컴팩트 행 + 아코디언

**Files:**
- Create: `components/admin/crm/CrmEventRow.tsx`
- Modify: `components/admin/crm/CrmActivityClient.tsx` (345-447행 카드 `<article>` 교체)

- [ ] **Step 1: CrmEventRow 생성** — 접힘/펼침 상태는 행 내부 `useState`:

```tsx
"use client"

import { useState } from "react"
import { Calendar, ChevronDown, UserRound } from "lucide-react"
import {
  formatDateTime, sentimentLabel, sentimentTone, sourceLabel,
  type CrmEventRecord,
} from "./rail/activity-contract"

export default function CrmEventRow({ event, children }: { event: CrmEventRecord; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const risky = event.sentiment === "risk" || event.blockers.length > 0
  const openActions = event.nextActions.filter((action) => !action.done).length
  return (
    <article className="rounded-xl border border-[#e8e8e4] bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left">
        <span className="shrink-0 rounded-full border border-[#e8e8e4] bg-[#fafaf8] px-2 py-0.5 text-[11px] font-bold text-[#1a1a1a]/55">
          {sourceLabel(event.sourceType)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#111110]">
          {event.title}
          {event.summary ? <span className="ml-1.5 font-medium text-[#1a1a1a]/45">{event.summary}</span> : null}
        </span>
        {risky ? <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${sentimentTone("risk")}`}>리스크</span> : null}
        {openActions ? <span className="shrink-0 rounded-full border border-[#D7EBDD] bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-bold text-[#084734]">액션 {openActions}</span> : null}
        <span className="hidden shrink-0 items-center gap-1 text-[11px] text-[#1a1a1a]/40 sm:inline-flex">
          <UserRound className="h-3 w-3" />{event.targetLabel ?? "미연결"}
        </span>
        <span className="shrink-0 inline-flex items-center gap-1 text-[11px] tabular-nums text-[#1a1a1a]/40">
          <Calendar className="h-3 w-3" />{formatDateTime(event.occurredAt)}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/30 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="border-t border-[#f0f0ec] px-3.5 py-3">{children}</div> : null}
    </article>
  )
}
```

- [ ] **Step 2: CrmActivityClient 교체** — 기존 카드 본문(배지 행·본문·RecordingPlayer·참석/목적·결정/리스크/다음액션 3그리드·태그, 350-445행)을 `CrmEventRow`의 children으로 이동(분위기 배지·담당자 라인은 펼침부 상단으로). 목록 래퍼 간격 `space-y-3`→`space-y-1.5`.

- [ ] **Step 3: 게이트** — eslint+build PASS. 수동: 행 클릭 펼침, 녹음 플레이어 동작.

- [ ] **Step 4: Commit** — `git add components/admin/crm/CrmEventRow.tsx components/admin/crm/CrmActivityClient.tsx && git commit -m "feat(crm): 기록 리스트 한 줄 행 + 아코디언 (CrmEventRow)"`

### Task 12: 기록 탭 컴포저 배치

**Files:**
- Modify: `components/admin/crm/CrmActivityClient.tsx`
- Modify: `components/admin/crm/rail/CrmActionRail.tsx`

- [ ] **Step 1: 컴포저를 타임라인 컬럼 최상단에 배치** — 좌측 컬럼(245행 `min-w-0 space-y-4` div) 첫 요소로:

```tsx
<ActivityQuickForm
  variant="composer"
  defaultTargetType={focusTargetType}
  defaultTargetId={focusTargetId || undefined}
  defaultTargetLabel={focusLabel || undefined}
  onSaved={handleRailSaved}
/>
```

- [ ] **Step 2: 레일 정리** — `CrmActionRail`에 `hideForm?: boolean` prop 추가(폼 카드 생략, 오늘 할 일·최근 기록만). 기록 탭에서 `<CrmActionRail hideForm ...>`으로 호출(중복 입력면 제거 — 현황 홈 레일은 현행 유지). 모바일 스택 순서는 컴포저(본문 컬럼)가 위로 오도록 기존 `xl:col-start-*` 배치 조정.

- [ ] **Step 3: 필터 행 축소** — 검색+셀렉트 3개 grid(247-305행)는 유지하되 요약 타일 4개(307-328행)를 `<details className="...">`(기본 접힘, summary="기록 요약")로 이동 — 컴팩트 계층(스펙 §C).

- [ ] **Step 4: 게이트** — eslint+build PASS. 수동: 컴포저 저장 → 타임라인 갱신, `?targetId=` 딥링크 시 대상 프리셋.

- [ ] **Step 5: Commit** — `git add components/admin/crm/CrmActivityClient.tsx components/admin/crm/rail/CrmActionRail.tsx && git commit -m "feat(crm): 기록 탭 컴포저 상단 고정 + 레일 중복 폼 제거"`

---

## Phase 4 — B. 360 드로어

### Task 13: 섹션 순서 재배치 + 점프탭 동기화

**Files:**
- Modify: `components/admin/crm/Customer360Drawer.tsx` (점프탭 905-932행, 섹션 렌더 순서)

- [ ] **Step 1: 순서 변경** — 점프탭 배열과 섹션 렌더 순서를 `요약 → 활동 → 할일 → 딜 → 머니`로 재배열(현재 `요약/딜/머니/활동/할일`). 스크롤 스파이 로직은 순서 배열 기반이므로 배열만 바꾸면 됨 — 편집 전 `grep -n "요약\|활동\|할일" components/admin/crm/Customer360Drawer.tsx`로 섹션 키 배열 위치 확인. `Customer360DetailActivity` 렌더가 `eventsLimit` 5건 요약 + "전체 기록 보기" 링크(기존 `?targetId=` 딥링크)를 유지하는지 확인만(변경 불필요 예상).

- [ ] **Step 2: 게이트** — eslint+build PASS. 수동: 점프탭 클릭·스크롤 스파이 순서 일치.

- [ ] **Step 3: Commit** — `git add components/admin/crm/Customer360Drawer.tsx && git commit -m "feat(crm): 360 드로어 활동 섹션 승격 (요약→활동→할일→딜→머니)"`

### Task 14: 드로어 pinned 컴포저

**Files:**
- Modify: `components/admin/crm/Customer360Drawer.tsx` (헤더 블록(816-902행) 직후)

- [ ] **Step 1: 장착** — 헤더 아래 sticky 영역:

```tsx
<div className="sticky top-0 z-10 border-b border-[#f0f0ec] bg-white px-4 py-2.5">
  <ActivityQuickForm
    variant="composer"
    lockTarget
    defaultTargetType={detail.source === "lead" ? "lead" : "neo_account"}
    defaultTargetId={detail.entityId}
    defaultTargetLabel={detail.name}
    onSaved={() => void refreshDetail()}
  />
</div>
```

`detail.source`/`entityId`/`name`/`refreshDetail`의 실제 이름은 드로어의 360 payload state(`crm-customer-360.ts` 반환 타입)에서 확인해 맞춘다. 저장 성공 시 360 재조회로 타임라인 갱신(드로어에 기존 refresh 함수가 있으면 재사용).

- [ ] **Step 2: dirty 가드** — composer 본문이 비어있지 않으면 backdrop 클릭 닫기 전에 `window.confirm("작성 중인 기록이 있습니다. 닫을까요?")`. ActivityQuickForm에 `onDirtyChange?: (dirty: boolean) => void` prop 추가(본문/제목 길이>0 여부를 부모에 통지), 드로어의 backdrop onClick·ESC 핸들러(379-387행)에서 가드.

- [ ] **Step 3: 게이트** — eslint+build PASS. 수동: 드로어에서 메모 저장 → 활동 섹션 즉시 반영, dirty 상태 backdrop 가드.

- [ ] **Step 4: Commit** — `git add components/admin/crm/Customer360Drawer.tsx components/admin/crm/rail/ActivityQuickForm.tsx && git commit -m "feat(crm): 360 드로어 한 줄 기록 컴포저 고정 + dirty 가드"`

### Task 15: 'NEO 등록됨' 액션 + 발송허브 딥링크 버튼

**Files:**
- Modify: `components/admin/crm/Customer360Drawer.tsx` (헤더 액션 영역 816-902행)
- Modify: `components/admin/crm/CrmCustomerPicker.tsx` (`sources` prop — NEO 계정만 검색)

- [ ] **Step 1: 피커 소스 제한 prop** — `CrmCustomerPicker`가 unified API(`?source=`)를 호출하므로 `sources?: "lead" | "neo_account"` prop을 받아 쿼리에 전달(미지정 시 현행). 실제 fetch URL 조립부를 grep으로 확인 후 1줄 추가.

- [ ] **Step 2: 'NEO 등록됨' 액션** — 드로어 헤더 액션 행에, **리드이면서 origin==='site'** 인 경우만 노출(360 payload에 origin이 없으면 lead source 문자열로 `classifyLeadOrigin` 재사용):

```tsx
{isSiteLead ? (
  crmRegistered ? (
    <span className="inline-flex h-8 items-center rounded-lg border border-[#D7EBDD] bg-[#ECFDF5] px-2.5 text-[12px] font-bold text-[#084734]">정식 리드 · NEO 등록</span>
  ) : (
    <button type="button" onClick={() => setNeoLinkOpen(true)} className="inline-flex h-8 items-center rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#1a1a1a]/60 hover:bg-[#fafaf8]">
      NEO 등록됨…
    </button>
  )
) : null}
{neoLinkOpen ? (
  <div className="mt-2 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] p-3">
    <p className="mb-1.5 text-[12px] font-semibold text-[#111110]">NEO 고객 계정과 연결</p>
    <CrmCustomerPicker sources="neo_account" onPick={(pick) => void submitNeoLink(pick.targetId)} ... />
  </div>
) : null}
```

`submitNeoLink`는 `POST /api/admin/crm/leads/neo-link` 호출 → 성공 토스트("정식 리드로 전환되었습니다") → 360 refresh. `crmRegistered`는 unified 행에서 드로어 open 시 전달하거나 360 payload에 lead의 confirmed neo 링크 여부를 추가(간단한 쪽 선택 — 360 repo에서 `listConfirmedLeadNeoLinkLeadIds` 재사용 권장).

- [ ] **Step 3: 발송허브 딥링크 버튼** — 헤더 액션(콜 버튼 옆):

```tsx
<a
  href={contactPhone ? `/admin/campaigns?message_to=${encodeURIComponent(contactPhone)}&message_name=${encodeURIComponent(detail.name)}` : undefined}
  aria-disabled={!contactPhone}
  title={contactPhone ? "알림톡/문자 발송허브로 이동" : "연락처가 없어 발송할 수 없습니다"}
  className={/* 기존 헤더 액션 버튼과 동일 스타일, !contactPhone이면 pointer-events-none opacity-40 */}
>알림톡/문자</a>
```

- [ ] **Step 4: 게이트** — eslint+build PASS.

- [ ] **Step 5: Commit** — `git add components/admin/crm/Customer360Drawer.tsx components/admin/crm/CrmCustomerPicker.tsx && git commit -m "feat(crm): 드로어 NEO 등록 확정 액션 + 발송허브 딥링크"`

---

## Phase 5 — E2. 캠페인 메시지 수신자 프리필

### Task 16: campaigns 프리필 파라미터

**Files:**
- Modify: `app/admin/campaigns/page.tsx` 및 메시지 탭 컴포넌트(`components/admin/marketing/MarketingHub.tsx` 기준 — 실제 수신자 입력 상태 위치는 grep `recipient\|수신` 으로 확인)

- [ ] **Step 1: 파라미터 수용** — campaigns 페이지에서 `searchParams`의 `message_to`/`message_name`을 읽어 메시지 탭을 활성화하고 수신자 필드 초기값으로 전달(`initialRecipient={{ phone, name }}` prop). 카카오(KakaoComposer)·문자 컴포저 중 **문자 컴포저에 우선 적용**(알림톡은 템플릿 승인 구조라 수신자만 프리필). 1회 소비 후 URL 정리(`history.replaceState`)로 새로고침 중복 프리필 방지.

- [ ] **Step 2: 게이트** — eslint+build PASS. 수동: 드로어 버튼 → 캠페인 메시지 탭 수신자 프리필 확인.

- [ ] **Step 3: Commit** — `git add app/admin/campaigns/page.tsx components/admin/marketing/*.tsx && git commit -m "feat(campaigns): 메시지 수신자 프리필 딥링크 파라미터"`

---

## Phase 6 — 게이트·실검증

### Task 17: 종합 검증

- [ ] **Step 1: 전체 게이트** — `npx eslint app components lib --max-warnings=0` && `npm run build` && `npm test` 모두 PASS.
- [ ] **Step 2: 브라우저 5플로우** (dev 서버 + 브라우저 도구, 스펙 §7):
  1. 고객DB: 칩 진입 → 검색 UI 접힘 → '전체 보기' 복원 → 뒤로가기 정상.
  2. 고객 클릭 → 드로어: 활동이 두 번째 섹션, 한 줄 메모 저장 → 타임라인 반영.
  3. 기록 탭: 컴포저 저장, 행 클릭 아코디언, 요약 `<details>`.
  4. 홈페이지 리드: 배지 확인 → 'NEO 등록됨' 연결 → '정식 리드' 전환 표시. `/api/lead` POST → 기록 탭 '홈페이지 유입' 이벤트.
  5. 드로어 '알림톡/문자' → 캠페인 수신자 프리필.
- [ ] **Step 3: 모바일(375px)** — 고객DB·기록·드로어 가로 스크롤 0 확인.
- [ ] **Step 4: 스크린샷 증빙 저장** 후 결과 보고.

---

## Self-Review 체크 (작성 시점 수행 완료)

- 스펙 §A→Task 7·8, §B→13·14, §C→10·11·12, §D→1·3·4·5·6·9(배지), §E1→2·4·9, §E2→15·16, §7→17. 갭 없음.
- 타입 일관성: `CrmUnifiedSavedView`에 `site_leads`/`unanswered` (Task 2) ↔ 칩 key (Task 7) 일치. `classifyLeadOrigin` (Task 1) ↔ Task 4·5·15 사용처 일치. `confirmLeadNeoLink`/`listConfirmedLeadNeoLinkLeadIds` 이름 Task 4·6·15 일치. `variant="composer"`/`lockTarget`/`hideForm` prop 이름 Task 10·12·14 일치.
- 알려진 확인 포인트(실행 중 grep 재확인 필요로 명시됨): crm-events insert 계약 필드명(Task 5), crm_source_links insert 컬럼(Task 6), 드로어 payload 심볼명(Task 14), 피커 fetch URL(Task 15), campaigns 수신자 상태(Task 16).
