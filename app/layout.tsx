import type { Metadata } from "next";
import "./globals.css";
import { ConditionalHeader } from "@/components/sections/ConditionalHeader";
import { ConditionalFooter } from "@/components/sections/ConditionalFooter";
import { FloatingChatbot } from "@/components/ui/FloatingChatbot";
import { ChannelTalkLoader } from "@/components/ui/ChannelTalkLoader";
import { MobileFloatingCTA } from "@/components/ui/MobileFloatingCTA";
import { AnalyticsProviders } from "@/components/AnalyticsProviders";
import { ToastProvider } from "@/components/ui/toast";
import { GTMScript } from "@/components/GTMScript"
import { MetaPixelScript } from "@/components/MetaPixelScript";


export const metadata: Metadata = {
  metadataBase: new URL("https://classin.co.kr"),
  title: {
    default: "Classin — 학원 운영의 새로운 기준",
    template: "%s | Classin",
  },
  description: "데이터 기반의 학원 관리 플랫폼 Classin으로 교육 품질을 표준화하고, 행정 업무를 자동화하며, 학습 성과를 보장하세요.",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "Classin — 학원 운영의 새로운 기준",
    description: "데이터 기반의 학원 관리 플랫폼 Classin으로 교육 품질을 표준화하고, 행정 업무를 자동화하며, 학습 성과를 보장하세요.",
    url: "https://classin.co.kr",
    siteName: "Classin",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Classin — 학원 운영의 새로운 기준",
    description: "데이터 기반의 학원 관리 플랫폼 Classin으로 교육 품질을 표준화하고, 행정 업무를 자동화하며, 학습 성과를 보장하세요.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="scroll-smooth">
      <head>
        <link
          rel="preload"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
          as="style"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        <GTMScript />
        <MetaPixelScript />
        <ToastProvider>
          <ConditionalHeader />
          <main className="min-h-screen bg-background font-sans antialiased selection:bg-primary/20 selection:text-primary">
            {children}
          </main>
          <ConditionalFooter />
          <FloatingChatbot />
          <ChannelTalkLoader />
          <MobileFloatingCTA />
          <AnalyticsProviders />
        </ToastProvider>
      </body>
    </html>
  );
}
