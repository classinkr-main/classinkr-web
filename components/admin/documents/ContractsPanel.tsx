"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Plus, RefreshCw, Trash2, X, PenLine, Copy, Check, Send, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { adminFetch, adminFetchJsonCached } from "@/lib/admin-client"
import { useUrlState } from "@/lib/use-url-state"
import type { Contract, ContractStatus, Partner } from "@/lib/supabase/database.types"

// GET /api/admin/partners는 { partners }가 아니라 { workspaces }/{ summaries }를 반환한다.
// 패널은 파트너명 표시에 id/name만 필요하므로 summary 응답을 최소 형태로 매핑해 쓴다.
type PartnerOption = Pick<Partner, "id" | "name">

// V2 견적 전환은 HardwareQuotesPanel이 /api/portal/quotes/[id]/convert로 직접 처리(딜·고객 FK 연결) —
// 이 폼은 V1 legacy 계약의 수동 신설 전용이라 외부 프리필 요청 프롭을 받지 않는다.

const EMPTY_CREATE_FORM = {
  partner_id: "",
  title: "",
  total_amount: 0,
  notes: "",
}

const STATUS_LABEL: Record<ContractStatus, string> = {
  draft: "작성 중",
  sent: "발송됨",
  partner_signed: "파트너 서명",
  admin_signed: "어드민 서명",
  completed: "완료",
  cancelled: "취소",
}

const STATUS_COLOR: Record<ContractStatus, string> = {
  draft: "bg-[#f0f0ec] text-[#1a1a1a]/50",
  sent: "bg-[#ECFDF5] text-[#084734]",
  partner_signed: "bg-yellow-50 text-yellow-700",
  admin_signed: "bg-[#D1FAE5] text-[#065c41]",
  completed: "bg-[#D1FAE5] text-[#065c41] font-semibold",
  cancelled: "bg-[#FEF3EE] text-[#B85C33]",
}

const STATUS_FILTERS: Array<ContractStatus | "all"> = [
  "all",
  "draft",
  "sent",
  "partner_signed",
  "admin_signed",
  "completed",
  "cancelled",
]

function SignatureCanvas({ onSave }: { onSave: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    if ("touches" in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    drawing.current = true
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!
    const { x, y } = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return
    e.preventDefault()
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.strokeStyle = "#1a1a1a"
    const { x, y } = getPos(e, canvas)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  function stop() {
    drawing.current = false
  }

  function clear() {
    const canvas = canvasRef.current!
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height)
  }

  function save() {
    onSave(canvasRef.current!.toDataURL("image/png"))
  }

  return (
    <div className="space-y-2">
      <div className="border border-dashed border-[#e8e8e4] rounded-xl overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          width={480}
          height={160}
          className="w-full cursor-crosshair touch-none"
          onMouseDown={start}
          onMouseMove={draw}
          onMouseUp={stop}
          onMouseLeave={stop}
          onTouchStart={start}
          onTouchMove={draw}
          onTouchEnd={stop}
        />
      </div>
      <p className="text-xs text-[#1a1a1a]/40 text-center">위 상자 안에 서명을 그려 주세요.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          지우기
        </Button>
        <Button type="button" size="sm" onClick={save}>
          적용
        </Button>
      </div>
    </div>
  )
}

export function ContractsPanel() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [partners, setPartners] = useState<PartnerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Contract | null>(null)
  const [showSign, setShowSign] = useState(false)
  const [signing, setSigning] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [query, setQuery] = useUrlState("contract_q", "")
  const [statusFilter, setStatusFilter] = useUrlState("contract_status", "all")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [cData, pData] = await Promise.all([
        adminFetchJsonCached<{ contracts?: Contract[] }>("/api/admin/contracts"),
        adminFetchJsonCached<{ summaries?: Array<{ partnerId: string; partnerName: string }> }>(
          "/api/admin/partners?view=summary"
        ),
      ])
      setContracts(cData.contracts ?? [])
      setPartners((pData.summaries ?? []).map((s) => ({ id: s.partnerId, name: s.partnerName })))
    } catch {
      // 기존 데이터 유지 — 일시적 네트워크 오류 시 빈 화면 방지
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openCreateForm = () => {
    setCreateForm(EMPTY_CREATE_FORM)
    setCreateError(null)
    setShowCreate(true)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      // contract_number는 API가 자동 생성, status/sign_token은 DB 기본값(draft) 사용.
      // quote_id는 V1 quotes FK라 V2 견적 문서를 연결하지 않는다(자동 매핑 금지).
      const res = await adminFetch("/api/admin/contracts", {
        method: "POST",
        body: JSON.stringify({
          partner_id: createForm.partner_id,
          title: createForm.title.trim(),
          total_amount: createForm.total_amount,
          notes: createForm.notes.trim() || null,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error ?? "계약서 생성에 실패했습니다.")
      }
      setShowCreate(false)
      setCreateForm(EMPTY_CREATE_FORM)
      void load()
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "계약서 생성에 실패했습니다.")
    } finally {
      setCreating(false)
    }
  }

  const partnerName = useCallback(
    (id: string) => partners.find((p) => p.id === id)?.name ?? id,
    [partners]
  )

  const statusCounts = useMemo(() => {
    const counts = new Map<ContractStatus, number>()
    for (const c of contracts) counts.set(c.status, (counts.get(c.status) ?? 0) + 1)
    return counts
  }, [contracts])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return contracts.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false
      if (!q) return true
      return (
        c.contract_number.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        partnerName(c.partner_id).toLowerCase().includes(q)
      )
    })
  }, [contracts, query, statusFilter, partnerName])

  function copySignLink(contract: Contract) {
    const url = `${window.location.origin}/share/contract/${contract.sign_token}`
    navigator.clipboard.writeText(url)
    setCopied(contract.id)
    setTimeout(() => setCopied(null), 2000)
  }

  async function handleSend(contract: Contract) {
    const res = await adminFetch(`/api/admin/contracts/${contract.id}`, {
      method: "PUT",
      body: JSON.stringify({ status: "sent" }),
    })
    if (res.ok) load()
  }

  async function handleAdminSign(dataUrl: string) {
    if (!selected) return
    setSigning(true)
    const res = await adminFetch(`/api/admin/contracts/${selected.id}/sign`, {
      method: "POST",
      body: JSON.stringify({ signature_data: dataUrl, admin_user_id: "" }),
    })
    if (res.ok) {
      setShowSign(false)
      setSelected(null)
      load()
    } else {
      const err = await res.json()
      alert(err.error ?? "서명에 실패했습니다.")
    }
    setSigning(false)
  }

  async function handleDelete(id: string) {
    if (!confirm("이 계약을 삭제할까요?")) return
    await adminFetch(`/api/admin/contracts/${id}`, { method: "DELETE" })
    load()
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:px-6 sm:py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1a1a1a]/30" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="번호 · 제목 · 파트너 검색"
            className="w-full rounded-lg border border-[#e8e8e4] bg-white py-2 pl-9 pr-3 text-sm text-[#1a1a1a] placeholder:text-[#1a1a1a]/30 focus:border-[#084734]/40 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map((s) => {
            const active = statusFilter === s
            const count = s === "all" ? contracts.length : statusCounts.get(s) ?? 0
            if (s !== "all" && count === 0) return null
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? "border-[#084734] bg-[#ECFDF5] font-medium text-[#084734]"
                    : "border-[#e8e8e4] bg-white text-[#1a1a1a]/55 hover:bg-[#f7f7f5]"
                }`}
              >
                {s === "all" ? "전체" : STATUS_LABEL[s]} {count}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#615D59] ring-1 ring-[#e8e8e4]">
            {loading ? "불러오는 중" : `${filtered.length}/${contracts.length}`}
          </span>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openCreateForm}>
            <Plus className="mr-1 h-4 w-4" />
            계약서 작성
          </Button>
        </div>
      </div>

      <div className="border border-[#e8e8e4] rounded-xl overflow-hidden bg-white">
        {loading ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
        ) : contracts.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">
            <p>등록된 계약이 없습니다.</p>
            <button
              type="button"
              onClick={openCreateForm}
              className="mt-2 text-xs font-medium text-[#084734] underline underline-offset-2"
            >
              첫 계약서 작성
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">
            <p>조건에 맞는 계약이 없습니다.</p>
            <button
              type="button"
              onClick={() => {
                setQuery("")
                setStatusFilter("all")
              }}
              className="mt-2 text-xs font-medium text-[#084734] underline underline-offset-2"
            >
              필터 초기화
            </button>
          </div>
        ) : (
          <>
            <div className="divide-y divide-[#f0f0ec] md:hidden">
              {filtered.map((c) => (
                <div key={`mobile-${c.id}`} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-xs text-[#1a1a1a]/45">{c.contract_number}</p>
                      <p className="mt-1 line-clamp-2 text-sm font-semibold text-[#111110]">{c.title}</p>
                      <p className="mt-1 truncate text-xs text-[#1a1a1a]/45">{partnerName(c.partner_id)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STATUS_COLOR[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-[#1a1a1a]/32">금액</p>
                      <p className="mt-0.5 font-semibold tabular-nums text-[#111110]">{c.total_amount.toLocaleString("ko-KR")}원</p>
                    </div>
                    <div>
                      <p className="text-[#1a1a1a]/32">파트너 서명</p>
                      {c.partner_signed_at ? (
                        <p className="mt-0.5 font-medium text-green-600">완료 {new Date(c.partner_signed_at).toLocaleDateString("ko")}</p>
                      ) : (
                        <p className="mt-0.5 text-[#1a1a1a]/35">대기</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[#1a1a1a]/32">어드민 서명</p>
                      {c.admin_signed_at ? (
                        <p className="mt-0.5 font-medium text-green-600">완료 {new Date(c.admin_signed_at).toLocaleDateString("ko")}</p>
                      ) : (
                        <p className="mt-0.5 text-[#1a1a1a]/35">대기</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    {c.status === "draft" && (
                      <Button variant="outline" size="sm" className="w-full text-[#084734]" onClick={() => handleSend(c)}>
                        <Send className="mr-1 h-3.5 w-3.5" />
                        발송
                      </Button>
                    )}
                    {["sent", "draft"].includes(c.status) && c.sign_token && (
                      <Button variant="outline" size="sm" className="w-full" onClick={() => copySignLink(c)}>
                        {copied === c.id ? <Check className="mr-1 h-3.5 w-3.5 text-green-500" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                        링크 복사
                      </Button>
                    )}
                    {c.status === "partner_signed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-[#615D59]"
                        onClick={() => {
                          setSelected(c)
                          setShowSign(true)
                        }}
                      >
                        <PenLine className="mr-1 h-3.5 w-3.5" />
                        서명
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="w-full text-[#B85C33]" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      삭제
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-[#f7f7f5] border-b border-[#e8e8e4]">
                  <tr>
                    {["번호", "파트너", "제목", "금액", "상태", "파트너 서명", "어드민 서명", ""].map((h) => (
                      <th key={h} className="px-4 py-3 text-left font-medium text-[#1a1a1a]/60 text-xs">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-b border-[#f0f0ec] hover:bg-[#fafafa] transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-[#1a1a1a]/60">{c.contract_number}</td>
                      <td className="px-4 py-3 text-[#1a1a1a]/70">{partnerName(c.partner_id)}</td>
                      <td className="px-4 py-3 font-medium text-[#1a1a1a]">{c.title}</td>
                      <td className="px-4 py-3 font-medium tabular-nums">{c.total_amount.toLocaleString("ko-KR")}원</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {c.partner_signed_at ? (
                          <span className="text-green-600">완료 {new Date(c.partner_signed_at).toLocaleDateString("ko")}</span>
                        ) : (
                          <span className="text-[#1a1a1a]/30">대기</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {c.admin_signed_at ? (
                          <span className="text-green-600">완료 {new Date(c.admin_signed_at).toLocaleDateString("ko")}</span>
                        ) : (
                          <span className="text-[#1a1a1a]/30">대기</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {c.status === "draft" && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-[#084734]" onClick={() => handleSend(c)}>
                              <Send className="w-3.5 h-3.5 mr-1" />
                              발송
                            </Button>
                          )}
                          {["sent", "draft"].includes(c.status) && c.sign_token && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => copySignLink(c)}>
                              {copied === c.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </Button>
                          )}
                          {c.status === "partner_signed" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-[#615D59]"
                              onClick={() => {
                                setSelected(c)
                                setShowSign(true)
                              }}
                            >
                              <PenLine className="w-3.5 h-3.5 mr-1" />
                              서명
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-[#B85C33]" onClick={() => handleDelete(c.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4">
          <div className="max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
              <div>
                <h2 className="text-base font-semibold">계약서 작성</h2>
                <p className="mt-0.5 text-xs text-[#1a1a1a]/50">
                  저장하면 작성 중 상태로 만들어지고, 발송 후 서명 링크를 공유할 수 있습니다.
                </p>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                aria-label="계약서 작성 닫기"
                className="text-[#1a1a1a]/40 hover:text-[#1a1a1a]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="max-h-[calc(100dvh-5.5rem)] space-y-4 overflow-y-auto p-4 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">파트너 *</label>
                  <select
                    required
                    value={createForm.partner_id}
                    onChange={(e) => setCreateForm({ ...createForm, partner_id: e.target.value })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]"
                  >
                    <option value="">선택</option>
                    {partners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">계약 제목 *</label>
                  <input
                    required
                    value={createForm.title}
                    onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                    placeholder="예: 86형 전자칠판 공급 계약"
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">계약 금액 (원) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={createForm.total_amount || ""}
                    onChange={(e) => setCreateForm({ ...createForm, total_amount: Math.max(0, Math.round(+e.target.value || 0)) })}
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:border-[#1a1a1a]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">메모</label>
                  <textarea
                    value={createForm.notes}
                    onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                    rows={2}
                    placeholder="근거 견적 번호, 특이 조건 등"
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a1a1a] resize-none"
                  />
                </div>
              </div>
              {createError && (
                <p className="rounded-lg border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-xs text-[#B85C33]">
                  {createError}
                </p>
              )}
              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>
                  취소
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? "저장 중..." : "계약서 만들기"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSign && selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4">
          <div className="max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
              <div>
                <h2 className="text-base font-semibold">어드민 서명</h2>
                <p className="text-xs text-[#1a1a1a]/50 mt-0.5">
                  {selected.contract_number} - {selected.title}
                </p>
              </div>
              <button onClick={() => { setShowSign(false); setSelected(null) }} className="text-[#1a1a1a]/40 hover:text-[#1a1a1a]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[calc(100dvh-8rem)] overflow-y-auto p-4 sm:p-6">
              {signing ? <div className="py-8 text-center text-sm text-[#1a1a1a]/50">처리 중...</div> : <SignatureCanvas onSave={handleAdminSign} />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

