import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { AppChrome } from "@/components/AppChrome";
import { JsonLd } from "@/components/seo/JsonLd";
import Script from "next/script";
import { CONSENT_POLICY_VERSION } from "@/lib/consent/consent";
import {
  DEFAULT_OG_IMAGE_PATH,
  DEFAULT_SITE_TITLE,
  DEFAULT_TWITTER_IMAGE_PATH,
  createOrganizationJsonLd,
  createWebsiteJsonLd,
  SITE_NAME,
  SITE_URL,
} from "@/lib/seo";


export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: "데이터 기반의 학원 관리 플랫폼 Classin으로 교육 품질을 표준화하고, 행정 업무를 자동화하며, 학습 성과를 관리하세요.",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: DEFAULT_SITE_TITLE,
    description: "데이터 기반의 학원 관리 플랫폼 Classin으로 교육 품질을 표준화하고, 행정 업무를 자동화하며, 학습 성과를 관리하세요.",
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "ko_KR",
    type: "website",
    images: [{ url: DEFAULT_OG_IMAGE_PATH }],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_SITE_TITLE,
    description: "데이터 기반의 학원 관리 플랫폼 Classin으로 교육 품질을 표준화하고, 행정 업무를 자동화하며, 학습 성과를 관리하세요.",
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
    <html lang="ko" className="scroll-smooth" data-scroll-behavior="smooth">
      <head>
        <JsonLd data={[createOrganizationJsonLd(), createWebsiteJsonLd()]} />
        {/* Google Consent Mode v2 — 기본 거부(denied). GTM 로드 전에 실행되어야 함. */}
        <Script id="consent-default" strategy="beforeInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',functionality_storage:'granted',security_storage:'granted',wait_for_update:500});gtag('set','url_passthrough',true);gtag('set','ads_data_redaction',true);try{var m=document.cookie.match(/(?:^|; )cln_consent=([^;]*)/);if(m){var c=JSON.parse(decodeURIComponent(m[1]));if(c&&c.v==='${CONSENT_POLICY_VERSION}'){gtag('consent','update',{ad_storage:c.marketing?'granted':'denied',ad_user_data:c.marketing?'granted':'denied',ad_personalization:c.marketing?'granted':'denied',analytics_storage:c.analytics?'granted':'denied'});}}}catch(e){}`}
        </Script>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="preload"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
          as="style"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <ToastProvider>
          <AppChrome>
            {children}
          </AppChrome>
        </ToastProvider>
      </body>
    </html>
  );
}
