import 'server-only'
import { envSheetId } from './google-sheets'
import { CHANNEL_SETTLEMENT_SHEET, parseChannelSettlement } from './parsers/channel-settlement'

/** Dedicated read-only credentials; no shared write-scoped Sheets client or DB access. */
export async function readChannelSettlement() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!email || !key) throw new Error('채널 정산 읽기 인증 설정이 없습니다.')
  const { google } = await import('googleapis')
  const auth = new google.auth.GoogleAuth({ credentials: { client_email: email, private_key: key }, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
  const sheets = google.sheets({ version: 'v4', auth })
  // Open-ended columns cover every source row, unlike a fixed A1:L1000 snapshot.
  const response = await sheets.spreadsheets.get({
    spreadsheetId: envSheetId('dashboard'), ranges: [`'${CHANNEL_SETTLEMENT_SHEET}'!A:L`], includeGridData: true,
    fields: 'sheets(properties(title,gridProperties(rowCount,columnCount)),data(startRow,startColumn,rowData.values(effectiveValue,formattedValue,userEnteredValue.formulaValue)))',
  }, { timeout: 15000, retry: false })
  const sheet = response.data.sheets?.[0]
  if (response.data.sheets?.length !== 1 || sheet?.properties?.title !== CHANNEL_SETTLEMENT_SHEET || !sheet.data?.length || sheet.data.length !== 1 || (sheet.data[0].startRow ?? 0) !== 0 || (sheet.data[0].startColumn ?? 0) !== 0 || !sheet.data[0].rowData || (sheet.properties.gridProperties?.columnCount ?? 0) < 12) {
    throw new Error('채널 정산 시트 전체 데이터를 확인할 수 없습니다.')
  }
  const records = parseChannelSettlement(sheet.data[0].rowData)
  return { records, readAt: new Date().toISOString() }
}
