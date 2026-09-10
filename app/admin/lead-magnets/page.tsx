import LeadMagnetsAdminClient from "@/components/admin/LeadMagnetsAdminClient"
import { getLeadMagnetStoreSnapshot } from "@/lib/repositories/lead-magnets"

export default async function AdminLeadMagnetsPage() {
  const { leadMagnets, storage } = await getLeadMagnetStoreSnapshot()

  return <LeadMagnetsAdminClient initialLeadMagnets={leadMagnets} initialStorage={storage} />
}
