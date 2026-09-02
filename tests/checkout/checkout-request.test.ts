import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 결제창 무결제 도입 신청(POST /api/checkout/request) 백엔드.
 * Supabase·리드 캡처·알림 전송은 전부 모킹하고, 검증 규칙과 WeCom 본문만 검증한다.
 */

const OPS_WEBHOOK_URL = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=ops-room"

/**
 * 시계 고정 — desiredDate 검증은 KST 오늘(now) 기준 [내일, +365일] 창과 비교하는데,
 * submitCheckoutRequest 는 now 주입 인자가 없어 실제 시계를 타면 아래 리터럴 픽스처
 * 날짜가 언젠가 과거가 되어 파일 전체가 죽는다. setSystemTime 은 Date 만 모킹하므로
 * 타이머·프로미스는 실제로 돈다. 명시적 now 를 넘기는 KST 경계 테스트에는 영향이 없다.
 */
const FIXED_NOW = new Date("2026-08-01T09:00:00+09:00")

/** 하드웨어 라인은 실제 카탈로그 sku 여야 통과한다(서버가 SSOT 와 대조한다). */
const VALID_PAYLOAD = {
  kind: "hardware",
  items: [
    {
      sku: "hw-board-86",
      name: '86" Classin 전자칠판',
      qty: 2,
      unitAmount: 6_300_000,
      currency: "KRW",
    },
  ],
  org: "행복학원",
  name: "김원장",
  phone: "010-1234-5678",
  email: "won@happy.co.kr",
  installType: "wall",
  address: "서울시 강남구 테헤란로 123, 4층",
  desiredDate: "2026-08-10", // FIXED_NOW(KST 8/1) 기준 +9일 — 검증 창 [내일, +365일] 안
  memo: "2층 교실 먼저 설치 희망",
  sourcePage: "/product/hw",
  consent: true,
}

/** 소프트웨어 라인은 sku 접두사만 검사하고 금액은 클램프한다(충전액이 동적이라 핀 불가). */
const SOFTWARE_PAYLOAD = {
  ...VALID_PAYLOAD,
  kind: "software",
  items: [
    {
      sku: "sw-business-recharge",
      name: "충전형 Business 선충전 ₩2,000,000",
      qty: 1,
      unitAmount: 2_000_000,
      currency: "KRW",
    },
  ],
}

interface SupabaseCall {
  table: string
  values: Record<string, unknown>
}

interface SupabaseUpdateCall extends SupabaseCall {
  column: string
  match: unknown
}

function createSupabaseStub(insertError: string | null) {
  const inserts: SupabaseCall[] = []
  const updates: SupabaseUpdateCall[] = []

  const createSupabaseAdminClient = vi.fn(() => ({
    from(table: string) {
      return {
        insert(values: Record<string, unknown>) {
          inserts.push({ table, values })
          return {
            select: () => ({
              single: async () =>
                insertError
                  ? { data: null, error: { message: insertError } }
                  : { data: { id: "req-uuid-1" }, error: null },
            }),
          }
        },
        update(values: Record<string, unknown>) {
          return {
            eq: async (column: string, match: unknown) => {
              updates.push({ table, values, column, match })
              return { error: null }
            },
          }
        },
      }
    },
  }))

  return { createSupabaseAdminClient, inserts, updates }
}

/** 알림 실패가 신청 저장을 깨지 않는지 보기 위해 실패 주입을 옵션으로 둔다. */
interface LoadOptions {
  insertError?: string | null
  leadId?: string | null
  emitError?: Error
}

/** 오케스트레이션 검증용 — emitNotificationEvent 자체를 모킹한다. */
async function loadWithMockedNotifications(options: LoadOptions = {}) {
  vi.resetModules()

  const supabase = createSupabaseStub(options.insertError ?? null)
  const leadId = options.leadId === undefined ? "lead-uuid-1" : options.leadId
  const submitLeadCapture = vi.fn().mockResolvedValue({
    status: 200,
    body: leadId
      ? { ok: true, stored: true, warnings: [], leadId }
      : { ok: false, error: "저장 실패" },
  })
  const emitNotificationEvent = options.emitError
    ? vi.fn().mockRejectedValue(options.emitError)
    : vi.fn().mockResolvedValue({ id: "event-1" })

  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: supabase.createSupabaseAdminClient,
  }))
  vi.doMock("@/lib/server/lead-capture", () => ({ submitLeadCapture }))
  vi.doMock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent }))

  const mod = await import("@/lib/checkout-requests")
  return { ...mod, supabase, submitLeadCapture, emitNotificationEvent }
}

/** WeCom 본문 검증용 — emit-event 는 진짜로 돌리고 leaf 의존성만 모킹한다. */
async function loadWithRealNotifications() {
  vi.resetModules()
  // doMock 등록은 resetModules 로 지워지지 않는다 — 앞선 테스트가 건 emit-event 모킹을 명시적으로 푼다.
  vi.doUnmock("@/lib/notifications/emit-event")

  const supabase = createSupabaseStub(null)
  const postJson = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  const submitLeadCapture = vi.fn().mockResolvedValue({
    status: 200,
    body: { ok: true, stored: true, warnings: [], leadId: "lead-uuid-1" },
  })

  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: supabase.createSupabaseAdminClient,
  }))
  vi.doMock("@/lib/server/lead-capture", () => ({ submitLeadCapture }))
  vi.doMock("@/lib/repositories/settings", () => ({
    getResolvedSettings: vi.fn().mockResolvedValue({
      wecomOpsWebhookUrl: OPS_WEBHOOK_URL,
      notificationAppearance: {},
      notificationDigestEmailList: [],
    }),
  }))
  vi.doMock("@/lib/server/post-json", () => ({ postJson }))
  vi.doMock("@/lib/email", () => ({
    sendInternalNotification: vi.fn(),
    wrapNotificationHtml: vi.fn(),
  }))
  vi.doMock("@/lib/notifications/presentation", () => ({
    resolveNotificationPresentation: vi.fn().mockReturnValue({
      iconKey: "users",
      tone: "blue",
    }),
  }))
  vi.doMock("@/lib/notifications/repository", () => ({
    createDeliveryLog: vi.fn().mockResolvedValue(undefined),
    createInAppNotifications: vi.fn().mockResolvedValue(undefined),
    createNotificationEvent: vi.fn().mockResolvedValue({ id: "event-1" }),
  }))

  const mod = await import("@/lib/checkout-requests")
  return { ...mod, supabase, postJson }
}

/** deferTask 를 결정적으로 만든다 — after() 대신 테스트가 직접 flush 한다. */
function createDeferred() {
  const tasks: Promise<unknown>[] = []
  return {
    context: {
      deferTask: (task: () => Promise<void>) => {
        tasks.push(task())
      },
    },
    flush: async () => {
      await Promise.all(tasks)
    },
  }
}

beforeEach(() => {
  vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("normalizeCheckoutRequest — 필수 필드", () => {
  it("동의하지 않으면 consent 필드로 거부한다", async () => {
    const { normalizeCheckoutRequest } = await loadWithMockedNotifications()

    expect(normalizeCheckoutRequest({ ...VALID_PAYLOAD, consent: false })).toEqual({
      ok: false,
      field: "consent",
    })
    expect(normalizeCheckoutRequest({ ...VALID_PAYLOAD, consent: "true" })).toEqual({
      ok: false,
      field: "consent",
    })
  })

  it("kind·org·name·phone 이 비면 해당 필드를 알려준다", async () => {
    const { normalizeCheckoutRequest } = await loadWithMockedNotifications()

    expect(normalizeCheckoutRequest({ ...VALID_PAYLOAD, kind: "furniture" }).ok).toBe(false)
    expect(normalizeCheckoutRequest({ ...VALID_PAYLOAD, kind: "furniture" })).toMatchObject({
      field: "kind",
    })
    expect(normalizeCheckoutRequest({ ...VALID_PAYLOAD, org: "   " })).toMatchObject({
      field: "org",
    })
    expect(normalizeCheckoutRequest({ ...VALID_PAYLOAD, name: undefined })).toMatchObject({
      field: "name",
    })
    expect(normalizeCheckoutRequest({ ...VALID_PAYLOAD, phone: "1234" })).toMatchObject({
      field: "phone",
    })
  })

  it("설치 유형은 하드웨어만 stand/wall 필수 — 소프트웨어는 무시한다", async () => {
    const { normalizeCheckoutRequest } = await loadWithMockedNotifications()

    expect(normalizeCheckoutRequest({ ...VALID_PAYLOAD, installType: undefined })).toMatchObject({
      field: "installType",
    })
    expect(normalizeCheckoutRequest({ ...VALID_PAYLOAD, installType: "ceiling" })).toMatchObject({
      field: "installType",
    })

    const hardware = normalizeCheckoutRequest(VALID_PAYLOAD)
    expect(hardware.ok && hardware.value.installType).toBe("wall")

    const software = normalizeCheckoutRequest({ ...SOFTWARE_PAYLOAD, installType: undefined })
    expect(software.ok).toBe(true)
    const softwareWithType = normalizeCheckoutRequest(SOFTWARE_PAYLOAD)
    expect(softwareWithType.ok && softwareWithType.value.installType).toBeNull()
  })

  it("주소는 하드웨어만 필수 — 소프트웨어는 보내와도 무시한다", async () => {
    const { normalizeCheckoutRequest } = await loadWithMockedNotifications()

    // 하드웨어: 누락·공백이면 field:'address' 로 거부.
    expect(normalizeCheckoutRequest({ ...VALID_PAYLOAD, address: undefined })).toMatchObject({
      field: "address",
    })
    expect(normalizeCheckoutRequest({ ...VALID_PAYLOAD, address: "   " })).toMatchObject({
      field: "address",
    })

    // 하드웨어 정상: 정규화되어 저장된다.
    const hardware = normalizeCheckoutRequest(VALID_PAYLOAD)
    expect(hardware.ok && hardware.value.address).toBe("서울시 강남구 테헤란로 123, 4층")

    // 소프트웨어: 주소 없이 통과하고, 보내와도 null 로 무시된다.
    const software = normalizeCheckoutRequest({ ...SOFTWARE_PAYLOAD, address: undefined })
    expect(software.ok).toBe(true)
    const softwareWithAddress = normalizeCheckoutRequest(SOFTWARE_PAYLOAD)
    expect(softwareWithAddress.ok && softwareWithAddress.value.address).toBeNull()
  })

  it("이메일은 선택이지만 값이 있으면 형식을 본다", async () => {
    const { normalizeCheckoutRequest } = await loadWithMockedNotifications()

    const withoutEmail = normalizeCheckoutRequest({ ...VALID_PAYLOAD, email: "" })
    expect(withoutEmail.ok).toBe(true)
    expect(withoutEmail.ok && withoutEmail.value.email).toBeNull()

    expect(normalizeCheckoutRequest({ ...VALID_PAYLOAD, email: "nope@nope" })).toMatchObject({
      field: "email",
    })
  })

  it("전화번호는 한국형을 관대하게 받는다", async () => {
    const { normalizeCheckoutRequest } = await loadWithMockedNotifications()

    for (const phone of ["+82 10-1234-5678", "010 1234 5678", "02-123-4567", "0212345678"]) {
      expect(normalizeCheckoutRequest({ ...VALID_PAYLOAD, phone }).ok).toBe(true)
    }
    // 9자리 미만 / 11자리 초과는 거부
    expect(normalizeCheckoutRequest({ ...VALID_PAYLOAD, phone: "12345678" })).toMatchObject({
      field: "phone",
    })
    expect(normalizeCheckoutRequest({ ...VALID_PAYLOAD, phone: "010123456789" })).toMatchObject({
      field: "phone",
    })
  })

  it("품목은 1~20개만 받는다", async () => {
    const { normalizeCheckoutRequest } = await loadWithMockedNotifications()

    expect(normalizeCheckoutRequest({ ...VALID_PAYLOAD, items: [] })).toMatchObject({
      field: "items",
    })
    expect(normalizeCheckoutRequest({ ...VALID_PAYLOAD, items: "HW-1" })).toMatchObject({
      field: "items",
    })

    const tooMany = Array.from({ length: 21 }, () => VALID_PAYLOAD.items[0])
    expect(normalizeCheckoutRequest({ ...VALID_PAYLOAD, items: tooMany })).toMatchObject({
      field: "items",
    })

    const twenty = Array.from({ length: 20 }, () => VALID_PAYLOAD.items[0])
    expect(normalizeCheckoutRequest({ ...VALID_PAYLOAD, items: twenty }).ok).toBe(true)
  })

  it("소프트웨어 라인의 통화가 KRW/USD 가 아니면 거부한다", async () => {
    const { normalizeCheckoutRequest } = await loadWithMockedNotifications()

    const items = [{ ...SOFTWARE_PAYLOAD.items[0], currency: "CNY" }]
    expect(normalizeCheckoutRequest({ ...SOFTWARE_PAYLOAD, items })).toMatchObject({
      field: "items",
    })
  })
})

describe("normalizeCheckoutRequest — 하드웨어는 카탈로그가 진실", () => {
  it("카탈로그에 없는 sku 는 거부한다", async () => {
    const { normalizeCheckoutRequest } = await loadWithMockedNotifications()

    for (const sku of ["HW-BOARD-65", "hw-unknown", "", undefined]) {
      expect(
        normalizeCheckoutRequest({
          ...VALID_PAYLOAD,
          items: [{ ...VALID_PAYLOAD.items[0], sku }],
        })
      ).toMatchObject({ field: "items" })
    }
  })

  it("클라이언트가 보낸 이름·단가·통화를 카탈로그 값으로 덮어쓴다", async () => {
    const { normalizeCheckoutRequest } = await loadWithMockedNotifications()

    // ₩1 위조 시도 — sku 만 진짜고 나머지는 전부 조작한 페이로드.
    const result = normalizeCheckoutRequest({
      ...VALID_PAYLOAD,
      items: [
        {
          sku: "hw-board-86",
          name: "86인치 무료 증정",
          qty: 1,
          unitAmount: 1,
          currency: "USD",
        },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.items[0]).toEqual({
      sku: "hw-board-86",
      name: '86" Classin 전자칠판',
      qty: 1,
      unitAmount: 6_300_000,
      currency: "KRW",
      lineAmount: 6_300_000,
    })
    expect(result.value.totalAmount).toBe(6_300_000)
    expect(result.value.currency).toBe("KRW")
  })
})

describe("normalizeCheckoutRequest — 소프트웨어 라인", () => {
  it("sw- 접두사가 아닌 sku 는 거부한다", async () => {
    const { normalizeCheckoutRequest } = await loadWithMockedNotifications()

    for (const sku of ["hw-board-86", "business-recharge", undefined]) {
      expect(
        normalizeCheckoutRequest({
          ...SOFTWARE_PAYLOAD,
          items: [{ ...SOFTWARE_PAYLOAD.items[0], sku }],
        })
      ).toMatchObject({ field: "items" })
    }

    expect(normalizeCheckoutRequest(SOFTWARE_PAYLOAD).ok).toBe(true)
  })

  it("단가는 5천만 상한으로 클램프한다(카탈로그 핀 불가)", async () => {
    const { normalizeCheckoutRequest } = await loadWithMockedNotifications()

    const result = normalizeCheckoutRequest({
      ...SOFTWARE_PAYLOAD,
      items: [{ ...SOFTWARE_PAYLOAD.items[0], unitAmount: 9_000_000_000 }],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.items[0].unitAmount).toBe(50_000_000)
  })
})

describe("normalizeCheckoutRequest — 희망 날짜(KST 경계)", () => {
  it("KST 로 넘어간 자정 직후에는 그 날짜(=당일)까지 거부한다", async () => {
    const { normalizeCheckoutRequest } = await loadWithMockedNotifications()
    // UTC 2026-07-27 15:30 = KST 2026-07-28 00:30 → KST 기준 오늘은 7/28, 최소 신청일은 7/29
    const now = new Date("2026-07-27T15:30:00Z")

    expect(
      normalizeCheckoutRequest({ ...VALID_PAYLOAD, desiredDate: "2026-07-27" }, now)
    ).toMatchObject({ field: "desiredDate" })
    expect(
      normalizeCheckoutRequest({ ...VALID_PAYLOAD, desiredDate: "2026-07-28" }, now)
    ).toMatchObject({ field: "desiredDate" })
    expect(
      normalizeCheckoutRequest({ ...VALID_PAYLOAD, desiredDate: "2026-07-29" }, now).ok
    ).toBe(true)
  })

  it("당일·과거는 거부하고 내일부터 받는다(프론트 캘린더와 같은 계약)", async () => {
    const { normalizeCheckoutRequest } = await loadWithMockedNotifications()
    // UTC 2026-07-27 14:00 = KST 2026-07-27 23:00 → KST 기준 오늘은 여전히 7/27
    const now = new Date("2026-07-27T14:00:00Z")

    for (const desiredDate of ["2026-07-26", "2026-07-27"]) {
      expect(
        normalizeCheckoutRequest({ ...VALID_PAYLOAD, desiredDate }, now)
      ).toMatchObject({ field: "desiredDate" })
    }
    expect(
      normalizeCheckoutRequest({ ...VALID_PAYLOAD, desiredDate: "2026-07-28" }, now).ok
    ).toBe(true)
  })

  it("오늘 +365 일까지만 받는다 — 상한 없는 먼 미래는 거부", async () => {
    const { normalizeCheckoutRequest, MAX_DESIRED_DATE_ADVANCE_DAYS } =
      await loadWithMockedNotifications()
    const now = new Date("2026-07-27T14:00:00Z")

    expect(MAX_DESIRED_DATE_ADVANCE_DAYS).toBe(365)
    expect(
      normalizeCheckoutRequest({ ...VALID_PAYLOAD, desiredDate: "2027-07-27" }, now).ok
    ).toBe(true)
    for (const desiredDate of ["2027-07-28", "9999-12-31"]) {
      expect(
        normalizeCheckoutRequest({ ...VALID_PAYLOAD, desiredDate }, now)
      ).toMatchObject({ field: "desiredDate" })
    }
  })

  it("형식이나 달력에 없는 날짜는 거부한다", async () => {
    const { normalizeCheckoutRequest } = await loadWithMockedNotifications()
    const now = new Date("2026-01-01T00:00:00Z")

    for (const desiredDate of ["2026/08/10", "20260810", "2026-02-30", "", "내일"]) {
      expect(normalizeCheckoutRequest({ ...VALID_PAYLOAD, desiredDate }, now)).toMatchObject({
        field: "desiredDate",
      })
    }
  })
})

describe("normalizeCheckoutRequest — 수량·금액·합계", () => {
  it("수량은 1~99 로, 단가는 0 이상으로 클램프한다", async () => {
    const { normalizeCheckoutRequest } = await loadWithMockedNotifications()

    const result = normalizeCheckoutRequest({
      ...SOFTWARE_PAYLOAD,
      items: [
        { sku: "sw-a", name: "A", qty: 0, unitAmount: 1000, currency: "KRW" },
        { sku: "sw-b", name: "B", qty: 500, unitAmount: 1000, currency: "KRW" },
        { sku: "sw-c", name: "C", qty: 2, unitAmount: -9999, currency: "KRW" },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.items.map((item) => item.qty)).toEqual([1, 99, 2])
    expect(result.value.items.map((item) => item.unitAmount)).toEqual([1000, 1000, 0])
    // 합계는 클램프된 값 기준으로 서버가 다시 계산한다.
    expect(result.value.items.map((item) => item.lineAmount)).toEqual([1000, 99_000, 0])
    expect(result.value.totalAmount).toBe(100_000)
  })

  it("하드웨어 수량도 1~99 로 클램프하되 단가는 카탈로그 값이다", async () => {
    const { normalizeCheckoutRequest } = await loadWithMockedNotifications()

    const result = normalizeCheckoutRequest({
      ...VALID_PAYLOAD,
      items: [{ sku: "hw-camera-t1", name: "무시됨", qty: 500, unitAmount: 0, currency: "KRW" }],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.items[0].qty).toBe(99)
    expect(result.value.items[0].unitAmount).toBe(1_200_000)
    expect(result.value.totalAmount).toBe(1_200_000 * 99)
  })

  it("클라이언트가 보낸 합계는 무시하고 서버가 재계산한다", async () => {
    const { normalizeCheckoutRequest } = await loadWithMockedNotifications()

    const result = normalizeCheckoutRequest({
      ...VALID_PAYLOAD,
      total: 1,
      totalAmount: 1,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.totalAmount).toBe(12_600_000)
    expect(result.value.currency).toBe("KRW")
  })

  it("숫자 문자열도 받아 계산한다", async () => {
    const { normalizeCheckoutRequest } = await loadWithMockedNotifications()

    const result = normalizeCheckoutRequest({
      ...SOFTWARE_PAYLOAD,
      items: [{ sku: "sw-a", name: "A", qty: "3", unitAmount: "1,500", currency: "KRW" }],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.totalAmount).toBe(4500)
  })

  it("통화가 섞이면 소계가 큰 통화를 대표로 두고 내역은 보존한다", async () => {
    const { normalizeCheckoutRequest, formatCheckoutTotals } =
      await loadWithMockedNotifications()

    const result = normalizeCheckoutRequest({
      ...SOFTWARE_PAYLOAD,
      items: [
        { sku: "sw-seat", name: "SW 계정", qty: 10, unitAmount: 12, currency: "USD" },
        { sku: "sw-business-recharge", name: "선충전", qty: 1, unitAmount: 2_500_000, currency: "KRW" },
      ],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.currency).toBe("KRW")
    expect(result.value.totalAmount).toBe(2_500_000)
    expect(result.value.totals).toEqual([
      { currency: "USD", amount: 120 },
      { currency: "KRW", amount: 2_500_000 },
    ])
    expect(formatCheckoutTotals(result.value)).toBe("$120.00 + ₩2,500,000")
  })
})

describe("submitCheckoutRequest — 저장 · 리드 연동 · 알림", () => {
  it("신청 행을 저장하고 requestId 를 돌려준다", async () => {
    const { submitCheckoutRequest, supabase } = await loadWithMockedNotifications()
    const deferred = createDeferred()

    const result = await submitCheckoutRequest(VALID_PAYLOAD, deferred.context)
    await deferred.flush()

    expect(result).toEqual({ status: 200, body: { ok: true, requestId: "req-uuid-1" } })
    expect(supabase.inserts).toHaveLength(1)
    expect(supabase.inserts[0].table).toBe("checkout_requests")
    expect(supabase.inserts[0].values).toMatchObject({
      kind: "hardware",
      total_amount: 12_600_000,
      currency: "KRW",
      org: "행복학원",
      name: "김원장",
      phone: "010-1234-5678",
      email: "won@happy.co.kr",
      desired_date: "2026-08-10",
      source_page: "/product/hw",
      status: "new",
    })
    expect(supabase.inserts[0].values.items).toHaveLength(1)
  })

  it("리드 큐에 미러링하고 lead.created 알림은 끈다", async () => {
    const { submitCheckoutRequest, submitLeadCapture, supabase } =
      await loadWithMockedNotifications()
    const deferred = createDeferred()

    await submitCheckoutRequest(VALID_PAYLOAD, deferred.context)
    await deferred.flush()

    expect(submitLeadCapture).toHaveBeenCalledTimes(1)
    const [leadPayload, leadContext] = submitLeadCapture.mock.calls[0]
    expect(leadPayload).toMatchObject({
      source: "contact_page",
      org: "행복학원",
      phone: "010-1234-5678",
      sourceDetail: "checkout_request:hardware",
      currentPage: "/product/hw",
      marketingConsent: false,
    })
    expect(leadPayload.message).toContain('86" Classin 전자칠판')
    expect(leadPayload.message).toContain("희망 날짜: 2026-08-10")
    expect(leadPayload.message).toContain("신청 번호: req-uuid-1")
    expect(leadContext).toEqual({ suppressLeadCreatedNotification: true })

    // 만들어진 리드를 신청 행에 되묶는다.
    expect(supabase.updates).toEqual([
      {
        table: "checkout_requests",
        values: { lead_id: "lead-uuid-1" },
        column: "id",
        match: "req-uuid-1",
      },
    ])
  })

  it("ops 알림을 정확히 1건만 보낸다", async () => {
    const { submitCheckoutRequest, emitNotificationEvent } =
      await loadWithMockedNotifications()
    const deferred = createDeferred()

    await submitCheckoutRequest(VALID_PAYLOAD, deferred.context)
    await deferred.flush()

    expect(emitNotificationEvent).toHaveBeenCalledTimes(1)
    expect(emitNotificationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "checkout.request_created",
        channels: ["wecom_webhook"],
        routeUrl: "/admin/crm/customers/leads?lead=lead-uuid-1",
        sourceId: "req-uuid-1",
      })
    )
    expect(emitNotificationEvent.mock.calls[0][0].payload).toMatchObject({
      requestId: "req-uuid-1",
      leadId: "lead-uuid-1",
      desiredDate: "2026-08-10",
      totalLabel: "₩12,600,000",
      itemCount: 1,
    })
  })

  it("리드 미러링이 실패해도 알림은 그대로 1건 나간다", async () => {
    const { submitCheckoutRequest, emitNotificationEvent, supabase } =
      await loadWithMockedNotifications({ leadId: null })
    const deferred = createDeferred()

    const result = await submitCheckoutRequest(VALID_PAYLOAD, deferred.context)
    await deferred.flush()

    expect(result.status).toBe(200)
    expect(supabase.updates).toHaveLength(0)
    expect(emitNotificationEvent).toHaveBeenCalledTimes(1)
    expect(emitNotificationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        routeUrl: "/admin/crm/customers/leads?filter=unconfirmed",
      })
    )
  })

  it("알림이 실패해도 신청 저장은 성공으로 남는다", async () => {
    const { submitCheckoutRequest, supabase } = await loadWithMockedNotifications({
      emitError: new Error("wecom down"),
    })
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const deferred = createDeferred()

    const result = await submitCheckoutRequest(VALID_PAYLOAD, deferred.context)
    await expect(deferred.flush()).resolves.toBeUndefined()

    expect(result).toEqual({ status: 200, body: { ok: true, requestId: "req-uuid-1" } })
    expect(supabase.inserts).toHaveLength(1)
    expect(consoleError).toHaveBeenCalled()
  })

  it("신청 행 저장이 실패하면 500 이고 후속 처리도 하지 않는다", async () => {
    const { submitCheckoutRequest, submitLeadCapture, emitNotificationEvent } =
      await loadWithMockedNotifications({ insertError: "permission denied" })
    vi.spyOn(console, "error").mockImplementation(() => {})
    const deferred = createDeferred()

    const result = await submitCheckoutRequest(VALID_PAYLOAD, deferred.context)
    await deferred.flush()

    expect(result).toEqual({ status: 500, body: { ok: false } })
    expect(submitLeadCapture).not.toHaveBeenCalled()
    expect(emitNotificationEvent).not.toHaveBeenCalled()
  })

  it("검증에 걸리면 400 validation + field 를 돌려준다", async () => {
    const { submitCheckoutRequest, supabase } = await loadWithMockedNotifications()

    const result = await submitCheckoutRequest({ ...VALID_PAYLOAD, consent: false })

    expect(result).toEqual({
      status: 400,
      body: { ok: false, error: "validation", field: "consent" },
    })
    expect(supabase.inserts).toHaveLength(0)
  })

  it("같은 신청을 연속으로 보내면 행도 알림도 늘지 않는다", async () => {
    const { submitCheckoutRequest, supabase, emitNotificationEvent } =
      await loadWithMockedNotifications()
    const deferred = createDeferred()

    const first = await submitCheckoutRequest(VALID_PAYLOAD, deferred.context)
    const second = await submitCheckoutRequest(VALID_PAYLOAD, deferred.context)
    await deferred.flush()

    expect(second).toEqual(first)
    expect(supabase.inserts).toHaveLength(1)
    expect(emitNotificationEvent).toHaveBeenCalledTimes(1)
  })

  it("총액·품목 수가 같아도 구성이 다르면 별개 신청으로 접수한다", async () => {
    const { submitCheckoutRequest, supabase, emitNotificationEvent } =
      await loadWithMockedNotifications()
    const deferred = createDeferred()

    // 둘 다 ₩10,800,000 · 품목 1줄 — 구성 해시가 없으면 두 번째가 흡수돼 사라진다.
    await submitCheckoutRequest(
      {
        ...VALID_PAYLOAD,
        items: [{ sku: "hw-board-75", name: "75", qty: 2, unitAmount: 5_400_000, currency: "KRW" }],
      },
      deferred.context
    )
    await submitCheckoutRequest(
      {
        ...VALID_PAYLOAD,
        items: [{ sku: "hw-camera-t1", name: "T1", qty: 9, unitAmount: 1_200_000, currency: "KRW" }],
      },
      deferred.context
    )
    await deferred.flush()

    expect(supabase.inserts).toHaveLength(2)
    expect(supabase.inserts[0].values.total_amount).toBe(10_800_000)
    expect(supabase.inserts[1].values.total_amount).toBe(10_800_000)
    expect(emitNotificationEvent).toHaveBeenCalledTimes(2)
  })
})

describe("WeCom ops 알림 본문", () => {
  it("품목·금액·희망 날짜·연락처를 모두 담아 ops 방으로 1건 보낸다", async () => {
    const { submitCheckoutRequest, postJson } = await loadWithRealNotifications()
    const deferred = createDeferred()

    await submitCheckoutRequest(
      {
        ...VALID_PAYLOAD,
        items: [
          VALID_PAYLOAD.items[0],
          {
            sku: "hw-camera-t1",
            name: "AI Tracking Camera (T1)",
            qty: 1,
            unitAmount: 1_200_000,
            currency: "KRW",
          },
        ],
      },
      deferred.context
    )
    await deferred.flush()

    expect(postJson).toHaveBeenCalledTimes(1)
    const [url, payload] = postJson.mock.calls[0]
    expect(url).toBe(OPS_WEBHOOK_URL)
    expect(payload.msgtype).toBe("text")

    const content = payload.text.content as string
    expect(content).toContain("하드웨어 도입 신청이 1건 들어왔습니다")
    expect(content).toContain("학원: 행복학원")
    expect(content).toContain("담당자: 김원장")
    expect(content).toContain("연락처: 010-1234-5678")
    expect(content).toContain("이메일: won@happy.co.kr")
    expect(content).toContain("설치 유형: 벽걸이형")
    expect(content).toContain("설치/배송 주소: 서울시 강남구 테헤란로 123, 4층")
    expect(content).toContain("희망 날짜: 2026-08-10")
    expect(content).toContain("품목 2개")
    expect(content).toContain('- 86" Classin 전자칠판 (hw-board-86) × 2 = ₩12,600,000')
    expect(content).toContain("- AI Tracking Camera (T1) (hw-camera-t1) × 1 = ₩1,200,000")
    expect(content).toContain("합계: ₩13,800,000")
    expect(content).toContain("메모: 2층 교실 먼저 설치 희망")
    expect(content).toContain("신청 경로: /product/hw")
    expect(content).toContain("신청 번호: req-uuid-1")
    expect(content).toContain("/admin/crm/customers/leads?lead=lead-uuid-1")
  })

  it("품목이 많으면 앞부분만 펼치고 나머지는 접는다", async () => {
    const { submitCheckoutRequest, postJson } = await loadWithRealNotifications()
    const deferred = createDeferred()

    // 14줄이 필요해 카탈로그 고정이 없는 소프트웨어 라인을 쓴다.
    await submitCheckoutRequest(
      {
        ...SOFTWARE_PAYLOAD,
        items: Array.from({ length: 14 }, (_, index) => ({
          sku: `sw-item-${index}`,
          name: `품목 ${index}`,
          qty: 1,
          unitAmount: 1000,
          currency: "KRW",
        })),
      },
      deferred.context
    )
    await deferred.flush()

    const content = postJson.mock.calls[0][1].text.content as string
    expect(content).toContain("품목 14개")
    expect(content).toContain("- 품목 9 (sw-item-9) × 1 = ₩1,000")
    expect(content).not.toContain("- 품목 10 (sw-item-10)")
    expect(content).toContain("- 외 4건")
    expect(content).toContain("합계: ₩14,000")
  })
})

describe("설치 라인 서버 검증", () => {
  /**
   * 설치는 화면 카드가 아니라 신청 단계에서 고르는 방식이라 HARDWARE_CATALOG 밖에 있다.
   * 서버는 getHardwareItem 으로 하드웨어 라인의 단가를 핀하는데, 설치 sku 가 거기서
   * 안 잡히면 라인이 조용히 버려져 설치비가 0원으로 접수된다.
   */
  it("설치 라인을 카탈로그 단가로 핀해서 받는다", async () => {
    const { normalizeCheckoutRequest } = await loadWithMockedNotifications()
    const result = normalizeCheckoutRequest(
      {
        ...VALID_PAYLOAD,
        items: [
          { sku: "hw-board-86", name: '86" Classin 전자칠판', qty: 2, unitAmount: 6_300_000, currency: "KRW" },
          { sku: "hw-install-wall", name: "벽걸이 설치", qty: 2, unitAmount: 500_000, currency: "KRW" },
        ],
      },
      FIXED_NOW
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const installLine = result.value.items.find((item) => item.sku === "hw-install-wall")
    expect(installLine).toBeDefined()
    expect(installLine?.unitAmount).toBe(500_000)
    expect(installLine?.lineAmount).toBe(1_000_000)
    // 630만원 × 2 + 설치 50만원 × 2
    expect(result.value.totalAmount).toBe(13_600_000)
  })

  it("클라이언트가 설치 단가를 낮춰 보내도 카탈로그 값으로 되돌린다", async () => {
    const { normalizeCheckoutRequest } = await loadWithMockedNotifications()
    const result = normalizeCheckoutRequest(
      {
        ...VALID_PAYLOAD,
        items: [
          { sku: "hw-install-stand", name: "이동형 스탠드 설치", qty: 1, unitAmount: 1, currency: "KRW" },
        ],
      },
      FIXED_NOW
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.items[0].unitAmount).toBe(500_000)
  })
})
