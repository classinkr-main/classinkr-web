export function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeRequiredText(value: string | null | undefined, fieldName: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required`);
  }

  return trimmed;
}

export function normalizeOptionalNumber(value: number | string | null | undefined) {
  if (value == null || value === "") return null;

  const numericValue =
    typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());

  if (!Number.isFinite(numericValue)) {
    throw new Error("Invalid numeric value");
  }

  return numericValue;
}
