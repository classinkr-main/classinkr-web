"use client"

import { useState } from "react"
import {
  Camera,
  ChevronDown,
  Cpu,
  Globe,
  HelpCircle,
  Laptop,
  Layers,
  MessageCircle,
  Network,
  PenTool,
  Radio,
  Server,
  ShieldAlert,
  Sparkles,
  Tv,
  UserCheck,
  Video,
} from "lucide-react"

import type { HqContactInfo } from "@/lib/internal-cs-chat/escalation-routing"
import { cn } from "@/lib/utils"

const DOMAIN_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  camera: Camera,
  board: Tv,
  hardware_as: Laptop,
  network: Network,
  recording: Video,
  mirroring: Radio,
  software_pen: PenTool,
  ai_classroom: Sparkles,
  lms_agentin: Layers,
  ai_risk: ShieldAlert,
  api: Server,
  billing: Globe,
  sms: MessageCircle,
  cloud_cdn: Cpu,
  general: HelpCircle,
}

export default function EscalationWhoBadge({
  contact,
  issueTypeTag = "【缺陷】",
  compact = false,
  className,
}: {
  contact: HqContactInfo
  issueTypeTag?: "【缺陷】" | "【需求】" | "【疑似缺陷】"
  compact?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const Icon = DOMAIN_ICONS[contact.domain] ?? HelpCircle

  const isBug = issueTypeTag === "【缺陷】"
  const isReq = issueTypeTag === "【需求】"

  return (
    <div className={cn("relative inline-block text-left", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={cn(
            "group inline-flex items-center gap-2 rounded-lg border border-black/[0.08] bg-[#F6F5F4] font-medium text-[#31302E] transition-all hover:border-[#084734]/30 hover:bg-white shadow-xs",
            compact ? "px-2 py-1 text-[10.5px]" : "px-2.5 py-1.5 text-[11px]",
            open && "border-[#084734]/40 bg-white ring-2 ring-[#084734]/10"
          )}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#084734] text-white">
            <Icon className="h-3 w-3" />
          </span>
          <span className="font-semibold text-[#111110]">{contact.domainLabel}</span>
          <span className="text-[#A39E98]" aria-hidden>·</span>
          <span className="inline-flex items-center gap-1 text-[#615D59]">
            <UserCheck className="h-3 w-3 text-[#084734]" />
            <strong className="font-semibold text-[#084734]">{contact.primaryContact}</strong>
          </span>
          {contact.remoteTool ? (
            <span className="hidden sm:inline-block rounded bg-white px-1.5 py-0.5 text-[10px] text-[#615D59] border border-black/[0.06]">
              {contact.remoteTool.split("/")[0]?.trim()}
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              "h-3 w-3 text-[#A39E98] transition-transform duration-150",
              open && "rotate-180 text-[#084734]"
            )}
          />
        </button>

        {issueTypeTag ? (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums",
              isBug && "bg-[#FCE9E9] text-[#A62626] border border-[#F2B8B8]",
              isReq && "bg-[#ECFDF5] text-[#084734] border border-[#BDEFD8]",
              !isBug && !isReq && "bg-[#FBF1E0] text-[#7A520F] border border-[#ECD29C]"
            )}
          >
            {issueTypeTag}
          </span>
        ) : null}
      </div>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-full z-50 mt-1.5 w-80 rounded-xl border border-black/[0.12] bg-white p-4 shadow-xl text-[12px] leading-5 text-[#31302E]">
            <div className="flex items-start justify-between border-b border-black/[0.06] pb-2.5">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#A39E98]">
                  HQ 소통 라우팅 가이드
                </span>
                <h4 className="font-bold text-[13px] text-[#111110] flex items-center gap-1.5 mt-0.5">
                  <Icon className="h-4 w-4 text-[#084734]" />
                  {contact.domainLabel}
                </h4>
              </div>
              <span className="rounded bg-[#F6F5F4] px-1.5 py-0.5 text-[10px] font-mono text-[#615D59]">
                {contact.recommendedTag}
              </span>
            </div>

            <div className="mt-3 space-y-2 text-[11.5px]">
              <div>
                <span className="block font-semibold text-[#111110]">담당자 경로</span>
                <p className="mt-0.5 text-[#31302E]">
                  • <strong>본사 담당:</strong> {contact.primaryContact}
                </p>
                {contact.secondaryContact ? (
                  <p className="text-[#615D59]">• <strong>2차/협력:</strong> {contact.secondaryContact}</p>
                ) : null}
                <p className="text-[#A39E98]">• <strong>1차 접점:</strong> {contact.firstLineContact}</p>
              </div>

              {contact.remoteTool ? (
                <div>
                  <span className="block font-semibold text-[#111110]">원격 지원 도구</span>
                  <p className="mt-0.5 text-[#615D59]">{contact.remoteTool}</p>
                </div>
              ) : null}

              <div>
                <span className="block font-semibold text-[#111110]">WeCom 멘션 키</span>
                <p className="mt-0.5 font-mono text-[11px] text-[#084734]">{contact.wecomMention}</p>
              </div>

              <div className="rounded-md border border-black/[0.06] bg-[#FAFAF8] p-2 text-[11px] leading-4 text-[#615D59]">
                <strong className="block text-[#31302E]">핵심 점검 팁</strong>
                {contact.guidanceTip}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
