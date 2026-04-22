import { notFound } from "next/navigation"
import { getPublicEventById } from "@/lib/repositories/public-events"
import EventEditor from "@/components/admin/EventEditor"

interface AdminEventEditPageProps {
  params: Promise<{ id: string }>
}

export default async function AdminEventEditPage({ params }: AdminEventEditPageProps) {
  const { id } = await params
  const event = await getPublicEventById(id)

  if (!event) notFound()

  return <EventEditor event={event} />
}
