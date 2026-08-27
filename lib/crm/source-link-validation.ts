import {
  isUnsafeCrmTargetLabel,
  isUnsafeGenericCrmAlias,
  normalizeCrmName,
  normalizeCrmOwnerName,
} from "@/lib/crm-source-linking"

export type CrmSourceLinkValidationState =
  | "valid"
  | "legacy_unscoped_alias"
  | "unsafe_matching_evidence"
  | "retired_confirmed_sibling"

export interface CrmMatchAliasValidationRow {
  source_system: string | null
  normalized_alias: string
  target_type: string | null
  target_id: string | null
  normalized_manager_name: string | null
}

export interface CrmSourceLinkValidationInput {
  sourceSystem: string
  targetType: string | null
  targetId: string | null
  linkStatus: string | null
  metadata: Record<string, unknown> | null
}

export interface CrmSourceLinkReviewValidationInput extends CrmSourceLinkValidationInput {
  sourceObject: string
  sourceRecordKey: string
}

export interface CrmSourceLinkReviewValidationContext {
  confirmedSourceIdentities: ReadonlySet<string>
  activeAliases: CrmMatchAliasValidationRow[]
  canValidateAliases: boolean
  excludedXiaoshouyiOwnerIds?: ReadonlySet<string>
}

export const LEGACY_ALIAS_VALIDATION_MESSAGE =
  "현재 원천의 활성 별칭 근거가 없어 확정할 수 없습니다. 제외하거나 수동으로 다시 연결해 주세요."
export const RETIRED_SIBLING_VALIDATION_MESSAGE =
  "같은 원천 레코드에 이미 확정된 연결이 있어 은퇴 이력으로만 보관됩니다."
export const UNSAFE_MATCHING_EVIDENCE_MESSAGE =
  "일반어 별칭·내부 테스트 타깃·제외 담당자처럼 고객 식별력이 없는 근거라 확정할 수 없습니다."

const CATALOG_VALIDATED_SOURCES = new Set(["branch_rev_sheet", "xiaoshouyi"])

export function getCrmSourceLinkIdentity(input: {
  sourceSystem: string
  sourceObject: string
  sourceRecordKey: string
}) {
  return `${input.sourceSystem}:${input.sourceObject}:${input.sourceRecordKey}`
}

export function getCrmAliasEvidence(metadata: Record<string, unknown> | null) {
  const evidence = metadata?.match_evidence
  if (!Array.isArray(evidence)) return []

  return Array.from(
    new Set(
      evidence
        .filter((item): item is string => typeof item === "string" && item.startsWith("alias:"))
        .map((item) => normalizeCrmName(item.slice("alias:".length)))
        .filter(Boolean)
    )
  )
}

export function needsCrmAliasCatalogValidation(input: CrmSourceLinkValidationInput) {
  if (!CATALOG_VALIDATED_SOURCES.has(input.sourceSystem)) return false
  if (input.linkStatus !== "candidate" && input.linkStatus !== "stale") return false
  if (input.metadata?.manual === true) return false
  return getCrmAliasEvidence(input.metadata).length > 0
}

/**
 * 과거에는 다른 원천의 별칭까지 후보 생성에 섞일 수 있었다. 별칭 근거가 붙은
 * 비수동 후보는 현재 원천·타깃·담당 범위의 활성 별칭으로 다시 입증될 때만
 * 확정 가능하다. lead는 확정 link도 별칭 원천으로 쓰므로 별도 정합화 전까지
 * 이 카탈로그 단독 검증 대상에서 제외한다.
 */
export function classifyCrmSourceLinkValidation(
  input: CrmSourceLinkValidationInput,
  activeAliases: CrmMatchAliasValidationRow[]
): CrmSourceLinkValidationState {
  if (!needsCrmAliasCatalogValidation(input)) return "valid"

  const evidenceAliases = new Set(getCrmAliasEvidence(input.metadata))
  const sourceOwner = normalizeCrmOwnerName(
    typeof input.metadata?.source_owner === "string"
      ? input.metadata.source_owner
      : typeof input.metadata?.owner_name === "string"
        ? input.metadata.owner_name
        : null
  )

  const hasActiveEvidence = activeAliases.some((alias) => {
    if (alias.source_system !== input.sourceSystem) return false
    if (alias.target_type !== input.targetType || alias.target_id !== input.targetId) return false
    if (!evidenceAliases.has(normalizeCrmName(alias.normalized_alias))) return false
    const aliasManager = normalizeCrmOwnerName(alias.normalized_manager_name)
    return !aliasManager || aliasManager === sourceOwner
  })

  return hasActiveEvidence ? "valid" : "legacy_unscoped_alias"
}

/**
 * Admin matching과 요약 지표가 공유하는 후보/재검수 유효성 경계다.
 * 별칭 카탈로그를 완전하게 읽지 못한 경우에는 정상 후보를 오탐으로 숨기지 않도록
 * alias 검증만 fail-open한다. 같은 원천에 확정 sibling이 있는 이력은 카탈로그 상태와
 * 무관하게 현재 처리 대상이 아니다.
 */
export function classifyCrmSourceLinkReviewValidation(
  input: CrmSourceLinkReviewValidationInput,
  context: CrmSourceLinkReviewValidationContext
): CrmSourceLinkValidationState {
  if (
    (input.linkStatus === "candidate" || input.linkStatus === "stale") &&
    context.confirmedSourceIdentities.has(getCrmSourceLinkIdentity(input))
  ) {
    return "retired_confirmed_sibling"
  }

  const targetLabel =
    typeof input.metadata?.target_label === "string" ? input.metadata.target_label : null
  const sourceLabel =
    typeof input.metadata?.source_label === "string"
      ? input.metadata.source_label
      : typeof input.metadata?.source_customer_name === "string"
        ? input.metadata.source_customer_name
        : null
  const aliasStrategy = input.metadata?.match_strategy === "alias"
  const sourceOwner =
    typeof input.metadata?.owner_name === "string"
      ? input.metadata.owner_name.trim()
      : typeof input.metadata?.source_owner === "string"
        ? input.metadata.source_owner.trim()
        : ""
  const evidenceAliases = getCrmAliasEvidence(input.metadata)
  const hasUnsafeAlias = evidenceAliases.some((alias) => {
    if (isUnsafeGenericCrmAlias(alias)) return true
    // 짧은 별칭은 담당 범위 없이 원천 고객을 유일하게 식별할 수 없다.
    return normalizeCrmName(alias).length < 3 && !sourceOwner
  })
  const unsafeGenericSource = aliasStrategy && Boolean(sourceLabel) && isUnsafeGenericCrmAlias(sourceLabel)
  const unsafeShortReverseMatch =
    aliasStrategy && normalizeCrmName(sourceLabel).length > 0 && normalizeCrmName(sourceLabel).length < 3 && !sourceOwner
  const excludedOwner =
    input.sourceSystem === "xiaoshouyi" &&
    Boolean(sourceOwner) &&
    Boolean(context.excludedXiaoshouyiOwnerIds?.has(sourceOwner))

  // 이 판정은 별칭 카탈로그 조회 상태와 무관한 fail-closed 안전 경계다. 저장된 metadata
  // 자체가 위험 근거를 증명하면 카탈로그 장애 중에도 처리 필요로 되돌리지 않는다.
  if (
    isUnsafeCrmTargetLabel(targetLabel) ||
    hasUnsafeAlias ||
    unsafeGenericSource ||
    unsafeShortReverseMatch ||
    excludedOwner
  ) {
    return "unsafe_matching_evidence"
  }

  if (!context.canValidateAliases) return "valid"
  return classifyCrmSourceLinkValidation(input, context.activeAliases)
}
