import type { Metadata } from "next";
import "./globals.css";
import { ConditionalHeader } from "@/components/sections/ConditionalHeader";
import { FloatingChatbot } from "@/components/ui/FloatingChatbot";
import { MobileFloatingCTA } from "@/components/ui/MobileFloatingCTA";
import { AnalyticsProviders } from "@/components/AnalyticsProviders";


export const metadata: Metadata = {
  title: "Classin | 학원 운영시스템의 모든 것",
  description: "데이터 기반의 학원 관리 플랫폼 Classin으로 교육 품질을 표준화하고, 행정 업무를 자동화하며, 학습 성과를 보장하세요.",
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
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
          as="style"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body>
        <ConditionalHeader />
        <main className="min-h-screen bg-background font-sans antialiased selection:bg-primary/20 selection:text-primary">
          {children}
        </main>
        <FloatingChatbot />
        <MobileFloatingCTA />
        <AnalyticsProviders />
      </body>
    </html>
  );
}
