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
import { portalFetch } from "@/lib/portal/portal-fetch";

export type PartnerCustomerOption = {
  id: string;
  name: string;
  region_label?: string | null;
  campus_name?: string | null;
};

interface DealQuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: PartnerCustomerOption[];
  defaultCustomerId?: string | null;
  onSaved?: () => Promise<void> | void;
}

type DealFormState = {
  customer_id: string;
  title: string;
  expected_amount: string;
  notes: string;
};

export function DealQuickCreateDialog({
  open,
  onOpenChange,
  customers,
  defaultCustomerId,
  onSaved,
}: DealQuickCreateDialogProps) {
  const [form, setForm] = useState<DealFormState>({
    customer_id: defaultCustomerId ?? customers[0]?.id ?? "",
    title: "",
    expected_amount: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedCustomers = useMemo(
    () =>
      [...customers].sort((left, right) =>
        left.name.localeCompare(right.name, "ko")
      ),
    [customers]
  );

  useEffect(() => {
    if (!open) {
      setForm({
        customer_id: defaultCustomerId ?? customers[0]?.id ?? "",
        title: "",
        expected_amount: "",
        notes: "",
      });
      setSaving(false);
      setError(null);
    }
  }, [customers, defaultCustomerId, open]);

  function updateField<Key extends keyof DealFormState>(
    key: Key,
    value: DealFormState[Key]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await portalFetch("/api/portal/deals", {
        method: "POST",
        body: JSON.stringify({
          customer_id: form.customer_id,
          title: form.title,
          expected_amount: form.expected_amount,
          notes: form.notes,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "신규 컨택 생성에 실패했습니다.");
      }

      await onSaved?.();
      onOpenChange(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "신규 컨택 생성에 실패했습니다."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100%-1rem)] overflow-y-auto border-[#e7e0d6] bg-[#fffdf8] p-4 sm:max-w-xl sm:p-6">
        <DialogHeader>
          <DialogTitle>신규 컨택</DialogTitle>
          <DialogDescription>
            선택한 고객 아래에 컨택 단계 거래를 바로 생성합니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Field label="고객" required>
            <select
              required
              value={form.customer_id}
              onChange={(event) =>
                updateField("customer_id", event.target.value)
              }
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {sortedCustomers.length === 0 ? (
                <option value="">등록된 고객이 없습니다</option>
              ) : (
                sortedCustomers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                    {customer.campus_name ? ` (${customer.campus_name})` : ""}
                    {customer.region_label ? ` · ${customer.region_label}` : ""}
                  </option>
                ))
              )}
            </select>
            <p className="mt-1 text-[10px] text-[#1a1a1a]/40">잘못된 기관이면 먼저 고객 탭에서 수정하세요.</p>
          </Field>

          <Field label="컨택 제목" required>
            <Input
              required
              value={form.title}
              onChange={(event) => updateField("title", event.target.value)}
              placeholder="예: 본관 추가 설치 상담"
            />
          </Field>

          <Field label="예상 금액">
            <Input
              inputMode="numeric"
              value={form.expected_amount}
              onChange={(event) =>
                updateField("expected_amount", event.target.value)
              }
              placeholder="예: 14000000"
            />
          </Field>

          <Field label="메모">
            <textarea
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="상담 배경이나 다음 액션을 적어두세요."
            />
          </Field>

          {error && (
            <p className="rounded-md border border-[#F6D5C5] bg-[#FEF3EE] px-3 py-2 text-sm text-[#B85C33]">
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
            <Button
              type="submit"
              disabled={saving || sortedCustomers.length === 0}
            >
              {saving ? "저장 중..." : "컨택 생성"}
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
