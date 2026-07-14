// Classin 다운로드 데이터 (단일 소스)
// 버전 갱신 시 이 파일만 수정한다. URL은 공식 CDN(download.eeo.cn / eeo.cn)이며
// HubSpot 추적 파라미터(__hstc 등)는 제거한 상태로 유지한다.

export const CLASSIN_VERSION = "6.0.8"

export type PlatformId = "windows" | "mac" | "mobile" | "linux" | "classinx"
export type DetectedOs = "windows" | "mac" | "ios" | "android"
export type DownloadIcon = "windows" | "apple" | "mobile" | "linux" | "classinx"

export interface DownloadVariant {
  label: string
  href: string
  matchOs?: Extract<DetectedOs, "ios" | "android">
}

export interface DownloadPlatform {
  id: PlatformId
  os: string
  note?: string
  icon: DownloadIcon
  variants: DownloadVariant[]
}

export const PRIMARY_DOWNLOADS: DownloadPlatform[] = [
  {
    id: "windows",
    os: "Windows",
    note: "Windows 7 이상",
    icon: "windows",
    variants: [
      {
        label: "다운로드",
        href: "https://download.eeo.cn/client/classin_win_install_6.0.8.2730_s.exe",
      },
    ],
  },
  {
    id: "mac",
    os: "macOS",
    icon: "apple",
    variants: [
      {
        label: "Intel",
        href: "https://download.eeo.cn/client/classin_mac_install_6.0.8.2734_s.dmg",
      },
      {
        label: "Apple Silicon",
        href: "https://download.eeo.cn/client/classin_mac_install_6.0.8.2735_arm64.dmg",
      },
    ],
  },
  {
    id: "mobile",
    os: "모바일",
    note: "iOS · Android",
    icon: "mobile",
    variants: [
      {
        label: "App Store",
        href: "https://apps.apple.com/app/classin/id1226361488",
        matchOs: "ios",
      },
      {
        label: "Google Play",
        href: "https://play.google.com/store/apps/details?id=cn.eeo.classin",
        matchOs: "android",
      },
    ],
  },
]

export const SECONDARY_DOWNLOADS: DownloadPlatform[] = [
  {
    id: "linux",
    os: "Linux",
    note: ".deb",
    icon: "linux",
    variants: [
      {
        label: "x86_64",
        href: "https://www.eeo.cn/download/client/classin_6.0.8.2737_amd64.deb",
      },
      {
        label: "arm64",
        href: "https://www.eeo.cn/download/client/classin_6.0.8.2738_arm64.deb",
      },
    ],
  },
  {
    id: "classinx",
    os: "ClassIn X",
    note: "교실용 · Windows",
    icon: "classinx",
    variants: [
      {
        label: "64bit",
        href: "https://download.eeo.cn/client/classinx_win_install_6.0.8.2733_x64.exe",
      },
      {
        label: "32bit",
        href: "https://download.eeo.cn/client/classinx_win_install_6.0.8.2732_s.exe",
      },
    ],
  },
]

export function detectPrimaryOs(userAgent: string): DetectedOs {
  const ua = userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return "ios"
  if (/android/.test(ua)) return "android"
  if (/macintosh|mac os x/.test(ua)) return "mac"
  return "windows"
}

// 자동 감지된 OS를 상단 하이라이트에 쓸 주요 플랫폼으로 매핑한다.
export function highlightPlatformId(
  os: DetectedOs,
): Extract<PlatformId, "windows" | "mac" | "mobile"> {
  if (os === "mac") return "mac"
  if (os === "ios" || os === "android") return "mobile"
  return "windows"
}
