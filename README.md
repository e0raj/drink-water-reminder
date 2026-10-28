# 💧 Drink Water Reminder

A calm, installable, offline-first water reminder. Add it to your home screen, allow notifications once,
and it nudges you at your chosen interval — no account, no server, no tracking.

**Live app:** https://e0raj.github.io/drink-water-reminder/

---

## What it does

- **Installable PWA** — "Add to Home Screen" / "Install app", opens full-screen with its own icon.
- **One permission prompt** — tap *Allow notifications* once, the reminder schedule starts immediately.
- **Reminders that respect your day** — pick an interval (30 min → 2 hours) and a waking window
  (default 08:00–22:00). Nothing buzzes at night.
- **Daily goal + streak tracking** — a thin progress bar, glass count, and a 7-day chart, all stored locally.
- **Quick logging** — one tap for a glass, plus 100 ml / 500 ml buttons, undo, and a
  "Drank it 💧" action right on the notification.
- **Works offline** — the whole app is cached by a service worker, so it opens instantly with no network.
- **Black and white** — one clean monochrome design, light and dark, following your system theme.

## How the reminders work (honest version)

There is no backend here, so the app uses the three mechanisms the web actually gives us:

1. **While the app is open (foreground or background tab):** a precise timer fires the notification.
   This is the most reliable path and covers almost all normal use.
2. **Installed PWA + Periodic Background Sync:** on Chromium browsers (Chrome/Edge on Android, desktop),
   the service worker wakes every ~15 minutes and fires any due reminder, even if the app was closed.
3. **iOS/Safari:** background wake-up is not available to web apps. Keep the app open in the background,
   or reopen it once a day — any missed reminder is delivered as soon as you open it.

A true "push even when the phone is asleep on iOS" reminder needs a push server, which would mean an
account, an API key, and a network. This app deliberately avoids all three.

## Run it locally

Any static server works — service workers need `http://` or `https://`, not `file://`.

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Deploy (GitHub Pages)

1. Push this folder to a GitHub repo.
2. **Settings → Pages → Source: Deploy from a branch → `main` / `root` → Save.**
3. Open `https://<username>.github.io/<repo>/`.

All asset paths are relative, so it works from any sub-path — no build step, no config.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole UI, styles and app logic (no dependencies) |
| `manifest.webmanifest` | Name, icons, colours, `display: standalone`, shortcut |
| `sw.js` | Offline cache, notification display, notification-click actions, background checks |
| `icons/` | 192/512 icons, maskable icon, iOS touch icon, notification badge |

## Data & privacy

Everything (settings, today's intake, history) lives in `localStorage` and `IndexedDB` on your device.
Nothing is sent anywhere. Clearing site data resets the app.

## Browser support

| Feature | Chrome / Edge | Safari (iOS 16.4+) | Firefox |
| --- | --- | --- | --- |
| Install to home screen | ✅ | ✅ (Share → Add to Home Screen) | ⚠️ limited |
| Notifications | ✅ | ✅ (installed only) | ✅ |
| Offline | ✅ | ✅ | ✅ |
| Background wake-up | ✅ (installed) | ❌ | ❌ |

## License

MIT — do whatever you like with it.
