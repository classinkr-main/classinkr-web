"use client";

import { useEffect, useState } from "react";

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

type CustomerFormState = {
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  business_number: string;
  campus_name: string;
  region_label: string;
  notes: string;
};

const EMPTY_FORM: CustomerFormState = {
  name: "",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
  business_number: "",
  campus_name: "",
  region_label: "",
  notes: "",
};

interface CustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => Promise<void> | void;
}

export function CustomerDialog({
  open,
  onOpenChange,
  onSaved,
}: CustomerDialogProps) {
  const [form, setForm] = useState<CustomerFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM);
      setSaving(false);
      setError(null);
      setSavedName(null);
    }
  }, [open]);

  function updateField<Key extends keyof CustomerFormState>(
    key: Key,
    value: CustomerFormState[Key]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await portalFetch("/api/partner/customers", {
        method: "POST",
        body: JSON.stringify(form),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "고객 생성에 실패했습니다.");
      }

      setSavedName(form.name);
      await onSaved?.();
      onOpenChange(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "고객 생성에 실패했습니다."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[calc(100%-1rem)] overflow-y-auto border-[#e7e0d6] bg-[#fffdf8] p-4 sm:max-w-2xl sm:p-6">
        <DialogHeader>
          <DialogTitle>새 고객</DialogTitle>
          <DialogDescription>
            고객 기관을 먼저 등록한 뒤 신규 컨택과 일정으로 이어갈 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="기관명" required>
              <Input
                required
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="예: 강남메가스터디학원"
              />
            </Field>

            <Field label="담당자명">
              <Input
                value={form.contact_name}
                onChange={(event) =>
                  updateField("contact_name", event.target.value)
                }
                placeholder="예: 김선생"
              />
            </Field>

            <Field label="연락처">
              <Input
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                placeholder="예: 010-1234-5678"
              />
            </Field>

            <Field label="이메일">
              <Input
                type="email"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                placeholder="예: contact@classin.co.kr"
              />
            </Field>

            <Field label="지역">
              <Input
                value={form.region_label}
                onChange={(event) =>
                  updateField("region_label", event.target.value)
                }
                placeholder="예: 강남"
              />
            </Field>

            <Field label="캠퍼스/관명">
              <Input
                value={form.campus_name}
                onChange={(event) =>
                  updateField("campus_name", event.target.value)
                }
                placeholder="예: 본관"
              />
            </Field>

            <Field label="사업자번호">
              <Input
                value={form.business_number}
                onChange={(event) =>
                  updateField("business_number", event.target.value)
                }
                placeholder="예: 123-45-67890"
              />
            </Field>

            <Field label="주소">
              <Input
                value={form.address}
                onChange={(event) => updateField("address", event.target.value)}
                placeholder="예: 서울 강남구 ..."
              />
            </Field>
          </div>

          <Field label="메모">
            <textarea
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="운영 메모를 남겨두세요."
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
            <Button type="submit" disabled={saving}>
              {saving ? "저장 중..." : "고객 생성"}
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
