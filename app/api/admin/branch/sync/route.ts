import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { runAll } from "@/lib/branch/sync/run-all"
import { completeBranchSync } from "@/lib/branch/sync/complete"

// 시트 3범위 읽기 + 미러 교체 + 장부 임포트 재캡처 + CRM 링크 유지보수를 한 요청에서 끝낸다.
// 운영은 Fluid(기본 300초)지만 기본값에 기대지 않고 명시한다.
export const maxDuration = 300

export async function POST(req: NextRequest) {
  // 관리자(ADMIN·SUPER_ADMIN — verifyAdmin 기본 역할)만. "12/1 스냅샷 다시 읽기"도 같은 문을 지난다.
  const err = await verifyAdmin(req)
  if (err) return err
  const body = await req.json().catch(() => null) as { sources?: unknown; revSnapshotReread?: unknown } | null
  const sources = Array.isArray(body?.sources)
    ? body.sources.filter((s): s is "rev" | "hw" => s === "rev" || s === "hw")
    : []
  const effectiveSources = sources.length ? sources : ["rev", "hw"]
  // 시트 고정(lib/branch/rev-sheet-lock.ts) 중 REV 를 다시 읽는 유일한 길 — 글자 그대로 true 일 때만("true" 문자열은 무시).
  // 고정 전이면 runAll 이 이 표시를 쓰지 않는다(지금처럼 REV 를 읽는다).
  const revSnapshotReread = body?.revSnapshotReread === true
  const result = await runAll({
    trigger: "manual",
    sources: sources.length ? sources : undefined,
    ...(revSnapshotReread ? { allowLockedRevRead: true } : {}),
  })
  // 캐시 만료·링크 유지보수는 실제로 돌린 부분(result.ranSources)으로 고른다 — 고정 중이면 rev 가 dsh 로 바뀌어 돌았다.
  const completed = await completeBranchSync(result, effectiveSources)
  return NextResponse.json(completed, { status: result.ok || result.skipped ? 200 : 500 })
}
