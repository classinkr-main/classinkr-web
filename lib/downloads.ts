// Classin 다운로드 데이터 (단일 소스)
// 버전 갱신 시 이 파일만 수정한다. URL은 공식 CDN(download.eeo.cn / eeo.cn)이며
// HubSpot 추적 파라미터(__hstc 등)는 제거한 상태로 유지한다.
// bytes 는 CDN 응답의 Content-Length 실측값이다(6.0.8, 2026-11-04). URL 을 바꾸면 같이 다시 잰다:
//   curl -sI <url> | grep -i content-length

export const CLASSIN_VERSION = "6.0.8"

export type PlatformId = "windows" | "mac" | "mobile" | "linux" | "classinx"
export type DetectedOs = "windows" | "mac" | "ios" | "android"
export type DownloadIcon = "windows" | "apple" | "mobile" | "linux" | "classinx"

export interface DownloadVariant {
  label: string
  href: string
  matchOs?: Extract<DetectedOs, "ios" | "android">
  /** 설치 파일 크기(Content-Length). 스토어 링크에는 없다 */
  bytes?: number
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
        bytes: 271399128,
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
        bytes: 374103137,
      },
      {
        label: "Apple Silicon",
        href: "https://download.eeo.cn/client/classin_mac_install_6.0.8.2735_arm64.dmg",
        bytes: 379543611,
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
        bytes: 477240652,
      },
      {
        label: "arm64",
        href: "https://www.eeo.cn/download/client/classin_6.0.8.2738_arm64.deb",
        bytes: 444679008,
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
        bytes: 480791224,
      },
      {
        label: "32bit",
        href: "https://download.eeo.cn/client/classinx_win_install_6.0.8.2732_s.exe",
        bytes: 271600440,
      },
    ],
  },
]

// iPadOS 13+ Safari 는 데스크톱 Mac UA 를 보낸다 — 터치 포인트가 2개 이상인 "Mac"은 iPad 로 본다(.dmg 를 권하지 않게)
export function detectPrimaryOs(userAgent: string, maxTouchPoints = 0): DetectedOs {
  const ua = userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return "ios"
  if (/android/.test(ua)) return "android"
  if (/macintosh|mac os x/.test(ua)) return maxTouchPoints > 1 ? "ios" : "mac"
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

// 앱 스토어로 가는 링크인지(파일을 직접 내려받지 않는다)
export function isStoreVariant(variant: DownloadVariant): boolean {
  return variant.matchOs !== undefined
}

// 설치 파일 확장자(.exe·.dmg·.deb). 스토어 링크는 null
export function fileExtension(variant: DownloadVariant): string | null {
  if (isStoreVariant(variant)) return null
  const match = /\.([a-z0-9]+)$/i.exec(new URL(variant.href).pathname)
  return match ? `.${match[1].toLowerCase()}` : null
}

// 버튼 옆 파일 크기 — 1024 단위 MB, 정수 반올림(대략값이라 소수는 두지 않는다)
export function formatFileSize(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)}MB`
}

export type MacChip = "apple-silicon" | "intel"

// Chromium 의 navigator.userAgentData.getHighEntropyValues(["architecture"]) 값 → Mac 칩.
// Safari·Firefox 는 값을 주지 않으므로 null(= 모름, 화면은 Apple Silicon 을 먼저 권한다)
export function macChipFromArchitecture(architecture: string | null | undefined): MacChip | null {
  if (architecture === "arm") return "apple-silicon"
  if (architecture === "x86") return "intel"
  return null
}
