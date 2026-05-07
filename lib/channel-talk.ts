declare global {
  interface Window {
    ChannelIO?: ((command: string, ...args: unknown[]) => void) & {
      q?: unknown[]
      c?: (args: unknown) => void
    }
    ChannelIOInitialized?: boolean
    ChannelIOBooted?: boolean
  }
}

export function isChannelTalkConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_CHANNEL_PLUGIN_KEY)
}

function ensureChannelTalkStub() {
  if (typeof window === "undefined") return null
  if (window.ChannelIO) return window.ChannelIO

  const ch = function (...args: unknown[]) {
    ch.c?.(args)
  } as ((command: string, ...args: unknown[]) => void) & {
    q?: unknown[]
    c?: (args: unknown) => void
  }

  ch.q = []
  ch.c = (args) => {
    ch.q?.push(args)
  }
  window.ChannelIO = ch
  return ch
}

function loadChannelTalkScript() {
  if (typeof document === "undefined" || window.ChannelIOInitialized) return

  window.ChannelIOInitialized = true
  const script = document.createElement("script")
  script.type = "text/javascript"
  script.async = true
  script.src = "https://cdn.channel.io/plugin/ch-plugin-web.js"
  const first = document.getElementsByTagName("script")[0]
  first?.parentNode?.insertBefore(script, first)
}

export function bootChannelTalk() {
  if (typeof window === "undefined") return false

  const pluginKey = process.env.NEXT_PUBLIC_CHANNEL_PLUGIN_KEY
  if (!pluginKey) return false

  const channel = ensureChannelTalkStub()
  if (!channel) return false

  loadChannelTalkScript()

  if (!window.ChannelIOBooted) {
    window.ChannelIOBooted = true
    channel("boot", { pluginKey, hideChannelButtonOnBoot: true })
  }

  return true
}

export function openChannelTalk() {
  if (!bootChannelTalk()) return false
  if (typeof window === "undefined" || typeof window.ChannelIO !== "function") return false

  window.ChannelIO("showMessenger")
  return true
}

export {}
