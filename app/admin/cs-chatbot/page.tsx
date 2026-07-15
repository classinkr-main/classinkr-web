import type { Metadata } from "next"

import InternalCsChatWorkspace from "@/components/admin/cs-chat/InternalCsChatWorkspace"

export const metadata: Metadata = {
  title: "내부 CS 챗봇 | Classin Admin",
  robots: { index: false, follow: false },
}

export default function InternalCsChatbotPage() {
  return <InternalCsChatWorkspace />
}
