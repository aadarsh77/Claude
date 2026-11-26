/* કાર્ય મેટ્રિક્સ — optional Supabase sync.
 *
 * Plain fetch against Supabase's REST and auth endpoints: no client library,
 * so nothing has to come from a CDN and the app still opens with no network.
 * With config.js left blank this file does nothing and the app stays local-only.
 *
 * Model: every device keeps the whole list locally and works offline. A change
 * marks its row dirty; a sync pushes dirty rows, then pulls everything changed
 * since the last pull. Conflicts resolve last-writer-wins on `updated`, which
 * is what a single person using two devices actually wants. Deletes travel as
 * tombstones (`deleted: true`), because a row that simply vanished locally
 * would be pulled straight back from the server.
 */
(function () {
  "use strict";

  var CFG = window.KMX_CONFIG || {};
  var BASE = String(CFG.SUPABASE_URL || "").replace(/\/+$/, "");
  var ANON = String(CFG.SUPABASE_ANON_KEY || "");
  var ENABLED = !!(BASE && ANON);

  var K_SESS = "kmx.sess.v1", K_PULL = "kmx.lastpull.v1";
  var EPOCH = "1970-01-01T00:00:00.000Z";

  var sess = null;          // {access_token, refresh_token, expires_at, email, sub}
  var syncing = false;
  var pending = false;
  var timer = null;
  var lastError = "";

  function $(id) { return document.getElementById(id); }
  var KMX = window.KMX;

  /* ---------------- session ---------------- */
  function load() {
    try { sess = JSON.parse(localStorage.getItem(K_SESS) || "null"); }
    catch (e) { sess = null; }
  }
  function store(s) {
    sess = s;
    try {
      if (s) localStorage.setItem(K_SESS, JSON.stringify(s));
      else localStorage.removeItem(K_SESS);
    } catch (e) {}
  }
  function lastPull() {
    try { return localStorage.getItem(K_PULL) || EPOCH; } catch (e) { return EPOCH; }
  }
  function setLastPull(v) { try { localStorage.setItem(K_PULL, v); } catch (e) {} }

  // The user id is the `sub` claim of the access token; upserts need it so
  // PostgREST can match the primary key on the lexicon row.
  function subOf(jwt) {
    try {
      var part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      while (part.length % 4) part += "=";
      return JSON.parse(decodeURIComponent(escape(atob(part)))).sub || "";
    } catch (e) { return ""; }
  }

  function headers(auth) {
    var h = { "apikey": ANON, "Content-Type": "application/json" };
    if (auth && sess && sess.access_token) h["Authorization"] = "Bearer " + sess.access_token;
    return h;
  }

  function sessionFrom(j) {
    if (!j || !j.access_token) return null;
    return {
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: j.expires_at || (Math.floor(Date.now() / 1000) + (j.expires_in || 3600)),
      email: (j.user && j.user.email) || (sess && sess.email) || "",
      sub: subOf(j.access_token)
    };
  }

  function refresh() {
    if (!sess || !sess.refresh_token) return Promise.resolve(false);
    return fetch(BASE + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST", headers: headers(false),
      body: JSON.stringify({ refresh_token: sess.refresh_token })
    }).then(function (r) {
      if (!r.ok) throw new Error("refresh " + r.status);
      return r.json();
    }).then(function (j) {
      var s = sessionFrom(j);
      if (!s) throw new Error("refresh: no token");
      store(s);
      return true;
    }).catch(function () { return false; });
  }

  function fresh() {
    if (!sess) return Promise.resolve(false);
    if ((sess.expires_at || 0) - 60 > Math.floor(Date.now() / 1000)) return Promise.resolve(true);
    return refresh();
  }

  // One retry after a refresh, so an expired token never surfaces as an error.
  function api(path, opts, retried) {
    opts = opts || {};
    return fetch(BASE + "/rest/v1" + path, {
      method: opts.method || "GET",
      headers: Object.assign(headers(true), opts.extra || {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      if (r.status === 401 && !retried) {
        return refresh().then(function (ok) {
          if (!ok) throw new Error("લૉગિન ફરી કરવું પડશે");
          return api(path, opts, true);
        });
      }
      if (!r.ok) {
        return r.text().then(function (t) { throw new Error("HTTP " + r.status + " " + t.slice(0, 160)); });
      }
      return r.status === 204 ? null : r.json().catch(function () { return null; });
    });
  }

  /* ---------------- auth ---------------- */
  function sendCode(email) {
    return fetch(BASE + "/auth/v1/otp", {
      method: "POST", headers: headers(false),
      body: JSON.stringify({ email: email, create_user: true })
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t.slice(0, 200)); });
      return true;
    });
  }

  function verifyCode(email, code) {
    return fetch(BASE + "/auth/v1/verify", {
      method: "POST", headers: headers(false),
      body: JSON.stringify({ email: email, token: code, type: "email" })
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t.slice(0, 200)); });
      return r.json();
    }).then(function (j) {
      var s = sessionFrom(j);
      if (!s) throw new Error("ટોકન મળ્યું નહીં");
      s.email = email;
      store(s);
      // A device joining an existing account must read everything, not just
      // what changed since its own (empty) last pull.
      setLastPull(EPOCH);
      return s;
    });
  }

  function signOut() {
    store(null);
    setLastPull(EPOCH);
    paint();
  }

  /* ---------------- row mapping ---------------- */
  function toRow(t) {
    return {
      id: t.id,
      user_id: sess.sub,
      text: t.text,
      who: t.who || null,
      due: t.due || null,
      created: t.created || null,
      done: !!t.done,
      done_at: t.doneAt || null,
      fix_u: (t.fixU === true || t.fixU === false) ? t.fixU : null,
      fix_i: (t.fixI === true || t.fixI === false) ? t.fixI : null,
      trained_u: (t.trainedU === true || t.trainedU === false) ? t.trainedU : null,
      trained_i: (t.trainedI === true || t.trainedI === false) ? t.trainedI : null,
      deleted: !!t.deleted,
      updated_at: t.updated || new Date().toISOString()
    };
  }

  function fromRow(r) {
    return {
      id: r.id,
      text: r.text || "",
      who: r.who || null,
      due: r.due || null,
      created: r.created || "",
      done: !!r.done,
      doneAt: r.done_at || null,
      fixU: (r.fix_u === true || r.fix_u === false) ? r.fix_u : null,
      fixI: (r.fix_i === true || r.fix_i === false) ? r.fix_i : null,
      trainedU: (r.trained_u === true || r.trained_u === false) ? r.trained_u : null,
      trainedI: (r.trained_i === true || r.trained_i === false) ? r.trained_i : null,
      deleted: !!r.deleted,
      updated: r.updated_at || new Date().toISOString(),
      dirty: false
    };
  }

  /* ---------------- sync ---------------- */
  function pushTasks() {
    var S = KMX.S, rows = [];
    Object.keys(S.tasks).forEach(function (id) {
      var t = S.tasks[id];
      if (t && t.dirty) rows.push(toRow(t));
    });
    if (!rows.length) return Promise.resolve(0);
    return api("/tasks", {
      method: "POST",
      body: rows,
      extra: { "Prefer": "resolution=merge-duplicates,return=minimal" }
    }).then(function () {
      rows.forEach(function (r) { if (S.tasks[r.id]) S.tasks[r.id].dirty = false; });
      KMX.saveTasks();
      return rows.length;
    });
  }

  function pullTasks() {
    var since = lastPull();
    var newest = since, changed = 0;
    return api("/tasks?select=*&updated_at=gt." + encodeURIComponent(since) + "&order=updated_at.asc")
      .then(function (rows) {
        var S = KMX.S;
        (rows || []).forEach(function (r) {
          var remote = fromRow(r);
          if (remote.updated > newest) newest = remote.updated;
          var local = S.tasks[remote.id];
          // A dirty local edit that is not older than the server's copy wins
          // and goes up on the next push; otherwise the server's copy lands.
          if (local && local.dirty && (local.updated || "") >= remote.updated) return;
          if (local && (local.updated || "") > remote.updated) return;
          S.tasks[remote.id] = remote;
          changed++;
        });
        if (changed) KMX.saveTasks();
        setLastPull(newest);
        return changed;
      });
  }

  function syncLexicon() {
    var S = KMX.S;
    return api("/lexicon?select=*&limit=1").then(function (rows) {
      var remote = (rows && rows[0]) || null;
      var localAt = KMX.lexUpdated() || EPOCH;
      var remoteAt = (remote && remote.updated_at) || EPOCH;

      if (remote && remoteAt > localAt && !KMX.lexDirty()) {
        KMX.setLex(remote.tokens || {}, remoteAt);
        return "pulled";
      }
      if (KMX.lexDirty() || !remote) {
        var at = new Date().toISOString();
        return api("/lexicon", {
          method: "POST",
          body: [{ user_id: sess.sub, tokens: S.lex, updated_at: at }],
          extra: { "Prefer": "resolution=merge-duplicates,return=minimal" }
        }).then(function () { KMX.lexSynced(at); return "pushed"; });
      }
      return "same";
    });
  }

  function sync(reason) {
    if (!ENABLED || !sess) return Promise.resolve();
    if (syncing) { pending = true; return Promise.resolve(); }
    syncing = true;
    lastError = "";
    paint("સિંક થાય છે…");
    return fresh().then(function (ok) {
      if (!ok) throw new Error("લૉગિન ફરી કરવું પડશે");
      return pushTasks();
    })
      .then(function () { return pullTasks(); })
      .then(function (changed) {
        return syncLexicon().then(function () { return changed; });
      })
      .then(function (changed) {
        syncing = false;
        if (changed) KMX.render();
        paint();
        if (pending) { pending = false; setTimeout(function () { sync("queued"); }, 400); }
      })
      .catch(function (e) {
        syncing = false;
        lastError = (navigator.onLine === false) ? "ઑફલાઇન — બદલાવ સચવાયા છે" : ("સિંક નિષ્ફળ: " + e.message);
        paint();
      });
  }

  function schedule() {
    if (!ENABLED || !sess) return;
    clearTimeout(timer);
    timer = setTimeout(function () { sync("change"); }, 2500);
  }

  /* ---------------- UI ---------------- */
  function dirtyCount() {
    var n = 0, S = KMX.S;
    Object.keys(S.tasks).forEach(function (id) { if (S.tasks[id].dirty) n++; });
    if (KMX.lexDirty()) n++;
    return n;
  }

  function paint(busy) {
    var line = $("syncline");
    var panel = $("syncstate");
    var txt;
    if (!ENABLED) txt = "સિંક બંધ છે — config.js ભરેલી નથી. ડેટા ફક્ત આ ફોનમાં.";
    else if (!sess) txt = "સિંક ચાલુ કરવા લૉગિન કરો (મેનુ ⋯ → સિંક).";
    else if (busy) txt = busy;
    else if (lastError) txt = lastError + (dirtyCount() ? " · " + dirtyCount() + " બાકી" : "");
    else txt = "સિંક ચાલુ · " + (sess.email || "") + (dirtyCount() ? " · " + dirtyCount() + " મોકલવાનાં બાકી" : "");

    if (line) {
      line.textContent = txt;
      line.hidden = (!ENABLED && !line.dataset.always);
      line.className = "syncline" + (lastError ? " bad" : "");
    }
    if (panel) panel.textContent = txt;

    var inBtn = $("signinbox"), outBtn = $("signoutbox");
    if (inBtn && outBtn) {
      inBtn.hidden = !!sess || !ENABLED;
      outBtn.hidden = !sess;
    }
    var off = $("syncoff");
    if (off) off.hidden = ENABLED;
  }

  function wire() {
    var send = $("otpsend"), verify = $("otpverify");
    if (send) send.addEventListener("click", function () {
      var email = ($("otpemail").value || "").trim();
      if (!email) { KMX.toast("ઈ-મેલ લખો"); return; }
      send.disabled = true;
      sendCode(email).then(function () {
        $("otpstep2").hidden = false;
        $("otpcode").focus();
        KMX.toast("કોડ ઈ-મેલમાં મોકલ્યો");
      }).catch(function (e) {
        KMX.toast("મોકલી શકાયું નહીં: " + e.message);
      }).then(function () { send.disabled = false; });
    });

    if (verify) verify.addEventListener("click", function () {
      var email = ($("otpemail").value || "").trim();
      var code = ($("otpcode").value || "").trim();
      if (!code) { KMX.toast("કોડ લખો"); return; }
      verify.disabled = true;
      verifyCode(email, code).then(function () {
        KMX.toast("લૉગિન થઈ ગયું");
        $("otpstep2").hidden = true;
        $("otpcode").value = "";
        if (KMX.closeSheets) KMX.closeSheets();
        // Everything already on this device is unsynced until proven otherwise.
        KMX.markAllDirty();
        paint();
        return sync("signin");
      }).catch(function (e) {
        KMX.toast("કોડ ખોટો છે: " + e.message);
      }).then(function () { verify.disabled = false; });
    });

    var out = $("signoutbtn");
    if (out) out.addEventListener("click", function () {
      signOut();
      if (KMX.closeSheets) KMX.closeSheets();
      KMX.toast("લૉગ આઉટ — ડેટા આ ફોનમાં રહેશે");
    });

    var now = $("syncnow");
    if (now) now.addEventListener("click", function () {
      if (KMX.closeSheets) KMX.closeSheets();
      sync("manual");
    });
  }

  /* ---------------- boot ---------------- */
  if (!KMX) return;
  load();
  wire();
  paint();

  KMX.onChange = schedule;

  // Registered unconditionally: a device that signs in later in the same
  // visit must still sync on focus and on reconnect. sync() returns early
  // when there is no session, so the guard lives there, not here.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) sync("focus");
  });
  window.addEventListener("online", function () { sync("online"); });

  if (KMX.backupTip) KMX.backupTip(ENABLED && !!sess);

  if (ENABLED && sess) sync("load");
})();
