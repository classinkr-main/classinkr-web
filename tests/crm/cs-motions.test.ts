import { describe, expect, it } from "vitest"

import { CS_MOTIONS, findCsMotion } from "@/lib/crm/cs-motions"
import { CRM_TASK_TYPES } from "@/lib/repositories/crm-tasks"

describe("CS motions", () => {
  it("exposes a non-empty preset list with unique keys", () => {
    expect(CS_MOTIONS.length).toBeGreaterThan(0)
    const keys = CS_MOTIONS.map((motion) => motion.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("only uses valid crm_tasks task types", () => {
    const valid = new Set<string>(CRM_TASK_TYPES)
    for (const motion of CS_MOTIONS) {
      expect(valid.has(motion.taskType), `${motion.key} -> ${motion.taskType}`).toBe(true)
      expect(motion.title.trim().length).toBeGreaterThan(0)
    }
  })

  it("covers the core success motions and resolves by key", () => {
    expect(findCsMotion("install")?.taskType).toBe("install")
    expect(findCsMotion("renewal")?.taskType).toBe("renewal")
    expect(findCsMotion("activation")?.taskType).toBe("cs_checkin")
    expect(findCsMotion("nope")).toBeUndefined()
  })
})
