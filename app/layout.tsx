import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { AppChrome } from "@/components/AppChrome";
import { JsonLd } from "@/components/seo/JsonLd";
import Script from "next/script";
import { CONSENT_POLICY_VERSION } from "@/lib/consent/consent";
import { GA4_MEASUREMENT_ID, GOOGLE_ADS_ID } from "@/lib/analytics-config";
import {
  DEFAULT_OG_IMAGE_PATH,
  DEFAULT_SITE_TITLE,
  DEFAULT_TWITTER_IMAGE_PATH,
  createOrganizationJsonLd,
  createWebsiteJsonLd,
  SITE_NAME,
  SITE_URL,
} from "@/lib/seo";
import { CLASSIN_POSITIONING } from "@/lib/classin-positioning";


export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: CLASSIN_POSITIONING.metadataDescription,
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: DEFAULT_SITE_TITLE,
    description: CLASSIN_POSITIONING.metadataDescription,
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "ko_KR",
    type: "website",
    images: [{ url: DEFAULT_OG_IMAGE_PATH }],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_SITE_TITLE,
    description: CLASSIN_POSITIONING.metadataDescription,
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
        {/* Google Ads + GA4 (gtag.js) — 위 Consent Mode 기본값 이후에 로드.
            이 블록이 gtag 부트스트랩의 **유일한 정본**이다. 과거에 동일한 next/script id를
            쓰는 사본이 components/GoogleAdsScript.tsx 에도 있었는데, next/script는
            `id || src`를 키로 dedupe하므로 먼저 커밋되는 이 쪽이 항상 이기고 사본은
            죽은 코드였다 — 사본에만 있던 send_page_view:false 와 /admin 제외가 모두
            무력화되어 GA4가 page_view를 이중 계측하고 어드민 트래픽까지 집계됐다. */}
        <Script
          id="gtag-ads-src"
          src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
          strategy="afterInteractive"
        />
        {/* page_view는 PageViewTracker가 수동으로 보낸다(send_page_view:false).
            /admin은 내부 직원용이라 config 자체를 건너뛴다 — 루트 레이아웃은 서버
            컴포넌트라 pathname을 못 읽으므로 런타임에 location으로 판별한다. */}
        <Script id="gtag-ads-init" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());if(!location.pathname.startsWith('/admin')){gtag('config',${JSON.stringify(GOOGLE_ADS_ID)});${GA4_MEASUREMENT_ID ? `gtag('config',${JSON.stringify(GA4_MEASUREMENT_ID)},{send_page_view:false});` : ""}}`}
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
