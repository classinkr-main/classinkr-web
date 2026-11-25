import "server-only"

import { redactInternalCsText, safeInternalCsFileName } from "@/lib/internal-cs-chat/privacy"
import type { getInternalCsConversation } from "@/lib/repositories/internal-cs-chat"

type LoadedConversation = NonNullable<Awaited<ReturnType<typeof getInternalCsConversation>>>

// 분석 결과 안의 글(OCR 추출문 등)은 모양이 정해져 있지 않아 문자열 잎을 모두 가린다.
function redactDeep(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactInternalCsText(value)
  if (depth > 6) return null
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, depth + 1))
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactDeep(item, depth + 1)])
    )
  }
  return value
}

/**
 * 외부 AI 로 나가는 상담 맥락(웹훅 dispatch, 브리지 context.request 응답).
 * 본문·교정본·첨부 파일명·분석 요약·OCR 은 전화·이메일 같은 식별정보를 가린다.
 * 원본 첨부 포함을 명시적으로 켠 경우(includeOriginalAssets)에만 원문을 싣는다.
 */
export function buildInternalCsBridgeContext(loaded: LoadedConversation, includeOriginalAssets: boolean) {
  const text = (value: string | null) =>
    value == null ? null : includeOriginalAssets ? value : redactInternalCsText(value)
  return {
    conversation: {
      id: loaded.conversation.id,
      title: text(loaded.conversation.title),
      status: loaded.conversation.status,
      priority: loaded.conversation.priority,
      tags: loaded.conversation.tags,
      lastMessageAt: loaded.conversation.last_message_at,
    },
    messages: loaded.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: text(message.content),
      reviewState: message.review_state,
      correctedContent: text(message.corrected_content),
      modelProvider: message.model_provider,
      modelName: message.model_name,
      createdAt: message.created_at,
    })),
    assets: loaded.assets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      fileName: includeOriginalAssets ? asset.original_file_name : safeInternalCsFileName(asset.original_file_name),
      mimeType: asset.mime_type,
      status: asset.status,
      analysisSummary: text(asset.analysis_summary),
      analysisPayload: includeOriginalAssets ? asset.analysis_payload : redactDeep(asset.analysis_payload),
      reviewState: asset.review_state,
      ...(includeOriginalAssets && asset.signed_url ? { signedUrl: asset.signed_url } : {}),
    })),
    policy: {
      purpose: "internal_ai_analysis",
      customerDeliveryAllowed: false,
      csOwnerReviewRequired: true,
      originalAssetsIncluded: includeOriginalAssets,
      textRedacted: !includeOriginalAssets,
    },
  }
}
