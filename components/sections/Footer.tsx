/**
 * [NOTE-25] Footer에 뉴스레터 구독 섹션 추가
 * 페이지 최하단에서 이메일 구독을 유도.
 * NewsletterSubscribe 컴포넌트의 dark variant 사용.
 */
import Image from "next/image"
import { NewsletterSubscribe } from "./NewsletterSubscribe"

export function Footer() {
    return (
        <footer className="bg-slate-950 py-12 text-slate-400 text-sm">
            <div className="container mx-auto">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
                    <div>
                        <Image
                            src="/images/logo.png"
                            alt="Classin Logo"
                            width={120}
                            height={28}
                            className="h-7 w-auto mb-4 object-contain"
                        />
                        <p className="mb-4">다음 세대를 위한 교육 품질 표준화.</p>
                        {/* [NOTE-25] 뉴스레터 구독 영역 */}
                        <div className="mt-4">
                            <p className="text-white font-semibold text-xs mb-2">교육 인사이트 뉴스레터</p>
                            <NewsletterSubscribe variant="dark" />
                        </div>
                    </div>
                    <div>
                        <h4 className="font-semibold text-white mb-4">제품</h4>
                        <ul className="space-y-2">
                            <li><a href="#" className="hover:text-white transition-colors">인터랙티브 교실</a></li>
                            <li><a href="#" className="hover:text-white transition-colors">LMS 자동화</a></li>
                            <li><a href="#" className="hover:text-white transition-colors">성과 분석</a></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-semibold text-white mb-4">자원</h4>
                        <ul className="space-y-2">
                            <li><a href="#" className="hover:text-white transition-colors">블로그</a></li>
                            <li><a href="#" className="hover:text-white transition-colors">고객 사례</a></li>
                            <li><a href="/faq" className="hover:text-white transition-colors">자주 묻는 질문</a></li>
                            <li><a href="#" className="hover:text-white transition-colors">고객 센터</a></li>
                        </ul>
                    </div>
                    <div>
                        <h4 className="font-semibold text-white mb-4">이용안내</h4>
                        <ul className="space-y-2">
                            <li><a href="#" className="hover:text-white transition-colors">개인정보처리방침</a></li>
                            <li><a href="#" className="hover:text-white transition-colors">이용약관</a></li>
                        </ul>
                    </div>
                </div>
                <div className="pt-8 border-t border-slate-800 space-y-3">
                    <div className="flex flex-col md:flex-row md:justify-between gap-1 md:gap-4 text-xs text-slate-500 leading-relaxed">
                        <div className="space-y-0.5">
                            <p><span className="text-slate-400">이이오클래스인코리아 유한회사</span> | 대표자: 구옌</p>
                            <p>사업자등록번호: 724-88-02403</p>
                            <p>주소: 서울특별시 양천구 목동동로 233-1, 8층 806호 (목동, 드림타워)</p>
                        </div>
                        <div className="space-y-0.5 md:text-right">
                            <p>이메일: <a href="mailto:classinkr@classin.com" className="hover:text-white transition-colors">classinkr@classin.com</a></p>
                            <p>전화번호: <a href="tel:02-6958-8566" className="hover:text-white transition-colors">02-6958-8566</a></p>
                        </div>
                    </div>
                    <p className="text-xs text-slate-600">© 2025 이이오클래스인코리아 유한회사. All rights reserved.</p>
                </div>
            </div>
        </footer>
    )
}
