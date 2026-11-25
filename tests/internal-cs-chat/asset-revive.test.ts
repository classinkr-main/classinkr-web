import { afterEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  existing: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
}))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((path) => ({ path, signedUrl: `https://signed.test/${path}` })),
          error: null,
        }),
      }),
    },
    from: () => {
      let mode: "insert" | "update" | "select" = "select"
      const chain: Record<string, unknown> = {}
      for (const name of ["select", "eq"]) chain[name] = () => chain
      chain.insert = () => {
        mode = "insert"
        return chain
      }
      chain.update = (patch: Record<string, unknown>) => {
        mode = "update"
        state.updates.push(patch)
        state.existing = { ...state.existing, ...patch }
        return chain
      }
      chain.single = async () => ({ data: null, error: { code: "23505", message: "duplicate key" } })
      chain.maybeSingle = async () => ({ data: mode === "insert" ? null : state.existing, error: null })
      return chain
    },
  }),
}))

import { createInternalCsAsset } from "@/lib/repositories/internal-cs-chat"

afterEach(() => {
  state.existing = null
  state.updates = []
})

const SHA = "a".repeat(64)

describe("createInternalCsAsset after the original object was deleted", () => {
  it("revives the deleted row instead of returning it, so the re-uploaded object is not orphaned", async () => {
    state.existing = {
      id: "asset-1",
      conversation_id: "conversation-1",
      storage_path: "conversation-1/hash.png",
      original_file_name: "deleted",
      sha256: SHA,
      metadata: { storageDeletedAt: "2026-11-01T00:00:00.000Z", storageDeletedReason: "admin_delete" },
    }
    const asset = await createInternalCsAsset({
      conversationId: "conversation-1",
      source: "admin_upload",
      storagePath: "conversation-1/hash.png",
      originalFileName: "capture.png",
      mimeType: "image/png",
      sizeBytes: 10,
      sha256: SHA,
      metadata: { uploadReused: false },
      actor: "tester",
    })
    const patch = state.updates[0]
    expect(patch.original_file_name).toBe("capture.png")
    expect(patch.metadata).toEqual({ uploadReused: false })
    expect(patch.status).toBe("uploaded")
    expect(typeof patch.created_at).toBe("string")
    expect((asset.metadata as Record<string, unknown>).storageDeletedAt).toBeUndefined()
    expect(asset.signed_url).toBeTruthy()
  })

  it("still returns a live duplicate unchanged", async () => {
    state.existing = { id: "asset-2", conversation_id: "conversation-1", storage_path: "p.png", original_file_name: "a.png", sha256: SHA, metadata: {} }
    const asset = await createInternalCsAsset({
      conversationId: "conversation-1",
      source: "admin_upload",
      storagePath: "p.png",
      originalFileName: "a.png",
      mimeType: "image/png",
      sizeBytes: 10,
      sha256: SHA,
      actor: "tester",
    })
    expect(asset.id).toBe("asset-2")
    expect(state.updates).toHaveLength(0)
  })
})
