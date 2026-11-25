interface ComposerKeyState {
  key: string
  shiftKey: boolean
  isComposing: boolean
  keyCode: number
}

export function shouldSubmitComposerOnKeyDown(event: ComposerKeyState) {
  const isImeComposing = event.isComposing || event.keyCode === 229
  return event.key === "Enter" && !event.shiftKey && !isImeComposing
}

interface ShortcutKeyState {
  key?: string
  code?: string
  altKey: boolean
  shiftKey: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

/** 입력 칸 안에서는 단축키를 가로채지 않는다. */
export function isEditableTarget(target: { tagName?: string; isContentEditable?: boolean } | null | undefined) {
  const tag = target?.tagName
  return tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT" || Boolean(target?.isContentEditable)
}

/** Alt+Shift+N — 새 상담(입력창 밖에서). 맥락 비우기에는 실수 방지를 위해 단축키를 두지 않는다. */
export function isNewCaseShortcut(event: ShortcutKeyState) {
  return event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === "KeyN"
}

/** '?' — 단축키 목록(입력창 밖에서). */
export function isHelpShortcut(event: ShortcutKeyState) {
  return event.key === "?" && !event.altKey && !event.ctrlKey && !event.metaKey
}
