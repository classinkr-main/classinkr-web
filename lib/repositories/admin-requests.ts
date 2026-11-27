import "server-only"

import { createHash } from "node:crypto"

import {
  REQUEST_CAPTURE_RETENTION_MS, REQUEST_PAGE_SIZE, REQUEST_REPLY_LIMIT,
  type AdminRequest, type AdminRequestQueue, type AdminRequestSummary, type RequestKind, type RequestReview, type RequestStatus,
} from "@/lib/admin/requests"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

const SUMMARY_COLUMNS =
  "id, kind, title, screen, test_version, status, reporter_name, acknowledged_at, requester_review, created_at, updated_at, revision"
const REQUEST_COLUMNS = SUMMARY_COLUMNS +
  ", description, error_code, logs, capture_mime, acknowledged_by, capture_expires_at, requester_reviewed_at, replies"
const REQUEST_DB_TIMEOUT_MS = 10000

function hideExpiredCapture(request: AdminRequest): AdminRequest {
  return request.capture_expires_at && Date.parse(request.capture_expires_at) <= Date.now()
    ? { ...request, capture_mime: null }
    : request
}

type NewRequest = Pick<AdminRequest, "kind" | "title" | "description" | "reporter_name" | "screen" | "test_version" | "error_code" | "logs" | "capture_mime"> & {
  id: string
  reporter_id: string
  capture_data: string | null
}

const REQUEST_QUEUE_FILTERS: Record<AdminRequestQueue, [column: string, operator: "is" | "eq", value: string]> = {
  unacknowledged: ["acknowledged_at", "is", "null"],
  reopened: ["requester_review", "eq", "reopened"],
  review: ["status", "eq", "resolved"],
}

export async function countAdminRequestQueues(ownerId: string | null) {
  const table = createSupabaseAdminClient().from("admin_requests")
  const queues: AdminRequestQueue[] = ownerId ? ["review"] : ["unacknowledged", "reopened"]
  const signal = AbortSignal.timeout(2500)
  const counts = await Promise.all(queues.map(async (queue) => {
    const query = table.select("id", { count: "exact", head: true }).filter(...REQUEST_QUEUE_FILTERS[queue])
    if (ownerId) query.eq("reporter_id", ownerId)
    const { count, error } = await query.abortSignal(signal)
    if (error) throw error
    return [queue, count ?? 0] as const
  }))
  return Object.fromEntries(counts)
}

export async function listAdminRequests(
  ownerId: string | null,
  page: number,
  status: RequestStatus | null,
  queue: AdminRequestQueue | null = null,
  { kind, search }: { kind?: RequestKind; search?: string } = {},
) {
  const offset = page * REQUEST_PAGE_SIZE
  const query = createSupabaseAdminClient().from("admin_requests").select(SUMMARY_COLUMNS)
  if (ownerId) query.eq("reporter_id", ownerId)
  if (status) query.eq("status", status)
  if (queue) query.filter(...REQUEST_QUEUE_FILTERS[queue])
  if (kind) query.eq("kind", kind)
  if (search) query.ilike("title", `%${search.replace(/[\\%_]/g, "\\$&")}%`)
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + REQUEST_PAGE_SIZE)
    .abortSignal(AbortSignal.timeout(REQUEST_DB_TIMEOUT_MS))
    .returns<AdminRequestSummary[]>()
  if (error) throw error
  return { requests: data.slice(0, REQUEST_PAGE_SIZE), hasMore: data.length > REQUEST_PAGE_SIZE }
}

export async function findAdminRequest(id: string, ownerId: string | null, signal = AbortSignal.timeout(REQUEST_DB_TIMEOUT_MS)) {
  const query = createSupabaseAdminClient().from("admin_requests").select(REQUEST_COLUMNS).eq("id", id)
  if (ownerId) query.eq("reporter_id", ownerId)
  const { data, error } = await query.abortSignal(signal).maybeSingle<AdminRequest>()
  if (error) throw error
  return data && hideExpiredCapture(data)
}

function submissionFingerprint(input: Pick<NewRequest, "kind" | "title" | "description" | "screen" | "test_version" | "error_code" | "logs" | "capture_mime" | "capture_data">) {
  return fingerprint([
    input.kind, input.title, input.description, input.screen, input.test_version,
    input.error_code, input.logs, input.capture_mime, input.capture_data,
  ])
}

function fingerprint(fields: unknown[]) {
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex")
}

export async function insertAdminRequest(input: NewRequest) {
  const table = createSupabaseAdminClient().from("admin_requests")
  const digest = submissionFingerprint(input)
  const signal = AbortSignal.timeout(REQUEST_DB_TIMEOUT_MS)
  const { data, error } = await table
    .insert({ ...input, submission_fingerprint: digest })
    .select(REQUEST_COLUMNS)
    .abortSignal(signal)
    .single<AdminRequest>()
  if (!error) return { request: data, replayed: false }
  if (error.code !== "23505") throw error

  const existing = await table.select(REQUEST_COLUMNS + ", submission_fingerprint")
    .eq("id", input.id).eq("reporter_id", input.reporter_id).abortSignal(signal)
    .maybeSingle<AdminRequest & { submission_fingerprint: string | null }>()
  if (existing.error) throw existing.error
  if (!existing.data) return "submission_conflict" as const

  const { submission_fingerprint, ...request } = existing.data
  let original = submission_fingerprint
  if (original === null) {
    // An older row may no longer have its original screenshot. If so, its exact submission cannot be verified.
    if (request.capture_expires_at && !request.capture_mime) return "submission_conflict" as const
    const capture = request.capture_mime && await findRequestCapture(input.id, input.reporter_id, signal)
    if (request.capture_mime && !capture) return "submission_conflict" as const
    original = submissionFingerprint({ ...request, capture_data: capture ? capture.capture_data : null })
  }

  return original === digest
    ? { request: hideExpiredCapture(request), replayed: true }
    : "submission_conflict" as const
}

export async function findRequestCapture(id: string, ownerId: string | null, signal = AbortSignal.timeout(REQUEST_DB_TIMEOUT_MS)) {
  const query = createSupabaseAdminClient().from("admin_requests").select("capture_mime, capture_data, capture_expires_at").eq("id", id)
  query.or(`capture_expires_at.is.null,capture_expires_at.gt.${new Date().toISOString()}`)
  if (ownerId) query.eq("reporter_id", ownerId)
  const { data, error } = await query.abortSignal(signal).maybeSingle()
  if (error) throw error
  if (data?.capture_expires_at && Date.parse(data.capture_expires_at) <= Date.now()) return null
  return data
}

type RequestEdit = {
  id: string
  revision: number
  reply: string
  author: string
  operation?: { id: string; actorId: string }
}

type StaffEdit = RequestEdit & {
  status: RequestStatus
  acknowledge: boolean
}

type ReporterEdit = RequestEdit & {
  ownerId: string
  review: RequestReview
}

type MutationReceipt = { id: string; fingerprint: string }
const RECEIPT_LIMIT = 20

async function saveRequestChange(input: StaffEdit | ReporterEdit) {
  const { id, revision, reply, author, operation } = input
  const ownerEdit = "ownerId" in input
  const ownerId = ownerEdit ? input.ownerId : null
  const digest = operation && fingerprint([
    operation.actorId, revision, reply, ownerEdit ? ["review", input.review] : ["staff", input.status, input.acknowledge],
  ])
  const signal = AbortSignal.timeout(REQUEST_DB_TIMEOUT_MS)
  const table = createSupabaseAdminClient().from("admin_requests")
  async function lookupCurrent() {
    const lookup = table.select("revision, replies, status, acknowledged_at, capture_mime, mutation_receipts").eq("id", id)
    if (ownerId) lookup.eq("reporter_id", ownerId)
    const { data, error } = await lookup.abortSignal(signal)
      .maybeSingle<Pick<AdminRequest, "revision" | "replies" | "status" | "acknowledged_at" | "capture_mime"> & { mutation_receipts: MutationReceipt[] }>()
    if (error) throw error
    return data
  }

  async function recoverReceipt(receipts: MutationReceipt[]) {
    if (!operation) return null
    const prior = receipts.find((receipt) => receipt.id === operation.id)
    if (!prior) return null
    if (prior.fingerprint !== digest) return "mutation_conflict" as const
    return await findAdminRequest(id, ownerId, signal) ?? "missing" as const
  }

  const current = await lookupCurrent()
  if (!current) return "missing"
  const recovered = await recoverReceipt(current.mutation_receipts)
  if (recovered) return recovered
  if (revision !== current.revision) return "conflict"
  if (ownerEdit && current.status !== "resolved") return "not_awaiting_review"
  if (!ownerEdit && input.status === "closed" && current.status !== "closed") return "requires_reporter"
  if (reply && current.replies.length >= REQUEST_REPLY_LIMIT) return "reply_limit"

  const status = ownerEdit ? (input.review === "confirmed" ? "closed" : "in-progress") : input.status
  const firstAcknowledgement = !ownerEdit && input.acknowledge && !current.acknowledged_at
  if (!ownerEdit && !reply && status === current.status && !firstAcknowledgement) return "no_change"

  const now = new Date()
  const at = now.toISOString()
  const review = ownerEdit
    ? { requester_review: input.review, requester_reviewed_at: at }
    : status !== current.status && (status === "resolved" || current.status === "closed")
      ? { requester_review: null, requester_reviewed_at: null }
      : {}
  const update = table.update({
    status,
    ...review,
    ...(reply && { replies: [...current.replies, { author, text: reply, at, from: ownerEdit ? "reporter" : "staff" }] }),
    ...(operation && digest && {
      mutation_receipts: [...current.mutation_receipts.slice(-(RECEIPT_LIMIT - 1)), { id: operation.id, fingerprint: digest }],
    }),
    ...(firstAcknowledgement && {
      acknowledged_at: at,
      acknowledged_by: author,
      capture_expires_at: current.capture_mime
        ? new Date(now.getTime() + REQUEST_CAPTURE_RETENTION_MS).toISOString()
        : null,
    }),
    revision: revision + 1,
    updated_at: at,
  }).eq("id", id).eq("revision", revision)
  if (ownerId) update.eq("reporter_id", ownerId)
  const { data, error } = await update.select(REQUEST_COLUMNS).abortSignal(signal).maybeSingle<AdminRequest>()
  if (error) throw error
  if (data) return hideExpiredCapture(data)

  // Two identical in-flight calls may race at the revision check. The winning write owns the receipt.
  if (operation) {
    const latest = await lookupCurrent()
    if (latest) return await recoverReceipt(latest.mutation_receipts) ?? "conflict"
  }
  return "conflict"
}

export async function updateAdminRequest(input: StaffEdit) {
  return saveRequestChange(input)
}

export async function reviewAdminRequest(input: ReporterEdit) {
  return saveRequestChange(input)
}

export async function purgeExpiredRequestCaptures() {
  const { count, error } = await createSupabaseAdminClient()
    .from("admin_requests")
    .update({ capture_mime: null, capture_data: null }, { count: "exact" })
    .not("capture_mime", "is", null)
    .not("acknowledged_at", "is", null)
    .lte("capture_expires_at", new Date().toISOString())
    .abortSignal(AbortSignal.timeout(5000))
  if (error) throw error
  return count ?? 0
}
