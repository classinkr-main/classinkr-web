"use client"

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

interface DeleteConfirmDialogProps {
    post: BlogPost | null
    open: boolean
    onClose: () => void
    onConfirm: () => void
    loading?: boolean
}

export default function DeleteConfirmDialog({ post, open, onClose, onConfirm, loading }: DeleteConfirmDialogProps) {
    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-md bg-white">
                <DialogHeader>
                    <DialogTitle>글 삭제</DialogTitle>
                    <DialogDescription>
                        &ldquo;{post?.title}&rdquo;을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={loading}>
                        취소
                    </Button>
                    <Button variant="destructive" onClick={onConfirm} disabled={loading}>
                        {loading ? "삭제 중..." : "삭제"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
