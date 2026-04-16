import * as React from "react"

import { cn } from "@/lib/utils"

export const marketingFieldClassName =
  "h-12 rounded-[18px] border-[#D8DDD6] bg-white px-4 text-[15px] text-[#111110] placeholder:text-[#8A948D] shadow-[0_1px_2px_rgba(8,15,12,0.04)] focus-visible:border-[#084734] focus-visible:ring-4 focus-visible:ring-[#084734]/10"

export const marketingSurfaceClassName =
  "rounded-[28px] border border-[#E4E8E2] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]"

export function FormLabel({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "text-[13px] font-semibold tracking-[-0.01em] text-[#203127]",
        className
      )}
      {...props}
    />
  )
}

export function FormHint({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-xs leading-5 text-[#6C776F]", className)}
      {...props}
    />
  )
}

export function FormMessage({
  className,
  tone = "error",
  ...props
}: React.HTMLAttributes<HTMLParagraphElement> & {
  tone?: "error" | "success" | "muted"
}) {
  const toneClassName =
    tone === "success"
      ? "text-[#0E7A49]"
      : tone === "muted"
        ? "text-[#6C776F]"
        : "text-[#B85C33]"

  return (
    <p
      className={cn("text-sm leading-6", toneClassName, className)}
      {...props}
    />
  )
}

export function FormCheckbox({
  className,
  label,
  description,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: React.ReactNode
  description?: React.ReactNode
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 rounded-[20px] border border-[#E4E8E2] bg-[#F7FAF7] px-4 py-3.5",
        className
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-[#BCC6BE] text-[#084734] focus:ring-[#084734]"
        {...props}
      />
      <span className="space-y-1">
        <span className="block text-sm font-medium text-[#203127]">{label}</span>
        {description ? (
          <span className="block text-xs leading-5 text-[#6C776F]">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  )
}
