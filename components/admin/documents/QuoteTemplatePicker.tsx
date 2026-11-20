"use client"

import { ArrowLeft } from "lucide-react"

import { countHiddenBaseQuoteTemplates, listQuoteTemplatePickerGroups } from "@/lib/quote-template-picker"
import type { StandardQuoteTemplateId } from "@/lib/standard-quote-template"

// 견적서 탭 첫 화면(2026-11-20 결정) — 왼쪽 목록에서 견적을 고르기 전, 오른쪽에 뜨는 "템플릿 고르기".
// 카드를 누르면 패널이 그 템플릿 id 로 작성기(QuickQuoteComposer)를 연다. 헤더의 작성 버튼과 같은 길이다.
//
// 훅이 없는 표시 전용 컴포넌트다. 목록은 lib/quote-template-picker.ts 가 STANDARD_QUOTE_TEMPLATES 에서 읽고,
// 판매 중단·개인 숨김은 작성기의 템플릿 목록과 같은 기준으로 거른다.
// 팀 템플릿(quote_team_templates) 카드는 없다 — 작성기가 "팀 템플릿을 지정해 열기"를 받지 않는다
// (initialTemplateId 는 기본 템플릿 id 만). 팀 템플릿은 작성 창 안의 템플릿 목록에서 고른다.

const TEMPLATE_SETTINGS_HREF = "/admin/quotes/templates"

const TEXT_LINK =
  "font-semibold text-[#084734] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-1"

type QuoteTemplatePickerProps = {
  /** 개인 설정의 숨긴 템플릿 id(useQuoteWorkspacePreferences). */
  hiddenTemplateIds?: readonly string[]
  onSelect: (templateId: StandardQuoteTemplateId) => void
}

export default function QuoteTemplatePicker({ hiddenTemplateIds = [], onSelect }: QuoteTemplatePickerProps) {
  const groups = listQuoteTemplatePickerGroups(hiddenTemplateIds)
  const hiddenCount = countHiddenBaseQuoteTemplates(hiddenTemplateIds)

  return (
    <section aria-label="견적서 템플릿" className="px-7 py-6">
      <h2 className="text-lg font-bold tracking-[-0.02em] text-[#111110]">새 견적서</h2>
      <p className="mt-0.5 text-xs text-[#615D59]">
        템플릿을 고르면 작성 창이 열립니다. 저장한 견적서는 왼쪽 목록에 나타납니다.
      </p>

      {groups.length === 0 ? (
        <div className="mt-5 rounded-lg border border-[#e8e8e4] bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-[#111110]">표시할 템플릿이 없습니다.</p>
          <p className="mt-1 text-xs text-[#615D59]">
            기본 템플릿을 모두 숨겼습니다.{" "}
            <a href={TEMPLATE_SETTINGS_HREF} className={TEXT_LINK}>
              템플릿 관리
            </a>
            에서 다시 표시할 수 있습니다.
          </p>
        </div>
      ) : (
        // 카드 열 수는 화면이 아니라 이 칸의 폭을 따른다 — 왼쪽 목록(400px)·사이드바가 폭을 먼저 가져간다.
        <div className="@container mt-5 space-y-6">
          {groups.map((group) => (
            <div key={group.productLine} role="group" aria-label={`${group.label} 템플릿`}>
              <h3 className="mb-2.5 text-[12.5px] font-semibold text-[#111110]">
                {group.label}{" "}
                <span className="font-normal text-[#615D59]">· 공급자 {group.supplierLabel}</span>
              </h3>
              <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @2xl:grid-cols-3">
                {group.templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    data-template-id={template.id}
                    title={template.description}
                    onClick={() => onSelect(template.id)}
                    className="group flex min-h-[116px] flex-col items-start rounded-lg border border-[#e8e8e4] bg-white p-4 text-left transition-colors hover:border-[#c8c8c4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-1"
                  >
                    <span className="text-[15px] font-semibold leading-snug text-[#111110]">{template.label}</span>
                    <span className="mt-1 text-[12.5px] leading-relaxed text-[#615D59]">
                      {template.presetLabels.length > 0 ? template.presetLabels.join(" · ") : template.description}
                    </span>
                    <span className="mt-auto pt-3 text-[12.5px] font-semibold text-[#084734] underline-offset-2 group-hover:underline">
                      견적서 만들기
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs leading-relaxed text-[#615D59]">
        팀에서 저장한 템플릿은 작성 창의 템플릿 목록에서 고릅니다.
        {hiddenCount > 0 && groups.length > 0 && (
          <>
            {" "}
            숨긴 템플릿 {hiddenCount}개는{" "}
            <a href={TEMPLATE_SETTINGS_HREF} className={TEXT_LINK}>
              템플릿 관리
            </a>
            에서 다시 표시할 수 있습니다.
          </>
        )}
      </p>
    </section>
  )
}

/** 견적 상세 위에 두는 되돌아가기 — 선택을 풀면 오른쪽이 다시 템플릿 고르기가 된다. */
export function QuoteTemplatePickerReturn({ onClick }: { onClick: () => void }) {
  return (
    <div className="border-b border-[#e8e8e4] px-7 py-2">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex h-8 items-center gap-1.5 rounded-md text-[12.5px] font-semibold text-[#615D59] transition-colors hover:text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-1"
      >
        <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
        템플릿으로
      </button>
    </div>
  )
}
