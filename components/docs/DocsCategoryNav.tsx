import Link from "next/link"

import { cn } from "./utils"

export interface DocsCategoryNavItem {
  href: string
  label: string
  meta: string
  description?: string
  isActive?: boolean
}

export interface DocsCategoryNavProps {
  items: DocsCategoryNavItem[]
  className?: string
}

export function DocsCategoryNav({ items, className }: DocsCategoryNavProps) {
  if (items.length === 0) {
    return null
  }

  return (
    <nav
      aria-label="가이드 주제"
      className={cn("border-b border-black/[0.08]", className)}
    >
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 md:overflow-visible">
        <div className="flex min-w-max gap-6 md:min-w-0 md:gap-4">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.isActive ? "page" : undefined}
              aria-label={
                item.description
                  ? `${item.label}, ${item.meta}. ${item.description}`
                  : `${item.label}, ${item.meta}`
              }
              className={cn(
                "group flex min-w-[132px] flex-col border-b-2 px-0 pb-3 pt-1 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8] md:min-w-0 md:flex-1",
                item.isActive
                  ? "border-[#084734] text-[#084734]"
                  : "border-transparent text-[#615D59] hover:border-[#084734]/30 hover:text-[#111110]"
              )}
            >
              <span
                className={cn(
                  "text-[11px] font-semibold leading-4",
                  item.isActive ? "text-[#084734]" : "text-[#A39E98] group-hover:text-[#084734]"
                )}
              >
                {item.meta}
              </span>
              <span className="mt-1 break-keep text-[15px] font-bold leading-5 text-[#111110] group-hover:text-[#084734]">
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
