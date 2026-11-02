import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap text-[15px] font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    {
        variants: {
            variant: {
                // Primary — Classin Green (tokens.css --fg-accent: 공개 #0B7A52 · 어드민 #084734)
                default:
                    "bg-fg-accent text-fg-on-accent rounded-[6px] hover:bg-fg-accent-hover active:scale-[0.97] shadow-sm",
                // Secondary — warm surface
                secondary:
                    "bg-black/5 text-fg-ink rounded-[6px] hover:bg-black/[0.08] active:scale-[0.97]",
                // Outline — whisper border
                outline:
                    "border border-line-hair bg-surface-sheet text-fg-ink rounded-[6px] hover:bg-surface-sunken active:scale-[0.97] shadow-sm",
                // Ghost — text only
                ghost:
                    "text-fg-accent bg-transparent hover:underline underline-offset-4",
                // Destructive (어드민 전용)
                destructive:
                    "bg-red-500 text-white rounded-[6px] hover:bg-red-600 active:scale-[0.97] shadow-sm",
                // Link
                link:
                    "text-fg-accent underline-offset-4 hover:underline",
                // Green surface — 틴트는 accent 불투명도로(새 틴트 토큰 없음)
                "green-surface":
                    "bg-fg-accent/8 text-fg-accent rounded-[6px] hover:bg-fg-accent/14 active:scale-[0.97]",
            },
            size: {
                default: "h-[38px] px-5 py-2",
                sm: "h-8 px-3 text-[13px]",
                lg: "h-11 px-7 text-base",
                xl: "h-12 px-8 text-base",
                icon: "h-9 w-9 rounded-[6px]",
                "icon-sm": "h-7 w-7 rounded-[6px]",
                // 공개 화면(controls): 가드 button-size 가 md·cta·icon-md 만 허용한다
                md: "h-11 px-5",
                cta: "h-12 px-7 text-base",
                "icon-md": "h-11 w-11 rounded-[6px]",
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
