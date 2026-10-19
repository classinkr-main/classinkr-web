import type { CSSProperties, ReactNode } from "react"
import {
  CalendarDays,
  CircleHelp,
  CreditCard,
  Lock,
  MessageSquare,
  Package,
  ReceiptText,
  Search,
  Send,
  SquareCheck,
  User,
  type LucideIcon,
} from "lucide-react"

import type { OrderIcon, OrderTarget } from "@/lib/admin-ai/types"

const ICONS: Record<OrderIcon, LucideIcon> = {
  task: SquareCheck,
  note: MessageSquare,
  lead: User,
  calendar: CalendarDays,
  send: Send,
  payment: CreditCard,
  stock: Package,
  amount: ReceiptText,
  search: Search,
  lock: Lock,
  help: CircleHelp,
}

export type CardTone = "neutral" | "green" | "warn" | "danger" | "dark" | "closed"

// DESIGN.md §2 — 상태 스케일과 웜 뉴트럴만 쓴다.
const TONE_COLOR: Record<CardTone, string> = {
  neutral: "#A39E98",
  green: "#084734",
  warn: "#A8741A",
  danger: "#B43E3E",
  dark: "#31302E",
  closed: "#E8E8E4",
}

/**
 * 갈매봇 카드의 공통 껍데기 — 머리(무엇을 · 누구에게 · 등급) + 본문 + 하단.
 * 등급 표시는 머리 옆의 짧은 세로 막대 하나다. 카드 모서리를 따라 휘는 선은 쓰지 않는다.
 * 폭이 300px 보다 좁은 자리에서는 아이콘을 빼고 이름표를 값 위로 올린다(@container).
 */
export function CardShell({
  icon,
  title,
  target,
  riskCode,
  riskName,
  tone,
  muted = false,
  locked = false,
  children,
  footer,
}: {
  icon: OrderIcon
  title: string
  target: OrderTarget
  riskCode?: string
  riskName?: string
  tone: CardTone
  /** 닫힌 카드 — 통째로 흐리게 하지 않고 강조만 뺀다. */
  muted?: boolean
  /** 수정 중 — 대상은 고칠 수 없음을 자물쇠로 알린다. */
  locked?: boolean
  children?: ReactNode
  footer?: ReactNode
}) {
  const Icon = ICONS[icon]
  const color = muted ? TONE_COLOR.closed : TONE_COLOR[tone]

  return (
    <article
      style={{ "--oc-risk": color } as CSSProperties}
      className={`@container relative min-w-0 rounded-xl border border-[#E8E8E4] text-left before:absolute before:-left-px before:top-[13px] before:h-[30px] before:w-[3px] before:rounded-r-[3px] before:bg-[var(--oc-risk)] before:content-[''] ${
        muted ? "bg-[#FDFDFC]" : "bg-white"
      }`}
    >
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 py-3 pl-4 pr-3.5 @max-[300px]:grid-cols-[minmax(0,1fr)_auto] @max-[300px]:pl-3.5">
        <span
          className={`flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[#F6F5F4] @max-[300px]:hidden ${
            muted ? "text-[#A39E98]" : "text-[#31302E]"
          }`}
        >
          <Icon className="h-[15px] w-[15px]" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h4
            className={`text-[13px] font-semibold leading-[1.3] ${
              muted ? "text-[#615D59]" : "text-[#111110]"
            }`}
          >
            {title}
          </h4>
          <p className="text-[12px] leading-[1.4] text-[#615D59]">
            <strong className={`font-semibold ${muted ? "text-[#615D59]" : "text-[#111110]"}`}>
              {target.label}
            </strong>
            {" · "}
            {target.meta}
            {locked ? (
              <Lock
                className="ml-1.5 inline h-[11px] w-[11px] align-[-1px] text-[#A39E98]"
                aria-label="대상은 바꿀 수 없음"
              />
            ) : null}
          </p>
        </div>
        {riskCode ? (
          <span
            className={`inline-flex gap-1 self-start whitespace-nowrap pt-0.5 text-[11px] font-semibold ${
              muted ? "text-[#A39E98]" : "text-[var(--oc-risk)]"
            }`}
          >
            <b className="font-mono font-semibold">{riskCode}</b>
            {riskName}
          </span>
        ) : null}
      </header>

      {children ? (
        <div className="flex flex-col gap-2.5 pb-3 pl-4 pr-3.5 @max-[300px]:pl-3.5">{children}</div>
      ) : null}

      {footer ? (
        <footer className="relative flex flex-col gap-[9px] border-t border-[#F0F0EC] pb-3 pl-4 pr-3.5 pt-2.5 @max-[300px]:pl-3.5">
          {footer}
        </footer>
      ) : null}
    </article>
  )
}

export function CardNote({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-[11px] text-[#615D59]">
      <span className="mt-0.5 shrink-0 text-[#A39E98]">{icon}</span>
      <span>{children}</span>
    </p>
  )
}

type AiButtonVariant = "primary" | "danger" | "secondary" | "ghost"

const BUTTON_VARIANT: Record<AiButtonVariant, string> = {
  primary: "border-[#084734] bg-[#084734] text-white hover:bg-[#065c41]",
  danger: "border-[#B43E3E] bg-[#B43E3E] text-white hover:bg-[#8F2C2C]",
  secondary: "border-[#E8E8E4] bg-white text-[#111110] hover:bg-[#F6F5F4]",
  ghost: "border-transparent bg-transparent text-[#615D59] hover:bg-[#F6F5F4]",
}

export const aiButtonClass = (variant: AiButtonVariant) =>
  `inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 py-[7px] text-[12px] font-semibold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] motion-reduce:active:scale-100 ${BUTTON_VARIANT[variant]}`

export function AiButton({
  variant = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: AiButtonVariant }) {
  return <button type="button" className={`${aiButtonClass(variant)} ${className}`} {...props} />
}
