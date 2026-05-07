import { createPublicMetadata } from "@/lib/seo"

export const metadata = createPublicMetadata({
  title: "행사",
  description:
    "Classin이 참가하는 교육 박람회, 세미나, 설명회 일정을 확인하고 직접 만나보세요.",
  path: "/events",
})

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
