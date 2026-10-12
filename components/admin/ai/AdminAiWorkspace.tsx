"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, LayoutGrid, List, Lock, MessageSquare, Plus } from "lucide-react"

import { formatClock, formatTimeOfDay } from "@/lib/admin-ai/format"
import {
  ADMIN_AI_TOOLS,
  FORBIDDEN_ORDER_LABELS,
  ORDER_CATALOG,
} from "@/lib/admin-ai/order-catalog"
import { canUndoOrder, isPendingOrder, remainingMs } from "@/lib/admin-ai/order-state"
import {
  adminAiStore,
  selectOrders,
  selectPendingOrders,
  type AdminAiState,
} from "@/lib/admin-ai/store"
import { ADMIN_AI_TABS, type AdminAiTab } from "@/lib/admin-ai/tabs"
import type { OrderState, OrderTicket } from "@/lib/admin-ai/types"
import { AdminAiComposer } from "./AdminAiComposer"
import { AdminAiConversation } from "./AdminAiConversation"
import { AdminAiHome, RiskTag } from "./AdminAiHome"
import { AiButton } from "./cards/CardShell"
import { GalmaebotAvatar } from "./GalmaebotAvatar"
import { useAdminAiState } from "./use-admin-ai"

const TAB_META: Record<AdminAiTab, { label: string; icon: typeof List }> = {
  chat: { label: "대화", icon: MessageSquare },
  orders: { label: "오더함", icon: List },
  tools: { label: "AI 도구", icon: LayoutGrid },
  catalog: { label: "오더 카탈로그", icon: Lock },
}

// 이 탭 자체가 맥락이면 추천이 비므로, 대화는 어드민 공통 맥락으로 시작한다.
const WORKSPACE_CONTEXT = { path: "/admin/ai", label: "AI 올인원" }

const STATE_META: Record<OrderState, { label: string; tone: string }> = {
  draft: { label: "확인 대기", tone: "text-[#A8741A]" },
  editing: { label: "수정 중", tone: "text-[#A8741A]" },
  grace: { label: "유예 중", tone: "text-[#B43E3E]" },
  done: { label: "완료", tone: "text-[#084734]" },
  sent: { label: "발송됨", tone: "text-[#084734]" },
  failed: { label: "실패", tone: "text-[#B43E3E]" },
  cancelled: { label: "취소됨", tone: "text-[#A39E98]" },
  undone: { label: "되돌림", tone: "text-[#A39E98]" },
  aborted: { label: "발송 취소됨", tone: "text-[#A39E98]" },
  expired: { label: "만료됨", tone: "text-[#A39E98]" },
}

function OrderStateText({ order, now }: { order: OrderTicket; now: number }) {
  const meta = STATE_META[order.state]
  const left = order.state === "grace" ? remainingMs(order, now) : null
  return (
    <span className={`inline-flex items-center gap-[7px] text-[12px] font-semibold ${meta.tone}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      <span className="tabular-nums">
        {meta.label}
        {left !== null ? ` ${formatClock(left)}` : ""}
        {order.state === "failed" && order.failure ? ` — ${order.failure.reason}` : ""}
      </span>
    </span>
  )
}

function ChatPane({
  state,
  onShowPending,
}: {
  state: AdminAiState
  onShowPending: () => void
}) {
  const orders = selectOrders(state)
  const pending = selectPendingOrders(state)
  const counts = {
    pending: pending.length,
    grace: orders.filter((order) => order.state === "grace").length,
    done: orders.filter((order) => order.state === "done" || order.state === "sent").length,
    failed: orders.filter((order) => order.state === "failed").length,
  }
  const recent = orders
    .filter((order) => !isPendingOrder(order) && order.state !== "grace")
    .slice(-3)
    .reverse()

  return (
    <div className="grid min-h-[560px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col">
        <div className="flex min-h-0 flex-1 flex-col px-[clamp(16px,4vw,48px)] py-6">
          {state.messages.length === 0 ? (
            <div className="mx-auto w-full max-w-[460px]">
              <AdminAiHome
                context={WORKSPACE_CONTEXT}
                pendingCount={pending.length}
                onShowPending={onShowPending}
              />
            </div>
          ) : (
            <AdminAiConversation state={state} className="mx-auto w-full max-w-[620px]" />
          )}
        </div>
        <div className="px-[clamp(16px,4vw,48px)] pb-5">
          <AdminAiComposer
            busy={state.busy}
            context={WORKSPACE_CONTEXT}
            className="mx-auto w-full max-w-[620px]"
          />
        </div>
      </div>

      <aside className="flex flex-col gap-3.5 border-t border-[#E8E8E4] p-[18px] lg:border-l lg:border-t-0">
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold tracking-[0.1em] text-[#A39E98]">
            이번 접속의 오더
          </h4>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[#E8E8E4] bg-[#E8E8E4]">
            {(
              [
                ["확인 대기", counts.pending, "text-[#A8741A]"],
                ["유예 중", counts.grace, "text-[#B43E3E]"],
                ["완료", counts.done, "text-[#111110]"],
                ["실패", counts.failed, "text-[#B43E3E]"],
              ] as const
            ).map(([label, value, tone]) => (
              <div key={label} className="bg-white px-3 py-[11px]">
                <dd
                  className={`text-[20px] font-bold tracking-[-0.02em] tabular-nums ${
                    value > 0 ? tone : "text-[#A39E98]"
                  }`}
                >
                  {value}
                </dd>
                <dt className="text-[11px] text-[#615D59]">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold tracking-[0.1em] text-[#A39E98]">
            방금 처리한 오더
          </h4>
          {recent.length === 0 ? (
            <p className="text-[12px] text-[#A39E98]">아직 없습니다.</p>
          ) : (
            <ul>
              {recent.map((order) => (
                <li key={order.id} className="border-t border-[#F0F0EC] py-2 text-[12px]">
                  <span className="block text-[#111110]">
                    {order.title} · {order.target.label}
                  </span>
                  <OrderStateText order={order} now={state.now} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}

function OrdersPane({ state }: { state: AdminAiState }) {
  const orders = selectOrders(state).slice().reverse()

  if (orders.length === 0) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-1 px-6 text-center">
        <b className="text-[13px] font-semibold text-[#111110]">아직 오더가 없습니다</b>
        <p className="max-w-[44ch] text-[12px] text-[#615D59]">
          갈매봇에게 오더를 내리면 확인 대기 · 실행 · 되돌리기 이력이 여기에 쌓입니다. 지금은 이번
          접속 동안 만든 오더만 보입니다.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto px-6 pb-4 pt-5">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr>
              {["시각", "오더", "대상", "등급", "상태", ""].map((label) => (
                <th
                  key={label || "actions"}
                  scope="col"
                  className="whitespace-nowrap border-b border-[#E8E8E4] px-2.5 py-2 text-left text-[11px] font-semibold text-[#A39E98]"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const undoLeft = order.state === "done" ? remainingMs(order, state.now) : null
              return (
                <tr key={order.id}>
                  <td className="border-b border-[#F0F0EC] px-2.5 py-[11px] tabular-nums text-[#615D59]">
                    {formatTimeOfDay(order.createdAt)}
                  </td>
                  <td className="border-b border-[#F0F0EC] px-2.5 py-[11px] font-semibold text-[#111110]">
                    {order.title}
                  </td>
                  <td className="border-b border-[#F0F0EC] px-2.5 py-[11px] text-[#111110]">
                    {order.target.label}
                  </td>
                  <td className="border-b border-[#F0F0EC] px-2.5 py-[11px]">
                    <RiskTag risk={order.risk} sensitive={order.sensitive} />
                  </td>
                  <td className="border-b border-[#F0F0EC] px-2.5 py-[11px]">
                    <OrderStateText order={order} now={state.now} />
                  </td>
                  <td className="whitespace-nowrap border-b border-[#F0F0EC] px-2.5 py-[11px] text-right">
                    {order.state === "draft" ? (
                      <span className="inline-flex gap-1.5">
                        <AiButton
                          variant={order.risk === "R3" ? "danger" : "primary"}
                          className="!px-[9px] !py-1"
                          onClick={() => adminAiStore.actOnOrder(order.id, { type: "confirm" })}
                        >
                          확인
                        </AiButton>
                        <AiButton
                          variant="ghost"
                          className="!px-[9px] !py-1"
                          onClick={() => adminAiStore.actOnOrder(order.id, { type: "cancel" })}
                        >
                          취소
                        </AiButton>
                      </span>
                    ) : order.state === "grace" ? (
                      <AiButton
                        className="!px-[9px] !py-1"
                        onClick={() => adminAiStore.actOnOrder(order.id, { type: "abort" })}
                      >
                        발송 취소
                      </AiButton>
                    ) : canUndoOrder(order, state.now) ? (
                      <AiButton
                        className="!px-[9px] !py-1"
                        onClick={() => adminAiStore.actOnOrder(order.id, { type: "undo" })}
                      >
                        되돌리기
                        {order.undo === "window" && undoLeft !== null ? (
                          <span className="font-normal tabular-nums text-[#A39E98]">
                            {formatClock(undoLeft)}
                          </span>
                        ) : null}
                      </AiButton>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="px-6 pb-6 text-[12px] text-[#A39E98]">
        지금은 이번 접속 동안 만든 오더만 보입니다. 오더 이력 저장과 감사 로그는 서버 오더 엔진과
        함께 붙습니다.
      </p>
    </>
  )
}

function ToolsPane() {
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3.5 px-6 pb-2 pt-[22px]">
        {ADMIN_AI_TOOLS.map((tool) => (
          <Link
            key={tool.href + tool.label}
            href={tool.href}
            className="flex flex-col gap-1.5 rounded-xl border border-[#E8E8E4] bg-white p-4 transition hover:shadow-[0_4px_18px_rgba(0,0,0,0.04),0_2px_7.8px_rgba(0,0,0,0.027),0_0.8px_2.9px_rgba(0,0,0,0.02)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734]"
          >
            <span className="font-mono text-[11px] text-[#A39E98]">{tool.href}</span>
            <b className="text-[14px] text-[#111110]">{tool.label}</b>
            <p className="text-[12px] text-[#615D59]">{tool.description}</p>
            <span className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-[#084734]">
              열기 <ArrowRight className="h-[13px] w-[13px]" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>
      <p className="px-6 pb-6 pt-1.5 text-[12px] text-[#A39E98]">
        바로가기 모음입니다. 기능을 이 탭으로 옮기지 않으며 각 화면이 계속 정본입니다.
      </p>
    </>
  )
}

function CatalogPane() {
  return (
    <>
      <div className="overflow-x-auto px-6 pb-4 pt-5">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr>
              {["도메인", "오더", "등급", "확인", "되돌리기", "필요 역할"].map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="whitespace-nowrap border-b border-[#E8E8E4] px-2.5 py-2 text-left text-[11px] font-semibold text-[#A39E98]"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ORDER_CATALOG.map((entry) => (
              <tr key={entry.id}>
                <td className="border-b border-[#F0F0EC] px-2.5 py-[11px] text-[#615D59]">
                  {entry.domain}
                </td>
                <td className="border-b border-[#F0F0EC] px-2.5 py-[11px] font-semibold text-[#111110]">
                  {entry.label}
                </td>
                <td className="border-b border-[#F0F0EC] px-2.5 py-[11px]">
                  <RiskTag risk={entry.risk} sensitive={entry.sensitive} />
                </td>
                <td className="border-b border-[#F0F0EC] px-2.5 py-[11px] text-[#111110]">
                  {entry.confirm}
                </td>
                <td className="border-b border-[#F0F0EC] px-2.5 py-[11px] text-[#111110]">
                  {entry.undo}
                  {entry.undoNote ? (
                    <small className="ml-1 text-[11px] text-[#A39E98]">{entry.undoNote}</small>
                  ) : null}
                </td>
                <td className="border-b border-[#F0F0EC] px-2.5 py-[11px] text-[#111110]">
                  {entry.roles}
                </td>
              </tr>
            ))}
            <tr>
              <td className="border-b border-[#F0F0EC] px-2.5 py-[11px] text-[#615D59]">—</td>
              <td className="border-b border-[#F0F0EC] px-2.5 py-[11px] text-[#615D59]">
                {FORBIDDEN_ORDER_LABELS.join(" · ")}
              </td>
              <td className="border-b border-[#F0F0EC] px-2.5 py-[11px]">
                <RiskTag risk="R4" />
              </td>
              <td colSpan={3} className="border-b border-[#F0F0EC] px-2.5 py-[11px] text-[#615D59]">
                오더로 실행하지 않음 — 해당 화면에서 직접
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="px-6 pb-6 text-[12px] text-[#A39E98]">
        「무엇을 시킬 수 있나」의 단일 기준입니다. 등급은 코드에 고정되며 갈매봇이 바꾸지 못합니다.
      </p>
    </>
  )
}

export default function AdminAiWorkspace({ initialTab }: { initialTab: AdminAiTab }) {
  const router = useRouter()
  const state = useAdminAiState()
  const [tab, setTab] = useState<AdminAiTab>(initialTab)
  const pendingCount = selectPendingOrders(state).length
  const demo = adminAiStore.mode === "demo"

  const select = (next: AdminAiTab) => {
    setTab(next)
    // 새로고침·공유에도 같은 탭이 열리도록 주소만 맞춘다(화면 전환은 이미 끝났다).
    router.replace(next === "chat" ? "/admin/ai" : `/admin/ai?tab=${next}`, { scroll: false })
  }

  return (
    <div className="flex flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E8E8E4] bg-[#FAFAF8] px-5 pb-[18px] pt-6 lg:px-8">
        <div className="flex items-center gap-3.5">
          <GalmaebotAvatar variant="full" size={52} />
          <div>
            <h1 className="text-[24px] font-bold leading-[1.15] tracking-[-0.02em] text-[#111110] lg:text-[30px]">
              AI 올인원
            </h1>
            <p className="mt-1 text-[12px] text-[#A39E98]">
              갈매봇에게 묻기 · 오더 · AI 도구를 한 곳에서
              {demo ? (
                <span className="ml-2 font-semibold text-[#A8741A]">시안 · 샘플 데이터</span>
              ) : null}
            </p>
          </div>
        </div>
        <AiButton
          variant="primary"
          onClick={() => {
            adminAiStore.newConversation()
            select("chat")
          }}
        >
          <Plus className="h-[15px] w-[15px]" aria-hidden="true" />새 대화
        </AiButton>
      </header>

      <div
        role="tablist"
        aria-label="AI 올인원 하위 탭"
        className="flex flex-wrap gap-1 border-b border-[#E8E8E4] bg-[#F6F5F4] px-3 py-2 lg:px-5"
      >
        {ADMIN_AI_TABS.map((key) => {
          const meta = TAB_META[key]
          const Icon = meta.icon
          const selected = tab === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => select(key)}
              className={`inline-flex min-h-[38px] items-center gap-[7px] rounded-lg px-3.5 text-[13px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] ${
                selected ? "bg-[#111110] text-white" : "text-[#1a1a1a]/55 hover:text-[#111110]"
              }`}
            >
              <Icon className="h-[15px] w-[15px]" aria-hidden="true" />
              {meta.label}
              {key === "orders" && pendingCount > 0 ? (
                <span className="text-[11px] tabular-nums opacity-70">{pendingCount}</span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" className="bg-white">
        {tab === "chat" ? (
          <ChatPane state={state} onShowPending={() => select("orders")} />
        ) : null}
        {tab === "orders" ? <OrdersPane state={state} /> : null}
        {tab === "tools" ? <ToolsPane /> : null}
        {tab === "catalog" ? <CatalogPane /> : null}
      </div>
    </div>
  )
}
