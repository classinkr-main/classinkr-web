import { revalidatePath, revalidateTag } from "next/cache"

import { PUBLIC_EVENTS_CACHE_TAG } from "@/lib/repositories/public-events"

export function revalidatePublicEventSurfaces(...slugs: Array<string | null | undefined>) {
  revalidateTag(PUBLIC_EVENTS_CACHE_TAG, "max")
  revalidatePath("/events")
  revalidatePath("/sitemap.xml")

  for (const slug of new Set(slugs.filter((value): value is string => Boolean(value)))) {
    revalidatePath(`/events/${slug}`)
    revalidatePath(`/events/${slug}/calendar.ics`)
  }
}
