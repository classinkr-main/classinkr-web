import { describe, expect, it, vi } from "vitest"

import { completeConsentChoice } from "@/components/consent/ConsentBanner"
import { DENIED_CHOICE, GRANTED_CHOICE, type ConsentRecord } from "@/lib/consent/consent"

function record(overrides: Partial<ConsentRecord> = {}): ConsentRecord {
  return { v: "test", ts: 1, ...GRANTED_CHOICE, s: 1, ...overrides }
}

describe("동의 배너 저장 결과", () => {
  it("서버 확인 전인 허용은 완료하지 않고 재시도를 안내한다", async () => {
    const done = vi.fn()
    const retry = vi.fn()
    await completeConsentChoice(GRANTED_CHOICE, async () => record({ s: 0 }), done, retry)
    expect(done).not.toHaveBeenCalled()
    expect(retry).toHaveBeenCalledOnce()
  })

  it("서버가 확인한 동일한 선택만 완료한다", async () => {
    const done = vi.fn()
    const retry = vi.fn()
    await completeConsentChoice(GRANTED_CHOICE, async () => record(), done, retry)
    expect(done).toHaveBeenCalledOnce()
    expect(retry).not.toHaveBeenCalled()
  })

  it("다른 탭의 다른 선택이 반환되면 성공으로 닫지 않는다", async () => {
    const done = vi.fn()
    const retry = vi.fn()
    await completeConsentChoice(GRANTED_CHOICE, async () => record(DENIED_CHOICE), done, retry)
    expect(done).not.toHaveBeenCalled()
    expect(retry).toHaveBeenCalledOnce()
  })

  it("거절은 느린 서버 응답을 기다리지 않고 완료한다", async () => {
    const done = vi.fn()
    const retry = vi.fn()
    let resolveSave!: (value: ConsentRecord) => void
    const pending = completeConsentChoice(DENIED_CHOICE, () => new Promise((resolve) => {
      resolveSave = resolve
    }), done, retry)
    expect(done).toHaveBeenCalledOnce()
    expect(retry).not.toHaveBeenCalled()
    resolveSave(record({ ...DENIED_CHOICE, s: 0 }))
    await expect(pending).resolves.toBeUndefined()
  })

  it("거절 저장 자체가 실패하면 호출자가 오류를 처리할 수 있다", async () => {
    const done = vi.fn()
    const pending = completeConsentChoice(DENIED_CHOICE, async () => { throw new Error("failed") }, done, vi.fn())
    expect(done).toHaveBeenCalledOnce()
    await expect(pending).rejects.toThrow("failed")
  })
})
