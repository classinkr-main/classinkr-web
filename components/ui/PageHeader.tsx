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
        <section className={cn("bg-slate-50 pt-32 pb-12 md:pb-20 md:pt-40", className)}>
            <div className="container">
                <div className="flex flex-col items-center text-center max-w-3xl mx-auto space-y-4">
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
                        {heading}
                    </h1>
                    {text && (
                        <p className="text-lg text-muted-foreground md:text-xl">
                            {text}
                        </p>
                    )}
                    {children}
                </div>
            </div>
        </section>
    )
}
