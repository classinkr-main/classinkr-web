"use client";

import { Download } from "lucide-react";

export interface ExportColumn {
  key: string;
  label: string;
}

type ExportRows = Array<Record<string, string | number | null>>;

export interface CampaignExportButtonProps {
  columns: ExportColumn[];
  /** 배열 또는 지연 생성자 — 큰 목록은 함수로 넘겨 클릭 시점에만 행을 만든다(필터 변경마다 선행 생성 방지). */
  rows: ExportRows | (() => ExportRows);
  /** rows 가 함수일 때의 행 수 — 빈 목록 비활성 판정용. 생략하면 항상 활성으로 둔다. */
  rowCount?: number;
  filename?: string;
  label?: string;
  disabled?: boolean;
}

/** Escape a single CSV cell: null -> "", wrap in quotes + double quotes when needed. */
function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Build CSV text (header row from column labels) for the given columns + rows. */
function buildCsv(
  columns: ExportColumn[],
  rows: Array<Record<string, string | number | null>>,
): string {
  const header = columns.map((column) => escapeCsvCell(column.label)).join(",");
  const body = rows.map((row) =>
    columns.map((column) => escapeCsvCell(row[column.key])).join(","),
  );
  return [header, ...body].join("\r\n");
}

export function CampaignExportButton({
  columns,
  rows,
  rowCount,
  filename = "campaign-export",
  label = "CSV 내보내기",
  disabled = false,
}: CampaignExportButtonProps) {
  const knownCount = typeof rows === "function" ? rowCount : rows.length;
  const isDisabled = disabled || knownCount === 0 || columns.length === 0;

  function handleExport() {
    if (isDisabled) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const resolvedRows = typeof rows === "function" ? rows() : rows;
    if (resolvedRows.length === 0) return;
    const csv = buildCsv(columns, resolvedRows);
    // Prepend a UTF-8 BOM so Korean text opens correctly in Excel.
    const blob = new Blob([`﻿${csv}`], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${filename}.csv`;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={isDisabled}
      aria-label={label}
      title={
        rows.length === 0 ? "내보낼 데이터가 없습니다." : label
      }
      className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition-colors hover:bg-[#F6F5F4] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white"
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2} />
      <span>{label}</span>
    </button>
  );
}

export default CampaignExportButton;
