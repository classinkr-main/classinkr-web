// 하드웨어 화면의 요청자별 viewer — /api/admin/hardware 라우트와 app/admin/hardware/page.tsx 프리패치가
// 같은 함수를 써서 두 경로 응답이 갈라지지 않게 한다. 캐시되는 대시보드 밖에서 매 요청 계산한다.
// 클라이언트는 이 값으로 버튼을 비활성 표시만 하고, 강제는 항상 서버 게이트가 한다.
import {
  HARDWARE_EDITOR_ADMIN_API_ROLES,
  HARDWARE_FINALIZE_CAPABILITY,
  hasAdminApiRole,
  hasAdminCapability,
  isHardwareInventoryManager,
  type VerifiedAdminContext,
} from "@/lib/admin-auth"

export interface HardwareViewer {
  /** 오더 승인·최종 확정(hardware.finalize). */
  canFinalize: boolean
  /** 기록을 만들 수 있는 역할(HARDWARE_EDITOR_ADMIN_API_ROLES). 읽기 역할은 false. */
  canWrite: boolean
  /** 입고관리 권한자 — 입고·조정 등록, 남의 출고·실현 기록 수정·취소(hardware.inbound | finalize | 슈퍼 어드민). */
  canManageInventory: boolean
  /** 로그인 계정 id — 본인 건 판정(movement.owner_user_id·created_by_user_id). 레거시 세션은 null. */
  userId: string | null
  /** "내 담당" 필터의 정본 — movement.owner 와 비교한다(trim, 없으면 null). */
  name: string | null
}

export function buildHardwareViewer(
  admin: Pick<VerifiedAdminContext, "role" | "capabilities" | "userId" | "name">
): HardwareViewer {
  return {
    canFinalize: hasAdminCapability(admin, HARDWARE_FINALIZE_CAPABILITY),
    canWrite: hasAdminApiRole(admin.role, HARDWARE_EDITOR_ADMIN_API_ROLES),
    canManageInventory: isHardwareInventoryManager(admin),
    userId: admin.userId ?? null,
    name: admin.name?.trim() || null,
  }
}
