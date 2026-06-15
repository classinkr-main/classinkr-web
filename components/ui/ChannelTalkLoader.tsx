"use client"

import { useEffect } from "react"

import {
  bootChannelTalk,
  CHANNEL_TALK_INTENT_EVENT,
  shutdownChannelTalk,
  type ChannelTalkBootOptions,
} from "@/lib/channel-talk"
import { CONSENT_CHANGE_EVENT, currentChoice } from "@/lib/consent/consent"

/**
 * 채널톡 위젯 생명주기를 동의 상태에 맞춰 관리한다.
 *  - 마케팅 동의가 있으면 위젯을 미리 부트(버튼 숨김)해 핸드오프 시 즉시 연결.
 *  - 동의가 철회되면 즉시 shutdown.
 *  - CHANNEL_TALK_INTENT_EVENT(사용자 명시 요청)는 동의와 무관하게 부트.
 * AppChrome(공개 페이지)에서 마운트된다.
 */
export function ChannelTalkLoader() {
  useEffect(() => {
    const syncWithConsent = () => {
      if (currentChoice().marketing) {
        bootChannelTalk()
      } else {
        shutdownChannelTalk()
      }
    }

    const onIntent = (event: Event) => {
      const detail = (event as CustomEvent<Omit<ChannelTalkBootOptions, "force">>).detail
      bootChannelTalk({ force: true, ...detail })
    }

    syncWithConsent()
    window.addEventListener(CHANNEL_TALK_INTENT_EVENT, onIntent)
    window.addEventListener(CONSENT_CHANGE_EVENT, syncWithConsent)

    return () => {
      window.removeEventListener(CHANNEL_TALK_INTENT_EVENT, onIntent)
      window.removeEventListener(CONSENT_CHANGE_EVENT, syncWithConsent)
    }
  }, [])

  return null
}
