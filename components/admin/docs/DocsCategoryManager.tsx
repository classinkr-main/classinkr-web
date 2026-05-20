"use client"

import { useCallback, useEffect, useState } from "react"
import { Eye, EyeOff, FolderTree, Plus, RefreshCw, Save } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"

interface DocsCategory {
  id: string
  title: string
  description: string
  orderIndex: number
  icon: string | null
  isVisible: boolean
}

interface CategoriesResponse {
  categories: DocsCategory[]
  warning?: string
}

function defaultDraft() {
  return {
    id: "",
    title: "",
    description: "",
    orderIndex: 100,
    icon: "",
    isVisible: true,
  }
}

export default function DocsCategoryManager() {
  const [categories, setCategories] = useState<DocsCategory[]>([])
  const [drafts, setDrafts] = useState<Record<string, DocsCategory>>({})
  const [newDraft, setNewDraft] = useState(defaultDraft)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await adminFetchJson<CategoriesResponse>("/api/admin/docs/categories")
      setCategories(response.categories ?? [])
      setDrafts(Object.fromEntries((response.categories ?? []).map((category) => [category.id, category])))
    } catch (err) {
      setError(err instanceof Error ? err.message : "카테고리를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function updateDraft<K extends keyof DocsCategory>(id: string, key: K, value: DocsCategory[K]) {
    const category = categories.find((item) => item.id === id)
    if (!category) return
    setDrafts((previous) => ({
      ...previous,
      [id]: {
        ...category,
        ...previous[id],
        [key]: value,
      },
    }))
  }

  async function saveCategory(category: DocsCategory) {
    const draft = drafts[category.id] ?? category
    setSavingId(category.id)
    setError(null)
    try {
      const updated = await adminFetchJson<DocsCategory>(`/api/admin/docs/categories/${category.id}`, {
        method: "PATCH",
        body: JSON.stringify(draft),
      })
      setCategories((previous) =>
        previous
          .map((item) => (item.id === updated.id ? updated : item))
          .sort((left, right) => left.orderIndex - right.orderIndex)
      )
      setDrafts((previous) => ({ ...previous, [updated.id]: updated }))
      setNotice("카테고리를 저장했습니다.")
      window.setTimeout(() => setNotice(null), 2200)
    } catch (err) {
      setError(err instanceof Error ? err.message : "카테고리를 저장하지 못했습니다.")
    } finally {
      setSavingId(null)
    }
  }

  async function createCategory() {
    if (!newDraft.id || !newDraft.title) {
      setError("새 카테고리 id와 제목을 입력해 주세요.")
      return
    }

    setCreating(true)
    setError(null)
    try {
      const category = await adminFetchJson<DocsCategory>("/api/admin/docs/categories", {
        method: "POST",
        body: JSON.stringify(newDraft),
      })
      setCategories((previous) => [...previous, category].sort((left, right) => left.orderIndex - right.orderIndex))
      setDrafts((previous) => ({ ...previous, [category.id]: category }))
      setNewDraft(defaultDraft())
      setNotice("카테고리를 추가했습니다.")
      window.setTimeout(() => setNotice(null), 2200)
    } catch (err) {
      setError(err instanceof Error ? err.message : "카테고리를 추가하지 못했습니다.")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#e8e8e4] px-4 py-4">
        <div className="flex items-center gap-2">
          <FolderTree className="h-4 w-4 text-[#1a1a1a]/35" />
          <h2 className="text-[14px] font-semibold text-[#111110]">카테고리 관리</h2>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white text-[#111110] hover:bg-[#f5f5f2] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          <span className="sr-only">새로고침</span>
        </button>
      </div>

      {error ? <p className="border-b border-[#F6D5C5] bg-[#FEF3EE] px-4 py-3 text-[13px] text-[#B85C33]">{error}</p> : null}
      {notice ? <p className="border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">{notice}</p> : null}

      <div className="border-b border-[#f0f0ec] bg-[#FAFAF8] p-4">
        <div className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)_80px_auto]">
          <input
            value={newDraft.id}
            onChange={(event) => setNewDraft((previous) => ({ ...previous, id: event.target.value }))}
            placeholder="id"
            className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] outline-none focus:border-[#084734]"
          />
          <input
            value={newDraft.title}
            onChange={(event) => setNewDraft((previous) => ({ ...previous, title: event.target.value }))}
            placeholder="새 카테고리 제목"
            className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] outline-none focus:border-[#084734]"
          />
          <input
            type="number"
            value={newDraft.orderIndex}
            onChange={(event) => setNewDraft((previous) => ({ ...previous, orderIndex: Number(event.target.value) || 0 }))}
            className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] outline-none focus:border-[#084734]"
          />
          <button
            type="button"
            onClick={() => void createCategory()}
            disabled={creating}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#084734] px-3 text-[13px] font-semibold text-white hover:bg-[#065c41] disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            추가
          </button>
        </div>
      </div>

      <div className="divide-y divide-[#f0f0ec]">
        {loading ? (
          <p className="px-4 py-8 text-center text-[13px] text-[#1a1a1a]/35">카테고리를 불러오는 중입니다.</p>
        ) : categories.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[#1a1a1a]/35">카테고리가 없습니다.</p>
        ) : (
          categories.map((category) => {
            const draft = drafts[category.id] ?? category
            return (
              <div key={category.id} className="grid gap-2 px-4 py-3">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_80px_auto_auto]">
                  <input
                    value={draft.title}
                    onChange={(event) => updateDraft(category.id, "title", event.target.value)}
                    className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] font-semibold outline-none focus:border-[#084734]"
                  />
                  <input
                    type="number"
                    value={draft.orderIndex}
                    onChange={(event) => updateDraft(category.id, "orderIndex", Number(event.target.value) || 0)}
                    className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] outline-none focus:border-[#084734]"
                  />
                  <button
                    type="button"
                    onClick={() => updateDraft(category.id, "isVisible", !draft.isVisible)}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#111110] hover:bg-[#f5f5f2]"
                  >
                    {draft.isVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    {draft.isVisible ? "노출" : "숨김"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveCategory(category)}
                    disabled={savingId === category.id}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#111110] px-3 text-[12px] font-semibold text-white hover:bg-[#2a2a28] disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    저장
                  </button>
                </div>
                <textarea
                  value={draft.description}
                  onChange={(event) => updateDraft(category.id, "description", event.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[12px] outline-none focus:border-[#084734]"
                />
                <p className="font-mono text-[11px] text-[#1a1a1a]/30">{category.id}</p>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
