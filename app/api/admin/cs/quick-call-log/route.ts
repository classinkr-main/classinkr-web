import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import {
  completeCrmTask,
  createCrmTask,
  type CrmTaskPriority,
} from "@/lib/repositories/crm-tasks"

export async function POST(req: NextRequest) {
  const authErr = await verifyAdmin(req)
  if (authErr) return authErr

  try {
    const body = (await req.json()) as {
      rawText?: string
      targetLabel?: string
      title?: string
      detail?: string
      status?: "done" | "open"
      priority?: CrmTaskPriority
      ownerName?: string
    }

    const rawText = body.rawText?.trim() || ""
    let targetLabel = body.targetLabel?.trim()
    let title = body.title?.trim()
    const detail = body.detail?.trim() || rawText
    const status = body.status === "open" ? "open" : "done"
    const priority = body.priority || "normal"
    const ownerName = body.ownerName?.trim() || "김민재"

    // Fallback heuristic parsing if title or targetLabel are missing
    if (!targetLabel || !title) {
      if (rawText.includes(":") || rawText.includes("：")) {
        const parts = rawText.split(/[:：]/)
        if (!targetLabel && parts[0]?.trim()) {
          targetLabel = parts[0].trim()
        }
        if (!title && parts[1]?.trim()) {
          title = parts[1].trim().slice(0, 50)
        }
      } else if (rawText.includes("-") || rawText.includes("/")) {
        const parts = rawText.split(/[-/]/)
        if (!targetLabel && parts[0]?.trim()) {
          targetLabel = parts[0].trim()
        }
        if (!title && parts[1]?.trim()) {
          title = parts[1].trim().slice(0, 50)
        }
      }
    }

    if (!targetLabel) targetLabel = "전화 상담 고객"
    if (!title) title = rawText.slice(0, 40) || "유선 통화 상담 일지"

    // 1. Create call task
    const task = await createCrmTask({
      targetType: "lead",
      targetLabel,
      taskType: "call",
      title,
      detail,
      priority,
      ownerNameSnapshot: ownerName,
      dueAt: new Date().toISOString(),
      createdBy: "cs_quick_log",
    })

    // 2. If status is 'done', immediately complete it
    let finalTask = task
    if (status === "done") {
      const completed = await completeCrmTask(task.id, {
        outcome: detail,
        completedBy: ownerName,
      })
      if (completed) finalTask = completed
    }

    return NextResponse.json({
      ok: true,
      task: finalTask,
      message: `통화 일지가 등록되었습니다 (${status === "done" ? "해결 완료" : "후속 대기"}).`,
    })
  } catch (err) {
    console.error("[quick-call-log] Error creating task:", err)
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "전화 일지 저장에 실패했습니다.",
      },
      { status: 500 }
    )
  }
}
