"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { DemoModal } from "./DemoModal"
import { cn } from "@/lib/utils"

const navItems = [
    { name: "제품 소개", href: "/product" },
    { name: "요금제", href: "/pricing" },
    { name: "블로그", href: "/blog" },
    { name: "행사", href: "/events" },
]

export function Header() {
    const [isScrolled, setIsScrolled] = React.useState(false)
    const pathname = usePathname()
    const isHome = pathname === "/"

    React.useEffect(() => {
        let ticking = false
        const handleScroll = () => {
            if (ticking) return
            ticking = true
            requestAnimationFrame(() => {
                setIsScrolled(window.scrollY > 10)
                ticking = false
            })
        }
        window.addEventListener("scroll", handleScroll, { passive: true })
        return () => window.removeEventListener("scroll", handleScroll)
    }, [])

    const isLightModeHeader = true;

    return (
        <header
            className={cn(
                "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
                isScrolled
                    ? "bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm py-4"
                    : "bg-white/60 backdrop-blur-sm py-6"
            )}
        >
            <div className="container mx-auto flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2">
                    <img src="/images/logo.png" alt="Classin Logo" className="h-7 md:h-8 w-auto object-contain" />
                </Link>

                <nav className="hidden md:flex items-center gap-8">
                    {navItems.map((item) => {
                        const isActive = item.href === "/product" ? pathname.startsWith("/product") : pathname === item.href;

                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={cn(
                                    "text-sm font-medium transition-colors",
                                    isActive
                                        ? (isLightModeHeader ? "text-primary font-bold" : "text-white font-bold")
                                        : (isLightModeHeader ? "text-slate-800 hover:text-primary" : "text-slate-300 hover:text-white")
                                )}
                            >
                                {item.name}
                            </Link>
                        )
                    })}
                </nav>

                <div className="flex items-center gap-3 md:gap-4">
                    <DemoModal trackingButton="header_materials">
                        <button type="button" className={cn("hidden md:flex font-medium transition-colors text-sm cursor-pointer bg-transparent border-none p-0",
                             isLightModeHeader ? "text-slate-600 hover:text-primary" : "text-white/80 hover:text-white"
                        )}>
                            자료 받아보기
                        </button>
                    </DemoModal>
                    <Link
                        href="/contact"
                        className={cn(
                            "inline-flex items-center justify-center whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold shadow-lg transition-all",
                            isLightModeHeader
                                ? "bg-primary text-white hover:bg-primary/90"
                                : "bg-white text-slate-950 hover:bg-white/90"
                        )}
                    >
                        도입 문의
                    </Link>
                </div>
            </div>
        </header>
    )
}
