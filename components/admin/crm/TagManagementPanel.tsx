"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ChevronRight, Search } from "lucide-react"

import { adminFetchJson, adminFetchJsonCached, getCachedAdminJson } from "@/lib/admin-client"
import { CRM_CACHE_SWR_MS, CRM_CACHE_TTL_MS } from "@/lib/crm/client-cache"
import {
  formatMergePreviewLabel,
  formatRenamePreviewLabel,
  validateMergeInput,
  validateRenameInput,
  type TagBulkOutcome,
} from "@/lib/crm/tag-admin"
import type { CustomerTagStat } from "@/lib/repositories/crm-customer-tags"
import { EmptyState } from "@/components/admin/viz"
import CrmNoticeBanner from "./CrmNoticeBanner"
import FreshnessCaption from "./FreshnessCaption"
import { SECONDARY_TEXT_CLASS } from "./home/shared"
import { unifiedCustomersTagHref } from "./unified/shared"

// T4 태그 관리 패널(§14) — /admin/crm/customers/tags. 전체 태그·건수를 모아 보여주고, 되돌릴 수
// 없는 이름 변경·병합은 인라인 확인(브라우저 기본 확인창 금지)을 거친 뒤에만 커밋한다. 미리보기 숫자는
// 항상 서버(PATCH …dryRun:true)가 계산한다 — 클라이언트는 어느 대상에 이미 목표 태그가 있어
// 중복 정리가 필요한지 알 수 없다(GET 응답은 건수만 주고 대상 목록은 주지 않는다).
//
// 태그 이름은 그 라벨로 좁힌 통합 고객 목록(/admin/crm/customers/unified?tag=…)으로 가는 링크다
// (2026-09-21, CRM 기획 §10 후속). 통합 클라이언트가 `?tag=`를 라벨 필터 URL 상태로 읽는다 —
// `?q=`로 링크하지 않는 이유는 그 검색이 태그가 아니라 이름·연락처·지역·담당·상태 텍스트만 보기
// 때문이다(lib/repositories/crm-unified-customers.ts includesQuery). 행 전체가 아니라 이름만
// 링크로 둔다 — 같은 행의 선택 체크박스·이름 변경 버튼과 클릭이 겹치지 않고, 키보드(Tab·Enter)와
// 스크린리더가 행마다 하나의 목적지를 명확히 만난다.

const TAGS_URL = "/api/admin/crm/tags"

interface TagsResponse {
  tags: CustomerTagStat[]
  generatedAt: string
}

function formatLastUsed(iso: string | null) {
  if (!iso) return "-"
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return "-"
  return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms))
}

function errorDetail(err: unknown) {
  return err instanceof Error && err.message ? err.message : "알 수 없는 오류"
}

type RenamePhase = "editing" | "previewing" | "confirming" | "submitting"
interface RenameState {
  tag: string
  value: string
  phase: RenamePhase
  outcome?: TagBulkOutcome
  error?: string
}

type MergePhase = "idle" | "previewing" | "confirming" | "submitting"
interface MergeState {
  target: string
  phase: MergePhase
  outcome?: TagBulkOutcome
  error?: string
}

function RowSkeleton() {
  return (
    <tr aria-hidden>
      <td className="px-3 py-3">
        <div className="h-4 w-4 animate-pulse rounded bg-[#f0f0ec]" />
      </td>
      <td className="px-3 py-3">
        <div className="h-3.5 w-24 animate-pulse rounded bg-[#f0f0ec]" />
      </td>
      <td className="px-3 py-3">
        <div className="h-3.5 w-10 animate-pulse rounded bg-[#f0f0ec]" />
      </td>
      <td className="px-3 py-3">
        <div className="h-3.5 w-28 animate-pulse rounded bg-[#f0f0ec]" />
      </td>
      <td className="px-3 py-3">
        <div className="h-3.5 w-16 animate-pulse rounded bg-[#f0f0ec]" />
      </td>
      <td className="px-3 py-3">
        <div className="h-7 w-16 animate-pulse rounded bg-[#f0f0ec]" />
      </td>
    </tr>
  )
}

export default function TagManagementPanel() {
  const [data, setData] = useState<TagsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null)
  const [query, setQuery] = useState("")

  const [renaming, setRenaming] = useState<RenameState | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [merge, setMerge] = useState<MergeState | null>(null)
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; message: string } | null>(null)

  const load = useCallback(async (options?: { force?: boolean }) => {
    const force = Boolean(options?.force)
    if (!force) {
      const cached = getCachedAdminJson<TagsResponse>(TAGS_URL, { cacheKey: TAGS_URL })
      if (cached) setData(cached)
      setLoading(!cached)
    }
    setRefreshing(force)
    setError(null)
    try {
      const next = await adminFetchJsonCached<TagsResponse>(force ? `${TAGS_URL}?force=1` : TAGS_URL, undefined, {
        cacheKey: TAGS_URL,
        ttlMs: CRM_CACHE_TTL_MS,
        staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
        force,
        onRevalidated: ({ data: fresh }) => {
          if (fresh) {
            setData(fresh)
            setSavedAt(Date.now())
          }
        },
      })
      setData(next)
      setSavedAt(Date.now())
    } catch (err) {
      setError({
        message: `태그 목록을 불러오지 못했습니다(${errorDetail(err)}).`,
        retry: () => void load({ force: true }),
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const rows = data?.tags ?? []
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => row.tag.toLowerCase().includes(q))
  }, [data, query])

  // 목록이 갱신되며 사라진 태그가 선택·병합 대상에 그대로 남지 않게 정리.
  useEffect(() => {
    const known = new Set((data?.tags ?? []).map((row) => row.tag))
    setSelected((prev) => {
      const next = new Set(Array.from(prev).filter((tag) => known.has(tag)))
      return next.size === prev.size ? prev : next
    })
  }, [data])

  function toggleSelected(tag: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
    setMerge(null)
  }

  // ── 이름 변경 ────────────────────────────────────────────────────────
  function startRename(tag: string) {
    setRenaming({ tag, value: tag, phase: "editing" })
  }
  function cancelRename() {
    setRenaming(null)
  }
  async function previewRename() {
    if (!renaming) return
    const validated = validateRenameInput(renaming.tag, renaming.value)
    if (!validated.ok) {
      setRenaming({ ...renaming, phase: "editing", error: validated.error })
      return
    }
    setRenaming({ ...renaming, phase: "previewing", error: undefined })
    try {
      const outcome = await adminFetchJson<TagBulkOutcome>(TAGS_URL, {
        method: "PATCH",
        body: JSON.stringify({ action: "rename", from: validated.from, to: validated.to, dryRun: true }),
      })
      setRenaming({ tag: validated.from, value: validated.to, phase: "confirming", outcome })
    } catch (err) {
      setRenaming({
        tag: validated.from,
        value: validated.to,
        phase: "editing",
        error: `미리보기 계산에 실패했습니다(${errorDetail(err)}).`,
      })
    }
  }
  async function commitRename() {
    if (!renaming || (renaming.phase !== "confirming" && renaming.phase !== "submitting")) return
    const { tag: from, value: to } = renaming
    setRenaming({ ...renaming, phase: "submitting" })
    try {
      const outcome = await adminFetchJson<TagBulkOutcome>(TAGS_URL, {
        method: "PATCH",
        body: JSON.stringify({ action: "rename", from, to }),
      })
      setNotice({ tone: "success", message: formatRenamePreviewLabel(from, to, outcome) })
      setRenaming(null)
      void load({ force: true })
    } catch (err) {
      setRenaming({ tag: from, value: to, phase: "confirming", error: `이름 변경에 실패했습니다(${errorDetail(err)}).` })
    }
  }

  // ── 병합 ─────────────────────────────────────────────────────────────
  function startMerge() {
    if (selected.size === 0) return
    setMerge({ target: "", phase: "idle" })
  }
  function cancelMerge() {
    setMerge(null)
  }
  async function previewMerge() {
    if (!merge) return
    const validated = validateMergeInput(Array.from(selected), merge.target)
    if (!validated.ok) {
      setMerge({ ...merge, phase: "idle", error: validated.error })
      return
    }
    setMerge({ ...merge, phase: "previewing", error: undefined })
    try {
      const outcome = await adminFetchJson<TagBulkOutcome>(TAGS_URL, {
        method: "PATCH",
        body: JSON.stringify({ action: "merge", from: validated.from, to: validated.to, dryRun: true }),
      })
      setMerge({ target: validated.to, phase: "confirming", outcome })
    } catch (err) {
      setMerge({ target: validated.to, phase: "idle", error: `미리보기 계산에 실패했습니다(${errorDetail(err)}).` })
    }
  }
  async function commitMerge() {
    if (!merge || (merge.phase !== "confirming" && merge.phase !== "submitting")) return
    const from = Array.from(selected)
    const to = merge.target
    setMerge({ ...merge, phase: "submitting" })
    try {
      const outcome = await adminFetchJson<TagBulkOutcome>(TAGS_URL, {
        method: "PATCH",
        body: JSON.stringify({ action: "merge", from, to }),
      })
      setNotice({ tone: "success", message: formatMergePreviewLabel(from, to, outcome) })
      setMerge(null)
      setSelected(new Set())
      void load({ force: true })
    } catch (err) {
      setMerge({ target: to, phase: "confirming", error: `병합에 실패했습니다(${errorDetail(err)}).` })
    }
  }

  const showEmpty = !loading && filtered.length === 0

  return (
    <div>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">태그 관리</h1>
          <p className={`mt-1 text-[12px] ${SECONDARY_TEXT_CLASS}`}>
            리드·NEO 계정·전환 고객에 붙은 태그를 모아 보고, 이름을 바꾸거나 여러 태그를 하나로 합칩니다.
          </p>
        </div>
        <FreshnessCaption
          generatedAt={data?.generatedAt}
          receivedAt={savedAt}
          refreshing={refreshing}
          staleReason={error ? "error" : null}
          onRefresh={() => void load({ force: true })}
        />
      </div>

      {notice ? (
        <CrmNoticeBanner tone={notice.tone} className="mb-3" message={notice.message} onDismiss={() => setNotice(null)} />
      ) : null}

      {error ? (
        <CrmNoticeBanner
          tone="danger"
          className="mb-3"
          message={error.message}
          action={{ label: "다시 시도", onClick: error.retry, pending: refreshing }}
        />
      ) : null}

      <label className="mb-3 flex h-10 max-w-sm items-center gap-2 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] text-[#111110] focus-within:border-[#084734]">
        <Search className="h-4 w-4 text-[#1a1a1a]/35" aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="태그 검색"
          aria-label="태그 검색"
          className="h-full flex-1 bg-transparent text-[13px] outline-none placeholder:text-[#1a1a1a]/35"
        />
      </label>

      {selected.size > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#e8e8e4] bg-[#F6F5F4] px-3 py-2.5">
          <span className="text-[12px] font-semibold text-[#111110]">{selected.size}개 선택됨</span>
          {merge ? (
            <>
              <input
                value={merge.target}
                disabled={merge.phase === "previewing" || merge.phase === "submitting"}
                onChange={(event) =>
                  setMerge({ target: event.target.value, phase: "idle", outcome: undefined, error: undefined })
                }
                placeholder="합칠 태그 이름"
                aria-label="병합 대상 태그 이름"
                maxLength={40}
                className="h-9 min-w-[140px] rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] text-[#111110] outline-none focus:border-[#084734] disabled:opacity-60"
              />
              {(merge.phase === "confirming" || merge.phase === "submitting") && merge.outcome ? (
                <>
                  <span role="status" className="text-[12px] font-medium text-[#31302E]">
                    {formatMergePreviewLabel(Array.from(selected), merge.target, merge.outcome)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void commitMerge()}
                    disabled={merge.phase === "submitting"}
                    aria-busy={merge.phase === "submitting" || undefined}
                    className="inline-flex min-h-11 items-center rounded-lg bg-[#B43E3E] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#8F2C2C] disabled:opacity-50 sm:min-h-9"
                  >
                    {merge.phase === "submitting" ? "병합 중" : "병합 확인"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void previewMerge()}
                  disabled={merge.phase === "previewing" || !merge.target.trim()}
                  aria-busy={merge.phase === "previewing" || undefined}
                  className="inline-flex min-h-11 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#fafaf8] disabled:opacity-50 sm:min-h-9"
                >
                  {merge.phase === "previewing" ? "미리보기 계산 중" : "미리보기"}
                </button>
              )}
              <button
                type="button"
                onClick={cancelMerge}
                disabled={merge.phase === "submitting"}
                className="inline-flex min-h-11 items-center px-2 text-[12px] font-semibold text-[#615D59] transition-colors hover:text-[#111110] disabled:opacity-50 sm:min-h-9"
              >
                취소
              </button>
              {merge.error ? (
                <p role="alert" className="w-full text-[11px] text-[#B43E3E]">
                  {merge.error}
                </p>
              ) : null}
            </>
          ) : (
            <button
              type="button"
              onClick={startMerge}
              className="inline-flex min-h-11 items-center rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#fafaf8] sm:min-h-9"
            >
              병합
            </button>
          )}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto inline-flex min-h-11 items-center px-2 text-[12px] font-semibold text-[#615D59] transition-colors hover:text-[#111110] sm:min-h-9"
          >
            선택 해제
          </button>
        </div>
      ) : null}

      {showEmpty ? (
        <EmptyState
          title={query.trim() ? "검색 결과가 없습니다" : "등록된 태그가 없습니다"}
          description={
            query.trim()
              ? "다른 검색어로 다시 찾아보세요."
              : "고객 360 개요 탭에서 태그를 붙이면 여기에 모여 표시됩니다."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#e8e8e4] bg-white">
          <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#e8e8e4] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1a1a1a]/40">
                <th className="w-10 px-3 py-2.5" aria-hidden />
                <th className="px-3 py-2.5">태그</th>
                <th className="px-3 py-2.5">건수</th>
                <th className="px-3 py-2.5">리드 · NEO · 고객</th>
                <th className="px-3 py-2.5">최근 사용</th>
                <th className="w-24 px-3 py-2.5" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {loading && !data
                ? Array.from({ length: 5 }).map((_, i) => <RowSkeleton key={i} />)
                : filtered.map((row) => {
                    const isRenamingThis = renaming?.tag === row.tag
                    const renameLocked = renaming !== null && renaming.tag !== row.tag
                    return (
                      <tr key={row.tag} className="border-b border-[#f0f0ec] last:border-b-0">
                        <td className="px-3 py-3 align-top">
                          <input
                            type="checkbox"
                            checked={selected.has(row.tag)}
                            onChange={() => toggleSelected(row.tag)}
                            disabled={merge?.phase === "submitting"}
                            aria-label={`태그 ${row.tag} 선택`}
                            className="h-4 w-4 rounded border-[#C9C6C0] disabled:opacity-50"
                          />
                        </td>
                        <td className="px-3 py-3 align-top">
                          {isRenamingThis ? (
                            <div className="space-y-1.5">
                              <input
                                autoFocus
                                value={renaming.value}
                                maxLength={40}
                                disabled={renaming.phase !== "editing"}
                                onChange={(event) =>
                                  setRenaming({ ...renaming, value: event.target.value, error: undefined })
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                                    event.preventDefault()
                                    void previewRename()
                                  } else if (event.key === "Escape") {
                                    event.preventDefault()
                                    cancelRename()
                                  }
                                }}
                                aria-label={`${row.tag} 새 이름`}
                                className="h-9 w-full max-w-[220px] rounded-lg border border-[#084734] bg-white px-2.5 text-[12px] text-[#111110] outline-none disabled:opacity-60"
                              />
                              {(renaming.phase === "confirming" || renaming.phase === "submitting") && renaming.outcome ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span role="status" className="text-[11px] font-medium text-[#31302E]">
                                    {formatRenamePreviewLabel(renaming.tag, renaming.value, renaming.outcome)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => void commitRename()}
                                    disabled={renaming.phase === "submitting"}
                                    aria-busy={renaming.phase === "submitting" || undefined}
                                    className="inline-flex min-h-11 items-center rounded-lg bg-[#B43E3E] px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#8F2C2C] disabled:opacity-50 sm:min-h-7"
                                  >
                                    {renaming.phase === "submitting" ? "변경 중" : "변경 확인"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelRename}
                                    disabled={renaming.phase === "submitting"}
                                    className="inline-flex min-h-11 items-center px-1 text-[11px] font-semibold text-[#615D59] transition-colors hover:text-[#111110] disabled:opacity-50 sm:min-h-7"
                                  >
                                    취소
                                  </button>
                                </div>
                              ) : renaming.phase === "previewing" ? (
                                <p className="text-[11px] text-[#615D59]">미리보기 계산 중…</p>
                              ) : null}
                              {renaming.error ? (
                                <p role="alert" className="text-[11px] text-[#B43E3E]">
                                  {renaming.error}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <Link
                              href={unifiedCustomersTagHref(row.tag)}
                              // 태그 행마다 뷰포트 프리페치가 나가지 않게 — /admin 은 동적 렌더라 행 수만큼 요청이 붙는다.
                              prefetch={false}
                              // 건수는 태그 부착 수라 통합 목록 결과(미확인 리드 게이트 등 적용)와 다를 수
                              // 있어 이름에 싣지 않는다.
                              aria-label={`태그 ${row.tag} 고객 목록 보기`}
                              className="group/tag -mx-1 inline-flex min-h-11 max-w-full items-center gap-1 rounded px-1 font-medium text-[#111110] underline-offset-2 transition-colors hover:text-[#084734] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 sm:min-h-0"
                            >
                              <span className="min-w-0 break-all">{row.tag}</span>
                              <ChevronRight
                                className="h-3.5 w-3.5 shrink-0 text-[#615D59] transition-colors group-hover/tag:text-[#084734]"
                                aria-hidden
                              />
                            </Link>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top tabular-nums text-[#111110]">
                          {row.count.toLocaleString("ko-KR")}건
                        </td>
                        <td className="px-3 py-3 align-top tabular-nums text-[#615D59]">
                          {row.byTargetType.lead.toLocaleString("ko-KR")} · {row.byTargetType.neo_account.toLocaleString("ko-KR")} ·{" "}
                          {row.byTargetType.customer.toLocaleString("ko-KR")}
                        </td>
                        <td className="px-3 py-3 align-top text-[#615D59]">{formatLastUsed(row.lastUsedAt)}</td>
                        <td className="px-3 py-3 align-top text-right">
                          {!isRenamingThis ? (
                            <button
                              type="button"
                              onClick={() => startRename(row.tag)}
                              disabled={renameLocked}
                              className="inline-flex min-h-11 items-center rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[11px] font-semibold text-[#111110] transition-colors hover:bg-[#fafaf8] disabled:opacity-50 sm:min-h-7"
                            >
                              이름 변경
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
