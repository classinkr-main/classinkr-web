import { beforeEach, describe, expect, it, vi } from "vitest"

const { table, read, write } = vi.hoisted(() => {
  const read = { eq: vi.fn(), abortSignal: vi.fn(), maybeSingle: vi.fn() }
  const write = { eq: vi.fn(), select: vi.fn(), abortSignal: vi.fn(), maybeSingle: vi.fn(), single: vi.fn() }
  const table = { select: vi.fn(), update: vi.fn(), insert: vi.fn() }
  return { table, read, write }
})

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: () => table }),
}))

import { insertAdminRequest, reviewAdminRequest, updateAdminRequest } from "@/lib/repositories/admin-requests"

const base = { id: "request-1", revision: 3, author: "길동", reply: "" }
const current = { status: "resolved", revision: 3, replies: [], acknowledged_at: null, capture_mime: "image/png", mutation_receipts: [] }

beforeEach(() => {
  vi.resetAllMocks()
  table.select.mockReturnValue(read)
  table.update.mockReturnValue(write)
  table.insert.mockReturnValue(write)
  read.eq.mockReturnValue(read)
  read.abortSignal.mockReturnValue(read)
  write.eq.mockReturnValue(write)
  write.abortSignal.mockReturnValue(write)
  write.select.mockReturnValue(write)
  read.maybeSingle.mockResolvedValue({ data: current, error: null })
  write.maybeSingle.mockResolvedValue({ data: { revision: 4, status: "closed" }, error: null })
})

describe("admin request review data", () => {
  it("allows the reporter confirmation to close only their own request at its read revision", async () => {
    await expect(reviewAdminRequest({ ...base, ownerId: "owner-1", review: "confirmed" }))
      .resolves.toMatchObject({ status: "closed", revision: 4 })
    expect(read.eq).toHaveBeenCalledWith("reporter_id", "owner-1")
    expect(write.eq.mock.calls).toEqual([["id", "request-1"], ["revision", 3], ["reporter_id", "owner-1"]])
    const change = table.update.mock.calls[0][0]
    expect(change).toMatchObject({ status: "closed", requester_review: "confirmed", requester_reviewed_at: expect.any(String) })
    expect(change).not.toHaveProperty("capture_expires_at")
  })

  it("keeps the reporter's reason and reopens the request without touching the capture", async () => {
    await reviewAdminRequest({ ...base, ownerId: "owner-1", review: "reopened", reply: "같은 오류가 남아 있어요." })
    expect(table.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "in-progress",
      requester_review: "reopened",
      replies: [{ author: "길동", text: "같은 오류가 남아 있어요.", from: "reporter", at: expect.any(String) }],
    }))
    expect(table.update.mock.calls[0][0]).not.toHaveProperty("capture_expires_at")
  })

  it("does not let a manager close an unconfirmed request", async () => {
    await expect(updateAdminRequest({ ...base, status: "closed", acknowledge: false })).resolves.toBe("requires_reporter")
    expect(table.update).not.toHaveBeenCalled()
  })

  it("reports a concurrent update and does not retry over the other person's work", async () => {
    write.maybeSingle.mockResolvedValue({ data: null, error: null })
    await expect(reviewAdminRequest({ ...base, ownerId: "owner-1", review: "confirmed" })).resolves.toBe("conflict")
    expect(table.update).toHaveBeenCalledOnce()
  })

  it("lets the reporter retry a full thread without appending a note", async () => {
    read.maybeSingle.mockResolvedValue({ data: { ...current, replies: Array.from({ length: 30 }, () => ({ text: "답변" })) }, error: null })
    const reopen = { ...base, ownerId: "owner-1", review: "reopened" as const }
    await expect(reviewAdminRequest({ ...reopen, reply: "메모" })).resolves.toBe("reply_limit")
    expect(table.update).not.toHaveBeenCalled()
    await reviewAdminRequest(reopen)
    expect(table.update).toHaveBeenCalledOnce()
  })
})

describe("admin request operation receipts", () => {
  const operation = { id: "operation-1", actorId: "owner-1" }
  const change = { ...base, ownerId: "owner-1", review: "reopened" as const, reply: "재확인해 주세요.", operation }
  const submission = {
    id: "request-1", reporter_id: "owner-1", reporter_name: "팀원", kind: "bug" as const,
    title: "저장 오류", description: "저장 후 데이터가 사라져요.", screen: "/admin/quotes",
    test_version: "quote-v1", error_code: null, logs: "샘플 로그", capture_data: null, capture_mime: null,
  }

  it("returns the first creation when the same submission is retried and rejects changed data", async () => {
    const row = { ...submission, status: "open", revision: 0 }
    write.single.mockResolvedValueOnce({ data: row, error: null })
    await expect(insertAdminRequest(submission)).resolves.toMatchObject({ replayed: false })
    const digest = table.insert.mock.calls[0][0].submission_fingerprint
    write.single.mockResolvedValue({ data: null, error: { code: "23505" } })
    read.maybeSingle.mockResolvedValue({ data: { ...row, submission_fingerprint: digest }, error: null })
    const recovered = await insertAdminRequest({ ...submission, reporter_name: "바뀐 이름" })
    expect(recovered).toMatchObject({ replayed: true })
    expect(recovered).not.toHaveProperty("request.submission_fingerprint")
    await expect(insertAdminRequest({ ...submission, description: "다른 내용" })).resolves.toBe("submission_conflict")
  })

  it("compares immutable fields for submissions saved before fingerprints existed", async () => {
    const row = { ...submission, status: "open", revision: 0, submission_fingerprint: null, capture_expires_at: null }
    write.single.mockResolvedValue({ data: null, error: { code: "23505" } })
    read.maybeSingle.mockResolvedValue({ data: row, error: null })
    await expect(insertAdminRequest(submission)).resolves.toMatchObject({ replayed: true })
    await expect(insertAdminRequest({ ...submission, logs: "다른 로그" })).resolves.toBe("submission_conflict")
  })

  it("returns a durable response after another change and never appends the reply twice", async () => {
    await reviewAdminRequest(change)
    const receipts = table.update.mock.calls[0][0].mutation_receipts
    const latest = { ...current, revision: 5, status: "in-progress", mutation_receipts: receipts }
    read.maybeSingle.mockResolvedValue({ data: latest, error: null })
    await expect(reviewAdminRequest(change)).resolves.toMatchObject({ revision: 5 })
    await expect(reviewAdminRequest({ ...change, reply: "변경된 메모" })).resolves.toBe("mutation_conflict")
    await expect(reviewAdminRequest({ ...change, operation: { ...operation, actorId: "다른 사용자" } }))
      .resolves.toBe("mutation_conflict")
    expect(table.update).toHaveBeenCalledOnce()
  })

  it("recovers the winning receipt on a concurrent retry", async () => {
    await reviewAdminRequest(change)
    const receipts = table.update.mock.calls[0][0].mutation_receipts
    table.update.mockClear()
    const winning = { ...current, revision: 4, status: "in-progress", mutation_receipts: receipts }
    read.maybeSingle.mockResolvedValueOnce({ data: current, error: null }).mockResolvedValue({ data: winning, error: null })
    write.maybeSingle.mockResolvedValue({ data: null, error: null })
    await expect(reviewAdminRequest(change)).resolves.toMatchObject({ revision: 4 })
    expect(table.update).toHaveBeenCalledOnce()
  })
})
