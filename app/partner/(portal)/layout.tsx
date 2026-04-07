"use client"

import { PortalNav } from "@/components/partner-portal/PortalNav"

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5f5f2] text-[#1a1a1a]">
      <div className="sticky top-0 z-20 border-b border-[#e7e0d6] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4 px-6 py-3">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1a1a1a]/40">
            Partner Portal
          </span>
          <PortalNav />
        </div>
      </div>
      {children}
    </div>
  )
}
