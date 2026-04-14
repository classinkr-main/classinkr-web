import type { Metadata } from "next";
import "./globals.css";
import { ConditionalHeader } from "@/components/sections/ConditionalHeader";
import { ConditionalFooter } from "@/components/sections/ConditionalFooter";
import { FloatingChatbot } from "@/components/ui/FloatingChatbot";
import { MobileFloatingCTA } from "@/components/ui/MobileFloatingCTA";
import { AnalyticsProviders } from "@/components/AnalyticsProviders";
import { ToastProvider } from "@/components/ui/toast";
import { GTMScript } from "@/components/GTMScript"
import { MetaPixelScript } from "@/components/MetaPixelScript";
import {
  DEFAULT_OG_IMAGE_PATH,
  DEFAULT_SITE_TITLE,
  DEFAULT_TWITTER_IMAGE_PATH,
  SITE_NAME,
  SITE_URL,
} from "@/lib/seo";


export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: "데이터 기반의 학원 관리 플랫폼 Classin으로 교육 품질을 표준화하고, 행정 업무를 자동화하며, 학습 성과를 보장하세요.",
  icons: {
    icon: "/icon",
    apple: "/apple-icon",
  },
  openGraph: {
    title: DEFAULT_SITE_TITLE,
    description: "데이터 기반의 학원 관리 플랫폼 Classin으로 교육 품질을 표준화하고, 행정 업무를 자동화하며, 학습 성과를 보장하세요.",
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "ko_KR",
    type: "website",
    images: [{ url: DEFAULT_OG_IMAGE_PATH }],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_SITE_TITLE,
    description: "데이터 기반의 학원 관리 플랫폼 Classin으로 교육 품질을 표준화하고, 행정 업무를 자동화하며, 학습 성과를 보장하세요.",
    images: [DEFAULT_TWITTER_IMAGE_PATH],
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
          <MobileFloatingCTA />
          <AnalyticsProviders />
        </ToastProvider>
      </body>
    </html>
  );
}
