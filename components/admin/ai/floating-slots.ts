// 갈매봇 버튼의 자리 — 우하단을 이미 쓰는 화면에서는 그 위로 비켜난다(기획 §11.5).
//
// 화면의 주 작업 버튼이 자리를 지키고 갈매봇이 올라간다. 지금은 경로 표로 관리한다.
// 화면이 "우하단을 얼마만큼 쓰는지" 직접 알리는 방식으로 바꾸면 이 표는 없어진다 —
// 그 전까지는 우하단에 떠 있는 요소를 새로 만드는 화면이 여기에 한 줄을 더한다.

interface FloatingSlot {
  prefix: string
  /** 갈매봇 버튼 아래에 비워 둘 높이(px, 화면 아래 끝 기준). */
  bottom: number
  note: string
}

export const DEFAULT_LAUNCHER_BOTTOM = 24

const SLOTS: readonly FloatingSlot[] = [
  { prefix: "/admin/hardware", bottom: 84, note: "빠른 기록 버튼(HardwareInventoryClient)" },
  { prefix: "/admin/branch/ledger", bottom: 88, note: "떠 있는 요약 버튼(SalesLedgerWorkbench)" },
]

export function resolveLauncherBottom(pathname: string): number {
  let best: FloatingSlot | null = null
  for (const slot of SLOTS) {
    const matches = pathname === slot.prefix || pathname.startsWith(`${slot.prefix}/`)
    if (matches && (!best || slot.prefix.length > best.prefix.length)) best = slot
  }
  return best?.bottom ?? DEFAULT_LAUNCHER_BOTTOM
}
