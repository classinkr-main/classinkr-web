import { redirect } from "next/navigation"

export default function ContractsPage() {
  redirect("/partner/documents?kind=contract")
}
