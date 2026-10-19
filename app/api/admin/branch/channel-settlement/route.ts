import { NextRequest, NextResponse } from 'next/server'
import { BRANCH_READ_ADMIN_API_ROLES, verifyAdmin } from '@/lib/admin-auth'
import { resolvePeriodDate } from '@/lib/branch/fiscal'
import { readChannelSettlement } from '@/lib/branch/read-channel-settlement'
import { buildChannelSettlementOverview } from '@/lib/branch/channel-settlement'

export const maxDuration = 30
export async function GET(req: NextRequest) {
  const denied = await verifyAdmin(req, BRANCH_READ_ADMIN_API_ROLES)
  if (denied) return denied
  const params = req.nextUrl.searchParams
  const period = params.get('period') ?? 'Q'
  if (period !== 'M' && period !== 'Q' && period !== 'Y') return NextResponse.json({ error: 'Invalid period query' }, { status: 400 })
  if (params.has('team')) return NextResponse.json({ error: 'Channel settlements have company-wide scope' }, { status: 400 })
  const periodDate = resolvePeriodDate(period, params.get('month'))
  if (!periodDate) return NextResponse.json({ error: 'Invalid month query' }, { status: 400 })
  try {
    const { records, readAt } = await readChannelSettlement()
    return NextResponse.json(buildChannelSettlementOverview(records, period, periodDate, readAt), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: '채널 정산 시트의 접근 권한·구조·금액·날짜를 확인할 수 없습니다. 잠시 후 다시 확인해 주세요.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } })
  }
}
