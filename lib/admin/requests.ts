import type { BugReport } from "@/lib/bugs-data"

export const REQUEST_KINDS = {
  bug: "오류",
  idea: "개선",
  data: "데이터",
  question: "질문",
} as const

export const REQUEST_STATUSES = {
  open: "접수",
  "in-progress": "진행 중",
  resolved: "해결 확인 대기",
  closed: "종료",
} as const

export const REQUEST_CAPTURE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const
export const REQUEST_CAPTURE_BYTES = 2 * 1024 * 1024
export const REQUEST_PAGE_SIZE = 30
export const REQUEST_SEARCH_MAX_LENGTH = 100
export const REQUEST_REPLY_LIMIT = 30
export const REQUEST_CAPTURE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
export const ADMIN_REQUESTS_HREF = "/admin/requests"
export const ADMIN_REQUESTS_API = "/api/admin/requests"
export const ADMIN_REQUEST_ROLES = ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR"] as const

export function canSubmitAdminRequest(role: string) {
  return ADMIN_REQUEST_ROLES.some((allowed) => allowed === role.toUpperCase())
}

export type RequestKind = keyof typeof REQUEST_KINDS
export type RequestStatus = keyof typeof REQUEST_STATUSES
export type RequestReview = "confirmed" | "reopened"

export const ADMIN_REQUEST_QUEUES = {
  unacknowledged: "미확인",
  reopened: "재확인 요청",
  review: "해결 확인 필요",
} as const

export type AdminRequestQueue = keyof typeof ADMIN_REQUEST_QUEUES

export function isAdminRequestQueue(value: string): value is AdminRequestQueue {
  return Object.hasOwn(ADMIN_REQUEST_QUEUES, value)
}

export interface AdminRequestSummary {
  id: string
  kind: RequestKind
  title: string
  screen: string | null
  test_version: string | null
  status: RequestStatus
  reporter_name: string
  acknowledged_at: string | null
  requester_review: RequestReview | null
  created_at: string
  updated_at: string
  revision: number
}

export interface AdminRequest extends AdminRequestSummary {
  description: string
  error_code: string | null
  logs: string | null
  capture_mime: string | null
  acknowledged_by: string | null
  capture_expires_at: string | null
  requester_reviewed_at: string | null
  replies: { author: string; text: string; at: string; from?: "reporter" | "staff" }[]
}

export interface AdminRequestsPage {
  canManage: boolean
  requests: AdminRequestSummary[]
  bugs: BugReport[] | null
  hasMore: boolean
  queueCounts: Partial<Record<AdminRequestQueue, number>> | null
}

export function isRequestReview(value: unknown): value is RequestReview {
  return value === "confirmed" || value === "reopened"
}

export function isRequestKind(value: unknown): value is RequestKind {
  return typeof value === "string" && Object.hasOwn(REQUEST_KINDS, value)
}

export function isRequestStatus(value: unknown): value is RequestStatus {
  return typeof value === "string" && Object.hasOwn(REQUEST_STATUSES, value)
}

export function cleanRequestScreen(value: string | null) {
  const path = value?.trim().split(/[?#]/, 1)[0]
  return path && /^\/(?!\/)[a-zA-Z0-9/_-]{0,239}$/.test(path) ? path : null
}

export function cleanTestVersion(value: string | null) {
  return value && /^[a-zA-Z0-9_.-]{1,64}$/.test(value) ? value : null
}

export function cleanRequestErrorCode(value: string | null) {
  return value && /^[a-zA-Z0-9_.-]{1,80}$/.test(value) ? value : null
}

export function isRequestId(value: string | null): value is string {
  return value !== null && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value)
}

export function requestContextQuery(values: Pick<URLSearchParams, "get">) {
  const query = new URLSearchParams()
  const requestId = values.get("request")
  const screen = cleanRequestScreen(values.get("screen"))
  const version = cleanTestVersion(values.get("testVersion"))
  const errorCode = cleanRequestErrorCode(values.get("errorCode"))
  if (screen) query.set("screen", screen)
  if (version) query.set("testVersion", version)
  if (errorCode) query.set("errorCode", errorCode)
  if (isRequestId(requestId)) query.set("request", requestId.toLowerCase())
  return query
}
