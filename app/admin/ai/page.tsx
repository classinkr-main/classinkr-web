import type { Metadata } from "next"

import AdminAiWorkspace from "@/components/admin/ai/AdminAiWorkspace"
import { isAdminAiTab } from "@/lib/admin-ai/tabs"

export const metadata: Metadata = {
  title: "AI 올인원 | Classin Admin",
  robots: { index: false, follow: false },
}

export default async function AdminAiPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>
}) {
  const { tab } = await searchParams
  return <AdminAiWorkspace initialTab={isAdminAiTab(tab) ? tab : "chat"} />
}
