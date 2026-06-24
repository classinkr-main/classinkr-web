import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Chainable Supabase query-builder mock.
// update()/select() return a thenable that also exposes eq/is/or/order.
type Op = { table: string; method: string; payload?: unknown; filters: Record<string, unknown> }

const ops: Op[] = []
let selectLeadsRows: Array<{ id: string }> = []
// Inject a resolved PostgREST error for a given `${table}:${method}` (best-effort path tests).
let errorFor: Record<string, { message: string }> = {}

function makeBuilder(table: string, method: string, payload?: unknown) {
  const op: Op = { table, method, payload, filters: {} }
  ops.push(op)

  const builder: Record<string, unknown> = {}
  const chain = (key: string) => (col: string, val?: unknown) => {
    op.filters[`${key}:${col}`] = val ?? null
    return builder
  }
  builder.eq = chain("eq")
  builder.is = chain("is")
  builder.or = (expr: string) => {
    op.filters["or"] = expr
    return builder
  }
  builder.order = (col: string, opts?: unknown) => {
    op.filters[`order:${col}`] = opts ?? null
    return builder
  }

  // Resolution: an injected error wins; else a `select` on leads returns the configured rows;
  // everything else resolves clean. PostgREST resolves (never throws) with { data, error }.
  const injectedError = errorFor[`${table}:${method}`] ?? null
  const resolved = injectedError
    ? { data: null, error: injectedError }
    : table === "leads" && method === "select"
      ? { data: selectLeadsRows, error: null }
      : { data: null, error: null }

  ;(builder as { then: unknown }).then = (
    onFulfilled: (value: unknown) => unknown
  ) => Promise.resolve(resolved).then(onFulfilled)

  return builder
}

const from = vi.fn((table: string) => ({
  update: (payload: unknown) => makeBuilder(table, "update", payload),
  insert: (payload: unknown) => makeBuilder(table, "insert", payload),
  select: () => makeBuilder(table, "select"),
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from })),
}))

import {
  associateLeadsForVerifiedEmail,
  shouldAutoLinkEmail,
  stitchIdentity,
} from "@/lib/identity/stitch"

const USER_ID = "11111111-1111-4111-8111-111111111111"
const LEAD_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const LEAD_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

function leadsUpdateOps() {
  return ops.filter((op) => op.table === "leads" && op.method === "update")
}

describe("shouldAutoLinkEmail", () => {
  it("returns true only when the email is verified", () => {
    expect(shouldAutoLinkEmail(true)).toBe(true)
    expect(shouldAutoLinkEmail(false)).toBe(false)
  })
})

describe("associateLeadsForVerifiedEmail", () => {
  beforeEach(() => {
    ops.length = 0
    selectLeadsRows = [{ id: LEAD_A }, { id: LEAD_B }]
    errorFor = {}
    from.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("associates ALL matching leads scoped by email and user_id IS NULL", async () => {
    const result = await associateLeadsForVerifiedEmail(USER_ID, "Owner@Example.com")

    const updates = leadsUpdateOps()
    expect(updates).toHaveLength(1)
    // payload sets user_id to the caller's id
    expect(updates[0].payload).toEqual({ user_id: USER_ID })
    // scoped by lowercased email and unassociated rows only (no limit-1)
    expect(updates[0].filters["eq:email"]).toBe("owner@example.com")
    expect(updates[0].filters["is:user_id"]).toBeNull()

    // canonical = most recent (first row of created_at desc select)
    expect(result.canonicalLeadId).toBe(LEAD_A)
    expect(result.leadIds).toEqual([LEAD_A, LEAD_B])

    // client_events backfill is scoped by user_id (never unbounded)
    const eventBackfill = ops.find(
      (op) => op.table === "client_events" && op.method === "update"
    )
    expect(eventBackfill?.filters["eq:user_id"]).toBe(USER_ID)
    expect(eventBackfill?.filters["is:lead_id"]).toBeNull()

    // user_profiles canonical link scoped to this user with null lead_id guard
    const profile = ops.find((op) => op.table === "user_profiles" && op.method === "update")
    expect(profile?.payload).toEqual({ lead_id: LEAD_A })
    expect(profile?.filters["eq:id"]).toBe(USER_ID)
  })

  it("returns empty without writing when inputs are invalid", async () => {
    const result = await associateLeadsForVerifiedEmail("not-a-uuid", "not-an-email")
    expect(result).toEqual({ leadIds: [], canonicalLeadId: null })
    expect(leadsUpdateOps()).toHaveLength(0)
  })

  it("with zero matching leads, links nothing and writes no profile/event updates", async () => {
    selectLeadsRows = []
    const result = await associateLeadsForVerifiedEmail(USER_ID, "owner@example.com")
    expect(result).toEqual({ leadIds: [], canonicalLeadId: null })
    // the associate UPDATE is still attempted, but no canonical lead → no downstream writes
    expect(ops.some((op) => op.table === "user_profiles" && op.method === "update")).toBe(false)
    expect(ops.some((op) => op.table === "client_events" && op.method === "update")).toBe(false)
  })

  it("surfaces a RESOLVED PostgREST error on the associate UPDATE as a warning (best-effort, no throw)", async () => {
    errorFor["leads:update"] = { message: "column leads.user_id does not exist" }
    const warnings: string[] = []
    // must not throw even though the write resolved with an error (pre-migration window)
    const result = await associateLeadsForVerifiedEmail(USER_ID, "owner@example.com", warnings)
    expect(result.canonicalLeadId).toBe(LEAD_A) // select still returned rows
    expect(
      warnings.some(
        (w) => w.includes("leads associate by verified email") && w.includes("does not exist")
      )
    ).toBe(true)
  })

  it("collects a warning (no throw) when the leads select resolves with an error", async () => {
    errorFor["leads:select"] = { message: "boom" }
    const warnings: string[] = []
    const result = await associateLeadsForVerifiedEmail(USER_ID, "owner@example.com", warnings)
    expect(result.canonicalLeadId).toBeNull()
    expect(warnings.some((w) => w.includes("leads select by user_id"))).toBe(true)
  })
})

describe("stitchIdentity verification gate", () => {
  beforeEach(() => {
    ops.length = 0
    selectLeadsRows = [{ id: LEAD_A }]
    errorFor = {}
    from.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("does NOT associate leads when the email is unverified", async () => {
    await stitchIdentity({
      anonymousId: "anon-unverified-0001",
      userId: USER_ID,
      email: "owner@example.com",
      emailVerified: false,
    })

    // no email-based leads UPDATE happened (the only leads.update would come from association)
    expect(leadsUpdateOps()).toHaveLength(0)
    // and no leads select-by-user_id either
    expect(ops.some((op) => op.table === "leads" && op.method === "select")).toBe(false)
  })

  it("associates leads when the email is verified and userId is present", async () => {
    await stitchIdentity({
      anonymousId: "anon-verified-0001",
      userId: USER_ID,
      email: "owner@example.com",
      emailVerified: true,
    })

    const updates = leadsUpdateOps()
    expect(updates).toHaveLength(1)
    expect(updates[0].filters["eq:email"]).toBe("owner@example.com")
    expect(updates[0].filters["is:user_id"]).toBeNull()
  })

  it("writes one identity_stitch_logs audit row best-effort", async () => {
    await stitchIdentity({
      anonymousId: "anon-audit-0001",
      userId: USER_ID,
      email: "owner@example.com",
      emailVerified: true,
    })

    const auditInserts = ops.filter(
      (op) => op.table === "identity_stitch_logs" && op.method === "insert"
    )
    expect(auditInserts).toHaveLength(1)
    expect(auditInserts[0].payload).toMatchObject({
      user_id: USER_ID,
      email: "owner@example.com",
      email_verified: true,
    })
  })

  it("uses the explicit leadId (not the email-derived canonical) and labels the action explicit_lead", async () => {
    selectLeadsRows = [{ id: LEAD_A }]
    await stitchIdentity({
      anonymousId: "anon-explicit-0001",
      userId: USER_ID,
      leadId: LEAD_B, // explicitly-known just-created lead
      email: "owner@example.com",
      emailVerified: true,
    })

    const audit = ops.find(
      (op) => op.table === "identity_stitch_logs" && op.method === "insert"
    )
    // explicit leadId wins for the action label and the returned/audited lead set
    expect(audit?.payload).toMatchObject({ action: "explicit_lead" })
    expect((audit?.payload as { lead_ids: string[] }).lead_ids).toContain(LEAD_B)
    // the explicit path links the profile to the explicit lead (LEAD_B)
    const explicitProfileLink = ops.find(
      (op) =>
        op.table === "user_profiles" &&
        op.method === "update" &&
        (op.payload as { lead_id?: string }).lead_id === LEAD_B
    )
    expect(explicitProfileLink).toBeDefined()
  })
})
