"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { AlertCircle, Check, Copy, FileSignature, PenLine, Plus, Send, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { adminFetch, adminFetchJsonCached, clearAdminRequestCache } from "@/lib/admin-client"
import { useUrlState } from "@/lib/use-url-state"
import type { Contract, Partner, Receipt } from "@/lib/supabase/database.types"
import type { ContractDocumentListItem } from "@/lib/portal/types"
import {
  CONTRACT_QUEUE_GROUPS,
  getContractQueueKey,
  getContractSteps,
  groupContracts,
  type ContractQueueKey,
} from "./document-queues"
import {
  DANGER_GHOST_BUTTON,
  DetailHeader,
  DocChain,
  GHOST_BUTTON,
  NextActionBox,
  NoMatch,
  QueueEmptyState,
  QueueGroupHeader,
  QueueLayout,
  QueueListItem,
  QueueLoading,
  QueueTimeline,
  QueueToolbar,
  SOLID_BUTTON,
  formatDay,
  formatMan,
  formatWon,
} from "./queue-ui"

// GET /api/admin/partners는 { partners }가 아니라 { workspaces }/{ summaries }를 반환한다.
// 패널은 파트너명 표시에 id/name만 필요하므로 summary 응답을 최소 형태로 매핑해 쓴다.
type PartnerOption = Pick<Partner, "id" | "name">

// V2 견적 전환은 HardwareQuotesPanel이 /api/portal/quotes/[id]/convert로 직접 처리(딜·고객 FK 연결) —
// 이 폼은 V1 legacy 계약의 수동 신설 전용이라 외부 프리필 요청 프롭을 받지 않는다.

// 계약서 탭은 두 원천을 한 목록에 합쳐 보여 준다.
//  - direct: 이 화면에서 직접 작성한 V1 계약(contracts, 파트너 기준). 발송·서명 링크·우리 서명·삭제를 여기서 한다.
//  - converted: 견적 "계약 전환"으로 만든 계약(contract_documents, 딜·고객 기준). 지금은 보기만 한다 —
//    고객용 공개 서명 페이지(/share/contract/[token])가 V1 토큰만 읽어 서명 링크를 내줄 수 없다.
type ContractRowBase = {
  id: string
  contract_number: string
  title: string
  party: string
  total_amount: number
  /** 작업 큐 판정용 상태(V1 어휘). */
  status: string
  partner_signed_at: string | null
  admin_signed_at: string | null
  created_at: string
  updated_at: string
  valid_from: string | null
  valid_until: string | null
}
type ContractRow =
  | (ContractRowBase & { source: "direct"; contract: Contract })
  | (ContractRowBase & { source: "converted"; doc: ContractDocumentListItem })

// 전환 계약 상태를 큐 판정 어휘로 옮긴다. shared = 발송됨, admin_signed = 우리 서명까지 끝난 확정
// (서명 API가 이 시점에 매출 원장 초안을 제안한다).
function toQueueStatus(status: ContractDocumentListItem["status"]) {
  if (status === "shared") return "sent"
  if (status === "admin_signed") return "completed"
  return status
}

function toConvertedRow(doc: ContractDocumentListItem): ContractRow {
  return {
    source: "converted",
    doc,
    id: doc.id,
    contract_number: doc.contract_number,
    title: doc.title ?? doc.deal_title ?? "계약서",
    party: doc.customer_name ?? doc.deal_title ?? "고객 미지정",
    total_amount: doc.total_amount,
    status: toQueueStatus(doc.status),
    partner_signed_at: doc.partner_signed_at,
    admin_signed_at: doc.admin_signed_at,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    valid_from: doc.valid_from,
    valid_until: doc.valid_until,
  }
}

const CONVERTED_BADGE = (
  <span className="rounded border border-[#CFE3DA] bg-[#F1F8F5] px-1.5 py-px text-[11px] font-medium text-[#084734]">
    견적 전환
  </span>
)

const EMPTY_CREATE_FORM = {
  partner_id: "",
  title: "",
  total_amount: 0,
  notes: "",
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
  const [converted, setConverted] = useState<ContractDocumentListItem[]>([])
  const [convertedError, setConvertedError] = useState<string | null>(null)
  const [partners, setPartners] = useState<PartnerOption[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Contract | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showSign, setShowSign] = useState(false)
  const [signing, setSigning] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [query, setQuery] = useUrlState("contract_q", "")

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [cData, pData, rData] = await Promise.all([
        adminFetchJsonCached<{
          contracts?: Contract[]
          convertedContracts?: ContractDocumentListItem[]
          convertedContractsError?: string | null
        }>("/api/admin/contracts"),
        adminFetchJsonCached<{ summaries?: Array<{ partnerId: string; partnerName: string }> }>(
          "/api/admin/partners?view=summary"
        ),
        // 연결 문서 줄(계약 → 영수증)용. 실패해도 계약 목록은 보여 준다.
        adminFetchJsonCached<{ receipts?: Receipt[] }>("/api/admin/receipts").catch(() => ({ receipts: [] })),
      ])
      setContracts(cData.contracts ?? [])
      setConverted(cData.convertedContracts ?? [])
      setConvertedError(cData.convertedContractsError ?? null)
      setPartners((pData.summaries ?? []).map((s) => ({ id: s.partnerId, name: s.partnerName })))
      setReceipts(rData.receipts ?? [])
    } catch (error) {
      // 기존 데이터 유지 — 일시적 네트워크 오류 시 빈 화면 방지
      setLoadError(error instanceof Error ? error.message : "계약 목록을 불러오지 못했습니다.")
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
      if (data?.contract?.id) setSelectedId(data.contract.id)
      clearAdminRequestCache("/api/admin/contracts")
      void load()
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "계약서 생성에 실패했습니다.")
    } finally {
      setCreating(false)
    }
  }

  const partnerName = useCallback(
    (id: string) => partners.find((p) => p.id === id)?.name ?? "파트너 미지정",
    [partners]
  )

  // 직접 작성 계약과 견적 전환 계약을 한 목록으로 합친다.
  const rows = useMemo<ContractRow[]>(
    () => [
      ...contracts.map(
        (c): ContractRow => ({
          source: "direct",
          contract: c,
          id: c.id,
          contract_number: c.contract_number,
          title: c.title,
          party: partnerName(c.partner_id),
          total_amount: c.total_amount,
          status: c.status,
          partner_signed_at: c.partner_signed_at,
          admin_signed_at: c.admin_signed_at,
          created_at: c.created_at,
          updated_at: c.updated_at,
          valid_from: c.valid_from,
          valid_until: c.valid_until,
        })
      ),
      ...converted.map(toConvertedRow),
    ],
    [contracts, converted, partnerName]
  )

  // 다음 할 일 기준 묶음. 그룹 순서 = 처리 우선순위, 그룹 안은 최근 변경순.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const visible = q
      ? rows.filter(
          (row) =>
            row.contract_number.toLowerCase().includes(q) ||
            row.title.toLowerCase().includes(q) ||
            row.party.toLowerCase().includes(q) ||
            (row.source === "converted" && (row.doc.source_quote_number ?? "").toLowerCase().includes(q))
        )
      : rows
    return groupContracts(visible)
  }, [rows, query])

  const visibleContracts = groups.flatMap((group) => group.items)
  const current = visibleContracts.find((c) => c.id === selectedId) ?? visibleContracts[0] ?? null

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
    if (res.ok) {
      clearAdminRequestCache("/api/admin/contracts")
      load()
    }
  }

  async function handleAdminSign(dataUrl: string) {
    if (!selected) return
    setSigning(true)
    const res = await adminFetch(`/api/admin/contracts/${selected.id}/sign`, {
      method: "POST",
      body: JSON.stringify({ signature_data: dataUrl, admin_user_id: "" }),
    })
    if (res.ok) {
      clearAdminRequestCache("/api/admin/contracts")
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
    clearAdminRequestCache("/api/admin/contracts")
    load()
  }

  function getListStatus(c: ContractRow, key: ContractQueueKey) {
    switch (key) {
      case "sign":
        return { text: `고객 서명 ${formatDay(c.partner_signed_at) ?? ""}`, tone: "go" as const }
      case "await":
        return { text: `서명 대기 · ${formatDay(c.updated_at) ?? ""}`, tone: "warn" as const }
      case "draft":
        return { text: `작성 ${formatDay(c.created_at) ?? ""}`, tone: "warn" as const }
      case "done":
        return { text: `완료 ${formatDay(c.admin_signed_at ?? c.updated_at) ?? ""}`, tone: "neutral" as const }
      default:
        return { text: "취소", tone: "muted" as const }
    }
  }

  function renderCopyLink(c: Contract, className: string) {
    if (!c.sign_token) return null
    return (
      <button type="button" onClick={() => copySignLink(c)} className={className}>
        {copied === c.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied === c.id ? "복사됨" : "서명 링크 복사"}
      </button>
    )
  }

  // 견적 전환 계약은 보기만 한다 — 발송·서명 버튼 없이 지금 단계만 알려 준다.
  function renderConvertedStatus(row: ContractRow & { source: "converted" }, key: ContractQueueKey) {
    const tone = CONTRACT_QUEUE_GROUPS.find((group) => group.key === key)?.tone ?? "neutral"
    const from = row.doc.source_quote_number ? `견적 ${row.doc.source_quote_number}에서 ` : "견적에서 "
    const viewOnly = "이 화면에서는 보기만 할 수 있습니다 — 고객 서명 링크 발송은 아직 지원하지 않습니다."
    switch (key) {
      case "sign":
        return (
          <NextActionBox
            tone={tone}
            label="우리 서명 필요"
            description={`고객이 ${formatDay(row.partner_signed_at) ?? ""} 서명했습니다. ${viewOnly}`}
          />
        )
      case "await":
        return <NextActionBox tone={tone} label="고객 서명 대기" description={`공유했지만 고객 서명 전입니다. ${viewOnly}`} />
      case "draft":
        return <NextActionBox tone={tone} label="발송 전" description={`${from}전환한 계약입니다. ${viewOnly}`} />
      case "done":
        return <NextActionBox tone={tone} label="완료" description="서명이 끝난 계약입니다." />
      default:
        return <NextActionBox tone={tone} label="취소" description="취소된 계약입니다. 기록용으로 남아 있습니다." />
    }
  }

  function renderNextAction(c: Contract, key: ContractQueueKey, receipt: Receipt | undefined) {
    const tone = CONTRACT_QUEUE_GROUPS.find((group) => group.key === key)?.tone ?? "neutral"
    switch (key) {
      case "sign":
        return (
          <NextActionBox
            tone={tone}
            label="우리 서명 필요"
            description={`고객이 ${formatDay(c.partner_signed_at) ?? ""} 서명했습니다 — 우리가 서명하면 계약이 확정됩니다.`}
          >
            <button
              type="button"
              onClick={() => {
                setSelected(c)
                setShowSign(true)
              }}
              className={SOLID_BUTTON}
            >
              <PenLine className="h-3.5 w-3.5" />
              서명하기
            </button>
          </NextActionBox>
        )
      case "await":
        return (
          <NextActionBox
            tone={tone}
            label="고객 서명 대기"
            description={
              c.admin_signed_at
                ? "우리 서명은 끝났습니다 — 고객 서명을 기다리는 중이니 서명 링크를 다시 안내하세요."
                : "발송했지만 고객 서명 전입니다 — 서명 링크를 다시 보내 안내하세요."
            }
          >
            {renderCopyLink(c, SOLID_BUTTON)}
          </NextActionBox>
        )
      case "draft":
        return (
          <NextActionBox tone={tone} label="발송 전" description="조건을 확인한 뒤 발송 처리하고, 서명 링크를 고객에게 보내세요.">
            {renderCopyLink(c, GHOST_BUTTON)}
            <button type="button" onClick={() => void handleSend(c)} className={SOLID_BUTTON}>
              <Send className="h-3.5 w-3.5" />
              발송 처리
            </button>
          </NextActionBox>
        )
      case "done":
        return (
          <NextActionBox
            tone={tone}
            label="완료"
            description={
              receipt
                ? `양측 서명 완료 · 영수증 ${receipt.receipt_number} 발행됨`
                : "양측 서명 완료 — 입금이 확인되면 영수증 탭에서 영수증을 발행하세요."
            }
          />
        )
      default:
        return <NextActionBox tone={tone} label="취소" description="취소된 계약입니다. 기록용으로 남아 있습니다." />
    }
  }

  function renderDetail(row: ContractRow) {
    const key = getContractQueueKey(row)
    const direct = row.source === "direct" ? row.contract : null
    // 영수증의 contract_id 는 V1 계약만 가리킨다 — 전환 계약에는 연결된 영수증이 없다.
    const receipt = direct ? receipts.find((r) => r.contract_id === direct.id) : undefined
    const version = direct ? direct.version : row.source === "converted" ? row.doc.version_number ?? 1 : 1
    const stepDetails = [
      formatDay(row.created_at),
      key === "draft" ? "아직 발송 전" : null,
      formatDay(row.partner_signed_at) ?? (key === "await" ? "서명 대기 중" : null),
      formatDay(row.admin_signed_at),
      key === "done" ? "계약 확정" : null,
    ]
    const steps = getContractSteps(row).map((step, index) => ({
      label: step.label,
      done: step.done,
      detail: stepDetails[index],
      warn: index === 2 && key === "await" && !step.done,
    }))
    const period =
      row.valid_from || row.valid_until
        ? `${formatDay(row.valid_from) ?? "—"} ~ ${formatDay(row.valid_until) ?? "—"}`
        : "—"

    return (
      <section aria-live="polite" aria-label="계약 상세" className="flex min-w-0 flex-col gap-6 px-7 py-6">
        <DetailHeader
          mono={row.contract_number}
          title={`${row.party} · ${row.title}`}
          meta={`${formatDay(row.created_at) ?? ""} ${direct ? "작성" : "전환"}${version > 1 ? ` · v${version}` : ""}`}
          amount={formatWon(row.total_amount)}
          amountNote="계약 금액"
          badge={direct ? undefined : CONVERTED_BADGE}
        />

        <DocChain
          links={[
            {
              label: "견적",
              value: direct
                ? direct.quote_id
                  ? "연결됨"
                  : null
                : row.source === "converted"
                  ? row.doc.source_quote_number
                  : null,
            },
            { label: "계약", value: row.contract_number, current: true },
            { label: "영수증", value: receipt?.receipt_number ?? null },
          ]}
        />

        {row.source === "converted" ? renderConvertedStatus(row, key) : renderNextAction(row.contract, key, receipt)}

        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <QueueTimeline title="서명" steps={steps} />
          <div>
            <h3 className="mb-2 text-[11.5px] font-semibold text-[#78736D]">계약 정보</h3>
            <dl className="grid grid-cols-[72px_1fr] gap-x-2.5 gap-y-1.5 text-xs">
              <dt className="text-[#78736D]">{direct ? "파트너" : "고객"}</dt>
              <dd className="text-[#31302E]">{row.party}</dd>
              {row.source === "converted" && (
                <>
                  <dt className="text-[#78736D]">딜</dt>
                  <dd className="text-[#31302E]">{row.doc.deal_title ?? "—"}</dd>
                  <dt className="text-[#78736D]">원본 견적</dt>
                  <dd className="font-mono text-[#31302E]">{row.doc.source_quote_number ?? "—"}</dd>
                </>
              )}
              <dt className="text-[#78736D]">계약 기간</dt>
              <dd className="text-[#31302E]">{period}</dd>
              {direct && (
                <>
                  <dt className="text-[#78736D]">메모</dt>
                  <dd className="whitespace-pre-wrap text-[#31302E]">{direct.notes?.trim() || "—"}</dd>
                </>
              )}
            </dl>
          </div>
        </div>

        {direct && (
          <div className="flex justify-end border-t border-[#f0f0ec] pt-4">
            <button type="button" onClick={() => void handleDelete(direct.id)} className={DANGER_GHOST_BUTTON}>
              <Trash2 className="h-3.5 w-3.5" />
              삭제
            </button>
          </div>
        )}
      </section>
    )
  }

  const createButton = (
    <button type="button" onClick={openCreateForm} className={`${GHOST_BUTTON} shrink-0`}>
      <Plus className="h-3.5 w-3.5" />
      직접 작성
    </button>
  )

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:px-6 sm:py-5">
      {convertedError && (
        <p role="status" className="rounded-lg border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-xs text-[#B85C33]">
          {convertedError} 직접 작성한 계약만 보이는 상태입니다 — 새로고침으로 다시 시도하세요.
        </p>
      )}
      {loadError && rows.length === 0 ? (
        <QueueEmptyState
          icon={<AlertCircle className="h-5 w-5 text-[#B43E3E]" />}
          title="계약 목록을 불러오지 못했습니다."
          description={loadError}
          action={
            <button type="button" onClick={() => void load()} className={GHOST_BUTTON}>
              다시 시도
            </button>
          }
        />
      ) : loading && rows.length === 0 ? (
        <QueueLoading label="계약서를 불러오는 중입니다." />
      ) : rows.length === 0 ? (
        <QueueEmptyState
          icon={<FileSignature className="h-5 w-5" />}
          title="아직 계약서가 없습니다."
          description="견적을 계약으로 전환하거나 계약서를 직접 만들면 여기서 서명 단계 순서로 정리되고, 지금 할 일이 맨 위에 옵니다."
          action={
            <button type="button" onClick={openCreateForm} className={SOLID_BUTTON}>
              <Plus className="h-3.5 w-3.5" />
              첫 계약서 작성
            </button>
          }
        />
      ) : (
        <QueueLayout
          label="다음 할 일별 계약"
          list={
            <>
              <QueueToolbar
                query={query}
                onQueryChange={setQuery}
                placeholder="계약번호, 고객·파트너, 제목"
                loading={loading}
                onRefresh={() => void load()}
                action={createButton}
              />
              {groups.length === 0 ? (
                <NoMatch label="조건에 맞는 계약이 없습니다." onReset={() => setQuery("")} />
              ) : (
                groups.map((group) => (
                  <section key={group.key} className="border-b border-[#f0f0ec] pb-1.5 last:border-b-0">
                    <QueueGroupHeader
                      tone={group.tone}
                      label={group.label}
                      count={group.items.length}
                      aside={`${formatMan(group.items.reduce((sum, c) => sum + c.total_amount, 0))}원`}
                    />
                    {group.items.map((c) => {
                      const status = getListStatus(c, group.key)
                      return (
                        <QueueListItem
                          key={c.id}
                          selected={c.id === current?.id}
                          onSelect={() => setSelectedId(c.id)}
                          title={c.party}
                          subtitle={c.title}
                          amount={formatMan(c.total_amount)}
                          mono={c.source === "converted" ? `${c.contract_number} · 견적 전환` : c.contract_number}
                          status={status.text}
                          statusTone={status.tone}
                        />
                      )
                    })}
                  </section>
                ))
              )}
            </>
          }
          detail={
            current ? (
              renderDetail(current)
            ) : (
              <p className="px-7 py-16 text-center text-sm text-[#78736D]">왼쪽에서 계약을 고르세요.</p>
            )
          }
        />
      )}

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
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#084734]"
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
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#084734]"
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
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:border-[#084734]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-[#1a1a1a]/60 mb-1 block">메모</label>
                  <textarea
                    value={createForm.notes}
                    onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                    rows={2}
                    placeholder="근거 견적 번호, 특이 조건 등"
                    className="w-full border border-[#e8e8e4] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#084734] resize-none"
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

