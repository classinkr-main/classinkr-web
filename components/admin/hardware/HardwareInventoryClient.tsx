"use client"

import type { FormEvent, ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  Boxes,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Link2,
  Minus,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  TrendingDown,
  UploadCloud,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react"

import { adminFetchJson, clearAdminRequestCache } from "@/lib/admin-client"

type HardwareMovementType = "inbound" | "outbound" | "return" | "transfer" | "repair" | "adjust"

interface HardwareItem {
  id: string
  name: string
  sku: string | null
  category: string | null
  reorder_point: number
  lead_time_days: number
  active: boolean
  source_aliases: string[]
}

interface HardwareMovement {
  id: string
  item_id: string
  product_name: string
  movement_type: HardwareMovementType
  quantity: number
  occurred_at: string | null
  from_location: string | null
  to_location: string | null
  owner: string | null
  status: string | null
  reference_no: string | null
  memo: string | null
  serials: string[]
  source: "admin_manual" | "sheet_import"
  created_by: string | null
  created_at: string
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
  converted_from_movement_id: string | null
  converted_to_movement_id: string | null
}

interface HardwareStockRow {
  itemId: string
  product: string
  category: string | null
  reorderPoint: number
  leadTimeDays: number
  warehouseStock: number
  plannedOut: number
  availableStock: number
  outbound30d: number
  weeklyOutboundAvg: number
  trendOrderPoint: number
  daysUntilStockout: number | null
  low: boolean
  orderRecommended: boolean
  locationBalances: Array<{ location: string; quantity: number }>
}

interface HardwareAlert {
  id: string
  severity: "critical" | "warning" | "info"
  product: string
  title: string
  detail: string
}

interface HardwareDashboard {
  items: HardwareItem[]
  stock: HardwareStockRow[]
  movements: HardwareMovement[]
  recentOutbound: HardwareMovement[]
  plannedMovements: HardwareMovement[]
  alerts: HardwareAlert[]
  totals: {
    warehouseStock: number
    availableStock: number
    plannedOut: number
    outbound30d: number
    lowItems: number
    orderRecommended: number
  }
  importRun: {
    id: string
    status: string
    started_at: string
    finished_at: string | null
    rows_imported: number | null
    rows_skipped: number | null
    error: string | null
  } | null
}

interface HardwareCrmOrderCandidate {
  id: string
  source: "portal_deal" | "external_crm"
  sourceLabel: string
  referenceNo: string
  title: string
  productName: string | null
  quantity: number | null
  amount: number | null
  customerName: string | null
  owner: string | null
  status: string | null
  occurredAt: string | null
  syncedAt: string | null
  href: string | null
  confidence: "high" | "medium" | "low"
  reason: string
}

interface HardwareCrmOrderCandidatesResponse {
  candidates: HardwareCrmOrderCandidate[]
  warnings: string[]
}

interface HardwareMovementDraft {
  itemId?: string
  productName: string
  movementType: HardwareMovementType
  quantity: number
  occurredAt: string
  fromLocation: string
  toLocation: string
  owner: string
  status: string
  referenceNo: string
  memo: string
  serials: string[]
}

const ENTRY_PRESETS: Array<{
  key: string
  movementType: HardwareMovementType
  label: string
  description: string
  icon: LucideIcon
  from: string
  to: string
  status: string
}> = [
  { key: "sale", movementType: "outbound", label: "판매 출고", description: "고객 판매 완료", icon: ArrowUpFromLine, from: "창고", to: "고객", status: "출고" },
  { key: "planned", movementType: "outbound", label: "배송 예정", description: "가용에서 미리 차감", icon: Clock3, from: "창고", to: "고객", status: "배송 예정" },
  { key: "sample", movementType: "outbound", label: "샘플 대여", description: "판매 재고 제외", icon: ArrowRightLeft, from: "창고", to: "샘플", status: "샘플/대여" },
  { key: "inbound", movementType: "inbound", label: "입고", description: "창고 재고 증가", icon: ArrowDownToLine, from: "", to: "창고", status: "입고" },
  { key: "return", movementType: "return", label: "반납", description: "외부에서 창고 회수", icon: RotateCcw, from: "고객", to: "창고", status: "반납" },
  { key: "office", movementType: "transfer", label: "사무실 이동", description: "비가용 위치 이동", icon: ArrowRightLeft, from: "창고", to: "사무실", status: "이동" },
  { key: "repair", movementType: "repair", label: "수리", description: "예외 상태 처리", icon: Wrench, from: "창고", to: "수리", status: "수리중" },
  { key: "adjust", movementType: "adjust", label: "실사 조정", description: "창고 수량 보정", icon: Settings2, from: "", to: "창고", status: "재고 조정" },
]

const LOCATION_OPTIONS = ["고객", "창고", "샘플", "사무실", "수리"] as const

const LOCATION_MATRIX: Array<{ key: string; label: string; tone: string }> = [
  { key: "창고", label: "창고", tone: "bg-[#084734]" },
  { key: "배송 예정", label: "배송 예정", tone: "bg-[#A8741A]" },
  { key: "고객", label: "고객", tone: "bg-[#B43E3E]" },
  { key: "샘플", label: "샘플", tone: "bg-[#084734]" },
  { key: "사무실", label: "사무실", tone: "bg-[#615D59]" },
  { key: "수리", label: "수리", tone: "bg-[#31302E]" },
]

const QUICK_QUANTITIES = [1, 2, 5, 10]

const MOVEMENT_LABEL: Record<HardwareMovementType, string> = {
  inbound: "입고",
  outbound: "출고",
  return: "반납",
  transfer: "이동",
  repair: "수리",
  adjust: "조정",
}

const MOVEMENT_TONE: Record<HardwareMovementType, string> = {
  inbound: "bg-[#ECFDF5] text-[#084734]",
  outbound: "bg-[#FCE9E9] text-[#B43E3E]",
  return: "bg-[#ECFDF5] text-[#084734]",
  transfer: "bg-[#F6F5F4] text-[#31302E]",
  repair: "bg-[#FBF1E0] text-[#A8741A]",
  adjust: "bg-[#F6F5F4] text-[#31302E]",
}

const ALERT_TONE: Record<HardwareAlert["severity"], string> = {
  critical: "border-[#F2B8B8] bg-[#FCE9E9] text-[#8F2C2C]",
  warning: "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]",
  info: "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]",
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(value: string | null) {
  if (!value) return "-"
  return value.slice(0, 10)
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value)
}

function formatCurrency(value: number | null) {
  if (value == null) return "-"
  return `${new Intl.NumberFormat("ko-KR").format(value)}원`
}

function formatAvg(value: number) {
  if (value === 0) return "0"
  if (value < 1) return value.toFixed(1)
  return String(Math.round(value * 10) / 10)
}

function statusCopy(row: HardwareStockRow) {
  if (row.low) return "부족"
  if (row.orderRecommended) return "주문 검토"
  return "정상"
}

function statusClass(row: HardwareStockRow) {
  if (row.low) return "bg-[#FCE9E9] text-[#B43E3E]"
  if (row.orderRecommended) return "bg-[#FBF1E0] text-[#A8741A]"
  return "bg-[#ECFDF5] text-[#084734]"
}

function confidenceCopy(value: HardwareCrmOrderCandidate["confidence"]) {
  if (value === "high") return "높음"
  if (value === "medium") return "보통"
  return "검토"
}

function confidenceClass(value: HardwareCrmOrderCandidate["confidence"]) {
  if (value === "high") return "bg-[#ECFDF5] text-[#084734]"
  if (value === "medium") return "bg-[#FBF1E0] text-[#A8741A]"
  return "bg-[#F6F5F4] text-[#615D59]"
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#615D59]">{label}</p>
          <p className="mt-2 text-[26px] font-bold leading-none tracking-[-0.03em] text-[#111110]">{value}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#ECFDF5] text-[#084734]">
          {icon}
        </div>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-[#615D59]">{hint}</p>
    </div>
  )
}

export default function HardwareInventoryClient() {
  const formRef = useRef<HTMLFormElement | null>(null)
  const [data, setData] = useState<HardwareDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingMovement, setPendingMovement] = useState<HardwareMovementDraft | null>(null)
  const [crmCandidates, setCrmCandidates] = useState<HardwareCrmOrderCandidate[]>([])
  const [crmWarnings, setCrmWarnings] = useState<string[]>([])
  const [crmError, setCrmError] = useState<string | null>(null)
  const [crmLoading, setCrmLoading] = useState(false)
  const [selectedCrmCandidateId, setSelectedCrmCandidateId] = useState<string | null>(null)
  const [crmAutoReflect, setCrmAutoReflect] = useState(true)

  const [activePresetKey, setActivePresetKey] = useState("sale")
  const [movementType, setMovementType] = useState<HardwareMovementType>("outbound")
  const [selectedItemId, setSelectedItemId] = useState("")
  const [customProduct, setCustomProduct] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [occurredAt, setOccurredAt] = useState(todayKey)
  const [fromLocation, setFromLocation] = useState("창고")
  const [toLocation, setToLocation] = useState("고객")
  const [owner, setOwner] = useState("")
  const [status, setStatus] = useState("출고")
  const [referenceNo, setReferenceNo] = useState("")
  const [memo, setMemo] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await adminFetchJson<HardwareDashboard>("/api/admin/hardware", { cache: "no-cache" })
      setData(next)
      setSelectedItemId((current) => current || next.items[0]?.id || "")
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const selectedItem = useMemo(
    () => data?.items.find((item) => item.id === selectedItemId) ?? null,
    [data?.items, selectedItemId]
  )

  const activePreset = useMemo(
    () => ENTRY_PRESETS.find((preset) => preset.key === activePresetKey) ?? ENTRY_PRESETS[0],
    [activePresetKey]
  )

  const locationTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const row of data?.stock ?? []) {
      for (const location of row.locationBalances) {
        if (location.quantity <= 0) continue
        totals.set(location.location, (totals.get(location.location) ?? 0) + location.quantity)
      }
    }
    return LOCATION_OPTIONS.map((location) => ({
      location,
      quantity: totals.get(location) ?? 0,
    }))
  }, [data?.stock])

  const maxLocationTotal = useMemo(
    () => Math.max(1, ...locationTotals.map((location) => location.quantity)),
    [locationTotals]
  )

  const applyPreset = (presetKey: string) => {
    const preset = ENTRY_PRESETS.find((item) => item.key === presetKey)
    if (!preset) return
    setActivePresetKey(preset.key)
    setMovementType(preset.movementType)
    setFromLocation(preset.from)
    setToLocation(preset.to)
    setStatus(preset.status)
  }

  const prepareQuickEntry = (itemId: string, presetKey: string) => {
    setSelectedItemId(itemId)
    setCustomProduct("")
    setQuantity("1")
    applyPreset(presetKey)
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  const adjustQuantity = (delta: number) => {
    setQuantity((current) => String(Math.max(1, Number(current || 0) + delta)))
  }

  const matrixQuantity = (row: HardwareStockRow, location: string) => {
    if (location === "배송 예정") return row.plannedOut
    return row.locationBalances.find((item) => item.location === location)?.quantity ?? 0
  }

  const selectedCrmCandidate = useMemo(
    () => crmCandidates.find((candidate) => candidate.id === selectedCrmCandidateId) ?? null,
    [crmCandidates, selectedCrmCandidateId]
  )

  const refresh = async () => {
    clearAdminRequestCache()
    await load()
  }

  const importSheet = async () => {
    setBusy("import")
    setNotice(null)
    setError(null)
    try {
      const result = await adminFetchJson<{
        import: { imported: number; skipped: number }
        sync: { inbound: number; outbound: number; stock: number; sales: number } | null
      }>("/api/admin/hardware/import-sheet", {
        method: "POST",
        body: JSON.stringify({ sync: true }),
      })
      setNotice(`시트 이관 완료: 원장 ${formatNumber(result.import.imported)}건 반영`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const buildMovementDraft = (): HardwareMovementDraft => {
    const productName = customProduct.trim() || selectedItem?.name || ""
    return {
      itemId: customProduct.trim() ? undefined : selectedItemId,
      productName,
      movementType,
      quantity: Number(quantity),
      occurredAt,
      fromLocation,
      toLocation,
      owner,
      status,
      referenceNo,
      memo,
      serials: [],
    }
  }

  const openCrmConfirmation = async (draft: HardwareMovementDraft) => {
    setPendingMovement(draft)
    setCrmCandidates([])
    setCrmWarnings([])
    setCrmError(null)
    setSelectedCrmCandidateId(null)
    setCrmAutoReflect(true)
    setCrmLoading(true)

    try {
      const params = new URLSearchParams({
        productName: draft.productName,
        quantity: String(draft.quantity),
      })
      const result = await adminFetchJson<HardwareCrmOrderCandidatesResponse>(
        `/api/admin/hardware/crm-orders?${params.toString()}`,
        { cache: "no-cache" }
      )
      setCrmCandidates(result.candidates)
      setCrmWarnings(result.warnings ?? [])
      setSelectedCrmCandidateId(result.candidates[0]?.id ?? null)
      setCrmAutoReflect(result.candidates.length > 0)
    } catch (err) {
      setCrmError(err instanceof Error ? err.message : String(err))
      setCrmAutoReflect(false)
    } finally {
      setCrmLoading(false)
    }
  }

  const closeCrmConfirmation = () => {
    if (busy === "movement") return
    setPendingMovement(null)
    setCrmCandidates([])
    setCrmWarnings([])
    setCrmError(null)
    setSelectedCrmCandidateId(null)
  }

  const createMovementFromDraft = async (
    draft: HardwareMovementDraft,
    crmCandidate: HardwareCrmOrderCandidate | null
  ) => {
    setBusy("movement")
    setNotice(null)
    setError(null)
    try {
      const linkedMemo = crmCandidate
        ? [draft.memo, `CRM 연동: ${crmCandidate.sourceLabel} · ${crmCandidate.title}`].filter(Boolean).join("\n")
        : draft.memo

      await adminFetchJson("/api/admin/hardware/movements", {
        method: "POST",
        body: JSON.stringify({
          ...draft,
          referenceNo: crmCandidate && !draft.referenceNo ? crmCandidate.referenceNo : draft.referenceNo,
          memo: linkedMemo,
          crmLink: crmCandidate
            ? {
                id: crmCandidate.id,
                source: crmCandidate.source,
                sourceLabel: crmCandidate.sourceLabel,
                referenceNo: crmCandidate.referenceNo,
                title: crmCandidate.title,
                href: crmCandidate.href,
                confidence: crmCandidate.confidence,
              }
            : undefined,
        }),
      })
      setNotice(
        `${draft.productName} · ${activePreset.label} ${formatNumber(draft.quantity)}대를 기록했습니다.${
          crmCandidate ? " CRM 오더와 연결했습니다." : ""
        }`
      )
      setQuantity("1")
      setMemo("")
      setPendingMovement(null)
      await refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setCrmError(message)
    } finally {
      setBusy(null)
    }
  }

  const submitMovement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const draft = buildMovementDraft()
    if (!draft.productName.trim()) {
      setError("품목을 선택하거나 새 품목을 입력하세요.")
      return
    }
    if (!Number.isInteger(draft.quantity) || draft.quantity <= 0) {
      setError("수량은 1 이상 정수여야 합니다.")
      return
    }
    if (draft.movementType === "outbound") {
      await openCrmConfirmation(draft)
      return
    }
    await createMovementFromDraft(draft, null)
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] pb-24">
      <header className="border-b border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 pb-6 pt-6 sm:px-6 lg:px-9 lg:pt-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#615D59]">
              <span>ADMIN</span>
              <span className="opacity-50">›</span>
              <span>Operations</span>
            </div>
            <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-[-0.02em] text-[#111110] sm:text-[30px]">
              하드웨어 재고
            </h1>
            <p className="mt-2 max-w-[760px] text-[13px] leading-relaxed text-[#615D59]">
              시트 누적 데이터를 원장으로 가져오고, 이후 입고·출고·반납·이동을 어드민에서 바로 기록합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading || busy != null}
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              새로고침
            </button>
            <button
              type="button"
              onClick={() => void importSheet()}
              disabled={busy != null}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#084734] px-3 py-2 text-[12px] font-bold text-white transition hover:bg-[#065c41] disabled:opacity-60"
            >
              <UploadCloud className={`h-3.5 w-3.5 ${busy === "import" ? "animate-pulse" : ""}`} />
              시트 가져오기
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 pt-6 sm:px-6 lg:px-9">
        {error && (
          <div className="mb-4 rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-3 text-[13px] font-semibold text-[#8F2C2C]">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-4 rounded-lg border border-[#BDEFD8] bg-[#ECFDF5] px-4 py-3 text-[13px] font-semibold text-[#084734]">
            {notice}
          </div>
        )}

        {loading && !data ? (
          <div className="grid gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-32 animate-pulse rounded-xl bg-[#F0EFEC]" />
            ))}
          </div>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                icon={<Boxes className="h-4 w-4" />}
                label="실제 가용"
                value={`${formatNumber(data?.totals.warehouseStock ?? 0)}대`}
                hint="지금 실제로 창고에 남아 있는 수량입니다."
              />
              <StatCard
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="예상 가용"
                value={`${formatNumber(data?.totals.availableStock ?? 0)}대`}
                hint="배송 예정 수량을 차감한 예상치입니다."
              />
              <StatCard
                icon={<TrendingDown className="h-4 w-4" />}
                label="30일 출고"
                value={`${formatNumber(data?.totals.outbound30d ?? 0)}대`}
                hint={`주문 검토 품목 ${formatNumber(data?.totals.orderRecommended ?? 0)}개`}
              />
              <StatCard
                icon={<AlertTriangle className="h-4 w-4" />}
                label="부족 알림"
                value={`${formatNumber(data?.totals.lowItems ?? 0)}개`}
                hint={`배송 예정 ${formatNumber(data?.totals.plannedOut ?? 0)}대 반영 중`}
              />
            </section>

            <section className="mt-6 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
                <div>
                  <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">재고 위치 맵</h2>
                  <p className="mt-1 text-[12px] text-[#615D59]">창고 가용, 배송 예정, 고객 판매 완료, 샘플/사무실/수리 재고를 한 줄에서 확인합니다.</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ENTRY_PRESETS.slice(0, 4).map((preset) => {
                    const PresetIcon = preset.icon
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => applyPreset(preset.key)}
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-bold transition ${
                          activePresetKey === preset.key
                            ? "bg-[#084734] text-white"
                            : "bg-[#F6F5F4] text-[#31302E] hover:bg-[#ECFDF5] hover:text-[#084734]"
                        }`}
                      >
                        <PresetIcon className="h-3.5 w-3.5" />
                        {preset.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="grid gap-0 lg:grid-cols-[290px_minmax(0,1fr)]">
                <div className="border-b border-[rgba(0,0,0,0.08)] p-5 lg:border-b-0 lg:border-r">
                  <p className="text-[12px] font-bold text-[#111110]">위치별 총량</p>
                  <div className="mt-3 space-y-3">
                    {locationTotals.map((location) => (
                      <div key={location.location}>
                        <div className="flex items-center justify-between gap-3 text-[12px]">
                          <span className="font-semibold text-[#31302E]">{location.location}</span>
                          <span className="font-bold text-[#111110]">{formatNumber(location.quantity)}대</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#F0EFEC]">
                          <div
                            className="h-full rounded-full bg-[#084734]"
                            style={{ width: location.quantity > 0 ? `${Math.max(4, Math.round((location.quantity / maxLocationTotal) * 100))}%` : "0%" }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <div className="min-w-[760px] divide-y divide-[rgba(0,0,0,0.06)]">
                    {(data?.stock ?? []).length === 0 ? (
                      <p className="px-5 py-10 text-center text-[13px] text-[#615D59]">시트 가져오기 또는 입고 기록 후 위치 맵이 표시됩니다.</p>
                    ) : (
                      data?.stock.slice(0, 12).map((row) => {
                        const rowMax = Math.max(1, ...LOCATION_MATRIX.map((location) => matrixQuantity(row, location.key)))
                        return (
                          <div key={row.itemId} className="grid gap-4 px-5 py-4 lg:grid-cols-[210px_minmax(0,1fr)_152px] lg:items-center">
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-bold text-[#111110]">{row.product}</p>
                              <p className="mt-1 text-[11px] text-[#615D59]">
                                예상 가용 {formatNumber(row.availableStock)}대 · 30일 {formatNumber(row.outbound30d)}대
                              </p>
                            </div>
                            <div className="grid grid-cols-6 gap-2">
                              {LOCATION_MATRIX.map((location) => {
                                const qty = matrixQuantity(row, location.key)
                                const width = qty > 0 ? Math.max(12, Math.round((qty / rowMax) * 100)) : 0
                                return (
                                  <div key={location.key} className="min-w-0">
                                    <div className="flex items-center justify-between gap-1 text-[10.5px]">
                                      <span className="truncate font-semibold text-[#615D59]">{location.label}</span>
                                      <span className="font-bold text-[#111110]">{formatNumber(qty)}</span>
                                    </div>
                                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#F0EFEC]">
                                      <div className={`h-full rounded-full ${location.tone}`} style={{ width: `${width}%` }} />
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => prepareQuickEntry(row.itemId, "sale")}
                                className="rounded-md bg-[#F6F5F4] px-2.5 py-1.5 text-[11px] font-bold text-[#31302E] transition hover:bg-[#FCE9E9] hover:text-[#B43E3E]"
                              >
                                출고
                              </button>
                              <button
                                type="button"
                                onClick={() => prepareQuickEntry(row.itemId, "planned")}
                                className="rounded-md bg-[#F6F5F4] px-2.5 py-1.5 text-[11px] font-bold text-[#31302E] transition hover:bg-[#FBF1E0] hover:text-[#A8741A]"
                              >
                                예정
                              </button>
                              <button
                                type="button"
                                onClick={() => prepareQuickEntry(row.itemId, "inbound")}
                                className="rounded-md bg-[#F6F5F4] px-2.5 py-1.5 text-[11px] font-bold text-[#31302E] transition hover:bg-[#ECFDF5] hover:text-[#084734]"
                              >
                                입고
                              </button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
              <div className="space-y-6">
                <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
                    <div>
                      <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">현재 재고</h2>
                      <p className="mt-1 text-[12px] text-[#615D59]">
                        최소재고와 최근 출고량을 같이 보고 주문 시점을 판단합니다.
                      </p>
                    </div>
                    <p className="text-[11px] text-[#615D59]">
                      마지막 이관 {data?.importRun?.finished_at ? formatDate(data.importRun.finished_at) : "없음"}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[1040px] w-full border-collapse text-left">
                      <thead className="bg-[#F6F5F4] text-[11px] font-bold uppercase tracking-[0.05em] text-[#615D59]">
                        <tr>
                          <th className="px-5 py-3">품목</th>
                          <th className="px-4 py-3 text-right">실제</th>
                          <th className="px-4 py-3 text-right">배송 예정</th>
                          <th className="px-4 py-3 text-right">예상</th>
                          <th className="px-4 py-3 text-right">30일</th>
                          <th className="px-4 py-3">위치</th>
                          <th className="px-4 py-3 text-right">빠른 처리</th>
                          <th className="px-5 py-3 text-right">상태</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[rgba(0,0,0,0.06)]">
                        {(data?.stock ?? []).length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-5 py-10 text-center text-[13px] text-[#615D59]">
                              아직 하드웨어 원장 데이터가 없습니다. 시트 가져오기를 먼저 실행하세요.
                            </td>
                          </tr>
                        ) : (
                          data?.stock.map((row) => (
                            <tr key={row.itemId} className="align-top">
                              <td className="px-5 py-4">
                                <p className="text-[13px] font-bold text-[#111110]">{row.product}</p>
                                <p className="mt-1 text-[11px] text-[#615D59]">
                                  {row.category ?? "미분류"} · 최소 {row.reorderPoint}대 · 리드타임 {row.leadTimeDays}일
                                </p>
                              </td>
                              <td className="px-4 py-4 text-right text-[14px] font-bold text-[#111110]">
                                {formatNumber(row.warehouseStock)}
                              </td>
                              <td className="px-4 py-4 text-right text-[13px] font-semibold text-[#A8741A]">
                                {formatNumber(row.plannedOut)}
                              </td>
                              <td className="px-4 py-4 text-right text-[16px] font-bold tracking-[-0.02em] text-[#111110]">
                                {formatNumber(row.availableStock)}
                              </td>
                              <td className="px-4 py-4 text-right">
                                <p className="text-[13px] font-semibold text-[#111110]">{formatNumber(row.outbound30d)}</p>
                                <p className="mt-1 text-[10.5px] text-[#615D59]">주 {formatAvg(row.weeklyOutboundAvg)}대</p>
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex max-w-[260px] flex-wrap gap-1.5">
                                  {row.locationBalances.slice(0, 3).map((loc) => (
                                    <span key={loc.location} className="inline-flex items-center gap-1 rounded-full bg-[#F6F5F4] px-2 py-1 text-[10.5px] font-semibold text-[#31302E]">
                                      <MapPin className="h-3 w-3 text-[#615D59]" />
                                      {loc.location} {formatNumber(loc.quantity)}
                                    </span>
                                  ))}
                                  {row.locationBalances.length > 3 && (
                                    <span className="rounded-full bg-[#ECFDF5] px-2 py-1 text-[10.5px] font-semibold text-[#084734]">
                                      +{row.locationBalances.length - 3}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <div className="inline-flex rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-0.5">
                                  <button
                                    type="button"
                                    onClick={() => prepareQuickEntry(row.itemId, "sale")}
                                    className="rounded px-2 py-1 text-[10.5px] font-bold text-[#B43E3E] transition hover:bg-white"
                                  >
                                    출고
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => prepareQuickEntry(row.itemId, "planned")}
                                    className="rounded px-2 py-1 text-[10.5px] font-bold text-[#A8741A] transition hover:bg-white"
                                  >
                                    예정
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => prepareQuickEntry(row.itemId, "inbound")}
                                    className="rounded px-2 py-1 text-[10.5px] font-bold text-[#084734] transition hover:bg-white"
                                  >
                                    입고
                                  </button>
                                </div>
                              </td>
                              <td className="px-5 py-4 text-right">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${statusClass(row)}`}>
                                  {statusCopy(row)}
                                </span>
                                {row.daysUntilStockout != null && (
                                  <p className="mt-1.5 text-[10.5px] text-[#615D59]">예상 {row.daysUntilStockout}일</p>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <div className="border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
                    <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">나간 기록</h2>
                    <p className="mt-1 text-[12px] text-[#615D59]">최근 출고/배송 예정 기준으로 어디로 갔는지 확인합니다.</p>
                  </div>
                  <div className="divide-y divide-[rgba(0,0,0,0.06)]">
                    {(data?.recentOutbound ?? []).length === 0 ? (
                      <p className="px-5 py-8 text-center text-[13px] text-[#615D59]">출고 기록이 없습니다.</p>
                    ) : (
                      data?.recentOutbound.slice(0, 12).map((movement) => (
                        <div key={movement.id} className="grid gap-3 px-5 py-3.5 md:grid-cols-[1.1fr_1fr_120px] md:items-center">
                          <div>
                            <p className="text-[13px] font-bold text-[#111110]">{movement.product_name}</p>
                            <p className="mt-1 text-[11px] text-[#615D59]">
                              {formatDate(movement.occurred_at)} · {movement.owner ?? "담당자 미정"}
                            </p>
                          </div>
                          <p className="text-[12px] font-semibold text-[#31302E]">
                            {movement.to_location ?? "도착지 미정"}
                            {movement.status ? <span className="ml-2 text-[#A8741A]">{movement.status}</span> : null}
                          </p>
                          <p className="text-right text-[14px] font-bold text-[#111110]">{formatNumber(movement.quantity)}대</p>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>

              <aside className="space-y-6">
                <form ref={formRef} onSubmit={(event) => void submitMovement(event)} className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <div className="border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
                    <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">빠른 입출고</h2>
                    <p className="mt-1 text-[12px] text-[#615D59]">판매 출고, 배송 예정, 입고, 샘플 대여를 한 화면에서 기록합니다.</p>
                  </div>
                  <div className="space-y-4 p-5">
                    <div className="grid grid-cols-2 gap-2">
                      {ENTRY_PRESETS.map((option) => {
                        const Icon = option.icon
                        const active = activePresetKey === option.key
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => applyPreset(option.key)}
                            className={`rounded-lg border px-3 py-2.5 text-left transition ${
                              active
                                ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                                : "border-[rgba(0,0,0,0.08)] bg-white text-[#31302E] hover:bg-[#F6F5F4]"
                            }`}
                          >
                            <span className="flex items-center gap-2 text-[12px] font-bold">
                              <Icon className="h-3.5 w-3.5" />
                              {option.label}
                            </span>
                            <span className="mt-1 block text-[10.5px] text-[#615D59]">{option.description}</span>
                          </button>
                        )
                      })}
                    </div>

                    <label className="block">
                      <span className="text-[11px] font-bold text-[#615D59]">품목</span>
                      <select
                        value={selectedItemId}
                        onChange={(event) => {
                          setSelectedItemId(event.target.value)
                          setCustomProduct("")
                        }}
                        className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] font-semibold text-[#111110] outline-none focus:border-[#084734]"
                      >
                        {(data?.items ?? []).map((item) => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="text-[11px] font-bold text-[#615D59]">새 품목 직접 입력</span>
                      <input
                        value={customProduct}
                        onChange={(event) => setCustomProduct(event.target.value)}
                        placeholder="예: OPS 케이블"
                        className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none placeholder:text-[#A39E98] focus:border-[#084734]"
                      />
                    </label>

                    {(data?.stock ?? []).length > 0 && (
                      <div>
                        <span className="text-[11px] font-bold text-[#615D59]">추천 품목</span>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {data?.stock.slice(0, 5).map((row) => (
                            <button
                              key={row.itemId}
                              type="button"
                              onClick={() => {
                                setSelectedItemId(row.itemId)
                                setCustomProduct("")
                              }}
                              className={`rounded-full border px-2.5 py-1 text-[10.5px] font-bold transition ${
                                selectedItemId === row.itemId && !customProduct.trim()
                                  ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                                  : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#31302E] hover:bg-white"
                              }`}
                            >
                              {row.product} · 예상 {formatNumber(row.availableStock)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[11px] font-bold text-[#615D59]">수량</span>
                        <div className="mt-1 grid h-10 grid-cols-[38px_minmax(0,1fr)_38px] rounded-md border border-[rgba(0,0,0,0.08)] bg-white">
                          <button
                            type="button"
                            onClick={() => adjustQuantity(-1)}
                            className="flex items-center justify-center text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110]"
                            aria-label="수량 줄이기"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            value={quantity}
                            onChange={(event) => setQuantity(event.target.value)}
                            className="h-full w-full border-x border-[rgba(0,0,0,0.08)] px-2 text-center text-[14px] font-bold text-[#111110] outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => adjustQuantity(1)}
                            className="flex items-center justify-center text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110]"
                            aria-label="수량 늘리기"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-1.5 grid grid-cols-4 gap-1">
                          {QUICK_QUANTITIES.map((nextQuantity) => (
                            <button
                              key={nextQuantity}
                              type="button"
                              onClick={() => setQuantity(String(nextQuantity))}
                              className={`rounded border px-1.5 py-1 text-[10.5px] font-bold transition ${
                                Number(quantity) === nextQuantity
                                  ? "border-[#084734] bg-[#ECFDF5] text-[#084734]"
                                  : "border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] text-[#615D59] hover:bg-white"
                              }`}
                            >
                              {nextQuantity}
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className="block">
                        <span className="text-[11px] font-bold text-[#615D59]">처리일</span>
                        <input
                          type="date"
                          value={occurredAt}
                          onChange={(event) => setOccurredAt(event.target.value)}
                          className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none focus:border-[#084734]"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="text-[11px] font-bold text-[#615D59]">출발</span>
                        <input
                          value={fromLocation}
                          onChange={(event) => setFromLocation(event.target.value)}
                          placeholder="창고"
                          list="hardware-location-options"
                          className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none placeholder:text-[#A39E98] focus:border-[#084734]"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-bold text-[#615D59]">도착</span>
                        <input
                          value={toLocation}
                          onChange={(event) => setToLocation(event.target.value)}
                          placeholder="고객/창고/샘플/사무실"
                          list="hardware-location-options"
                          className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none placeholder:text-[#A39E98] focus:border-[#084734]"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="text-[11px] font-bold text-[#615D59]">담당자</span>
                        <input
                          value={owner}
                          onChange={(event) => setOwner(event.target.value)}
                          className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none focus:border-[#084734]"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-bold text-[#615D59]">상태</span>
                        <input
                          value={status}
                          onChange={(event) => setStatus(event.target.value)}
                          className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none focus:border-[#084734]"
                        />
                      </label>
                    </div>

                    <label className="block">
                      <span className="text-[11px] font-bold text-[#615D59]">참조 번호</span>
                      <input
                        value={referenceNo}
                        onChange={(event) => setReferenceNo(event.target.value)}
                        placeholder="물류No. 또는 내부 번호"
                        className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none placeholder:text-[#A39E98] focus:border-[#084734]"
                      />
                    </label>

                    <datalist id="hardware-location-options">
                      {LOCATION_OPTIONS.map((location) => (
                        <option key={location} value={location} />
                      ))}
                    </datalist>

                    <label className="block">
                      <span className="text-[11px] font-bold text-[#615D59]">메모</span>
                      <textarea
                        value={memo}
                        onChange={(event) => setMemo(event.target.value)}
                        rows={3}
                        className="mt-1 w-full resize-none rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2 text-[13px] text-[#111110] outline-none focus:border-[#084734]"
                      />
                    </label>

                    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-3 py-2.5">
                      <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#615D59]">입력 미리보기</p>
                      <p className="mt-1 text-[13px] font-bold text-[#111110]">
                        {customProduct.trim() || selectedItem?.name || "품목 선택"} · {activePreset.label} · {formatNumber(Number(quantity) || 0)}대
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-[#615D59]">
                        {fromLocation || "-"} → {toLocation || "-"} · {status || "상태 미정"}
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={busy != null || (!customProduct.trim() && !selectedItem)}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#084734] px-4 text-[13px] font-bold text-white transition hover:bg-[#065c41] disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      기록 저장
                    </button>
                  </div>
                </form>

                <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <div className="border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
                    <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">알림</h2>
                    <p className="mt-1 text-[12px] text-[#615D59]">부족, 주문 검토, 배송 예정 항목입니다.</p>
                  </div>
                  <div className="space-y-2 p-4">
                    {(data?.alerts ?? []).length === 0 ? (
                      <div className="rounded-lg bg-[#ECFDF5] px-4 py-3 text-[12px] font-semibold text-[#084734]">
                        현재 알림이 없습니다.
                      </div>
                    ) : (
                      data?.alerts.map((alert) => (
                        <div key={alert.id} className={`rounded-lg border px-3 py-2.5 ${ALERT_TONE[alert.severity]}`}>
                          <p className="text-[12px] font-bold">{alert.product} · {alert.title}</p>
                          <p className="mt-1 text-[11px] opacity-80">{alert.detail}</p>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <div className="border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
                    <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">최근 원장</h2>
                  </div>
                  <div className="divide-y divide-[rgba(0,0,0,0.06)]">
                    {(data?.movements ?? []).slice(0, 10).map((movement) => (
                      <div key={movement.id} className="px-5 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-[12.5px] font-bold text-[#111110]">{movement.product_name}</p>
                            <p className="mt-1 text-[11px] text-[#615D59]">
                              {formatDate(movement.occurred_at)} · {movement.to_location ?? movement.from_location ?? "위치 미정"}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${MOVEMENT_TONE[movement.movement_type]}`}>
                            {MOVEMENT_LABEL[movement.movement_type]} {formatNumber(movement.quantity)}
                          </span>
                        </div>
                      </div>
                    ))}
                    {(data?.movements ?? []).length === 0 && (
                      <p className="px-5 py-8 text-center text-[13px] text-[#615D59]">원장 기록이 없습니다.</p>
                    )}
                  </div>
                </section>
              </aside>
            </section>
          </>
        )}
      </main>

      {pendingMovement && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 px-3 py-4 backdrop-blur-[2px] sm:items-center">
          <section className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
            <div className="flex items-start justify-between gap-4 border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
              <div>
                <h2 className="text-[16px] font-bold tracking-[-0.01em] text-[#111110]">CRM 실제 오더 확인</h2>
                <p className="mt-1 text-[12px] leading-relaxed text-[#615D59]">
                  출고 기록을 저장하기 전에 CRM 오더와 자동 반영할지 확인합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCrmConfirmation}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110]"
                aria-label="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[calc(92vh-150px)] overflow-y-auto px-5 py-4">
              <div className="grid gap-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-3 sm:grid-cols-3">
                <div>
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#615D59]">기록 예정</p>
                  <p className="mt-1 text-[13px] font-bold text-[#111110]">{pendingMovement.productName}</p>
                </div>
                <div>
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#615D59]">수량/상태</p>
                  <p className="mt-1 text-[13px] font-bold text-[#111110]">
                    {formatNumber(pendingMovement.quantity)}대 · {pendingMovement.status || MOVEMENT_LABEL[pendingMovement.movementType]}
                  </p>
                </div>
                <div>
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#615D59]">위치</p>
                  <p className="mt-1 text-[13px] font-bold text-[#111110]">
                    {pendingMovement.fromLocation || "-"} → {pendingMovement.toLocation || "-"}
                  </p>
                </div>
              </div>

              <label className="mt-4 flex items-start gap-3 rounded-lg border border-[#BDEFD8] bg-[#ECFDF5] px-3 py-3">
                <input
                  type="checkbox"
                  checked={crmAutoReflect}
                  onChange={(event) => setCrmAutoReflect(event.target.checked)}
                  disabled={crmCandidates.length === 0}
                  className="mt-0.5 h-4 w-4 accent-[#084734]"
                />
                <span>
                  <span className="block text-[13px] font-bold text-[#084734]">CRM 실제 오더와 연동해서 기록</span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[#084734]/75">
                    선택한 CRM 후보의 참조번호와 링크가 하드웨어 원장에 같이 저장됩니다.
                  </span>
                </span>
              </label>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[13px] font-bold text-[#111110]">매칭 후보</h3>
                  {crmLoading ? <span className="text-[11px] font-semibold text-[#615D59]">CRM 확인 중...</span> : null}
                </div>

                {crmError && (
                  <div className="mt-2 rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2 text-[12px] font-semibold text-[#8F2C2C]">
                    {crmError}
                  </div>
                )}

                {crmWarnings.length > 0 && (
                  <div className="mt-2 rounded-lg border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[12px] font-semibold text-[#7A520F]">
                    {crmWarnings.slice(0, 2).join(" / ")}
                  </div>
                )}

                <div className="mt-2 space-y-2">
                  {crmLoading ? (
                    Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className="h-20 animate-pulse rounded-lg bg-[#F0EFEC]" />
                    ))
                  ) : crmCandidates.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] px-4 py-8 text-center">
                      <p className="text-[13px] font-bold text-[#111110]">매칭되는 CRM 오더가 없습니다.</p>
                      <p className="mt-1 text-[12px] text-[#615D59]">연동 없이 하드웨어 원장에만 기록할 수 있습니다.</p>
                    </div>
                  ) : (
                    crmCandidates.map((candidate) => {
                      const selected = selectedCrmCandidateId === candidate.id
                      return (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() => {
                            setSelectedCrmCandidateId(candidate.id)
                            setCrmAutoReflect(true)
                          }}
                          className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                            selected
                              ? "border-[#084734] bg-[#ECFDF5]"
                              : "border-[rgba(0,0,0,0.08)] bg-white hover:bg-[#F6F5F4]"
                          }`}
                        >
                          <span className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[13px] font-bold text-[#111110]">{candidate.title}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${confidenceClass(candidate.confidence)}`}>
                                  매칭 {confidenceCopy(candidate.confidence)}
                                </span>
                              </span>
                              <span className="mt-1 block text-[11.5px] leading-relaxed text-[#615D59]">
                                {candidate.sourceLabel} · {candidate.productName ?? "품목 미상"} · {candidate.quantity != null ? `${formatNumber(candidate.quantity)}대` : "수량 미상"}
                              </span>
                              <span className="mt-1 block text-[11.5px] text-[#615D59]">
                                {candidate.customerName ?? "고객 미상"} · {candidate.owner ?? "담당자 미상"} · {candidate.status ?? "상태 미상"}
                              </span>
                            </span>
                            <span className="shrink-0 text-left sm:text-right">
                              <span className="block text-[12px] font-bold text-[#111110]">{formatCurrency(candidate.amount)}</span>
                              <span className="mt-1 block text-[10.5px] text-[#615D59]">{formatDate(candidate.occurredAt)}</span>
                            </span>
                          </span>
                          <span className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-[#084734]">
                            <Link2 className="h-3.5 w-3.5" />
                            {candidate.reason}
                            {candidate.href ? (
                              <span className="inline-flex items-center gap-1 text-[#615D59]">
                                <ExternalLink className="h-3 w-3" />
                                CRM에서 확인 가능
                              </span>
                            ) : null}
                          </span>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => void createMovementFromDraft(pendingMovement, null)}
                disabled={busy === "movement"}
                className="inline-flex h-10 items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-4 text-[13px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] disabled:opacity-60"
              >
                연동 없이 기록
              </button>
              <button
                type="button"
                onClick={() => void createMovementFromDraft(pendingMovement, crmAutoReflect ? selectedCrmCandidate : null)}
                disabled={busy === "movement" || crmLoading || (crmAutoReflect && !selectedCrmCandidate)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#084734] px-4 text-[13px] font-bold text-white transition hover:bg-[#065c41] disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {crmAutoReflect ? "CRM 연동 후 기록" : "기록 저장"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
