/**
 * 정적 랜딩(/l/*) 공용 유입 귀속 스크립트.
 *
 * ── 두 가지 일을 한다 ────────────────────────────────────────
 *  1) window.classinNaverAd()  — 네이버 n_* 묶음을 제출 payload 용으로 모은다.
 *  2) 페이지 로드 시 귀속을 **localStorage 에 남긴다**(아래가 핵심).
 *
 * ── (2)가 필요한 이유 ───────────────────────────────────────
 * 정적 랜딩은 React 번들을 안 쓰므로 lib/marketing-attribution.ts 의 영속화가 돌지 않는다.
 * 그래서 이런 이탈이 생긴다:
 *
 *   광고 클릭 → /l/enterprise?gclid=X&utm_source=google
 *            → 사용자가 '문의하기'를 눌러 /contact 로 이동
 *            → /contact 의 collectLeadAttribution() 은 URL 에도 localStorage 에도
 *              아무것도 못 찾는다 → 그 리드는 **출처 미상**이 된다.
 *
 * 랜딩은 대부분 /contact·/resources·/checkout 으로 나가는 링크를 달고 있으므로, 폼을
 * 랜딩에서 바로 채우지 않은 사람의 귀속이 통째로 증발했다. 여기서 같은 저장 키에 남겨
 * 본사이트가 이어받게 한다. 채널 구분 없이 전 채널(Google·Meta·네이버·MS·TikTok)에 적용된다.
 *
 * 저장 키·값 형태는 lib/marketing-attribution.ts 와 **정확히 같아야 한다** — 그쪽이 읽는다.
 *
 * ── 사용법 ──────────────────────────────────────────────────
 *   <script src="/l/attribution.js"></script>   ← 인라인 <script> 보다 먼저
 *   ...
 *   naverAd: window.classinNaverAd(),
 */
(function () {
  /** lib/marketing-attribution.ts ATTRIBUTION_STORAGE_KEY 와 동일해야 한다. */
  var STORAGE_KEY = "classinkr.leadAttribution.v1";

  /** URL 파라미터 → 저장 필드명. lib/marketing-attribution.ts 의 ATTRIBUTION_PARAM_MAP 사본. */
  var PARAM_MAP = {
    utm_source: "utmSource",
    utm_medium: "utmMedium",
    utm_campaign: "utmCampaign",
    utm_term: "utmTerm",
    utm_content: "utmContent",
    gclid: "gclid",
    fbclid: "fbclid",
    msclkid: "msclkid",
    ttclid: "ttclid",
  };

  /** 네이버 n_* — 키 목록 정본은 lib/naver-ad-params.ts. 서버가 목록 밖 키를 버리므로
   *  여기 목록이 뒤처져도 "덜 담기"만 하고 잘못된 값이 들어가지는 않는다. */
  var NAVER_KEYS = [
    "n_media",
    "n_query",
    "n_rank",
    "n_ad_group",
    "n_ad",
    "n_keyword_id",
    "n_keyword",
    "n_campaign_type",
    "n_contract",
    "n_ad_type",
  ];

  /** 한 값의 상한 — 클라이언트·서버 공통 500자 규약. */
  var MAX = 500;

  function params() {
    return new URLSearchParams(window.location.search);
  }

  function clean(raw) {
    if (typeof raw !== "string") return undefined;
    var value = raw.trim();
    return value ? value.slice(0, MAX) : undefined;
  }

  /**
   * 현재 URL 의 n_* 묶음. 값이 하나도 없으면 **null** — 빈 객체 {} 를 보내면 서버가
   * "네이버 유입인데 파라미터가 비었다"로 읽어 그 리드가 네이버로 잘못 귀속된다.
   */
  window.classinNaverAd = function () {
    try {
      var search = params();
      var out = {};
      var found = false;
      for (var i = 0; i < NAVER_KEYS.length; i++) {
        var value = clean(search.get(NAVER_KEYS[i]));
        if (value === undefined) continue;
        out[NAVER_KEYS[i]] = value;
        found = true;
      }
      return found ? out : null;
    } catch (error) {
      // 귀속 수집이 폼 제출을 막으면 안 된다 — 리드를 잃는 것보다 귀속을 잃는 게 낫다.
      return null;
    }
  };

  function readStored() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  /**
   * 이번 방문의 귀속을 저장된 값에 **병합**한다.
   * 덮어쓰지 않고 병합하는 이유: 이 랜딩에 파라미터가 없다고 해서 이전 방문의 귀속을
   * 지우면 안 된다(last-touch-wins 는 값이 실제로 있을 때만 적용한다 — React 쪽과 같은 규약).
   */
  function persist() {
    try {
      var search = params();
      var stored = readStored();
      var next = {};
      for (var key in stored) {
        if (Object.prototype.hasOwnProperty.call(stored, key)) next[key] = stored[key];
      }

      var touched = false;
      for (var param in PARAM_MAP) {
        if (!Object.prototype.hasOwnProperty.call(PARAM_MAP, param)) continue;
        var value = clean(search.get(param));
        if (value === undefined) continue;
        next[PARAM_MAP[param]] = value;
        touched = true;
      }

      var naverAd = window.classinNaverAd();
      if (naverAd) {
        next.naverAd = naverAd;
        touched = true;
      }

      var href = clean(window.location.href);
      // 첫 진입 경로는 한 번만 — React 쪽 `stored.landingPage ?? 현재 href` 와 같은 규칙.
      if (!next.landingPage && href) next.landingPage = href;
      if (href) next.currentPage = href;
      var referrer = clean(document.referrer);
      if (referrer) next.referrer = referrer;

      // 광고 파라미터가 하나도 없고 저장된 것도 없으면 굳이 쓰지 않는다(빈 레코드 방지).
      if (!touched && !next.landingPage) return;

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      // 사생활 보호 모드·저장 차단 등에서 throw 한다. 랜딩 동작을 막지 않는다.
    }
  }

  persist();
})();
