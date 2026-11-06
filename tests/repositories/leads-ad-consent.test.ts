import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }))

// 맞춤형 광고 활용 동의 기록(20261106) — 저장 매핑, 미적용 창의 묶음 덜기, 재유입 갱신.

const AD = {
  ad_consent: true,
  ad_consent_at: "2026-11-06T01:00:00.000Z",
  ad_consent_version: "ad-consent-2026-11-06",
}
const GA = { ga_client_id: "GA1.1.1.1", ga_session_id: "123", ga_ad_consent: true }
const ROW = { id: "lead-ad", source: "contact_page", status: "new", created_at: "2026-11-06T01:00:00.000Z" }

async function loadWithSupabase(results: Array<{ data: unknown; error: unknown }>) {
  vi.resetModules()
  process.env.USE_SUPABASE_LEADS = "true"
  const single = vi.fn()
  for (const result of results) single.mockResolvedValueOnce(result)
  const insert = vi.fn((payload: Record<string, unknown>) => {
    void payload
    return { select: () => ({ single }) }
  })
  const eq = vi.fn(() => ({ select: () => ({ single }) }))
  const update = vi.fn((payload: Record<string, unknown>) => {
    void payload
    return { eq }
  })
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => ({ from: vi.fn(() => ({ insert, update })) })),
  }))
  const leads = await import("@/lib/repositories/leads")
  return { ...leads, insert, update, eq }
}

const baseLead = {
  source: "contact_page",
  name: "광고 동의",
  phone: "010-1234-5678",
  timestamp: "2026-11-06T01:00:00.000Z",
  utm_source: "google",
  gclid: "gclid-1",
}

describe("leads ad consent columns", () => {
  const original = process.env.USE_SUPABASE_LEADS
  afterEach(() => {
    if (original === undefined) delete process.env.USE_SUPABASE_LEADS
    else process.env.USE_SUPABASE_LEADS = original
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("maps ad consent fields into the insert, NULL when absent", async () => {
    const { saveLead, insert } = await loadWithSupabase([
      { data: ROW, error: null },
      { data: ROW, error: null },
    ])
    await saveLead({ ...baseLead, ...AD })
    await saveLead(baseLead)

    expect(insert.mock.calls[0]?.[0]).toMatchObject(AD)
    expect(insert.mock.calls[1]?.[0]).toMatchObject({ ad_consent: null, ad_consent_at: null, ad_consent_version: null })
  })

  it("strips the whole ad_consent group when one column is named, keeping ga_* and utm", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { saveLead, insert } = await loadWithSupabase([
      { data: null, error: { code: "PGRST204", message: "Could not find the 'ad_consent_at' column of 'leads' in the schema cache" } },
      { data: ROW, error: null },
    ])
    await saveLead({ ...baseLead, ...GA, ...AD })

    const retry = insert.mock.calls[1]?.[0]
    expect(retry).not.toHaveProperty("ad_consent")
    expect(retry).not.toHaveProperty("ad_consent_at")
    expect(retry).not.toHaveProperty("ad_consent_version")
    expect(retry).toMatchObject({ ...GA, utm_source: "google", gclid: "gclid-1" })
  })

  it("does not strip ad_consent on a 'ga_ad_consent' missing-column error (whole-name match)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { saveLead, insert } = await loadWithSupabase([
      { data: null, error: { code: "42703", message: 'column "ga_ad_consent" of relation "leads" does not exist' } },
      { data: ROW, error: null },
    ])
    await saveLead({ ...baseLead, ...GA, ...AD })

    const retry = insert.mock.calls[1]?.[0]
    expect(retry).not.toHaveProperty("ga_client_id")
    expect(retry).not.toHaveProperty("ga_session_id")
    expect(retry).not.toHaveProperty("ga_ad_consent")
    expect(retry).toMatchObject({ ...AD, utm_source: "google" })
  })

  it("keeps utm·gclid·notes when both ga_* and ad_consent* migrations are missing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { saveLead, insert } = await loadWithSupabase([
      { data: null, error: { code: "PGRST204", message: "Could not find the 'ad_consent' column of 'leads' in the schema cache" } },
      { data: null, error: { code: "PGRST204", message: "Could not find the 'ga_client_id' column of 'leads' in the schema cache" } },
      { data: ROW, error: null },
    ])
    await saveLead({ ...baseLead, ...GA, ...AD, notes: "[event:open-day]" })

    expect(insert).toHaveBeenCalledTimes(3)
    const last = insert.mock.calls[2]?.[0]
    for (const column of [...Object.keys(AD), ...Object.keys(GA)]) expect(last).not.toHaveProperty(column)
    expect(last).toMatchObject({ utm_source: "google", gclid: "gclid-1", notes: "[event:open-day]" })
  })

  it("updateLeadAdConsent writes only the consent fields", async () => {
    const { updateLeadAdConsent, update, eq } = await loadWithSupabase([{ data: ROW, error: null }])
    const result = await updateLeadAdConsent("lead-ad", AD)

    expect(update).toHaveBeenCalledWith(AD)
    expect(eq).toHaveBeenCalledWith("id", "lead-ad")
    expect(result?.id).toBe("lead-ad")
  })

  it("updateLeadAdConsent warns and returns null when the columns are missing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { updateLeadAdConsent } = await loadWithSupabase([
      { data: null, error: { code: "PGRST204", message: "Could not find the 'ad_consent' column of 'leads' in the schema cache" } },
    ])

    await expect(updateLeadAdConsent("lead-ad", AD)).resolves.toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ad_consent 컬럼이 없어"), expect.any(String))
  })
})
