/* Shared core for both pages: state, schedule math, storage bridge. */
(function () {
  "use strict";

  const STORE_KEY = "water.v1";
  const DEFAULTS = {
    intervalMin: 60,
    startMin: 8 * 60,
    endMin: 22 * 60,
    goalMl: 2000,
    glassMl: 250,
    vibrate: true,
    sound: true,
    nextAt: null,
    enabled: false
  };

  const todayKey = () => new Date().toLocaleDateString("en-CA");

  function load() {
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); } catch (e) { raw = {}; }
    const settings = Object.assign({}, DEFAULTS, raw.settings || {});
    const history = raw.history && typeof raw.history === "object" ? raw.history : {};
    return {
      settings,
      history,
      mlToday: Number(history[todayKey()] || 0),
      lastAdd: raw.lastAdd || null
    };
  }

  /* ---------- IndexedDB bridge so the service worker can see the schedule ---------- */
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("water-db", 1);
      r.onupgradeneeded = () => { r.result.createObjectStore("kv"); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }

  async function idbSet(k, v) {
    try {
      const db = await idb();
      await new Promise((res, rej) => {
        const tx = db.transaction("kv", "readwrite");
        tx.objectStore("kv").put(v, k);
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
      db.close();
    } catch (e) { /* non-fatal */ }
  }

  function pushScheduleToSW(state) {
    const s = state.settings;
    idbSet("schedule", {
      nextAt: s.nextAt,
      intervalMin: s.intervalMin,
      startMin: s.startMin,
      endMin: s.endMin,
      enabled: !!s.enabled && s.nextAt !== null,
      updated: Date.now()
    });
  }

  function save(state) {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      settings: state.settings,
      history: state.history,
      lastAdd: state.lastAdd
    }));
    pushScheduleToSW(state);
  }

  function setToday(state, ml) {
    state.mlToday = Math.max(0, Math.round(ml));
    state.history[todayKey()] = state.mlToday;
    const keys = Object.keys(state.history).sort();
    while (keys.length > 120) delete state.history[keys.shift()];
    save(state);
  }

  /* ---------- scheduling ---------- */
  function nextFrom(state, fromTs) {
    const s = state.settings;
    let t = fromTs + s.intervalMin * 60000;
    const start = s.startMin, end = s.endMin;
    if (end <= start) return t;
    for (let i = 0; i < 4; i++) {
      const d = new Date(t);
      const mins = d.getHours() * 60 + d.getMinutes();
      if (mins < start) {
        d.setHours(Math.floor(start / 60), start % 60, 0, 0);
        t = d.getTime();
        break;
      }
      if (mins >= end) {
        d.setDate(d.getDate() + 1);
        d.setHours(Math.floor(start / 60), start % 60, 0, 0);
        t = d.getTime();
        continue;
      }
      break;
    }
    return t;
  }

  function scheduleNext(state, fromTs) {
    state.settings.nextAt = nextFrom(state, fromTs || Date.now());
    save(state);
    return state.settings.nextAt;
  }

  /* ---------- helpers ---------- */
  function minToTime(m) {
    const h = String(Math.floor(m / 60) % 24).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    return h + ":" + mm;
  }
  function timeToMin(v) {
    const parts = (v || "0:0").split(":").map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }
  function fmtClock(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  function streak(history, goalMl) {
    const d = new Date();
    const key = (x) => x.toLocaleDateString("en-CA");
    // today counts only once you've hit the goal
    let n = Number(history[key(d)] || 0) >= goalMl ? 1 : 0;
    let i = 1;
    while (true) {
      const p = new Date();
      p.setDate(p.getDate() - i);
      if (Number(history[key(p)] || 0) >= goalMl) { n++; i++; } else break;
      if (i > 400) break;
    }
    return n;
  }

  function week(history, goalMl) {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-CA");
      out.push({
        key,
        label: d.toLocaleDateString([], { weekday: "narrow" }),
        ml: Number(history[key] || 0),
        cur: i === 0
      });
    }
    return out;
  }

  window.WaterCore = {
    STORE_KEY, DEFAULTS,
    load, save, setToday,
    nextFrom, scheduleNext,
    minToTime, timeToMin, fmtClock,
    streak, week, todayKey,
    idbSet, pushScheduleToSW
  };
})();
