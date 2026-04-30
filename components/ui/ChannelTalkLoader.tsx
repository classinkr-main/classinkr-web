"use client"

import { useEffect } from "react"

export function ChannelTalkLoader() {
  useEffect(() => {
    const pluginKey = process.env.NEXT_PUBLIC_CHANNEL_PLUGIN_KEY
    if (!pluginKey) return
    if (typeof window === "undefined") return
    if (window.ChannelIO) return

    const w = window
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
    w.ChannelIO = ch

    const loadScript = () => {
      if (w.ChannelIOInitialized) return
      w.ChannelIOInitialized = true
      const script = document.createElement("script")
      script.type = "text/javascript"
      script.async = true
      script.src = "https://cdn.channel.io/plugin/ch-plugin-web.js"
      const first = document.getElementsByTagName("script")[0]
      first?.parentNode?.insertBefore(script, first)
    }

    if (document.readyState === "complete") {
      loadScript()
    } else {
      window.addEventListener("DOMContentLoaded", loadScript)
      window.addEventListener("load", loadScript)
    }

    w.ChannelIO?.("boot", { pluginKey, hideChannelButtonOnBoot: true })
  }, [])

  return null
}
