import { afterEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  removed: [] as string[][],
  updates: [] as Record<string, unknown>[],
  removeError: null as { message: string } | null,
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}` })),
          error: null,
        }),
        remove: async (paths: string[]) => {
          state.removed.push(paths)
          return { error: state.removeError }
        },
      }),
    },
    from: () => {
      const chain: Record<string, unknown> = {}
      for (const name of ["select", "eq"]) chain[name] = () => chain
      chain.update = (patch: Record<string, unknown>) => {
        state.updates.push(patch)
        state.row = { ...state.row, ...patch }
        return chain
      }
      chain.maybeSingle = async () => ({ data: state.row, error: null })
      return chain
    },
  }),
}))

import { purgeInternalCsAssetObject } from "@/lib/repositories/internal-cs-chat"

function baseRow(metadata: Record<string, unknown> = {}) {
  return {
    id: "asset-1",
    conversation_id: "conversation-1",
    storage_path: "conversation-1/hash.png",
    original_file_name: "캡처_이름_010.png",
    analysis_summary: "요약",
    analysis_payload: { extractedText: "화면에 보인 개인 글", observations: ["오류"] },
    metadata,
  }
}

afterEach(() => {
  state.row = null
  state.removed = []
  state.updates = []
  state.removeError = null
})

describe("purgeInternalCsAssetObject", () => {
  it("removes the storage object and clears file name and OCR text but keeps the summary", async () => {
    state.row = baseRow()
    const result = await purgeInternalCsAssetObject({
      assetId: "asset-1",
      conversationId: "conversation-1",
      actor: "tester",
      reason: "admin_delete",
      now: new Date("2026-11-25T00:00:00.000Z"),
    })

    expect(state.removed).toEqual([["conversation-1/hash.png"]])
    expect(result).not.toBeNull()
    const patch = state.updates[0]
    expect(patch.original_file_name).toBe("deleted")
    expect(patch.analysis_payload).toEqual({ observations: ["오류"] })
    expect(patch.metadata).toMatchObject({
      storageDeletedAt: "2026-11-25T00:00:00.000Z",
      storageDeletedReason: "admin_delete",
    })
    expect(patch).not.toHaveProperty("analysis_summary")
  })

  it("skips an asset whose object was already deleted", async () => {
    state.row = baseRow({ storageDeletedAt: "2026-01-01T00:00:00.000Z" })
    expect(await purgeInternalCsAssetObject({
      assetId: "asset-1", actor: "tester", reason: "retention",
    })).toBeNull()
    expect(state.removed).toEqual([])
  })

  it("does not touch the row when the storage removal fails", async () => {
    state.row = baseRow()
    state.removeError = { message: "down" }
    await expect(purgeInternalCsAssetObject({
      assetId: "asset-1", actor: "tester", reason: "retention",
    })).rejects.toThrow()
    expect(state.updates).toEqual([])
  })
})
