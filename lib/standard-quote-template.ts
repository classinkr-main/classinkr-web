import type {
  PartnerQuoteDetailsInput,
  PartnerQuoteLineItemInput,
  QuoteOptionSelectionValue,
} from "@/lib/partners-types"
import { getProductBySku } from "@/lib/product-templates"

export type StandardQuoteTemplateId =
  | "camera_t1"
  | "board_75"
  | "board_86"
  | "recording_studio"
  | "online_suite"
export type StandardQuoteOptionSelections = Record<string, QuoteOptionSelectionValue | undefined>

type TemplateLinePreset = {
  itemType: PartnerQuoteLineItemInput["itemType"]
  itemCode?: string
  itemName: string
  itemDescription?: string
  quantity?: number
  quantityUnit?: string
  unitPrice?: number
  lineStatus?: PartnerQuoteLineItemInput["lineStatus"]
  billingMode?: PartnerQuoteLineItemInput["billingMode"]
  remark?: string
  quantityEditable?: boolean
  priceEditable?: boolean
}

type StandardQuoteRadioOption = {
  value: string
  label: string
  description?: string
}

type StandardQuoteRadioOptionGroup = {
  id: string
  label: string
  description?: string
  control: "radio"
  defaultValue: string
  options: StandardQuoteRadioOption[]
}

type StandardQuoteToggleOptionGroup = {
  id: string
  label: string
  description?: string
  control: "toggle"
  defaultValue: boolean
  enabledLabel?: string
  disabledLabel?: string
}

export type StandardQuoteOptionGroup =
  | StandardQuoteRadioOptionGroup
  | StandardQuoteToggleOptionGroup

export type StandardQuotePreset = {
  id: string
  label: string
  description: string
  templateId: StandardQuoteTemplateId
  optionSelections: StandardQuoteOptionSelections
}

export type StandardQuoteTemplatePreset = {
  id: StandardQuoteTemplateId
  label: string
  description: string
  lines: TemplateLinePreset[]
  optionGroups: StandardQuoteOptionGroup[]
  quickPresets?: StandardQuotePreset[]
}

export const STANDARD_QUOTE_SUPPLIER = {
  businessName: "퀴드러닝",
  businessRegistrationNumber: "170-07-03305",
  representativeName: "조혜리",
  address: "경기도 오산시 독산성로 425, 1008호",
  contactName: "배철웅",
  contactPhone: "010-9238-5874",
  contactEmail: "",
} as const

// 소프트웨어 견적 공급자(클래스인). 담당자/연락처는 건마다 매니저 정보로 채운다.
export const CLASSIN_QUOTE_SUPPLIER = {
  businessName: "이이오클래스인코리아 유한회사",
  businessRegistrationNumber: "724-88-02403",
  representativeName: "GU YAN(구엔)",
  address: "서울특별시 양천구 목동동로 233-1, 8층 806호(목동, 드림타워)",
  contactEmail: "",
} as const

// 소프트웨어(구독형) 템플릿 목록. SW 견적은 공급자가 클래스인.
const SOFTWARE_QUOTE_TEMPLATE_IDS: StandardQuoteTemplateId[] = ["online_suite"]

export function isSoftwareQuoteTemplate(templateId?: string | null): boolean {
  return SOFTWARE_QUOTE_TEMPLATE_IDS.includes(templateId as StandardQuoteTemplateId)
}

/**
 * 템플릿 제품군에 따른 공급자 스냅샷을 반환한다.
 * - SW(예: online_suite) → 클래스인 + 담당 매니저 연락처
 * - HW → 표준 공급자(퀴드러닝)
 * 반환값을 견적 details에 스프레드하면 finalize/렌더러가 그대로 사용한다.
 */
export function resolveQuoteSupplier(
  templateId?: string | null,
  managerContact?: { name?: string | null; phone?: string | null }
): Pick<
  PartnerQuoteDetailsInput,
  | "supplierBusinessName"
  | "supplierBusinessRegistrationNumber"
  | "supplierRepresentativeName"
  | "supplierAddress"
  | "supplierContactName"
  | "supplierContactPhone"
  | "supplierContactEmail"
> {
  if (isSoftwareQuoteTemplate(templateId)) {
    return {
      supplierBusinessName: CLASSIN_QUOTE_SUPPLIER.businessName,
      supplierBusinessRegistrationNumber: CLASSIN_QUOTE_SUPPLIER.businessRegistrationNumber,
      supplierRepresentativeName: CLASSIN_QUOTE_SUPPLIER.representativeName,
      supplierAddress: CLASSIN_QUOTE_SUPPLIER.address,
      supplierContactName: managerContact?.name?.trim() || "",
      supplierContactPhone: managerContact?.phone?.trim() || "",
      supplierContactEmail: CLASSIN_QUOTE_SUPPLIER.contactEmail,
    }
  }
  return {
    supplierBusinessName: STANDARD_QUOTE_SUPPLIER.businessName,
    supplierBusinessRegistrationNumber: STANDARD_QUOTE_SUPPLIER.businessRegistrationNumber,
    supplierRepresentativeName: STANDARD_QUOTE_SUPPLIER.representativeName,
    supplierAddress: STANDARD_QUOTE_SUPPLIER.address,
    supplierContactName: STANDARD_QUOTE_SUPPLIER.contactName,
    supplierContactPhone: STANDARD_QUOTE_SUPPLIER.contactPhone,
    supplierContactEmail: STANDARD_QUOTE_SUPPLIER.contactEmail,
  }
}

export const STANDARD_QUOTE_DEFAULT_BODY = "아래와 같이 견적서를 제출합니다."
export const STANDARD_QUOTE_DEFAULT_UNIT_LABEL = "원"
export const STANDARD_QUOTE_DEFAULT_VAT_LABEL = "(단위:원, VAT포함)"
export const STANDARD_QUOTE_DEFAULT_VAT_EXCLUDED_LABEL = "(단위:원, VAT별도)"
export const STANDARD_QUOTE_DEFAULT_DELIVERY_NOTE = "구매처 지정장소"

const STANDARD_PRICE_BOARD_86 = getProductBySku("board-86")?.unit_price ?? 5_800_000
const STANDARD_PRICE_BOARD_75 = getProductBySku("board-75")?.unit_price ?? 4_900_000
const STANDARD_PRICE_CAMERA_T1 = getProductBySku("camera-t1")?.unit_price ?? 1_200_000
const STANDARD_PRICE_STAND = getProductBySku("stand")?.unit_price ?? 500_000
const STANDARD_PRICE_WALL_MOUNT = getProductBySku("wall-mount")?.unit_price ?? 500_000
const STANDARD_PRICE_RECORDING_STUDIO =
  getProductBySku("ai-studio-recording-set")?.unit_price ?? 7_800_000
const STANDARD_PRICE_ONLINE_SUITE_MONTHLY =
  getProductBySku("online-suite-monthly")?.unit_price ?? 400_000

export const STANDARD_QUOTE_TEMPLATES: StandardQuoteTemplatePreset[] = [
  {
    id: "camera_t1",
    label: "T1 카메라",
    description: "강사용 모션트래킹 카메라 기본 견적",
    lines: [
      {
        itemType: "hardware",
        itemCode: "camera-t1",
        itemName: "T1 카메라",
        itemDescription: "강사용 모션트래킹 카메라 (전용 POE 스위치 포함)",
        quantity: 1,
        quantityUnit: "대",
        unitPrice: STANDARD_PRICE_CAMERA_T1,
        quantityEditable: true,
        priceEditable: true,
      },
      {
        itemType: "installation",
        itemCode: "camera-install",
        itemName: "카메라 설치",
        itemDescription: "별도 청구 예정",
        quantity: 1,
        quantityUnit: "대",
        lineStatus: "separate_billing",
        billingMode: "separate_invoice",
        quantityEditable: true,
        priceEditable: false,
      },
    ],
    optionGroups: [
      {
        id: "installation_mode",
        label: "설치 방식",
        description: "고객 전달본에 설치비 정책을 바로 반영합니다.",
        control: "radio",
        defaultValue: "separate_billing",
        options: [
          { value: "included_quote", label: "견적 포함", description: "같은 견적서 합계에 포함합니다." },
          { value: "separate_billing", label: "별도 청구", description: "합계에서는 제외하고 안내만 넣습니다." },
          { value: "tbd", label: "추후 협의", description: "설치 정책이 미정일 때 사용합니다." },
        ],
      },
      {
        id: "support_package",
        label: "초기 세팅 지원",
        description: "전달 문구에 운영 지원 항목을 추가합니다.",
        control: "toggle",
        defaultValue: false,
        enabledLabel: "포함",
        disabledLabel: "제외",
      },
    ],
    quickPresets: [
      {
        id: "camera_t1_default",
        label: "기본형",
        description: "카메라 본체 + 설치 별도 청구",
        templateId: "camera_t1",
        optionSelections: {
          installation_mode: "separate_billing",
          support_package: false,
        },
      },
      {
        id: "camera_t1_all_in",
        label: "설치 포함형",
        description: "설치와 초기 세팅을 함께 포함",
        templateId: "camera_t1",
        optionSelections: {
          installation_mode: "included_quote",
          support_package: true,
        },
      },
    ],
  },
  {
    id: "board_75",
    label: '전자칠판 75"',
    description: "중형 전자칠판 도입 견적",
    lines: [
      {
        itemType: "hardware",
        itemCode: "board-75",
        itemName: '전자칠판 75"',
        itemDescription: "중형 전자칠판 패널",
        quantity: 1,
        quantityUnit: "대",
        unitPrice: STANDARD_PRICE_BOARD_75,
        quantityEditable: true,
        priceEditable: true,
      },
      {
        itemType: "service",
        itemCode: "install-training",
        itemName: "설치 및 교육",
        itemDescription: "현장 설치 및 초기 운영 교육",
        quantity: 1,
        quantityUnit: "식",
        unitPrice: 0,
        quantityEditable: false,
        priceEditable: true,
      },
    ],
    optionGroups: [
      {
        id: "installation_mode",
        label: "설치 방식",
        description: "설치 정책을 바로 고정합니다.",
        control: "radio",
        defaultValue: "included_quote",
        options: [
          { value: "included_quote", label: "견적 포함", description: "설치 및 교육을 같은 견적에 포함합니다." },
          { value: "separate_billing", label: "별도 청구", description: "설치비는 추후 별도 청구합니다." },
          { value: "tbd", label: "추후 협의", description: "현장 조건 확인 후 확정합니다." },
        ],
      },
      {
        id: "mounting_option",
        label: "거치 방식",
        description: "현장 방식에 맞춰 부자재를 추가합니다.",
        control: "radio",
        defaultValue: "wall_mount",
        options: [
          { value: "wall_mount", label: "벽걸이", description: "기본 거치 방식" },
          { value: "stand", label: "스탠드", description: "이동형 스탠드 포함" },
          { value: "none", label: "미정", description: "거치 방식 추후 확정" },
        ],
      },
      {
        id: "camera_bundle",
        label: "T1 카메라 추가",
        description: "전자칠판 수량에 맞춰 T1 카메라를 추가합니다.",
        control: "toggle",
        defaultValue: false,
        enabledLabel: "추가",
        disabledLabel: "제외",
      },
      {
        id: "support_package",
        label: "유지보수 안내",
        description: "보증/지원 안내 행을 함께 표기합니다.",
        control: "toggle",
        defaultValue: true,
        enabledLabel: "표시",
        disabledLabel: "숨김",
      },
    ],
    quickPresets: [
      {
        id: "board_75_classroom",
        label: "교실 기본형",
        description: "벽걸이 + 설치 포함",
        templateId: "board_75",
        optionSelections: {
          installation_mode: "included_quote",
          mounting_option: "wall_mount",
          camera_bundle: false,
          support_package: true,
        },
      },
      {
        id: "board_75_t1_addon",
        label: "T1 추가형",
        description: "전자칠판에 T1 카메라를 함께 포함",
        templateId: "board_75",
        optionSelections: {
          installation_mode: "included_quote",
          mounting_option: "wall_mount",
          camera_bundle: true,
          support_package: true,
        },
      },
    ],
  },
  {
    id: "board_86",
    label: '전자칠판 86"',
    description: "대형 전자칠판 도입 견적",
    lines: [
      {
        itemType: "hardware",
        itemCode: "board-86",
        itemName: '전자칠판 86"',
        itemDescription: "대형 전자칠판 패널",
        quantity: 1,
        quantityUnit: "대",
        unitPrice: STANDARD_PRICE_BOARD_86,
        quantityEditable: true,
        priceEditable: true,
      },
      {
        itemType: "service",
        itemCode: "install-training",
        itemName: "설치 및 교육",
        itemDescription: "현장 설치 및 초기 운영 교육",
        quantity: 1,
        quantityUnit: "식",
        unitPrice: 0,
        quantityEditable: false,
        priceEditable: true,
      },
    ],
    optionGroups: [
      {
        id: "installation_mode",
        label: "설치 방식",
        description: "설치 정책을 바로 고정합니다.",
        control: "radio",
        defaultValue: "included_quote",
        options: [
          { value: "included_quote", label: "견적 포함", description: "설치 및 교육을 같은 견적에 포함합니다." },
          { value: "separate_billing", label: "별도 청구", description: "설치비는 추후 별도 청구합니다." },
          { value: "tbd", label: "추후 협의", description: "현장 조건 확인 후 확정합니다." },
        ],
      },
      {
        id: "mounting_option",
        label: "거치 방식",
        description: "현장 방식에 맞춰 부자재를 추가합니다.",
        control: "radio",
        defaultValue: "wall_mount",
        options: [
          { value: "wall_mount", label: "벽걸이", description: "기본 거치 방식" },
          { value: "stand", label: "스탠드", description: "이동형 스탠드 포함" },
          { value: "none", label: "미정", description: "거치 방식 추후 확정" },
        ],
      },
      {
        id: "camera_bundle",
        label: "T1 카메라 추가",
        description: "전자칠판 수량에 맞춰 T1 카메라를 추가합니다.",
        control: "toggle",
        defaultValue: false,
        enabledLabel: "추가",
        disabledLabel: "제외",
      },
      {
        id: "support_package",
        label: "유지보수 안내",
        description: "보증/지원 안내 행을 함께 표기합니다.",
        control: "toggle",
        defaultValue: true,
        enabledLabel: "표시",
        disabledLabel: "숨김",
      },
    ],
    quickPresets: [
      {
        id: "board_86_classroom",
        label: "교실 기본형",
        description: "벽걸이 + 설치 포함",
        templateId: "board_86",
        optionSelections: {
          installation_mode: "included_quote",
          mounting_option: "wall_mount",
          camera_bundle: false,
          support_package: true,
        },
      },
      {
        id: "board_86_bundle",
        label: "86 번들",
        description: '전자칠판 86" + T1 + 벽걸이',
        templateId: "board_86",
        optionSelections: {
          installation_mode: "included_quote",
          mounting_option: "wall_mount",
          camera_bundle: true,
          support_package: true,
        },
      },
      {
        id: "board_86_stand",
        label: "스탠드형",
        description: "이동형 스탠드 구성",
        templateId: "board_86",
        optionSelections: {
          installation_mode: "included_quote",
          mounting_option: "stand",
          camera_bundle: false,
          support_package: true,
        },
      },
    ],
  },
  {
    id: "recording_studio",
    label: "올인원 녹화수업 세트",
    description: '86" 전자칠판 + T1 + 벽걸이 + 자동 녹화 1년',
    lines: [
      {
        itemType: "hardware",
        itemCode: "ai-studio-recording-set",
        itemName: "올인원 녹화수업 세트",
        itemDescription: '86" Classin 전자칠판 + AI 카메라 + 벽걸이 + 자동 녹화 1년 이용권',
        quantity: 1,
        quantityUnit: "세트",
        unitPrice: STANDARD_PRICE_RECORDING_STUDIO,
        quantityEditable: true,
        priceEditable: true,
      },
    ],
    optionGroups: [
      {
        id: "payment_plan",
        label: "결제 방식",
        description: "고객에게 보일 결제 조건을 견적서에 바로 반영합니다.",
        control: "radio",
        defaultValue: "one_time",
        options: [
          { value: "one_time", label: "일시 납부", description: "총액 기준으로 안내합니다." },
          { value: "12_month", label: "12개월 할부", description: "12개월 할부 가능 문구를 표시합니다." },
        ],
      },
      {
        id: "delivery_policy",
        label: "설치 배송비",
        description: "OMO1 패키지 기준 설치/배송 포함 안내를 표시합니다.",
        control: "toggle",
        defaultValue: true,
        enabledLabel: "포함",
        disabledLabel: "별도",
      },
    ],
    quickPresets: [
      {
        id: "recording_studio_default",
        label: "녹화 세트",
        description: '86" + T1 + 벽걸이 + 자동 녹화 1년',
        templateId: "recording_studio",
        optionSelections: {
          payment_plan: "one_time",
          delivery_policy: true,
        },
      },
      {
        id: "recording_studio_installment",
        label: "12개월 할부형",
        description: "설치 배송 포함 + 12개월 할부 안내",
        templateId: "recording_studio",
        optionSelections: {
          payment_plan: "12_month",
          delivery_policy: true,
        },
      },
    ],
  },
  {
    id: "online_suite",
    label: "구독형 AI Suite",
    description: "전자칠판·카메라·무제한 녹화/수업·랜딩페이지·인가 대행",
    lines: [
      {
        itemType: "service",
        itemCode: "online-suite-monthly",
        itemName: "구독형 통합 학원 패키지",
        itemDescription: "전자칠판 · 카메라 · 무제한 녹화 및 수업 · 랜딩페이지 · 온라인 관련 사업자 인가 대행",
        quantity: 1,
        quantityUnit: "월",
        unitPrice: STANDARD_PRICE_ONLINE_SUITE_MONTHLY,
        quantityEditable: true,
        priceEditable: true,
      },
    ],
    optionGroups: [
      {
        id: "contract_term",
        label: "계약 기간",
        description: "구독/할부 기준 기간을 견적 메모에 표시합니다.",
        control: "radio",
        defaultValue: "36_month",
        options: [
          { value: "36_month", label: "36개월", description: "OMO1 기본 구독 조건" },
          { value: "12_month", label: "12개월", description: "단기 파일럿 제안" },
          { value: "custom", label: "협의", description: "조건을 별도 협의합니다." },
        ],
      },
      {
        id: "landing_page",
        label: "랜딩페이지 제작",
        description: "패키지에 랜딩페이지 제작을 포함합니다.",
        control: "toggle",
        defaultValue: true,
        enabledLabel: "포함",
        disabledLabel: "제외",
      },
      {
        id: "authorization_support",
        label: "인가 대행",
        description: "온라인 관련 사업자 인가 대행 안내를 포함합니다.",
        control: "toggle",
        defaultValue: true,
        enabledLabel: "포함",
        disabledLabel: "제외",
      },
    ],
    quickPresets: [
      {
        id: "online_suite_default",
        label: "AI Suite",
        description: "월 40만원 구독형 풀 패키지",
        templateId: "online_suite",
        optionSelections: {
          contract_term: "36_month",
          landing_page: true,
          authorization_support: true,
        },
      },
    ],
  },
]

type BuildConfigurableStandardQuoteInput = {
  templateId?: string | null
  input?: PartnerQuoteDetailsInput | null
  optionSelections?: StandardQuoteOptionSelections
  baseQuantity?: number
}

function clampPositiveInteger(value: number | null | undefined, fallback = 1) {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.round(Number(value)))
}

function readSelectionString(
  selections: StandardQuoteOptionSelections,
  key: string,
  fallback: string
) {
  const value = selections[key]
  return typeof value === "string" && value.trim() ? value : fallback
}

function readSelectionBoolean(
  selections: StandardQuoteOptionSelections,
  key: string,
  fallback = false
) {
  const value = selections[key]
  return typeof value === "boolean" ? value : fallback
}

function sanitizeFileNameSegment(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim()
}

function lineIdentity(item: Pick<PartnerQuoteLineItemInput, "itemCode" | "itemName">) {
  return item.itemCode?.trim() || item.itemName.trim()
}

function createGeneratedLine(
  line: Omit<PartnerQuoteLineItemInput, "sortOrder" | "lineNumber" | "lineSupplyAmount">,
  index: number
) {
  const nextItem: PartnerQuoteLineItemInput = {
    ...line,
    sortOrder: index + 1,
    lineNumber: index + 1,
  }

  return {
    ...nextItem,
    lineSupplyAmount: computeLineSupplyAmount(nextItem),
  }
}

function finalizeLineItems(lineItems: PartnerQuoteDetailsInput["lineItems"]) {
  const items = Array.isArray(lineItems) ? lineItems : []
  return items.map((item, index) => {
    const nextItem: PartnerQuoteLineItemInput = {
      ...item,
      sortOrder: item.sortOrder ?? index + 1,
      lineNumber: item.lineNumber ?? index + 1,
      vatIncluded: item.vatIncluded ?? true,
    }

    return {
      ...nextItem,
      lineSupplyAmount: computeLineSupplyAmount(nextItem),
    }
  })
}

function getExistingLineMap(existingItems: PartnerQuoteDetailsInput["lineItems"]) {
  const map = new Map<string, PartnerQuoteLineItemInput>()
  for (const item of existingItems ?? []) {
    const key = lineIdentity(item)
    if (key) map.set(key, item)
  }
  return map
}

function inferTemplateIdFromItemCode(itemCode?: string | null): StandardQuoteTemplateId {
  if (itemCode === "ai-studio-recording-set") return "recording_studio"
  if (itemCode === "online-suite-monthly") return "online_suite"
  if (itemCode === "board-75") return "board_75"
  if (itemCode === "board-86") return "board_86"
  return "camera_t1"
}

export function getStandardQuoteTemplate(templateId?: string | null) {
  return (
    STANDARD_QUOTE_TEMPLATES.find((template) => template.id === templateId) ??
    STANDARD_QUOTE_TEMPLATES[0]
  )
}

export function getStandardQuoteOptionGroups(templateId?: string | null) {
  return getStandardQuoteTemplate(templateId).optionGroups
}

export function getStandardQuoteQuickPresets(templateId?: string | null) {
  return getStandardQuoteTemplate(templateId).quickPresets ?? []
}

export function getStandardQuoteDefaultSelections(templateId?: string | null) {
  return getStandardQuoteOptionGroups(templateId).reduce<StandardQuoteOptionSelections>((acc, group) => {
    acc[group.id] = group.defaultValue
    return acc
  }, {})
}

export function formatStandardQuoteCurrency(value?: number | null) {
  if (value == null) return "-"
  return value.toLocaleString("ko-KR")
}

export function isPendingQuoteLine(item: Pick<PartnerQuoteLineItemInput, "lineStatus" | "billingMode" | "unitPrice">) {
  // 정보성(무상 포함) 라인은 가격 미정(별도청구/협의)이 아니라 무상 항목이므로 pending에서 제외한다.
  if (item.lineStatus === "informational") return false
  return (
    item.lineStatus === "pending_price" ||
    item.lineStatus === "separate_billing" ||
    item.billingMode === "separate_invoice" ||
    item.unitPrice == null
  )
}

function computeLineSupplyAmount(item: Pick<PartnerQuoteLineItemInput, "quantity" | "unitPrice" | "lineStatus" | "billingMode">) {
  // 단가 없는 정보성(무상 포함) 라인은 공급가액을 계산하지 않고 '-'로 비운다.
  if (item.lineStatus === "informational" && item.unitPrice == null) return undefined
  if (isPendingQuoteLine(item)) return undefined
  const quantity = Number(item.quantity ?? 0)
  const unitPrice = Number(item.unitPrice ?? 0)
  return Math.max(0, Math.round(quantity * unitPrice))
}

export function getTemplateLinePreset(
  templateId: StandardQuoteTemplateId,
  lineNumber: number
) {
  return getStandardQuoteTemplate(templateId).lines[lineNumber - 1]
}

export function mergeStandardQuoteLineItems(
  templateId: StandardQuoteTemplateId,
  existingItems?: PartnerQuoteDetailsInput["lineItems"]
) {
  const template = getStandardQuoteTemplate(templateId)
  const currentItems = Array.isArray(existingItems) ? existingItems : []

  return template.lines.map<PartnerQuoteLineItemInput>((line, index) => {
    const current = currentItems[index]
    const quantity = current?.quantity ?? line.quantity
    const unitPrice = current?.unitPrice ?? line.unitPrice
    const nextItem: PartnerQuoteLineItemInput = {
      id: current?.id,
      sortOrder: index + 1,
      lineNumber: index + 1,
      itemType: line.itemType,
      itemCode: line.itemCode,
      itemName: current?.itemName ?? line.itemName,
      itemDescription: current?.itemDescription ?? line.itemDescription,
      quantity,
      quantityUnit: current?.quantityUnit ?? line.quantityUnit ?? "대",
      unitPrice,
      vatIncluded: current?.vatIncluded ?? true,
      lineStatus: current?.lineStatus ?? line.lineStatus,
      billingMode: current?.billingMode ?? line.billingMode,
      remark: current?.remark ?? line.remark,
      linkedChecklistTemplateId: current?.linkedChecklistTemplateId,
      linkedQuantityRowId: current?.linkedQuantityRowId,
      optionGroupId: current?.optionGroupId,
      optionId: current?.optionId,
      isOptional: current?.isOptional,
      isUserAdded: current?.isUserAdded,
      priceLocked: current?.priceLocked,
      quantityLocked: current?.quantityLocked,
    }

    return {
      ...nextItem,
      lineSupplyAmount: computeLineSupplyAmount(nextItem),
    }
  })
}

export function calculateStandardQuoteTotals(
  lineItems: PartnerQuoteDetailsInput["lineItems"],
  vatIncluded = true
) {
  const items = Array.isArray(lineItems) ? lineItems : []
  const subtotalAmount = items.reduce((sum, item) => sum + Number(item.lineSupplyAmount ?? 0), 0)
  const vatAmount = vatIncluded ? 0 : Math.round(subtotalAmount * 0.1)
  const grandTotalAmount = subtotalAmount + vatAmount
  const hasPendingAmounts = items.some((item) => isPendingQuoteLine(item))

  return {
    subtotalAmount,
    vatAmount,
    discountAmount: 0,
    grandTotalAmount,
    hasPendingAmounts,
    pendingAmountNote: hasPendingAmounts ? "별도 청구 예정 항목은 합계에서 제외됩니다." : undefined,
  }
}

export function finalizeStandardQuoteDetails(
  input?: PartnerQuoteDetailsInput | null,
  fallbackTemplateId?: StandardQuoteTemplateId
): PartnerQuoteDetailsInput {
  const templateId = (
    input?.templateId && getStandardQuoteTemplate(input.templateId).id
  ) as StandardQuoteTemplateId | undefined
  const resolvedTemplateId = templateId ?? fallbackTemplateId ?? STANDARD_QUOTE_TEMPLATES[0].id
  const vatIncluded = input?.vatIncluded ?? true
  const lineItems = finalizeLineItems(input?.lineItems)
  const totals = calculateStandardQuoteTotals(lineItems, vatIncluded)
  const deliveryLocationNote = input?.deliveryLocationNote?.trim() || STANDARD_QUOTE_DEFAULT_DELIVERY_NOTE

  // 공급자 스냅샷: 커스텀 공급자(상호명)가 지정되면 그 블록을 통째로 사용하고(빈 필드는 빈 채로),
  // 지정이 없을 때만 표준 공급자(퀴드러닝)로 폴백한다. 필드별 폴백을 쓰면 SW(클래스인)인데
  // 담당자 미입력 시 퀴드러닝 담당자가 섞이므로 블록 단위로 처리한다.
  const supplier = input?.supplierBusinessName?.trim()
    ? {
        businessName: input.supplierBusinessName.trim(),
        businessRegistrationNumber: input?.supplierBusinessRegistrationNumber?.trim() || "",
        representativeName: input?.supplierRepresentativeName?.trim() || "",
        address: input?.supplierAddress?.trim() || "",
        contactName: input?.supplierContactName?.trim() || "",
        contactPhone: input?.supplierContactPhone?.trim() || "",
        contactEmail: input?.supplierContactEmail?.trim() || "",
      }
    : { ...STANDARD_QUOTE_SUPPLIER }

  return {
    templateId: resolvedTemplateId,
    presetId: input?.presetId?.trim() || undefined,
    estimateNumber: input?.estimateNumber?.trim() || undefined,
    workflowStatus: input?.workflowStatus ?? "draft",
    issuedAt: input?.issuedAt || undefined,
    validUntil: input?.validUntil || undefined,
    subjectText: input?.subjectText?.trim() || STANDARD_QUOTE_DEFAULT_BODY,
    recipientCompanyName: input?.recipientCompanyName?.trim() || undefined,
    recipientContactName: input?.recipientContactName?.trim() || undefined,
    recipientPhone: input?.recipientPhone?.trim() || undefined,
    recipientEmail: input?.recipientEmail?.trim() || undefined,
    referenceName: input?.referenceName?.trim() || undefined,
    supplierBusinessName: supplier.businessName,
    supplierBusinessRegistrationNumber: supplier.businessRegistrationNumber,
    supplierRepresentativeName: supplier.representativeName,
    supplierAddress: supplier.address,
    supplierContactName: supplier.contactName,
    supplierContactPhone: supplier.contactPhone,
    supplierContactEmail: supplier.contactEmail,
    currencyUnitLabel: input?.currencyUnitLabel?.trim() || STANDARD_QUOTE_DEFAULT_UNIT_LABEL,
    vatIncluded,
    vatPolicyLabel:
      input?.vatPolicyLabel?.trim() ||
      (vatIncluded ? STANDARD_QUOTE_DEFAULT_VAT_LABEL : STANDARD_QUOTE_DEFAULT_VAT_EXCLUDED_LABEL),
    deliveryLocationNote,
    paymentTerms: input?.paymentTerms?.trim() || undefined,
    installationPolicy: input?.installationPolicy?.trim() || undefined,
    warrantyNote: input?.warrantyNote?.trim() || undefined,
    generalNotes: input?.generalNotes?.trim() || `납품장소: ${deliveryLocationNote}`,
    specialTerms: input?.specialTerms?.trim() || undefined,
    footerContactText: input?.footerContactText?.trim() || `${supplier.contactName}/${supplier.contactPhone}`,
    internalMemo: input?.internalMemo?.trim() || undefined,
    optionSelections: input?.optionSelections,
    pricingSource: input?.pricingSource?.trim() || undefined,
    generatedFromVersionId: input?.generatedFromVersionId?.trim() || undefined,
    generatedFromTemplateVersion: input?.generatedFromTemplateVersion?.trim() || undefined,
    subtotalAmount: totals.subtotalAmount,
    vatAmount: totals.vatAmount,
    discountAmount: totals.discountAmount,
    grandTotalAmount: totals.grandTotalAmount,
    hasPendingAmounts: totals.hasPendingAmounts,
    pendingAmountNote: totals.pendingAmountNote,
    lineItems,
  }
}

export function buildStandardQuoteDetails(
  input?: PartnerQuoteDetailsInput | null,
  fallbackTemplateId?: StandardQuoteTemplateId
): PartnerQuoteDetailsInput {
  const templateId = (
    input?.templateId && getStandardQuoteTemplate(input.templateId).id
  ) as StandardQuoteTemplateId | undefined
  const resolvedTemplateId = templateId ?? fallbackTemplateId ?? STANDARD_QUOTE_TEMPLATES[0].id

  return finalizeStandardQuoteDetails(
    {
      ...input,
      templateId: resolvedTemplateId,
      lineItems: mergeStandardQuoteLineItems(resolvedTemplateId, input?.lineItems),
    },
    resolvedTemplateId
  )
}

export function buildConfigurableStandardQuoteDetails({
  templateId,
  input,
  optionSelections,
  baseQuantity,
}: BuildConfigurableStandardQuoteInput) {
  const resolvedTemplateId = getStandardQuoteTemplate(templateId ?? input?.templateId).id as StandardQuoteTemplateId
  const existing = finalizeStandardQuoteDetails(
    {
      ...input,
      templateId: resolvedTemplateId,
      lineItems: input?.lineItems,
    },
    resolvedTemplateId
  )
  const defaultSelections = getStandardQuoteDefaultSelections(resolvedTemplateId)
  const selections = {
    ...defaultSelections,
    ...(existing.optionSelections ?? {}),
    ...(optionSelections ?? {}),
  }
  const template = getStandardQuoteTemplate(resolvedTemplateId)
  const existingMap = getExistingLineMap(existing.lineItems)
  const mainTemplateLine = template.lines[0]
  const mainCode = mainTemplateLine.itemCode ?? resolvedTemplateId
  const mainExisting = existingMap.get(mainCode)
  const quantity = clampPositiveInteger(
    baseQuantity ?? mainExisting?.quantity ?? mainTemplateLine.quantity ?? 1,
    1
  )
  const generatedItems: Array<Omit<PartnerQuoteLineItemInput, "sortOrder" | "lineNumber" | "lineSupplyAmount">> = [
    {
      id: mainExisting?.id,
      itemType: mainTemplateLine.itemType,
      itemCode: mainCode,
      itemName: mainExisting?.itemName ?? mainTemplateLine.itemName,
      itemDescription: mainExisting?.itemDescription ?? mainTemplateLine.itemDescription,
      quantity,
      quantityUnit: mainTemplateLine.quantityUnit ?? "대",
      unitPrice: mainExisting?.unitPrice ?? mainTemplateLine.unitPrice,
      vatIncluded: mainExisting?.vatIncluded ?? true,
      lineStatus: "priced",
      billingMode: "included_in_quote",
      optionGroupId: "main_product",
      optionId: resolvedTemplateId,
      isOptional: false,
      priceLocked: false,
      quantityLocked: false,
    },
  ]

  const addOptionalLine = (
    code: string,
    config: {
      itemType: PartnerQuoteLineItemInput["itemType"]
      itemName: string
      itemDescription?: string
      quantity: number
      quantityUnit?: string
      unitPrice?: number
      lineStatus?: PartnerQuoteLineItemInput["lineStatus"]
      billingMode?: PartnerQuoteLineItemInput["billingMode"]
      optionGroupId: string
      optionId: string
      priceLocked?: boolean
      quantityLocked?: boolean
      remark?: string
    }
  ) => {
    const existingLine = existingMap.get(code)
    generatedItems.push({
      id: existingLine?.id,
      itemType: config.itemType,
      itemCode: code,
      itemName: existingLine?.itemName ?? config.itemName,
      itemDescription: existingLine?.itemDescription ?? config.itemDescription,
      quantity: config.quantity,
      quantityUnit: config.quantityUnit ?? "식",
      unitPrice:
        config.lineStatus === "pending_price" || config.lineStatus === "separate_billing"
          ? undefined
          : existingLine?.unitPrice ?? config.unitPrice,
      vatIncluded: existingLine?.vatIncluded ?? true,
      lineStatus: config.lineStatus,
      billingMode: config.billingMode,
      remark: existingLine?.remark ?? config.remark,
      optionGroupId: config.optionGroupId,
      optionId: config.optionId,
      isOptional: true,
      priceLocked: config.priceLocked ?? false,
      quantityLocked: config.quantityLocked ?? true,
    })
  }

  const installationMode = readSelectionString(
    selections,
    "installation_mode",
    readSelectionString(defaultSelections, "installation_mode", "included_quote")
  )

  if (resolvedTemplateId === "recording_studio") {
    const paymentPlan = readSelectionString(selections, "payment_plan", "one_time")
    const deliveryIncluded = readSelectionBoolean(selections, "delivery_policy", true)

    addOptionalLine("recording-studio-condition", {
      itemType: "note_only",
      itemName: paymentPlan === "12_month" ? "12개월 할부 안내" : "납품 조건",
      itemDescription: paymentPlan === "12_month"
        ? "설치 배송비 포함 · 12개월 할부 가능"
        : deliveryIncluded
          ? "설치 배송비 포함"
          : "설치 배송비 별도 협의",
      quantity: 1,
      unitPrice: 0,
      lineStatus: "informational",
      optionGroupId: "payment_plan",
      optionId: paymentPlan,
      priceLocked: true,
    })
  } else if (resolvedTemplateId === "online_suite") {
    const contractTerm = readSelectionString(selections, "contract_term", "36_month")
    const includeLanding = readSelectionBoolean(selections, "landing_page", true)
    const includeAuthorization = readSelectionBoolean(selections, "authorization_support", true)
    const notes = [
      contractTerm === "36_month" ? "36개월 구독/할부 기준" : contractTerm === "12_month" ? "12개월 파일럿 기준" : "계약 기간 별도 협의",
      includeLanding ? "랜딩페이지 제작 포함" : "랜딩페이지 제작 제외",
      includeAuthorization ? "온라인 관련 사업자 인가 대행 포함" : "인가 대행 제외",
      "설치 배송비 별도",
    ]

    addOptionalLine("online-suite-condition", {
      itemType: "note_only",
      itemName: "구독 조건",
      itemDescription: notes.join(" · "),
      quantity: 1,
      unitPrice: 0,
      lineStatus: "informational",
      optionGroupId: "contract_term",
      optionId: contractTerm,
      priceLocked: true,
    })
  } else if (resolvedTemplateId === "camera_t1") {
    if (installationMode === "included_quote") {
      addOptionalLine("camera-install", {
        itemType: "installation",
        itemName: "카메라 설치",
        itemDescription: "현장 설치 및 초기 세팅",
        quantity,
        quantityUnit: "대",
        unitPrice: 0,
        optionGroupId: "installation_mode",
        optionId: installationMode,
      })
    } else if (installationMode === "separate_billing") {
      addOptionalLine("camera-install", {
        itemType: "installation",
        itemName: "카메라 설치",
        itemDescription: "별도 청구 예정",
        quantity,
        quantityUnit: "대",
        lineStatus: "separate_billing",
        billingMode: "separate_invoice",
        optionGroupId: "installation_mode",
        optionId: installationMode,
        priceLocked: true,
      })
    } else {
      addOptionalLine("camera-install", {
        itemType: "installation",
        itemName: "카메라 설치",
        itemDescription: "현장 조건 확인 후 추후 협의",
        quantity,
        quantityUnit: "대",
        lineStatus: "pending_price",
        billingMode: "tbd",
        optionGroupId: "installation_mode",
        optionId: installationMode,
        priceLocked: true,
      })
    }

    if (readSelectionBoolean(selections, "support_package", false)) {
      addOptionalLine("camera-support", {
        itemType: "service",
        itemName: "초기 세팅 지원",
        itemDescription: "운영 시작 전 기본 세팅 및 안내",
        quantity: 1,
        unitPrice: 0,
        optionGroupId: "support_package",
        optionId: "enabled",
      })
    }
  } else {
    const mountingOption = readSelectionString(
      selections,
      "mounting_option",
      readSelectionString(defaultSelections, "mounting_option", "none")
    )
    if (mountingOption === "wall_mount") {
      addOptionalLine("wall-mount", {
        itemType: "installation",
        itemName: "벽걸이 설치",
        itemDescription: "현장 벽면 고정 및 기본 부자재 포함",
        quantity,
        quantityUnit: "대",
        unitPrice: STANDARD_PRICE_WALL_MOUNT,
        optionGroupId: "mounting_option",
        optionId: mountingOption,
      })
    } else if (mountingOption === "stand") {
      addOptionalLine("stand", {
        itemType: "hardware",
        itemName: "이동형 스탠드",
        itemDescription: "이동형 스탠드 거치",
        quantity,
        quantityUnit: "대",
        unitPrice: STANDARD_PRICE_STAND,
        optionGroupId: "mounting_option",
        optionId: mountingOption,
      })
    }

    if (installationMode === "included_quote") {
      addOptionalLine("install-training", {
        itemType: "service",
        itemName: "설치 및 교육",
        itemDescription: "현장 설치 및 초기 운영 교육",
        quantity: 1,
        unitPrice: 0,
        optionGroupId: "installation_mode",
        optionId: installationMode,
      })
    } else if (installationMode === "separate_billing") {
      addOptionalLine("install-training", {
        itemType: "service",
        itemName: "설치 및 교육",
        itemDescription: "별도 청구 예정",
        quantity: 1,
        lineStatus: "separate_billing",
        billingMode: "separate_invoice",
        optionGroupId: "installation_mode",
        optionId: installationMode,
        priceLocked: true,
      })
    } else {
      addOptionalLine("install-training", {
        itemType: "service",
        itemName: "설치 및 교육",
        itemDescription: "현장 확인 후 추후 협의",
        quantity: 1,
        lineStatus: "pending_price",
        billingMode: "tbd",
        optionGroupId: "installation_mode",
        optionId: installationMode,
        priceLocked: true,
      })
    }

    if (readSelectionBoolean(selections, "camera_bundle", false)) {
      addOptionalLine("camera-t1", {
        itemType: "hardware",
        itemName: "T1 카메라",
        itemDescription: "강사용 모션트래킹 카메라 (전용 POE 스위치 포함)",
        quantity,
        quantityUnit: "대",
        unitPrice: STANDARD_PRICE_CAMERA_T1,
        optionGroupId: "camera_bundle",
        optionId: "enabled",
      })
    }

    if (readSelectionBoolean(selections, "support_package", true)) {
      addOptionalLine("support-1y", {
        itemType: "service",
        itemName: "유지보수 1년",
        itemDescription: "기본 보증 및 운영 지원 안내",
        quantity: 1,
        unitPrice: 0,
        optionGroupId: "support_package",
        optionId: "enabled",
      })
    }
  }

  return finalizeStandardQuoteDetails(
    {
      ...existing,
      templateId: resolvedTemplateId,
      optionSelections: selections,
      pricingSource: "standard_quote_builder",
      lineItems: generatedItems.map((item, index) => createGeneratedLine(item, index)),
    },
    resolvedTemplateId
  )
}

export function inferStandardQuoteTemplateId(
  quoteDetails?: Pick<PartnerQuoteDetailsInput, "templateId" | "lineItems"> | null
) {
  if (quoteDetails?.templateId) {
    return getStandardQuoteTemplate(quoteDetails.templateId).id as StandardQuoteTemplateId
  }

  const firstItemCode = quoteDetails?.lineItems?.find((item) => item.itemCode)?.itemCode
  return inferTemplateIdFromItemCode(firstItemCode)
}

export function buildStandardQuoteTitle(quoteDetails: PartnerQuoteDetailsInput) {
  const template = getStandardQuoteTemplate(quoteDetails.templateId)
  const recipient = quoteDetails.recipientCompanyName?.trim()
  return recipient ? `${recipient} ${template.label} 견적서` : `${template.label} 표준 견적서`
}

export function buildStandardQuoteFileLabel(quoteDetails: PartnerQuoteDetailsInput) {
  const title = sanitizeFileNameSegment(buildStandardQuoteTitle(quoteDetails))
  return `${title || "표준 견적서"}.pdf`
}
