import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { verifyAdmin } from "@/lib/admin-auth"
import { ADMIN_CRM_REVENUE_CACHE_TAG } from "@/lib/admin-crm-revenue"
import { runAll } from "@/lib/branch/sync/run-all"
import { BRANCH_HW_CACHE_TAG } from "@/lib/repositories/branch-hw"
import { BRANCH_REV_DEALS_CACHE_TAG } from "@/lib/repositories/branch-deals"
import { runBranchRevLinkMaintenance } from "@/lib/repositories/crm-source-links"

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err
  const body = await req.json().catch(() => null) as { sources?: unknown } | null
  const sources = Array.isArray(body?.sources)
    ? body.sources.filter((s): s is "rev" | "hw" => s === "rev" || s === "hw")
    : []
  const effectiveSources = sources.length ? sources : ["rev", "hw"]
  const result = await runAll({ trigger: "manual", sources: sources.length ? sources : undefined })

  // 항목 4 수정 — rev/hw 중 하나만 실패해도 runAll은 ok=false를 돌려주지만
  // (lib/branch/sync/run-all.ts: errors.length>0이면 전체 ok=false), 성공한 소스는 이미 DB에
  // 반영돼 있다. 아래 revalidateTag가 전부 `if (result.ok)` 안에만 있으면 그 성공분을 다음
  // 조회가 계속 캐시로만 보고 놓친다. RunAllResult(run-all.ts)는 소스별 성공 불리언을 노출하지
  // 않는다 — hw는 성공했을 때만 객체가 채워져 존재 여부로 판별 가능하지만, rev는 성공 0건과
  // 실패 모두 revRows 초기값 0이라 result.rev만으로는 구분 불가(이 계약을 넓히는 건 run-all.ts
  // 변경이 필요해 이번 스코프 밖). 그래서: (a) hw는 신뢰 가능한 성공 시그널이 있으니 그대로
  // 활용하고, (b) rev까지 포함해 최소한 개요/세그먼트를 묶어 보여주는 branch-seg만은 skipped가
  // 아닌 한 항상 무효화한다 — 완전 실패로 무효화해도 다음 조회는 최신(=변화 없음)을 읽을 뿐 해가
  // 없고, rev가 부분 반영됐다면 그 반영을 다음 조회에서 확실히 보게 한다.
  if (!result.skipped) {
    revalidateTag("branch-seg", "max")
    if (!result.ok && effectiveSources.includes("hw") && result.hw) {
      revalidateTag(BRANCH_HW_CACHE_TAG, "max")
    }
  }

  if (result.ok) {
    const cacheTags = ["branch-dsh", "branch-kpi"]
    if (effectiveSources.includes("rev")) cacheTags.push(BRANCH_REV_DEALS_CACHE_TAG, ADMIN_CRM_REVENUE_CACHE_TAG)
    if (effectiveSources.includes("hw")) cacheTags.push(BRANCH_HW_CACHE_TAG)
    for (const tag of cacheTags) {
      revalidateTag(tag, "max")
    }
    const crmLinks = effectiveSources.includes("rev") ? await runBranchRevLinkMaintenance() : undefined
    return NextResponse.json({ ...result, crmLinks }, { status: 200 })
  }
  if (result.skipped) {
    return NextResponse.json(result, { status: 200 })  // skipped is not an error
  }
  return NextResponse.json(result, { status: 500 })
}
