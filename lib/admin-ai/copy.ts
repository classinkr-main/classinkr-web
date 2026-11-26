// 클립보드 복사 — 실패하면 false 를 돌려주고 화면이 주소를 직접 고를 수 있게 폴백한다.
// 클립보드 권한이 막힌 브라우저·http 주소·포커스 없는 문서에서 writeText 는 던지거나 거절한다.

export interface ClipboardLike {
  writeText(text: string): Promise<void>
}

export async function copyText(
  text: string,
  clipboard: ClipboardLike | undefined = typeof navigator === "undefined" ? undefined : navigator.clipboard
): Promise<boolean> {
  if (!clipboard || typeof clipboard.writeText !== "function") return false
  try {
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
