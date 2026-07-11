# Pi kiosk: power-on to nav app

Goal: Pi powers on, the touchscreen lights up, the app appears fullscreen.
No desktop, no mouse cursor, no "click here to launch." The operator sees
exactly one thing: the chart.

This doc has the runbook. It assumes a Raspberry Pi 4 running OpenPlotter
(Raspberry Pi OS Bookworm + LXDE + SignalK preinstalled).

## One-time setup

### 1. Build env vars

The app's WebSocket URL and mode are baked in at build time by Vite. On the
Pi, create `.env.production` in the repo root before building:

```
VITE_SIGNALK_MODE=real
VITE_SIGNALK_URL=ws://localhost:3000/signalk/v1/stream?subscribe=all
```

Then build:

```bash
cd ~/nav-project
npm install
npm run build
```

This produces `dist/`. Re-run `npm run build` whenever you pull new code or
change env vars. Vite does **not** re-read env at runtime.

### 2. Static file server (systemd)

The built app is plain HTML/JS/CSS. Serve it with Python (already installed
on Raspberry Pi OS — no new packages):

`/etc/systemd/system/navapp.service`:

```ini
[Unit]
Description=Nav app static server
After=network.target

[Service]
ExecStart=/usr/bin/python3 -m http.server 8080 --bind 127.0.0.1 --directory /home/pi/nav-project/dist
Restart=always
User=pi

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now navapp
curl -s http://localhost:8080 | head -1   # smoke test
```

### 3. Kiosk autostart (LXDE)

Edit `~/.config/lxsession/LXDE-pi/autostart` (create if missing):

```
@xset s off
@xset -dpms
@xset s noblank
@unclutter -idle 0
@chromium-browser --kiosk --noerrdialogs --disable-infobars \
                   --check-for-update-interval=31536000 \
                   --disable-pinch=false \
                   --overscroll-history-navigation=0 \
                   --no-first-run \
                   http://localhost:8080
```

What each line does:

- `xset s off` / `-dpms` / `s noblank` — keep the screen on forever (no
  blanking, no DPMS power save). Marine kiosk standard.
- `unclutter -idle 0` — hides the mouse cursor immediately. Install once
  with `sudo apt install -y unclutter`.
- `--kiosk` — fullscreen, no chrome, no tabs.
- `--disable-pinch=false` — keep pinch-zoom enabled (we depend on it for
  AAA accessibility per `index.html` viewport meta).
- `--overscroll-history-navigation=0` — prevents an edge-swipe from triggering
  Chromium's "back" gesture. The app is a single page; there's nothing to
  go back to and the swipe would just trash the kiosk experience.
- `--check-for-update-interval=31536000` — Chromium tries to update less
  often.

### 4. Auto-login

Boot to the desktop without a password prompt:

```bash
sudo raspi-config
# → 1 System Options → S5 Boot / Auto Login → B4 Desktop Autologin
sudo reboot
```

After reboot, the Pi should land directly on the chart.

## Normal operation

- **Power on** → ~20 s later → app fullscreen.
- **Power off** → just kill power. The app has no unsaved server state; all
  persistence is in localStorage / IndexedDB which is sync-on-write.
- **Recovery from a crash** — `Restart=always` on the systemd unit and
  Chromium's own crash recovery handle this. If the app is wedged, SSH in
  and `sudo systemctl restart navapp`.

## Tether moments (when to plug in the phone)

The app is fully functional offline. You only need a network for:

1. **Annual tide refresh** — the Pi will quietly grab fresh NOAA predictions
   in the background within ~30 s of getting online if the bundled data is
   getting stale. See [tides.md](tides.md).
2. **Weather refresh** — the weather pill ages cached forecasts and tries
   NWS whenever it can. Plug the phone in when you want a fresh outlook.
3. **Software updates** — `git pull && npm install && npm run build`,
   restart navapp, optionally reboot.

For tethering options (Bluetooth PAN, USB tether, WiFi hotspot, captive
portal helper) see [pi-networking.md](pi-networking.md).

## Smoke test (do this at the dock before the first cruise)

1. Power-cycle. Watch for: splash → Chromium → app fullscreen, no cursor.
2. Status bar shows lat/lon from the u-blox GPS within ~30 s of cold start.
3. AIS list populates within a few minutes (anchor near a marina with
   traffic; even one row is enough to confirm dAISy is decoding).
4. Touch-drag the chart: pans freely, Recenter button shows an amber drift
   dot.
5. Tap Recenter: chart flies back to own-ship.
6. Pinch with two fingers: zooms smoothly.
7. Tide pill: shows a station name (e.g. "Castine · Low 4:23 PM"), no `~`
   prefix.
8. Tether the phone briefly: weather pill refreshes within ~30 s.
9. Pull power on the SignalK process (or unplug the GPS): app stays up,
   shows "no fix," reconnects when restored.

If any of those fail, fix before sailing.
