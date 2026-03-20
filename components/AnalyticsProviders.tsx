import Script from 'next/script'

export function AnalyticsProviders() {
  const GA_ID = process.env.NEXT_PUBLIC_GA_ID || 'G-XXXXXXXXXX';
  const META_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || 'XXXXXXXXXXXXXXX';
  const KAKAO_ID = process.env.NEXT_PUBLIC_KAKAO_PIXEL_ID || 'YOUR_KAKAO_PIXEL_ID';

  return (
    <>
      {/* 1. Google Analytics */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="lazyOnload"
      />
      <Script id="google-analytics" strategy="lazyOnload">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}');
        `}
      </Script>

      {/* 2. Meta Pixel */}
      <Script id="meta-pixel" strategy="lazyOnload">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${META_ID}');
          fbq('track', 'PageView');
        `}
      </Script>

      {/* 3. Kakao Pixel */}
      <Script src="//t1.daumcdn.net/adfit/static/kp.js" strategy="lazyOnload" />
      <Script id="kakao-pixel" strategy="lazyOnload">
        {`
          if(typeof kakaoPixel !== 'undefined') {
            kakaoPixel('${KAKAO_ID}').pageView();
          }
        `}
      </Script>
    </>
  )
}
