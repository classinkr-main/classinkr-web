import 'server-only'
import { envSheetId } from './google-sheets'
import {
  CHANNEL_SETTLEMENT_SHEET,
  CHANNEL_SETTLEMENT_SHEET_FALLBACKS,
  parseChannelSettlement,
} from './parsers/channel-settlement'

function isMissingSheetRangeError(error: unknown): boolean {
  const status = (error as { code?: unknown; response?: { status?: unknown } })?.response?.status
    ?? (error as { code?: unknown })?.code
  if (status === 400 || status === 404) return true
  const message = error instanceof Error ? error.message : String(error)
  return /unable to parse range|not found/i.test(message)
}

/** Dedicated read-only credentials; no shared write-scoped Sheets client or DB access. */
export async function readChannelSettlement() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!email || !key) throw new Error('채널 정산 읽기 인증 설정이 없습니다.')
  const { google } = await import('googleapis')
  const auth = new google.auth.GoogleAuth({ credentials: { client_email: email, private_key: key }, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
  const sheets = google.sheets({ version: 'v4', auth })
  const spreadsheetId = envSheetId('dashboard')
  const candidateTabs = [CHANNEL_SETTLEMENT_SHEET, ...CHANNEL_SETTLEMENT_SHEET_FALLBACKS]

  const fetchTab = async (tabTitle: string) =>
    sheets.spreadsheets.get({
      spreadsheetId, ranges: [`'${tabTitle}'!A:L`], includeGridData: true,
      fields: 'sheets(properties(title,gridProperties(rowCount,columnCount)),data(startRow,startColumn,rowData.values(effectiveValue,formattedValue,userEnteredValue.formulaValue)))',
    }, { timeout: 15000, retry: false })

  let response: Awaited<ReturnType<typeof fetchTab>> | undefined
  let resolvedTitle: string = CHANNEL_SETTLEMENT_SHEET
  for (let i = 0; i < candidateTabs.length; i++) {
    const tabTitle = candidateTabs[i]!
    try {
      // Open-ended columns cover every source row, unlike a fixed A1:L1000 snapshot.
      response = await fetchTab(tabTitle)
      resolvedTitle = tabTitle
      break
    } catch (error) {
      if (i < candidateTabs.length - 1 && isMissingSheetRangeError(error)) continue
      throw error
    }
  }

  const sheet = response?.data.sheets?.[0]
  if (response?.data.sheets?.length !== 1 || sheet?.properties?.title !== resolvedTitle || !sheet.data?.length || sheet.data.length !== 1 || (sheet.data[0].startRow ?? 0) !== 0 || (sheet.data[0].startColumn ?? 0) !== 0 || !sheet.data[0].rowData || (sheet.properties.gridProperties?.columnCount ?? 0) < 12) {
    throw new Error('채널 정산 시트 전체 데이터를 확인할 수 없습니다.')
  }
  const records = parseChannelSettlement(sheet.data[0].rowData)
  return { records, readAt: new Date().toISOString(), sheetTitle: resolvedTitle }
}
