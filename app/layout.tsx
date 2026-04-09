import type { Metadata } from "next";
import "./globals.css";
import { ConditionalHeader } from "@/components/sections/ConditionalHeader";
import { ConditionalFooter } from "@/components/sections/ConditionalFooter";
import { FloatingChatbot } from "@/components/ui/FloatingChatbot";
import { MobileFloatingCTA } from "@/components/ui/MobileFloatingCTA";
import { AnalyticsProviders } from "@/components/AnalyticsProviders";
import { ToastProvider } from "@/components/ui/toast";


export const metadata: Metadata = {
  metadataBase: new URL("https://classin.co.kr"),
  title: {
    default: "Classin — 학원 운영의 새로운 기준",
    template: "%s | Classin",
  },
  description: "데이터 기반의 학원 관리 플랫폼 Classin으로 교육 품질을 표준화하고, 행정 업무를 자동화하며, 학습 성과를 보장하세요.",
  icons: {
    icon: "/icon",
    apple: "/apple-icon",
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
        {/* Google Tag Manager */}
        <script dangerouslySetInnerHTML={{ __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-PJH3SWVL');` }} />
        {/* End Google Tag Manager */}
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
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-PJH3SWVL"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        {/* End Google Tag Manager (noscript) */}
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
