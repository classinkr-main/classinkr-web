"use client"

import type { ReactNode } from "react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { BlogPost } from "@/lib/blog-types"

// 원래 블로그 휴지통 이동 전용이었으나, CRM 비가역 동작 경고 통일(감사 2026-09-07 §3)을 위해
// 범용 확인 다이얼로그로 넓혔다. post/title/description을 안 넘기면 블로그의 기존 문구 그대로
// 동작한다 — app/admin/blog/page.tsx 호출부는 변경 없이 그대로 쓴다.
interface DeleteConfirmDialogProps {
    post?: BlogPost | null
    open: boolean
    onClose: () => void
    onConfirm: () => void
    loading?: boolean
    /** 기본값은 블로그 휴지통 문구. */
    title?: string
    description?: ReactNode
    confirmLabel?: string
    confirmLoadingLabel?: string
    cancelLabel?: string
    /** true면 파괴적 톤(빨강) 버튼 — 기본 true(블로그 기존 동작과 동일). */
    destructive?: boolean
    /**
     * "되돌릴 수 없습니다" 류의 보조 경고 한 줄. CRM의 리드 확인·연락기록 저장·리드 전환처럼
     * 취소 불가 동작에서만 넘긴다 — 없으면 렌더링하지 않아 블로그 쪽 화면은 그대로다.
     */
    irreversibleNote?: string
}

export default function DeleteConfirmDialog({
    post,
    open,
    onClose,
    onConfirm,
    loading,
    title,
    description,
    confirmLabel,
    confirmLoadingLabel,
    cancelLabel,
    destructive = true,
    irreversibleNote,
}: DeleteConfirmDialogProps) {
    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-md bg-white">
                <DialogHeader>
                    <DialogTitle>{title ?? "휴지통으로 이동"}</DialogTitle>
                    <DialogDescription>
                        {description ?? (
                            <>&ldquo;{post?.title}&rdquo;을(를) 휴지통으로 이동합니다. 휴지통에서 복원하거나 완전히 삭제할 수 있습니다.</>
                        )}
                    </DialogDescription>
                </DialogHeader>
                {irreversibleNote && (
                    <p className="text-[13px] text-red-600 -mt-2">{irreversibleNote}</p>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={loading}>
                        {cancelLabel ?? "취소"}
                    </Button>
                    <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm} disabled={loading}>
                        {loading ? (confirmLoadingLabel ?? "이동 중...") : (confirmLabel ?? "휴지통으로 이동")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
