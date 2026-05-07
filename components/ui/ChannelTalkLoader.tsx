"use client"

import { useEffect } from "react"
import { bootChannelTalk } from "@/lib/channel-talk"

export function ChannelTalkLoader() {
  useEffect(() => {
    const onIntent = () => {
      bootChannelTalk()
    }

    window.addEventListener("classin:channel-talk-intent", onIntent)
    return () => window.removeEventListener("classin:channel-talk-intent", onIntent)
  }, [])

  return null
}
