"use client"

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { AlertCircle, CheckCircle2 } from "lucide-react"

import { isInternalPath } from "@/lib/internal-path"
import { cn } from "@/lib/utils"

type ToastType = "success" | "error"

interface ToastItem {
  id: number
  type: ToastType
  message: string
}

interface ToastContextValue {
  success: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counterRef = useRef(0)

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const add = useCallback((type: ToastType, message: string) => {
    const id = ++counterRef.current
    setToasts((prev) => [...prev, { id, type, message }])
    setTimeout(() => remove(id), 3000)
  }, [remove])

  const value: ToastContextValue = {
    success: (msg) => add("success", msg),
    error: (msg) => add("error", msg),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={remove} />
    </ToastContext.Provider>
  )
}

// 경로 구독은 뷰포트에만 둔다. Provider 가 이동마다 다시 그려지면 useToast 값이 바뀐다.
function ToastViewport({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  const pathname = usePathname()

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className={cn(
        "fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none", // 공유 기본값, 불변
        // 공개 경로만 .site 표지 + 위치(PC 헤더 아래, 휴대폰 하단 가운데)
        !isInternalPath(pathname) &&
          "site md:top-[calc(var(--header-h)+16px)] max-md:inset-x-4 max-md:top-auto max-md:items-center max-md:bottom-[calc(env(safe-area-inset-bottom)+80px)]",
      )}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // trigger enter animation
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  const isSuccess = toast.type === "success"

  return (
    <div
      role="status"
      onClick={() => onDismiss(toast.id)}
      style={{
        transition: "opacity 0.25s ease, transform 0.25s ease",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(12px)",
      }}
      className={[
        "pointer-events-auto flex items-center gap-2.5 rounded-xl px-4 py-3 shadow-md text-sm font-medium cursor-pointer select-none",
        "border",
        isSuccess
          ? "bg-[#ECFDF5] text-[#084734] border-[#084734]/15"
          : "bg-[#FFF1EC] text-[#B85C33] border-[#B85C33]/15",
      ].join(" ")}
    >
      {isSuccess ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 shrink-0" />
      )}
      <span>{toast.message}</span>
    </div>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider")
  }
  return ctx
}
