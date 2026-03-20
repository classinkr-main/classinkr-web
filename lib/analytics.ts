export type EventNames = 'page_view' | 'click_cta' | 'submit_demo_request' | 'download_materials' | 'view_demo_video';

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    fbq?: (...args: any[]) => void;
    kakaoPixel?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

export const trackEvent = (eventName: EventNames, params?: Record<string, any>) => {
  if (typeof window !== 'undefined') {
    // 1. Google Analytics (gtag.js)
    if (window.gtag) {
      window.gtag('event', eventName, params);
    }
    
    // 2. Meta Pixel (Facebook Pixel)
    if (window.fbq) {
      // Standard events or custom events
      if (eventName === 'submit_demo_request') {
        window.fbq('track', 'Lead', params);
      } else {
        window.fbq('trackCustom', eventName, params);
      }
    }
    
    // 3. Kakao Pixel
    // @ts-ignore
    if (window.kakaoPixel) {
      const kakaoPixelId = process.env.NEXT_PUBLIC_KAKAO_PIXEL_ID || 'YOUR_KAKAO_PIXEL_ID';
      
      switch (eventName) {
        case 'submit_demo_request':
          // @ts-ignore
          window.kakaoPixel(kakaoPixelId).completeRegistration();
          break;
        case 'click_cta':
        case 'download_materials':
        case 'view_demo_video':
          // @ts-ignore
          window.kakaoPixel(kakaoPixelId).participate({ tag: eventName });
          break;
        default:
          break;
      }
    }
  }
};
