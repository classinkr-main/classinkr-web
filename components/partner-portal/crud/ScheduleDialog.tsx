"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { portalFetch } from "@/lib/partner-portal/portal-fetch";

export type ScheduleType = "meeting" | "installation";

export type PartnerDealOption = {
  id: string;
  title: string;
  customer_name?: string | null;
  current_stage?: string | null;
};

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deals: PartnerDealOption[];
  defaultDealId?: string | null;
  defaultStartsAt?: string | null;
  defaultEndsAt?: string | null;
  defaultScheduleType?: ScheduleType;
  onSaved?: () => Promise<void> | void;
}

type ScheduleFormState = {
  scheduleType: ScheduleType;
  deal_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location: string;
  assigned_team: string;
  description: string;
};

function toLocalDateTimeValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function createDefaultForm({
  defaultDealId,
  defaultStartsAt,
  defaultEndsAt,
  defaultScheduleType,
}: {
  defaultDealId?: string | null;
  defaultStartsAt?: string | null;
  defaultEndsAt?: string | null;
  defaultScheduleType?: ScheduleType;
} = {}): ScheduleFormState {
  const scheduleType = defaultScheduleType ?? "meeting";
  const start = defaultStartsAt ? new Date(defaultStartsAt) : new Date();
  if (Number.isNaN(start.getTime())) {
    start.setTime(Date.now());
  }

  if (!defaultStartsAt) {
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
  }

  const end = defaultEndsAt ? new Date(defaultEndsAt) : new Date(start);
  if (Number.isNaN(end.getTime())) {
    end.setTime(start.getTime());
  }

  if (!defaultEndsAt) {
    end.setHours(end.getHours() + (scheduleType === "installation" ? 8 : 1));
  }

  return {
    scheduleType,
    deal_id: defaultDealId ?? "",
    title: "",
    starts_at: toLocalDateTimeValue(start),
    ends_at: toLocalDateTimeValue(end),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul",
    location: "",
    assigned_team: "",
    description: "",
  };
}

export function ScheduleDialog({
  open,
  onOpenChange,
  deals,
  defaultDealId,
  defaultStartsAt,
  defaultEndsAt,
  defaultScheduleType,
  onSaved,
}: ScheduleDialogProps) {
  const [form, setForm] = useState<ScheduleFormState>(() =>
    createDefaultForm({
      defaultDealId,
      defaultStartsAt,
      defaultEndsAt,
      defaultScheduleType,
    })
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedDeals = useMemo(
    () =>
      [...deals].sort((left, right) => {
        const customerCompare = (left.customer_name ?? "").localeCompare(
          right.customer_name ?? "",
          "ko"
        );

        if (customerCompare !== 0) {
          return customerCompare;
        }

        return left.title.localeCompare(right.title, "ko");
      }),
    [deals]
  );

  useEffect(() => {
    if (!open) return;

    setForm(
      createDefaultForm({
        defaultDealId,
        defaultStartsAt,
        defaultEndsAt,
        defaultScheduleType,
      })
    );
    setSaving(false);
    setError(null);
  }, [defaultDealId, defaultEndsAt, defaultScheduleType, defaultStartsAt, open]);

  useEffect(() => {
    if (!open || !form.deal_id) return;
    if (form.title.trim()) return;

    const selectedDeal = sortedDeals.find((deal) => deal.id === form.deal_id);
    if (!selectedDeal) return;

    setForm((current) => ({
      ...current,
      title:
        current.scheduleType === "installation"
          ? `${selectedDeal.title} 설치 일정`
          : `${selectedDeal.title} 미팅`,
    }));
  }, [form.deal_id, form.scheduleType, form.title, open, sortedDeals]);

  function updateField<Key extends keyof ScheduleFormState>(
    key: Key,
    value: ScheduleFormState[Key]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toIsoString(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error("일정 시간을 다시 확인해주세요.");
    }
    return date.toISOString();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const startsAtIso = toIsoString(form.starts_at);
      const endsAtIso = toIsoString(form.ends_at);

      if (new Date(endsAtIso).getTime() <= new Date(startsAtIso).getTime()) {
        throw new Error("종료 시간이 시작 시간보다 늦어야 합니다.");
      }

      const url =
        form.scheduleType === "installation"
          ? "/api/partner/installations"
          : "/api/partner/calendar";

      const body =
        form.scheduleType === "installation"
          ? {
              deal_id: form.deal_id,
              title: form.title,
              scheduled_start_at: startsAtIso,
              scheduled_end_at: endsAtIso,
              timezone: form.timezone,
              location: form.location,
              assigned_team: form.assigned_team,
              notes: form.description,
            }
          : {
              deal_id: form.deal_id,
              title: form.title,
              starts_at: startsAtIso,
              ends_at: endsAtIso,
              timezone: form.timezone,
              location: form.location,
              description: form.description,
            };

      const response = await portalFetch(url, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "일정 생성에 실패했습니다.");
      }

      await onSaved?.();
      onOpenChange(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "일정 생성에 실패했습니다."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100%-1rem)] overflow-y-auto border-[#e7e0d6] bg-[#fffdf8] p-4 sm:max-w-2xl sm:p-6">
        <DialogHeader>
          <DialogTitle>일정 추가</DialogTitle>
          <DialogDescription>
            거래에 연결된 미팅 또는 설치 일정을 생성하면 캘린더와 활동 로그에 바로 반영됩니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {(["meeting", "installation"] as ScheduleType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => updateField("scheduleType", type)}
                className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                  form.scheduleType === type
                    ? "bg-[#111110] text-white"
                    : "border border-[#d9cfbf] bg-white text-[#1a1a1a]/60"
                }`}
              >
                {type === "meeting" ? "미팅 일정" : "설치 일정"}
              </button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="거래" required>
              <select
                required
                value={form.deal_id}
                onChange={(event) => updateField("deal_id", event.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {sortedDeals.length === 0 ? (
                  <option value="">등록된 거래가 없습니다</option>
                ) : (
                  sortedDeals.map((deal) => (
                    <option key={deal.id} value={deal.id}>
                      {deal.customer_name ? `${deal.customer_name} · ` : ""}
                      {deal.title}
                    </option>
                  ))
                )}
              </select>
            </Field>

            <Field label="제목" required>
              <Input
                required
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                placeholder={
                  form.scheduleType === "installation"
                    ? "예: 본관 2층 설치 일정"
                    : "예: 추가 설치 범위 조정 미팅"
                }
              />
            </Field>

            <Field label="시작 일시" required>
              <Input
                required
                type="datetime-local"
                value={form.starts_at}
                onChange={(event) =>
                  updateField("starts_at", event.target.value)
                }
              />
            </Field>

            <Field label="종료 일시" required>
              <Input
                required
                type="datetime-local"
                value={form.ends_at}
                onChange={(event) => updateField("ends_at", event.target.value)}
              />
            </Field>

            <Field label="타임존">
              <Input
                value={form.timezone}
                onChange={(event) => updateField("timezone", event.target.value)}
                placeholder="Asia/Seoul"
              />
            </Field>

            <Field label="장소">
              <Input
                value={form.location}
                onChange={(event) => updateField("location", event.target.value)}
                placeholder="예: 서울 강남구 ..."
              />
            </Field>

            {form.scheduleType === "installation" && (
              <Field label="설치 팀">
                <Input
                  value={form.assigned_team}
                  onChange={(event) =>
                    updateField("assigned_team", event.target.value)
                  }
                  placeholder="예: 설치 1팀"
                />
              </Field>
            )}
          </div>

          <Field label={form.scheduleType === "installation" ? "메모" : "설명"}>
            <textarea
              value={form.description}
              onChange={(event) =>
                updateField("description", event.target.value)
              }
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder={
                form.scheduleType === "installation"
                  ? "설치 메모와 현장 준비사항을 적어두세요."
                  : "미팅 목적과 준비사항을 적어두세요."
              }
            />
          </Field>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              취소
            </Button>
            <Button type="submit" disabled={saving || sortedDeals.length === 0}>
              {saving ? "저장 중..." : "일정 생성"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  required = false,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-[#1a1a1a]">
        {label}
        {required ? " *" : ""}
      </Label>
      {children}
    </div>
  );
}
