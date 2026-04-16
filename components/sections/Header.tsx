"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { NewsletterModal } from "./NewsletterModal"
import { cn } from "@/lib/utils"
import { Menu, X, Monitor, Cpu } from "lucide-react"

const navItems = [
    { name: "제품 소개", href: "/product" },
    { name: "블로그", href: "/blog" },
    { name: "행사", href: "/events" },
    { name: "회사 소개", href: "/about" },
]

const productTabs = [
    { name: "소프트웨어", href: "/product/sw", icon: Monitor },
    { name: "하드웨어", href: "/product/hw", icon: Cpu },
]

export function Header() {
    const [isScrolled, setIsScrolled] = React.useState(false)
    const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false)
    const pathname = usePathname()

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

    return (
        <header
            className={cn(
                "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
                isScrolled
                    ? "bg-white/65 backdrop-blur-xl backdrop-saturate-150 border-b border-white/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_1px_0_rgba(0,0,0,0.04)] py-4"
                    : "bg-white/60 backdrop-blur-sm py-6"
            )}
        >
            <div className="container mx-auto flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2">
                    <Image
                        src="/images/logo.png"
                        alt="Classin Logo"
                        width={120}
                        height={32}
                        className="h-7 md:h-8 w-auto object-contain"
                        priority
                    />
                </Link>

                <button
                    className="md:hidden p-2 text-[#111110]"
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                >
                    {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>

                <nav className={cn(
                    "items-center gap-8",
                    isMobileMenuOpen
                        ? "absolute top-full left-0 w-full bg-white border-b border-black/[0.08] flex flex-col items-center py-8 gap-6 shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
                        : "hidden md:flex"
                )}>
                    {navItems.map((item) => {
                        const isActive = item.href === "/product" ? pathname.startsWith("/product") : pathname === item.href;
                        const isProduct = item.href === "/product"
                        const isOnProduct = pathname.startsWith("/product")

                        return isProduct ? (
                            <div key={item.name} className="relative">
                                <Link
                                    href={item.href}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className={cn(
                                        "text-[15px] font-semibold transition-colors",
                                        isActive
                                            ? "text-[#084734]"
                                            : "text-[#111110] hover:text-[#084734]"
                                    )}
                                >
                                    {item.name}
                                </Link>
                                {isOnProduct && (
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 pt-3">
                                        <div className="flex gap-1 bg-white rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-black/[0.08] px-1.5 py-1">
                                            {productTabs.map((tab) => {
                                                const isTabActive = pathname === tab.href
                                                return (
                                                    <Link
                                                        key={tab.href}
                                                        href={tab.href}
                                                        className={cn(
                                                            "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap",
                                                            isTabActive
                                                                ? "bg-[#ECFDF5] text-[#084734] shadow-sm"
                                                                : "text-[#615D59] hover:text-[#111110] hover:bg-[#F6F5F4]"
                                                        )}
                                                    >
                                                        <tab.icon className="w-3.5 h-3.5" />
                                                        {tab.name}
                                                    </Link>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <Link
                                key={item.name}
                                href={item.href}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={cn(
                                    "text-[15px] font-semibold transition-colors",
                                    isActive
                                        ? "text-[#084734]"
                                        : "text-[#111110] hover:text-[#084734]"
                                )}
                            >
                                {item.name}
                            </Link>
                        )
                    })}
                </nav>

                <div className="hidden md:flex items-center gap-4">
                    <NewsletterModal
                        source="gnb_materials"
                        badge="무료 구독"
                        title="교육 인사이트 받아보기"
                        description="Classin의 최신 교육 트렌드, 제품 업데이트, 행사 정보를 이메일로 받아보세요."
                        benefits={[
                            "월 1~2회 학원 운영 인사이트 레터",
                            "신기능 · 업데이트 소식 우선 공지",
                            "Classin 주최 행사 · 웨비나 초대",
                        ]}
                    >
                        <button type="button" className="hidden md:flex font-semibold transition-colors text-[15px] cursor-pointer bg-transparent border-none p-0 text-[#615D59] hover:text-[#084734]">
                            자료 받아보기
                        </button>
                    </NewsletterModal>
                    <Link
                        href="/contact"
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-[6px] px-5 py-2 text-[15px] font-semibold bg-[#084734] text-white hover:bg-[#065c41] active:scale-[0.97] transition-all shadow-sm"
                    >
                        도입 문의
                    </Link>
                </div>
            </div>
        </header>
    )
}
