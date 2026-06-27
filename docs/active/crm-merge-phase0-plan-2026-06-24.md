# CRM 병합 — Phase 0 구현 계획 (키스톤 측정 + 검증 스파이크 + 토큰)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 통합 CRM를 출하하기 전 게이트 — 스파인 커버리지를 현황 홈에 노출하고, Phase 1을 막는 4개 데이터 사실(오너 매핑·미수 조인키·HW destination·이벤트 저장소)을 검증해 결정하고, 디자인 ROLE 토큰과 안전한 서브내비 라벨 변경을 적용한다.

**Architecture:** 마이그레이션 없음 — 전부 읽기전용 측정 + CSS 토큰 + 라벨 변경 + 조사. 커버리지 위젯은 기존 `getCrmSourceLinkCoverage()`(읽기전용 head/count)를 작은 전용 엔드포인트로 노출하고 현황 홈 상단에 마운트. 검증 스파이크는 읽기전용 프로브 → findings 문서에 결정 기록.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Tailwind 4 · Supabase(admin client, RLS-bypass) · Vitest(`tests/` 디렉터리 한정).

**전제:** 작업 브랜치 `2.28`(또는 그 위 sub-branch). 검증 기준: `npx eslint app components lib --max-warnings=0 && npm run build`. 스파이크 프로브는 읽기전용(`tmp/db-probe-*.mjs` 패턴).

**스펙 참조:** [crm-merge-redesign-2026-06-24.md](crm-merge-redesign-2026-06-24.md) §6(검증 스파이크)·§7(단계).

---

## File Structure

| 파일 | 책임 | 동작 |
|---|---|---|
| `lib/crm/coverage.ts` | 커버리지 톤 순수 함수(`coverageTone`, `COVERAGE_TONE_CLASS`) | Create |
| `tests/crm/coverage.test.ts` | `coverageTone` 유닛 테스트 | Create |
| `app/api/admin/crm/coverage/route.ts` | 현황용 경량 커버리지 엔드포인트 | Create |
| `components/admin/crm/CrmCoverageStrip.tsx` | 커버리지 위젯(확정/검토대기/커버리지%) | Create |
| `app/admin/crm/page.tsx` | 현황 홈에 위젯 마운트 (헤더 다음, `:802`↔`:804` 사이) | Modify |
| `app/globals.css` | `:root`에 CRM ROLE 토큰 추가 (`:241` 직전) | Modify |
| `components/admin/crm/CrmSubnav.tsx` | `Deals` 라벨 → `돈흐름` (라벨만, key/href 불변) | Modify |
| `docs/active/crm-phase0-spike-findings-2026-06-24.md` | 4개 스파이크 결과·결정 기록 | Create |
| `tmp/db-probe-phase0-*.mjs` | 읽기전용 프로브 스크립트 (커밋 제외) | Create(임시) |

> **범위 경계:** 인사이트 1급 탭 신설·리드↔계정 통합 뷰는 **Phase 1/2**(해당 라우트·뷰가 생길 때). Phase 0의 서브내비 변경은 **`Deals`→`돈흐름` 라벨 변경에 한정**(데드 탭 방지). 인사이트 탭 추가 시 `lg:grid-cols-4`→`grid-cols-5` 필요(스펙 노트, Phase 2).

---

## Task 1: 커버리지 톤 순수 함수 + 유닛 테스트 (TDD)

**Files:**
- Create: `lib/crm/coverage.ts`
- Test: `tests/crm/coverage.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// tests/crm/coverage.test.ts
import { describe, it, expect } from "vitest"
import { coverageTone, COVERAGE_TONE_CLASS } from "@/lib/crm/coverage"

describe("coverageTone", () => {
  it("70% 이상은 ok(green)", () => {
    expect(coverageTone(70)).toBe("ok")
    expect(coverageTone(100)).toBe("ok")
  })
  it("40~69%는 warn(amber)", () => {
    expect(coverageTone(40)).toBe("warn")
    expect(coverageTone(69)).toBe("warn")
  })
  it("40% 미만은 risk(terracotta)", () => {
    expect(coverageTone(0)).toBe("risk")
    expect(coverageTone(39)).toBe("risk")
  })
  it("톤별 클래스가 우리 팔레트 리터럴과 일치", () => {
    expect(COVERAGE_TONE_CLASS.ok).toContain("#084734")
    expect(COVERAGE_TONE_CLASS.warn).toContain("#8D6C1F")
    expect(COVERAGE_TONE_CLASS.risk).toContain("#B85C33")
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- coverage`
Expected: FAIL — `Cannot find module '@/lib/crm/coverage'`

- [ ] **Step 3: 최소 구현**

```ts
// lib/crm/coverage.ts
export type CoverageTone = "ok" | "warn" | "risk"

// 스파인 커버리지% → 신호 톤. 임계는 NeoCrmKpis의 attainment 임계(0.7)와 정렬.
export function coverageTone(pct: number): CoverageTone {
  if (pct >= 70) return "ok"
  if (pct >= 40) return "warn"
  return "risk"
}

// 우리 팔레트 리터럴만 사용: green / amber-700 / terracotta. 신규 hue 없음.
export const COVERAGE_TONE_CLASS: Record<CoverageTone, string> = {
  ok: "text-[#084734]",
  warn: "text-[#8D6C1F]",
  risk: "text-[#B85C33]",
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- coverage`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add lib/crm/coverage.ts tests/crm/coverage.test.ts
git commit -m "feat(crm): coverage tone helper + unit test (phase0)"
```

---

## Task 2: 커버리지 엔드포인트

**Files:**
- Create: `app/api/admin/crm/coverage/route.ts`
- Reference: `app/api/admin/os-summary/route.ts:1-21` (guard 패턴), `lib/repositories/crm-source-links.ts:1155-1193` (`getCrmSourceLinkCoverage`)

`getCrmSourceLinkCoverage()`는 이미 `{ total, linked, needsReview, coveragePct }`를 읽기전용 head/count로 반환한다. 새 엔드포인트는 이를 그대로 노출만 한다.

- [ ] **Step 1: 라우트 작성**

```ts
// app/api/admin/crm/coverage/route.ts
import { NextRequest } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getCrmSourceLinkCoverage } from "@/lib/repositories/crm-source-links"

// 현황 홈 키스톤 위젯용 경량 커버리지. os-summary(무거운 합성)와 분리.
export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  const coverage = await getCrmSourceLinkCoverage()
  return adminCachedJson(coverage)
}
```

- [ ] **Step 2: 빌드·린트로 검증**

Run: `npx eslint app/api/admin/crm/coverage/route.ts --max-warnings=0`
Expected: PASS (0 warnings)

- [ ] **Step 3: 런타임 스모크** (dev 서버 기동 상태에서)

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/admin/crm/coverage`
Expected: 인증 가드 동작 — 비인증 시 401/403, 인증 세션에선 200 + `{total,linked,needsReview,coveragePct}` JSON.

- [ ] **Step 4: 커밋**

```bash
git add app/api/admin/crm/coverage/route.ts
git commit -m "feat(crm): lightweight coverage endpoint for 현황 keystone widget (phase0)"
```

---

## Task 3: 커버리지 위젯 컴포넌트

**Files:**
- Create: `components/admin/crm/CrmCoverageStrip.tsx`
- Reference: `components/admin/crm/matching/MatchingInboxClient.tsx:145-153` (`MetricCard` 비주얼 언어), `lib/crm/coverage.ts`(Task 1)

위젯은 자체 fetch(`/api/admin/crm/coverage`)로 동작(페이지 fetch 패턴에 결합하지 않음). 카드 쉘은 페이지 표준(`rounded-2xl border border-[#e8e8e4] bg-white p-4`), 타일 비주얼은 `MetricCard`와 동일(`text-[11px] uppercase tracking` 라벨 / `text-2xl font-bold` 값 / `text-[12px] text-[#1a1a1a]/42` 힌트).

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// components/admin/crm/CrmCoverageStrip.tsx
"use client"

import { useEffect, useState } from "react"
import { ShieldCheck } from "lucide-react"

import { coverageTone, COVERAGE_TONE_CLASS } from "@/lib/crm/coverage"

type Coverage = { total: number; linked: number; needsReview: number; coveragePct: number }

export default function CrmCoverageStrip() {
  const [data, setData] = useState<Coverage | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch("/api/admin/crm/coverage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Coverage | null) => {
        if (!alive) return
        setData(d)
        setLoading(false)
      })
      .catch(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const pct = data?.coveragePct ?? 0
  const tone = coverageTone(pct)
  const fmt = (n: number) => n.toLocaleString("ko-KR")

  return (
    <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#1a1a1a]/35" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/30">
              Spine Coverage
            </p>
            <h2 className="mt-0.5 text-[15px] font-bold text-[#111110]">스파인 정합성</h2>
          </div>
        </div>
        <span className="rounded-full bg-[#f0f0ec] px-3 py-1 text-[12px] font-medium text-[#1a1a1a]/55">
          confirmed 링크 기준
        </span>
      </div>

      <div className="grid gap-8 border-t border-[#f0f0ec] pt-4 sm:grid-cols-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/35">커버리지</p>
          <p className={`mt-2 text-2xl font-bold tracking-[-0.04em] ${COVERAGE_TONE_CLASS[tone]}`}>
            {loading && !data ? "..." : `${pct}%`}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/42">
            확정 연결 ÷ 전체 링크(rejected 제외)
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/35">확정 연결</p>
          <p className="mt-2 text-2xl font-bold tracking-[-0.04em] text-[#111110]">
            {loading && !data ? "..." : fmt(data?.linked ?? 0)}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/42">active·confirmed 상태</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/35">검토 대기</p>
          <p className="mt-2 text-2xl font-bold tracking-[-0.04em] text-[#111110]">
            {loading && !data ? "..." : fmt(data?.needsReview ?? 0)}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/42">candidate — 연동 탭에서 확정</p>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: 린트 검증**

Run: `npx eslint components/admin/crm/CrmCoverageStrip.tsx --max-warnings=0`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add components/admin/crm/CrmCoverageStrip.tsx
git commit -m "feat(crm): CrmCoverageStrip keystone widget (phase0)"
```

---

## Task 4: 현황 홈에 위젯 마운트

**Files:**
- Modify: `app/admin/crm/page.tsx` (헤더 닫는 `</div>` `:802` 다음, `<NeoCrmTeamPanel>` `:804` 앞)

- [ ] **Step 1: import 추가**

`app/admin/crm/page.tsx` 상단 import 블록에 추가:

```tsx
import CrmCoverageStrip from "@/components/admin/crm/CrmCoverageStrip"
```

- [ ] **Step 2: 헤더와 NeoCrmTeamPanel 사이에 마운트**

`app/admin/crm/page.tsx`의 헤더 블록(`{/* 헤더 */}` ~ `:802`의 닫는 `</div>`) 바로 다음 줄, `<NeoCrmTeamPanel ... />`(`:804`) 앞에 삽입:

```tsx
      <CrmCoverageStrip />
```

(헤더 `</div>` 와 `<NeoCrmTeamPanel>` 사이. 결과 순서: 헤더 → 스파인 정합성 → NeoCrmTeamPanel → "지금 처리" 액션 밴드.)

- [ ] **Step 3: 게이트 검증**

Run: `npx eslint app components lib --max-warnings=0 && npm run build`
Expected: PASS (0 warnings, 빌드 성공)

- [ ] **Step 4: 커밋**

```bash
git add app/admin/crm/page.tsx
git commit -m "feat(crm): mount coverage strip on 현황 home (phase0)"
```

---

## Task 5: CRM ROLE 디자인 토큰

**Files:**
- Modify: `app/globals.css` (`:root` 블록 내 `--shadow-card` 직전, `:230` 부근)

ROLE 토큰 = 기존 값의 역할 명명. `#084734`/`#111110`/`#FAFAF8`는 기존 토큰의 리네임, `#f0f0ec`/`#B85C33`는 리터럴의 최초 토큰화(관리자 코드에 이미 광범위 사용 중).

- [ ] **Step 1: `:root`에 토큰 추가**

`app/globals.css` `:root` 블록 안, `--shadow-card` 선언 앞에 삽입:

```css
  /* ── CRM ROLE 토큰 (기존 값의 역할 명명, 신규 hue 없음) ── */
  --crm-ribbon-bg: #111110;        /* near-black, 다크 액티브/리본 패널 배경 */
  --crm-gauge-track: #f0f0ec;      /* 라디얼/막대 트랙 (리터럴 최초 토큰화) */
  --crm-gauge-fill-ok: #084734;    /* rate>=0.7 진행 = brand green */
  --crm-gauge-fill-risk: #B85C33;  /* rate<0.7 진행 = terracotta */
  --crm-pinned-accent: #084734;    /* 360 카드 고정 특이사항 좌측 액센트 */
```

- [ ] **Step 2: 게이트 검증** (CSS 변경이 빌드를 깨지 않는지)

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add app/globals.css
git commit -m "feat(crm): add CRM role design tokens (ribbon/gauge/pinned, phase0)"
```

> 주: 이 토큰들은 Phase 1~2(라디얼 게이지·돈 리본·360 카드)에서 소비된다. Phase 0에선 선언만 — 사용처는 후속.

---

## Task 6: 서브내비 `Deals` → `돈흐름` 라벨 변경

**Files:**
- Modify: `components/admin/crm/CrmSubnav.tsx:30`(PRIMARY_TABS deals.label), `:216`(서브탭 그룹 라벨 리터럴 `>Deals</span>`)

key(`"deals"`)·href(`/admin/crm/deals`)·라우팅(`resolveSection`/`resolveDealsSub`)은 **변경 금지**(리다이렉트·딥링크 보존). 라벨 텍스트만 변경.

- [ ] **Step 1: PRIMARY_TABS 라벨 변경**

`components/admin/crm/CrmSubnav.tsx`의 `deals` 탭 정의(`:28-34`)에서:

```tsx
    label: "Deals",
```
를
```tsx
    label: "돈흐름",
```
로 변경. (`key: "deals"`, `href: "/admin/crm/deals"`, `description: "견적 → 수납"`은 그대로.)

- [ ] **Step 2: 서브탭 그룹 라벨 변경**

`components/admin/crm/CrmSubnav.tsx:216`의 하드코딩 라벨:

```tsx
          <span className="mr-1 hidden shrink-0 text-[11px] font-medium text-[#1a1a1a]/40 sm:inline">Deals</span>
```
에서 `>Deals<`를 `>돈흐름<`으로 변경.

- [ ] **Step 3: 게이트 검증**

Run: `npx eslint app components lib --max-warnings=0 && npm run build`
Expected: PASS

- [ ] **Step 4: 커밋**

```bash
git add components/admin/crm/CrmSubnav.tsx
git commit -m "feat(crm): rename Deals tab label to 돈흐름 (phase0, routing unchanged)"
```

---

## Task 7: Findings 문서 생성

**Files:**
- Create: `docs/active/crm-phase0-spike-findings-2026-06-24.md`

- [ ] **Step 1: 빈 findings 문서 골격 작성**

```markdown
# CRM 병합 — Phase 0 검증 스파이크 결과

> 작성일: 2026-06-24 · 각 스파이크의 프로브 출력 + 결정 기록. Phase 1 착수 전 게이트.

## 스파이크 A — 오너 식별 매핑
- 프로브 출력:
- 결정:

## 스파이크 B — CollectionPlan__c 조인키 (미수)
- 프로브 출력:
- 결정:

## 스파이크 C — HW destination
- 프로브 출력:
- 결정:

## 스파이크 D — 360 이벤트 저장소
- 프로브 출력:
- 결정:
```

- [ ] **Step 2: 커밋**

```bash
git add docs/active/crm-phase0-spike-findings-2026-06-24.md
git commit -m "docs(crm): phase0 spike findings skeleton"
```

---

## Task 8: 스파이크 A — 오너 식별 매핑 (조사)

**Goal:** `로그인 admin ⇄ NEO ownerId ⇄ leads.assigned_to` 매핑 가능 여부 확정. (그라운딩 예상: **불가능** — 세 개의 분리된 식별 공간.)

**Files:**
- Create: `tmp/db-probe-phase0-owner.mjs` (읽기전용)
- Modify: `docs/active/crm-phase0-spike-findings-2026-06-24.md` (스파이크 A 섹션)

- [ ] **Step 1: 프로브 실행** — 세 이름 집합의 교집합 확인

쿼리 (읽기전용):
```sql
SELECT DISTINCT assigned_to FROM leads WHERE assigned_to IS NOT NULL;
SELECT display_name FROM admin_profiles;
SELECT external_id, display_name FROM external_crm_records WHERE object_api_key = 'User';
```
(NEO ownerId→name은 `lib/external-crm/owner-names.ts:20` `getXiaoshouyiOwnerNameMap` 출력으로 덤프.)

- [ ] **Step 2: 결정 기록** — findings 문서 스파이크 A에 기록

판정 기준: 세 이름 집합이 **정확 문자열로 일치하지 않으면**(예상대로) → 조인 컬럼 신규 필요. 권고안 기록: `admin_profiles.neo_owner_id`(숫자 매핑) + `leads.assigned_to` 정규화. 근거 코드: `lib/admin-crm-scope.ts:140-143`(owner_name이 ownerId 숫자라 매칭 불가 → `EXTERNAL_CRM_KOREA_ONLY=true`). **결론: Phase 1 현황 개인 큐는 "팀 전체 + 담당 필터"로 출하**(스펙 확정대로), '내 고객' 개인화는 매핑 마이그 후 후속.

- [ ] **Step 3: 커밋**

```bash
git add docs/active/crm-phase0-spike-findings-2026-06-24.md
git commit -m "docs(crm): spike A owner-mapping findings — team-wide queue confirmed (phase0)"
```

---

## Task 9: 스파이크 B — CollectionPlan__c 조인키 (미수)

**Goal:** `CollectionPlan__c`의 account 조인키 확정 + 현재 detail 뷰가 안 읽음을 확인 → 미수 신호 Phase 1/2 진입 가능 여부 결정.

**Files:**
- Create: `tmp/db-probe-phase0-collectionplan.mjs` (읽기전용)
- Modify: `docs/active/crm-phase0-spike-findings-2026-06-24.md` (스파이크 B)

근거: `CollectionPlan__c` 동기화 필드에 `accountId` 존재(`lib/external-crm/xiaoshouyi-sync.ts:232-250`). `Collection__c`는 `orderAccountId__c`로 조인되나 `CollectionPlan__c`는 **detail 조인셋에 없음**(`lib/admin-crm-customers-neo.ts:379-382`).

- [ ] **Step 1: 프로브 실행** — accountId 키가 account external_id에 안착하는지

```sql
SELECT payload->>'accountId' AS k, count(*)
FROM external_crm_records
WHERE object_api_key = 'CollectionPlan__c' AND is_stale = false
GROUP BY 1;
```
이어서 `k` 값이 `object_api_key='account'` 행들의 `external_id` 공간에 속하는지 확인(`getNeoCrmCustomerDetail`가 `:377`에서 필터하는 동일 id 공간).

- [ ] **Step 2: 결정 기록**

판정 기준: `accountId`가 기존 account `external_id`에 안착하면 → Phase 1/2에서 `detailSelect("CollectionPlan__c", "accountId")` 1행 추가로 미수(예정 수금 − 실수금 net) 산출 가능 → **미수 신호 Phase 2 진입**. 안착 안 하면(예: 계약/오더 id로 키잉) → 조인키 재유도 필요, **미수 보류** + 위젯은 "수금데이터 미연결"로 표기.

- [ ] **Step 3: 커밋**

```bash
git add docs/active/crm-phase0-spike-findings-2026-06-24.md
git commit -m "docs(crm): spike B CollectionPlan join-key findings (phase0)"
```

---

## Task 10: 스파이크 C — HW destination

**Goal:** `HwOutbound`에 고객 필드 없음을 확인하고, `destination`(자유텍스트)이 학원명으로 매칭 가능한지 판정 → HW 편중 위젯 집계 단위 결정.

**Files:**
- Create: `tmp/db-probe-phase0-hw.mjs` (읽기전용)
- Modify: `docs/active/crm-phase0-spike-findings-2026-06-24.md` (스파이크 C)

근거: `HwOutbound`(`lib/repositories/branch-hw.ts:9`)에 `customer/account/accountId` 없음, `destination: string | null`(ship-to 라벨)만.

- [ ] **Step 1: 프로브 실행**

```sql
SELECT DISTINCT destination, owner FROM branch_hw_outbound LIMIT 200;
```

- [ ] **Step 2: 결정 기록**

판정 기준: `destination`이 학원/기관명을 신뢰성 있게 담으면 → HW 편중 위젯을 **"destination 기준"으로 정직 라벨링** + (선택) NEO `account.display_name`/`leads.org`로 이름 정규화 조인. 물류 코드면 → `branch_hw_outbound`에 `account_id`/`lead_id` 컬럼 신규 필요(별도 스펙). **불변 철칙 기록: HW 매출(unspecified/별도 원장)은 NEO opportunity USD와 절대 합산 금지 — 나란히 표기.**

- [ ] **Step 3: 커밋**

```bash
git add docs/active/crm-phase0-spike-findings-2026-06-24.md
git commit -m "docs(crm): spike C HW-destination findings (phase0)"
```

---

## Task 11: 스파이크 D — 360 이벤트 저장소

**Goal:** `lead_contact_logs`가 360 타임라인 단일 수기 저장소가 될 수 있는지 vs `crm_customer_events`(폴리모픽) 필요 판정.

**Files:**
- Create: `tmp/db-probe-phase0-events.mjs` (읽기전용)
- Modify: `docs/active/crm-phase0-spike-findings-2026-06-24.md` (스파이크 D)

근거: `lead_contact_logs`는 `lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE`로 leads에 용접(`supabase/migrations/20260409_schema_fixes.sql:6-25`), `type` enum이 리드획득형(`call/sms/kakao/email`). `crm_customer_events`는 현재 **부재**(`lib/supabase/database.types.ts`에 없음).

- [ ] **Step 1: 프로브 실행** — 360 주체가 항상 leads.id로 귀결되는지

```sql
SELECT count(*) FROM external_crm_records WHERE object_api_key = 'account';
SELECT count(*) FROM leads;
```
+ NEO account가 대응 leads 행을 갖는지 id 교집합 점검. (`crm_customer_events` 테이블 부재 재확인: `\dt crm_customer_events` → 없음 예상.)

- [ ] **Step 2: 결정 기록**

판정 기준: 360 주체가 비-리드(NEO account / HW destination)일 수 있으면(예상) → **신규 폴리모픽 `crm_customer_events`**(`subject_type` + `subject_id` + 확장 event-type enum + RLS `is_active_admin` + 인덱스) 필요. `lead_contact_logs`는 리드 전용 피더로 유지하거나 마이그. **결론: Phase 1에 `crm_customer_events` 마이그를 named 산출물로 포함**(스펙 §4.5). 모든 360 고객이 leads.id로 귀결되면 → `lead_contact_logs` in-place 확장 대안 기록.

- [ ] **Step 3: 커밋**

```bash
git add docs/active/crm-phase0-spike-findings-2026-06-24.md
git commit -m "docs(crm): spike D event-store findings — crm_customer_events needed (phase0)"
```

---

## Task 12: Phase 0 종료 게이트 + Phase 1 진입 결정 요약

**Files:**
- Modify: `docs/active/crm-phase0-spike-findings-2026-06-24.md` (상단에 결정 요약 추가)

- [ ] **Step 1: 전체 게이트 검증**

Run: `npx eslint app components lib --max-warnings=0 && npm run build && npm test`
Expected: 전부 PASS

- [ ] **Step 2: 결정 요약 작성** — findings 문서 최상단에 Phase 1 진입 체크리스트:
  - 오너 큐: 팀 전체 + 담당 필터 (확정)
  - 미수: Phase 2 진입 여부 (스파이크 B 결과)
  - HW 집계 단위: destination 기준 / account 컬럼 필요 (스파이크 C 결과)
  - 이벤트 저장소: `crm_customer_events` 폴리모픽 신규 (확정)
  - 커버리지: 현황 위젯 라이브 (Task 4)

- [ ] **Step 3: 임시 프로브 정리 + 커밋**

```bash
rm -f tmp/db-probe-phase0-*.mjs
git add docs/active/crm-phase0-spike-findings-2026-06-24.md
git commit -m "docs(crm): phase0 exit summary — phase1 entry decisions"
```

---

## Self-Review

**Spec coverage (스펙 §6 대비):**
- §6-1 오너 매핑 → Task 8 ✓
- §6-2 미수 조인키 → Task 9 ✓
- §6-3 HW destination → Task 10 ✓
- §6-4 contact-logs 결정 → Task 11 ✓
- §6-5 커버리지 측정 → Task 1~4 ✓
- §7 디자인 토큰 → Task 5 ✓ · 서브내비 → Task 6 ✓(라벨 한정, 전체 재구성은 Phase 1/2로 명시 분리)

**Placeholder scan:** 모든 코드 스텝에 실제 코드. 스파이크 프로브는 정확한 SQL + 판정 기준 포함. findings 문서의 빈 섹션은 런타임 출력으로 채우는 의도(조사 산출물).

**Type consistency:** `coverageTone`/`COVERAGE_TONE_CLASS`(Task 1) ↔ `CrmCoverageStrip`(Task 3) 일치. `Coverage` 타입 = `getCrmSourceLinkCoverage` 반환(`{total,linked,needsReview,coveragePct}`)과 일치. `adminCachedJson`/`verifyAdmin` import 경로 = os-summary 라우트(`:3-4`)와 동일.

**Non-scope (Phase 1+):** 통합 DB 조인·360 카드·우선순위 큐·인사이트 탭·돈 리본·`crm_customer_events` 마이그·미수 산출 — 전부 후속 Phase 플랜. Phase 0는 측정·검증·토큰·안전 라벨 변경에 한정.
