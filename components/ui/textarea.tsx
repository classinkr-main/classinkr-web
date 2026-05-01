import * as React from "react"

import { cn } from "@/lib/utils"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "flex min-h-[140px] w-full rounded-[18px]",
          "border border-[#D8DDD6] bg-white px-4 py-3.5",
          "text-[15px] leading-6 text-[#111110] placeholder:text-[#8A948D]",
          "transition-all duration-150",
          "focus-visible:outline-none focus-visible:border-[#084734] focus-visible:ring-4 focus-visible:ring-[#084734]/10",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[#F6F5F4]",
          className
        )}
        {...props}
      />
    )
  }
)

Textarea.displayName = "Textarea"

export { Textarea }
