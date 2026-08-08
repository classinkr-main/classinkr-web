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
