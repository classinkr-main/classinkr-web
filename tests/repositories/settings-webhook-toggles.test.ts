import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 설정 화면은 전체 객체를 PATCH 한다. 그래서 "patch 에 없는 키를 어떻게 다루는가"가
 * 곧 데이터 손실 여부다 — 다른 탭에서 저장했을 때 웹훅 스위치와 발송 시각이
 * 조용히 초기화되면 안 된다.
 */

let storedRow: Record<string, unknown>
let readError: { code: string } | null
let upsertedRow: Record<string, unknown> | null

function makeClient() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: readError ? null : storedRow, error: readError }),
        }),
      }),
      upsert: (row: Record<string, unknown>) => {
        upsertedRow = row
        storedRow = { ...storedRow, ...row }
        return {
          select: () => ({
            single: async () => ({ data: storedRow, error: null }),
          }),
        }
      },
    }),
  }
}

async function loadRepo() {
  vi.resetModules()
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: () => makeClient(),
  }))
  return import("@/lib/repositories/settings")
}

beforeEach(() => {
  readError = null
  upsertedRow = null
  storedRow = {
    id: "default",
    demo_form_enabled: true,
    blog_section_enabled: true,
    wecom_lead_report_webhook_url: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=a",
    wecom_ops_webhook_url: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=b",
    notification_digest_email_list: [],
    notification_appearance_json: {},
    webhook_enabled_json: { wecomOpsWebhookUrl: false },
    notification_schedule_json: {
      leadDaily: {
        deliveryHourKst: 8,
        windowEndHourKst: 7,
        windowEndMinuteKst: 30,
        weekdaysOnly: false,
      },
    },
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("웹훅 스위치·발송 시각 저장", () => {
  it("꺼진 웹훅도 URL 은 그대로 읽어온다 — 발송만 멈추는 것이므로", async () => {
    const { getSettings } = await loadRepo()

    const settings = await getSettings()

    expect(settings.wecomOpsWebhookUrl).toBe(
      "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=b"
    )
    expect(settings.webhookEnabled).toEqual({ wecomOpsWebhookUrl: false })
  })

  it("patch 에 없으면 스위치와 스케줄을 건드리지 않는다", async () => {
    const { updateSettings, clearResolvedSettingsCache } = await loadRepo()
    clearResolvedSettingsCache()

    // 일반 탭 필드만 바꾼 저장
    const next = await updateSettings({ demoBannerText: "점검 안내" })

    expect(next.webhookEnabled).toEqual({ wecomOpsWebhookUrl: false })
    expect(next.notificationSchedule.leadDaily.deliveryHourKst).toBe(8)
    expect(upsertedRow?.webhook_enabled_json).toEqual({ wecomOpsWebhookUrl: false })
  })

  it("스위치를 켜면 키가 지워진다 — 저장되는 건 꺼둔 것뿐이다", async () => {
    const { updateSettings, clearResolvedSettingsCache } = await loadRepo()
    clearResolvedSettingsCache()

    const next = await updateSettings({ webhookEnabled: {} })

    expect(next.webhookEnabled).toEqual({})
    expect(upsertedRow?.webhook_enabled_json).toEqual({})
  })

  it("새 맵으로 다시 켜면 옛 false 값이 활성 상태를 덮어쓰지 않는다", async () => {
    storedRow.wecom_ops_webhook_enabled = false
    const { updateSettings, getSettings } = await loadRepo()
    await updateSettings({ webhookEnabled: {} })
    expect((await getSettings()).webhookEnabled).toEqual({})
    expect(upsertedRow?.wecom_ops_webhook_enabled).toBe(true)
  })

  it("설정 장애를 기본 켜짐으로 캐시하지 않고 복구 후 다시 읽는다", async () => {
    const { getResolvedSettings } = await loadRepo()
    readError = { code: "PGRST003" }
    await expect(getResolvedSettings()).rejects.toThrow("PGRST003")
    readError = null
    expect((await getResolvedSettings()).webhookEnabled).toEqual({ wecomOpsWebhookUrl: false })
  })

  it("범위를 벗어난 시각은 저장 단계에서 기본값으로 되돌린다", async () => {
    const { updateSettings, clearResolvedSettingsCache } = await loadRepo()
    clearResolvedSettingsCache()

    const next = await updateSettings({
      notificationSchedule: {
        leadDaily: {
          deliveryHourKst: 99,
          windowEndHourKst: 9,
          windowEndMinuteKst: 0,
          weekdaysOnly: true,
        },
      },
    })

    expect(next.notificationSchedule.leadDaily.deliveryHourKst).toBe(11)
    expect(next.notificationSchedule.leadDaily.windowEndHourKst).toBe(9)
  })

  it("빈 문자열은 여전히 '유지'다 — 마스킹된 화면이 값을 지우면 안 되므로", async () => {
    const { updateSettings, clearResolvedSettingsCache } = await loadRepo()
    clearResolvedSettingsCache()

    const next = await updateSettings({ wecomLeadReportWebhookUrl: "" })

    expect(next.wecomLeadReportWebhookUrl).toBe(
      "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=a"
    )
  })

  it("옛 boolean 컬럼만 있는 행도 새 스위치 맵으로 읽힌다", async () => {
    storedRow = {
      ...storedRow,
      webhook_enabled_json: undefined,
      wecom_ops_webhook_enabled: false,
    }
    const { getSettings } = await loadRepo()

    const settings = await getSettings()

    expect(settings.webhookEnabled).toEqual({ wecomOpsWebhookUrl: false })
  })
})
