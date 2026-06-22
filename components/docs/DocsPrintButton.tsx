"use client"

import { Printer } from "lucide-react"

/**
 * 현재 문서를 브라우저 인쇄(PDF로 저장)로 내보내는 버튼.
 * 인쇄 시에는 globals.css 의 @media print 규칙이 사이드바·목차·사이트 헤더/푸터를 숨기고
 * `.print-only-article` 본문만 출력한다.
 */
export function DocsPrintButton({ label = "PDF로 저장" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex origin-left items-center gap-2 rounded-full border border-[#084734]/30 px-5 py-2.5 text-sm font-bold text-[#084734] transition-all duration-150 hover:bg-[#ECFDF5] active:scale-[0.98]"
    >
      <Printer className="h-4 w-4" aria-hidden />
      {label}
    </button>
  )
}
