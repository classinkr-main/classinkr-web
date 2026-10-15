import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
const mocks = vi.hoisted(() => ({ verify: vi.fn(), read: vi.fn() }))
vi.mock('@/lib/admin-auth', () => ({ verifyAdmin: mocks.verify, BRANCH_READ_ADMIN_API_ROLES: ['branch_read'] }))
vi.mock('@/lib/branch/read-channel-settlement', () => ({ readChannelSettlement: mocks.read }))
import { GET } from '@/app/api/admin/branch/channel-settlement/route'
const request = (query = '') => new NextRequest(`http://localhost/api/admin/branch/channel-settlement${query}`)
beforeEach(() => { vi.clearAllMocks(); mocks.verify.mockResolvedValue(null); mocks.read.mockResolvedValue({ records: [], readAt: '2026-10-15T00:00:00Z' }) })
describe('채널 정산 API', () => {
  it('인증 실패는 원본 조회 전에 종료한다', async () => {
    mocks.verify.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }))
    expect((await GET(request())).status).toBe(403); expect(mocks.read).not.toHaveBeenCalled()
  })
  it.each(['?period=X', '?period=M&month=2026-13', '?team=MKT'])('잘못된 필터 %s는 400', async query => {
    expect((await GET(request(query))).status).toBe(400); expect(mocks.read).not.toHaveBeenCalled()
  })
  it('월 필터를 전사 범위에 적용하고 캐시와 개인행을 응답하지 않는다', async () => {
    const response = await GET(request('?period=M&month=2026-09'))
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({ scope: 'company-wide', currency: 'CNY', periodStart: '2026-09-01', periodEnd: '2026-10-01', totals: { contracts: 0, feeAmountRmb: null } })
    expect(mocks.verify).toHaveBeenCalledWith(expect.anything(), ['branch_read'])
  })
  it('원본 실패는 503이며 공급자 메시지·키·정상0을 노출하지 않는다', async () => {
    mocks.read.mockRejectedValue(new Error('secret-provider-message'))
    const response = await GET(request()); expect(response.status).toBe(503)
    const result = await response.json(); expect(result.error).not.toMatch(/secret-provider/); expect(result.totals).toBeUndefined()
  })
})
