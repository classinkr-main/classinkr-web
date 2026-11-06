import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// 공개 화면은 family 를 명시한다. 기본 legacy 는 현행 출력 그대로(어드민·checkout·미이관 소비처)
export const cardVariants = cva("", {
    variants: {
        family: {
            // 문자열을 바꾸지 않는다 — tests/ui/card.test.tsx 가 지킨다
            legacy: "rounded-xl border border-black/[0.08] bg-white text-[#111110] shadow-[rgba(0,0,0,0.04)_0px_4px_18px,rgba(0,0,0,0.027)_0px_2px_7.8px,rgba(0,0,0,0.02)_0px_0.8px_2.9px,rgba(0,0,0,0.01)_0px_0.175px_1px]",
            plain: "rounded-xl border border-line-hair bg-surface-sheet text-fg-ink", // 패딩은 CardHeader/CardContent
            index: "rounded-lg border border-line-hair bg-surface-sheet text-fg-ink p-5 sm:p-6",
            case: "rounded-xl overflow-hidden border border-line-hair bg-surface-sheet text-fg-ink",
            plan: "relative rounded-xl border border-line-hair bg-surface-sheet text-fg-ink p-6 sm:p-7",
        },
        interactive: {
            true: "group block transition-colors duration-(--motion-fast) ease-soft hover:border-line-strong focus-within:border-line-strong active:border-line-strong active:duration-0",
            false: "",
        },
        featured: { true: "", false: "" },
    },
    compoundVariants: [{ family: "plan", featured: true, class: "border-line-ink" }],
    defaultVariants: { family: "legacy", interactive: false, featured: false },
})

type CardProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>

const Card = React.forwardRef<HTMLDivElement, CardProps>(
    ({ className, family, interactive, featured, ...props }, ref) => (
        <div
            ref={ref}
            // 예산 검사용 표지 — legacy 는 달지 않는다
            data-card={family && family !== "legacy" ? family : undefined}
            className={cn(cardVariants({ family, interactive, featured }), className)}
            {...props}
        />
    )
)
Card.displayName = "Card"

const CardHeader = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn("flex flex-col space-y-1.5 p-6", className)}
        {...props}
    />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
    <h3
        ref={ref}
        className={cn(
            "text-[22px] font-bold leading-snug tracking-[-0.25px] text-[#111110]",
            className
        )}
        {...props}
    />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
    <p
        ref={ref}
        className={cn("text-sm leading-relaxed text-[#615D59]", className)}
        {...props}
    />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
    HTMLDivElement,
    React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn("flex items-center p-6 pt-0", className)}
        {...props}
    />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
