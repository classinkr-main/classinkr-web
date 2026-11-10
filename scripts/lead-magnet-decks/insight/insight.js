/* ClassIn Insight 덱 런타임: 화면 맞춤·넘기기, 퀴즈 채점, 템플릿 입력·요약, 복사. */
(function () {
  "use strict";
  var doc = document, deck = doc.querySelector(".deck");
  if (!deck) return;
  var frames = Array.prototype.slice.call(doc.querySelectorAll(".frame"));
  var KEY = "classin-insight:" + (deck.getAttribute("data-slug") || "deck");
  var state = { q: {}, f: {}, c: {} };
  try { var raw = localStorage.getItem(KEY); if (raw) { var p = JSON.parse(raw); state.q = p.q || {}; state.f = p.f || {}; state.c = p.c || {}; } } catch {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
  var params = new URLSearchParams(location.search);
  var mode = params.get("mode") || (matchMedia("(max-width: 900px)").matches ? "scroll" : "present");
  var cur = 0, hn = parseInt((location.hash || "").slice(1), 10);
  if (hn > 0 && hn <= frames.length) cur = hn - 1;
  var progress = doc.querySelector(".progress"), countEl = doc.querySelector(".ui .count"), toast = doc.querySelector(".toast");
  function say(m) { if (!toast) return; toast.textContent = m; toast.classList.add("on"); clearTimeout(say.t); say.t = setTimeout(function () { toast.classList.remove("on"); }, 1800); }
  function fit() {
    if (mode === "present") deck.style.setProperty("--s", String(Math.min(innerWidth / 1920, innerHeight / 1080)));
    else deck.style.setProperty("--s", String((frames[0] ? frames[0].clientWidth : innerWidth) / 1920));
  }
  function setMode(m) { mode = m; doc.body.classList.toggle("mode-present", m === "present"); doc.body.classList.toggle("mode-scroll", m === "scroll"); fit(); if (m === "present") go(cur, true); }
  function go(n, silent) {
    n = Math.max(0, Math.min(frames.length - 1, n));
    if (mode === "present") frames.forEach(function (f, i) { f.classList.toggle("on", i === n); });
    cur = n;
    if (countEl) countEl.textContent = String(n + 1).padStart(2, "0") + " / " + String(frames.length).padStart(2, "0");
    if (progress) progress.style.width = ((n + 1) / frames.length * 100) + "%";
    if (!silent && history.replaceState) history.replaceState(null, "", "#" + (n + 1));
  }
  doc.addEventListener("keydown", function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (mode !== "present") return;
    if (["ArrowRight", "PageDown", " ", "ArrowDown"].indexOf(e.key) >= 0) { e.preventDefault(); go(cur + 1); }
    else if (["ArrowLeft", "PageUp", "ArrowUp"].indexOf(e.key) >= 0) { e.preventDefault(); go(cur - 1); }
  });
  var tx = null;
  doc.addEventListener("touchstart", function (e) { if (mode === "present" && e.touches.length === 1) tx = e.touches[0].clientX; }, { passive: true });
  doc.addEventListener("touchend", function (e) { if (tx === null) return; var dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 50) go(cur + (dx < 0 ? 1 : -1)); });
  addEventListener("resize", fit);
  addEventListener("hashchange", function () { var h = parseInt((location.hash || "").slice(1), 10); if (h > 0 && h <= frames.length && h - 1 !== cur) go(h - 1, true); });
  doc.querySelectorAll("[data-act]").forEach(function (b) {
    b.addEventListener("click", function () {
      var a = b.getAttribute("data-act");
      if (a === "prev") go(cur - 1); else if (a === "next") go(cur + 1);
      else if (a === "mode") setMode(mode === "present" ? "scroll" : "present");
      else if (a === "print") print();
      else if (a === "reset") { state = { q: {}, f: {}, c: {} }; save(); applyAll(); say("입력과 선택을 모두 지웠습니다"); }
    });
  });
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function copyText(t, m) {
    function fb() { var ta = doc.createElement("textarea"); ta.value = t; doc.body.appendChild(ta); ta.select(); try { doc.execCommand("copy"); say(m); } catch { say("복사하지 못했습니다. 길게 눌러 직접 복사해 주세요"); } doc.body.removeChild(ta); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { say(m); }, fb); else fb();
  }
  doc.querySelectorAll("[data-copy]").forEach(function (b) { b.addEventListener("click", function () { var el = doc.getElementById(b.getAttribute("data-copy")); if (el) copyText(el.getAttribute("data-text") || el.innerText, "문구를 복사했습니다"); }); });

  /* ── 퀴즈 ── */
  var meta = JSON.parse((doc.getElementById("ins-data") || {}).textContent || "{}");
  doc.querySelectorAll(".opt[data-q]").forEach(function (b) {
    b.addEventListener("click", function () {
      state.q[b.getAttribute("data-q")] = b.getAttribute("data-t"); save(); applyQuiz();
      if (mode === "present") setTimeout(function () { go(cur + 1); }, 260);
    });
  });
  function applyQuiz() {
    if (!meta.quiz) return;
    doc.querySelectorAll(".opt[data-q]").forEach(function (b) { b.setAttribute("aria-pressed", state.q[b.getAttribute("data-q")] === b.getAttribute("data-t") ? "true" : "false"); });
    var counts = {}, answered = 0;
    meta.quiz.types.forEach(function (t) { counts[t.key] = 0; });
    Object.keys(state.q).forEach(function (k) { if (k.indexOf("#") < 0 && counts[state.q[k]] !== undefined) { counts[state.q[k]]++; answered++; } });
    var top = meta.quiz.types.slice().sort(function (a, b) { return counts[b.key] - counts[a.key]; })[0];
    doc.querySelectorAll("[data-qprog]").forEach(function (el) { el.textContent = answered + " / " + meta.quiz.n; });
    doc.querySelectorAll("[data-rbar]").forEach(function (el) { var k = el.getAttribute("data-rbar"); el.style.width = (answered ? counts[k] / answered * 100 : 0) + "%"; });
    doc.querySelectorAll("[data-rval]").forEach(function (el) { var k = el.getAttribute("data-rval"); el.textContent = answered ? Math.round(counts[k] / answered * 100) + "%" : "-"; });
    var slide = doc.querySelector(".result");
    if (!answered) { doc.querySelectorAll("[data-r]").forEach(function (el) { el.innerHTML = el.getAttribute("data-empty") || ""; }); if (slide) slide.style.removeProperty("--tc"); return; }
    doc.querySelectorAll("[data-r]").forEach(function (el) { var f = el.getAttribute("data-r"); if (top[f] !== undefined) el.innerHTML = top[f]; });
    if (slide) slide.style.setProperty("--tc", top.color);
  }
  doc.querySelectorAll("[data-copy-quiz]").forEach(function (b) {
    b.addEventListener("click", function () {
      var counts = {}, n = 0; meta.quiz.types.forEach(function (t) { counts[t.key] = 0; });
      Object.keys(state.q).forEach(function (k) { if (counts[state.q[k]] !== undefined) { counts[state.q[k]]++; n++; } });
      if (!n) { say("문항을 먼저 골라 주세요"); return; }
      var top = meta.quiz.types.slice().sort(function (a, b) { return counts[b.key] - counts[a.key]; })[0];
      var lines = ["[" + meta.title + "] 결과: " + top.plain];
      meta.quiz.types.forEach(function (t) { lines.push("- " + t.plain + " " + Math.round(counts[t.key] / n * 100) + "%"); });
      copyText(lines.join("\n"), "결과를 복사했습니다");
    });
  });

  /* ── 템플릿 입력 ── */
  var fields = Array.prototype.slice.call(doc.querySelectorAll("[data-f]"));
  fields.forEach(function (el) {
    el.addEventListener("input", function () { state.f[el.getAttribute("data-f")] = el.value; save(); applySummary(); });
  });
  doc.querySelectorAll(".chip2[data-c]").forEach(function (b) {
    b.addEventListener("click", function () { var k = b.getAttribute("data-c"); state.c[k] = !state.c[k]; save(); applyChips(); applySummary(); });
  });
  function applyFields() { fields.forEach(function (el) { var v = state.f[el.getAttribute("data-f")]; if (v !== undefined && el.value !== v) el.value = v; }); }
  function applyChips() { doc.querySelectorAll(".chip2[data-c]").forEach(function (b) { b.setAttribute("aria-pressed", state.c[b.getAttribute("data-c")] ? "true" : "false"); }); }
  function val(k) { return (state.f[k] || "").trim(); }
  function applySummary() {
    doc.querySelectorAll("[data-sum]").forEach(function (el) {
      var keys = el.getAttribute("data-sum").split(","), out = [];
      keys.forEach(function (k) {
        if (k.indexOf("chips:") === 0) { var pre = k.slice(6); Object.keys(state.c).forEach(function (c) { if (state.c[c] && c.indexOf(pre) === 0) out.push("· " + c.slice(pre.length + 1)); }); }
        else if (val(k)) out.push(val(k));
      });
      el.textContent = out.length ? out.join("\n") : (el.getAttribute("data-empty") || "아직 비어 있습니다");
      el.classList.toggle("empty", !out.length);
    });
  }
  doc.querySelectorAll("[data-copy-plan]").forEach(function (b) {
    b.addEventListener("click", function () {
      var lines = ["[" + meta.title + "] 한 장 요약"];
      doc.querySelectorAll(".sm").forEach(function (sm) { var k = sm.querySelector(".k"), v = sm.querySelector(".v"); if (k && v && !v.classList.contains("empty")) lines.push("■ " + k.textContent + "\n" + v.textContent); });
      copyText(lines.join("\n"), "계획 요약을 복사했습니다. 실장님·강사님께 공유하세요");
    });
  });
  function applyAll() { applyFields(); applyChips(); applySummary(); applyQuiz(); }
  applyAll(); setMode(mode); go(cur, true);
})();
