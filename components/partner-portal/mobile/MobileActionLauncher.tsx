"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Loader2, Mic, Plus, Sparkles } from "lucide-react";

import { CalendarEventQuickAdjustDialog } from "@/components/partner-portal/mobile/CalendarEventQuickAdjustDialog";
import { CustomerDialog } from "@/components/partner-portal/crud/CustomerDialog";
import {
  DealQuickCreateDialog,
  type PartnerCustomerOption,
} from "@/components/partner-portal/crud/DealQuickCreateDialog";
import {
  ScheduleDialog,
  type PartnerDealOption,
  type ScheduleType,
} from "@/components/partner-portal/crud/ScheduleDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { portalFetch } from "@/lib/partner-portal/portal-fetch";
import type {
  PartnerAiActionPlan,
  PartnerAiActionPreview,
} from "@/lib/partner-portal/ai/types";
import type { CalendarEvent } from "@/lib/partner-portal/types";
import { cn } from "@/lib/utils";

type LauncherAction =
  | "customer"
  | "deal"
  | "meeting"
  | "installation"
  | "adjust_event"
  | null;
type LauncherScreen = "home" | "workspace" | "calendar";

type MobileActionLauncherProps = {
  screen: LauncherScreen;
  customers: PartnerCustomerOption[];
  deals: PartnerDealOption[];
  canCreate?: boolean;
  defaultCustomerId?: string | null;
  defaultDealId?: string | null;
  selectedDate?: string | null;
  selectedEvent?: CalendarEvent | null;
  onSaved?: () => Promise<void> | void;
};

function formatContextDate(value: string) {
  const normalized = value.includes("T") ? value : `${value}T00:00:00`;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function createLocalDateTime(dateKey: string, hour: number) {
  return `${dateKey}T${String(hour).padStart(2, "0")}:00`;
}

function buildScheduleDefaults(dateKey?: string | null, scheduleType: ScheduleType = "meeting") {
  if (!dateKey) {
    return {
      startsAt: null,
      endsAt: null,
    };
  }

  if (scheduleType === "installation") {
    return {
      startsAt: createLocalDateTime(dateKey, 9),
      endsAt: createLocalDateTime(dateKey, 18),
    };
  }

  return {
    startsAt: createLocalDateTime(dateKey, 10),
    endsAt: createLocalDateTime(dateKey, 11),
  };
}

function screenLabel(screen: LauncherScreen) {
  return (
    {
      home: "홈",
      workspace: "워크스페이스",
      calendar: "캘린더",
    }[screen] ?? screen
  );
}

function sourceLabel(sourceType?: string | null) {
  return (
    {
      installation: "설치 일정",
      meeting: "미팅 일정",
      document_due: "문서 기한",
      internal: "내부 일정",
    }[sourceType ?? ""] ?? "선택 일정"
  );
}

function ActionCard({
  title,
  description,
  onClick,
  disabled = false,
  accent = "default",
}: {
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  accent?: "default" | "warm";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full rounded-2xl border px-4 py-4 text-left transition-all",
        "disabled:cursor-not-allowed disabled:opacity-45",
        accent === "warm"
          ? "border-amber-200 bg-amber-50 hover:border-amber-300 hover:bg-amber-100/70"
          : "border-[#e7e0d6] bg-white hover:border-[#d5c8b4] hover:bg-[#fffaf0]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[#111110]">{title}</p>
          <p className="mt-1 text-xs leading-5 text-[#1a1a1a]/55">{description}</p>
        </div>
        <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[#1a1a1a]/30" />
      </div>
    </button>
  );
}

function formatAiField(field: string) {
  return field.replace(/_/g, " ");
}

export function MobileActionLauncher({
  screen,
  customers,
  deals,
  canCreate = true,
  defaultCustomerId,
  defaultDealId,
  selectedDate,
  selectedEvent,
  onSaved,
}: MobileActionLauncherProps) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<LauncherAction>(null);
  const [aiInput, setAiInput] = useState("");
  const [aiPlan, setAiPlan] = useState<PartnerAiActionPlan | null>(null);
  const [aiPreview, setAiPreview] = useState<PartnerAiActionPreview | null>(null);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === defaultCustomerId) ?? null,
    [customers, defaultCustomerId]
  );
  const selectedDeal = useMemo(
    () => deals.find((deal) => deal.id === defaultDealId) ?? null,
    [deals, defaultDealId]
  );

  const scheduleType = activeAction === "installation" ? "installation" : "meeting";
  const scheduleDefaults = buildScheduleDefaults(selectedDate, scheduleType);
  const canAdjustSelectedEvent = canCreate && selectedEvent?.status === "active";

  const actionCards = useMemo(
    () => {
      const cards: Array<{
        key: Exclude<LauncherAction, null>;
        title: string;
        description: string;
        disabled: boolean;
      }> = [
        {
          key: "customer" as const,
          title: "고객 추가",
          description: "현장에서 바로 새 고객을 등록하고 다음 작업으로 이어갑니다.",
          disabled: !canCreate,
        },
        {
          key: "deal" as const,
          title: selectedCustomer ? `${selectedCustomer.name} 거래 추가` : "거래 추가",
          description:
            customers.length > 0
              ? "선택한 고객 기준으로 신규 컨택을 빠르게 생성합니다."
              : "먼저 등록된 고객이 있어야 거래를 만들 수 있습니다.",
          disabled: !canCreate || customers.length === 0,
        },
        {
          key: "meeting" as const,
          title: selectedDate ? `${formatContextDate(selectedDate)} 미팅 일정` : "미팅 일정",
          description:
            deals.length > 0
              ? `${selectedDeal?.title ?? "선택 거래"} 기준으로 미팅 일정을 바로 추가합니다.`
              : "일정을 연결할 거래가 아직 없습니다.",
          disabled: !canCreate || deals.length === 0,
        },
        {
          key: "installation" as const,
          title: selectedDate ? `${formatContextDate(selectedDate)} 설치 일정` : "설치 일정",
          description:
            deals.length > 0
              ? `${selectedDeal?.title ?? "선택 거래"} 기준으로 설치 일정을 잡습니다.`
              : "설치 일정을 연결할 거래가 아직 없습니다.",
          disabled: !canCreate || deals.length === 0,
        },
      ];

      if (screen === "calendar" && selectedEvent) {
        cards.unshift({
          key: "adjust_event" as const,
          title: `${sourceLabel(selectedEvent.source_type)} 조정`,
          description: canAdjustSelectedEvent
            ? `${selectedEvent.title} 일정의 시간, 메모, 취소를 바로 처리합니다.`
            : "완료되었거나 취소된 일정은 여기서 다시 조정할 수 없습니다.",
          disabled: !canAdjustSelectedEvent,
        });
      }

      return cards;
    },
    [
      canAdjustSelectedEvent,
      canCreate,
      customers.length,
      deals.length,
      screen,
      selectedCustomer,
      selectedDeal,
      selectedDate,
      selectedEvent,
    ]
  );

  function openAction(action: Exclude<LauncherAction, null>) {
    setIsSheetOpen(false);
    setActiveAction(action);
  }

  async function handleCreateAiPlan() {
    if (!aiInput.trim()) return;

    setAiError(null);
    setAiStatus(null);
    setAiPlan(null);
    setAiPreview(null);
    setIsPlanning(true);

    try {
      const planResponse = await portalFetch("/api/partner/ai-actions/plan", {
        method: "POST",
        body: JSON.stringify({
          raw_input: aiInput,
          channel: "text",
          context: {
            screen,
            selected_date: selectedDate ?? null,
            selected_customer_id: defaultCustomerId ?? null,
            selected_deal_id: defaultDealId ?? null,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul",
          },
        }),
      });
      const planPayload = (await planResponse.json()) as {
        error?: string;
        plan?: PartnerAiActionPlan;
      };

      if (!planResponse.ok || !planPayload.plan) {
        throw new Error(planPayload.error ?? "AI 계획 생성에 실패했습니다.");
      }

      setAiPlan(planPayload.plan);

      const previewResponse = await portalFetch("/api/partner/ai-actions/preview", {
        method: "POST",
        body: JSON.stringify({ plan: planPayload.plan }),
      });
      const previewPayload = (await previewResponse.json()) as {
        error?: string;
        preview?: PartnerAiActionPreview;
      };

      if (!previewResponse.ok || !previewPayload.preview) {
        throw new Error(previewPayload.error ?? "AI 미리보기에 실패했습니다.");
      }

      setAiPreview(previewPayload.preview);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI 실행 흐름을 준비하지 못했습니다.");
    } finally {
      setIsPlanning(false);
    }
  }

  async function handleExecuteAiAction() {
    if (!aiPreview?.can_execute || !aiPreview.confirmation_token) return;

    setIsExecuting(true);
    setAiError(null);
    setAiStatus(null);

    try {
      const response = await portalFetch("/api/partner/ai-actions/execute", {
        method: "POST",
        body: JSON.stringify({
          request_id: aiPreview.request_id,
          intent: aiPreview.intent,
          final_payload: aiPreview.final_payload,
          confirmation_token: aiPreview.confirmation_token,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        result?: {
          success_message: string;
        };
      };

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? "AI 실행에 실패했습니다.");
      }

      setAiStatus(payload.result.success_message);
      await onSaved?.();
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI 실행에 실패했습니다.");
    } finally {
      setIsExecuting(false);
    }
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-40 flex justify-end px-4 lg:hidden">
        <Button
          type="button"
          size="lg"
          onClick={() => setIsSheetOpen(true)}
          className="pointer-events-auto h-14 rounded-full bg-[#111110] px-5 text-sm font-semibold text-white shadow-[0_18px_50px_rgba(17,17,16,0.28)] hover:bg-[#2a2925]"
        >
          <Plus className="mr-2 h-4 w-4" />
          빠른 실행
        </Button>
      </div>

      <div className="h-24 lg:hidden" aria-hidden />

      <Dialog open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <DialogContent className="top-auto bottom-4 left-1/2 w-[calc(100%-1rem)] max-w-md translate-x-[-50%] translate-y-0 rounded-[28px] border-[#e7e0d6] bg-[#fffdf8] p-0 shadow-2xl sm:rounded-[28px]">
          <div className="max-h-[82vh] overflow-y-auto p-5">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-[#d7cbb7]" />
            <DialogHeader className="text-left">
              <DialogTitle className="flex items-center gap-2 text-[#111110]">
                <Sparkles className="h-4 w-4 text-amber-600" />
                모바일 빠른 실행
              </DialogTitle>
              <DialogDescription className="text-[#1a1a1a]/55">
                {screenLabel(screen)} 화면 기준으로 고객, 거래, 일정 작업을 빠르게 처리합니다.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-[#e7e0d6] bg-white px-3 py-1 text-[11px] font-medium text-[#1a1a1a]/65">
                화면: {screenLabel(screen)}
              </span>
              {selectedCustomer && (
                <span className="rounded-full border border-[#e7e0d6] bg-white px-3 py-1 text-[11px] font-medium text-[#1a1a1a]/65">
                  고객: {selectedCustomer.name}
                </span>
              )}
              {selectedDeal && (
                <span className="rounded-full border border-[#e7e0d6] bg-white px-3 py-1 text-[11px] font-medium text-[#1a1a1a]/65">
                  거래: {selectedDeal.title}
                </span>
              )}
              {selectedDate && (
                <span className="rounded-full border border-[#e7e0d6] bg-white px-3 py-1 text-[11px] font-medium text-[#1a1a1a]/65">
                  날짜: {formatContextDate(selectedDate)}
                </span>
              )}
              {selectedEvent && (
                <span className="rounded-full border border-[#e7e0d6] bg-white px-3 py-1 text-[11px] font-medium text-[#1a1a1a]/65">
                  {sourceLabel(selectedEvent.source_type)}: {selectedEvent.title}
                </span>
              )}
            </div>

            {!canCreate && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                생성 기능은 V2 계정 연결 상태에서만 사용할 수 있습니다.
              </div>
            )}

            <div className="mt-5 space-y-3">
              {actionCards.map((card) => (
                <ActionCard
                  key={card.key}
                  title={card.title}
                  description={card.description}
                  disabled={card.disabled}
                  accent={
                    card.key === "installation" || card.key === "adjust_event"
                      ? "warm"
                      : "default"
                  }
                  onClick={() => openAction(card.key)}
                />
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-dashed border-[#d9cfbf] bg-[#faf6ef] px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#111110]">
                <Mic className="h-4 w-4 text-[#1a1a1a]/40" />
                AI 텍스트 실행
              </div>
              <p className="mt-1 text-xs leading-5 text-[#1a1a1a]/55">
                예: &ldquo;내일 오후 2시에 미팅 잡아줘&rdquo;, &ldquo;강남 메가 보급 캠퍼스 거래 추가&rdquo;, &ldquo;담당자 이메일 수정&rdquo;
              </p>

              <textarea
                value={aiInput}
                onChange={(event) => setAiInput(event.target.value)}
                rows={4}
                placeholder="현장 요청을 그대로 적어 주세요."
                className="mt-3 w-full rounded-2xl border border-[#d9cfbf] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#111110]/30"
              />

              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  onClick={handleCreateAiPlan}
                  disabled={!canCreate || isPlanning || !aiInput.trim()}
                  className="flex-1"
                >
                  {isPlanning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      계획 생성 중
                    </>
                  ) : (
                    "AI 계획 만들기"
                  )}
                </Button>
              </div>

              {aiError && (
                <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {aiError}
                </div>
              )}

              {aiStatus && (
                <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {aiStatus}
                </div>
              )}

              {aiPlan && (
                <div className="mt-3 rounded-2xl border border-[#e7e0d6] bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#111110]">
                      계획: {aiPlan.intent}
                    </p>
                    <span className="rounded-full bg-[#f5f1e8] px-2 py-1 text-[11px] font-medium text-[#6d6253]">
                      신뢰도 {Math.round(aiPlan.confidence * 100)}%
                    </span>
                  </div>

                  {aiPlan.warnings.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {aiPlan.warnings.map((warning) => (
                        <div
                          key={warning}
                          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                        >
                          {warning}
                        </div>
                      ))}
                    </div>
                  )}

                  {aiPlan.target_candidates.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {aiPlan.target_candidates.map((candidate) => (
                        <span
                          key={candidate.id}
                          className="rounded-full border border-[#e7e0d6] bg-[#faf6ef] px-3 py-1 text-[11px] text-[#1a1a1a]/70"
                        >
                          {candidate.label}
                        </span>
                      ))}
                    </div>
                  )}

                  {aiPlan.missing_fields.length > 0 && (
                    <div className="mt-3 rounded-xl border border-[#e7e0d6] bg-[#faf6ef] px-3 py-3 text-xs text-[#1a1a1a]/70">
                      필요한 정보: {aiPlan.missing_fields.map(formatAiField).join(", ")}
                    </div>
                  )}
                </div>
              )}

              {aiPreview && (
                <div className="mt-3 rounded-2xl border border-[#111110]/10 bg-white px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[#111110]">미리보기</p>
                    {aiPreview.can_execute && (
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700">
                        실행 가능
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-[#1a1a1a]/70">{aiPreview.summary}</p>

                  {aiPreview.diff.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {aiPreview.diff.slice(0, 6).map((item) => (
                        <div
                          key={`${item.field}-${String(item.after)}`}
                          className="rounded-xl border border-[#ece4d8] bg-[#faf6ef] px-3 py-2 text-xs text-[#1a1a1a]/70"
                        >
                          <span className="font-medium text-[#111110]">{formatAiField(item.field)}</span>
                          {" -> "}
                          {String(item.after)}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      onClick={handleExecuteAiAction}
                      disabled={!aiPreview.can_execute || isExecuting}
                      className="flex-1"
                    >
                      {isExecuting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          실행 중
                        </>
                      ) : (
                        "AI 실행"
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CustomerDialog
        open={activeAction === "customer"}
        onOpenChange={(open) => setActiveAction(open ? "customer" : null)}
        onSaved={onSaved}
      />
      <DealQuickCreateDialog
        open={activeAction === "deal"}
        onOpenChange={(open) => setActiveAction(open ? "deal" : null)}
        customers={customers}
        defaultCustomerId={defaultCustomerId}
        onSaved={onSaved}
      />
      <ScheduleDialog
        open={activeAction === "meeting" || activeAction === "installation"}
        onOpenChange={(open) => setActiveAction(open ? scheduleType : null)}
        deals={deals}
        defaultDealId={defaultDealId}
        defaultStartsAt={scheduleDefaults.startsAt}
        defaultEndsAt={scheduleDefaults.endsAt}
        defaultScheduleType={scheduleType}
        onSaved={onSaved}
      />
      <CalendarEventQuickAdjustDialog
        open={activeAction === "adjust_event"}
        event={selectedEvent ?? null}
        onOpenChange={(open) => setActiveAction(open ? "adjust_event" : null)}
        onSaved={onSaved}
      />
    </>
  );
}
