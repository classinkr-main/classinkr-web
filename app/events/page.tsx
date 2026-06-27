import type { PublicEvent } from "@/lib/types/public-events"
import { listCachedPublicEvents } from "@/lib/repositories/public-events"
import { getPublishedSeminars } from "@/lib/seminars/catalog"
import EventsClient from "./EventsClient"

export const revalidate = 3600

export default async function EventsPage() {
  let events: PublicEvent[] = []
  try {
    events = await listCachedPublicEvents()
  } catch {
    events = []
  }
  const videos = getPublishedSeminars()
  return <EventsClient events={events} videos={videos} />
}
