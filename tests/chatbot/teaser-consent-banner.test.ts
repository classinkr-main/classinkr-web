import { describe, expect, it } from "vitest"

import {
  nextTeaserTick,
  teaserStorageMode,
  TEASER_STORAGE_KEY,
  type StoredTeaserState,
} from "@/components/ui/useChatbotTeaser"
import { TEASER_DWELL_THRESHOLD_MS } from "@/lib/chatbot/teaser-policy"

const fresh: StoredTeaserState = { shown: false, dismissed: false, openedBefore: false, dwellMs: 0 }

function runTicks(start: StoredTeaserState, ticks: number, bannerBlocking: boolean) {
  let state = start
  let revealedAt = -1
  for (let i = 1; i <= ticks; i += 1) {
    const result = nextTeaserTick(state, { isEligible: true, bannerBlocking })
    state = result.state
    if (result.reveal && revealedAt < 0) revealedAt = i
  }
  return { state, revealedAt }
}

// CX-05: 쿠키 배너가 떠 있는 동안 체류를 쌓으면, 동의를 누르는 순간 티저가 튀어나온다
describe("티저 체류와 쿠키 배너", () => {
  it("배너가 떠 있는 동안은 120초가 지나도 쌓지 않고 보이지 않는다", () => {
    const { state, revealedAt } = runTicks(fresh, 200, true)
    expect(state.dwellMs).toBe(0)
    expect(state.shown).toBe(false)
    expect(revealedAt).toBe(-1)
  })

  it("배너가 뜨면 아직 보이지 않은 체류는 0으로 되돌리고, 닫힌 뒤 처음부터 120초를 센다", () => {
    const almost = { ...fresh, dwellMs: TEASER_DWELL_THRESHOLD_MS - 1000 }
    const blocked = nextTeaserTick(almost, { isEligible: true, bannerBlocking: true })
    expect(blocked.state.dwellMs).toBe(0)
    expect(blocked.reveal).toBe(false)

    const { revealedAt } = runTicks(blocked.state, 130, false)
    expect(revealedAt).toBe(TEASER_DWELL_THRESHOLD_MS / 1000)
  })

  it("이미 보인 티저의 기록은 배너가 다시 떠도 지우지 않는다", () => {
    const shown = { ...fresh, shown: true, dwellMs: TEASER_DWELL_THRESHOLD_MS }
    expect(nextTeaserTick(shown, { isEligible: true, bannerBlocking: true }).state).toBe(shown)
  })

  it("배너가 없을 때 체류 규칙은 전과 같다(세션당 한 번, 닫거나 열어 본 뒤에는 없음)", () => {
    expect(runTicks(fresh, 119, false).revealedAt).toBe(-1)
    expect(runTicks({ ...fresh, dismissed: true }, 200, false).revealedAt).toBe(-1)
    expect(runTicks({ ...fresh, openedBefore: true }, 200, false).revealedAt).toBe(-1)
    expect(nextTeaserTick(fresh, { isEligible: false, bannerBlocking: false }).reveal).toBe(false)
  })
})

// 쿠키 점검 C3·tech-12: '필수만'·철회 때 classin.chatbot.teaser 를 지운다
describe("티저 기록 저장과 쿠키 동의", () => {
  it("저장 키는 classin.chatbot.teaser 다(처리방침 표와 같은 이름)", () => {
    expect(TEASER_STORAGE_KEY).toBe("classin.chatbot.teaser")
  })

  it("고르기 전에는 쓰지도 지우지도 않는다", () => {
    expect(teaserStorageMode(false, { analytics: false, marketing: false })).toBe("memory")
  })

  it("'필수만'이거나 모두 철회하면 지운다", () => {
    expect(teaserStorageMode(true, { analytics: false, marketing: false })).toBe("clear")
  })

  it("선택 쿠키를 하나라도 켜면 남긴다", () => {
    expect(teaserStorageMode(true, { analytics: true, marketing: false })).toBe("persist")
    expect(teaserStorageMode(true, { analytics: false, marketing: true })).toBe("persist")
    expect(teaserStorageMode(true, { analytics: true, marketing: true })).toBe("persist")
  })
})
