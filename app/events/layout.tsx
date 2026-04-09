import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "행사",
  description: "Classin이 참가하는 교육 박람회, 세미나, 설명회 일정을 확인하고 직접 만나보세요.",
  openGraph: {
    title: "행사 | Classin",
    description: "Classin이 참가하는 교육 박람회, 세미나, 설명회 일정을 확인하고 직접 만나보세요.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "행사 | Classin",
    description: "Classin이 참가하는 교육 박람회, 세미나, 설명회 일정을 확인하고 직접 만나보세요.",
  },
}

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
