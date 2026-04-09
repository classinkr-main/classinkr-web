"use client";

import { useEffect, useState, type FormEvent } from "react";

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
import type { CalendarEvent } from "@/lib/partner-portal/types";

type CalendarEventQuickAdjustDialogProps = {
  open: boolean;
  event: CalendarEvent | null;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => Promise<void> | void;
};

type EventFormState = {
  title: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  location: string;
  description: string;
};

function toLocalDateTimeValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (segment: number) => String(segment).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function parseDescription(description?: string | null) {
  if (!description) {
    return {
      location: "",
      description: "",
    };
  }

  const lines = description
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines[0]?.startsWith("장소:")) {
    return {
      location: lines[0].replace(/^장소:\s*/, ""),
      description: lines.slice(1).join("\n"),
    };
  }

  return {
    location: "",
    description,
  };
}

function createDefaultForm(event: CalendarEvent | null): EventFormState {
  const parsed = parseDescription(event?.description);

  return {
    title: event?.title ?? "",
    starts_at: event ? toLocalDateTimeValue(event.starts_at) : "",
    ends_at: event ? toLocalDateTimeValue(event.ends_at) : "",
    timezone: event?.timezone ?? "Asia/Seoul",
    location: parsed.location,
    description: parsed.description,
  };
}

function sourceLabel(sourceType: CalendarEvent["source_type"]) {
  return (
    {
      installation: "설치 일정",
      meeting: "미팅 일정",
      document_due: "문서 기한",
      internal: "내부 일정",
    }[sourceType] ?? sourceType
  );
}

export function CalendarEventQuickAdjustDialog({
  open,
  event,
  onOpenChange,
  onSaved,
}: CalendarEventQuickAdjustDialogProps) {
  const [form, setForm] = useState<EventFormState>(() => createDefaultForm(event));
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    setForm(createDefaultForm(event));
    setSaving(false);
    setCancelling(false);
    setError(null);
  }, [event, open]);

  function updateField<Key extends keyof EventFormState>(key: Key, value: EventFormState[Key]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function toIsoString(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error("일정 시간을 다시 확인해 주세요.");
    }
    return date.toISOString();
  }

  async function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();

    if (!event) {
      setError("조정할 일정이 없습니다.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const startsAtIso = toIsoString(form.starts_at);
      const endsAtIso = toIsoString(form.ends_at);

      if (new Date(endsAtIso).getTime() <= new Date(startsAtIso).getTime()) {
        throw new Error("종료 시간은 시작 시간보다 뒤여야 합니다.");
      }

      const response = await portalFetch(`/api/partner/calendar/${event.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title,
          starts_at: startsAtIso,
          ends_at: endsAtIso,
          timezone: form.timezone,
          location: form.location,
          description: form.description,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "일정 조정에 실패했습니다.");
      }

      await onSaved?.();
      onOpenChange(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "일정 조정에 실패했습니다."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelEvent() {
    if (!event) {
      setError("취소할 일정이 없습니다.");
      return;
    }

    if (!window.confirm(`"${event.title}" 일정을 취소할까요?`)) {
      return;
    }

    setCancelling(true);
    setError(null);

    try {
      const response = await portalFetch(`/api/partner/calendar/${event.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "cancelled",
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "일정 취소에 실패했습니다.");
      }

      await onSaved?.();
      onOpenChange(false);
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "일정 취소에 실패했습니다."
      );
    } finally {
      setCancelling(false);
    }
  }

  const canMutate = Boolean(event) && event?.status === "active";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100%-1rem)] overflow-y-auto border-[#e7e0d6] bg-[#fffdf8] p-4 sm:max-w-xl sm:p-6">
        <DialogHeader>
          <DialogTitle>선택 일정 조정</DialogTitle>
          <DialogDescription>
            {event
              ? `${sourceLabel(event.source_type)} 시간을 바꾸거나 메모를 수정하고 바로 취소할 수 있습니다.`
              : "선택된 일정 정보를 불러오지 못했습니다."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="제목" required>
              <Input
                required
                value={form.title}
                onChange={(formEvent) => updateField("title", formEvent.target.value)}
                disabled={!canMutate}
              />
            </Field>

            <Field label="표시 시간대">
              <Input
                value={form.timezone}
                onChange={(formEvent) => updateField("timezone", formEvent.target.value)}
                placeholder="Asia/Seoul"
                disabled={!canMutate}
              />
            </Field>

            <Field label="시작 일시" required>
              <Input
                required
                type="datetime-local"
                value={form.starts_at}
                onChange={(formEvent) => updateField("starts_at", formEvent.target.value)}
                disabled={!canMutate}
              />
            </Field>

            <Field label="종료 일시" required>
              <Input
                required
                type="datetime-local"
                value={form.ends_at}
                onChange={(formEvent) => updateField("ends_at", formEvent.target.value)}
                disabled={!canMutate}
              />
            </Field>

            <Field label="장소">
              <Input
                value={form.location}
                onChange={(formEvent) => updateField("location", formEvent.target.value)}
                placeholder="예: 서울 강남구..."
                disabled={!canMutate}
              />
            </Field>
          </div>

          <Field label="메모">
            <textarea
              value={form.description}
              onChange={(formEvent) => updateField("description", formEvent.target.value)}
              rows={4}
              disabled={!canMutate}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="현장 메모나 변경 사유를 적어 주세요."
            />
          </Field>

          {!canMutate && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              취소되었거나 완료된 일정은 여기서 다시 수정할 수 없습니다.
            </p>
          )}

          {error && (
            <p className="rounded-md border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-sm text-[#B85C33]">
              {error}
            </p>
          )}

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelEvent}
              disabled={!canMutate || saving || cancelling}
              className="border-[#F6D5C5] text-[#B85C33] hover:bg-[#FEF3EE] hover:text-[#9A4A27]"
            >
              {cancelling ? "취소 처리 중..." : "일정 취소"}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving || cancelling}
              >
                닫기
              </Button>
              <Button type="submit" disabled={!canMutate || saving || cancelling}>
                {saving ? "저장 중..." : "변경 저장"}
              </Button>
            </div>
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
