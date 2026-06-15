import LeadMagnetsAdminClient from "@/components/admin/LeadMagnetsAdminClient"
import { getAllLeadMagnets } from "@/lib/repositories/lead-magnets"

export default async function AdminLeadMagnetsPage() {
  const leadMagnets = await getAllLeadMagnets()

  return <LeadMagnetsAdminClient initialLeadMagnets={leadMagnets} />
}
