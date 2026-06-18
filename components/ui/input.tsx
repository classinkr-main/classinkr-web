import * as React from "react"

import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(
                    "flex h-10 w-full rounded-[6px]",
                    "border border-[#E5E5E0] bg-white px-3 py-2",
                    "text-[14px] text-[#111110] placeholder:text-[#A39E98]",
                    "shadow-[0_1px_2px_rgba(17,17,16,0.04)] transition-all duration-150",
                    "hover:border-[#D8D8D2] hover:shadow-[0_3px_10px_rgba(17,17,16,0.05)]",
                    "focus-visible:outline-none focus-visible:border-[#084734] focus-visible:ring-2 focus-visible:ring-[#084734]/20 focus-visible:shadow-[0_0_0_3px_rgba(8,71,52,0.06)]",
                    "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[#F6F5F4]",
                    "file:border-0 file:bg-transparent file:text-sm file:font-medium",
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Input.displayName = "Input"

export { Input }
