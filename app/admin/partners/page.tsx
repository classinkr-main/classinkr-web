import PartnerWorkspacePageClient from "@/components/admin/partners/PartnerWorkspacePageClient"
import { listPartnerWorkspacesData } from "@/lib/partners-data"

export default async function AdminPartnersPage() {
  const { workspaces, source, warning } = await listPartnerWorkspacesData()

  return (
    <PartnerWorkspacePageClient
      initialWorkspaces={workspaces}
      initialSource={source}
      initialWarning={warning}
    />
  )
}
