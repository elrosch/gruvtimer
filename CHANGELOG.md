# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.4] - 2026-10-27

### Added

- The screen stays on during inspection and while the timer runs, so the
  phone no longer locks during long solves. It can lock normally again once
  the timer stops. Needs a browser with the Screen Wake Lock API; the web app
  must be served over HTTPS.

## [0.1.3] - 2026-10-25

### Changed

- New app icon: a 3x3 cube in gruvbox colours, for the Android launcher and as
  the web app's favicon.
- The source code is now public at https://github.com/elrosch/gruvtimer, and the
  server image can be pulled from ghcr.io without logging in.

## [0.1.2] - 2026-10-25

### Fixed

- Scrambles failed in the built app (web app from the server, Docker image and
  APK) with "Module worker instantiation failed"; only the development server
  worked. Scramble generation now works in all builds.

## [0.1.1] - 2026-10-25

### Changed

- The Android APK is now signed with the release key instead of the debug
  key. Android cannot update an app across signing keys, so uninstall 0.1.0
  before installing 0.1.1 (export your solves or sync them first).

## [0.1.0] - 2026-10-25

First release.

### Added

- Timer with hold-to-start (adjustable, or off for tap-to-start), optional WCA
  inspection with automatic +2/DNF, hide-time-while-running, and a
  configurable timer key with a key test that detects mod-tap keys.
- WCA scrambles and scramble images for 2x2–7x7, Clock, Megaminx, Pyraminx,
  Skewb and Square-1 (cubing.js), with custom categories per puzzle.
- Sessions: all solves of one day on one puzzle + category, continued across
  restarts and puzzle switches.
- Prisma-style statistics: count, best, worst, mean, average, σ, current and
  best mo3/ao5/ao12/ao50/ao100/ao1000 (WCA rules), copyable session summary.
- Graphs for the session and for all solves over 7d/30d/90d/1y/all/custom
  windows, per solve or per session, with selectable series; lines break at
  breaks longer than 30 days. The session graph is also on the timer screen.
- History grouped by day with ao5/ao12 per solve; edit penalty, comment or
  delete solves.
- Gruvbox dark and light themes; navigation at the bottom on phones and on the
  left in wider windows.
- `solves.json` export/import and a csTimer converter
  (`scripts/import-cstimer.mjs`).
- Offline-first sync between devices through a self-hosted PocketBase server,
  with a Docker image that also serves the web app.
- Android app (Capacitor).
- Licensed under GPL-3.0-or-later; version, license and all third-party
  notices in Settings → About.
