import { listPublicEvents } from "@/lib/repositories/public-events"
import EventsClient from "./EventsClient"

export const dynamic = "force-dynamic"

export default async function EventsPage() {
  let events = []
  try {
    events = await listPublicEvents()
  } catch {
    events = []
  }
  return <EventsClient events={events} />
}
