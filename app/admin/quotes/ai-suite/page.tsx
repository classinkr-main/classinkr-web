import { redirect } from "next/navigation"

export default function AdminAiSuiteQuotePage() {
  redirect("/admin/quotes?tab=hardware&action=online_suite")
}
