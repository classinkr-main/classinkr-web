/* ClassIn 원장 노트 — 덱 런타임: 화면 맞춤 축소, 넘기기, 자가진단 점수, 계산표, 복사. */
(function () {
  "use strict";
  var doc = document, deck = doc.querySelector(".deck");
  if (!deck) return;
  var frames = Array.prototype.slice.call(doc.querySelectorAll(".frame"));
  var slug = deck.getAttribute("data-slug") || "deck";
  var KEY = "classin-lm:" + slug;
  var state = { c: {}, w: {}, f: {} };
  try { var raw = localStorage.getItem(KEY); if (raw) { var p = JSON.parse(raw); if (p && typeof p === "object") { state.c = p.c || {}; state.w = p.w || {}; state.f = p.f || {}; } } } catch {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }

  var params = new URLSearchParams(location.search);
  var mode = params.get("mode") || (matchMedia("(max-width: 900px)").matches ? "scroll" : "present");
  var cur = 0;
  var hashN = parseInt((location.hash || "").replace("#", ""), 10);
  if (hashN > 0 && hashN <= frames.length) cur = hashN - 1;

  var progress = doc.querySelector(".progress");
  var countEl = doc.querySelector(".ui .count");
  var toast = doc.querySelector(".toast");
  function showToast(msg) { if (!toast) return; toast.textContent = msg; toast.classList.add("on"); clearTimeout(showToast.t); showToast.t = setTimeout(function () { toast.classList.remove("on"); }, 1800); }

  function fit() {
    if (mode === "present") {
      var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      deck.style.setProperty("--s", String(s));
    } else {
      var w = frames[0] ? frames[0].clientWidth : window.innerWidth;
      deck.style.setProperty("--s", String(w / 1920));
    }
  }
  function setMode(m) {
    mode = m;
    doc.body.classList.toggle("mode-present", m === "present");
    doc.body.classList.toggle("mode-scroll", m === "scroll");
    fit();
    if (m === "present") go(cur, true); else if (frames[cur]) frames[cur].scrollIntoView({ block: "start" });
  }
  function go(n, silent) {
    n = Math.max(0, Math.min(frames.length - 1, n));
    if (mode === "present") {
      frames.forEach(function (f, i) { f.classList.toggle("on", i === n); f.setAttribute("aria-hidden", i === n ? "false" : "true"); });
    }
    cur = n;
    if (countEl) countEl.textContent = String(n + 1).padStart(2, "0") + " / " + String(frames.length).padStart(2, "0");
    if (progress) progress.style.width = ((n + 1) / frames.length * 100) + "%";
    if (!silent && history.replaceState) history.replaceState(null, "", "#" + (n + 1));
  }
  doc.addEventListener("keydown", function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (mode !== "present") return;
    var k = e.key;
    if (k === "ArrowRight" || k === "PageDown" || k === " " || k === "ArrowDown") { e.preventDefault(); go(cur + 1); }
    else if (k === "ArrowLeft" || k === "PageUp" || k === "ArrowUp") { e.preventDefault(); go(cur - 1); }
    else if (k === "Home") go(0); else if (k === "End") go(frames.length - 1);
  });
  var tx = null;
  doc.addEventListener("touchstart", function (e) { if (mode === "present" && e.touches.length === 1) tx = e.touches[0].clientX; }, { passive: true });
  doc.addEventListener("touchend", function (e) { if (tx === null) return; var dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 50) go(cur + (dx < 0 ? 1 : -1)); });
  window.addEventListener("resize", fit);
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (mode === "scroll" && en.isIntersecting) { var i = frames.indexOf(en.target); if (i >= 0) go(i, true); } }); }, { threshold: 0.55 });
    frames.forEach(function (f) { io.observe(f); });
  }
  doc.querySelectorAll("[data-act]").forEach(function (b) {
    b.addEventListener("click", function () {
      var a = b.getAttribute("data-act");
      if (a === "prev") go(cur - 1); else if (a === "next") go(cur + 1);
      else if (a === "mode") setMode(mode === "present" ? "scroll" : "present");
      else if (a === "print") window.print();
      else if (a === "reset") { state = { c: {}, w: {}, f: {} }; save(); applyAll(); showToast("체크와 입력을 모두 지웠습니다"); }
    });
  });

  /* ── 자가진단 ── */
  var checks = Array.prototype.slice.call(doc.querySelectorAll(".chk[data-item]"));
  var secs = JSON.parse((doc.getElementById("lm-data") || {}).textContent || "{}");
  checks.forEach(function (b) {
    b.addEventListener("click", function () {
      var id = b.getAttribute("data-item");
      state.c[id] = !state.c[id];
      save(); applyChecks();
    });
  });
  var flags = Array.prototype.slice.call(doc.querySelectorAll(".flag[data-flag]"));
  flags.forEach(function (b) {
    b.addEventListener("click", function () { var id = b.getAttribute("data-flag"); state.f[id] = !state.f[id]; save(); applyFlags(); });
  });
  function flagTexts() {
    return flags.filter(function (b) { return state.f[b.getAttribute("data-flag")]; }).map(function (b) { var t = b.querySelector(".t"); return t ? t.textContent : ""; });
  }
  function applyFlags() {
    flags.forEach(function (b) { b.setAttribute("aria-pressed", state.f[b.getAttribute("data-flag")] ? "true" : "false"); });
    var list = doc.querySelector("[data-flag-list]");
    if (list) {
      var ts = flagTexts();
      list.innerHTML = ts.length ? ts.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") : '<li class="empty">' + esc(list.getAttribute("data-empty") || "") + "</li>";
    }
  }
  function bandFor(total) {
    var bands = secs.bands || [];
    for (var i = 0; i < bands.length; i++) if (total >= bands[i].min && total <= bands[i].max) return i;
    return bands.length ? bands.length - 1 : -1;
  }
  function applyChecks() {
    var total = 0, per = {};
    checks.forEach(function (b) {
      var id = b.getAttribute("data-item"), on = !!state.c[id], sec = b.getAttribute("data-sec");
      b.setAttribute("aria-pressed", on ? "true" : "false");
      per[sec] = per[sec] || 0; if (on) { per[sec]++; total++; }
    });
    doc.querySelectorAll("[data-sec-count]").forEach(function (el) { el.textContent = per[el.getAttribute("data-sec-count")] || 0; });
    doc.querySelectorAll("[data-sec-bar]").forEach(function (el) {
      var s = el.getAttribute("data-sec-bar"), n = (secs.sections && secs.sections[s]) ? secs.sections[s].n : 1;
      el.style.width = Math.round(((per[s] || 0) / n) * 100) + "%";
    });
    var max = secs.max || checks.length || 1;
    var answered = Object.keys(state.c).filter(function (k) { return state.c[k]; }).length;
    doc.querySelectorAll("[data-total]").forEach(function (el) { el.textContent = total; });
    var bi = bandFor(total), band = (secs.bands || [])[bi];
    doc.querySelectorAll(".band-bar i, .band-list li").forEach(function (el) { el.classList.toggle("on", answered > 0 && Number(el.getAttribute("data-band")) === bi); });
    var nb = (secs.bands || []).length || 1;
    doc.querySelectorAll(".marker").forEach(function (m) {
      var pos = (total / max) * 100;
      if (band) pos = ((bi + (total - band.min + 0.5) / (band.max - band.min + 1)) / nb) * 100;
      m.style.left = Math.max(0, Math.min(100, pos)) + "%";
      m.classList.toggle("hidden", answered === 0);
      var t = m.querySelector("[data-total]"); if (t) t.textContent = total;
    });
    doc.querySelectorAll("[data-band-label]").forEach(function (el) {
      el.textContent = answered === 0 ? (el.getAttribute("data-empty") || "아직 체크하지 않았습니다") : (band ? band.label : "");
      el.classList.toggle("muted", answered === 0);
    });
    doc.querySelectorAll("[data-band-desc]").forEach(function (el) { el.textContent = answered === 0 ? (el.getAttribute("data-empty") || "") : (band ? band.desc : ""); });
    doc.querySelectorAll("[data-band-next]").forEach(function (el) { el.textContent = answered === 0 ? (el.getAttribute("data-empty") || "") : (band && band.next ? band.next : ""); });
    // 영역별 막대 + 먼저 손볼 곳
    var order = Object.keys(secs.sections || {}).map(function (k) { var s = secs.sections[k]; return { k: k, r: (per[k] || 0) / s.n, s: s }; });
    if (secs.staged) {
      // 단계형 자료: 아직 다 채우지 못한 단계를 앞 단계부터 권한다.
      order.sort(function (a, b) { return Number(a.k) - Number(b.k); });
      var open = order.filter(function (o) { return o.r < 1; });
      order = open.concat(order.filter(function (o) { return o.r >= 1; }));
    } else {
      order.sort(function (a, b) { return a.r - b.r || Number(a.k) - Number(b.k); });
    }
    doc.querySelectorAll("[data-sub-bar]").forEach(function (el) {
      var k = el.getAttribute("data-sub-bar"), s = secs.sections[k];
      el.style.width = Math.round(((per[k] || 0) / s.n) * 100) + "%";
    });
    doc.querySelectorAll("[data-sub-num]").forEach(function (el) { var k = el.getAttribute("data-sub-num"); el.textContent = (per[k] || 0) + "/" + secs.sections[k].n; });
    var fixList = doc.querySelector("[data-fix-list]");
    if (fixList) {
      var html = "";
      if (order.length === 1) {
        var only = order[0], picked = [];
        for (var q = 0; q < only.s.items.length && picked.length < 3; q++) { if (!state.c[only.k + "-" + q]) picked.push(only.s.items[q]); }
        if (!picked.length) picked.push("모든 칸을 채웠습니다. 다음 장의 실행 플랜으로 넘어가세요.");
        picked.forEach(function (t, i) { html += '<li><span class="num">' + String(i + 1).padStart(2, "0") + '</span><div><b>' + esc(only.s.title) + '</b><p>' + esc(t) + "</p></div></li>"; });
        fixList.innerHTML = html;
        fixList.setAttribute("data-ready", answered ? "1" : "0");
        fixList.classList.toggle("is-empty", answered === 0);
        return;
      }
      order.slice(0, 3).forEach(function (o, i) {
        var firstOpen = null;
        for (var j = 0; j < o.s.items.length; j++) { if (!state.c[o.k + "-" + j]) { firstOpen = o.s.items[j]; break; } }
        html += '<li><span class="num">' + String(i + 1).padStart(2, "0") + '</span><div><b>' + esc(o.s.title) + '</b><p>' + esc(firstOpen || "이 영역은 모두 체크했습니다. 다음 영역으로 넘어가세요.") + "</p></div></li>";
      });
      fixList.innerHTML = html;
      fixList.setAttribute("data-ready", answered ? "1" : "0");
      fixList.classList.toggle("is-empty", answered === 0);
    }
    doc.querySelectorAll("[data-weak3]").forEach(function (box) {
      var h = "";
      order.slice(0, 3).forEach(function (o, i) {
        h += '<div class="w"><div class="k">약한 영역 ' + (i + 1) + '</div><div class="v">' + esc(o.s.title) + '</div><div class="n">' + (answered ? (per[o.k] || 0) + " / " + o.s.n : "- / " + o.s.n) + "</div></div>";
      });
      box.innerHTML = h;
    });
    var weakEl = doc.querySelector("[data-weak]");
    if (weakEl && order.length) weakEl.textContent = answered === 0 ? "체크 후에 나타납니다" : order[0].s.title;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ── 결과 복사 ── */
  doc.querySelectorAll("[data-copy-result]").forEach(function (b) {
    b.addEventListener("click", function () {
      var total = checks.filter(function (c) { return state.c[c.getAttribute("data-item")]; }).length;
      var bi = bandFor(total), band = (secs.bands || [])[bi];
      var per = {}; checks.forEach(function (c) { var s = c.getAttribute("data-sec"); per[s] = (per[s] || 0) + (state.c[c.getAttribute("data-item")] ? 1 : 0); });
      var lines = ["[" + (secs.title || "") + "] 자가진단 결과", "총점 " + total + " / " + (secs.max || checks.length) + (band ? " · " + band.label : "")];
      Object.keys(secs.sections || {}).forEach(function (k) { lines.push("- " + secs.sections[k].title + ": " + (per[k] || 0) + "/" + secs.sections[k].n); });
      copyText(lines.join("\n"), "결과를 복사했습니다. 상담 메신저에 붙여 넣으세요");
    });
  });
  doc.querySelectorAll("[data-copy-sheet]").forEach(function (b) {
    b.addEventListener("click", function () {
      var total = checks.filter(function (c) { return state.c[c.getAttribute("data-item")]; }).length;
      var bi = bandFor(total), band = (secs.bands || [])[bi];
      var lines = ["[" + (secs.title || "") + "] 상담용 요약", "총점 " + total + " / " + (secs.max || checks.length) + (band && total ? " · " + band.label : "")];
      var fx = doc.querySelectorAll("[data-fix-list] li");
      if (fx.length) { lines.push("먼저 손볼 곳"); fx.forEach(function (li) { var bb = li.querySelector("b"), pp = li.querySelector("p"); lines.push("- " + (bb ? bb.textContent : "") + ": " + (pp ? pp.textContent : "")); }); }
      var ft = flagTexts();
      if (ft.length) { lines.push("체크한 레드 플래그"); ft.forEach(function (t) { lines.push("- " + t); }); }
      var pr = doc.querySelectorAll(".cs-prep li");
      if (pr.length) { lines.push("상담 때 가져갈 것"); pr.forEach(function (li) { lines.push("- " + li.textContent); }); }
      copyText(lines.join("\n"), "요약을 복사했습니다. 실장님께 메신저로 붙여 넣으세요");
    });
  });
  doc.querySelectorAll("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () { var t = doc.getElementById(b.getAttribute("data-copy")); if (t) copyText(t.getAttribute("data-text") || t.textContent, "문구를 복사했습니다"); });
  });
  function copyText(text, msg) {
    function fallback() { var ta = doc.createElement("textarea"); ta.value = text; doc.body.appendChild(ta); ta.select(); try { doc.execCommand("copy"); showToast(msg); } catch { showToast("복사하지 못했습니다. 길게 눌러 직접 복사해 주세요"); } doc.body.removeChild(ta); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { showToast(msg); }, fallback); else fallback();
  }

  /* ── 계산표 ── */
  var inputs = Array.prototype.slice.call(doc.querySelectorAll("[data-w]"));
  inputs.forEach(function (inp) {
    inp.addEventListener("input", function () { state.w[inp.getAttribute("data-w")] = inp.value; save(); calc(); });
  });
  function num(v) { var n = parseFloat(String(v || "").replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; }
  function calc() {
    inputs.forEach(function (inp) { var v = state.w[inp.getAttribute("data-w")]; if (v !== undefined && inp.value !== v) inp.value = v; });
    var rows = doc.querySelectorAll("tr[data-diff]"), sumA = 0, sumB = 0, sumD = 0, any = false;
    rows.forEach(function (tr) {
      var a = tr.querySelector("[data-col='0']"), b = tr.querySelector("[data-col='1']"), out = tr.querySelector("output");
      if (!a || !b || !out) return;
      var av = num(a.value), bv = num(b.value);
      if (a.value || b.value) any = true;
      sumA += av; sumB += bv; var d = Math.max(0, av - bv); sumD += d;
      out.textContent = (a.value || b.value) ? fmt(d) : "-";
    });
    doc.querySelectorAll("[data-sum='0']").forEach(function (el) { el.textContent = any ? fmt(sumA) : "-"; });
    doc.querySelectorAll("[data-sum='1']").forEach(function (el) { el.textContent = any ? fmt(sumB) : "-"; });
    doc.querySelectorAll("[data-sum='d']").forEach(function (el) { el.textContent = any ? fmt(sumD) : "-"; });
    var teachers = num((doc.querySelector("[data-w='teachers']") || {}).value) || 0;
    var unit = (doc.querySelector("[data-unit]") || {}).getAttribute ? doc.querySelector("[data-unit]").getAttribute("data-unit") : "min";
    var weeklyH = unit === "min" ? sumD / 60 : sumD;
    var month = weeklyH * teachers * 4.3, year = month * 12;
    doc.querySelectorAll("[data-month]").forEach(function (el) { el.textContent = any && teachers ? fmt(month) : "-"; });
    doc.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = any && teachers ? fmt(year) : "-"; });
    doc.querySelectorAll("[data-days]").forEach(function (el) { el.textContent = any && teachers ? fmt(year / 8) : "-"; });
  }
  function fmt(n) { return Math.round(n).toLocaleString("ko-KR"); }

  function applyAll() { applyChecks(); applyFlags(); calc(); }
  applyAll();
  setMode(mode);
  go(cur, true);
})();
