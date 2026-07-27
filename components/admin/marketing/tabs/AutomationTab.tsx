"use client"

/**
 * AutomationTab — 마케팅 허브 "자동화" 탭 패널 (코드 분할용 추출).
 *
 * MarketingHub.tsx의 automation 블록 JSX를 그대로 옮겼다 — 규칙·템플릿·로그
 * 상태와 CRUD/트리거 핸들러, lazy-load 가드(autoLoaded)는 전부 허브가 계속
 * 소유하고 props로만 받는다(로직 변경 없음). 허브에서 next/dynamic으로
 * 활성 탭일 때만 이 청크를 로드한다.
 */

import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getAdminToken } from "@/lib/admin-client"
import AutomationRuleList from "@/components/admin/marketing/AutomationRuleList"
import AutomationRuleDetail from "@/components/admin/marketing/AutomationRuleDetail"
import AutomationRuleSlideOver from "@/components/admin/marketing/AutomationRuleSlideOver"
import AutomationLogTable from "@/components/admin/marketing/AutomationLogTable"
import TemplateCard from "@/components/admin/marketing/TemplateCard"
import TemplateEditorDrawer from "@/components/admin/marketing/TemplateEditorDrawer"
import { EmptyState } from "@/components/admin/marketing/tabs/tab-ui"
import type {
  AutomationRule,
  AutomationLog,
  EmailTemplate,
  CreateRuleRequest,
  CreateTemplateRequest,
} from "@/lib/automation-types"

type AutomationSubTab = "rules" | "templates" | "logs"

interface AutomationTabProps {
  autoRules: AutomationRule[]
  autoTemplates: EmailTemplate[]
  autoLogs: AutomationLog[]
  autoSubTab: AutomationSubTab
  onAutoSubTabChange: (tab: AutomationSubTab) => void
  autoLoading: boolean
  autoError: boolean
  /** 허브의 autoLoaded 가드 해제("다시 시도") — 재로드 로직은 허브 소유 */
  onRetryLoad: () => void
  selectedRuleId: string | null
  selectedRule: AutomationRule | null
  onSelectRule: (rule: AutomationRule) => void
  triggeringId: string | null
  onOpenCreateRule: () => void
  onOpenCreateTemplate: () => void
  onEditRule: (rule: AutomationRule) => void
  onDeleteRule: (rule: AutomationRule) => void
  onToggleRuleStatus: (rule: AutomationRule) => void
  onTriggerRule: (rule: AutomationRule) => void
  onEditTemplate: (template: EmailTemplate) => void
  onDuplicateTemplate: (template: EmailTemplate) => void
  onDeleteTemplate: (template: EmailTemplate) => void
  slideOverOpen: boolean
  editingRule: AutomationRule | null
  onSaveRule: (data: CreateRuleRequest) => Promise<void>
  onCloseSlideOver: () => void
  editorOpen: boolean
  editingTemplate: EmailTemplate | null
  onSaveTemplate: (data: CreateTemplateRequest) => Promise<void>
  onCloseEditor: () => void
  autoSaving: boolean
}

export default function AutomationTab({
  autoRules,
  autoTemplates,
  autoLogs,
  autoSubTab,
  onAutoSubTabChange,
  autoLoading,
  autoError,
  onRetryLoad,
  selectedRuleId,
  selectedRule,
  onSelectRule,
  triggeringId,
  onOpenCreateRule,
  onOpenCreateTemplate,
  onEditRule,
  onDeleteRule,
  onToggleRuleStatus,
  onTriggerRule,
  onEditTemplate,
  onDuplicateTemplate,
  onDeleteTemplate,
  slideOverOpen,
  editingRule,
  onSaveRule,
  onCloseSlideOver,
  editorOpen,
  editingTemplate,
  onSaveTemplate,
  onCloseEditor,
  autoSaving,
}: AutomationTabProps) {
  return (
    <div className="space-y-4">
      {/* 서브탭 헤더 (규칙 / 템플릿 / 로그) + 우측 생성 액션 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex items-center gap-1 self-start rounded-xl border border-[#e8e8e4] bg-white p-1">
          {([
            ["rules", "규칙", autoRules.length],
            ["templates", "템플릿", autoTemplates.length],
            ["logs", "로그", autoLogs.length],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => onAutoSubTabChange(key)}
              className={`rounded-lg px-3.5 py-1.5 text-[12px] font-medium transition-colors ${
                autoSubTab === key
                  ? "bg-[#111110] text-white"
                  : "text-[#1a1a1a]/55 hover:text-[#111110]"
              }`}
            >
              {label}
              <span className={`ml-1.5 ${autoSubTab === key ? "text-white/60" : "text-[#1a1a1a]/30"}`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {autoSubTab === "rules" && (
          <Button size="sm" onClick={onOpenCreateRule} className="self-start bg-[#084734] hover:bg-[#084734]/90 sm:self-auto">
            <Plus className="mr-1.5 h-4 w-4" />새 규칙
          </Button>
        )}
        {autoSubTab === "templates" && (
          <Button size="sm" onClick={onOpenCreateTemplate} className="self-start bg-[#084734] hover:bg-[#084734]/90 sm:self-auto">
            <Plus className="mr-1.5 h-4 w-4" />새 템플릿
          </Button>
        )}
      </div>

      {/* 본문 — 로딩 / 에러 / 서브뷰 */}
      {autoLoading ? (
        <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] px-6 py-16 text-center text-[13px] text-[#1a1a1a]/35">
          자동화 데이터를 불러오는 중...
        </div>
      ) : autoError && autoRules.length === 0 && autoTemplates.length === 0 && autoLogs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] px-6 py-16 text-center">
          <p className="text-[13px] text-[#1a1a1a]/40">자동화 데이터를 불러오지 못했습니다.</p>
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={onRetryLoad}>
              다시 시도
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* 규칙 — 좌 목록 / 우 상세 2-pane */}
          {autoSubTab === "rules" && (
            <div className="grid gap-4 lg:h-[620px] lg:grid-cols-[360px_1fr]">
              <div className="h-[440px] lg:h-auto">
                <AutomationRuleList
                  rules={autoRules}
                  logs={autoLogs}
                  selectedId={selectedRuleId ?? undefined}
                  onSelect={onSelectRule}
                />
              </div>
              <div className="flex min-h-[520px] lg:min-h-0">
                <AutomationRuleDetail
                  rule={selectedRule}
                  logs={autoLogs}
                  triggeringId={triggeringId ?? undefined}
                  onEdit={onEditRule}
                  onDelete={onDeleteRule}
                  onToggleStatus={onToggleRuleStatus}
                  onTrigger={onTriggerRule}
                  onShowAllLogs={() => onAutoSubTabChange("logs")}
                  onCreateFirst={onOpenCreateRule}
                />
              </div>
            </div>
          )}

          {/* 템플릿 — 카드 그리드 */}
          {autoSubTab === "templates" && (
            autoTemplates.length === 0 ? (
              <EmptyState
                title="등록된 템플릿이 없습니다."
                description="변수 치환 이메일 템플릿을 만들어 자동화 규칙에 연결하세요."
                action={
                  <Button size="sm" onClick={onOpenCreateTemplate} className="bg-[#084734] hover:bg-[#084734]/90">
                    <Plus className="mr-1.5 h-4 w-4" />새 템플릿
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {autoTemplates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    rules={autoRules}
                    onEdit={onEditTemplate}
                    onDuplicate={onDuplicateTemplate}
                    onDelete={onDeleteTemplate}
                  />
                ))}
              </div>
            )
          )}

          {/* 로그 — 실행 이력 테이블 */}
          {autoSubTab === "logs" && (
            <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
              <AutomationLogTable logs={autoLogs} rules={autoRules} />
            </div>
          )}
        </>
      )}

      {/* 오버레이 — 열릴 때마다 새로 마운트해 initial을 반영 */}
      {slideOverOpen && (
        <AutomationRuleSlideOver
          open={slideOverOpen}
          templates={autoTemplates}
          initial={editingRule ?? undefined}
          onSave={onSaveRule}
          onClose={onCloseSlideOver}
          adminToken={getAdminToken()}
          loading={autoSaving}
        />
      )}
      {editorOpen && (
        <TemplateEditorDrawer
          open={editorOpen}
          initial={editingTemplate ?? undefined}
          onSave={onSaveTemplate}
          onClose={onCloseEditor}
          loading={autoSaving}
        />
      )}
    </div>
  )
}
