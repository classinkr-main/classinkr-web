"use client"

import { useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Check,
  Clock,
  Lock,
  Pencil,
  ShieldCheck,
  TriangleAlert,
  Undo2,
} from "lucide-react"

import {
  formatAmountDelta,
  formatAmountValue,
  formatClock,
  formatSeconds,
  orderRiskName,
} from "@/lib/admin-ai/format"
import {
  canEditOrder,
  canUndoOrder,
  isClosedOrderState,
  ORDER_GRACE_MS,
  remainingMs,
  type OrderAction,
} from "@/lib/admin-ai/order-state"
import type { OrderField, OrderTicket } from "@/lib/admin-ai/types"
import { AiButton, aiButtonClass, CardNote, CardShell, type CardTone } from "./CardShell"

function toneOf(order: OrderTicket): CardTone {
  if (order.state === "failed") return "danger"
  if (order.risk === "R1") return "green"
  if (order.risk === "R2") return "warn"
  if (order.risk === "R3") return "danger"
  if (order.risk === "R4") return "dark"
  return "neutral"
}

const INPUT_CLASS =
  "w-full rounded-md border border-[#E5E5E0] bg-white px-2 py-[5px] text-[12px] text-[#111110] focus:border-transparent focus:outline focus:outline-2 focus:-outline-offset-1 focus:outline-[#084734]"

function FieldRow({
  field,
  muted,
  editing,
  draftValue,
  onDraftChange,
}: {
  field: OrderField
  muted: boolean
  editing: boolean
  draftValue?: string
  onDraftChange?: (value: string) => void
}) {
  const numeric = field.numeric ? "tabular-nums" : ""
  const editable = editing && field.editable

  const value = editable ? (
    <input
      value={draftValue ?? field.value}
      onChange={(event) => onDraftChange?.(event.target.value)}
      aria-label={field.label}
      className={`${INPUT_CLASS} min-w-0 flex-[1_1_120px] ${numeric}`}
    />
  ) : (
    <span
      className={`${numeric} ${
        field.previous !== undefined
          ? muted
            ? "font-medium text-[#615D59]"
            : "font-semibold text-[#111110]"
          : ""
      }`}
    >
      {field.value}
    </span>
  )

  return (
    <div className="grid min-h-[34px] grid-cols-[64px_minmax(0,1fr)] items-center gap-2.5 border-b border-[#F0F0EC] py-1.5 text-[12px] @max-[300px]:grid-cols-1 @max-[300px]:gap-px @max-[300px]:py-[7px]">
      <dt className="text-[#A39E98] @max-[300px]:text-[11px]">{field.label}</dt>
      <dd
        className={`flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 ${
          muted ? "text-[#615D59]" : "text-[#111110]"
        }`}
      >
        {field.previous !== undefined ? (
          <>
            {/* 이전 값은 흐리게만 — 취소선은 한글에서 읽기 어렵다. */}
            <span className={`text-[#A39E98] ${numeric}`}>{field.previous}</span>
            <ArrowRight className="h-3 w-3 shrink-0 text-[#A39E98]" aria-label="에서" />
          </>
        ) : null}
        {value}
        {!editable && field.verified ? (
          <Check className="h-3 w-3 text-[#084734]" aria-label="확인됨" />
        ) : null}
        {!editable && field.hint ? (
          <small className="text-[11px] text-[#A39E98]">{field.hint}</small>
        ) : null}
        {!editable && field.edited ? (
          <span className="text-[10px] font-semibold text-[#084734]">수정됨</span>
        ) : null}
      </dd>
    </div>
  )
}

function AmountBlock({ order, muted }: { order: OrderTicket; muted: boolean }) {
  const amount = order.amount
  if (!amount) return null
  const delta = formatAmountDelta(amount)

  return (
    <div className="flex items-end justify-between gap-3 rounded-lg border border-[#F0F0EC] bg-[#FAFAF8] px-3 py-2.5">
      <div className="text-[11px] text-[#A39E98]">
        금액
        <b className="block text-[12px] font-semibold text-[#111110]">{amount.label}</b>
      </div>
      <div className="text-right leading-[1.25] tabular-nums">
        {amount.previous !== undefined ? (
          <span className="block text-[11px] text-[#A39E98]">
            <span className="mr-1 text-[10px] font-semibold tracking-[0.06em]">{amount.currency}</span>
            {formatAmountValue(amount.previous)}
          </span>
        ) : null}
        {/* 통화 코드는 항상 붙인다 — 네오CRM·REV 금액은 위안화다. */}
        <span className="mr-1 text-[10px] font-semibold tracking-[0.06em] text-[#A39E98]">
          {amount.currency}
        </span>
        <span
          className={`text-[18px] font-bold tracking-[-0.02em] ${
            muted ? "text-[#615D59]" : "text-[#111110]"
          }`}
        >
          {formatAmountValue(amount.value)}
        </span>
        {delta ? <span className="block text-[11px] text-[#615D59]">{delta} · 서버 계산</span> : null}
      </div>
    </div>
  )
}

function StatusLine({
  tone,
  icon,
  children,
  clock,
}: {
  tone: "wait" | "ok" | "bad" | "off" | "plain"
  icon?: React.ReactNode
  children: React.ReactNode
  clock?: string
}) {
  const color = {
    wait: "text-[#7A520F]",
    ok: "text-[#084734]",
    bad: "text-[#8F2C2C]",
    off: "text-[#A39E98]",
    plain: "text-[#615D59]",
  }[tone]

  return (
    <div className={`flex min-h-5 items-center gap-[7px] text-[12px] font-semibold ${color}`}>
      {icon ?? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
      <span>{children}</span>
      {clock ? (
        <span className="ml-auto whitespace-nowrap text-[11px] font-medium tabular-nums text-[#A39E98] @max-[300px]:hidden">
          {clock}
        </span>
      ) : null}
    </div>
  )
}

function MetaLine({ order }: { order: OrderTicket }) {
  const parts: React.ReactNode[] = []
  if (order.capabilityLabel) {
    parts.push(
      <span key="cap" className="inline-flex items-center gap-1">
        <Lock className="h-[11px] w-[11px]" aria-hidden="true" />
        권한 · {order.capabilityLabel}
      </span>
    )
  }
  if (order.risk === "R3") {
    parts.push(<span key="grace">확인 뒤 30초 동안 취소할 수 있음</span>)
  } else if (order.undo === "window") {
    parts.push(<span key="undo">실행 뒤 10분 동안 되돌릴 수 있음</span>)
  } else if (order.undo === "previous-version") {
    parts.push(<span key="undo">되돌리기 · {order.undoNote ?? "이전 버전으로 복귀"}</span>)
  } else {
    parts.push(
      <span key="undo" className="font-semibold text-[#7A520F]">
        실행 뒤 되돌릴 수 없음
      </span>
    )
    if (order.undoNote) parts.push(<span key="note">{order.undoNote}</span>)
  }

  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-[3px] text-[11px] text-[#A39E98]">
      {parts.map((part, index) => (
        <span key={index} className="inline-flex items-center gap-1.5">
          {index > 0 ? <i className="h-0.5 w-0.5 rounded-full bg-[#A39E98]" /> : null}
          {part}
        </span>
      ))}
    </p>
  )
}

function OpenLink({ order }: { order: OrderTicket }) {
  if (!order.openLabel || !order.target.href) return null
  return (
    <Link href={order.target.href} className={aiButtonClass("secondary")}>
      {order.openLabel}
    </Link>
  )
}

/** 수정 중 — 입력값은 이 컴포넌트가 들고 있다가 "수정 완료" 때만 오더에 반영한다. */
function OrderCardEditor({
  order,
  onAction,
}: {
  order: OrderTicket
  onAction: (action: OrderAction) => void
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(order.fields.filter((field) => field.editable).map((f) => [f.key, f.value]))
  )
  const [message, setMessage] = useState(order.message?.text ?? "")

  return (
    <CardShell
      icon={order.icon}
      title={order.title}
      target={order.target}
      riskCode={order.risk}
      riskName={orderRiskName(order)}
      tone={toneOf(order)}
      locked
      footer={
        <>
          <StatusLine
            tone="plain"
            icon={<Pencil className="h-[13px] w-[13px]" aria-hidden="true" />}
            clock="대상은 바꿀 수 없음"
          >
            수정 중
          </StatusLine>
          <div className="flex flex-wrap gap-1.5">
            <AiButton
              variant="primary"
              onClick={() =>
                onAction({
                  type: "save-edit",
                  values,
                  message: order.message ? message : undefined,
                })
              }
            >
              수정 완료
            </AiButton>
            <AiButton variant="ghost" onClick={() => onAction({ type: "revert-edit" })}>
              수정 취소
            </AiButton>
          </div>
        </>
      }
    >
      <AmountBlock order={order} muted={false} />
      {order.fields.length > 0 ? (
        <dl className="flex flex-col border-t border-[#F0F0EC]">
          {order.fields.map((field) => (
            <FieldRow
              key={field.key}
              field={field}
              muted={false}
              editing
              draftValue={values[field.key]}
              onDraftChange={(value) => setValues((prev) => ({ ...prev, [field.key]: value }))}
            />
          ))}
        </dl>
      ) : null}
      {order.message ? (
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          aria-label="문구"
          className={`${INPUT_CLASS} block min-h-[84px] resize-y leading-[1.5]`}
        />
      ) : null}
    </CardShell>
  )
}

const CLOSED_LABEL: Partial<Record<OrderTicket["state"], string>> = {
  cancelled: "취소됨 · 아무것도 바뀌지 않았습니다",
  undone: "되돌림 · 원래대로 돌렸습니다",
  aborted: "발송 취소됨 · 나간 메시지 없음",
  expired: "만료됨 · 15분 동안 확인하지 않음",
}

export function OrderCard({
  order,
  now,
  onAction,
}: {
  order: OrderTicket
  now: number
  onAction: (action: OrderAction) => void
}) {
  if (order.state === "editing") {
    // key 로 수정 세션마다 입력값을 새로 시작한다.
    return <OrderCardEditor key={`${order.id}-edit`} order={order} onAction={onAction} />
  }

  const closed = isClosedOrderState(order.state)
  const left = remainingMs(order, now)

  let footer: React.ReactNode
  if (order.state === "draft") {
    footer = (
      <>
        <StatusLine tone="wait" clock={left === null ? undefined : `${formatClock(left)} 뒤 만료`}>
          확인 대기
        </StatusLine>
        <div className="flex flex-wrap gap-1.5">
          {/* 확인 버튼에 자동 포커스를 주지 않는다 — Enter 연타로 실행되는 것을 막는다. */}
          <AiButton
            variant={order.risk === "R3" ? "danger" : "primary"}
            onClick={() => onAction({ type: "confirm" })}
          >
            {order.confirmLabel}
          </AiButton>
          {canEditOrder(order) ? (
            <AiButton onClick={() => onAction({ type: "edit" })}>
              {order.message ? "문구 수정" : "수정"}
            </AiButton>
          ) : null}
          <AiButton variant="ghost" onClick={() => onAction({ type: "cancel" })}>
            취소
          </AiButton>
        </div>
        <MetaLine order={order} />
      </>
    )
  } else if (order.state === "grace") {
    const ratio = left === null ? 0 : Math.max(0, Math.min(1, left / ORDER_GRACE_MS))
    footer = (
      <>
        <div className="absolute inset-x-0 -top-px h-0.5 bg-[#F0F0EC]">
          <i
            className="block h-full origin-left bg-[#B43E3E] transition-transform duration-1000 ease-linear motion-reduce:transition-none"
            style={{ transform: `scaleX(${ratio})` }}
          />
        </div>
        <StatusLine tone="bad">
          <span className="tabular-nums">{left === null ? "" : formatSeconds(left)}</span>초 뒤 발송
        </StatusLine>
        <div className="flex flex-wrap gap-1.5">
          <AiButton onClick={() => onAction({ type: "abort" })}>발송 취소</AiButton>
        </div>
      </>
    )
  } else if (order.state === "done") {
    const undoable = canUndoOrder(order, now)
    footer = (
      <>
        <StatusLine tone="ok" icon={<Check className="h-[13px] w-[13px]" aria-hidden="true" />}>
          완료 · {order.doneText}
        </StatusLine>
        {undoable || (order.openLabel && order.target.href) ? (
          <div className="flex flex-wrap gap-1.5">
            <OpenLink order={order} />
            {undoable ? (
              <AiButton variant="ghost" onClick={() => onAction({ type: "undo" })}>
                <Undo2 className="h-[13px] w-[13px]" aria-hidden="true" />
                되돌리기
                {order.undo === "window" && left !== null ? (
                  <span className="ml-0.5 font-medium tabular-nums opacity-75">
                    {formatClock(left)}
                  </span>
                ) : null}
              </AiButton>
            ) : null}
          </div>
        ) : null}
        {order.undo === "none" ? (
          <p className="text-[11px] text-[#A39E98]">
            되돌릴 수 없음{order.undoNote ? ` · ${order.undoNote}` : ""}
          </p>
        ) : null}
      </>
    )
  } else if (order.state === "sent") {
    footer = (
      <>
        <StatusLine tone="ok" icon={<Check className="h-[13px] w-[13px]" aria-hidden="true" />}>
          발송됨
        </StatusLine>
        <p className="text-[11px] text-[#A39E98]">되돌릴 수 없음</p>
      </>
    )
  } else if (order.state === "failed") {
    footer = (
      <>
        <StatusLine
          tone="bad"
          icon={<TriangleAlert className="h-[13px] w-[13px]" aria-hidden="true" />}
        >
          실패{order.failure?.note ? ` · ${order.failure.note}` : ""}
        </StatusLine>
        <div className="flex flex-wrap gap-1.5">
          <OpenLink order={order} />
          <AiButton variant="ghost" onClick={() => onAction({ type: "redraft" })}>
            다시 작성
          </AiButton>
        </div>
      </>
    )
  } else {
    footer = (
      <>
        <StatusLine
          tone="off"
          icon={
            order.state === "undone" ? (
              <Undo2 className="h-[13px] w-[13px]" aria-hidden="true" />
            ) : order.state === "expired" ? (
              <Clock className="h-[13px] w-[13px]" aria-hidden="true" />
            ) : undefined
          }
        >
          {CLOSED_LABEL[order.state]}
        </StatusLine>
        <div className="flex flex-wrap gap-1.5">
          <AiButton onClick={() => onAction({ type: "redraft" })}>다시 작성</AiButton>
        </div>
      </>
    )
  }

  return (
    <CardShell
      icon={order.icon}
      title={order.title}
      target={order.target}
      riskCode={order.risk}
      riskName={orderRiskName(order)}
      tone={toneOf(order)}
      muted={closed}
      footer={footer}
    >
      <AmountBlock order={order} muted={closed} />
      {order.fields.length > 0 ? (
        <dl className="flex flex-col border-t border-[#F0F0EC]">
          {order.fields.map((field) => (
            <FieldRow key={field.key} field={field} muted={closed} editing={false} />
          ))}
        </dl>
      ) : null}
      {order.message ? (
        <div className="rounded-lg border border-[#F0F0EC] bg-[#FAFAF8] px-[11px] py-[9px] text-[12px] text-[#31302E]">
          <h5 className="mb-1 text-[10px] font-semibold tracking-[0.06em] text-[#A39E98]">
            미리보기 · {order.message.text.length}자
            {order.message.edited ? (
              <span className="ml-1 text-[#084734]">· 수정됨</span>
            ) : null}
          </h5>
          <p>{order.message.text}</p>
        </div>
      ) : null}
      {order.state === "failed" && order.failure ? (
        // 실패 사유는 면으로 강조한다(DESIGN.md — 경고·오류는 배경 채움 허용).
        <div className="flex items-start gap-2 rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-[11px] py-[9px] text-[12px] font-medium text-[#8F2C2C]">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{order.failure.reason}</span>
        </div>
      ) : null}
      {order.untouched && !closed && order.state !== "failed" ? (
        <CardNote icon={<ShieldCheck className="h-3 w-3" aria-hidden="true" />}>
          건드리지 않음 · {order.untouched}
        </CardNote>
      ) : null}
    </CardShell>
  )
}
