/**
 * 리드마그넷 콘텐츠 보강분(scripts/data/lead-magnet-content-upgrade-*.json)을 운영 lead_magnets 행에
 * 어떻게 반영할지 순수 계산한다. DB를 읽거나 쓰지 않는다.
 *
 * 칸(최상위 필드)마다:
 * - DB 현재값이 to와 같으면 "already"(이미 반영됨, 쓰지 않음)
 * - DB 현재값이 from과 같으면 "apply"(가져온 뒤 아무도 안 고친 값 → to로 바꿈)
 * - 둘 다 아니면 "conflict"(사람이 고친 값으로 보고 건드리지 않음)
 *
 * "같다"는 어드민 저장(normalizeLeadMagnet)이 만드는 차이만 너그럽게 본다 — 빈 칸이 채워져 들어온
 * 키(""·[]·null)와 빠진 키를 같게, 문자열 앞뒤 공백을 무시. 그 밖의 차이는 전부 사람이 고친 것으로 본다.
 */

/**
 * @typedef {{ field: string, status: "apply" | "already" | "conflict" | "skipped", reason: string }} LeadMagnetUpgradeFieldPlan
 * @typedef {{
 *   slug: string,
 *   action: "update" | "unchanged" | "skip-missing-row",
 *   updatedAt?: string | null,
 *   fields: LeadMagnetUpgradeFieldPlan[],
 *   data?: Record<string, unknown>,
 * }} LeadMagnetUpgradeOperation
 */

/** 이 보강으로 바꾸면 안 되는 칸 — 주소·추적·공개 상태는 콘텐츠 보강 범위가 아니다. */
export const PROTECTED_FIELDS = Object.freeze([
  "slug",
  "sourceDetail",
  "resourceUrl",
  "storagePath",
  "gate",
  "status",
  "published",
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isBlank(value) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

export function isSameContent(a, b) {
  if (isBlank(a) && isBlank(b)) return true;
  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim();
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => isSameContent(item, b[index]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (!isSameContent(a[key], b[key])) return false;
    }
    return true;
  }
  return Object.is(a, b);
}

/** 보강 파일 모양을 확인하고 [slug, field, change] 목록으로 편다. 잘못된 파일은 던진다. */
export function readUpgradeChanges(upgrade) {
  if (!isPlainObject(upgrade) || !isPlainObject(upgrade.changes)) {
    throw new TypeError("보강 파일에는 changes 객체가 있어야 합니다.");
  }
  const entries = [];
  for (const [slug, fields] of Object.entries(upgrade.changes)) {
    if (!slug || !isPlainObject(fields)) throw new TypeError(`보강 파일의 ${slug || "(빈 slug)"} 항목이 객체가 아닙니다.`);
    for (const [field, change] of Object.entries(fields)) {
      if (PROTECTED_FIELDS.includes(field)) {
        throw new TypeError(`${slug}.${field}: 이 보강으로 바꿀 수 없는 칸입니다.`);
      }
      if (!isPlainObject(change) || !("from" in change) || !("to" in change)) {
        throw new TypeError(`${slug}.${field}: from과 to가 모두 있어야 합니다.`);
      }
      if (typeof change.reason !== "string" || !change.reason.trim()) {
        throw new TypeError(`${slug}.${field}: reason이 비어 있습니다.`);
      }
      entries.push({ slug, field, change });
    }
  }
  return entries;
}

/**
 * @param upgrade 보강 파일 내용
 * @param rows lead_magnets에서 읽은 행 [{ slug, data, updated_at }]
 */
export function buildLeadMagnetContentUpgradePlan(upgrade, rows = []) {
  const entries = readUpgradeChanges(upgrade);
  const rowBySlug = new Map(rows.map((row) => [row.slug, row]));
  const fieldsBySlug = new Map();
  for (const entry of entries) {
    if (!fieldsBySlug.has(entry.slug)) fieldsBySlug.set(entry.slug, []);
    fieldsBySlug.get(entry.slug).push(entry);
  }

  /** @type {LeadMagnetUpgradeOperation[]} */
  const operations = [];
  for (const [slug, slugEntries] of fieldsBySlug) {
    const row = rowBySlug.get(slug);
    if (!row) {
      operations.push({
        slug,
        action: "skip-missing-row",
        fields: slugEntries.map(({ field, change }) => ({ field, status: "skipped", reason: change.reason })),
      });
      continue;
    }

    const current = isPlainObject(row.data) ? row.data : {};
    const next = { ...current };
    /** @type {LeadMagnetUpgradeFieldPlan[]} */
    const fields = slugEntries.map(({ field, change }) => {
      const value = current[field];
      if (isSameContent(value, change.to)) return { field, status: "already", reason: change.reason };
      if (isSameContent(value, change.from)) {
        next[field] = change.to;
        return { field, status: "apply", reason: change.reason };
      }
      return { field, status: "conflict", reason: change.reason };
    });

    const willWrite = fields.some((item) => item.status === "apply");
    operations.push({
      slug,
      action: willWrite ? "update" : "unchanged",
      updatedAt: row.updated_at ?? null,
      fields,
      ...(willWrite ? { data: next } : {}),
    });
  }

  const allFields = operations.flatMap((operation) => operation.fields);
  const countFields = (status) => allFields.filter((item) => item.status === status).length;
  const countOps = (action) => operations.filter((operation) => operation.action === action).length;

  return {
    magnets: operations.length,
    rowsToUpdate: countOps("update"),
    rowsUnchanged: countOps("unchanged"),
    missingRows: countOps("skip-missing-row"),
    fieldsToApply: countFields("apply"),
    fieldsAlreadyApplied: countFields("already"),
    fieldsInConflict: countFields("conflict"),
    fieldsSkipped: countFields("skipped"),
    operations,
  };
}
