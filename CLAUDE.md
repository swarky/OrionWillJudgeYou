# OrionofJudgment

## Overview
A Chrome extension that displays a cat image whenever you spend enough time on certain websites.

## Architecture
- **Manifest V3** Chrome extension.
- A **background service worker** manages timers per tab and broadcasts show/hide messages.
- A **content script** runs on `<all_urls>` so the cat overlay is visible on every open tab, not just the monitored ones. (Chrome blocks content scripts on `chrome://` pages and the new tab page — cat won't appear there.)
- An **options page** (accessible via right-click on the extension icon → "Options") lets the user configure websites and timing.

## Features

### Cat Overlay
- After the timer expires on a monitored site, a picture of the cat slides up from the bottom of the browser on **every open tab**.
- Position: **bottom-left**, with a **200px margin from the left edge**.
- Size: **500×500px** max (twice the original size — intentionally bothersome).
- Animation duration: **1.2 seconds** (slide in / slide out).
- Once triggered, the cat is visible on **every tab** — the user cannot escape it by switching tabs.
- The cat disappears only when the monitored tab **navigates to a non-monitored URL** or is **closed**.
- The timer pauses when the user switches away from the monitored tab and resumes when they return to it.

### Image
- The cat image file is located in the project root.
- Supported filenames (tried in order): `cat.png`, `cat.jpg`, `cat.jpeg`.
- The extension uses whichever file is present.

### Timer
- The countdown starts when the monitored page is opened.
- The timer **only ticks while the tab is focused**. It pauses automatically when the user switches to another tab (`visibilitychange`) and resumes when they come back.
- Default: **2 minutes**.

### Monitored Websites
- Default: `reddit.com` and `x.com`.
- Configurable via the options page.

### Options Page
- **Sites**: a textbox listing monitored domains, separated by `;` (e.g. `reddit.com;x.com;youtube.com`).
- **Timing**: a number-only textbox for the countdown duration in minutes.
- Settings are saved to `chrome.storage.sync`.

## File Structure
```
OrionofJudging/
├── manifest.json       # Extension config (MV3)
├── background.js       # Service worker — timer logic, tab tracking, broadcast
├── content.js          # Injected into all pages — renders and animates the cat overlay
├── options.html        # Options page UI
├── options.js          # Options page logic
├── cat.jpeg            # Cat image (or cat.jpg / cat.png)
└── CLAUDE.md
```
