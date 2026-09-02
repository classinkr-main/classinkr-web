import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { getSoftwarePlan, type SoftwarePlanId } from "@/lib/billing/plans"

/**
 * app/product/sw/page.tsx 의 PricingValueSection 은 거대한 서버 컴포넌트 트리 안에 있어
 * (framer-motion, next/dynamic, 비디오 배경 등) 렌더 테스트로 값을 직접 확인하기 어렵다.
 * tests/checkout/hardware-catalog.test.ts, tests/hardware/board-specs.test.ts 와 같은 방식으로
 * **파일 원문을 파싱**해 (a) 가격이 더 이상 하드코딩되어 있지 않고 (b) lib/billing/plans.ts
 * SSOT 호출로 파생되고 있는지를 확인한다. 기대 금액 문자열도 plans.ts 를 다시 읽어 만든다 —
 * "$99"를 테스트에 그대로 박아두면 plans.ts 가 바뀌어도(env override 포함) 이 테스트는 계속
 * 통과해버려 SSOT 비교로서 의미가 없어진다.
 */
const PAGE_PATH = fileURLToPath(new URL("../../app/product/sw/page.tsx", import.meta.url))
const PAGE_SOURCE = readFileSync(PAGE_PATH, "utf8")

const SECTION_START = "/* ── ④ 가격 가치 제안 섹션"
const SECTION_END = "/* ══════════════════════════════════════════════════════════════════\n   MAIN PAGE"

function extractPricingValueSection(source: string): string {
  const start = source.indexOf(SECTION_START)
  const end = source.indexOf(SECTION_END)
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      "PricingValueSection 섹션 마커를 찾지 못했다 — page.tsx 구조가 바뀌었는지 확인할 것"
    )
  }
  return source.slice(start, end)
}

const SECTION = extractPricingValueSection(PAGE_SOURCE)

function requireMonthlyUsd(planId: SoftwarePlanId): number {
  const plan = getSoftwarePlan(planId)
  if (!plan.monthly) {
    throw new Error(`plans.ts 의 "${planId}" 플랜에 월 단가가 없다`)
  }
  return plan.monthly.amount
}

describe("PricingValueSection ↔ lib/billing/plans (SSOT)", () => {
  it("SSOT 를 import 해서 값을 파생시킨다 (자체 상수를 다시 선언하지 않는다)", () => {
    expect(PAGE_SOURCE).toContain('from "@/lib/billing/plans"')
    // 월 단가와 타이틀을 실제로 SSOT 호출에서 읽는지 — import 만 있고 안 쓰면 의미가 없다.
    expect(SECTION).toContain('getSelfServeSoftwarePlan("standard")')
    expect(SECTION).toContain('getSelfServeSoftwarePlan("plus")')
    expect(SECTION).toContain('getSoftwarePlan("enterprise")')
    expect(SECTION.match(/formatUsd\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it("Standard/Plus 가격 리터럴이 더 이상 소스에 하드코딩되어 있지 않다", () => {
    // plans.ts(SSOT, env override 포함)에서 지금 유효한 금액을 다시 읽어 금지 패턴을 만든다.
    // 하드코딩된 기대값("$99" 등)이 아니라 SSOT 를 다시 읽어야, SSOT 값이 바뀐 뒤 누군가
    // page.tsx 에 그 새 값을 또 직접 적어 넣는 회귀도 잡아낸다.
    const standardMonthly = requireMonthlyUsd("standard")
    const plusMonthly = requireMonthlyUsd("plus")

    // 기존 마크업 패턴은 `$99<span ...>` 처럼 금액 뒤에 바로 <span> 이 붙는 형태였다.
    expect(SECTION).not.toContain(`$${standardMonthly}<span`)
    expect(SECTION).not.toContain(`$${plusMonthly}<span`)
  })

  it("Enterprise 가격은 여전히 노출하지 않는다 (요구사항 C 고정)", () => {
    const enterpriseMonthly = requireMonthlyUsd("enterprise")

    // /checkout 이 selfServe:false 인 Enterprise 가격을 렌더하지 않는 것과 동일하게,
    // 이 섹션도 Enterprise 금액을 절대 텍스트로 노출하면 안 된다.
    expect(SECTION).not.toContain(`$${enterpriseMonthly}`)
    expect(SECTION).toContain("맞춤 견적")
  })

  it("주변 문구·레이아웃은 그대로다 (값의 출처만 바뀐다)", () => {
    // 리팩터 범위가 "가격 값의 출처"로만 한정된다는 요구사항(A)을 고정한다 — 문구가 바뀌면
    // 여기서 먼저 깨져야 한다.
    expect(SECTION).toContain("이 가격에,")
    expect(SECTION).toContain("Classin 하나로")
    expect(SECTION).toContain("연 결제 시 약 2개월 절감")
    expect(SECTION).toContain("/계정/월")
  })
})
