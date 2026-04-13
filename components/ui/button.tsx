import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap text-[15px] font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    {
        variants: {
            variant: {
                // Primary — Classin Green
                default:
                    "bg-[#084734] text-white rounded-[6px] hover:bg-[#065c41] active:scale-[0.97] shadow-sm",
                // Secondary — warm surface
                secondary:
                    "bg-black/5 text-[#111110] rounded-[6px] hover:bg-black/[0.08] active:scale-[0.97]",
                // Outline — whisper border
                outline:
                    "border border-black/[0.08] bg-white text-[#111110] rounded-[6px] hover:bg-[#F6F5F4] active:scale-[0.97] shadow-sm",
                // Ghost — text only
                ghost:
                    "text-[#084734] bg-transparent hover:underline underline-offset-4",
                // Destructive
                destructive:
                    "bg-red-500 text-white rounded-[6px] hover:bg-red-600 active:scale-[0.97] shadow-sm",
                // Link
                link:
                    "text-[#084734] underline-offset-4 hover:underline",
                // Green surface — pill/badge 스타일 CTA
                "green-surface":
                    "bg-[#ECFDF5] text-[#084734] rounded-[6px] hover:bg-[#D1FAE5] active:scale-[0.97]",
            },
            size: {
                default: "h-[38px] px-5 py-2",
                sm: "h-8 px-3 text-[13px]",
                lg: "h-11 px-7 text-base",
                xl: "h-12 px-8 text-base",
                icon: "h-9 w-9 rounded-[6px]",
                "icon-sm": "h-7 w-7 rounded-[6px]",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : "button"
        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button, buttonVariants }
