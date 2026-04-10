"use client"

import { useState, useEffect, useRef } from "react"
import { useParams } from "next/navigation"
import { CheckCircle2, AlertCircle, PenLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Contract } from "@/lib/supabase/database.types"

function SignatureCanvas({ onSave }: { onSave: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasContent, setHasContent] = useState(false)

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
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
    ctx.lineWidth = 2.5
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.strokeStyle = "#1a1a1a"
    const { x, y } = getPos(e, canvas)
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasContent(true)
  }

  function stop() { drawing.current = false }

  function clear() {
    const canvas = canvasRef.current!
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height)
    setHasContent(false)
  }

  return (
    <div className="space-y-3">
      <div className="border-2 border-[#1a1a1a] rounded-2xl overflow-hidden bg-white relative">
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full cursor-crosshair touch-none"
          onMouseDown={start}
          onMouseMove={draw}
          onMouseUp={stop}
          onMouseLeave={stop}
          onTouchStart={start}
          onTouchMove={draw}
          onTouchEnd={stop}
        />
        {!hasContent && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-[#1a1a1a]/30 flex items-center gap-1.5">
              <PenLine className="w-4 h-4" />여기에 서명하세요
            </p>
          </div>
        )}
      </div>
      <div className="flex justify-between items-center">
        <button type="button" onClick={clear} className="text-xs text-[#1a1a1a]/40 hover:text-[#1a1a1a] underline">
          다시 그리기
        </button>
        <Button
          type="button"
          disabled={!hasContent}
          onClick={() => onSave(canvasRef.current!.toDataURL("image/png"))}
          className="px-8"
        >
          서명 완료
        </Button>
      </div>
    </div>
  )
}

// ── 더미 데이터 ─────────────────────────────────────────────
const DUMMY_CONTRACTS: Record<string, Partial<Contract>> = {
  "tok_demo_abc123": {
    id: "c1", contract_number: "C-2026-001", title: '전자칠판 86" 5대 납품계약',
    status: "sent", total_amount: 25000000,
    content_html: `
      <h3 style="font-size:1rem;font-weight:600;margin-bottom:0.75rem">제1조 (목적)</h3>
      <p style="margin-bottom:1rem">본 계약은 이이오클래스인코리아 유한회사(이하 "공급사")와 한국교육솔루션(주)(이하 "구매사") 사이에 전자칠판 납품에 관한 제반 사항을 규정함을 목적으로 합니다.</p>
      <h3 style="font-size:1rem;font-weight:600;margin-bottom:0.75rem">제2조 (납품 품목)</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:1rem;font-size:0.875rem">
        <thead><tr style="background:#f7f7f5"><th style="padding:8px;border:1px solid #e8e8e4;text-align:left">품목</th><th style="padding:8px;border:1px solid #e8e8e4;text-align:center">수량</th><th style="padding:8px;border:1px solid #e8e8e4;text-align:right">단가</th><th style="padding:8px;border:1px solid #e8e8e4;text-align:right">금액</th></tr></thead>
        <tbody>
          <tr><td style="padding:8px;border:1px solid #e8e8e4">전자칠판 86"</td><td style="padding:8px;border:1px solid #e8e8e4;text-align:center">5</td><td style="padding:8px;border:1px solid #e8e8e4;text-align:right">4,545,454원</td><td style="padding:8px;border:1px solid #e8e8e4;text-align:right">22,727,270원</td></tr>
          <tr><td style="padding:8px;border:1px solid #e8e8e4">설치 및 교육</td><td style="padding:8px;border:1px solid #e8e8e4;text-align:center">1식</td><td style="padding:8px;border:1px solid #e8e8e4;text-align:right">—</td><td style="padding:8px;border:1px solid #e8e8e4;text-align:right">포함</td></tr>
        </tbody>
      </table>
      <h3 style="font-size:1rem;font-weight:600;margin-bottom:0.75rem">제3조 (납품 일정)</h3>
      <p style="margin-bottom:1rem">계약 체결일로부터 30일 이내 납품을 완료하며, 설치 일정은 별도 협의합니다.</p>
      <h3 style="font-size:1rem;font-weight:600;margin-bottom:0.75rem">제4조 (대금 지급)</h3>
      <p>계약금 50%는 계약 체결 후 7일 이내, 잔금 50%는 납품 완료 후 14일 이내 지급합니다.</p>
    `,
    valid_from: "2026-03-10", valid_until: "2026-12-31",
    partner_signed_at: null, admin_signed_at: null,
  },
  "tok_demo_def456": {
    id: "c2", contract_number: "C-2026-002", title: "유지보수 서비스 계약 (연간)",
    status: "completed", total_amount: 3600000,
    content_html: `<h3 style="font-size:1rem;font-weight:600;margin-bottom:0.75rem">유지보수 서비스 계약서</h3><p>전자칠판 제품에 대한 연간 유지보수 서비스 계약입니다.</p>`,
    valid_from: "2026-01-01", valid_until: "2026-12-31",
    partner_signed_at: "2026-01-05T10:00:00Z", admin_signed_at: "2026-01-06T09:00:00Z",
  },
}

export default function PartnerSignPage() {
  const { token } = useParams<{ token: string }>()
  const [contract, setContract] = useState<Partial<Contract> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [agreed, setAgreed] = useState(false)

  useEffect(() => {
    if (token?.startsWith("tok_demo_")) {
      const dummy = DUMMY_CONTRACTS[token]
      if (dummy) { setContract(dummy); setLoading(false); return }
      setError("데모 계약서를 찾을 수 없습니다"); setLoading(false); return
    }
    fetch(`/api/partner/sign?token=${token}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "계약서를 찾을 수 없습니다")
        return res.json()
      })
      .then((data) => setContract(data.contract))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  async function handleSign(dataUrl: string) {
    setSubmitting(true)
    try {
      const res = await fetch("/api/partner/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, signature_data: dataUrl }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      setDone(true)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "서명 처리 중 오류가 발생했습니다")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f7f5]">
        <p className="text-sm text-[#1a1a1a]/40">계약서를 불러오는 중...</p>
      </div>
    )
  }

  if (error || !contract) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f7f5] p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8e4] p-8 max-w-md w-full text-center">
          <AlertCircle className="w-10 h-10 text-[#B85C33] mx-auto mb-3" />
          <h2 className="text-base font-semibold text-[#1a1a1a] mb-2">계약서를 찾을 수 없습니다</h2>
          <p className="text-sm text-[#1a1a1a]/50">{error ?? "유효하지 않은 링크입니다."}</p>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f7f5] p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8e4] p-8 max-w-md w-full text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-[#1a1a1a] mb-2">서명이 완료되었습니다</h2>
          <p className="text-sm text-[#1a1a1a]/50">계약서 서명이 정상적으로 접수되었습니다.<br />담당자가 확인 후 최종 서명 완료 이메일을 발송드립니다.</p>
        </div>
      </div>
    )
  }

  if (contract.partner_signed_at) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f7f5] p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-[#e8e8e4] p-8 max-w-md w-full text-center">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-[#1a1a1a] mb-2">이미 서명된 계약서입니다</h2>
          <p className="text-sm text-[#1a1a1a]/50">
            서명일: {new Date(contract.partner_signed_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5] py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* 헤더 */}
        <div className="text-center">
          <p className="text-xs font-medium text-[#1a1a1a]/40 uppercase tracking-wider mb-2">ClassIn 계약서</p>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">{contract.title}</h1>
          <p className="text-sm text-[#1a1a1a]/50 mt-1">{contract.contract_number}</p>
        </div>

        {/* 계약서 본문 */}
        <div className="bg-white rounded-2xl border border-[#e8e8e4] shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[#e8e8e4] bg-[#fafafa]">
            <p className="text-xs text-[#1a1a1a]/50">계약 내용</p>
          </div>
          <div
            className="px-6 py-6 prose prose-sm max-w-none text-[#1a1a1a]"
            dangerouslySetInnerHTML={{ __html: contract.content_html ?? "" }}
          />
          {contract.total_amount && (
            <div className="px-6 py-4 border-t border-[#e8e8e4] bg-[#fafafa] flex justify-between items-center">
              <span className="text-sm text-[#1a1a1a]/60">계약 금액</span>
              <span className="text-lg font-bold text-[#1a1a1a]">{contract.total_amount.toLocaleString()}원 (VAT 포함)</span>
            </div>
          )}
        </div>

        {/* 서명 */}
        <div className="bg-white rounded-2xl border border-[#e8e8e4] shadow-sm p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-[#1a1a1a] mb-1">전자 서명</h3>
            <p className="text-xs text-[#1a1a1a]/50">아래 박스에 서명하면 본 계약서에 동의한 것으로 간주됩니다.</p>
          </div>

          {/* 동의 체크박스 */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 rounded" />
            <span className="text-sm text-[#1a1a1a]/70">
              위 계약서 내용을 모두 확인하였으며, 전자서명법에 의거하여 본 전자 서명이 자필 서명과 동일한 효력을 가짐에 동의합니다.
            </span>
          </label>

          {agreed && !submitting && <SignatureCanvas onSave={handleSign} />}
          {submitting && (
            <div className="py-6 text-center text-sm text-[#1a1a1a]/50">서명을 처리하는 중입니다...</div>
          )}
          {!agreed && (
            <p className="text-xs text-[#1a1a1a]/40 text-center">위 동의 사항에 체크하면 서명란이 활성화됩니다</p>
          )}
        </div>

        <p className="text-center text-xs text-[#1a1a1a]/30 pb-6">
          본 전자 계약은 ClassIn이 운영하는 파트너 포털을 통해 처리됩니다.
        </p>
      </div>
    </div>
  )
}
