// POST /api/admin/crm/write-requests/[id]/execute 응답 해석 SSOT.
// 응답 shape: 성공 200 { ok: true, request }, 실행됐지만 실패 409 { ok: false, request },
// 실행 자체가 거부되면 4xx { error }. request는 DB raw row(snake_case)다.

export interface CrmWriteExecuteRequestRow {
  status?: string | null
  error?: string | null
  last_attempt_error?: string | null
}

export interface CrmWriteExecuteResponseBody {
  ok?: boolean
  request?: CrmWriteExecuteRequestRow | null
  error?: string | null
}

export interface CrmWriteExecuteOutcome {
  ok: boolean
  /** execute가 crm_write_requests.status에 반영한 값 (모르면 null) */
  status: string | null
  message: string
}

export function resolveCrmWriteExecuteOutcome(
  body: CrmWriteExecuteResponseBody | null,
  httpStatus: number
): CrmWriteExecuteOutcome {
  const request = body?.request
  if (request) {
    const status = typeof request.status === "string" ? request.status : null
    if (body?.ok === true && status === "succeeded") {
      return { ok: true, status, message: "외부 CRM 쓰기 요청을 실행했습니다." }
    }
    const detail =
      request.error ?? request.last_attempt_error ?? body?.error ?? `실행 결과 상태: ${status ?? "unknown"}`
    return { ok: false, status, message: `외부 CRM 쓰기 실행 실패: ${detail}` }
  }

  if (body?.error) {
    return { ok: false, status: null, message: body.error }
  }

  return {
    ok: false,
    status: null,
    message: `외부 CRM 쓰기 실행에 실패했습니다. (HTTP ${httpStatus})`,
  }
}
