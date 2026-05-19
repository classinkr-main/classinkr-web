"use client"

import { useState, useEffect, useCallback } from "react"
import { RefreshCw, X, PenLine, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { portalFetch } from "@/lib/portal/portal-fetch"
import { SignatureCanvas } from "./SignatureCanvas"
import type { ContractDocumentBundle, ContractDocumentStatus } from "@/lib/portal/types"

const STATUS_LABEL: Record<ContractDocumentStatus, string> = {
  draft: "초안",
  shared: "공유됨",
  partner_signed: "파트너서명완료",
  admin_signed: "어드민서명완료",
  completed: "완료",
  cancelled: "취소",
}

const STATUS_COLOR: Record<ContractDocumentStatus, string> = {
  draft: "bg-[#f0f0ec] text-[#1a1a1a]/50",
  shared: "bg-[#ECFDF5] text-[#084734]",
  partner_signed: "bg-yellow-50 text-yellow-700",
  admin_signed: "bg-[#D1FAE5] text-[#065c41]",
  completed: "bg-[#D1FAE5] text-[#065c41] font-semibold",
  cancelled: "bg-[#FEF3EE] text-[#B85C33]",
}

interface Props {
  dealId?: string
}

export function ContractList({ dealId }: Props) {
  const [contracts, setContracts] = useState<ContractDocumentBundle[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selected, setSelected] = useState<ContractDocumentBundle | null>(null)
  const [showSign, setShowSign] = useState(false)
  const [signing, setSigning] = useState(false)
  const [signError, setSignError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const load = useCallback(async (showSpinner = true) => {
    if (!dealId) return
    if (showSpinner) setLoading(true)
    const res = await portalFetch(`/api/portal/deals/${dealId}`)
    if (res.ok) {
      const data = await res.json()
      setContracts(data.contract_documents ?? [])
      setLoadError(false)
    } else {
      setLoadError(true)
    }
    setLoading(false)
  }, [dealId])

  useEffect(() => {
    let active = true

    async function initialLoad() {
      if (!dealId) {
        setLoading(false)
        return
      }

      const res = await portalFetch(`/api/portal/deals/${dealId}`)
      if (!active) return
      if (res.ok) {
        const data = await res.json()
        if (!active) return
        setContracts(data.contract_documents ?? [])
      } else {
        if (active) setLoadError(true)
      }
      setLoading(false)
    }

    void initialLoad()
    return () => {
      active = false
    }
  }, [dealId])

  async function handleCreate() {
    if (!dealId) return
    const res = await portalFetch("/api/portal/contracts", {
      method: "POST",
      body: JSON.stringify({ deal_id: dealId }),
    })
    if (res.ok) {
      setSuccessMsg("계약서가 생성되었습니다.")
      setTimeout(() => setSuccessMsg(null), 4000)
      void load()
    }
  }

  async function handleSign(dataUrl: string) {
    if (!selected) return
    setSigning(true)
    setSignError(null)
    const res = await portalFetch(`/api/portal/contracts/${selected.id}/sign`, {
      method: "POST",
      body: JSON.stringify({ signature_data: dataUrl }),
    })
    if (res.ok) {
      setShowSign(false)
      setSelected(null)
      setSuccessMsg("서명이 완료되었습니다.")
      setTimeout(() => setSuccessMsg(null), 4000)
      void load()
    } else {
      const err = await res.json().catch(() => null)
      setSignError(err?.error ?? "서명 처리에 실패했습니다. 다시 시도해주세요.")
    }
    setSigning(false)
  }

  async function handleStatusChange(contract: ContractDocumentBundle, status: string) {
    const res = await portalFetch(`/api/portal/contracts/${contract.id}`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    })
    if (res.ok) void load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#1a1a1a]">계약서</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { void load() }} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={handleCreate}>계약서 생성</Button>
        </div>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <span>✓</span> {successMsg}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-[#1a1a1a]/40">불러오는 중...</div>
      ) : loadError ? (
        <div className="py-12 text-center border border-[#e8e8e4] rounded-xl bg-white">
          <p className="text-sm text-[#1a1a1a]/50">계약서 목록을 불러오지 못했습니다.</p>
          <button onClick={() => { setLoadError(false); void load() }} className="mt-2 text-xs text-[#084734] hover:underline">
            다시 시도
          </button>
        </div>
      ) : contracts.length === 0 ? (
        <div className="py-12 text-center text-sm text-[#1a1a1a]/40 border border-dashed border-[#e0e0dc] rounded-xl bg-white">
          계약서가 없습니다. 위 버튼으로 생성하세요.
        </div>
      ) : (
        <div className="border border-[#e8e8e4] rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#f7f7f5] border-b border-[#e8e8e4]">
              <tr>
                {["번호", "상태", "버전", "파트너 서명", "어드민 서명", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-[#1a1a1a]/60 text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => {
                const latest = c.versions[0]
                return (
                  <tr key={c.id} className="border-b border-[#f0f0ec] hover:bg-[#fafafa] transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-[#1a1a1a]/60">{c.contract_number}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status]}`}>
                        {STATUS_LABEL[c.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#1a1a1a]/50">v{latest?.version_number ?? 1}</td>
                    <td className="px-4 py-3 text-xs">
                      {latest?.partner_signed_at
                        ? <span className="text-green-600">&#10003; {new Date(latest.partner_signed_at).toLocaleDateString("ko")}</span>
                        : <span className="text-[#1a1a1a]/30">대기중</span>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {latest?.admin_signed_at
                        ? <span className="text-green-600">&#10003; {new Date(latest.admin_signed_at).toLocaleDateString("ko")}</span>
                        : <span className="text-[#1a1a1a]/30">대기중</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {c.status === "draft" && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-[#084734]"
                            onClick={() => handleStatusChange(c, "shared")}>
                            <Send className="w-3.5 h-3.5 mr-1" />공유
                          </Button>
                        )}
                        {(c.status === "shared" || c.status === "partner_signed") && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-[#084734]"
                            onClick={() => { setSelected(c); setShowSign(true) }}>
                            <PenLine className="w-3.5 h-3.5 mr-1" />서명
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showSign && selected && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8e8e4]">
              <div>
                <h2 className="text-base font-semibold">서명</h2>
                <p className="text-xs text-[#1a1a1a]/50 mt-0.5">{selected.contract_number}</p>
              </div>
              <button onClick={() => { setShowSign(false); setSelected(null) }} className="text-[#1a1a1a]/40 hover:text-[#1a1a1a]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-lg border border-[#e8e8e4] bg-[#f7f7f5] px-4 py-3 text-sm text-[#1a1a1a]/60">
                마우스(PC) 또는 터치펜/손가락(태블릿)으로 서명란에 직접 서명해주세요.
              </div>
              {signError && (
                <div className="rounded-lg border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-sm text-[#B85C33]">
                  {signError}
                </div>
              )}
              {signing ? (
                <div className="py-8 text-center text-sm text-[#1a1a1a]/50">서명 처리 중...</div>
              ) : (
                <SignatureCanvas onSave={handleSign} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
