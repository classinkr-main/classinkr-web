import PartnerWorkspacePageClient from "@/components/admin/partners/PartnerWorkspacePageClient"
import { listPartnerWorkspacesData } from "@/lib/partners-data"

export const dynamic = "force-dynamic"

export default async function AdminCrmPartnersPage() {
  const { workspaces, source, warning } = await listPartnerWorkspacesData()

  return (
    <PartnerWorkspacePageClient
      initialWorkspaces={workspaces}
      initialSource={source}
      initialWarning={warning}
    />
  )
}
