import { describe, expect, it } from "vitest"

import { resolveNeoCrmOrderOccurredAt } from "@/lib/admin-crm-neo"

describe("Neo CRM recent orders", () => {
  it("uses the Neo CRM opportunity createdAt before the stored occurred_at value", () => {
    const occurredAt = resolveNeoCrmOrderOccurredAt({
      occurred_at: "2026-08-15T00:00:00.000Z",
      payload: {
        createdAt: "2026-06-10T09:30:00+09:00",
        updatedAt: "2026-06-12T10:00:00+09:00",
        closeDate: "2026-08-15",
      },
    })

    expect(occurredAt).toBe("2026-06-10T00:30:00.000Z")
  })

  it("falls back to stored occurred_at when the Neo CRM payload has no usable date", () => {
    const occurredAt = resolveNeoCrmOrderOccurredAt({
      occurred_at: "2026-06-11T02:00:00.000Z",
      payload: {
        createdAt: "",
        updatedAt: "not-a-date",
      },
    })

    expect(occurredAt).toBe("2026-06-11T02:00:00.000Z")
  })
})
