/** 정적 랜딩의 동의 변경 감시. 광고 식별자 저장은 안전한 동의 검증을 구현할 때까지 중단한다. */
(function () {
  /** lib/marketing-attribution.ts ATTRIBUTION_STORAGE_KEY 와 동일해야 한다. */
  var STORAGE_KEY = "classinkr.leadAttribution.v1";

  // 정적 랜딩은 React의 동의 구독을 사용하지 않는다. 실제 Cookie Store 구독에 성공한 탭만
  // 서버 전환에 관찰 능력을 알린다. 철회/선택 변경이 오면 태그는 보수적으로 즉시 끈다.
  var observedStore = null;
  function denyOptionalTags() {
    try {
      if (typeof window.gtag === "function") window.gtag("consent", "update", {
        analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied"
      });
    } catch (error) {}
    try { if (typeof window.fbq === "function") window.fbq("consent", "revoke"); } catch (error) {}
    try { window.localStorage.removeItem(STORAGE_KEY); } catch (error) {}
  }
  try {
    var store = window.cookieStore;
    if (store && typeof store.addEventListener === "function" && typeof store.removeEventListener === "function") {
      store.addEventListener("change", function (event) {
        var changed = (event.changed || []).concat(event.deleted || []);
        if (changed.some(function (cookie) { return ["cln_consent", "cln_revoke_a", "cln_revoke_m"].indexOf(cookie.name) !== -1; })) denyOptionalTags();
      });
      observedStore = store;
    }
  } catch (error) {
    observedStore = null;
  }
  window.classinConsentObservationHeaders = function () {
    try {
      if (!observedStore || window.cookieStore !== observedStore || !window.navigator.locks || !window.crypto || typeof window.crypto.randomUUID !== "function") return {};
      var probe = "classin.consent.static.probe";
      window.localStorage.setItem(probe, "1");
      window.localStorage.removeItem(probe);
      return { "X-Classin-Consent-Observation": "cookie-store-v1" };
    } catch (error) {
      return {};
    }
  };

  // 정적 페이지의 광고 귀속 저장 및 전송은 안전한 동의 확인이 마련될 때까지 중단한다.
})();
