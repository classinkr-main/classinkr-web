import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
    "inline-flex items-center gap-1 rounded-full text-[12px] font-semibold tracking-[0.125px] transition-colors",
    {
        variants: {
            variant: {
                // 기본 — Classin Green pill (DESIGN.md 스펙)
                default:
                    "bg-[#ECFDF5] text-[#084734] px-[10px] py-[4px]",
                // 보조 — warm neutral
                secondary:
                    "bg-[#F6F5F4] text-[#615D59] px-[10px] py-[4px]",
                // 강조 — green surface 100
                success:
                    "bg-[#D1FAE5] text-[#084734] px-[10px] py-[4px]",
                // 경고
                warning:
                    "bg-amber-50 text-amber-700 px-[10px] py-[4px]",
                // 오류
                destructive:
                    "bg-red-50 text-red-600 px-[10px] py-[4px]",
                // 아웃라인 — whisper border
                outline:
                    "border border-black/[0.08] text-[#615D59] px-[10px] py-[4px] bg-white",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
)

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>

function Badge({ className, variant, ...props }: BadgeProps) {
    return (
        <span className={cn(badgeVariants({ variant }), className)} {...props} />
    )
}

export { Badge, badgeVariants }
