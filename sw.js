/* Drink Water Reminder — service worker
 * Offline shell cache + notification handling + best-effort background checks.
 */
const VERSION = "1.0.0";
const CACHE = "water-shell-" + VERSION;

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/badge-72.png"
];

/* ---------------- install / activate ---------------- */
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map((url) => cache.add(url).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* ---------------- fetch: offline first ---------------- */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: try network, fall back to the cached shell (offline support).
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put("./index.html", fresh.clone()).catch(() => {});
        return fresh;
      } catch (e) {
        const cache = await caches.open(CACHE);
        return (await cache.match("./index.html")) || (await cache.match("./")) ||
          new Response("<h1>Offline</h1><p>Open the app once while online to cache it.</p>",
            { headers: { "Content-Type": "text/html" } });
      }
    })());
    return;
  }

  // Everything else: cache first, then network (and store what we fetch).
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.status === 200 && res.type === "basic") cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (e) {
      return new Response("", { status: 504, statusText: "Offline" });
    }
  })());
});

/* ---------------- IndexedDB helpers (shared with the page) ---------------- */
function idbGet(key) {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open("water-db", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("kv");
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        const db = open.result;
        try {
          const tx = db.transaction("kv", "readonly");
          const rq = tx.objectStore("kv").get(key);
          rq.onsuccess = () => { resolve(rq.result || null); db.close(); };
          rq.onerror = () => { resolve(null); db.close(); };
        } catch (e) { resolve(null); db.close(); }
      };
    } catch (e) { resolve(null); }
  });
}

function idbSet(key, value) {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open("water-db", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("kv");
      open.onerror = () => resolve(false);
      open.onsuccess = () => {
        const db = open.result;
        try {
          const tx = db.transaction("kv", "readwrite");
          tx.objectStore("kv").put(value, key);
          tx.oncomplete = () => { resolve(true); db.close(); };
          tx.onerror = () => { resolve(false); db.close(); };
        } catch (e) { resolve(false); db.close(); }
      };
    } catch (e) { resolve(false); }
  });
}

/* ---------------- notifications ---------------- */
function iconPath(rel) {
  return new URL(rel, self.registration.scope).href;
}

function showWaterNotification(title, body, extra) {
  return self.registration.showNotification(title, Object.assign({
    body: body,
    icon: iconPath("icons/icon-192.png"),
    badge: iconPath("icons/badge-72.png"),
    vibrate: [90, 60, 90],
    tag: "water-reminder",
    renotify: true,
    data: { url: iconPath("./?drank=1") },
    actions: [
      { action: "drank", title: "Drank it 💧" },
      { action: "snooze", title: "Snooze 10m" }
    ]
  }, extra || {}));
}

async function tellClients(msg) {
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  list.forEach((c) => c.postMessage(msg));
}

self.addEventListener("notificationclick", (event) => {
  const action = event.action;
  const data = event.notification.data || {};
  event.notification.close();

  if (action === "drank") {
    event.waitUntil((async () => {
      await tellClients({ type: "drank" });
      await openApp();
    })());
    return;
  }
  if (action === "snooze") {
    event.waitUntil((async () => {
      await tellClients({ type: "snoozed" });
      const schedule = (await idbGet("schedule")) || {};
      schedule.nextAt = Date.now() + 10 * 60 * 1000;
      await idbSet("schedule", schedule);
    })());
    return;
  }
  event.waitUntil(openApp(data.url));
});

async function openApp(url) {
  const target = url || iconPath("./");
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of list) {
    if (new URL(c.url).origin === self.location.origin) {
      try { await c.focus(); return; } catch (e) { /* keep trying */ }
    }
  }
  if (self.clients.openWindow) return self.clients.openWindow(target);
}

/* ---------------- messages from the page ---------------- */
self.addEventListener("message", (event) => {
  const d = event.data || {};
  if (d.type === "SKIP_WAITING") self.skipWaiting();
  if (d.type === "TEST_NOTIFICATION") {
    event.waitUntil(showWaterNotification("💧 Test nudge", "This is what a water reminder looks like."));
  }
});

/* ---------------- background checks ---------------- */
async function checkSchedule() {
  const s = await idbGet("schedule");
  if (!s || !s.enabled || !s.nextAt) return;
  const now = Date.now();
  if (now < s.nextAt) return;

  const hour = new Date().getHours() * 60 + new Date().getMinutes();
  const inWindow = s.endMin <= s.startMin || (hour >= s.startMin && hour < s.endMin);

  if (inWindow) {
    await showWaterNotification("💧 Drink some water", "A quick glass now keeps the streak alive.");
    s.nextAt = now + Math.max(15, s.intervalMin || 60) * 60 * 1000;
  } else {
    // outside waking hours: push to the next window start
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(Math.floor((s.startMin || 480) / 60), (s.startMin || 480) % 60, 0, 0);
    s.nextAt = d.getTime();
  }
  await idbSet("schedule", s);
}

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "water-check") event.waitUntil(checkSchedule());
});

self.addEventListener("sync", (event) => {
  if (event.tag === "water-check") event.waitUntil(checkSchedule());
});
