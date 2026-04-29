declare global {
  interface Window {
    ChannelIO?: ((command: string, ...args: unknown[]) => void) & {
      q?: unknown[]
      c?: (args: unknown) => void
    }
    ChannelIOInitialized?: boolean
  }
}

export function isChannelTalkConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_CHANNEL_PLUGIN_KEY)
}

export function openChannelTalk() {
  if (typeof window === "undefined") return false
  if (typeof window.ChannelIO !== "function") return false
  window.ChannelIO("showMessenger")
  return true
}

export {}
