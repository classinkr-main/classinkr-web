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
                    <DialogTitle>휴지통으로 이동</DialogTitle>
                    <DialogDescription>
                        &ldquo;{post?.title}&rdquo;을(를) 휴지통으로 이동합니다. 휴지통에서 복원하거나 완전히 삭제할 수 있습니다.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={loading}>
                        취소
                    </Button>
                    <Button variant="destructive" onClick={onConfirm} disabled={loading}>
                        {loading ? "이동 중..." : "휴지통으로 이동"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
