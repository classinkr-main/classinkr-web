"use client"

import { adminFetch } from "@/lib/admin-client"
import { ADMIN_REQUESTS_API, type AdminRequest } from "@/lib/admin/requests"

export class RequestWriteRejection extends Error {}

export function verifyRequestData(request: AdminRequest, id: string) {
  if (request?.id !== id || !Number.isSafeInteger(request.revision) || !Array.isArray(request.replies)) {
    throw new Error("요청 응답을 확인할 수 없습니다.")
  }
  return request
}

export async function sendRequestWrite(method: "POST" | "PATCH", body: FormData | string, id: string) {
  const response = await adminFetch(ADMIN_REQUESTS_API, { method, body, adminTimeoutMs: 15000 })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status >= 400 && response.status < 500 && ![408, 425, 429].includes(response.status)) {
      throw new RequestWriteRejection(data?.error ?? "요청을 저장할 수 없습니다.")
    }
    throw new Error("저장 결과를 확인할 수 없습니다.")
  }
  return verifyRequestData(data, id)
}
