"use client"

import { Settings2 } from "lucide-react"

import type { QuoteWorkspacePreferences } from "@/lib/quote-workspace-preferences"

export interface QuoteDisplaySettingsProps {
  preferences: QuoteWorkspacePreferences
  onChange: (patch: Partial<Omit<QuoteWorkspacePreferences, "version">>) => void
  storageError?: string | null
}

export default function QuoteDisplaySettings({ preferences, onChange, storageError }: QuoteDisplaySettingsProps) {
  return (
    <details className="rounded-lg border border-[#E8E8E4] bg-white text-[12px] text-[#31302E]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 font-semibold [&::-webkit-details-marker]:hidden">
        <Settings2 className="h-3.5 w-3.5" />
        보기 설정
      </summary>
      <div className="grid gap-3 border-t border-[#E8E8E4] px-3 py-3">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={preferences.showRecentQuotes} onChange={(event) => onChange({ showRecentQuotes: event.target.checked })} className="h-4 w-4 accent-[#084734]" />
          최근 견적서 표시
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={preferences.showTemplates} onChange={(event) => onChange({ showTemplates: event.target.checked })} className="h-4 w-4 accent-[#084734]" />
          템플릿 표시
        </label>
        {preferences.hiddenTemplateIds.length > 0 && (
          <button type="button" onClick={() => onChange({ hiddenTemplateIds: [] })} className="w-fit text-left text-[#084734] underline underline-offset-2">
            숨긴 템플릿 {preferences.hiddenTemplateIds.length}개 다시 표시
          </button>
        )}
        <p className="text-[11px] leading-relaxed text-[#615D59]">내 계정의 이 브라우저에 저장되어 다음 접속에도 유지됩니다.</p>
      </div>
      {storageError && <p role="alert" className="px-3 pb-3 text-[#B43E3E]">{storageError}</p>}
    </details>
  )
}
