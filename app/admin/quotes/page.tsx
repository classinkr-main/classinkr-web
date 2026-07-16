"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  ChevronDown,
  ClipboardList,
  FileSignature,
  FileText,
  Plus,
  Ticket,
  Users,
} from "lucide-react"

import HardwareQuotesPanel from "@/components/admin/documents/HardwareQuotesPanel"
import SoftwareQuoteCodesPanel from "@/components/admin/documents/SoftwareQuoteCodesPanel"
import { ContractsPanel } from "@/components/admin/documents/ContractsPanel"
import { ReceiptsPanel } from "@/components/admin/documents/ReceiptsPanel"
import type { QuickQuotePrefill } from "@/components/portal/quotes/QuickQuoteComposer"
import type { StandardQuoteTemplateId } from "@/lib/standard-quote-template"

type DocumentTab = "hardware" | "software" | "contracts" | "receipts"
type HardwareQuoteQuickAction = "new" | StandardQuoteTemplateId
type HardwareQuoteQuickActionRequest = {
  key: string
  action: HardwareQuoteQuickAction
} | null

interface DocumentTabItem {
  key: DocumentTab
  label: string
  description: string
  icon: ReactNode
}

const DOCUMENT_TABS: DocumentTabItem[] = [
  {
    key: "hardware",
    label: "하드웨어 견적서",
    description: "품목, 수량, 계약 전환까지 이어지는 매출 견적",
    icon: <FileText className="h-4 w-4" />,
  },
  {
    key: "software",
    label: "SW 견적 코드",
    description: "체크아웃으로 이어지는 1회성 결제 코드",
    icon: <Ticket className="h-4 w-4" />,
  },
  {
    key: "contracts",
    label: "계약서",
    description: "서명 완료와 계약 확정 상태 관리",
    icon: <FileSignature className="h-4 w-4" />,
  },
  {
    key: "receipts",
    label: "영수증",
    description: "수납 확인, 현금영수증, PDF 발행 기록",
    icon: <ClipboardList className="h-4 w-4" />,
  },
  // "공유 링크"(links) coming-soon 탭은 제거 — 열람수·발송 상태는 하드웨어 견적 행 단위로 이미 제공된다.
  // 구 딥링크(tab=links|shares)는 normalizeDocumentTab의 hardware 폴백이 흡수한다.
]

// href는 렌더에서 소비되지 않는 미사용 필드라 제거 — 북마크 호환은 stub 라우트(redirect)가 담당한다.
const QUICK_QUOTE_ACTIONS: Array<{
  action: HardwareQuoteQuickAction
  label: string
  description: string
}> = [
  {
    action: "new",
    label: "빠른 견적 작성",
    description: "리드 없이 고객명만 입력해 견적을 바로 만듭니다.",
  },
  {
    action: "recording_studio",
    label: "녹화 세트 견적",
    description: "86형 보드, T1, 벽걸이, 자동 녹화 1년 패키지",
  },
  {
    action: "online_suite",
    label: "AI Suite 견적",
    description: "월 구독형 통합 학원 패키지 견적",
  },
]

function normalizeDocumentTab(raw: string | null): DocumentTab {
  if (raw === "software" || raw === "software-code" || raw === "sw") return "software"
  if (raw === "contract" || raw === "contracts") return "contracts"
  if (raw === "receipt" || raw === "receipts") return "receipts"

  return "hardware"
}

function normalizeHardwareQuoteAction(raw: string | null): HardwareQuoteQuickAction | null {
  if (!raw) return null
  if (raw === "new" || raw === "quick" || raw === "quote") return "new"
  if (
    raw === "recording_studio" ||
    raw === "online_suite" ||
    raw === "board_86" ||
    raw === "board_75" ||
    raw === "camera_t1"
  ) {
    return raw
  }
  return null
}

function tabFromParams(params: Pick<URLSearchParams, "get">) {
  return normalizeDocumentTab(params.get("tab") ?? params.get("type"))
}

function tabFromSearch() {
  if (typeof window === "undefined") return "hardware" as DocumentTab
  return tabFromParams(new URLSearchParams(window.location.search))
}

function quickActionFromParams(params: Pick<URLSearchParams, "get" | "toString">): HardwareQuoteQuickActionRequest {
  const action = normalizeHardwareQuoteAction(params.get("action") ?? params.get("quick"))
  if (!action) return null
  return {
    action,
    key: params.toString(),
  }
}

function quickActionFromSearch() {
  if (typeof window === "undefined") return null
  return quickActionFromParams(new URLSearchParams(window.location.search))
}

function prefillFromParams(params: Pick<URLSearchParams, "get">): QuickQuotePrefill | null {
  const dealId = params.get("dealId") ?? params.get("deal")
  const customerId = params.get("customerId") ?? params.get("customer")
  const customerName = params.get("customerName")
  // customerName만 있어도(리드/NEO 딥링크: 고객명 프리필) 신규 고객 이름을 채우도록 통과시킨다.
  if (!dealId && !customerId && !customerName) return null
  return {
    dealId: dealId || null,
    customerId: customerId || null,
    customerName: customerName || null,
  }
}

function prefillFromSearch() {
  if (typeof window === "undefined") return null
  return prefillFromParams(new URLSearchParams(window.location.search))
}

function QuoteCreateButton({
  onSelect,
}: {
  onSelect: (action: HardwareQuoteQuickAction) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => onSelect("new")}
          className="inline-flex h-9 items-center gap-1.5 rounded-l-md bg-[#084734] px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-1"
        >
          <Plus className="h-4 w-4" />
          견적서 작성
        </button>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="견적 템플릿 선택"
          className="inline-flex h-9 items-center rounded-r-md border-l border-white/20 bg-[#084734] px-2 text-white transition-colors hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-1"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-[#e8e8e4] bg-white p-1 shadow-[rgba(0,0,0,0.04)_0px_4px_18px,rgba(0,0,0,0.05)_0px_8px_28px]"
        >
          {QUICK_QUOTE_ACTIONS.map((item) => (
            <button
              key={item.action}
              type="button"
              role="menuitem"
              onClick={() => {
                onSelect(item.action)
                setOpen(false)
              }}
              className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#ECFDF5]"
            >
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#ECFDF5] text-[#084734]">
                <FileText className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-[#111110]">{item.label}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-[#1a1a1a]/50">
                  {item.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function QuotesPage() {
  const quickActionSequenceRef = useRef(0)
  const [activeTab, setActiveTab] = useState<DocumentTab>(() => tabFromSearch())
  const [prefill] = useState<QuickQuotePrefill | null>(() => prefillFromSearch())
  const [hardwareQuickAction, setHardwareQuickAction] = useState<HardwareQuoteQuickActionRequest>(() => {
    const fromSearch = quickActionFromSearch()
    if (fromSearch) return fromSearch
    // 딜/고객 프리필로 진입하면 작성기를 자동으로 연다(action 파라미터가 없어도).
    if (prefillFromSearch()) return { action: "new", key: "prefill-open" }
    return null
  })

  const handleTabChange = (tab: DocumentTab) => {
    setActiveTab(tab)
    setHardwareQuickAction(null)

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      url.searchParams.set("tab", tab)
      url.searchParams.delete("action")
      url.searchParams.delete("quick")
      window.history.replaceState(null, "", url.toString())
    }
  }

  const openHardwareQuickAction = (action: HardwareQuoteQuickAction) => {
    quickActionSequenceRef.current += 1
    setActiveTab("hardware")
    setHardwareQuickAction({
      action,
      key: `manual-${action}-${quickActionSequenceRef.current}`,
    })

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href)
      url.searchParams.set("tab", "hardware")
      url.searchParams.set("action", action)
      window.history.replaceState(null, "", url.toString())
    }
  }

  // 견적 행 "계약 전환"은 HardwareQuotesPanel이 V2 convert 라우트로 직접 처리한다
  // (딜·고객 FK 연결 + stage 전진 + 태스크 완료) — 레거시 계약 폼 프리필 브리지는 폐기됨.

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="border-b border-[#e8e8e4] bg-white px-4 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <h1 className="text-lg font-bold tracking-[-0.02em] text-[#111110] sm:text-xl">
              견적·문서
            </h1>
            <span className="hidden truncate text-[12px] text-[#1a1a1a]/45 sm:inline">
              견적 · 계약 · 수납을 한 흐름으로
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/admin/crm"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#e8e8e4] bg-white px-3 text-[12px] font-medium text-[#1a1a1a]/60 transition-colors hover:border-[#c8c8c4] hover:text-[#111110]"
            >
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">CRM 고객</span>
            </a>
            <QuoteCreateButton onSelect={openHardwareQuickAction} />
          </div>
        </div>

        <div className="admin-scroll-snap-x no-scrollbar -mb-px mt-3 flex gap-0.5 overflow-x-auto">
          {DOCUMENT_TABS.map((tab) => {
            const active = activeTab === tab.key

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                title={tab.description}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-[13px] font-semibold transition-colors ${
                  active
                    ? "border-[#084734] text-[#111110]"
                    : "border-transparent text-[#1a1a1a]/45 hover:text-[#111110]"
                }`}
              >
                <span className={active ? "text-[#084734]" : "text-[#1a1a1a]/40"}>{tab.icon}</span>
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="px-0 py-0">
        {activeTab === "hardware" && (
          <HardwareQuotesPanel
            quickAction={hardwareQuickAction}
            onQuickActionConsumed={() => setHardwareQuickAction(null)}
            prefill={prefill}
          />
        )}
        {activeTab === "software" && <SoftwareQuoteCodesPanel />}
        {activeTab === "contracts" && <ContractsPanel />}
        {activeTab === "receipts" && <ReceiptsPanel />}
      </div>
    </div>
  )
}
