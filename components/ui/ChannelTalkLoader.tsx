"use client"

import { useEffect } from "react"

import {
  bootChannelTalk,
  CHANNEL_TALK_INTENT_EVENT,
  clearPersistentChatbotId,
  getChannelTalkMemberId,
  openChannelTalk,
  shutdownChannelTalk,
  type ChannelTalkBootOptions,
} from "@/lib/channel-talk"
import { CONSENT_CHANGE_EVENT, currentChoice } from "@/lib/consent/consent"

/**
 * 채널톡 위젯 생명주기를 동의 상태에 맞춰 관리한다.
 *  - 마케팅 동의가 있으면 위젯을 미리 부트(버튼 숨김)해 핸드오프 시 즉시 연결.
 *  - 동의가 없거나 철회되면 즉시 shutdown 하고 챗봇 영구 식별값을 지운다(쿠키 점검 C3).
 *  - CHANNEL_TALK_INTENT_EVENT(사용자 명시 요청)는 동의와 무관하게 부트하되, 동의가 없으면 회원 id 를 싣지 않는다(C8).
 *  - 회원 id 는 채널톡 키가 있을 때만 만든다 — 키가 없는데 페이지를 열기만 해도 영구 식별값이 생기던 문제(C3).
 * AppChrome(공개 페이지)에서 마운트된다.
 */
export function ChannelTalkLoader() {
  useEffect(() => {
    const bootOptions = (): Omit<ChannelTalkBootOptions, "force"> => {
      const memberId = getChannelTalkMemberId()
      return memberId ? { memberId } : {}
    }

    const syncWithConsent = () => {
      if (currentChoice().marketing) {
        bootChannelTalk(bootOptions())
      } else {
        shutdownChannelTalk()
        clearPersistentChatbotId()
      }
    }

    const onIntent = (event: Event) => {
      const detail = (event as CustomEvent<Omit<ChannelTalkBootOptions, "force">>).detail
      openChannelTalk({ ...bootOptions(), ...(detail ?? {}) })
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
