export function Footer() {
    return (
        <footer className="bg-slate-950 py-12 text-slate-400 text-sm">
            <div className="container mx-auto">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
                    <div>
                        <img src="/images/logo.png" alt="Classin Logo" className="h-7 w-auto mb-4 object-contain" />
                        <p className="mb-4">다음 세대를 위한 교육 품질 표준화.</p>
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
                <div className="pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
                    <p>© 2024 Classin Inc. All rights reserved.</p>
                    <div className="flex gap-4">
                        {/* Social icons placeholders */}
                    </div>
                </div>
            </div>
        </footer>
    )
}
