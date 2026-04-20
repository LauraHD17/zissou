# Getting the Pi online

The nav app itself doesn't configure WiFi — it's a pure SPA and has no OS-level
privilege. Networking is a Raspberry Pi OS concern, handled at the
`wpa_supplicant` / NetworkManager layer. Below are the three practical paths
for this boat; pick whichever fits the trip.

## 1. USB tether (simplest)

Plug your phone into any Pi USB-A port with a cable.

- **iPhone**: Settings → Personal Hotspot → Allow Others to Join (on). The Pi
  will see `eth1` (via Apple's NCM driver — `usbmuxd` must be running on the
  Pi; OpenPlotter ships with it).
- **Android**: Settings → Hotspot & Tethering → USB tethering (on). Pi sees
  `usb0` immediately.

No pairing, no config. Works the first time. This is the right answer
whenever you want to refresh the NOAA forecast mid-cruise or pull tide data.

## 2. Pre-configured known networks (set once)

SSH into the Pi from your laptop while it's on your home WiFi, then:

```bash
sudo nano /etc/wpa_supplicant/wpa_supplicant.conf
```

Append one block per network you expect to encounter — your home dock, your
phone's hotspot, marina WiFi you use often. Priority picks which to prefer
when multiple are in range.

```conf
network={
    ssid="HomeDock"
    psk="…"
    priority=10
}
network={
    ssid="Laura iPhone"
    psk="…"
    priority=5
}
```

Reboot. The Pi will auto-connect to whichever SSID is available with the
highest priority.

## 3. Captive-portal helper (unattended on-boat switching)

If you'll regularly visit new marinas or share the boat with someone who
shouldn't have to SSH, install `comitup`:

```bash
sudo apt install -y comitup
```

When the Pi can't connect to any known network on boot, it broadcasts its
own AP named `comitup-<hostname>`. Connect your phone → phone opens a
captive portal → pick the real WiFi network and enter the password.
Pi joins that network and remembers it for next boot.

This is the right answer if you want to avoid SSH entirely but it adds a
package and a systemd service, so skip it unless you need it.

## Verifying connectivity

From another device on the same network, or over SSH:

```bash
ip route                 # default route present?
curl -sI https://api.weather.gov | head -1   # NOAA reachable?
```

The in-app Weather pill shows a last-fetch timestamp + staleness dot; if it
says `Last fetch 12:42` and the time now is 13:15, you were online at 12:42
and the Pi has cached the forecast since.

## What NOT to do

- **Don't** install a GUI WiFi picker on the Pi. The kiosk runs Chromium
  full-screen; dropping to a system tray or desktop breaks the kiosk model
  and requires keyboard/mouse you probably don't have at the helm.
- **Don't** try to configure WiFi from inside the nav app. The app has no
  backend and cannot write to system config files.
