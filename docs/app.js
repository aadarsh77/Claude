/* કાર્ય મેટ્રિક્સ — offline Eisenhower matrix with a vocabulary that learns.
   All data stays in this browser's localStorage. No network calls at runtime. */
(function () {
  "use strict";

  /* ============================================================
     Seed vocabulary, derived from the owner's own notebook pages
     dated 17, 18, 21 and 22 September 2026. Counts are how often a
     word appeared in each column of those four hand-drawn matrices:
     i = important, ni = not important, u = urgent, nu = not urgent.
     ============================================================ */
  var SEED_LEX = {
    "habit":{i:3,ni:0,u:3,nu:0}, "satisfaction":{i:3,ni:0,u:2,nu:1},
    "complain":{i:2,ni:0,u:1,nu:1}, "communication":{i:2,ni:0,u:2,nu:1},
    "communicate":{i:2,ni:0,u:1,nu:1}, "observation":{i:6,ni:0,u:3,nu:4},
    "class":{i:5,ni:0,u:2,nu:3}, "student":{i:4,ni:0,u:2,nu:2},
    "teacher":{i:3,ni:1,u:3,nu:1}, "meet":{i:4,ni:0,u:3,nu:1},
    "planner":{i:3,ni:0,u:2,nu:1}, "planning":{i:1,ni:0,u:0,nu:1},
    "timetable":{i:2,ni:2,u:2,nu:1}, "terminal":{i:1,ni:1,u:1,nu:1},
    "filter":{i:4,ni:0,u:3,nu:2}, "kishan":{i:2,ni:1,u:1,nu:2},
    "seth":{i:4,ni:0,u:2,nu:2}, "rr":{i:4,ni:0,u:2,nu:2},
    "audio":{i:1,ni:1,u:2,nu:0}, "uniform":{i:1,ni:0,u:1,nu:0},
    "presentation":{i:1,ni:0,u:1,nu:0}, "staff":{i:1,ni:0,u:1,nu:0},
    "payment":{i:1,ni:0,u:1,nu:0}, "parents":{i:1,ni:0,u:1,nu:0},
    "exam":{i:1,ni:0,u:0,nu:1}, "inform":{i:0,ni:1,u:1,nu:0},
    "card":{i:0,ni:1,u:1,nu:0}, "paper":{i:0,ni:1,u:1,nu:0},
    "generate":{i:0,ni:1,u:1,nu:0}, "follow":{i:0,ni:1,u:1,nu:0},
    "hindi":{i:0,ni:1,u:1,nu:0}, "discuss":{i:0,ni:1,u:1,nu:0},
    "visit":{i:2,ni:0,u:0,nu:2}, "factory":{i:2,ni:0,u:0,nu:2},
    "session":{i:1,ni:1,u:1,nu:1}, "parthpriti":{i:1,ni:0,u:1,nu:0},
    "krishnaben":{i:1,ni:0,u:0,nu:1}, "call":{i:1,ni:0,u:0,nu:1},
    "send":{i:2,ni:1,u:1,nu:2}, "list":{i:3,ni:0,u:2,nu:2},
    "make":{i:2,ni:0,u:1,nu:1}, "update":{i:1,ni:0,u:0,nu:1},
    "કબાટ":{i:1,ni:3,u:3,nu:2}, "ખાલી":{i:1,ni:3,u:3,nu:2},
    "પુસ્તકો":{i:2,ni:1,u:2,nu:1}, "પુસ્તક":{i:1,ni:1,u:1,nu:1},
    "ટ્રાન્સપોર્ટથી":{i:0,ni:1,u:1,nu:0}, "આયોજન":{i:1,ni:0,u:0,nu:1},
    "નવરાત્રી":{i:1,ni:0,u:0,nu:1}, "નવરાત્રીનું":{i:1,ni:0,u:0,nu:1},
    "વ્યવસ્થા":{i:1,ni:0,u:1,nu:0}, "સમિતિ":{i:0,ni:1,u:1,nu:0},
    "શિક્ષાલય":{i:0,ni:1,u:1,nu:0}, "અભિયાન":{i:1,ni:1,u:1,nu:1},
    "શાળા":{i:1,ni:1,u:1,nu:1}
  };

  var SEED_TEMPLATES = [
    "Class observation", "Teacher observation", "Student observation",
    "Habit list filter", "Satisfaction filter", "Complain filter",
    "Classwise planner બનાવવું", "Teacher meet"
  ];

  var QUADS = [
    {k:"do",       en:"Do now",   gu:"અત્યારે કરો",   axis:"અર્જન્ટ + ઇમ્પોર્ટન્ટ",     c:"var(--do)",    bg:"var(--do-bg)",    u:true,  i:true},
    {k:"schedule", en:"Schedule", gu:"સમય નક્કી કરો", axis:"ઇમ્પોર્ટન્ટ, તાકીદ નહીં",   c:"var(--sched)", bg:"var(--sched-bg)", u:false, i:true},
    {k:"delegate", en:"Delegate", gu:"સોંપી દો",      axis:"અર્જન્ટ, ઇમ્પોર્ટન્ટ નહીં", c:"var(--deleg)", bg:"var(--deleg-bg)", u:true,  i:false},
    {k:"drop",     en:"Drop",     gu:"કાઢી નાખો",     axis:"બેમાંથી એકેય નહીં",          c:"var(--drop)",  bg:"var(--drop-bg)",  u:false, i:false}
  ];
  var QBY = {}; QUADS.forEach(function (q) { QBY[q.k] = q; });

  var STOP = ("the to of a for and is in on at with from this that be do my me all an it as by or " +
    "ના ની નું નો ને માં થી છે અને કે પર એક આ તે માટે કરવું કરવા કરો નથી હતું છું હોય જ પણ તથા").split(" ");
  var STOPSET = {}; STOP.forEach(function (w) { STOPSET[w] = 1; });

  var URGENT_WORDS = /\b(today|tomorrow|now|asap|urgent|immediate|immediately|deadline|tonight)\b|આજ|કાલ|અત્યાર|તાત્કાલિક|તરત|જલદી|હમણાં/i;
  var TIME_RE = /(^|\s)([01]?\d|2[0-3])[:.][0-5]\d\s*(am|pm)?|\b\d{1,2}\s*(am|pm)\b/i;

  var K_TASKS = "kmx.tasks.v1", K_LEX = "kmx.lex.v1", K_TPL = "kmx.tpl.v1",
      K_THEME = "kmx.theme.v1", K_SEEDED = "kmx.seeded.v1";

  var S = { tasks:{}, lex:{}, templates:[], filter:"open", view:"matrix" };
  var deferredPrompt = null;

  function $(id) { return document.getElementById(id); }

  /* ---------------- storage ---------------- */
  function read(key, fb) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fb; }
    catch (e) { return fb; }
  }
  var warnedStorage = false;
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch (e) {
      if (!warnedStorage) { warnedStorage = true; toast("સેવ થઈ શક્યું નહીં — ફોનની સ્ટોરેજ ભરાઈ છે કે બ્લૉક છે."); }
    }
  }
  function saveTasks() { write(K_TASKS, S.tasks); }
  function saveLex() { write(K_LEX, S.lex); }

  /* ---------------- helpers ---------------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function ymd(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function todayStr() { return ymd(new Date()); }
  function shiftDay(n) { var d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }
  function parseDay(s) {
    if (!s) return null;
    var p = String(s).split("-");
    if (p.length !== 3) return null;
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function dayDiff(due, today) {
    var a = parseDay(due), b = parseDay(today);
    if (!a || !b) return null;
    return Math.round((a - b) / 86400000);
  }
  function dueLabel(due, today) {
    var d = dayDiff(due, today);
    if (d === null) return { txt:"", cls:"" };
    if (d < 0) return { txt:(-d) + " દિવસ મોડું", cls:"late" };
    if (d === 0) return { txt:"આજે", cls:"late" };
    if (d === 1) return { txt:"કાલે", cls:"soon" };
    if (d <= 3) return { txt:d + " દિવસમાં", cls:"soon" };
    var p = due.split("-");
    return { txt:p[2] + "/" + p[1], cls:"" };
  }
  function uid() { return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function tokenize(s) {
    var out = [];
    // \p{M} keeps Gujarati matras/anusvara attached; ZWJ/ZWNJ keep conjuncts intact.
    var parts = String(s || "").toLowerCase().replace(/[^\p{L}\p{N}\p{M}‌‍\s]/gu, " ").split(/\s+/);
    for (var i = 0; i < parts.length; i++) {
      var w = parts[i];
      if (w.length < 2) continue;
      if (STOPSET[w]) continue;
      if (/^\d+$/.test(w)) continue;
      out.push(w);
    }
    return out;
  }

  /* ---------------- classifier ---------------- */
  // Gujarati inflects by suffix (પુસ્તક / પુસ્તકો / પુસ્તકોની), so an exact
  // miss falls back to the longest stem the two words share from the start.
  function lookup(t) {
    var e = S.lex[t];
    if (e) return e;
    if (t.length < 4) return null;
    var best = null, bestLen = 0;
    for (var k in S.lex) {
      if (k.length < 4 || k.length <= bestLen) continue;
      if (t.indexOf(k) === 0 || k.indexOf(t) === 0) { best = S.lex[k]; bestLen = k.length; }
    }
    return best;
  }

  function evidence(toks, kA, kB) {
    var seen = {}, s = 0, hits = [];
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (seen[t]) continue;
      seen[t] = 1;
      var e = lookup(t);
      if (!e) continue;
      var a = e[kA] || 0, b = e[kB] || 0;
      if (a + b === 0) continue;
      var w = Math.log((a + 0.5) / (b + 0.5));
      if (Math.abs(w) < 0.15) continue;
      s += w;
      hits.push([t, w]);
    }
    hits.sort(function (x, y) { return Math.abs(y[1]) - Math.abs(x[1]); });
    return { s:s, hits:hits.slice(0, 4) };
  }

  function classify(task, today) {
    var toks = tokenize(task.text + " " + (task.who || ""));
    var I = evidence(toks, "i", "ni");
    var U = evidence(toks, "u", "nu");
    var important, iWhy, urgent, uWhy;

    if (task.fixI === true || task.fixI === false) {
      important = task.fixI;
      iWhy = "મહત્ત્વ: તમે જાતે નક્કી કર્યું";
    } else if (I.hits.length) {
      important = I.s > 0;
      iWhy = "મહત્ત્વ: શીખેલા શબ્દો — " + I.hits.map(function (h) { return h[0]; }).join(", ");
    } else {
      important = true;
      iWhy = "મહત્ત્વ: કોઈ પુરાવો નથી — ડિફૉલ્ટ ઇમ્પોર્ટન્ટ";
    }

    if (task.fixU === true || task.fixU === false) {
      urgent = task.fixU;
      uWhy = "તાકીદ: તમે જાતે નક્કી કર્યું";
    } else if (task.due) {
      var d = dayDiff(task.due, today);
      if (d !== null && d <= 1) {
        urgent = true;
        uWhy = "તાકીદ: તારીખ " + (d < 0 ? "વીતી ગઈ" : (d === 0 ? "આજની છે" : "કાલની છે"));
      } else if (d !== null && d >= 4) {
        urgent = false;
        uWhy = "તાકીદ: હજી " + d + " દિવસ બાકી";
      } else {
        urgent = U.hits.length ? U.s > 0 : false;
        uWhy = "તાકીદ: " + d + " દિવસ બાકી" + (U.hits.length ? " + શબ્દો " + U.hits.map(function (h) { return h[0]; }).join(", ") : "");
      }
    } else if (URGENT_WORDS.test(task.text) || TIME_RE.test(task.text)) {
      urgent = true;
      uWhy = "તાકીદ: લખાણમાં સમય કે તાકીદનો શબ્દ છે";
    } else if (U.hits.length) {
      urgent = U.s > 0;
      uWhy = "તાકીદ: શીખેલા શબ્દો — " + U.hits.map(function (h) { return h[0]; }).join(", ");
    } else {
      urgent = false;
      uWhy = "તાકીદ: તારીખ નથી — ડિફૉલ્ટ તાકીદ નહીં";
    }

    return {
      urgent: urgent,
      important: important,
      quad: urgent ? (important ? "do" : "delegate") : (important ? "schedule" : "drop"),
      why: uWhy + " · " + iWhy
    };
  }

  /* ---------------- training ---------------- */
  function bump(tok, key, delta) {
    var e = S.lex[tok];
    if (!e) e = S.lex[tok] = { i:0, ni:0, u:0, nu:0 };
    e[key] = Math.max(0, (e[key] || 0) + delta);
    if (!e.i && !e.ni && !e.u && !e.nu) delete S.lex[tok];
  }
  function train(task) {
    var toks = tokenize(task.text + " " + (task.who || ""));
    var seen = {}, uniq = [], changed = false;
    toks.forEach(function (t) { if (!seen[t]) { seen[t] = 1; uniq.push(t); } });

    var oldI = task.trainedI == null ? null : task.trainedI;
    var newI = (task.fixI === true || task.fixI === false) ? task.fixI : null;
    if (oldI !== newI) {
      uniq.forEach(function (t) {
        if (oldI === true) bump(t, "i", -1);
        if (oldI === false) bump(t, "ni", -1);
        if (newI === true) bump(t, "i", 1);
        if (newI === false) bump(t, "ni", 1);
      });
      task.trainedI = newI;
      changed = true;
    }
    var oldU = task.trainedU == null ? null : task.trainedU;
    var newU = (task.fixU === true || task.fixU === false) ? task.fixU : null;
    if (oldU !== newU) {
      uniq.forEach(function (t) {
        if (oldU === true) bump(t, "u", -1);
        if (oldU === false) bump(t, "nu", -1);
        if (newU === true) bump(t, "u", 1);
        if (newU === false) bump(t, "nu", 1);
      });
      task.trainedU = newU;
      changed = true;
    }
    if (changed) saveLex();
  }

  /* ---------------- rendering ---------------- */
  function visible() {
    var today = todayStr(), out = [];
    Object.keys(S.tasks).forEach(function (id) {
      var t = S.tasks[id];
      if (!t || !t.text) return;
      if (S.filter === "open" && t.done) return;
      if (S.filter === "done" && !t.done) return;
      if (S.filter === "today") {
        if (t.done) return;
        var d = t.due ? dayDiff(t.due, today) : null;
        if (!(d !== null && d <= 0) && !classify(t, today).urgent) return;
      }
      out.push(t);
    });
    out.sort(function (a, b) {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      var ad = a.due || "9999-99-99", bd = b.due || "9999-99-99";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return (a.created || "") < (b.created || "") ? -1 : 1;
    });
    return out;
  }

  function taskHTML(t, today) {
    var c = classify(t, today);
    var dl = t.due ? dueLabel(t.due, today) : null;
    var tags = "";
    if (dl && dl.txt) tags += '<span class="tag ' + dl.cls + ' num">' + esc(dl.txt) + "</span>";
    if (t.who) tags += '<span class="tag who">→ ' + esc(t.who) + "</span>";
    if (t.fixU === true || t.fixU === false || t.fixI === true || t.fixI === false) {
      tags += '<span class="tag fixed">હાથે ગોઠવેલું</span>';
    }
    return '<li class="t' + (t.done ? " done" : "") + '" draggable="true" data-id="' + esc(t.id) + '">' +
      '<button class="tick" data-act="done" aria-label="પૂર્ણ" aria-pressed="' + (t.done ? "true" : "false") + '"></button>' +
      '<div class="tbody">' +
        '<div class="ttext">' + esc(t.text) + "</div>" +
        (tags ? '<div class="tmeta">' + tags + "</div>" : "") +
        '<div class="why">' + esc(c.why) + "</div>" +
      "</div>" +
      '<div class="tacts">' +
        '<button class="mini" data-act="imp" aria-pressed="' + (c.important ? "true" : "false") + '">Imp</button>' +
        '<button class="mini" data-act="urg" aria-pressed="' + (c.urgent ? "true" : "false") + '">Urg</button>' +
        '<button class="mini x" data-act="del" aria-label="કાઢી નાખો">✕</button>' +
      "</div></li>";
  }

  function bucketise(today) {
    var buckets = { do:[], schedule:[], delegate:[], drop:[] };
    visible().forEach(function (t) { buckets[classify(t, today).quad].push(t); });
    return buckets;
  }

  function render() {
    var today = todayStr();
    var buckets = bucketise(today);

    var openCount = 0, doneToday = 0;
    Object.keys(S.tasks).forEach(function (id) {
      var t = S.tasks[id];
      if (!t.done) openCount++;
      else if (t.doneAt && String(t.doneAt).slice(0, 10) === today) doneToday++;
    });
    var gdays = ["રવિવાર", "સોમવાર", "મંગળવાર", "બુધવાર", "ગુરુવાર", "શુક્રવાર", "શનિવાર"];
    $("subline").textContent = gdays[new Date().getDay()] + " · " +
      today.split("-").reverse().join("/") + " · " + openCount + " બાકી · આજે " + doneToday + " પૂર્ણ";

    if (S.view === "matrix") {
      $("matrix").hidden = false;
      $("listview").hidden = true;
      var order = ["do", "schedule", "delegate", "drop"], html = "";
      for (var r = 0; r < 2; r++) {
        html += '<div class="rowlab">' + (r === 0 ? "Important · મહત્ત્વનું" : "Not important") + "</div>";
        for (var col = 0; col < 2; col++) {
          var q = QBY[order[r * 2 + col]], list = buckets[q.k];
          html += '<section class="quad' + (list.length ? "" : " isempty") + '" data-quad="' + q.k + '" style="--qc:' + q.c + ';--qbg:' + q.bg + '">' +
            '<div class="qhead"><strong>' + esc(q.en) + "</strong><em>" + esc(q.gu) + '</em><span class="cnt num">' + list.length + "</span></div>" +
            '<div class="qsub">' + esc(q.axis) + "</div>" +
            '<ul class="qlist">' +
              (list.length ? list.map(function (t) { return taskHTML(t, today); }).join("")
                           : '<li class="qempty">ખાલી</li>') +
            "</ul></section>";
        }
      }
      $("matrix").innerHTML = html;
    } else {
      $("matrix").hidden = true;
      $("listview").hidden = false;
      var lh = "";
      ["do", "schedule", "delegate", "drop"].forEach(function (k) {
        var q = QBY[k], list = buckets[k];
        if (!list.length) return;
        lh += "<h3>" + esc(q.en) + " — " + esc(q.gu) + " (" + list.length + ")</h3>" +
          '<ul data-quad="' + k + '">' + list.map(function (t) { return taskHTML(t, today); }).join("") + "</ul>";
      });
      $("listview").innerHTML = lh || '<div class="qempty">કંઈ નથી.</div>';
    }
    renderWords();
  }

  function renderWords() {
    var keys = Object.keys(S.lex);
    keys.sort(function (a, b) {
      var ea = S.lex[a], eb = S.lex[b];
      return (eb.i + eb.ni + eb.u + eb.nu) - (ea.i + ea.ni + ea.u + ea.nu);
    });
    $("lcount").textContent = "(" + keys.length + " શબ્દ)";
    $("words").innerHTML = keys.slice(0, 80).map(function (k) {
      var e = S.lex[k], lean = [];
      if (e.i !== e.ni) lean.push(e.i > e.ni ? "Imp" : "Not imp");
      if (e.u !== e.nu) lean.push(e.u > e.nu ? "Urg" : "Not urg");
      return '<span class="word"><b>' + esc(k) + "</b>" +
        '<span class="lean">' + esc(lean.join(" · ") || "—") + "</span>" +
        '<button data-word="' + esc(k) + '" aria-label="ભૂલી જાઓ">×</button></span>';
    }).join("") || '<span style="color:var(--ink-faint)">હજી કંઈ શીખ્યું નથી.</span>';
  }

  function renderTemplates() {
    var box = $("templates");
    if (!S.templates.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = S.templates.map(function (txt, i) {
      return '<button class="chip" data-tpl="' + i + '">' + esc(txt) + "</button>";
    }).join("");
  }

  var toastTimer = null;
  function toast(msg) {
    var el = document.querySelector(".toast");
    if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1900);
  }

  /* ---------------- compose ---------------- */
  function setDue(v, which) {
    $("ddate").value = v || "";
    ["dtoday", "dtom", "dweek"].forEach(function (id) {
      $(id).setAttribute("aria-pressed", id === which ? "true" : "false");
    });
    updatePredict();
  }
  function toggleDue(days, id) {
    var want = shiftDay(days);
    if ($("ddate").value === want) setDue(null, null); else setDue(want, id);
  }
  function updatePredict() {
    var text = $("text").value.trim(), box = $("predict");
    if (!text) {
      box.innerHTML = '<span class="why">લખવાનું શરૂ કરો — એપ જાતે ખાનું નક્કી કરશે.</span>';
      $("addbtn").disabled = true;
      return;
    }
    $("addbtn").disabled = false;
    var c = classify({ text:text, who:$("who").value.trim(), due:$("ddate").value || null, fixU:null, fixI:null }, todayStr());
    var q = QBY[c.quad];
    box.innerHTML = '<span class="tag" style="background:' + q.bg + ';color:' + q.c + ';font-weight:700">' +
      esc(q.en) + " · " + esc(q.gu) + '</span><span class="why">' + esc(c.why) + "</span>";
  }
  function addTask() {
    var text = $("text").value.trim();
    if (!text) return;
    var t = {
      id: uid(), text: text,
      who: $("who").value.trim() || null,
      due: $("ddate").value || null,
      created: new Date().toISOString(),
      done: false, doneAt: null,
      fixU: null, fixI: null, trainedU: null, trainedI: null
    };
    S.tasks[t.id] = t;
    saveTasks();
    $("text").value = ""; $("who").value = "";
    setDue(null, null);
    render();
    toast("ઉમેરાયું → " + QBY[classify(t, todayStr()).quad].gu);
  }

  /* ---------------- card actions ---------------- */
  function onCardAction(e) {
    var btn = e.target.closest ? e.target.closest("button[data-act]") : null;
    if (!btn) return;
    var li = btn.closest(".t");
    if (!li) return;
    var t = S.tasks[li.getAttribute("data-id")];
    if (!t) return;
    var act = btn.getAttribute("data-act"), today = todayStr();

    if (act === "done") {
      t.done = !t.done;
      t.doneAt = t.done ? new Date().toISOString() : null;
      saveTasks(); render();
      return;
    }
    if (act === "del") {
      delete S.tasks[t.id];
      saveTasks(); render(); toast("કાઢી નાખ્યું");
      return;
    }
    var c = classify(t, today);
    if (act === "imp") t.fixI = !c.important;
    if (act === "urg") t.fixU = !c.urgent;
    train(t);
    saveTasks(); render();
    toast("શીખી લીધું → " + QBY[classify(t, today).quad].gu);
  }

  /* ---------------- menu actions ---------------- */
  function buildText() {
    var today = todayStr(), buckets = bucketise(today);
    var lines = [today.split("-").reverse().join("/")];
    ["do", "schedule", "delegate", "drop"].forEach(function (k) {
      if (!buckets[k].length) return;
      lines.push("", QBY[k].en + " — " + QBY[k].gu);
      buckets[k].forEach(function (t) {
        lines.push("  [" + (t.done ? "x" : " ") + "] " + t.text +
          (t.due ? "  (" + t.due.split("-").reverse().join("/") + ")" : "") +
          (t.who ? "  → " + t.who : ""));
      });
    });
    return lines.join("\n");
  }

  function closeMenu() {
    $("menu").hidden = true;
    $("menubtn").setAttribute("aria-expanded", "false");
    var sc = document.querySelector(".scrim");
    if (sc) sc.remove();
  }
  function openMenu() {
    $("menu").hidden = false;
    $("menubtn").setAttribute("aria-expanded", "true");
    var sc = document.createElement("div");
    sc.className = "scrim";
    sc.addEventListener("click", closeMenu);
    document.body.appendChild(sc);
  }

  function doExport() {
    var payload = { app:"karya-matrix", version:1, exported:new Date().toISOString(), tasks:S.tasks, lexicon:S.lex, templates:S.templates };
    var blob = new Blob([JSON.stringify(payload, null, 1)], { type:"application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "karya-matrix-" + todayStr() + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast("બૅકઅપ ફાઇલ બની");
  }

  function doImport(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var data;
      try { data = JSON.parse(String(fr.result)); }
      catch (e) { toast("ફાઇલ વાંચી શકાઈ નહીં"); return; }
      if (!data || typeof data !== "object" || !data.tasks) { toast("આ આ એપની બૅકઅપ ફાઇલ નથી"); return; }
      var added = 0;
      Object.keys(data.tasks).forEach(function (id) {
        var t = data.tasks[id];
        if (!t || !t.text) return;
        if (!S.tasks[id]) added++;
        t.id = id;
        S.tasks[id] = t;
      });
      if (data.lexicon && typeof data.lexicon === "object") {
        Object.keys(data.lexicon).forEach(function (w) {
          var src = data.lexicon[w];
          if (!src) return;
          var dst = S.lex[w] || (S.lex[w] = { i:0, ni:0, u:0, nu:0 });
          ["i", "ni", "u", "nu"].forEach(function (k) { dst[k] = Math.max(dst[k] || 0, src[k] || 0); });
        });
      }
      saveTasks(); saveLex(); render();
      toast(added + " નવાં ટાસ્ક ઉમેરાયાં");
    };
    fr.readAsText(file);
  }

  function clearDone() {
    var n = 0;
    Object.keys(S.tasks).forEach(function (id) { if (S.tasks[id].done) { delete S.tasks[id]; n++; } });
    saveTasks(); render();
    toast(n + " પૂર્ણ ટાસ્ક કાઢ્યાં");
  }

  /* ---------------- wiring ---------------- */
  $("text").addEventListener("input", updatePredict);
  $("who").addEventListener("input", updatePredict);
  $("ddate").addEventListener("change", function () { setDue($("ddate").value, null); });
  $("text").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); addTask(); } });
  $("addbtn").addEventListener("click", addTask);
  $("dtoday").addEventListener("click", function () { toggleDue(0, "dtoday"); });
  $("dtom").addEventListener("click", function () { toggleDue(1, "dtom"); });
  $("dweek").addEventListener("click", function () { toggleDue(6, "dweek"); });

  $("templates").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button[data-tpl]") : null;
    if (!b) return;
    $("text").value = S.templates[+b.getAttribute("data-tpl")] || "";
    updatePredict();
    $("text").focus();
  });

  function setFilter(f) {
    S.view = (f === "list") ? "list" : "matrix";
    if (f !== "list") S.filter = f;
    ["fopen", "ftoday", "fdone", "flist"].forEach(function (id) {
      $(id).setAttribute("aria-pressed", "false");
    });
    $(f === "list" ? "flist" : ("f" + f)).setAttribute("aria-pressed", "true");
    render();
  }
  $("fopen").addEventListener("click", function () { setFilter("open"); });
  $("ftoday").addEventListener("click", function () { setFilter("today"); });
  $("fdone").addEventListener("click", function () { setFilter("done"); });
  $("flist").addEventListener("click", function () { setFilter("list"); });

  $("matrix").addEventListener("click", onCardAction);
  $("listview").addEventListener("click", onCardAction);

  $("words").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button[data-word]") : null;
    if (!b) return;
    delete S.lex[b.getAttribute("data-word")];
    saveLex(); render(); toast("શબ્દ ભુલાવ્યો");
  });

  $("menubtn").addEventListener("click", function () {
    if ($("menu").hidden) openMenu(); else closeMenu();
  });
  $("menu").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button[data-m]") : null;
    if (!b) return;
    var m = b.getAttribute("data-m");
    closeMenu();
    if (m === "copy") {
      var txt = buildText();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () { toast("કોપી થઈ ગયું"); },
                                                function () { toast("કોપી થઈ શક્યું નહીં"); });
      } else { toast("કોપી થઈ શક્યું નહીં"); }
    }
    else if (m === "export") doExport();
    else if (m === "import") $("importfile").click();
    else if (m === "learn") { $("learn").open = true; $("learn").scrollIntoView({ behavior:"smooth", block:"start" }); }
    else if (m === "clearDone") clearDone();
  });
  $("importfile").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    if (f) doImport(f);
    e.target.value = "";
  });

  $("themebtn").addEventListener("click", function () {
    var cur = document.documentElement.getAttribute("data-theme");
    var next = cur === "dark" ? "light" : (cur === "light" ? "" : "dark");
    if (next) document.documentElement.setAttribute("data-theme", next);
    else document.documentElement.removeAttribute("data-theme");
    write(K_THEME, next);
  });

  /* drag between quadrants (tablet/desktop enhancement) */
  var dragId = null;
  document.addEventListener("dragstart", function (e) {
    var li = e.target.closest ? e.target.closest(".t") : null;
    if (!li) return;
    dragId = li.getAttribute("data-id");
    li.classList.add("dragging");
    try { e.dataTransfer.setData("text/plain", dragId); e.dataTransfer.effectAllowed = "move"; } catch (err) {}
  });
  document.addEventListener("dragend", function () {
    dragId = null;
    var d = document.querySelector(".t.dragging");
    if (d) d.classList.remove("dragging");
    Array.prototype.forEach.call(document.querySelectorAll(".quad.over"), function (q) { q.classList.remove("over"); });
  });
  document.addEventListener("dragover", function (e) {
    var q = e.target.closest ? e.target.closest("[data-quad]") : null;
    if (!q || !dragId) return;
    e.preventDefault();
    if (q.classList.contains("quad")) q.classList.add("over");
  });
  document.addEventListener("dragleave", function (e) {
    var q = e.target.closest ? e.target.closest(".quad") : null;
    if (q) q.classList.remove("over");
  });
  document.addEventListener("drop", function (e) {
    var q = e.target.closest ? e.target.closest("[data-quad]") : null;
    if (!q || !dragId) return;
    e.preventDefault();
    var t = S.tasks[dragId], target = QBY[q.getAttribute("data-quad")];
    if (t && target) {
      t.fixU = target.u; t.fixI = target.i;
      train(t); saveTasks(); render();
      toast("ખસેડ્યું → " + target.gu);
    }
    dragId = null;
  });

  /* ---------------- install prompt ---------------- */
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    $("installbtn").hidden = false;
  });
  $("installbtn").addEventListener("click", function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function () {
      deferredPrompt = null;
      $("installbtn").hidden = true;
    });
  });
  window.addEventListener("appinstalled", function () {
    deferredPrompt = null;
    $("installbtn").hidden = true;
    toast("ઇન્સ્ટૉલ થઈ ગયું");
  });

  /* iPhone has no install prompt event: Safari installs only through Share → Add to Home Screen. */
  function maybeIosTip() {
    var isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    var standalone = window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
    if (!isIos || standalone || read("kmx.iostip.dismissed", false)) return;
    var el = document.createElement("div");
    el.className = "iostip";
    el.innerHTML = '<span>ફોનમાં ઇન્સ્ટૉલ કરવા: નીચે <b>Share</b> (↑) દબાવો, પછી <b>Add to Home Screen</b>.</span>' +
                   '<button type="button" aria-label="બંધ કરો">\u00d7</button>';
    el.querySelector("button").addEventListener("click", function () {
      write("kmx.iostip.dismissed", true);
      el.remove();
    });
    var wrap = document.querySelector(".wrap");
    wrap.insertBefore(el, wrap.firstChild);
  }

  /* ---------------- boot ---------------- */
  var theme = read(K_THEME, "");
  if (theme === "dark" || theme === "light") document.documentElement.setAttribute("data-theme", theme);

  S.tasks = read(K_TASKS, {}) || {};
  S.lex = read(K_LEX, null);
  S.templates = read(K_TPL, null);

  if (!S.lex || !read(K_SEEDED, false)) {
    if (!S.lex) { S.lex = JSON.parse(JSON.stringify(SEED_LEX)); saveLex(); }
    if (!S.templates) { S.templates = SEED_TEMPLATES.slice(); write(K_TPL, S.templates); }
    write(K_SEEDED, true);
  }
  if (!S.templates) S.templates = SEED_TEMPLATES.slice();

  renderTemplates();
  render();
  updatePredict();
  maybeIosTip();

  // Re-render if the app is left open past midnight, so "આજે" stays true.
  var bootDay = todayStr();
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && todayStr() !== bootDay) { bootDay = todayStr(); render(); }
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () {});
    });
  }
})();
