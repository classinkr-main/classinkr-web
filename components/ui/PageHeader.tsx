import { cn } from "@/lib/utils"

interface PageHeaderProps {
    heading: string
    text?: string
    children?: React.ReactNode
    className?: string
}

export function PageHeader({
    heading,
    text,
    children,
    className,
}: PageHeaderProps) {
    return (
        <section className={cn("bg-[#F6F5F4] pt-32 pb-12 md:pb-20 md:pt-40", className)}>
            <div className="container">
                <div className="flex flex-col items-center text-center max-w-3xl mx-auto space-y-4">
                    <h1 className="text-3xl font-extrabold tracking-tight text-[#111110] sm:text-4xl md:text-5xl" style={{ letterSpacing: '-0.03em' }}>
                        {heading}
                    </h1>
                    {text && (
                        <p className="text-lg text-[#615D59] md:text-xl leading-relaxed">
                            {text}
                        </p>
                    )}
                    {children}
                </div>
            </div>
        </section>
    )
}
