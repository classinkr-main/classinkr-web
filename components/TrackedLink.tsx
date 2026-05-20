"use client"

import Link from "next/link"
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react"

import { trackEvent } from "@/lib/analytics"

type TrackingValue = string | number | boolean | null | undefined

interface TrackedLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick"> {
  href: string
  ctaId: string
  tracking?: Record<string, TrackingValue>
  children: ReactNode
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
}

export function TrackedLink({
  href,
  ctaId,
  tracking,
  children,
  onClick,
  ...props
}: TrackedLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    trackEvent("click_cta", {
      button: ctaId,
      destination: href,
      page: window.location.pathname,
      ...tracking,
    })
    onClick?.(event)
  }

  return (
    <Link href={href} onClick={handleClick} {...props}>
      {children}
    </Link>
  )
}
