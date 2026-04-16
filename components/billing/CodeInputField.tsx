"use client"

import { useState } from "react"
import { CheckCircle2, Loader2, Ticket, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type CodeFieldStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "applied"; summary: string }
  | { kind: "error"; message: string }

interface Props {
  title: string
  description: string
  placeholder: string
  applyLabel?: string
  removeLabel?: string
  status: CodeFieldStatus
  onApply: (code: string) => Promise<void> | void
  onRemove: () => void
}

export function CodeInputField({
  title,
  description,
  placeholder,
  applyLabel = "적용",
  removeLabel = "코드 제거",
  status,
  onApply,
  onRemove,
}: Props) {
  const [value, setValue] = useState("")
  const isLoading = status.kind === "loading"
  const isApplied = status.kind === "applied"

  async function handleApply() {
    if (isApplied) return
    const trimmed = value.trim()
    if (!trimmed) return
    await onApply(trimmed)
  }

  function handleRemove() {
    setValue("")
    onRemove()
  }

  return (
    <div className="rounded-[24px] border border-[rgba(8,71,52,0.08)] bg-white p-4">
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#084734]">
          <Ticket className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#111110]">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-[#7C8A83]">{description}</p>
        </div>
      </div>

      {isApplied ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-[#ECFDF5] px-3 py-2.5">
          <div className="flex items-center gap-2 text-sm text-[#084734]">
            <CheckCircle2 className="h-4 w-4" />
            <span>{status.summary}</span>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#084734] shadow-sm hover:bg-[#F8FBF9]"
          >
            <X className="h-3 w-3" />
            {removeLabel}
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <Label className="sr-only">{title}</Label>
          <div className="flex items-center gap-2">
            <Input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={placeholder}
              disabled={isLoading}
              className="h-10 flex-1 rounded-xl border-[rgba(8,71,52,0.12)] bg-white font-mono text-sm uppercase tracking-wider"
            />
            <Button
              type="button"
              size="sm"
              onClick={() => {
                void handleApply()
              }}
              disabled={isLoading || value.trim().length === 0}
              className="h-10 min-w-[72px] rounded-xl bg-[#084734] px-4 text-sm font-semibold text-white hover:bg-[#065C41]"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : applyLabel}
            </Button>
          </div>
          {status.kind === "error" ? (
            <p className="text-[11px] leading-relaxed text-[#B85C33]">{status.message}</p>
          ) : null}
        </div>
      )}
    </div>
  )
}
