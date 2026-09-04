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
// 자사 도메인 이미지 호스트 — lib/safe-public-url.ts 의 SAFE_SITE_IMAGE_HOSTS 와 반드시 같은 집합이어야 한다.
// (sanitize는 통과시키는데 remotePatterns/CSP에 없으면 이미지가 조용히 깨진다.)
// next.config.ts는 앱 모듈을 import하지 않으므로 목록을 복제하고,
// tests/blog/public-image-hosts.test.ts 가 두 목록의 동기화를 강제한다.
const siteImageHosts = Array.from(
  new Set(["classin.co.kr", "classin.ai.kr", siteOrigin.hostname]),
);
const siteImageSources = siteImageHosts.map((hostname) => `https://${hostname}`).join(" ");
const developmentScriptPolicy =
  process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";
const googleAdsSources = [
  "https://www.google.com",
  "https://www.google.co.kr",
  "https://googleads.g.doubleclick.net",
  "https://ad.doubleclick.net",
  "https://www.googleadservices.com",
  "https://pagead2.googlesyndication.com",
  "https://stats.g.doubleclick.net",
].join(" ");
const channelTalkDefaultSources =
  "https://*.channel.io https://*.channel.app https://*.cdninstagram.com";
const channelTalkConnectSources =
  "https://*.channel.io https://*.channel.app https://*.sentry.io wss://*.channel.io wss://*.desk-ws.channel.io wss://*.front-ws.channel.io";
const channelTalkScriptSources = "https://*.channel.io https://*.sentry-cdn.com";

// script-src의 'unsafe-inline'은 GTM·Meta Pixel의 인라인 부트스트랩 때문에 필요하다.
// nonce 기반 CSP로 옮기면 모든 공개 페이지가 동적 렌더링으로 강등되어 ISR/SSG 캐싱을 잃으므로
// (마케팅 사이트 특성상 손해가 더 큼) 의도적으로 유지한다. 외부 도메인 추가 시 용도를 주석으로 남길 것.
const contentSecurityPolicy = [
  `default-src 'self' ${channelTalkDefaultSources}`,
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // GTM/GA, Google Ads 전환, Meta Pixel, 카카오(daumcdn), 채널톡, 토스페이먼츠 스크립트
  `script-src 'self' 'unsafe-inline'${developmentScriptPolicy} blob: https://www.googletagmanager.com https://www.google-analytics.com https://googleads.g.doubleclick.net https://www.googleadservices.com https://connect.facebook.net https://t1.daumcdn.net https://*.daumcdn.net ${channelTalkScriptSources} https://js.tosspayments.com`,
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com",
  // unsplash(블로그 이미지), Supabase Storage, 픽셀/지도/카카오/Google Ads 이미지
  `img-src 'self' data: blob: https://images.unsplash.com ${supabaseImageSources} ${siteImageSources} https://www.facebook.com https://*.kakao.com https://*.daumcdn.net https://www.googletagmanager.com https://maps.google.com ${googleAdsSources} ${channelTalkDefaultSources}`,
  // Supabase API/Realtime, GA/Google Ads 수집, 채널톡 웹소켓, 토스 결제
  `connect-src 'self' ${supabaseHttp} ${supabaseWs} https://www.google-analytics.com https://region1.google-analytics.com ${googleAdsSources} https://www.facebook.com https://*.kakao.com ${channelTalkConnectSources} https://*.tosspayments.com https://cdn.jsdelivr.net`,
  // GTM 미리보기, 구글 지도 embed, 토스 결제창
  "frame-src 'self' https://www.googletagmanager.com https://maps.google.com https://www.google.com https://*.channel.io https://*.channel.app https://*.tosspayments.com https://*.toss.im",
  "media-src 'self' data: blob: https://cdn.channel.io",
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
  // 어드민 지속 캐시(session/localStorage)의 스키마 토큰 — lib/admin-client.ts가 읽기 키에 섞는다.
  // 배포마다 값이 달라져야 이전 배포의 응답 모양을 새 코드가 읽지 않는다(그 주석의 사고 참조).
  // Vercel이 주는 커밋 SHA를 쓰고, 없으면 "dev"로 고정해 로컬 개발 동작을 바꾸지 않는다.
  env: {
    NEXT_PUBLIC_ADMIN_CACHE_BUILD:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ??
      process.env.VERCEL_DEPLOYMENT_ID ??
      "dev",
  },
  // googleapis·exceljs는 순수 JS 대용량 패키지다. 서버 번들에 포함하지 않고 런타임에 Node가
  // node_modules에서 require하게 두면 빌드가 가벼워지고, lib/google.ts·xlsx-grid.ts의 지연
  // import(첫 호출 시 로드)와 합쳐져 서버 함수 콜드 스타트 번들이 줄어든다. 출력 파일 트레이싱은
  // external 패키지도 배포 아티팩트에 포함하므로 런타임 해석에는 영향이 없다.
  serverExternalPackages: ["googleapis", "exceljs"],
  images: {
    // 기본값은 webp 단독이다. avif를 앞에 두면 지원 브라우저에서 추가로 ~17% 더 줄어든다.
    formats: ["image/avif", "image/webp"],
    // /images/* 는 아래 publicAssetCacheHeaders 로 이미 immutable 이므로 변환본도 길게 잡는다.
    minimumCacheTTL: 31536000,
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
      ...siteImageHosts
        .filter((hostname) => hostname !== siteOrigin.hostname)
        .map((hostname) => ({ protocol: "https" as const, hostname })),
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
    // /admin 은 app/admin/layout.tsx가 force-dynamic이라 전 페이지가 dynamic이다. Next의
    // 클라이언트 라우터 캐시는 dynamic 페이지를 staleTimes.dynamic초만 보관하는데 기본값이
    // 0이라, 사이드바 탭을 클릭할 때마다(hover로 미리 받아 둔 것까지) RSC payload를
    // 서버에 다시 요청하고 loading.tsx 스켈레톤이 매번 뜬다 — 특히 서버 프리페치가 있는
    // 5개 화면(overview·CRM 홈·branch·branch/ledger·hardware)은 그 왕복에 1.2초 예산의
    // 서버 프리페치(lib/admin/prefetch-budget.ts)까지 얹혀 있어 Vercel Fluid의 콜드
    // 인스턴스에서 체감이 크다(로컬 실측 1~2.5초/재방문).
    // 180초는 "재사용된 서버 시드 initialData를 화면에 즉시 보여줘도 되는" 상한일 뿐이다 —
    // 뮤테이션 이후의 신선도는 여전히 lib/admin-client.ts의 클라이언트 SWR 캐시가 책임진다.
    // 재사용된 payload는 항상 "시드"로만 취급한다(lib/admin/prefetch-freshness.ts,
    // ADMIN_PREFETCH_FRESH_MS=10초보다 오래되면 각 소비 컴포넌트가 평소의 마운트 페치/재검증을
    // 그대로 수행한다) — 그래서 낡은 RSC payload가 더 신선한 클라이언트 데이터를 덮어쓰거나
    // 재검증을 막는 일은 없다. static은 기본값(300초)을 그대로 둔다.
    staleTimes: {
      dynamic: 180,
    },
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
