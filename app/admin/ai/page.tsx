import type { Metadata } from "next"
import { notFound } from "next/navigation"

import AdminAiWorkspace from "@/components/admin/ai/AdminAiWorkspace"
import { isAdminAiPreviewEnabled } from "@/lib/admin-ai/preview"
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
  // 기획 D13 — 서버 1단계(조회)가 붙기 전 시안은 운영에 올리지 않는다. 스위치가 꺼져 있으면(기본)
  // 이 화면은 없다(lib/admin-ai/preview.ts). 사이드바·⌘K 항목도 같은 스위치로 빠진다.
  if (!isAdminAiPreviewEnabled()) notFound()

  const { tab } = await searchParams
  return <AdminAiWorkspace initialTab={isAdminAiTab(tab) ? tab : "chat"} />
}
