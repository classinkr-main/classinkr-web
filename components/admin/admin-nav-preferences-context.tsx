"use client"

// 셸 세션의 개인 nav 선호(nav_overrides)를 본문 컴포넌트에 내려주는 작은 컨텍스트.
//
// 사이드바·⌘K 는 셸(AdminShell)이 props 로 세션을 넘기지만, CRM 탭 줄(CrmSubnav)은 본문 레이아웃
// (app/admin/crm/layout.tsx) 안에 있어 셸 세션에 닿을 길이 없었다. CRM 하위 탭 개인 숨김
// (admin-nav-access.ts 의 crm: 키)을 판정·"다시 표시" 저장하려면 같은 값과 저장 콜백이 필요하다.
//
// 이것은 화면 정리 설정일 뿐 보안 경계가 아니다 — 숨긴 탭의 데이터 접근은 각 API 의 관리자 가드가
// 정한다. 판정은 반드시 admin-nav-access 의 순수 함수로 한다(여기서 계산하지 않는다).
import { createContext, useContext, type ReactNode } from "react"

import type { NavOverrides } from "./admin-nav-access"

export interface AdminNavPreferencesValue {
  role: string
  /** 셸 세션의 원본 값(정규화 전) — 소비자가 normalizeNavOverrides 로 읽는다. */
  navOverrides: Readonly<Record<string, string>>
  /**
   * 본인 저장이 성공했을 때 서버가 정규화해 돌려준 값을 셸에 반영한다(세션·핀·사이드바·⌘K 동시 갱신).
   * 없으면(세션 확인 전) 저장 UI 를 비활성화한다.
   */
  onNavOverridesChange?: (next: NavOverrides) => void
}

// 모듈 상수 — 소비자의 useMemo 가 매 렌더 새 객체로 무효화되지 않게 같은 참조를 돌려준다.
const EMPTY_NAV_PREFERENCES: AdminNavPreferencesValue = { role: "ADMIN", navOverrides: {} }

const AdminNavPreferencesContext = createContext<AdminNavPreferencesValue | null>(null)

export function AdminNavPreferencesProvider({
  value,
  children,
}: {
  /** null 이면 기본값 판정(전원 공통 기본 숨김)으로 읽고 저장은 막힌다. */
  value: AdminNavPreferencesValue | null
  children: ReactNode
}) {
  return <AdminNavPreferencesContext.Provider value={value}>{children}</AdminNavPreferencesContext.Provider>
}

/** provider 가 없거나 값이 null 이면 빈 오버라이드(= 전원 공통 기본값)를 돌려준다. */
export function useAdminNavPreferences(): AdminNavPreferencesValue {
  return useContext(AdminNavPreferencesContext) ?? EMPTY_NAV_PREFERENCES
}
