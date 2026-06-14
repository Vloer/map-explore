# Location Tracker — Setup Guide

Follow these steps to get the tracker running on your phone and view your map.

---

## Step 1 — Register your account

If you haven't already, go to the registration page:

> **`https://mapexplorer.duckdns.org/register.php`**

1. Enter **your name** (this will be your username).
2. Enter the **invite code** your admin gave you.
3. Choose a **password** and type it twice to confirm.
4. Tap **Create my account →**

You'll see a success page showing your Server URL, Username, and Password. Keep this page open for the next steps!

---

## Step 2 — Install the app

We use a custom Android app to track locations. You can download it directly from the registration success page.

1. On the registration success page, tap the green **⬇️ Download Android App (APK)** button.
2. Your browser will download `ulogger.apk`.
3. Open the downloaded file.
4. Your phone may warn you about installing unknown apps. Tap **Settings** and enable **"Allow from this source"**.
5. Tap **Install**.

---

## Step 3 — Configure the app

1. Open the newly installed **μlogger** app.
2. Tap the **⋮ menu** (three dots, top right) → **Settings**.
3. Fill in the following under **Server settings**:

| Setting | Value |
|---|---|
| **Server URL** | Paste the Server URL: https://vloer-ulogger.duckdns.org |
| **User name** | Your chosen username |
| **Password** | Your chosen password |

4. Scroll down to **Location settings** and adjust to your preference (see suggestions below).
5. Press the **back arrow** to return to the main screen.

> 💡 Paste tip: Go back to your registration page, tap **Copy** next to the Server URL, switch to the μlogger settings, and paste it.

---

## Step 4 — Start tracking

1. On the main screen, tap the **+** icon (or "New track").
2. Give your track a name (e.g., "Holiday 2026", "Morning Commute").
3. Tap the **▶ Start** button.
4. The app will record your location in the background.
5. When you're done, tap **■ Stop**.

> ⚠️ **IMPORTANT: Battery Settings**
> For the app to work while your screen is off, you must do two things:
> 1. Set location permissions to **"Allow all the time"** (Settings → Apps → μlogger → Permissions → Location).
> 2. **Disable Battery Optimization** for μlogger so your phone doesn't kill it in the background.

---

## Step 5 — View your tracks on the Map

Open the MapExplorer website:

> **`https://mapexplorer.duckdns.org/`**

1. Log in with your **username and password**.
2. Tap the **Settings** panel at the bottom.
3. Tap **Sync Ulogger** to manually import your tracks, OR tap **Auto-Sync: OFF** to set up background syncing.
4. You will only see your own tracks!

---

## Recommended location settings

| Setting | Walking / cycling | Driving / trips |
|---|---|---|
| Minimum time | 10 seconds | 30 seconds |
| Minimum distance | 5 metres | 20 metres |
| GPS provider | network,gps | network,gps |

Shorter intervals give more detail but use slightly more battery.

---

## Troubleshooting

**The app says "Authentication failed"**
Double-check the Server URL has no trailing slash (`/`) and matches exactly. Make sure you typed your password correctly.

**My tracks aren't appearing on the map**
Check the app is actively recording (it should show a persistent notification). Make sure you clicked **Sync Ulogger** on the website to import the latest data.

**I forgot my password**
If you forget your password, you will need to ask the admin to reset your account. (Unlike the old system, passwords are now secure and cannot be retrieved).
