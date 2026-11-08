/*!
 * swarm-build.js — 정적 랜딩(/l/swarm-*) 시안용 "커서 군집이 페이지를 짓는" 연출 엔진.
 *
 * 아이디어 출처: Joel Califa 의 Swarm(https://califa.github.io/swarm-site/)과
 * 그 크롬 확장판 Swarm Rebuild(https://github.com/DhvanilPatel/swarm-cursors).
 * 두 원본 모두 라이선스가 없어 코드·커서 그림은 가져오지 않았다. 이 파일은 README 에 적힌
 * 동작(사각형 드래그 → 채움, 타이핑, 펜 선, ⌥ 복제)만 기준으로 처음부터 새로 짰다.
 *
 * ── 페이지 쪽 약속 ──────────────────────────────────────────────
 *  <head> 에 아래 두 가지를 둔다(첫 화면이 깜빡이지 않게).
 *    1) 동작 줄이기·?swarm=off 가 아니면 <html> 에 sb-on 을 붙이고, 4초 안에 엔진이
 *       못 뜨면 sb-on 을 떼는 안전 타이머(window.__sbFallback).
 *    2) .sb-on [data-build]:not(.sb-done){visibility:hidden}
 *  요소 표시:
 *    data-build="box"    십자 커서로 사각형을 끌어 그린 뒤 채움이 들어온다.
 *    data-build="media"  같은 드래그 뒤 이미지가 위에서 아래로 쓸려 나온다.
 *    data-build="text"   텍스트 상자를 끌고 I-빔으로 한 글자씩 친다(마크업 보존).
 *    data-build="line"   펜 도구로 시작점을 찍고 끝점까지 선을 늘린다.
 *    data-build="pop"    한 번 클릭하면 작은 부품이 튀어나온다.
 *    data-build="scene:이름"  페이지가 SwarmBuild.scene(이름, fn) 으로 등록한 연출.
 *    data-build-dup="묶음"   같은 묶음의 첫 요소가 원본, 나머지는 ⌥-드래그 복제 후 글자를 다시 친다.
 *    data-guide          text 앞에 세로 가이드선을 끌어온다.
 *    data-build-after="prev"  바로 앞(문서 순서) 부품이 끝난 뒤에 짓는다.
 *  자식은 가장 가까운 data-build 조상이 끝난 뒤에, 화면 근처에 왔을 때만 짓는다.
 *  window.SWARM_CONFIG = { agents: [{ name, tone }], speed, label } 로 커서를 정한다.
 *  tone: ink | accent | muted | paper
 */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  if (!root.classList.contains("sb-on")) return;
  clearTimeout(window.__sbFallback);

  var CFG = window.SWARM_CONFIG || {};
  var coarse = window.matchMedia("(pointer: coarse)").matches;
  var narrow = window.innerWidth < 720;
  var BASE_SPEED = CFG.speed || 1;
  var boost = 1;
  var ABORT = { abort: true };
  var gen = 0;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function spd() { return BASE_SPEED * boost; }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function linear(t) { return t; }
  function pageRect(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
  }
  function h(tag, cls, parent) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  // ── 스타일 ──────────────────────────────────────────────────────
  var css = [
    ".sb-layer{position:absolute;left:0;top:0;width:0;height:0;z-index:70;pointer-events:none;font-family:inherit}",
    ".sb-agent{position:absolute;left:0;top:0;will-change:transform;transition:opacity .4s ease}",
    ".sb-agent svg{position:absolute;left:0;top:0;overflow:visible;display:none}",
    ".sb-agent[data-mode=ptr] .sb-i-ptr,.sb-agent[data-mode=cross] .sb-i-cross,.sb-agent[data-mode=ibeam] .sb-i-ibeam,.sb-agent[data-mode=pen] .sb-i-pen,.sb-agent[data-mode=grab] .sb-i-ptr{display:block}",
    ".sb-agent .sb-i-ptr{transform-origin:2px 2px;transition:transform .09s ease}",
    ".sb-agent.is-press .sb-i-ptr{transform:scale(.86)}",
    ".sb-tag{position:absolute;left:15px;top:19px;white-space:nowrap;font-size:11px;line-height:1;font-weight:600;letter-spacing:0;padding:4px 7px 4px;border-radius:9999px;color:#FAFAF8;background:var(--sb-c);box-shadow:0 1px 2px rgba(17,17,16,.18),0 0 0 1px rgba(255,255,255,.14)}",
    ".sb-agent[data-tone=paper] .sb-tag{color:#111110;box-shadow:0 1px 2px rgba(17,17,16,.16),0 0 0 1px rgba(17,17,16,.12)}",
    ".sb-agent[data-mode=cross] .sb-tag,.sb-agent[data-mode=ibeam] .sb-tag,.sb-agent[data-mode=pen] .sb-tag{left:12px;top:12px}",
    ".sb-alt{position:absolute;left:14px;top:-16px;font-size:10px;font-weight:700;padding:2px 5px;border-radius:4px;background:#111110;color:#FAFAF8;display:none}",
    ".sb-agent.is-alt .sb-alt{display:block}",
    ".sb-mq{position:absolute;left:0;top:0;border:1px solid var(--sb-line,#0B7A52);background:rgba(17,17,16,.035);transition:opacity .25s ease}",
    ".sb-mq.is-thin{background:transparent;border-style:dashed}",
    ".sb-mq.is-ghost{border-style:dashed;background:rgba(11,122,82,.05)}",
    ".sb-badge{position:absolute;right:-1px;bottom:-22px;font-size:10.5px;line-height:1;font-weight:600;font-variant-numeric:tabular-nums;padding:4px 6px;border-radius:4px;background:var(--sb-line,#0B7A52);color:#FAFAF8;white-space:nowrap}",
    ".sb-h{position:absolute;width:6px;height:6px;background:#fff;border:1px solid var(--sb-line,#0B7A52)}",
    ".sb-caret{position:absolute;left:0;top:0;width:2px;background:var(--sb-line,#0B7A52);animation:sb-blink 1s steps(1) infinite}",
    "@keyframes sb-blink{50%{opacity:0}}",
    ".sb-guide{position:absolute;width:1px;background:var(--sb-line,#0B7A52);opacity:.9;transition:opacity .4s ease}",
    ".sb-anchor{position:absolute;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;background:#fff;border:1px solid var(--sb-line,#0B7A52);transition:opacity .3s ease}",
    ".sb-ghost{color:transparent!important;-webkit-text-fill-color:transparent!important}",
    ".sb-ctl{position:fixed;right:16px;bottom:16px;z-index:80;display:flex;align-items:center;gap:4px;padding:4px;border-radius:9999px;background:rgba(250,250,248,.92);box-shadow:0 0 0 1px rgba(17,17,16,.10),0 6px 24px -8px rgba(17,17,16,.25);font-size:12px;line-height:1;color:#31302E;-webkit-backdrop-filter:saturate(1.2) blur(6px);backdrop-filter:saturate(1.2) blur(6px)}",
    ".sb-ctl span{padding:0 8px 0 10px;font-weight:600;display:flex;align-items:center;gap:6px;white-space:nowrap}",
    ".sb-ctl span i{width:6px;height:6px;border-radius:50%;background:#0B7A52;display:inline-block}",
    ".sb-ctl.is-done span i{background:#8A857F}",
    ".sb-ctl button{all:unset;cursor:pointer;padding:7px 10px;border-radius:9999px;font-weight:600;color:#111110;white-space:nowrap}",
    ".sb-ctl button:hover{background:rgba(17,17,16,.06)}",
    ".sb-ctl button:focus-visible{outline:2px solid #0B7A52;outline-offset:1px}",
    "@media (pointer:coarse){.sb-ctl button{padding:12px 12px}.sb-tag{font-size:10px;padding:3px 6px}}",
    "@media (max-width:479px){.sb-ctl{right:12px;bottom:12px}.sb-ctl span{font-size:0;gap:0;padding:0 6px 0 10px}}",
  ].join("\n");
  var style = h("style");
  style.textContent = css;
  doc.head.appendChild(style);

  var layer = h("div", "sb-layer");
  layer.setAttribute("aria-hidden", "true");

  // ── 트윈 ────────────────────────────────────────────────────────
  var anims = [];
  function tween(dur, fn, ease) {
    return new Promise(function (res) {
      anims.push({ t0: performance.now(), dur: Math.max(16, dur), fn: fn, ease: ease || easeInOut, res: res });
    });
  }
  function wait(ms) { return tween(ms / spd(), function () {}, linear); }
  function flushAnims() {
    var list = anims;
    anims = [];
    list.forEach(function (a) { a.res(); });
  }

  // ── 커서 ────────────────────────────────────────────────────────
  var TONES = { ink: "#111110", accent: "#0B7A52", muted: "#615D59", paper: "#FAFAF8" };
  var SVG_NS = "http://www.w3.org/2000/svg";
  function icon(cls, w, hgt, inner) {
    var s = doc.createElementNS(SVG_NS, "svg");
    s.setAttribute("class", cls);
    s.setAttribute("width", w);
    s.setAttribute("height", hgt);
    s.setAttribute("viewBox", "0 0 " + w + " " + hgt);
    s.innerHTML = inner;
    return s;
  }
  function makeAgentEl(def) {
    var tone = TONES[def.tone] ? def.tone : "ink";
    var fill = TONES[tone];
    var edge = tone === "paper" ? "#111110" : "#FFFFFF";
    var el = h("div", "sb-agent");
    el.dataset.mode = "ptr";
    el.dataset.tone = tone;
    el.style.setProperty("--sb-c", fill);
    // 화살표: 끝점(2,2)이 좌표 원점이다.
    el.appendChild(icon("sb-i-ptr", 22, 26,
      '<path d="M2.5 2.2 L2.5 20.4 L7.1 16.2 L10.3 23.4 L13.6 22 L10.5 14.9 L16.8 14.9 Z" fill="' + fill +
      '" stroke="' + edge + '" stroke-width="1.6" stroke-linejoin="round"/>'));
    var cross = icon("sb-i-cross", 22, 22,
      '<path d="M0 -9V9M-9 0H9" stroke="' + edge + '" stroke-width="3.4" stroke-linecap="round"/>' +
      '<path d="M0 -9V9M-9 0H9" stroke="' + fill + '" stroke-width="1.4" stroke-linecap="round"/>');
    cross.setAttribute("viewBox", "-11 -11 22 22");
    cross.style.left = "-11px";
    cross.style.top = "-11px";
    el.appendChild(cross);
    var ibeam = icon("sb-i-ibeam", 14, 24,
      '<path d="M3 1.5h2.5c.8 0 1.5.5 1.5 1.5 0-1 .7-1.5 1.5-1.5H11M7 3v18M3 22.5h2.5c.8 0 1.5-.5 1.5-1.5 0 1 .7 1.5 1.5 1.5H11"' +
      ' fill="none" stroke="' + edge + '" stroke-width="3.2" stroke-linecap="round"/>' +
      '<path d="M3 1.5h2.5c.8 0 1.5.5 1.5 1.5 0-1 .7-1.5 1.5-1.5H11M7 3v18M3 22.5h2.5c.8 0 1.5-.5 1.5-1.5 0 1 .7 1.5 1.5 1.5H11"' +
      ' fill="none" stroke="' + fill + '" stroke-width="1.3" stroke-linecap="round"/>');
    ibeam.style.left = "-7px";
    ibeam.style.top = "-12px";
    el.appendChild(ibeam);
    // 펜: 펜촉 끝(0,0)이 좌표 원점이다.
    var pen = icon("sb-i-pen", 20, 20,
      '<path d="M1 1 L4.6 12.4 L9 14.6 L14.6 9 L12.4 4.6 Z" fill="' + fill + '" stroke="' + edge + '" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M9 14.6 L12 17.6 L17.6 12 L14.6 9" fill="' + fill + '" stroke="' + edge + '" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<circle cx="7.2" cy="7.2" r="1.4" fill="' + edge + '"/>');
    el.appendChild(pen);
    var tag = h("span", "sb-tag", el);
    tag.textContent = def.name || "";
    var alt = h("span", "sb-alt", el);
    alt.textContent = "⌥ 복제";
    return el;
  }

  function Agent(i, def, n) {
    this.i = i;
    this.n = n;
    this.def = def;
    this.el = makeAgentEl(def);
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.busy = false;
    this.manual = false;
    this.phase = Math.random() * Math.PI * 2;
    layer.appendChild(this.el);
  }
  Agent.prototype.render = function () {
    this.el.style.transform = "translate3d(" + this.x.toFixed(1) + "px," + this.y.toFixed(1) + "px,0)";
  };
  Agent.prototype.mode = function (m) { this.el.dataset.mode = m; };
  Agent.prototype.moveTo = function (x, y, opt) {
    var self = this;
    var sx = self.x, sy = self.y, dx = x - sx, dy = y - sy;
    var d = Math.sqrt(dx * dx + dy * dy);
    var dur = (opt && opt.dur) || clamp(170 + d * 0.5, 170, 1050);
    var bend = (Math.random() < 0.5 ? -1 : 1) * Math.min(70, d * 0.16);
    var nx = -dy / (d || 1), ny = dx / (d || 1);
    var cx = sx + dx / 2 + nx * bend, cy = sy + dy / 2 + ny * bend;
    self.manual = true;
    return tween(dur / spd(), function (e) {
      var u = 1 - e;
      self.x = u * u * sx + 2 * u * e * cx + e * e * x;
      self.y = u * u * sy + 2 * u * e * cy + e * e * y;
    });
  };
  Agent.prototype.press = function () {
    var el = this.el;
    el.classList.add("is-press");
    return wait(80);
  };
  Agent.prototype.release = function () { this.el.classList.remove("is-press"); };

  // ── 오버레이 부품 ───────────────────────────────────────────────
  var overlays = new Set();
  function marquee(opts) {
    var el = h("div", "sb-mq" + (opts && opts.thin ? " is-thin" : "") + (opts && opts.ghost ? " is-ghost" : ""), layer);
    var badge = null;
    if (!opts || opts.badge !== false) badge = h("span", "sb-badge", el);
    overlays.add(el);
    return {
      el: el,
      set: function (x, y, w, hh) {
        el.style.transform = "translate(" + x + "px," + y + "px)";
        el.style.width = Math.max(0, w) + "px";
        el.style.height = Math.max(0, hh) + "px";
        if (badge) badge.textContent = Math.round(w) + " × " + Math.round(hh);
      },
      handles: function () {
        [["0", "0"], ["100%", "0"], ["0", "100%"], ["100%", "100%"]].forEach(function (p) {
          var hd = h("span", "sb-h", el);
          hd.style.left = "calc(" + p[0] + " - 3.5px)";
          hd.style.top = "calc(" + p[1] + " - 3.5px)";
        });
      },
      out: function (delay) {
        setTimeout(function () {
          el.style.opacity = "0";
          setTimeout(function () { el.remove(); overlays.delete(el); }, 280);
        }, delay || 0);
      },
    };
  }
  function overlayEl(cls) {
    var el = h("div", cls, layer);
    overlays.add(el);
    el.drop = function (delay) {
      setTimeout(function () {
        el.style.opacity = "0";
        setTimeout(function () { el.remove(); overlays.delete(el); }, 420);
      }, delay || 0);
    };
    return el;
  }

  // ── 드러내기 ───────────────────────────────────────────────────
  function reveal(el, how) {
    el.classList.add("sb-done");
    if (!el.animate) return;
    var d = 300 / Math.sqrt(spd());
    if (how === "sweep") {
      el.animate([{ clipPath: "inset(0 0 100% 0)", opacity: 0.4 }, { clipPath: "inset(0 0 0% 0)", opacity: 1 }],
        { duration: d * 1.9, easing: "cubic-bezier(.2,.7,.2,1)" });
    } else if (how === "pop") {
      el.animate([{ opacity: 0, transform: "scale(.9)" }, { opacity: 1, transform: "scale(1)" }],
        { duration: d * 0.8, easing: "cubic-bezier(.2,.9,.3,1.3)" });
    } else if (how !== "none") {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: d, easing: "ease-out" });
    }
  }

  // ── 타이핑(마크업 보존: 아직 안 친 글자는 투명 span 으로 자리를 지킨다) ───
  var typings = new Set();
  function prepTyping(el) {
    var items = [];
    var walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var node;
    var list = [];
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.trim()) list.push(node);
    }
    var total = 0;
    list.forEach(function (n) {
      var full = n.nodeValue;
      var ghost = doc.createElement("span");
      ghost.className = "sb-ghost";
      ghost.textContent = full;
      n.nodeValue = "";
      n.parentNode.insertBefore(ghost, n.nextSibling);
      items.push({ node: n, full: full, ghost: ghost, start: total, shown: 0 });
      total += full.length;
    });
    var range = doc.createRange();
    var cur = 0;
    var T = {
      total: total,
      set: function (k) {
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          var n = clamp(k - it.start, 0, it.full.length);
          if (n !== it.shown) {
            it.node.nodeValue = it.full.slice(0, n);
            it.ghost.textContent = it.full.slice(n);
            it.shown = n;
          }
          if (n > 0) cur = i;
        }
      },
      caret: function () {
        var it = items[cur];
        if (!it) return null;
        var rects;
        if (it.ghost.firstChild && it.ghost.firstChild.nodeValue.length) {
          range.setStart(it.ghost.firstChild, 0);
          range.setEnd(it.ghost.firstChild, 1);
          rects = range.getClientRects();
          // 줄 끝 공백은 높이 0 사각형을 줄 수 있다 — 쓸 수 있는 첫 사각형을 고른다.
          for (var i = 0; i < rects.length; i++) if (rects[i].height > 0) return pageOf(rects[i], false);
        }
        if (it.node.nodeValue.length) {
          range.setStart(it.node, it.node.nodeValue.length - 1);
          range.setEnd(it.node, it.node.nodeValue.length);
          rects = range.getClientRects();
          if (rects.length) return pageOf(rects[rects.length - 1], true);
        }
        return null;
      },
      restore: function () {
        items.forEach(function (it) {
          it.node.nodeValue = it.full;
          if (it.ghost.parentNode) it.ghost.parentNode.removeChild(it.ghost);
        });
        typings.delete(T);
      },
    };
    typings.add(T);
    return T;
  }
  function pageOf(r, after) {
    return { x: (after ? r.right : r.left) + window.scrollX, y: r.top + window.scrollY, h: r.height };
  }

  async function typeIn(agent, el, G, opt) {
    var T = prepTyping(el);
    el.classList.add("sb-done");
    if (!T.total) { T.restore(); return; }
    if (agent) agent.mode("ibeam");
    var caret = overlayEl("sb-caret");
    var slow = opt && opt.slow;
    var per = slow ? 46 : 13;
    var dur = clamp(T.total * per, 240, (opt && opt.max) || (slow ? 2100 : 1500)) / spd();
    try {
      await tween(dur, function (e) {
        T.set(Math.round(e * T.total));
        var c = T.caret();
        if (!c) return;
        caret.style.transform = "translate(" + c.x + "px," + c.y + "px)";
        caret.style.height = c.h + "px";
        if (agent) { agent.x = c.x + 5; agent.y = c.y + c.h * 0.62; }
      }, linear);
      ok(G);
    } finally {
      T.restore();
      caret.remove();
      overlays.delete(caret);
    }
  }

  // ── 작업 ────────────────────────────────────────────────────────
  var tasks = [];
  var taskOf = new Map();
  function collect() {
    tasks = [];
    taskOf = new Map();
    var masters = {};
    doc.querySelectorAll("[data-build]").forEach(function (el, idx) {
      var t = { el: el, idx: idx, kind: el.getAttribute("data-build") || "box", state: "wait", parent: null, master: null, after: null, seen: 0 };
      if (el.getAttribute("data-build-after") === "prev" && idx > 0) t.after = tasks[idx - 1];
      tasks.push(t);
      taskOf.set(el, t);
      var dup = el.getAttribute("data-build-dup");
      if (dup) {
        if (masters[dup]) t.master = masters[dup];
        else masters[dup] = t;
      }
    });
    tasks.forEach(function (t) {
      var p = t.el.parentElement && t.el.parentElement.closest("[data-build]");
      if (p) t.parent = taskOf.get(p) || null;
    });
  }
  function ready(t) {
    return t.state === "wait" && (!t.parent || t.parent.state === "done") && (!t.master || t.master.state === "done") &&
      (!t.after || t.after.state === "done");
  }
  function finish(t) {
    if (t.state === "done") return;
    t.state = "done";
    t.el.classList.add("sb-done");
  }
  function ok(G) { if (G !== gen) throw ABORT; }

  async function doBox(a, t, G, how) {
    var el = t.el;
    var r = pageRect(el);
    if (r.w < 2 || r.h < 2) { reveal(el, "none"); return; }
    await a.moveTo(r.x, r.y); ok(G);
    a.mode("cross");
    await a.press(); ok(G);
    var m = marquee();
    var dur = clamp(200 + (r.w + r.h) * 0.32, 240, 880) / spd();
    await tween(dur, function (e) {
      var rr = pageRect(el);
      var w = rr.w * e, hh = rr.h * e;
      m.set(rr.x, rr.y, w, hh);
      a.x = rr.x + w;
      a.y = rr.y + hh;
    }); ok(G);
    a.release();
    reveal(el, how);
    m.out(how === "sweep" ? 220 : 60);
    await wait(90); ok(G);
  }

  async function doText(a, t, G) {
    var el = t.el;
    var r = pageRect(el);
    if (r.w < 2 || r.h < 2) { reveal(el, "none"); return; }
    var slow = /^H[1-3]$/.test(el.tagName) || el.hasAttribute("data-type-slow");
    var guide = null;
    if (el.hasAttribute("data-guide")) {
      await a.moveTo(r.x, Math.max(r.y - 60, window.scrollY + 8)); ok(G);
      await a.press(); ok(G);
      guide = overlayEl("sb-guide");
      var gy0 = r.y - 70, gy1 = r.y + r.h + 70;
      await tween(320 / spd(), function (e) {
        var rr = pageRect(el);
        guide.style.left = rr.x + "px";
        guide.style.top = gy0 + "px";
        guide.style.height = (gy1 - gy0) * e + "px";
        a.x = rr.x;
        a.y = gy0 + (gy1 - gy0) * e;
      }); ok(G);
      a.release();
    }
    await a.moveTo(r.x, r.y); ok(G);
    a.mode("cross");
    await a.press(); ok(G);
    var m = marquee({ thin: true, badge: false });
    await tween(clamp(150 + r.w * 0.22, 170, 420) / spd(), function (e) {
      var rr = pageRect(el);
      m.set(rr.x, rr.y, rr.w * e, rr.h * e);
      a.x = rr.x + rr.w * e;
      a.y = rr.y + rr.h * e;
    }); ok(G);
    a.release();
    try {
      await typeIn(a, el, G, { slow: slow });
    } finally {
      m.out(80);
      if (guide) guide.drop(500);
    }
  }

  async function doLine(a, t, G) {
    var el = t.el;
    var r = pageRect(el);
    if (r.w < 1 && r.h < 1) { reveal(el, "none"); return; }
    var vertical = r.h > r.w;
    var x0 = vertical ? r.x + r.w / 2 : r.x;
    var y0 = vertical ? r.y : r.y + r.h / 2;
    await a.moveTo(x0, y0); ok(G);
    a.mode("pen");
    await a.press(); ok(G);
    var s = overlayEl("sb-anchor");
    s.style.transform = "translate(" + x0 + "px," + y0 + "px)";
    el.classList.add("sb-done");
    var len = vertical ? r.h : r.w;
    var dur = clamp(220 + len * 0.42, 260, 900) / spd();
    try {
      await tween(dur, function (e) {
        var p = (100 - e * 100).toFixed(2) + "%";
        el.style.clipPath = vertical ? "inset(0 0 " + p + " 0)" : "inset(0 " + p + " 0 0)";
        a.x = vertical ? x0 : x0 + r.w * e;
        a.y = vertical ? y0 + r.h * e : y0;
      }); ok(G);
    } finally {
      el.style.clipPath = "";
      s.drop(250);
    }
    var eA = overlayEl("sb-anchor");
    eA.style.transform = "translate(" + a.x + "px," + a.y + "px)";
    eA.drop(250);
    a.release();
  }

  async function doPop(a, t, G) {
    var r = pageRect(t.el);
    if (r.w < 1 || r.h < 1) { reveal(t.el, "none"); return; }
    await a.moveTo(r.x + r.w * 0.5, r.y + r.h * 0.55); ok(G);
    await a.press(); ok(G);
    a.release();
    reveal(t.el, "pop");
    await wait(60); ok(G);
  }

  async function doDup(a, t, G) {
    var mEl = t.master.el;
    var el = t.el;
    var mr = pageRect(mEl);
    var tr = pageRect(el);
    if (tr.w < 2 || tr.h < 2) { reveal(el, "none"); return; }
    var gx = Math.min(mr.w * 0.5, 80), gy = Math.min(mr.h * 0.4, 36);
    await a.moveTo(mr.x + gx, mr.y + gy); ok(G);
    var sel = marquee({ badge: false });
    sel.set(mr.x, mr.y, mr.w, mr.h);
    sel.handles();
    a.el.classList.add("is-alt");
    await a.press(); ok(G);
    var ghost = marquee({ ghost: true });
    var dist = Math.hypot(tr.x - mr.x, tr.y - mr.y);
    try {
      await tween(clamp(220 + dist * 0.45, 280, 880) / spd(), function (e) {
        var x = lerp(mr.x, tr.x, e), y = lerp(mr.y, tr.y, e);
        var w = lerp(mr.w, tr.w, e), hh = lerp(mr.h, tr.h, e);
        ghost.set(x, y, w, hh);
        a.x = x + gx;
        a.y = y + gy;
      }); ok(G);
    } finally {
      a.release();
      a.el.classList.remove("is-alt");
      sel.out(0);
      ghost.out(40);
    }
    if (el.getAttribute("data-build-retype") === "off") { reveal(el); await wait(60); return; }
    // 복제본은 원본 글자를 지우고 제 글자를 다시 친다.
    if (el.animate) el.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 200 });
    await typeIn(a, el, G, { max: 700 });
  }

  var scenes = {};
  async function doScene(a, t, G, name) {
    var sc = scenes[name];
    if (!sc) { reveal(t.el); return; }
    await sc.run({
      el: t.el, agent: a, G: G, ok: function () { ok(G); },
      rect: pageRect, tween: tween, wait: wait, spd: spd, reveal: reveal, marquee: marquee,
      type: function (agent, el, opt) { return typeIn(agent, el, G, opt); },
      borrow: borrow, giveBack: giveBack, ease: { inOut: easeInOut, out: easeOut, linear: linear },
      overlay: overlayEl,
    });
  }

  async function run(a, t) {
    var G = gen;
    t.state = "run";
    a.busy = true;
    try {
      if (t.master) await doDup(a, t, G);
      else if (t.kind === "media") await doBox(a, t, G, "sweep");
      else if (t.kind === "text") await doText(a, t, G);
      else if (t.kind === "line") await doLine(a, t, G);
      else if (t.kind === "pop") await doPop(a, t, G);
      else if (t.kind.indexOf("scene:") === 0) await doScene(a, t, G, t.kind.slice(6));
      else await doBox(a, t, G, "fade");
    } catch (err) {
      if (err !== ABORT && window.console) console.warn("[swarm-build]", err);
    } finally {
      if (G === gen) {
        finish(t);
        a.busy = false;
        a.manual = false;
        a.release();
        a.mode("ptr");
        a.el.classList.remove("is-alt");
      }
    }
  }

  // ── 군집 ───────────────────────────────────────────────────────
  var agents = [];
  function spawn() {
    var defs = CFG.agents && CFG.agents.length ? CFG.agents : [{ name: "ClassIn", tone: "accent" }];
    var max = narrow ? Math.min(defs.length, CFG.mobileAgents || 5) : defs.length;
    defs = defs.slice(0, max);
    agents = defs.map(function (d, i) { return new Agent(i, d, defs.length); });
  }
  function borrow(n) {
    var got = [];
    agents.forEach(function (a) {
      if (got.length < n && !a.busy && !a.hidden) { a.busy = true; a.manual = true; got.push(a); }
    });
    return got;
  }
  function giveBack(list) {
    list.forEach(function (a) { a.busy = false; a.manual = false; a.mode("ptr"); a.release(); });
  }

  var mouse = null;
  if (!coarse) {
    window.addEventListener("mousemove", function (e) { mouse = { x: e.pageX, y: e.pageY, t: performance.now() }; }, { passive: true });
  }

  var status = "intro";
  var doneAt = 0;
  var lastSched = 0;
  var lastT = performance.now();

  function frontier() {
    // 아직 아무도 안 잡은 첫 작업 — 쉬는 커서가 그 근처(화면 안쪽으로 당겨서)에서 기다린다.
    for (var i = 0; i < tasks.length; i++) if (tasks[i].state === "wait") return { t: tasks[i], below: false };
    for (var j = 0; j < tasks.length; j++) if (tasks[j].state === "run") return { t: tasks[j], below: true };
    return null;
  }
  function pending() {
    for (var i = 0; i < tasks.length; i++) if (tasks[i].state !== "done") return true;
    return false;
  }

  function schedule(now) {
    var vh = window.innerHeight, sy = window.scrollY;
    var top = sy - 40, bottom = sy + vh + 60;
    var backlog = 0;
    var avail = [];
    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i];
      if (t.state !== "wait") continue;
      var r = pageRect(t.el);
      t.r = r;
      var visible = r.y < bottom && r.y + r.h > top;
      if (r.y + r.h < top && (!t.parent || t.parent.state === "done") && (!t.master || t.master.state === "done")) {
        // 이미 지나쳐 올라간 부분은 기다리게 하지 않는다.
        reveal(t.el, "none");
        finish(t);
        continue;
      }
      if (!ready(t) || !visible) continue;
      if (!t.seen) t.seen = now;
      // 오래 보이는데 아무도 못 잡은 작업은 바로 드러낸다(읽는 사람을 세워 두지 않는다).
      if (now - t.seen > 6500) { reveal(t.el); finish(t); continue; }
      backlog++;
      avail.push(t);
    }
    boost = clamp(1 + backlog / 7, 1, 2.6);
    if (!avail.length) return;
    agents.forEach(function (a) {
      if (a.busy || !avail.length) return;
      // 위에서부터, 앞쪽 셋 중 가장 가까운 것을 고른다.
      var best = 0, bestD = Infinity;
      for (var j = 0; j < Math.min(3, avail.length); j++) {
        var c = avail[j].r;
        var d = Math.hypot(c.x - a.x, c.y - a.y);
        if (d < bestD) { bestD = d; best = j; }
      }
      var t = avail.splice(best, 1)[0];
      run(a, t);
    });
  }

  function idleTarget(a, now) {
    var vw = window.innerWidth, vh = window.innerHeight, sy = window.scrollY;
    var ang = a.phase + now * 0.00035 + (a.i / a.n) * Math.PI * 2;
    if (status === "done" && mouse) {
      var rad = 46 + (a.i % 4) * 22;
      return { x: mouse.x + Math.cos(ang) * rad, y: mouse.y + Math.sin(ang) * rad * 0.7 };
    }
    var f = frontier();
    var fx = vw * 0.5, fy = sy + vh * 0.5;
    if (f) {
      var r = f.t.r || pageRect(f.t.el);
      fx = clamp(r.x + Math.min(r.w, 220) * 0.5, 60, vw - 120);
      // 짓는 중인 곳만 남았으면 그 아래에서, 아니면 다음 지을 곳 바로 위에서 기다린다.
      fy = clamp(f.below ? r.y + r.h + 36 : r.y - 18, sy + 90, sy + vh - 96);
    }
    // 다음 지을 곳 근처에 한 줄로 늘어서 기다린다(살짝 흔들리며).
    var spread = narrow ? 34 : 50;
    var off = (a.i - (a.n - 1) / 2) * spread;
    var bob = Math.sin(now * 0.0021 + a.phase) * 6;
    return { x: clamp(fx + off + 60, 24, vw - 90) + Math.cos(ang) * 6, y: fy + bob + (a.i % 2) * 14 };
  }

  function frame(now) {
    var dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    // 트윈
    if (anims.length) {
      var list = anims.slice();
      for (var i = 0; i < list.length; i++) {
        var an = list[i];
        var p = Math.min(1, (now - an.t0) / an.dur);
        try { an.fn(an.ease(p), p); } catch (e) { /* 요소가 사라진 경우 */ }
        if (p >= 1) {
          var k = anims.indexOf(an);
          if (k >= 0) anims.splice(k, 1);
          an.res();
        }
      }
    }
    if (status === "build" && now - lastSched > 110) {
      lastSched = now;
      schedule(now);
      if (!pending()) { status = "done"; doneAt = now; setStatus(); }
    }
    // 쉬는 커서: 스프링으로 기다릴 자리에 붙는다.
    agents.forEach(function (a) {
      if (!a.manual) {
        var tg = idleTarget(a, now);
        var ax = (tg.x - a.x) * 9 - a.vx * 5.2;
        var ay = (tg.y - a.y) * 9 - a.vy * 5.2;
        a.vx += ax * dt;
        a.vy += ay * dt;
        a.x += a.vx * dt;
        a.y += a.vy * dt;
      }
      a.render();
    });
    if (status === "done" && now - doneAt > (mouse ? 5200 : 1600) && !agents[0].hidden) {
      agents.forEach(function (a) { a.hidden = true; a.el.style.opacity = "0"; });
    }
    if (status === "done" && agents[0] && agents[0].hidden && !anims.length && now - doneAt > 7000) {
      looping = false;
      return;
    }
    requestAnimationFrame(frame);
  }
  var looping = false;
  function loop() {
    if (looping) return;
    looping = true;
    lastT = performance.now();
    requestAnimationFrame(frame);
  }

  // ── 시작·다시·건너뛰기 ─────────────────────────────────────────
  async function intro() {
    var G = gen;
    var vw = window.innerWidth, vh = window.innerHeight;
    var cx = vw * 0.5, cy = window.scrollY + vh * 0.42;
    agents.forEach(function (a, i) {
      a.manual = true;
      a.hidden = false;
      a.el.style.opacity = "1";
      var ang = (i / agents.length) * Math.PI * 2;
      a.x = cx + Math.cos(ang) * 4;
      a.y = cy + Math.sin(ang) * 4;
      a.vx = a.vy = 0;
    });
    await tween(900 / BASE_SPEED, function (e) {
      agents.forEach(function (a, i) {
        var ang = (i / agents.length) * Math.PI * 2 + e * 2.4;
        var rad = 8 + easeOut(e) * (narrow ? 70 : 120);
        a.x = cx + Math.cos(ang) * rad;
        a.y = cy + Math.sin(ang) * rad * 0.62;
      });
    }, linear);
    if (G !== gen) return;
    agents.forEach(function (a) { a.manual = false; });
    status = "build";
    setStatus();
  }

  function cleanOverlays() {
    typings.forEach(function (T) { T.restore(); });
    overlays.forEach(function (o) { o.remove(); });
    overlays.clear();
  }

  function stopAll() {
    gen++;
    flushAnims();
    cleanOverlays();
    agents.forEach(function (a) {
      a.busy = false;
      a.manual = false;
      a.release();
      a.mode("ptr");
      a.el.classList.remove("is-alt");
    });
  }

  function skip() {
    stopAll();
    tasks.forEach(function (t) {
      t.el.style.clipPath = "";
      finish(t);
    });
    Object.keys(scenes).forEach(function (k) { if (scenes[k].finish) scenes[k].finish(); });
    status = "done";
    doneAt = performance.now() - 4000;
    setStatus();
    loop();
  }

  function replay() {
    stopAll();
    Object.keys(scenes).forEach(function (k) { if (scenes[k].reset) scenes[k].reset(); });
    tasks.forEach(function (t) {
      t.state = "wait";
      t.seen = 0;
      t.el.style.clipPath = "";
      t.el.classList.remove("sb-done");
    });
    window.scrollTo({ top: 0, behavior: "auto" });
    status = "intro";
    setStatus();
    loop();
    intro();
  }

  // ── 조작 띠 ────────────────────────────────────────────────────
  var ctl, ctlLabel, ctlSkip;
  function controls() {
    if (CFG.controls === false) return;
    ctl = h("div", "sb-ctl");
    ctl.setAttribute("role", "group");
    ctl.setAttribute("aria-label", "페이지 짓기 연출");
    ctlLabel = h("span", "", ctl);
    var replayBtn = h("button", "", ctl);
    replayBtn.type = "button";
    replayBtn.textContent = "다시 짓기";
    replayBtn.addEventListener("click", replay);
    ctlSkip = h("button", "", ctl);
    ctlSkip.type = "button";
    ctlSkip.textContent = "바로 보기";
    ctlSkip.addEventListener("click", skip);
    doc.body.appendChild(ctl);
    setStatus();
  }
  function setStatus() {
    if (!ctl) return;
    var done = status === "done";
    ctl.classList.toggle("is-done", done);
    ctlLabel.innerHTML = "<i></i>" + (done ? "다 지었습니다" : (CFG.label || "커서들이 페이지를 짓는 중"));
    ctlSkip.style.display = done ? "none" : "";
  }

  // ── 공개 API ──────────────────────────────────────────────────
  window.SwarmBuild = {
    scene: function (name, run, hooks) {
      scenes[name] = { run: run, reset: hooks && hooks.reset, finish: hooks && hooks.finish };
    },
    replay: replay,
    skip: skip,
  };

  function boot() {
    if (CFG.scenes) {
      Object.keys(CFG.scenes).forEach(function (k) {
        var d = CFG.scenes[k];
        window.SwarmBuild.scene(k, d.run, d);
      });
    }
    doc.body.appendChild(layer);
    collect();
    spawn();
    controls();
    loop();
    // 페이지 스크립트가 scene 을 등록할 틈을 한 프레임 준다.
    requestAnimationFrame(function () { intro(); });
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
