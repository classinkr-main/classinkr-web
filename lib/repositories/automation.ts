/**
 * ─────────────────────────────────────────────────────────────
 * automation repository  —  자동화 규칙/템플릿/로그 CRUD
 * ─────────────────────────────────────────────────────────────
 *
 * Supabase admin 클라이언트 전용 (서버 사이드 only).
 * email_templates / automation_rules / automation_logs 테이블.
 */

import "server-only"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type {
  EmailTemplate,
  AutomationRule,
  AutomationLog,
  AutomationStatus,
  AutomationLogStatus,
  SegmentConfig,
  TriggerConfig,
  TriggerType,
} from "@/lib/automation-types"

const sb = () => createSupabaseAdminClient()

/* ─────────────────────────────────────────────────────────────
   이메일 템플릿
   ───────────────────────────────────────────────────────────── */

export async function getAllTemplates(): Promise<EmailTemplate[]> {
  const { data, error } = await sb()
    .from("email_templates")
    .select("*")
    .order("created_at", { ascending: false })
  if (error) throw new Error(`[automation] 템플릿 조회 실패: ${error.message}`)
  return (data ?? []).map(rowToTemplate)
}

export async function getTemplateById(id: string): Promise<EmailTemplate | null> {
  const { data, error } = await sb()
    .from("email_templates")
    .select("*")
    .eq("id", id)
    .single()
  if (error) return null
  return rowToTemplate(data)
}

export async function createTemplate(input: {
  name: string
  subject: string
  body: string
  variables?: string[]
}): Promise<EmailTemplate> {
  const { data, error } = await sb()
    .from("email_templates")
    .insert({
      name: input.name,
      subject: input.subject,
      body: input.body,
      variables: input.variables ?? [],
    })
    .select()
    .single()
  if (error) throw new Error(`[automation] 템플릿 생성 실패: ${error.message}`)
  return rowToTemplate(data)
}

export async function updateTemplate(
  id: string,
  input: Partial<{ name: string; subject: string; body: string; variables: string[] }>
): Promise<EmailTemplate> {
  const { data, error } = await sb()
    .from("email_templates")
    .update({ ...input })
    .eq("id", id)
    .select()
    .single()
  if (error) throw new Error(`[automation] 템플릿 수정 실패: ${error.message}`)
  return rowToTemplate(data)
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const { error } = await sb().from("email_templates").delete().eq("id", id)
  return !error
}

/* ─────────────────────────────────────────────────────────────
   자동화 규칙
   ───────────────────────────────────────────────────────────── */

export async function getAllRules(): Promise<AutomationRule[]> {
  const { data, error } = await sb()
    .from("automation_rules")
    .select("*, email_templates(*)")
    .order("created_at", { ascending: false })
  if (error) throw new Error(`[automation] 규칙 조회 실패: ${error.message}`)
  return (data ?? []).map(rowToRule)
}

export async function getRuleById(id: string): Promise<AutomationRule | null> {
  const { data, error } = await sb()
    .from("automation_rules")
    .select("*, email_templates(*)")
    .eq("id", id)
    .single()
  if (error) return null
  return rowToRule(data)
}

export async function getActiveRulesByTrigger(
  triggerType: TriggerType
): Promise<AutomationRule[]> {
  const { data, error } = await sb()
    .from("automation_rules")
    .select("*, email_templates(*)")
    .eq("status", "active")
    .eq("trigger_type", triggerType)
  if (error) throw new Error(`[automation] 규칙 조회 실패: ${error.message}`)
  return (data ?? []).map(rowToRule)
}

export async function createRule(input: {
  name: string
  triggerType: TriggerType
  triggerConfig: TriggerConfig
  segmentConfig: SegmentConfig
  templateId: string
  status?: AutomationStatus
}): Promise<AutomationRule> {
  const { data, error } = await sb()
    .from("automation_rules")
    .insert({
      name: input.name,
      status: input.status ?? "draft",
      trigger_type: input.triggerType,
      trigger_config: input.triggerConfig as unknown as Record<string, unknown>,
      segment_config: input.segmentConfig as unknown as Record<string, unknown>,
      template_id: input.templateId,
    })
    .select("*, email_templates(*)")
    .single()
  if (error) throw new Error(`[automation] 규칙 생성 실패: ${error.message}`)
  return rowToRule(data)
}

export async function updateRule(
  id: string,
  input: Partial<{
    name: string
    status: AutomationStatus
    triggerType: TriggerType
    triggerConfig: TriggerConfig
    segmentConfig: SegmentConfig
    templateId: string
  }>
): Promise<AutomationRule> {
  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.status !== undefined) patch.status = input.status
  if (input.triggerType !== undefined) patch.trigger_type = input.triggerType
  if (input.triggerConfig !== undefined) patch.trigger_config = input.triggerConfig as unknown as Record<string, unknown>
  if (input.segmentConfig !== undefined) patch.segment_config = input.segmentConfig as unknown as Record<string, unknown>
  if (input.templateId !== undefined) patch.template_id = input.templateId

  const { data, error } = await sb()
    .from("automation_rules")
    .update(patch)
    .eq("id", id)
    .select("*, email_templates(*)")
    .single()
  if (error) throw new Error(`[automation] 규칙 수정 실패: ${error.message}`)
  return rowToRule(data)
}

export async function deleteRule(id: string): Promise<boolean> {
  const { error } = await sb().from("automation_rules").delete().eq("id", id)
  return !error
}

/* ─────────────────────────────────────────────────────────────
   실행 로그
   ───────────────────────────────────────────────────────────── */

export async function getAllLogs(ruleId?: string): Promise<AutomationLog[]> {
  let query = sb()
    .from("automation_logs")
    .select("*, automation_rules(name)")
    .order("triggered_at", { ascending: false })

  if (ruleId) {
    query = query.eq("rule_id", ruleId)
  }

  const { data, error } = await query
  if (error) throw new Error(`[automation] 로그 조회 실패: ${error.message}`)
  return (data ?? []).map(rowToLog)
}

export async function createLog(input: {
  ruleId: string
  recipientCount?: number
  status?: AutomationLogStatus
  errorMessage?: string
  recipientEmails?: string[]
}): Promise<AutomationLog> {
  const { data, error } = await sb()
    .from("automation_logs")
    .insert({
      rule_id: input.ruleId,
      recipient_count: input.recipientCount ?? 0,
      status: input.status ?? "pending",
      error_message: input.errorMessage ?? null,
      recipient_emails: input.recipientEmails ?? [],
    })
    .select()
    .single()
  if (error) throw new Error(`[automation] 로그 생성 실패: ${error.message}`)
  return rowToLog(data)
}

export async function updateLogStatus(
  id: string,
  status: AutomationLogStatus,
  fields?: { recipientCount?: number; errorMessage?: string; recipientEmails?: string[] }
): Promise<void> {
  const patch: Record<string, unknown> = { status }
  if (fields?.recipientCount !== undefined) patch.recipient_count = fields.recipientCount
  if (fields?.errorMessage !== undefined) patch.error_message = fields.errorMessage
  if (fields?.recipientEmails !== undefined) patch.recipient_emails = fields.recipientEmails

  await sb().from("automation_logs").update(patch).eq("id", id)
}

/* ─────────────────────────────────────────────────────────────
   변환 헬퍼
   ───────────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToTemplate(row: any): EmailTemplate {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    body: row.body,
    variables: row.variables ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToRule(row: any): AutomationRule {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    triggerType: row.trigger_type,
    triggerConfig: row.trigger_config as TriggerConfig,
    segmentConfig: row.segment_config as SegmentConfig,
    templateId: row.template_id ?? "",
    template: row.email_templates ? rowToTemplate(row.email_templates) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToLog(row: any): AutomationLog {
  return {
    id: row.id,
    ruleId: row.rule_id,
    ruleName: row.automation_rules?.name ?? undefined,
    triggeredAt: row.triggered_at,
    recipientCount: row.recipient_count ?? 0,
    status: row.status,
    errorMessage: row.error_message ?? undefined,
    recipientEmails: row.recipient_emails ?? [],
    createdAt: row.created_at,
  }
}
