import { redirect } from "next/navigation"

export default function AdminNewQuotePage() {
  redirect("/admin/quotes?tab=hardware&action=new")
}
