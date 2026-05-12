/**
 * [NOTE-25] Footer에 뉴스레터 구독 섹션 추가
 * 페이지 최하단에서 이메일 구독을 유도.
 * NewsletterSubscribe 컴포넌트의 dark variant 사용.
 */
import Image from "next/image"
import Link from "next/link"
import { NewsletterSubscribe } from "./NewsletterSubscribe"

export function Footer() {
    return (
        <footer className="bg-[#111110] py-10 text-sm text-[#A39E98] sm:py-12">
            <div className="container mx-auto">
                <div className="mb-10 grid grid-cols-1 gap-8 sm:grid-cols-2 md:mb-12 md:grid-cols-4">
                    <div className="sm:col-span-2 md:col-span-1">
                        <Image
                            src="/images/logo.png"
                            alt="Classin Logo"
                            width={120}
                            height={28}
                            className="h-7 w-auto mb-4 object-contain"
                            style={{ width: "auto" }}
                        />
                        <p className="mb-4">다음 세대를 위한 교육 품질 표준화.</p>
                        {/* [NOTE-25] 뉴스레터 구독 영역 */}
                        <div className="mt-4 max-w-sm">
                            <p className="text-white font-semibold text-xs mb-2">교육 인사이트 뉴스레터</p>
                            <NewsletterSubscribe variant="dark" />
                        </div>
                    </div>
                    <div>
                        <h4 className="font-semibold text-white mb-4">제품</h4>
                        <ul className="space-y-2">
                            <li><Link href="/product/sw" className="hover:text-white transition-colors">소프트웨어</Link></li>
                            <li><Link href="/product/hw" className="hover:text-white transition-colors">하드웨어</Link></li>
                            <li><Link href="/contact" className="hover:text-white transition-colors">도입 문의</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-semibold text-white mb-4">자원</h4>
                        <ul className="space-y-2">
                            <li><Link href="/docs" className="hover:text-white transition-colors">가이드와 도움말</Link></li>
                            <li><Link href="/docs/troubleshooting" className="hover:text-white transition-colors">문제 해결</Link></li>
                            <li><Link href="/faq" className="hover:text-white transition-colors">자주 묻는 질문</Link></li>
                            <li><Link href="/updates" className="hover:text-white transition-colors">업데이트</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-semibold text-white mb-4">이용안내</h4>
                        <ul className="space-y-2">
                            <li><Link href="/privacy" className="hover:text-white transition-colors">개인정보처리방침</Link></li>
                            <li><Link href="/terms" className="hover:text-white transition-colors">이용약관</Link></li>
                            <li><Link href="/data-deletion" className="hover:text-white transition-colors">데이터 삭제 안내</Link></li>
                        </ul>
                    </div>
                </div>
                <div className="pt-8 border-t border-white/[0.08] space-y-3">
                    <div className="flex flex-col gap-4 text-xs leading-relaxed text-white/40 md:flex-row md:justify-between">
                        <div className="space-y-0.5">
                            <p><span className="text-[#A39E98]">이이오클래스인코리아 유한회사</span><span className="mx-1 text-white/20">|</span>대표자: 구옌</p>
                            <p>사업자등록번호: 724-88-02403</p>
                            <p>주소: 서울특별시 양천구 목동동로 233-1, 8층 806호 (목동, 드림타워)</p>
                        </div>
                        <div className="space-y-0.5 md:text-right">
                            <p>이메일: <a href="mailto:classinkr@classin.com" className="hover:text-white transition-colors">classinkr@classin.com</a></p>
                            <p>전화번호: <a href="tel:02-6958-8566" className="hover:text-white transition-colors">02-6958-8566</a></p>
                        </div>
                    </div>
                    <p className="text-xs text-white/25">© 2025 이이오클래스인코리아 유한회사. All rights reserved.</p>
                </div>
            </div>
        </footer>
    )
}
