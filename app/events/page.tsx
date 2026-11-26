import type { PublicEvent } from "@/lib/types/public-events"
import { listCachedPublicEvents } from "@/lib/repositories/public-events"
import { getPublishedSeminars, toPublicSeminarCard } from "@/lib/seminars/catalog"
import EventsClient from "./EventsClient"

export const revalidate = 3600

export default async function EventsPage() {
  let events: PublicEvent[] = []
  try {
    events = await listCachedPublicEvents()
  } catch (error) {
    // 운영 런타임 실패는 던져 직전 ISR 페이지를 유지한다 — 빈 목록이 1시간 굳지 않게 한다.
    if (process.env.NEXT_PHASE !== "phase-production-build") throw error
    events = []
  }
  const videos = getPublishedSeminars().map(toPublicSeminarCard)
  return <EventsClient events={events} videos={videos} />
}
