import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return value ? new URL(value).hostname : undefined;
  } catch {
    return undefined;
  }
})();

const supabaseHttp = supabaseHost ? `https://${supabaseHost}` : "https://*.supabase.co";
const supabaseImageSources = supabaseHost
  ? `https://${supabaseHost} https://*.supabase.co`
  : "https://*.supabase.co";
const supabaseWs = supabaseHost ? `wss://${supabaseHost}` : "wss://*.supabase.co";
const siteOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://classin.co.kr");
  } catch {
    return new URL("https://classin.co.kr");
  }
})();
const developmentScriptPolicy =
  process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";

// script-src의 'unsafe-inline'은 GTM·Meta Pixel의 인라인 부트스트랩 때문에 필요하다.
// nonce 기반 CSP로 옮기면 모든 공개 페이지가 동적 렌더링으로 강등되어 ISR/SSG 캐싱을 잃으므로
// (마케팅 사이트 특성상 손해가 더 큼) 의도적으로 유지한다. 외부 도메인 추가 시 용도를 주석으로 남길 것.
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // GTM/GA, Google Ads 전환, Meta Pixel, 카카오(daumcdn), 채널톡, 토스페이먼츠 스크립트
  `script-src 'self' 'unsafe-inline'${developmentScriptPolicy} blob: https://www.googletagmanager.com https://www.google-analytics.com https://googleads.g.doubleclick.net https://www.googleadservices.com https://connect.facebook.net https://t1.daumcdn.net https://*.daumcdn.net https://cdn.channel.io https://js.tosspayments.com`,
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com",
  // unsplash(블로그 이미지), Supabase Storage, 픽셀/지도/카카오/Google Ads 이미지
  `img-src 'self' data: blob: https://images.unsplash.com ${supabaseImageSources} https://www.facebook.com https://*.kakao.com https://*.daumcdn.net https://www.googletagmanager.com https://maps.google.com https://www.google.com https://googleads.g.doubleclick.net https://www.googleadservices.com`,
  // Supabase API/Realtime, GA/Google Ads 수집, 채널톡 웹소켓, 토스 결제
  `connect-src 'self' ${supabaseHttp} ${supabaseWs} https://www.google-analytics.com https://region1.google-analytics.com https://www.google.com https://googleads.g.doubleclick.net https://www.googleadservices.com https://www.facebook.com https://*.kakao.com https://*.channel.io wss://*.channel.io https://*.tosspayments.com https://cdn.jsdelivr.net`,
  // GTM 미리보기, 구글 지도 embed, 토스 결제창
  "frame-src 'self' https://www.googletagmanager.com https://maps.google.com https://www.google.com https://*.tosspayments.com https://*.toss.im",
  "media-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
];

const publicAssetCacheHeaders = [
  {
    key: "Cache-Control",
    value: "public, max-age=31536000, immutable",
  },
];

const nextConfig: NextConfig = {
  images: {
    localPatterns: [
      {
        pathname: "/**",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "**.supabase.co",
        pathname: "/storage/v1/object/**",
      },
      {
        protocol: siteOrigin.protocol.replace(":", "") as "http" | "https",
        hostname: siteOrigin.hostname,
        ...(siteOrigin.port ? { port: siteOrigin.port } : {}),
      },
      ...(supabaseHost
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseHost,
            },
          ]
        : []),
    ],
  },
  experimental: {
    optimizePackageImports: ["framer-motion", "lucide-react"],
  },
  async headers() {
    return [
      {
        source: "/images/:path*",
        headers: publicAssetCacheHeaders,
      },
      {
        source: "/video/:path*",
        headers: publicAssetCacheHeaders,
      },
      {
        source: "/docs/files/classin-verification-business-registration.pdf",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-store",
          },
        ],
      },
      {
        source: "/docs/files/:path*",
        headers: publicAssetCacheHeaders,
      },
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/blog/2026-asia-ai-education-forum-busan",
        destination: "/blog/2026-asia-ai-education-forum-in-busan",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
