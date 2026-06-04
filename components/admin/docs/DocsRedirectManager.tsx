"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ExternalLink, Link2, Plus, RefreshCw, Save, Trash2 } from "lucide-react"

import { adminFetch, adminFetchJson } from "@/lib/admin-client"
import type { AdminDocsArticleSummary } from "@/lib/admin-docs"

interface DocsRedirect {
  id: string
  fromPath: string
  toPath: string | null
  toArticleId: string | null
  httpStatus: 301 | 302 | 307 | 308
  updatedAt: string
}

interface RedirectsResponse {
  redirects: DocsRedirect[]
  warning?: string
}

interface Draft {
  fromPath: string
  toPath: string
  toArticleId: string
  httpStatus: 301 | 302 | 307 | 308
}

function defaultDraft(): Draft {
  return {
    fromPath: "",
    toPath: "",
    toArticleId: "",
    httpStatus: 301,
  }
}

function toDraft(redirect: DocsRedirect): Draft {
  return {
    fromPath: redirect.fromPath,
    toPath: redirect.toPath ?? "",
    toArticleId: redirect.toArticleId ?? "",
    httpStatus: redirect.httpStatus,
  }
}

export default function DocsRedirectManager({ articles }: { articles: AdminDocsArticleSummary[] }) {
  const [redirects, setRedirects] = useState<DocsRedirect[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [newDraft, setNewDraft] = useState(defaultDraft)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const articlesById = useMemo(() => new Map(articles.map((article) => [article.id, article])), [articles])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await adminFetchJson<RedirectsResponse>("/api/admin/docs/redirects")
      setRedirects(response.redirects ?? [])
      setDrafts(Object.fromEntries((response.redirects ?? []).map((redirect) => [redirect.id, toDraft(redirect)])))
    } catch (err) {
      setError(err instanceof Error ? err.message : "리다이렉트를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function updateDraft<K extends keyof Draft>(id: string, key: K, value: Draft[K]) {
    const redirect = redirects.find((item) => item.id === id)
    if (!redirect) return
    setDrafts((previous) => ({
      ...previous,
      [id]: {
        ...toDraft(redirect),
        ...previous[id],
        [key]: value,
      },
    }))
  }

  function buildPayload(draft: Draft) {
    return {
      fromPath: draft.fromPath.trim(),
      toPath: draft.toArticleId ? null : draft.toPath.trim() || null,
      toArticleId: draft.toArticleId || null,
      httpStatus: draft.httpStatus,
    }
  }

  async function createRedirect() {
    setCreating(true)
    setError(null)
    try {
      const redirect = await adminFetchJson<DocsRedirect>("/api/admin/docs/redirects", {
        method: "POST",
        body: JSON.stringify(buildPayload(newDraft)),
      })
      setRedirects((previous) => [redirect, ...previous])
      setDrafts((previous) => ({ ...previous, [redirect.id]: toDraft(redirect) }))
      setNewDraft(defaultDraft())
      setNotice("리다이렉트를 추가했습니다.")
      window.setTimeout(() => setNotice(null), 2200)
    } catch (err) {
      setError(err instanceof Error ? err.message : "리다이렉트를 추가하지 못했습니다.")
    } finally {
      setCreating(false)
    }
  }

  async function saveRedirect(redirect: DocsRedirect) {
    const draft = drafts[redirect.id] ?? toDraft(redirect)
    setSavingId(redirect.id)
    setError(null)
    try {
      const updated = await adminFetchJson<DocsRedirect>(`/api/admin/docs/redirects/${redirect.id}`, {
        method: "PATCH",
        body: JSON.stringify(buildPayload(draft)),
      })
      setRedirects((previous) => previous.map((item) => (item.id === updated.id ? updated : item)))
      setDrafts((previous) => ({ ...previous, [updated.id]: toDraft(updated) }))
      setNotice("리다이렉트를 저장했습니다.")
      window.setTimeout(() => setNotice(null), 2200)
    } catch (err) {
      setError(err instanceof Error ? err.message : "리다이렉트를 저장하지 못했습니다.")
    } finally {
      setSavingId(null)
    }
  }

  async function deleteRedirect(redirect: DocsRedirect) {
    if (!window.confirm(`${redirect.fromPath} 리다이렉트를 삭제할까요?`)) return
    setSavingId(redirect.id)
    setError(null)
    try {
      const response = await adminFetch(`/api/admin/docs/redirects/${redirect.id}`, { method: "DELETE" })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? "삭제하지 못했습니다.")
      }
      setRedirects((previous) => previous.filter((item) => item.id !== redirect.id))
      setNotice("리다이렉트를 삭제했습니다.")
      window.setTimeout(() => setNotice(null), 2200)
    } catch (err) {
      setError(err instanceof Error ? err.message : "리다이렉트를 삭제하지 못했습니다.")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#e8e8e4] px-4 py-4">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-[#1a1a1a]/35" />
          <h2 className="text-[14px] font-semibold text-[#111110]">문서 리다이렉트</h2>
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
        <div className="grid gap-2">
          <input
            value={newDraft.fromPath}
            onChange={(event) => setNewDraft((previous) => ({ ...previous, fromPath: event.target.value }))}
            placeholder="/docs/old/path"
            className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 font-mono text-[12px] outline-none focus:border-[#084734]"
          />
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_92px_auto]">
            <select
              value={newDraft.toArticleId}
              onChange={(event) => setNewDraft((previous) => ({ ...previous, toArticleId: event.target.value, toPath: "" }))}
              className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] outline-none focus:border-[#084734]"
            >
              <option value="">직접 경로 입력</option>
              {articles.map((article) => (
                <option key={article.id} value={article.id}>
                  {article.title}
                </option>
              ))}
            </select>
            <select
              value={newDraft.httpStatus}
              onChange={(event) => setNewDraft((previous) => ({ ...previous, httpStatus: Number(event.target.value) as Draft["httpStatus"] }))}
              className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] outline-none focus:border-[#084734]"
            >
              {[301, 302, 307, 308].map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void createRedirect()}
              disabled={creating}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#084734] px-3 text-[13px] font-semibold text-white hover:bg-[#065c41] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              추가
            </button>
          </div>
          {!newDraft.toArticleId ? (
            <input
              value={newDraft.toPath}
              onChange={(event) => setNewDraft((previous) => ({ ...previous, toPath: event.target.value }))}
              placeholder="/docs/new/path"
              className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 font-mono text-[12px] outline-none focus:border-[#084734]"
            />
          ) : null}
        </div>
      </div>

      <div className="max-h-[520px] divide-y divide-[#f0f0ec] overflow-y-auto">
        {loading ? (
          <p className="px-4 py-8 text-center text-[13px] text-[#1a1a1a]/35">리다이렉트를 불러오는 중입니다.</p>
        ) : redirects.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[#1a1a1a]/35">등록된 리다이렉트가 없습니다.</p>
        ) : (
          redirects.map((redirect) => {
            const draft = drafts[redirect.id] ?? toDraft(redirect)
            const targetArticle = draft.toArticleId ? articlesById.get(draft.toArticleId) : null
            return (
              <div key={redirect.id} className="grid gap-2 px-4 py-3">
                <input
                  value={draft.fromPath}
                  onChange={(event) => updateDraft(redirect.id, "fromPath", event.target.value)}
                  className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 font-mono text-[12px] outline-none focus:border-[#084734]"
                />
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_90px_auto_auto]">
                  <select
                    value={draft.toArticleId}
                    onChange={(event) => updateDraft(redirect.id, "toArticleId", event.target.value)}
                    className="h-9 min-w-0 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] outline-none focus:border-[#084734]"
                  >
                    <option value="">직접 경로</option>
                    {articles.map((article) => (
                      <option key={article.id} value={article.id}>
                        {article.title}
                      </option>
                    ))}
                  </select>
                  <select
                    value={draft.httpStatus}
                    onChange={(event) => updateDraft(redirect.id, "httpStatus", Number(event.target.value) as Draft["httpStatus"])}
                    className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] outline-none focus:border-[#084734]"
                  >
                    {[301, 302, 307, 308].map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void saveRedirect(redirect)}
                    disabled={savingId === redirect.id}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#111110] px-3 text-[12px] font-semibold text-white hover:bg-[#2a2a28] disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteRedirect(redirect)}
                    disabled={savingId === redirect.id}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[#B85C33] hover:bg-[#FEF3EE] disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sr-only">삭제</span>
                  </button>
                </div>
                {!draft.toArticleId ? (
                  <input
                    value={draft.toPath}
                    onChange={(event) => updateDraft(redirect.id, "toPath", event.target.value)}
                    className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 font-mono text-[12px] outline-none focus:border-[#084734]"
                  />
                ) : targetArticle ? (
                  <a
                    href={targetArticle.publicPath}
                    target="_blank"
                    className="inline-flex w-fit items-center gap-1.5 text-[11px] text-[#1a1a1a]/35 hover:text-[#084734]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {targetArticle.publicPath}
                  </a>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
