import CaptureInboxClient from "@/components/admin/crm/capture/CaptureInboxClient"

export const metadata = {
  title: "행사 참석자 입력 | Admin CRM",
}

export const dynamic = "force-dynamic"

export default function AdminCrmCapturePage() {
  return <CaptureInboxClient />
}
