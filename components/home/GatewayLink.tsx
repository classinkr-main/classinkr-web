import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** 화면 끝의 관문 텍스트 링크. 강조색은 누를 수 있는 것에만(DESIGN.md §2) — 이 링크와 CTA 가 전부다 */
export function GatewayLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-1 text-ui font-semibold text-fg-accent hover:underline underline-offset-4", className)}
    >
      {children}
      <ArrowRight aria-hidden className="size-4 arrow-nudge" />
    </Link>
  )
}
