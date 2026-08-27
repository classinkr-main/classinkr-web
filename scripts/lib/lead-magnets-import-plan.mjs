import { isDeepStrictEqual } from "node:util";

/**
 * lead_magnets 업서트의 결과를 순수 계산한다. 같은 slug가 입력에 여러 번 있으면 실제 순차
 * upsert처럼 앞 항목의 결과를 다음 항목의 현재값으로 사용한다.
 */
export function buildLeadMagnetImportPlan(magnets, existingRows = []) {
  if (!Array.isArray(magnets)) {
    throw new TypeError("data/lead-magnets.json 최상위는 배열이어야 합니다.");
  }

  const currentBySlug = new Map(
    existingRows.map((row) => [row.slug, { data: row.data, published: row.published === true }])
  );
  const seenSlugs = new Set();
  const duplicateSlugs = new Set();
  const operations = [];
  let invalid = 0;

  for (const magnet of magnets) {
    if (!magnet?.slug || typeof magnet.slug !== "string") {
      invalid += 1;
      continue;
    }

    const slug = magnet.slug;
    if (seenSlugs.has(slug)) duplicateSlugs.add(slug);
    seenSlugs.add(slug);

    const next = { data: magnet, published: magnet.published === true };
    const current = currentBySlug.get(slug);
    const action = !current
      ? "insert"
      : current.published === next.published && isDeepStrictEqual(current.data, next.data)
        ? "unchanged"
        : "update";

    operations.push({ slug, action });
    currentBySlug.set(slug, next);
  }

  const count = (action) => operations.filter((operation) => operation.action === action).length;
  const wouldInsert = count("insert");
  const wouldUpdate = count("update");
  const unchanged = count("unchanged");

  return {
    total: magnets.length,
    valid: operations.length,
    invalid,
    duplicateSlugs: Array.from(duplicateSlugs).sort(),
    wouldInsert,
    wouldUpdate,
    unchanged,
    wouldUpsert: wouldInsert + wouldUpdate,
    operations,
  };
}
