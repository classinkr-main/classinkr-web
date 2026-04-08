import { notFound } from "next/navigation"

import PartnerWorkspaceDetailClient from "@/components/admin/partners/PartnerWorkspaceDetailClient"
import { getPartnerWorkspaceData } from "@/lib/partners-data"

interface AdminPartnerDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function AdminPartnerDetailPage({
  params,
}: AdminPartnerDetailPageProps) {
  const { id } = await params
  const { workspace, source, warning } = await getPartnerWorkspaceData(id)

  if (!workspace) {
    notFound()
  }

  return (
    <PartnerWorkspaceDetailClient
      initialWorkspace={workspace}
      initialSource={source}
      initialWarning={warning}
    />
  )
}
