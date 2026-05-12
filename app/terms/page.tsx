import Link from "next/link"

import { LegalArticle, LegalList, LegalSection } from "@/components/legal/LegalArticle"
import { createPublicMetadata } from "@/lib/seo"

export const metadata = createPublicMetadata({
  title: "이용약관",
  description: "Classin 웹사이트와 서비스 이용에 관한 기본 약관입니다.",
  path: "/terms",
})

export default function TermsPage() {
  return (
    <LegalArticle
      eyebrow="Terms of Service"
      title="이용약관"
      description="이 약관은 이이오클래스인코리아 유한회사가 제공하는 Classin 웹사이트, 상담, 계약 및 관련 서비스 이용에 관한 기본 조건을 정합니다."
      lastUpdated="2026년 5월 12일"
    >
      <LegalSection title="1. 목적과 적용">
        <p>
          본 약관은 Classin 웹사이트, 도입 상담, 견적, 계약, 고객지원, 마케팅 정보 제공 등 회사가 제공하는
          서비스 이용에 적용됩니다. 별도 계약서 또는 주문서가 있는 경우 해당 문서가 본 약관보다 우선합니다.
        </p>
      </LegalSection>

      <LegalSection title="2. 서비스의 내용">
        <LegalList
          items={[
            "학원 운영 및 교육 품질 관리를 위한 소프트웨어와 관련 안내",
            "하드웨어, 설치, 교육, 운영 지원에 관한 상담 및 견적",
            "고객 지원, 문서, 업데이트, 뉴스레터 및 마케팅 정보 제공",
            "Meta 광고 또는 분석 도구 등 외부 플랫폼과의 연동 지원",
          ]}
        />
      </LegalSection>

      <LegalSection title="3. 이용자의 의무">
        <LegalList
          items={[
            "정확하고 최신의 정보를 제공해야 합니다.",
            "타인의 권리, 개인정보, 영업비밀을 침해하는 방식으로 서비스를 이용할 수 없습니다.",
            "서비스의 보안, 운영, 정상적인 이용을 방해하는 행위를 할 수 없습니다.",
            "외부 플랫폼을 연동하는 경우 해당 플랫폼의 약관과 정책을 함께 준수해야 합니다.",
          ]}
        />
      </LegalSection>

      <LegalSection title="4. 요금, 결제, 환불">
        <p>
          유료 서비스의 금액, 결제 방식, 제공 범위, 환불 조건은 견적서, 계약서, 주문서, 결제 화면 또는 별도
          안내에 따릅니다. 외부 결제사가 처리하는 결제 정보는 해당 결제사의 정책과 법령에 따라 보관될 수
          있습니다.
        </p>
      </LegalSection>

      <LegalSection title="5. 지식재산권">
        <p>
          Classin 웹사이트, 문서, 디자인, 소프트웨어, 로고, 콘텐츠에 관한 권리는 회사 또는 정당한 권리자에게
          있습니다. 이용자는 회사의 사전 동의 없이 이를 복제, 배포, 판매, 변형하거나 상업적으로 이용할 수
          없습니다.
        </p>
      </LegalSection>

      <LegalSection title="6. 개인정보 보호">
        <p>
          회사는 개인정보를{" "}
          <Link href="/privacy" className="font-semibold text-[#084734] underline underline-offset-4">
            개인정보처리방침
          </Link>
          에 따라 처리합니다. Meta 연동 또는 외부 플랫폼 데이터 삭제 요청은{" "}
          <Link href="/data-deletion" className="font-semibold text-[#084734] underline underline-offset-4">
            사용자 데이터 삭제 안내
          </Link>
          를 따릅니다.
        </p>
      </LegalSection>

      <LegalSection title="7. 서비스 변경과 중단">
        <p>
          회사는 운영상, 기술상 필요에 따라 서비스의 전부 또는 일부를 변경하거나 중단할 수 있습니다. 중요한
          변경이 사용자의 권리와 의무에 영향을 주는 경우 합리적인 방법으로 사전 또는 사후에 안내합니다.
        </p>
      </LegalSection>

      <LegalSection title="8. 책임의 제한">
        <p>
          회사는 천재지변, 외부 플랫폼 장애, 통신망 장애, 이용자의 귀책 사유 등 회사의 합리적 통제를 벗어난
          사유로 인한 손해에 대해 책임을 지지 않습니다. 회사의 책임은 관계 법령과 개별 계약에서 정한 범위에
          따릅니다.
        </p>
      </LegalSection>

      <LegalSection title="9. 문의">
        <LegalList
          items={[
            <span key="email">
              이메일:{" "}
              <a href="mailto:classinkr@classin.com" className="font-semibold text-[#084734] underline underline-offset-4">
                classinkr@classin.com
              </a>
            </span>,
            <span key="contact">
              문의 페이지:{" "}
              <Link href="/contact#contact-form" className="font-semibold text-[#084734] underline underline-offset-4">
                /contact
              </Link>
            </span>,
          ]}
        />
      </LegalSection>
    </LegalArticle>
  )
}
