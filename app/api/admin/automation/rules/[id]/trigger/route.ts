import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { executeRule } from "@/lib/automation-engine"
import { getAllLogs } from "@/lib/repositories/automation"

// 세그먼트 전원 발송(수신자마다 AI 블록 확장 포함)이라 기본 상한으로는 중간에 끊길 수 있다.
export const maxDuration = 300

/** 같은 규칙을 이 시간 안에 다시 실행하려면 force 가 필요하다 — 두 번 눌러 전원에게 두 번 나가는 것을 막는다. */
const RECENT_RUN_WINDOW_MS = 10 * 60 * 1000

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { id } = await params
  const body = (await req.json().catch(() => null)) as { force?: unknown } | null
  const force = body?.force === true

  try {
    if (!force) {
      // 최신순 첫 줄만 본다. 실행 중(pending)이거나 방금 끝난(sent) 실행이 있으면 확인을 요구한다.
      const [latest] = await getAllLogs(id)
      const elapsedMs = latest ? Date.now() - new Date(latest.triggeredAt).getTime() : Number.POSITIVE_INFINITY
      if (latest && latest.status !== "failed" && elapsedMs >= 0 && elapsedMs < RECENT_RUN_WINDOW_MS) {
        return NextResponse.json(
          {
            ok: false,
            code: "recent_run",
            error:
              latest.status === "pending"
                ? "이 규칙이 지금 실행 중입니다. 끝난 뒤 다시 시도해 주세요."
                : `이 규칙은 ${Math.max(1, Math.round(elapsedMs / 60000))}분 전에 실행됐습니다. 같은 대상에게 다시 보내려면 다시 실행을 확인해 주세요.`,
            lastRun: { logId: latest.id, status: latest.status, triggeredAt: latest.triggeredAt, recipientCount: latest.recipientCount },
          },
          { status: 409 }
        )
      }
    }

    const result = await executeRule(id)
    return NextResponse.json({ ok: result.status === "sent", ...result })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
