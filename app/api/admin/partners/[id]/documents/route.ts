import { NextRequest, NextResponse } from "next/server"

import {
  DOCUMENT_KIND_VALUES,
  DOCUMENT_STATUS_VALUES,
  QUOTE_BILLING_MODE_VALUES,
  QUOTE_LINE_ITEM_STATUS_VALUES,
  QUOTE_LINE_ITEM_TYPE_VALUES,
  QUOTE_WORKFLOW_STATUS_VALUES,
  PartnerApiValidationError,
  ensureOrderedDates,
  readOptionalDate,
  readOptionalEnum,
  readOptionalNumber,
  readOptionalString,
  readRequestBody,
  readRequiredEnum,
  readRequiredString,
  toErrorResponse,
} from "@/app/api/admin/partners/_validation"
import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getPartnerWorkspaceData, upsertPartnerDocument } from "@/lib/partners-data"
import type { PartnerQuoteDetailsInput, PartnerQuoteLineItemInput } from "@/lib/partners-types"

type JsonObject = Record<string, unknown>

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function readOptionalBoolean(body: JsonObject, key: string, label: string) {
  const value = body[key]
  if (value == null || value === "") return undefined
  if (typeof value !== "boolean") {
    throw new PartnerApiValidationError(`${label} 값이 올바르지 않습니다.`)
  }
  return value
}

function readOptionalQuoteDetails(body: JsonObject): PartnerQuoteDetailsInput | undefined {
  const value = body.quoteDetails
  if (value == null) return undefined
  if (!isJsonObject(value)) {
    throw new PartnerApiValidationError("견적서 상세 정보 형식이 올바르지 않습니다.")
  }

  const issuedAt = readOptionalDate(value, "issuedAt", "견적 발행일")
  const validUntil = readOptionalDate(value, "validUntil", "견적 유효기한")
  ensureOrderedDates(issuedAt, validUntil, "견적 발행일", "견적 유효기한")

  const rawLineItems = value.lineItems
  if (rawLineItems != null && !Array.isArray(rawLineItems)) {
    throw new PartnerApiValidationError("견적 품목은 배열이어야 합니다.")
  }

  const lineItems = (rawLineItems ?? []).map((item, index) => readQuoteLineItem(item, index))

  return {
    templateId: readOptionalString(value, "templateId", "견적 템플릿 ID"),
    estimateNumber: readOptionalString(value, "estimateNumber", "견적번호"),
    workflowStatus: readOptionalEnum(value, "workflowStatus", "견적 진행 상태", QUOTE_WORKFLOW_STATUS_VALUES),
    issuedAt,
    validUntil,
    subjectText: readOptionalString(value, "subjectText", "제목"),
    recipientCompanyName: readOptionalString(value, "recipientCompanyName", "수신 회사명"),
    recipientContactName: readOptionalString(value, "recipientContactName", "수신 담당자명"),
    recipientPhone: readOptionalString(value, "recipientPhone", "수신 연락처"),
    recipientEmail: readOptionalString(value, "recipientEmail", "수신 이메일"),
    referenceName: readOptionalString(value, "referenceName", "참조"),
    supplierBusinessName: readOptionalString(value, "supplierBusinessName", "공급자 상호명"),
    supplierBusinessRegistrationNumber: readOptionalString(
      value,
      "supplierBusinessRegistrationNumber",
      "공급자 사업자등록번호"
    ),
    supplierRepresentativeName: readOptionalString(value, "supplierRepresentativeName", "공급자 대표자명"),
    supplierAddress: readOptionalString(value, "supplierAddress", "공급자 주소"),
    supplierContactName: readOptionalString(value, "supplierContactName", "공급자 담당자명"),
    supplierContactPhone: readOptionalString(value, "supplierContactPhone", "공급자 연락처"),
    supplierContactEmail: readOptionalString(value, "supplierContactEmail", "공급자 이메일"),
    currencyUnitLabel: readOptionalString(value, "currencyUnitLabel", "통화 단위 라벨"),
    vatIncluded: readOptionalBoolean(value, "vatIncluded", "VAT 포함 여부"),
    vatPolicyLabel: readOptionalString(value, "vatPolicyLabel", "VAT 정책 라벨"),
    deliveryLocationNote: readOptionalString(value, "deliveryLocationNote", "납품 장소 메모"),
    paymentTerms: readOptionalString(value, "paymentTerms", "결제 조건"),
    installationPolicy: readOptionalString(value, "installationPolicy", "설치 정책"),
    warrantyNote: readOptionalString(value, "warrantyNote", "보증 메모"),
    generalNotes: readOptionalString(value, "generalNotes", "기타사항"),
    specialTerms: readOptionalString(value, "specialTerms", "특약사항"),
    footerContactText: readOptionalString(value, "footerContactText", "하단 담당자 문구"),
    internalMemo: readOptionalString(value, "internalMemo", "내부 메모"),
    subtotalAmount: readOptionalNumber(value, "subtotalAmount", "공급가액 합계", { min: 0 }),
    vatAmount: readOptionalNumber(value, "vatAmount", "부가세", { min: 0 }),
    discountAmount: readOptionalNumber(value, "discountAmount", "할인 금액", { min: 0 }),
    grandTotalAmount: readOptionalNumber(value, "grandTotalAmount", "총 합계", { min: 0 }),
    hasPendingAmounts: readOptionalBoolean(value, "hasPendingAmounts", "미확정 금액 포함 여부"),
    pendingAmountNote: readOptionalString(value, "pendingAmountNote", "미확정 금액 안내"),
    lineItems,
  }
}

function readQuoteLineItem(value: unknown, index: number): PartnerQuoteLineItemInput {
  if (!isJsonObject(value)) {
    throw new PartnerApiValidationError(`견적 품목 ${index + 1}번 형식이 올바르지 않습니다.`)
  }

  return {
    id: readOptionalString(value, "id", `견적 품목 ${index + 1}번 ID`),
    sortOrder: readOptionalNumber(value, "sortOrder", `견적 품목 ${index + 1}번 정렬순서`, {
      integer: true,
      min: 1,
    }) ?? index + 1,
    lineNumber: readOptionalNumber(value, "lineNumber", `견적 품목 ${index + 1}번 번호`, {
      integer: true,
      min: 1,
    }) ?? index + 1,
    itemType: readRequiredEnum(value, "itemType", `견적 품목 ${index + 1}번 유형`, QUOTE_LINE_ITEM_TYPE_VALUES),
    itemCode: readOptionalString(value, "itemCode", `견적 품목 ${index + 1}번 품목 코드`),
    itemName: readRequiredString(value, "itemName", `견적 품목 ${index + 1}번 품목명`),
    itemDescription: readOptionalString(value, "itemDescription", `견적 품목 ${index + 1}번 세부내역`),
    unitPrice: readOptionalNumber(value, "unitPrice", `견적 품목 ${index + 1}번 단가`, { min: 0 }),
    quantity: readOptionalNumber(value, "quantity", `견적 품목 ${index + 1}번 수량`, { min: 0 }),
    quantityUnit: readOptionalString(value, "quantityUnit", `견적 품목 ${index + 1}번 수량 단위`),
    lineSupplyAmount: readOptionalNumber(value, "lineSupplyAmount", `견적 품목 ${index + 1}번 공급가액`, {
      min: 0,
    }),
    vatIncluded: readOptionalBoolean(value, "vatIncluded", `견적 품목 ${index + 1}번 VAT 포함 여부`),
    lineStatus: readOptionalEnum(
      value,
      "lineStatus",
      `견적 품목 ${index + 1}번 상태`,
      QUOTE_LINE_ITEM_STATUS_VALUES
    ),
    billingMode: readOptionalEnum(
      value,
      "billingMode",
      `견적 품목 ${index + 1}번 청구 방식`,
      QUOTE_BILLING_MODE_VALUES
    ),
    remark: readOptionalString(value, "remark", `견적 품목 ${index + 1}번 메모`),
    linkedQuantityRowId: readOptionalString(value, "linkedQuantityRowId", `견적 품목 ${index + 1}번 수량 연결 ID`),
    linkedChecklistTemplateId: readOptionalString(
      value,
      "linkedChecklistTemplateId",
      `견적 품목 ${index + 1}번 체크리스트 템플릿 ID`
    ),
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const { id } = await params
    const { workspace, source, warning } = await getPartnerWorkspaceData(id)

    if (!workspace) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return adminCachedJson({ items: workspace.documents, source, warning })
  } catch {
    return NextResponse.json({ error: "Failed to read documents" }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const { id } = await params
    const body = await readRequestBody(req)
    const kind = readRequiredEnum(body, "kind", "문서 유형", DOCUMENT_KIND_VALUES)
    const quoteDetails = readOptionalQuoteDetails(body)
    if (quoteDetails && kind !== "quote") {
      throw new PartnerApiValidationError("견적서 상세 정보는 견적서 문서에만 저장할 수 있습니다.")
    }

    const topLevelIssuedAt = readOptionalDate(body, "issuedAt", "발행일")
    const topLevelDueAt = readOptionalDate(body, "dueAt", "마감일")
    const issuedAt = topLevelIssuedAt ?? quoteDetails?.issuedAt
    const dueAt = topLevelDueAt ?? quoteDetails?.validUntil
    ensureOrderedDates(issuedAt, dueAt, "발행일", "마감일")

    const result = await upsertPartnerDocument(id, {
      id: readOptionalString(body, "id", "문서 ID"),
      dealId: readOptionalString(body, "dealId", "거래 ID"),
      kind,
      status: readRequiredEnum(body, "status", "문서 상태", DOCUMENT_STATUS_VALUES),
      title: readRequiredString(body, "title", "문서 제목"),
      amount: readOptionalNumber(body, "amount", "금액", { min: 0 }) ?? quoteDetails?.grandTotalAmount,
      issuedAt,
      dueAt,
      fileLabel: readOptionalString(body, "fileLabel", "첨부 문서명", { emptyAsUndefined: false }) ?? "첨부 문서",
      externalUrl: readOptionalString(body, "externalUrl", "외부 문서 링크"),
      quoteDetails: quoteDetails
        ? {
            ...quoteDetails,
            issuedAt: quoteDetails.issuedAt ?? issuedAt,
            validUntil: quoteDetails.validUntil ?? dueAt,
          }
        : undefined,
    })

    if (!result.workspace) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error) {
    return toErrorResponse(error, "Failed to save document")
  }
}
