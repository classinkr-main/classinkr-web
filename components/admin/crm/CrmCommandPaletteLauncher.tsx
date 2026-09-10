"use client"

import { useEffect, useRef, useState, type ComponentType } from "react"

interface LazyCrmPaletteProps {
  initiallyOpen?: boolean
}

// ⌘K 커맨드 팔레트 지연 런처(감사 #12) — CRM 레이아웃 초기 번들에서 팔레트 본체
// (CrmCommandPalette: 포털·고객검색·라우트 인덱스)를 제외하고, 여기엔 단축키·사이드바
// 이벤트 리스너만 남긴다. 첫 오픈 신호(⌘K/Ctrl+K 또는 admin:open-command-palette)에
// 청크를 내려받아 열린 상태로 마운트한다.
// 팔레트 본체는 자기 리스너(⌘K 토글·ESC·사이드바 이벤트)를 스스로 등록하므로, 마운트
// 이후에는 런처 리스너를 내린다 — 첫 오픈 뒤 동작은 기존 상시 마운트와 동일하다.
// 이벤트 재발화는 부모/자식 effect 등록 순서에 기대어 첫 클릭이 유실될 수 있으므로 쓰지 않는다.
export default function CrmCommandPaletteLauncher() {
  const [Palette, setPalette] = useState<ComponentType<LazyCrmPaletteProps> | null>(null)
  const requestedRef = useRef(false)

  useEffect(() => {
    if (Palette) return

    function requestPalette() {
      if (requestedRef.current) return
      requestedRef.current = true
      void import("./CrmCommandPalette")
        .then((mod) => setPalette(() => mod.default))
        .catch(() => {
          // 청크 로드 실패(오프라인 등) — 다음 입력에서 재시도할 수 있게 되돌린다.
          requestedRef.current = false
        })
    }

    function onKeyDown(event: KeyboardEvent) {
      // 팔레트 본체와 동일한 키 매칭 — 첫 입력부터 브라우저 기본 동작을 막는다.
      if ((event.metaKey || event.ctrlKey) && (event.key === "k" || event.key === "K")) {
        event.preventDefault()
        requestPalette()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("admin:open-command-palette", requestPalette)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("admin:open-command-palette", requestPalette)
    }
  }, [Palette])

  return Palette ? <Palette initiallyOpen /> : null
}
