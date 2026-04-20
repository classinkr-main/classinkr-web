"use client"

import { useCallback, useState } from "react"
import { Check, Copy, ExternalLink, Printer } from "lucide-react"

import { Button } from "@/components/ui/button"

interface ReceiptViewProps {
  /** Full URL of the receipt page for clipboard copy */
  receiptUrl: string
  /** Toss 매출전표 URL */
  tossReceiptUrl: string | null
}

export function ReceiptView({ receiptUrl, tossReceiptUrl }: ReceiptViewProps) {
  const [copied, setCopied] = useState(false)

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(receiptUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea")
      textarea.value = receiptUrl
      textarea.style.position = "fixed"
      textarea.style.opacity = "0"
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [receiptUrl])

  return (
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      {tossReceiptUrl && (
        <Button asChild variant="outline" size="default">
          <a href={tossReceiptUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />
            토스 매출전표
          </a>
        </Button>
      )}

      <Button variant="outline" size="default" onClick={handlePrint}>
        <Printer className="h-4 w-4" />
        인쇄 / PDF 저장
      </Button>

      <Button variant="outline" size="default" onClick={handleCopyLink}>
        {copied ? (
          <>
            <Check className="h-4 w-4" />
            복사 완료
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" />
            링크 복사
          </>
        )}
      </Button>
    </div>
  )
}
