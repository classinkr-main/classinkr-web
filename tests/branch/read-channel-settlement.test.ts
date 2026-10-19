import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), sheets: vi.fn(), get: vi.fn() }))
vi.mock('googleapis', () => ({ google: { auth: { GoogleAuth: class { constructor(config: unknown) { mocks.auth(config) } } }, sheets: mocks.sheets } }))
vi.mock('@/lib/branch/google-sheets', () => ({ envSheetId: () => 'test-sheet' }))
import { readChannelSettlement } from '@/lib/branch/read-channel-settlement'
const headers = ['EEO Account', 'UID', 'Partner', 'Service Version', 'BD', 'Contract amount (RMB)', '원화 적용 (KRW)', 'fee rate (%)', '수수료 지급액', 'payment date', 'settlement date', 'Note']
const sheet = () => ({ properties: { title: '3. 채널 정산', gridProperties: { rowCount: 2000, columnCount: 26 } }, data: [{ rowData: [{ values: [] }, { values: headers.map(stringValue => ({ effectiveValue: { stringValue } })) }] }] })
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', 'test@example.test'); vi.stubEnv('GOOGLE_PRIVATE_KEY', 'test-private-key'); mocks.sheets.mockReturnValue({ spreadsheets: { get: mocks.get } }); mocks.get.mockResolvedValue({ data: { sheets: [sheet()] } }) })
afterEach(() => vi.unstubAllEnvs())
describe('채널 정산 서버 읽기', () => {
  it('읽기 전용 인증과 전체 행 범위 및 제한된 요청 시간으로만 조회한다', async () => {
    expect((await readChannelSettlement()).records).toEqual([])
    expect(mocks.auth).toHaveBeenCalledWith(expect.objectContaining({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] }))
    expect(mocks.get).toHaveBeenCalledWith(expect.objectContaining({ spreadsheetId: 'test-sheet', ranges: ["'3. 채널 정산'!A:L"], includeGridData: true }), { timeout: 15000, retry: false })
  })
  it('시작행이 잘렸거나 데이터 그리드가 없으면 빈 정상 집계를 반환하지 않는다', async () => {
    const partial = sheet(); Object.assign(partial.data[0], { startRow: 100 })
    mocks.get.mockResolvedValueOnce({ data: { sheets: [partial] } })
    await expect(readChannelSettlement()).rejects.toThrow(/전체 데이터/)
    mocks.get.mockResolvedValueOnce({ data: { sheets: [{ ...sheet(), data: [] }] } })
    await expect(readChannelSettlement()).rejects.toThrow(/전체 데이터/)
  })
  it('접근 실패나 인증 누락을 정상 빈 결과로 바꾸지 않는다', async () => {
    mocks.get.mockRejectedValueOnce(new Error('permission-denied'))
    await expect(readChannelSettlement()).rejects.toThrow('permission-denied')
    vi.stubEnv('GOOGLE_PRIVATE_KEY', '')
    await expect(readChannelSettlement()).rejects.toThrow(/인증/)
  })
})
