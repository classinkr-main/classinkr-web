import CaptureInboxClient from "@/components/admin/crm/capture/CaptureInboxClient"

export const metadata = {
  title: "입력함 | Admin CRM",
}

export const dynamic = "force-dynamic"

export default async function AdminCrmCapturePage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string | string[] }>
}) {
  const params = await searchParams
  const initialEventId = typeof params.event === "string" ? params.event : ""

  return <CaptureInboxClient initialEventId={initialEventId} />
}
