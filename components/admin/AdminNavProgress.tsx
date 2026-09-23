"use client"

/* Admin 셸 네비게이션 진행바 — Compass(마케팅팀 앱)의 NavProgress 이식.
   어드민은 서버 레이아웃 + 클라이언트 화면 구조라 사이드바 링크를 눌러도 RSC 응답이 올 때까지
   화면이 그대로 멈춰 "죽은 버튼"처럼 느껴지고, 그 사이 재클릭이 요청을 한 번 더 만든다.
   내부 링크 클릭·GET 폼 제출·뒤로가기를 감지해 상단에 2px 진행바를 켜고, URL이 실제로
   바뀌면 끈다. 서버 액션·fetch 기반 버튼은 각 버튼의 로딩 상태가 담당하므로 여기선 안 잡는다.

   "URL이 바뀌면 끈다"를 effect 안의 setState 대신 파생값으로 푼다: 켤 때 그 시점의 URL을
   기억해 두고, 현재 URL과 같을 때만 켜진 것으로 본다. URL이 바뀌는 순간 자동으로 꺼진다. */
import { usePathname, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useRef, useState } from "react"

/** 비교용 URL 키 — pathname + 정규화한 query. location과 next/navigation 값을 같은 형태로 맞춘다. */
function urlKey(pathname: string, query: string) {
  return `${pathname}?${new URLSearchParams(query).toString()}`
}

function Bar() {
  const pathname = usePathname()
  const search = useSearchParams()
  const currentKey = urlKey(pathname, search.toString())
  // 진행바를 켠 시점의 URL. 현재 URL과 같을 때만 "아직 이동 중"이다.
  const [armedKey, setArmedKey] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busy = armedKey !== null && armedKey === currentKey

  // URL이 바뀌면 도착 — 안전장치 타이머만 정리한다(표시는 파생값이라 저절로 꺼진다).
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [currentKey])

  useEffect(() => {
    const arm = () => {
      setArmedKey(urlKey(location.pathname, location.search))
      if (timer.current) clearTimeout(timer.current)
      // 안전장치: 응답이 끝내 안 오면(네트워크 오류 등) 12초 뒤 자동 소등
      timer.current = setTimeout(() => setArmedKey(null), 12000)
    }
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.("a")
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return
      const href = a.getAttribute("href")
      if (!href || !href.startsWith("/")) return
      const to = new URL(href, location.href)
      if (to.pathname === location.pathname && to.search === location.search) return // 제자리 클릭
      arm()
    }
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement | null
      if (f && f.method === "get") arm() // URL로 가는 필터 폼만
    }
    const onPop = () => arm()
    document.addEventListener("click", onClick, true)
    document.addEventListener("submit", onSubmit, true)
    window.addEventListener("popstate", onPop)
    return () => {
      document.removeEventListener("click", onClick, true)
      document.removeEventListener("submit", onSubmit, true)
      window.removeEventListener("popstate", onPop)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  return <div aria-hidden className={`admin-nav-progress ${busy ? "on" : ""}`} />
}

export default function AdminNavProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  )
}
