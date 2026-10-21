import { describe, expect, it } from "vitest"

import {
  HARDWARE_INSTALL_PRICE_KRW,
  getHardwareItem,
} from "@/lib/billing/hardware-catalog"
import { BUSINESS_RECHARGE, validateRechargeAmount } from "@/lib/billing/recharge"
import { getSoftwarePlan } from "@/lib/billing/plans"
import { getProductBySku } from "@/lib/product-templates"
import {
  buildConfigurableStandardQuoteDetails,
  getOnlineSuiteTermMonths,
  getStandardQuoteDefaultSelections,
  getStandardQuoteQuickPresets,
  resolveQuoteSupplier,
} from "@/lib/standard-quote-template"

describe("하드웨어·수트형·소프트웨어 가격 정합성 검증", () => {
  describe("1. 하드웨어 단품 단가 일치", () => {
    it("86인치 전자칠판 단가가 하드웨어 카탈로그와 견적 템플릿 간 일치한다", () => {
      const catalog = getHardwareItem("hw-board-86")
      const template = getProductBySku("board-86")
      expect(catalog?.priceKrw).toBe(6_300_000)
      expect(template?.unit_price).toBe(catalog?.priceKrw)
    })

    it("75인치 전자칠판 단가가 하드웨어 카탈로그와 견적 템플릿 간 일치한다", () => {
      const catalog = getHardwareItem("hw-board-75")
      const template = getProductBySku("board-75")
      expect(catalog?.priceKrw).toBe(5_400_000)
      expect(template?.unit_price).toBe(catalog?.priceKrw)
    })

    it.each([
      ["board_75", 5_400_000],
      ["board_86", 6_300_000],
    ] as const)("%s 기본 견적·교실 기본형은 거치비 50만원을 자동 가산하지 않는다", (templateId, price) => {
      const defaults = getStandardQuoteDefaultSelections(templateId)
      const classroom = getStandardQuoteQuickPresets(templateId).find((preset) => preset.id === `${templateId}_classroom`)
      expect(classroom).toBeDefined()
      for (const optionSelections of [defaults, { ...defaults, ...classroom!.optionSelections }]) {
        const quote = buildConfigurableStandardQuoteDetails({ templateId, optionSelections })
        expect(quote.grandTotalAmount).toBe(price)
        expect(quote.lineItems?.some((line) => ["wall-mount", "stand"].includes(line.itemCode ?? ""))).toBe(false)
      }
      // 거치 옵션을 명시적으로 추가한 견적은 기존 유료 옵션 계산을 유지한다.
      for (const mounting_option of ["wall_mount", "stand"]) {
        const quote = buildConfigurableStandardQuoteDetails({ templateId, optionSelections: { ...defaults, mounting_option } })
        expect(quote.grandTotalAmount).toBe(price + HARDWARE_INSTALL_PRICE_KRW)
      }
    })

    it("T1 카메라 단가가 하드웨어 카탈로그와 견적 템플릿 간 일치한다", () => {
      const catalog = getHardwareItem("hw-camera-t1")
      const template = getProductBySku("camera-t1")
      expect(catalog?.priceKrw).toBe(1_200_000)
      expect(template?.unit_price).toBe(catalog?.priceKrw)
    })

    it("설치비(스탠드/벽걸이) 단가가 50만원으로 일치한다", () => {
      expect(HARDWARE_INSTALL_PRICE_KRW).toBe(500_000)
      expect(getProductBySku("stand")?.unit_price).toBe(HARDWARE_INSTALL_PRICE_KRW)
      expect(getProductBySku("wall-mount")?.unit_price).toBe(HARDWARE_INSTALL_PRICE_KRW)
    })
  })

  describe("2. 패키지 / 세트 / 수트형 단가 및 구성 일치", () => {
    it("86 번들 단가는 86보드 + T1 + 벽걸이의 정확한 합(800만원)이다", () => {
      const board86 = getProductBySku("board-86")?.unit_price ?? 0
      const cameraT1 = getProductBySku("camera-t1")?.unit_price ?? 0
      const wallMount = getProductBySku("wall-mount")?.unit_price ?? 0
      const bundle = getProductBySku("bundle-86-t1-wall")?.unit_price

      expect(board86 + cameraT1 + wallMount).toBe(8_000_000)
      expect(bundle).toBe(8_000_000)
    })

    it("올인원 녹화수업 세트 단가는 86보드 + T1 + 벽걸이 + 자동녹화1년의 합(830만원)이며 카탈로그와 일치한다", () => {
      const catalog = getHardwareItem("hw-package-ai-studio")
      const template = getProductBySku("ai-studio-recording-set")
      const recording1y = getProductBySku("ai-recording-1y")?.unit_price ?? 0
      const bundle = getProductBySku("bundle-86-t1-wall")?.unit_price ?? 0

      expect(catalog?.priceKrw).toBe(8_300_000)
      expect(template?.unit_price).toBe(8_300_000)
      expect(bundle + recording1y).toBe(8_300_000)
    })

    it("올인원 녹화수업 세트 견적 생성 시 할부/배송비 조건 문구가 올바르게 파생된다", () => {
      const defaults = getStandardQuoteDefaultSelections("recording_studio")
      const quoteDefault = buildConfigurableStandardQuoteDetails({
        templateId: "recording_studio",
        optionSelections: defaults,
      })
      const conditionLine = quoteDefault.lineItems?.find((l) => l.itemCode === "recording-studio-condition")
      expect(conditionLine?.itemDescription).toBe("설치 배송비 포함")

      // 12개월 할부 선택 시
      const quoteInstallment = buildConfigurableStandardQuoteDetails({
        templateId: "recording_studio",
        optionSelections: { ...defaults, payment_plan: "12_month" },
      })
      const installmentLine = quoteInstallment.lineItems?.find((l) => l.itemCode === "recording-studio-condition")
      expect(installmentLine?.itemDescription).toBe("설치 배송비 포함 · 12개월 할부 가능")

      // 배송비 별도 선택 시
      const quoteDeliverySeparate = buildConfigurableStandardQuoteDetails({
        templateId: "recording_studio",
        optionSelections: { ...defaults, payment_plan: "12_month", delivery_policy: false },
      })
      const separateLine = quoteDeliverySeparate.lineItems?.find((l) => l.itemCode === "recording-studio-condition")
      expect(separateLine?.itemDescription).toBe("설치 배송비 별도 협의 · 12개월 할부 가능")
    })

    it("구독형 AI Suite 단가는 월 40만원이며 기간별 약정 총액이 조건 행에 표기된다", () => {
      const suiteProduct = getProductBySku("online-suite-monthly")
      expect(suiteProduct?.unit_price).toBe(400_000)

      expect(getOnlineSuiteTermMonths("36_month")).toBe(36)
      expect(getOnlineSuiteTermMonths("12_month")).toBe(12)
      expect(getOnlineSuiteTermMonths("custom")).toBeNull()

      // 기본 36개월 견적 생성
      const defaults = getStandardQuoteDefaultSelections("online_suite")
      const quote36 = buildConfigurableStandardQuoteDetails({
        templateId: "online_suite",
        optionSelections: defaults,
      })
      const conditionLine36 = quote36.lineItems?.find((l) => l.itemCode === "online-suite-condition")
      expect(conditionLine36?.itemDescription).toContain("36개월 구독/할부 기준")
      expect(conditionLine36?.itemDescription).toContain("약정 총액 14,400,000원")

      // 12개월 파일럿 견적 생성
      const quote12 = buildConfigurableStandardQuoteDetails({
        templateId: "online_suite",
        optionSelections: { ...defaults, contract_term: "12_month" },
      })
      const conditionLine12 = quote12.lineItems?.find((l) => l.itemCode === "online-suite-condition")
      expect(conditionLine12?.itemDescription).toContain("12개월 파일럿 기준")
      expect(conditionLine12?.itemDescription).toContain("약정 총액 4,800,000원")
    })
  })

  describe("3. 소프트웨어 요금 정책 일치", () => {
    it("Business 충전형 규칙(최소 200만, 단위 50만, 상한 5,000만)이 유효하고 모든 프리셋이 검증을 통과한다", () => {
      expect(BUSINESS_RECHARGE.baseMinKrw).toBe(2_000_000)
      expect(BUSINESS_RECHARGE.incrementKrw).toBe(500_000)
      expect(BUSINESS_RECHARGE.maxKrw).toBe(50_000_000)

      for (const preset of BUSINESS_RECHARGE.presetsKrw) {
        const validation = validateRechargeAmount(preset)
        expect(validation.ok).toBe(true)
      }

      // 경계값 검증
      expect(validateRechargeAmount(1_999_999).ok).toBe(false)
      expect(validateRechargeAmount(2_300_000).ok).toBe(false)
      expect(validateRechargeAmount(2_500_000).ok).toBe(true)
      expect(validateRechargeAmount(50_000_000).ok).toBe(true)
      expect(validateRechargeAmount(50_500_000).ok).toBe(false)
    })

    it("구독형 SaaS 플랜(Standard, Plus, Enterprise) 단가가 정본과 일치한다", () => {
      const standard = getSoftwarePlan("standard")
      expect(standard.monthly?.amount).toBe(99)
      expect(standard.yearly?.amount).toBe(990)

      const plus = getSoftwarePlan("plus")
      expect(plus.monthly?.amount).toBe(199)
      expect(plus.yearly?.amount).toBe(1990)

      const enterprise = getSoftwarePlan("enterprise")
      expect(enterprise.monthly?.amount).toBe(299)
      expect(enterprise.yearly?.amount).toBe(2990)
    })

    it("Business 충전형 템플릿 기본 단가는 2,000,000원이며 금액 직접 수정 및 200만원 미만 예외 발행이 지원된다", () => {
      const defaults = getStandardQuoteDefaultSelections("business_recharge")
      const defaultQuote = buildConfigurableStandardQuoteDetails({
        templateId: "business_recharge",
        optionSelections: defaults,
      })

      const mainLine = defaultQuote.lineItems?.find((l) => l.itemCode === "classin-business-recharge")
      expect(mainLine?.unitPrice).toBe(2_000_000)
      expect(mainLine?.priceLocked).toBe(false)
      expect(defaultQuote.subtotalAmount).toBe(2_000_000)
      expect(defaultQuote.grandTotalAmount).toBe(2_000_000)

      // 100만원 소액 예외 발행 시
      const custom100 = buildConfigurableStandardQuoteDetails({
        templateId: "business_recharge",
        input: {
          lineItems: [
            {
              ...mainLine!,
              unitPrice: 1_000_000,
              lineSupplyAmount: 1_000_000,
            },
          ],
        },
        optionSelections: defaults,
      })
      const customLine = custom100.lineItems?.find((l) => l.itemCode === "classin-business-recharge")
      expect(customLine?.unitPrice).toBe(1_000_000)
      expect(custom100.subtotalAmount).toBe(1_000_000)
      expect(custom100.grandTotalAmount).toBe(1_000_000)

      // 조건 행 생성 확인
      const conditionLine = custom100.lineItems?.find((l) => l.itemCode === "business-recharge-condition")
      expect(conditionLine?.itemDescription).toContain("충전일로부터 1년간 유효")
      expect(conditionLine?.itemDescription).toContain("초기 기관 세팅 및 교사 교육 포함")
    })
  })

  describe("4. 공급자 법인 스냅샷 정합성 (SW 클래스인 vs HW 퀴드러닝)", () => {
    it("소프트웨어 견적은 공급처가 이이오클래스인코리아 유한회사로 확정된다", () => {
      for (const swId of ["business_recharge", "online_suite"]) {
        const swSupplier = resolveQuoteSupplier(swId)
        expect(swSupplier.supplierBusinessName).toBe("이이오클래스인코리아 유한회사")
        expect(swSupplier.supplierBusinessRegistrationNumber).toBe("724-88-02403")
        expect(swSupplier.supplierRepresentativeName).toBe("GU YAN(구엔)")
      }
    })

    it("하드웨어 견적은 공급처가 퀴드러닝(사업자 170-07-03305, 대표 조혜리)으로 확정된다", () => {
      const hwTemplates = ["board_86", "board_75", "camera_t1", "recording_studio"]
      for (const tId of hwTemplates) {
        const hwSupplier = resolveQuoteSupplier(tId)
        expect(hwSupplier.supplierBusinessName).toBe("퀴드러닝")
        expect(hwSupplier.supplierBusinessRegistrationNumber).toBe("170-07-03305")
        expect(hwSupplier.supplierRepresentativeName).toBe("조혜리")
      }
    })
  })
})
