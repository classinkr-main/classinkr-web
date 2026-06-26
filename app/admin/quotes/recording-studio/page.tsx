import { redirect } from "next/navigation"

export default function AdminRecordingStudioQuotePage() {
  redirect("/admin/quotes?tab=hardware&action=recording_studio")
}
