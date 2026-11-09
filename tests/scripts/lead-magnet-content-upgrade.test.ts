import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  PROTECTED_FIELDS,
  buildLeadMagnetContentUpgradePlan,
  isSameContent,
} from "../../scripts/lib/lead-magnet-content-upgrade-plan.mjs"

const upgrade = {
  changes: {
    "matching-guide": {
      summary: { from: "예전 요약", to: "새 요약", reason: "요약 줄이기" },
      ctaCopy: {
        from: { eyebrow: "자료", title: "예전 제목", body: "본문", buttonLabel: "받기" },
        to: { eyebrow: "자료", title: "새 제목", body: "본문", buttonLabel: "받기" },
        reason: "제목 줄이기",
      },
    },
    "edited-guide": {
      summary: { from: "예전 요약", to: "새 요약", reason: "요약 줄이기" },
    },
    "missing-guide": {
      summary: { from: "예전 요약", to: "새 요약", reason: "요약 줄이기" },
    },
  },
}

describe("lead magnet content upgrade plan", () => {
  it("updates a field whose DB value still equals `from`, keeping every other field", () => {
    const plan = buildLeadMagnetContentUpgradePlan(upgrade, [
      {
        slug: "matching-guide",
        updated_at: "2026-08-18T00:00:00+00:00",
        data: {
          slug: "matching-guide",
          summary: "예전 요약",
          ctaCopy: { eyebrow: "자료", title: "예전 제목", body: "본문", buttonLabel: "받기" },
          title: "사람이 고친 제목",
        },
      },
    ])
    const operation = plan.operations.find((item) => item.slug === "matching-guide")
    expect(operation?.action).toBe("update")
    expect(operation?.updatedAt).toBe("2026-08-18T00:00:00+00:00")
    expect(operation?.fields.map((field) => [field.field, field.status])).toEqual([
      ["summary", "apply"],
      ["ctaCopy", "apply"],
    ])
    expect(operation?.data).toEqual({
      slug: "matching-guide",
      summary: "새 요약",
      ctaCopy: { eyebrow: "자료", title: "새 제목", body: "본문", buttonLabel: "받기" },
      title: "사람이 고친 제목",
    })
  })

  it("reports a hand-edited field as a conflict and does not write it", () => {
    const plan = buildLeadMagnetContentUpgradePlan(upgrade, [
      { slug: "edited-guide", updated_at: "t1", data: { summary: "원장이 직접 고친 요약" } },
    ])
    const operation = plan.operations.find((item) => item.slug === "edited-guide")
    expect(operation?.action).toBe("unchanged")
    expect(operation?.fields).toEqual([{ field: "summary", status: "conflict", reason: "요약 줄이기" }])
    expect(operation).not.toHaveProperty("data")
    expect(plan.fieldsInConflict).toBe(1)
  })

  it("applies the good fields and leaves the conflicting ones in the same row", () => {
    const plan = buildLeadMagnetContentUpgradePlan(upgrade, [
      {
        slug: "matching-guide",
        updated_at: "t1",
        data: {
          summary: "예전 요약",
          ctaCopy: { eyebrow: "자료", title: "사람이 바꾼 제목", body: "본문", buttonLabel: "받기" },
        },
      },
    ])
    const operation = plan.operations.find((item) => item.slug === "matching-guide")
    expect(operation?.fields.map((field) => field.status)).toEqual(["apply", "conflict"])
    expect(operation?.data?.summary).toBe("새 요약")
    expect(operation?.data?.ctaCopy).toEqual({ eyebrow: "자료", title: "사람이 바꾼 제목", body: "본문", buttonLabel: "받기" })
  })

  it("skips magnets that have no row in the table", () => {
    const plan = buildLeadMagnetContentUpgradePlan(upgrade, [])
    const operation = plan.operations.find((item) => item.slug === "missing-guide")
    expect(operation).toEqual({
      slug: "missing-guide",
      action: "skip-missing-row",
      fields: [{ field: "summary", status: "skipped", reason: "요약 줄이기" }],
    })
    expect(plan).toMatchObject({ magnets: 3, missingRows: 3, rowsToUpdate: 0, fieldsToApply: 0, fieldsSkipped: 4 })
  })

  it("treats an already-upgraded field as done (re-running is safe)", () => {
    const plan = buildLeadMagnetContentUpgradePlan(upgrade, [
      { slug: "edited-guide", updated_at: "t1", data: { summary: "새 요약" } },
    ])
    const operation = plan.operations.find((item) => item.slug === "edited-guide")
    expect(operation?.action).toBe("unchanged")
    expect(operation?.fields[0].status).toBe("already")
    expect(plan.fieldsAlreadyApplied).toBe(1)
  })

  it("counts admin-normalised shapes as the same value, but nothing else", () => {
    // 어드민 저장은 빠진 칸을 ""/[]로 채우고 앞뒤 공백을 지운다.
    expect(isSameContent({ label: "링크", href: "/a" }, { label: "링크 ", href: "/a", description: "" })).toBe(true)
    expect(isSameContent({ items: undefined }, { items: [] })).toBe(true)
    expect(isSameContent(["a", "b"], ["a", "b"])).toBe(true)
    expect(isSameContent(["a", "b"], ["b", "a"])).toBe(false)
    expect(isSameContent({ title: "제목" }, { title: "제목!" })).toBe(false)
    expect(isSameContent({ highlight: true }, {})).toBe(false)
    expect(isSameContent(12, 12)).toBe(true)
    expect(isSameContent(12, "12")).toBe(false)
  })

  it("rejects upgrade files that would touch routing, tracking or publishing fields", () => {
    for (const field of PROTECTED_FIELDS) {
      expect(() =>
        buildLeadMagnetContentUpgradePlan({ changes: { x: { [field]: { from: "a", to: "b", reason: "r" } } } }, [])
      ).toThrow(field)
    }
    expect(() => buildLeadMagnetContentUpgradePlan({ changes: { x: { summary: { to: "b", reason: "r" } } } }, [])).toThrow(
      "from과 to"
    )
    expect(() => buildLeadMagnetContentUpgradePlan({ changes: { x: { summary: { from: "a", to: "b" } } } }, [])).toThrow(
      "reason"
    )
    expect(() => buildLeadMagnetContentUpgradePlan({}, [])).toThrow("changes")
  })
})

describe("2026-11 content upgrade file", () => {
  const root = path.resolve(__dirname, "../..")
  const file = JSON.parse(
    readFileSync(path.join(root, "scripts/data/lead-magnet-content-upgrade-2026-11.json"), "utf8")
  ) as { changes: Record<string, Record<string, { from: unknown; to: unknown; reason: string }>> }
  const bundled = JSON.parse(readFileSync(path.join(root, "data/lead-magnets.json"), "utf8")) as Array<
    Record<string, unknown>
  >
  const bySlug = new Map(bundled.map((magnet) => [magnet.slug as string, magnet]))

  it("matches the bundled JSON: every `to` is what data/lead-magnets.json now holds", () => {
    for (const [slug, fields] of Object.entries(file.changes)) {
      const magnet = bySlug.get(slug)
      expect(magnet, slug).toBeTruthy()
      for (const [field, change] of Object.entries(fields)) {
        expect(magnet?.[field], `${slug}.${field}`).toEqual(change.to)
        expect(change.from, `${slug}.${field}`).not.toEqual(change.to)
        expect(change.reason.trim().length, `${slug}.${field}`).toBeGreaterThan(0)
      }
    }
  })

  it("plans a full update when the table still holds the pre-upgrade import", () => {
    const rows = Object.entries(file.changes).map(([slug, fields]) => {
      const data: Record<string, unknown> = { ...bySlug.get(slug) }
      for (const [field, change] of Object.entries(fields)) data[field] = change.from
      return { slug, data, updated_at: "t0" }
    })
    const plan = buildLeadMagnetContentUpgradePlan(file, rows)
    const total = Object.values(file.changes).reduce((sum, fields) => sum + Object.keys(fields).length, 0)
    expect(plan).toMatchObject({ fieldsToApply: total, fieldsInConflict: 0, missingRows: 0 })
    for (const operation of plan.operations) {
      expect(operation.data, operation.slug).toEqual(bySlug.get(operation.slug))
    }
  })
})
