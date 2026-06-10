"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { NewsletterModal } from "./NewsletterModal"
import { TrackedLink } from "@/components/TrackedLink"
import { cn } from "@/lib/utils"
import { Menu, X, Monitor, Cpu } from "lucide-react"

const navItems = [
    { name: "제품 소개", href: "/product" },
    { name: "회사 소개", href: "/about" },
    { name: "블로그", href: "/blog" },
    { name: "행사", href: "/events" },
    { name: "가이드", href: "/docs" },
]

const productTabs = [
    { name: "Classin 소프트웨어", href: "/product/sw", icon: Monitor },
    { name: "Classin Board", href: "/product/hw", icon: Cpu },
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

    React.useEffect(() => {
        setIsMobileMenuOpen(false)
    }, [pathname])

    return (
        <header
            className={cn(
                "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
                isScrolled
                    ? "gnb-scroll-glass bg-white/[0.2] backdrop-blur-xl backdrop-saturate-150 border-b border-white/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.62),0_1px_0_rgba(0,0,0,0.04)] py-4"
                    : "bg-white/60 backdrop-blur-sm py-6"
            )}
        >
            <div className="container relative z-10 mx-auto flex items-center justify-between gap-4">
                <Link href="/" className="flex items-center gap-2">
                    <Image
                        src="/images/logo.png"
                        alt="Classin Logo"
                        width={674}
                        height={244}
                        className="h-7 md:h-8 w-auto object-contain"
                        priority
                    />
                </Link>

                <button
                    type="button"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] text-[#111110] transition-colors hover:bg-black/[0.05] md:hidden"
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    aria-label={isMobileMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
                    aria-expanded={isMobileMenuOpen}
                    aria-controls="site-mobile-menu"
                >
                    {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>

                <nav className={cn(
                    "items-center gap-8",
                    isMobileMenuOpen
                        ? "absolute left-0 top-full flex max-h-[calc(100svh-5rem)] w-full flex-col items-stretch gap-1 overflow-y-auto border-b border-black/[0.08] bg-white px-5 py-5 shadow-[0_14px_34px_rgba(0,0,0,0.08)]"
                        : "hidden md:flex"
                )}
                    id="site-mobile-menu"
                >
                    {navItems.map((item) => {
                        const isActive = item.href === "/product"
                            ? pathname.startsWith("/product")
                            : item.href === "/docs"
                                ? pathname.startsWith("/docs")
                                : pathname === item.href;
                        const isProduct = item.href === "/product"
                        return isProduct ? (
                            <div key={item.name} className="relative group w-full md:w-auto">
                                <Link
                                    href={item.href}
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className={cn(
                                        "flex min-h-11 items-center justify-between rounded-[8px] px-3 text-[15px] font-semibold transition-colors md:min-h-0 md:rounded-none md:px-0",
                                        isActive
                                            ? "bg-[#ECFDF5] text-[#084734] md:bg-transparent"
                                            : "text-[#111110] hover:bg-[#F6F5F4] hover:text-[#084734] md:hover:bg-transparent"
                                    )}
                                >
                                    {item.name}
                                </Link>
                                {isMobileMenuOpen ? (
                                    <div className="mt-2 grid grid-cols-2 gap-2 px-1 md:hidden">
                                        {productTabs.map((tab) => {
                                            const isTabActive = pathname === tab.href
                                            return (
                                                <Link
                                                    key={tab.href}
                                                    href={tab.href}
                                                    onClick={() => setIsMobileMenuOpen(false)}
                                                    className={cn(
                                                        "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[8px] border px-3 text-sm font-semibold transition-colors",
                                                        isTabActive
                                                            ? "border-[#084734]/20 bg-[#ECFDF5] text-[#084734]"
                                                            : "border-black/[0.08] bg-white text-[#615D59] hover:bg-[#F6F5F4]"
                                                    )}
                                                >
                                                    <tab.icon className="h-4 w-4" />
                                                    {tab.name}
                                                </Link>
                                            )
                                        })}
                                    </div>
                                ) : null}
                                <div className="pointer-events-none absolute top-full left-1/2 z-40 hidden w-48 -translate-x-1/2 pt-3 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100 md:block">
                                    <div className="translate-y-1 rounded-2xl border border-black/[0.08] bg-white p-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.08)] transition-transform duration-200 group-hover:translate-y-0 group-focus-within:translate-y-0">
                                        <div className="flex flex-col gap-1">
                                            {productTabs.map((tab) => {
                                                const isTabActive = pathname === tab.href
                                                return (
                                                    <Link
                                                        key={tab.href}
                                                        href={tab.href}
                                                        className={cn(
                                                            "inline-flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all whitespace-nowrap",
                                                            isTabActive
                                                                ? "bg-[#ECFDF5] text-[#084734] shadow-sm"
                                                                : "text-[#615D59] hover:text-[#111110] hover:bg-[#F6F5F4]"
                                                        )}
                                                    >
                                                        <tab.icon className="w-4 h-4" />
                                                        {tab.name}
                                                    </Link>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <Link
                                key={item.name}
                                href={item.href}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={cn(
                                    "flex min-h-11 w-full items-center rounded-[8px] px-3 text-[15px] font-semibold transition-colors md:min-h-0 md:w-auto md:rounded-none md:px-0",
                                    isActive
                                        ? "bg-[#ECFDF5] text-[#084734] md:bg-transparent"
                                        : "text-[#111110] hover:bg-[#F6F5F4] hover:text-[#084734] md:hover:bg-transparent"
                                )}
                            >
                                {item.name}
                            </Link>
                        )
                    })}
                    {isMobileMenuOpen ? (
                        <div className="mt-3 grid gap-2 border-t border-black/[0.08] pt-4 md:hidden">
                            <NewsletterModal
                                source="gnb_mobile_materials"
                                badge="무료 구독"
                                title="교육 인사이트 받아보기"
                                description="Classin의 최신 교육 트렌드, 제품 업데이트, 행사 정보를 이메일로 받아보세요."
                                benefits={[
                                    "월 1~2회 학원 운영 인사이트 레터",
                                    "신기능 · 업데이트 소식 우선 공지",
                                    "Classin 주최 행사 · 웨비나 초대",
                                ]}
                            >
                                <button type="button" className="flex min-h-11 w-full items-center justify-center rounded-[8px] border border-black/[0.08] bg-white px-4 text-[15px] font-semibold text-[#615D59]">
                                    자료 받아보기
                                </button>
                            </NewsletterModal>
                            <TrackedLink
                                href="/contact"
                                ctaId="gnb_mobile_contact"
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="inline-flex min-h-11 w-full items-center justify-center rounded-[8px] bg-[#009060] px-4 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-[#007A52]"
                            >
                                도입 문의
                            </TrackedLink>
                        </div>
                    ) : null}
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
                    <TrackedLink
                        href="/contact"
                        ctaId="gnb_contact"
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-[6px] bg-[#009060] px-5 py-2 text-[15px] font-semibold text-white shadow-sm transition-all hover:bg-[#007A52] active:scale-[0.97]"
                    >
                        도입 문의
                    </TrackedLink>
                </div>
            </div>
        </header>
    )
}
