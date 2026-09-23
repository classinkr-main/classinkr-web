// 브라우저 전용 — 텍스트 파일 내려받기와 클립보드 복사(라운드 5 B1~B3). 텍스트 조립은 lib/export/delimited.ts.

/** CSV 텍스트를 파일로 내려받는다. 엑셀이 UTF-8 한글을 깨뜨리지 않게 BOM을 붙인다. */
export function downloadCsvFile(fileName: string, csvText: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return
  const blob = new Blob(["﻿", csvText], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName.endsWith(".csv") ? fileName : `${fileName}.csv`
  anchor.rel = "noopener"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // 일부 브라우저는 click 직후 revoke하면 내려받기가 끊긴다 — 한 틱 뒤에 정리한다.
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * 클립보드에 텍스트를 쓴다. 비보안 컨텍스트·권한 거부로 navigator.clipboard가 막히면 textarea 선택 복사로
 * 한 번 더 시도한다. 성공 여부를 돌려준다 — 호출부가 "복사됨"을 거짓으로 말하지 않게.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined" || typeof document === "undefined") return false
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 아래 폴백으로 계속한다.
  }
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.top = "-1000px"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.select()
  let copied = false
  try {
    copied = document.execCommand("copy")
  } catch {
    copied = false
  }
  textarea.remove()
  // 복사 뒤 원래 포커스로 돌려 키보드 흐름(매트릭스 셀 선택 등)을 끊지 않는다.
  active?.focus({ preventScroll: true })
  return copied
}
