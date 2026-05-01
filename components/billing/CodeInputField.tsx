"use client"

import { useState } from "react"
import { CheckCircle2, Loader2, X } from "lucide-react"

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
  removeLabel = "제거",
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
    <div className="rounded-2xl border border-black/10 bg-white p-5">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[13px] font-semibold text-[#111110]">{title}</p>
      </div>
      <p className="mt-0.5 text-[12px] leading-relaxed text-[#7C8A83]">{description}</p>

      {isApplied ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-[#ECFDF5] px-3 py-2">
          <div className="flex items-center gap-2 text-[13px] text-[#084734]">
            <CheckCircle2 className="h-4 w-4" />
            <span>{status.summary}</span>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#44514A] hover:text-[#111110]"
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
              className="h-10 flex-1 rounded-lg border-black/10 bg-white font-mono text-[13px] uppercase tracking-wider"
            />
            <Button
              type="button"
              size="sm"
              onClick={() => {
                void handleApply()
              }}
              disabled={isLoading || value.trim().length === 0}
              className="h-10 min-w-[64px] rounded-lg bg-[#084734] px-4 text-[13px] font-semibold text-white hover:bg-[#065C41]"
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
