// 담당자 표 CSV 가져오기 계획 — readKrContacts 양식(parseKrContactsCsv)으로 읽은 행을 지금 표와 견줘
// 만들기·고치기·그대로를 정한다. 순수 함수다(넣기는 lib/repositories/team-contacts.ts applyTeamContactImport).
//
// 규칙:
//  - 한국 지사(KR) 행만 다룬다. 영역마다 활성 행 하나 — 있으면 고치고, 없으면 만든다. CSV 에 없는 영역은 건드리지 않는다.
//  - CSV 의 빈 칸은 지금 값을 지우지 않는다(초안 CSV 가 일부 칸만 채운 경우). 지우려면 화면에서 고친다.
//  - 넣기 전에 화면 입력과 같은 검사(연락처 값·길이·링크 형식)를 한다. 걸리면 그 줄은 건너뛴다(이유를 보인다).

import type { KrContactsCsvNote, KrContactsCsvParse, KrContactsCsvSkip } from "@/lib/internal-cs-chat/contact"

import {
  validateTeamContactInput,
  type TeamContactAreaOption,
  type TeamContactInput,
  type TeamContactOrg,
  type TeamContactRecord,
} from "./model"

export type TeamContactImportAction = "create" | "update" | "same"

export interface TeamContactImportItem {
  line: number
  area: string
  areaLabel: string
  action: TeamContactImportAction
  existingId: string | null
  input: TeamContactInput
  /** 고치기에서 바뀌는 칸(화면 이름). */
  changes: string[]
  /** 안내가 이 영역의 행을 쓰는가(본사 에스컬레이션은 저장만). */
  usedInAnswers: boolean
  /** 확인일이 CSV 에서 새로 왔는가(확인자 표시를 바꾼다). */
  confirmedFromCsv: boolean
  existingConfirmedBy: string | null
}

export interface TeamContactImportPlan {
  items: TeamContactImportItem[]
  skipped: KrContactsCsvSkip[]
  notes: KrContactsCsvNote[]
  missingColumns: string[]
  counts: { create: number; update: number; same: number; skipped: number }
}

const FIELD_LABELS: Array<[keyof TeamContactInput, string]> = [
  ["role", "역할"],
  ["name", "1차 담당"],
  ["deputy", "대리 담당"],
  ["channel", "연락 방법"],
  ["prep", "준비물"],
  ["adminLink", "어드민 링크"],
  ["note", "비고"],
  ["confirmedAt", "확인일"],
]

function sameValue(a: unknown, b: unknown) {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
  return (a ?? null) === (b ?? null)
}

export function planKrContactImport(
  parsed: KrContactsCsvParse,
  existing: TeamContactRecord[],
  options: { areas: Record<TeamContactOrg, ReadonlySet<string>>; krAreas: TeamContactAreaOption[] }
): TeamContactImportPlan {
  const labelOf = new Map(options.krAreas.map((area, index) => [area.key, { label: area.label, used: area.usedInAnswers, index }]))
  const activeByArea = new Map(existing.filter((row) => row.org === "KR" && row.active).map((row) => [row.area, row]))
  const items: TeamContactImportItem[] = []
  const skipped: KrContactsCsvSkip[] = [...parsed.skipped]

  parsed.rows.forEach((row, index) => {
    const line = parsed.lines[index] ?? 0
    const area = labelOf.get(row.topic)
    const current = activeByArea.get(row.topic) ?? null
    const raw = {
      org: "KR",
      area: row.topic,
      role: row.role ?? current?.role ?? null,
      name: row.primaryName ?? current?.name ?? null,
      deputy: row.backupName ?? current?.deputy ?? null,
      channel: row.channel ?? current?.channel ?? null,
      prep: row.prepare.length ? row.prepare : current?.prep ?? [],
      adminLink: row.adminLink ?? current?.adminLink ?? null,
      note: row.note ?? current?.note ?? null,
      confirmedAt: row.verifiedAt ?? current?.confirmedAt ?? null,
      sortOrder: current?.sortOrder ?? (area ? area.index * 10 : 0),
    }
    const validated = validateTeamContactInput(raw, options.areas, current)
    if (!validated.ok) {
      skipped.push({ line, area: area?.label ?? row.topic, reason: validated.error })
      return
    }
    const changes = current
      ? FIELD_LABELS.filter(([key]) => !sameValue(current[key as keyof TeamContactRecord], validated.value[key])).map(([, label]) => label)
      : []
    items.push({
      line,
      area: row.topic,
      areaLabel: area?.label ?? row.topic,
      action: current ? (changes.length ? "update" : "same") : "create",
      existingId: current?.id ?? null,
      input: validated.value,
      changes,
      usedInAnswers: area?.used ?? true,
      confirmedFromCsv: Boolean(row.verifiedAt) && row.verifiedAt !== current?.confirmedAt,
      existingConfirmedBy: current?.confirmedBy ?? null,
    })
  })

  skipped.sort((a, b) => a.line - b.line)
  return {
    items,
    skipped,
    notes: parsed.notes,
    missingColumns: parsed.missingColumns,
    counts: {
      create: items.filter((item) => item.action === "create").length,
      update: items.filter((item) => item.action === "update").length,
      same: items.filter((item) => item.action === "same").length,
      skipped: skipped.length,
    },
  }
}

/** 넣을 줄(그대로인 줄은 뺀다). CSV 확인일은 "가져온 사람 (CSV)"로 표시한다. */
export function importWritesOf(plan: TeamContactImportPlan, actorName: string) {
  return plan.items
    .filter((item) => item.action !== "same")
    .map((item) => ({
      existingId: item.existingId,
      input: item.input,
      confirmedBy: item.confirmedFromCsv ? `${actorName} (CSV)`.slice(0, 80) : item.existingConfirmedBy,
    }))
}
