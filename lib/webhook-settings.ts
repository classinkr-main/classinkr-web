/**
 * 웹훅 설정 키의 단일 진실 원천 — 타입, env 매핑, 라벨을 여기 하나로 모은다.
 * 이 목록이 세 군데(설정 화면, PATCH 검증, 연동 상태)로 흩어져 있으면
 * 새 웹훅을 추가할 때 한 곳이 조용히 빠진다. server-only 를 붙이지 않는다 —
 * 설정 화면(클라이언트 컴포넌트)이 같은 목록을 그린다.
 */

export const WEBHOOK_SETTING_KEYS = [
  "googleSheetWebhookUrl",
  "leadWebhookUrl",
  "channelTalkWebhookUrl",
  "wecomOpsWebhookUrl",
  "wecomLeadReportWebhookUrl",
  "wecomCsWebhookUrl",
  "wecomCriticalWebhookUrl",
  "kakaoAlimtalkWebhookUrl",
  "emailWebhookUrl",
] as const

export type WebhookSettingKey = (typeof WEBHOOK_SETTING_KEYS)[number]

export const WEBHOOK_SETTING_ENV_KEYS = {
  googleSheetWebhookUrl: "GOOGLE_SHEET_WEBHOOK_URL",
  leadWebhookUrl: "LEAD_WEBHOOK_URL",
  channelTalkWebhookUrl: "CHANNEL_TALK_WEBHOOK_URL",
  wecomOpsWebhookUrl: "WECOM_OPS_WEBHOOK_URL",
  wecomLeadReportWebhookUrl: "WECOM_LEAD_REPORT_WEBHOOK_URL",
  wecomCsWebhookUrl: "WECOM_CS_WEBHOOK_URL",
  wecomCriticalWebhookUrl: "WECOM_CRITICAL_WEBHOOK_URL",
  kakaoAlimtalkWebhookUrl: "KAKAO_ALIMTALK_WEBHOOK_URL",
  emailWebhookUrl: "EMAIL_WEBHOOK_URL",
} as const satisfies Record<WebhookSettingKey, string>

/** 켜짐/꺼짐 맵. 키가 없으면 켜짐으로 본다 — 새 웹훅이 조용히 꺼진 채 추가되지 않게. */
export type WebhookEnabledMap = Partial<Record<WebhookSettingKey, boolean>>

export function isWebhookEnabled(
  enabled: WebhookEnabledMap | undefined,
  key: WebhookSettingKey
) {
  return enabled?.[key] !== false
}

export function normalizeWebhookEnabledMap(raw: unknown): WebhookEnabledMap {
  if (!raw || typeof raw !== "object") return {}

  const source = raw as Record<string, unknown>
  const result: WebhookEnabledMap = {}

  for (const key of WEBHOOK_SETTING_KEYS) {
    // 명시적으로 false 인 키만 저장한다. 기본값(켜짐)을 굳이 적어두면
    // 나중에 기본값을 바꿔도 옛 행이 옛 값을 계속 붙들고 있게 된다.
    if (source[key] === false) result[key] = false
  }

  return result
}
