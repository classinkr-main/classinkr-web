import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"

import { STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { ADMIN_REQUEST_ROLES, cleanRequestErrorCode, cleanRequestScreen, cleanTestVersion, isAdminRequestQueue, isRequestKind, isRequestReview, isRequestStatus, REQUEST_CAPTURE_BYTES, REQUEST_CAPTURE_TYPES } from "@/lib/admin/requests"
import { countAdminRequestQueues, findAdminRequest, findRequestCapture, insertAdminRequest, listAdminRequests, reviewAdminRequest, updateAdminRequest } from "@/lib/repositories/admin-requests"
import { getBugReports } from "@/lib/repositories/bugs"
import { validateImageFile } from "@/lib/server/image-validation"

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" }
const UUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i
const MAX_SUBMISSION_BYTES = REQUEST_CAPTURE_BYTES + 128 * 1024

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: PRIVATE_HEADERS })
}

function error(message: string, status: number) {
  return json({ error: message }, status)
}

function reportFailure(cause: unknown) {
  const code = typeof cause === "object" && cause && "code" in cause ? cause.code : undefined
  console.error("[admin requests] DB operation failed", code)
  return error("요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", 503)
}

function field(body: FormData, key: string) {
  const value = body.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function canManageRequests(role: string) {
  return STAFF_ADMIN_API_ROLES.some((allowed) => allowed === role)
}

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, ADMIN_REQUEST_ROLES)
  if (admin instanceof NextResponse) return admin
  const ownerId = admin.userId
  if (!ownerId) return error("등록된 관리자 계정으로 로그인해 주세요.", 403)
  const canManage = canManageRequests(admin.role)
  const params = req.nextUrl.searchParams
  const capture = params.get("capture")

  try {
    if (capture !== null) {
      if (!UUID.test(capture)) return error("첨부를 찾을 수 없습니다.", 404)
      const image = await findRequestCapture(capture, canManage ? null : ownerId)
      if (!image?.capture_data || !image.capture_mime) return error("첨부를 찾을 수 없습니다.", 404)
      return new NextResponse(new Uint8Array(Buffer.from(image.capture_data, "base64")), {
        headers: { ...PRIVATE_HEADERS, "Content-Type": image.capture_mime, "X-Content-Type-Options": "nosniff" },
      })
    }

    const manage = params.get("view") === "manage"
    if (manage && !canManage) return error("요청 관리 권한이 필요합니다.", 403)
    const id = params.get("id")
    if (id !== null) {
      if (!UUID.test(id)) return error("요청을 찾을 수 없습니다.", 404)
      const request = await findAdminRequest(id, manage ? null : ownerId)
      return request ? json(request) : error("요청을 찾을 수 없습니다.", 404)
    }
    const page = Number(params.get("page") ?? "0")
    if (!Number.isInteger(page) || page < 0 || page > 1000) return error("페이지 번호를 확인해 주세요.", 400)
    const filter = params.get("status")
    if (filter !== null && !isRequestStatus(filter)) return error("요청 상태를 확인해 주세요.", 400)
    const queue = params.get("queue")
    if (queue !== null && (!isAdminRequestQueue(queue) || (manage ? queue === "review" : queue !== "review") || filter !== null)) {
      return error("이 목록에서 사용할 수 있는 처리 필터를 선택해 주세요.", 400)
    }
    const scope = manage ? null : ownerId
    const [result, bugs, queueCounts] = await Promise.all([
      listAdminRequests(scope, page, filter, queue),
      manage && !queue && page === 0 ? getBugReports(AbortSignal.timeout(2500)).catch(() => null) : null,
      countAdminRequestQueues(scope).catch(() => null),
    ])
    return json({ ...result, canManage, queueCounts, bugs: bugs && filter ? bugs.filter((bug) => bug.status === filter) : bugs })
  } catch (cause) {
    return reportFailure(cause)
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, ADMIN_REQUEST_ROLES)
  if (admin instanceof NextResponse) return admin
  if (!admin.userId) return error("등록된 관리자 계정으로 로그인해 주세요.", 403)
  if (Number(req.headers.get("content-length")) > MAX_SUBMISSION_BYTES) {
    return error("캡처는 2MB 이하로 올려 주세요.", 413)
  }
  const body = await req.formData().catch(() => null)
  if (!body) return error("요청 내용을 확인해 주세요.", 400)
  const kind = field(body, "kind")
  const title = field(body, "title")
  const description = field(body, "description")
  const logs = field(body, "logs")
  const submissionId = field(body, "submissionId")
  if (!isRequestKind(kind) || !title || title.length > 120 || !description || description.length > 4000) {
    return error("분류, 제목(120자), 내용(4,000자)을 확인해 주세요.", 400)
  }
  if (logs.length > 8000) return error("관련 로그는 8,000자 이내로 입력해 주세요.", 400)
  if (submissionId && !UUID.test(submissionId)) return error("접수 번호를 확인해 주세요.", 400)

  const file = body.get("capture")
  let capture_data: string | null = null
  let capture_mime: string | null = null
  if (file instanceof File && file.size > 0) {
    const result = await validateImageFile(file, { allowedTypes: REQUEST_CAPTURE_TYPES, maxBytes: REQUEST_CAPTURE_BYTES })
    if (!result.ok) return error("캡처는 2MB 이하의 PNG, JPG 또는 WebP 이미지로 올려 주세요.", 400)
    capture_mime = file.type
    capture_data = Buffer.from(result.buffer).toString("base64")
  }

  try {
    const result = await insertAdminRequest({
      id: submissionId.toLowerCase() || randomUUID(),
      reporter_id: admin.userId,
      reporter_name: admin.name || "팀원",
      kind, title, description,
      screen: cleanRequestScreen(field(body, "screen")),
      test_version: cleanTestVersion(field(body, "testVersion")),
      error_code: cleanRequestErrorCode(field(body, "errorCode")),
      logs: logs || null,
      capture_mime, capture_data,
    })
    if (result === "submission_conflict") return error("이미 사용된 접수 번호입니다. 기존 요청을 확인한 뒤 다시 등록해 주세요.", 409)
    return json(result.request, result.replayed ? 200 : 201)
  } catch (cause) {
    return reportFailure(cause)
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, ADMIN_REQUEST_ROLES)
  if (admin instanceof NextResponse) return admin
  const ownerId = admin.userId
  if (!ownerId) return error("등록된 관리자 계정으로 로그인해 주세요.", 403)
  const body = await req.json().catch(() => null)
  if (!body || typeof body.id !== "string" || !UUID.test(body.id) || !Number.isInteger(body.revision) ||
      body.revision < 0 || body.revision >= 2147483647 || typeof body.reply !== "string" || body.reply.length > 4000) {
    return error("상태와 답변을 확인해 주세요.", 400)
  }
  if (body.mutationId !== undefined && (typeof body.mutationId !== "string" || !UUID.test(body.mutationId))) {
    return error("저장 번호를 확인해 주세요.", 400)
  }
  const base = {
    id: body.id.toLowerCase() as string, revision: body.revision, reply: body.reply.trim() as string,
    ...(typeof body.mutationId === "string" && { operation: { id: body.mutationId.toLowerCase(), actorId: ownerId } }),
  }

  try {
    let result: Awaited<ReturnType<typeof updateAdminRequest>>
    if (body.action === "review") {
      if (!isRequestReview(body.review)) return error("해결 확인 결과를 선택해 주세요.", 400)
      result = await reviewAdminRequest({ ...base, review: body.review, ownerId, author: admin.name || "요청자" })
    } else {
      if (!canManageRequests(admin.role)) return error("요청 관리 권한이 필요합니다.", 403)
      if (!isRequestStatus(body.status) || typeof body.acknowledge !== "boolean") {
        return error("상태와 답변을 확인해 주세요.", 400)
      }
      result = await updateAdminRequest({ ...base, status: body.status, acknowledge: body.acknowledge, author: admin.name || "담당자" })
    }
    if (result === "missing") return error("요청을 찾을 수 없습니다.", 404)
    if (result === "conflict") return error("다른 변경이 먼저 저장됐습니다. 최신 상태를 확인한 뒤 다시 저장해 주세요.", 409)
    if (result === "mutation_conflict") return error("같은 저장 번호의 내용이 다릅니다. 최신 상태를 확인해 주세요.", 409)
    if (result === "not_awaiting_review") return error("현재 해결 확인을 기다리는 요청이 아닙니다.", 409)
    if (result === "requires_reporter") return error("요청자가 해결을 확인하면 종료됩니다.", 409)
    if (result === "reply_limit") return error("답변 등록 한도에 도달했습니다. 글을 비우면 상태를 변경할 수 있습니다.", 409)
    if (result === "no_change") return error("확인함을 표시하거나, 상태 또는 답변을 수정해 주세요.", 400)
    return json(result)
  } catch (cause) {
    return reportFailure(cause)
  }
}
