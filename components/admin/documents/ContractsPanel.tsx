"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { RefreshCw, Trash2, X, PenLine, Copy, Check, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Contract, ContractStatus, Partner } from "@/lib/supabase/database.types"

const DUMMY_MODE = false

const DUMMY_PARTNERS_MAP: Record<string, string> = {
  p1: "Partner A",
  p2: "Partner B",
  p3: "Partner C",
  p4: "Partner D",
  p5: "Partner E",
}

const DUMMY_CONTRACTS_LIST = [
  {
    id: "c1",
    contract_number: "C-2026-001",
    quote_id: "q1",
    partner_id: "p1",
    title: "Digital Publishing Contract",
    status: "partner_signed",
    total_amount: 25000000,
    content_html: "<h2>Digital Publishing Contract</h2><p>Sample contract content.</p>",
    notes: null,
    valid_from: "2026-03-10",
    valid_until: "2026-12-31",
    sign_token: "tok_demo_abc123",
    partner_signed_at: "2026-03-12T14:30:00Z",
    partner_signature_url: null,
    partner_signed_ip: "1.2.3.4",
    admin_signed_at: null,
    admin_signature_url: null,
    admin_signed_by: null,
    created_by: null,
    created_at: "2026-03-10T00:00:00Z",
    updated_at: "2026-03-12T00:00:00Z",
  },
  {
    id: "c3",
    contract_number: "C-2026-002",
    quote_id: "q3",
    partner_id: "p3",
    title: "75-inch Display Supply and Installation",
    status: "completed",
    total_amount: 12000000,
    content_html: "<p>Sample 75-inch display contract.</p>",
    notes: null,
    valid_from: "2026-02-20",
    valid_until: "2026-12-31",
    sign_token: "tok_demo_ghi789",
    partner_signed_at: "2026-02-22T10:00:00Z",
    partner_signature_url: null,
    partner_signed_ip: "5.6.7.8",
    admin_signed_at: "2026-02-23T09:00:00Z",
    admin_signature_url: null,
    admin_signed_by: null,
    created_by: null,
    created_at: "2026-02-20T00:00:00Z",
    updated_at: "2026-02-23T00:00:00Z",
  },
  {
    id: "c2",
    contract_number: "C-2026-003",
    quote_id: null,
    partner_id: "p4",
    title: "Equipment Maintenance Contract",
    status: "completed",
    total_amount: 18000000,
    content_html: null,
    notes: "Annual maintenance",
    valid_from: "2026-01-01",
    valid_until: "2026-12-31",
    sign_token: "tok_demo_def456",
    partner_signed_at: "2026-01-20T10:00:00Z",
    partner_signature_url: null,
    partner_signed_ip: "9.9.9.9",
    admin_signed_at: "2026-01-21T09:00:00Z",
    admin_signature_url: null,
    admin_signed_by: null,
    created_by: null,
    created_at: "2026-01-18T00:00:00Z",
    updated_at: "2026-01-21T00:00:00Z",
  },
] satisfies Array<Omit<Contract, "version">>

const STATUS_LABEL: Record<ContractStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partner_signed: "Partner Signed",
  admin_signed: "Admin Signed",
  completed: "Completed",
  cancelled: "Cancelled",
}

const STATUS_COLOR: Record<ContractStatus, string> = {
  draft: "bg-[#f0f0ec] text-[#1a1a1a]/50",
  sent: "bg-[#ECFDF5] text-[#084734]",
  partner_signed: "bg-yellow-50 text-yellow-700",
  admin_signed: "bg-[#D1FAE5] text-[#065c41]",
  completed: "bg-[#D1FAE5] text-[#065c41] font-semibold",
  cancelled: "bg-[#FEF3EE] text-[#B85C33]",
}

function adminFetch(url: string, options?: RequestInit) {
  const token = (typeof window !== "undefined" ? sessionStorage.getItem("admin_password") : null) ?? ""
  return fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options?.headers },
  })
}

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
      <p className="text-xs text-[#1a1a1a]/40 text-center">Draw your signature in the box above.</p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          Clear
        </Button>
        <Button type="button" size="sm" onClick={save}>
          Apply
        </Button>
      </div>
    </div>
  )
}

export function ContractsPanel() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Contract | null>(null)
  const [showSign, setShowSign] = useState(false)
  const [signing, setSigning] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (DUMMY_MODE) {
      setContracts(DUMMY_CONTRACTS_LIST.map((contract) => ({ ...contract, version: 1 })))
      setLoading(false)
      return
    }
    setLoading(true)
    const [cRes, pRes] = await Promise.all([adminFetch("/api/admin/contracts"), adminFetch("/api/admin/partners")])
    if (cRes.ok) setContracts((await cRes.json()).contracts ?? [])
    if (pRes.ok) setPartners((await pRes.json()).partners ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    let alive = true

    const initialize = async () => {
      if (DUMMY_MODE) {
        setContracts(DUMMY_CONTRACTS_LIST.map((contract) => ({ ...contract, version: 1 })))
        setLoading(false)
        return
      }

      setLoading(true)
      const [cRes, pRes] = await Promise.all([adminFetch("/api/admin/contracts"), adminFetch("/api/admin/partners")])
      if (!alive) return
      if (cRes.ok) setContracts((await cRes.json()).contracts ?? [])
      if (pRes.ok) setPartners((await pRes.json()).partners ?? [])
      if (alive) setLoading(false)
    }

    void initialize()

    return () => {
      alive = false
    }
  }, [])

  const partnerName = (id: string) => (DUMMY_MODE ? (DUMMY_PARTNERS_MAP[id] ?? id) : (partners.find((p) => p.id === id)?.name ?? id))

  function copySignLink(contract: Contract) {
    const url = `${window.location.origin}/partner/sign/${contract.sign_token}`
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
      alert(err.error ?? "Signature failed")
    }
    setSigning(false)
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this contract?")) return
    await adminFetch(`/api/admin/contracts/${id}`, { method: "DELETE" })
    load()
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a1a]">Contracts</h1>
          <p className="text-sm text-[#1a1a1a]/50 mt-0.5">{contracts.length} items</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="border border-[#e8e8e4] rounded-xl overflow-hidden bg-white">
        {loading ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">Loading...</div>
        ) : contracts.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#1a1a1a]/40">No contracts yet.</div>
        ) : (
          <>
            <div className="divide-y divide-[#f0f0ec] md:hidden">
              {contracts.map((c) => (
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
                      <p className="text-[#1a1a1a]/32">Total</p>
                      <p className="mt-0.5 font-semibold text-[#111110]">{c.total_amount.toLocaleString()} KRW</p>
                    </div>
                    <div>
                      <p className="text-[#1a1a1a]/32">Partner Sign</p>
                      {c.partner_signed_at ? (
                        <p className="mt-0.5 font-medium text-green-600">Done {new Date(c.partner_signed_at).toLocaleDateString("ko")}</p>
                      ) : (
                        <p className="mt-0.5 text-[#1a1a1a]/35">Pending</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[#1a1a1a]/32">Admin Sign</p>
                      {c.admin_signed_at ? (
                        <p className="mt-0.5 font-medium text-green-600">Done {new Date(c.admin_signed_at).toLocaleDateString("ko")}</p>
                      ) : (
                        <p className="mt-0.5 text-[#1a1a1a]/35">Pending</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    {c.status === "draft" && (
                      <Button variant="outline" size="sm" className="w-full text-[#084734]" onClick={() => handleSend(c)}>
                        <Send className="mr-1 h-3.5 w-3.5" />
                        Send
                      </Button>
                    )}
                    {["sent", "draft"].includes(c.status) && c.sign_token && (
                      <Button variant="outline" size="sm" className="w-full" onClick={() => copySignLink(c)}>
                        {copied === c.id ? <Check className="mr-1 h-3.5 w-3.5 text-green-500" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
                        Copy Link
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
                        Sign
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="w-full text-[#B85C33]" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-[#f7f7f5] border-b border-[#e8e8e4]">
                  <tr>
                    {["No.", "Partner", "Title", "Total", "Status", "Partner Sign", "Admin Sign", ""].map((h) => (
                      <th key={h} className="px-4 py-3 text-left font-medium text-[#1a1a1a]/60 text-xs">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((c) => (
                    <tr key={c.id} className="border-b border-[#f0f0ec] hover:bg-[#fafafa] transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-[#1a1a1a]/60">{c.contract_number}</td>
                      <td className="px-4 py-3 text-[#1a1a1a]/70">{partnerName(c.partner_id)}</td>
                      <td className="px-4 py-3 font-medium text-[#1a1a1a]">{c.title}</td>
                      <td className="px-4 py-3 font-medium">{c.total_amount.toLocaleString()} KRW</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {c.partner_signed_at ? (
                          <span className="text-green-600">Done {new Date(c.partner_signed_at).toLocaleDateString("ko")}</span>
                        ) : (
                          <span className="text-[#1a1a1a]/30">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {c.admin_signed_at ? (
                          <span className="text-green-600">Done {new Date(c.admin_signed_at).toLocaleDateString("ko")}</span>
                        ) : (
                          <span className="text-[#1a1a1a]/30">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {c.status === "draft" && (
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-[#084734]" onClick={() => handleSend(c)}>
                              <Send className="w-3.5 h-3.5 mr-1" />
                              Send
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
                              Sign
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

      {showSign && selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 sm:items-center sm:p-4">
          <div className="max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
              <div>
                <h2 className="text-base font-semibold">Admin Sign</h2>
                <p className="text-xs text-[#1a1a1a]/50 mt-0.5">
                  {selected.contract_number} - {selected.title}
                </p>
              </div>
              <button onClick={() => { setShowSign(false); setSelected(null) }} className="text-[#1a1a1a]/40 hover:text-[#1a1a1a]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[calc(100dvh-8rem)] overflow-y-auto p-4 sm:p-6">
              {signing ? <div className="py-8 text-center text-sm text-[#1a1a1a]/50">Processing...</div> : <SignatureCanvas onSave={handleAdminSign} />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

