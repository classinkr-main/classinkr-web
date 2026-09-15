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
        {/*
          Google Ads(gtag.js) 로더는 여기 두지 않는다. 이 파일(RootLayout)은 서버 컴포넌트라
          pathname을 모르므로 /admin에도 무조건 렌더됐었다 — components/GoogleAdsScript.tsx가
          이미 pathname.startsWith("/admin")로 걸러 AppChrome(레이아웃 아래, body 안)에서
          렌더하는데, 여기서 같은 스크립트를 "전 페이지 공통"이라는 이유로 또 심어 그 필터를
          완전히 우회하고 있었다(감사 실측: /admin/crm/customers/leads 진입 시
          googlesyndication.com/ccm/collect에 dl=…/admin/…가 전송됨 — 운영자 페이지뷰가 광고
          전환 데이터에 섞이고 고객 키가 든 어드민 URL이 외부로 나감). 공개 페이지는
          GoogleAdsScript가 AppChrome을 통해 계속 로드하므로(GTMScript도 동일 패턴) 계측
          손실 없이 중복 로드만 없앤다. 위 Consent Mode 기본값(consent-default) 스크립트는
          네트워크 요청이 없는 로컬 dataLayer 설정이라 그대로 둔다 — 공개 페이지의 Consent
          Mode 동작에 영향 없음.
        */}
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
