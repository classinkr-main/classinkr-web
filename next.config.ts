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
const supabaseWs = supabaseHost ? `wss://${supabaseHost}` : "wss://*.supabase.co";
const developmentScriptPolicy =
  process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${developmentScriptPolicy} blob: https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://t1.daumcdn.net https://*.daumcdn.net https://cdn.channel.io https://js.tosspayments.com`,
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com",
  `img-src 'self' data: blob: https://images.unsplash.com ${supabaseHttp} https://www.facebook.com https://*.kakao.com https://*.daumcdn.net https://www.googletagmanager.com https://maps.google.com`,
  `connect-src 'self' ${supabaseHttp} ${supabaseWs} https://www.google-analytics.com https://region1.google-analytics.com https://www.facebook.com https://*.kakao.com https://*.channel.io wss://*.channel.io https://*.tosspayments.com`,
  "frame-src 'self' https://www.googletagmanager.com https://maps.google.com https://*.tosspayments.com https://*.toss.im",
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
    optimizePackageImports: ["framer-motion"],
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
};

export default nextConfig;
