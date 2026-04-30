const MEMBER_NAME_ALIASES: Record<string, string> = {
  "new 2": "Minjae",
  minjae: "Minjae",
  somang: "Somang",
}

export function normalizeBranchMemberName(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return MEMBER_NAME_ALIASES[trimmed.toLowerCase()] ?? trimmed
}
