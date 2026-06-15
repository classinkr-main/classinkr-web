"use client"

import { useEffect } from "react"

import { trackEvent } from "@/lib/analytics"
import type { LeadMagnet } from "@/lib/lead-magnets"

interface Props {
  leadMagnet: Pick<LeadMagnet, "slug" | "gate" | "tier" | "category">
}

export function ResourceViewTracker({ leadMagnet }: Props) {
  useEffect(() => {
    trackEvent("view_resource", {
      source: "resource_detail",
      lead_magnet: leadMagnet.slug,
      gate: leadMagnet.gate,
      tier: leadMagnet.tier,
      category: leadMagnet.category,
    })
  }, [leadMagnet.category, leadMagnet.gate, leadMagnet.slug, leadMagnet.tier])

  return null
}
