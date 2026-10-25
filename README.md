# gruvtimer

Speedcubing timer in the spirit of Twisty Timer / Prisma Puzzle Timer. One TypeScript code base for web,
Android (Capacitor) and, later, iOS.

## Run

```
npm install
npm run dev        # web, http://localhost:5173
npm test           # statistics unit tests
npm run android    # builds android/app/build/outputs/apk/debug/app-debug.apk
```

The Capacitor CLI needs Node 22+. The `android` script borrows Node 22 through `npx -p node@22`, so you can
stay on Node 20. Once you upgrade Node, `npx cap sync android` works directly.
iOS: `npx cap add ios` on a Mac.

## Sessions

A session is every solve of one local calendar day for one puzzle + category. Restarting the app or switching
puzzles and back continues the same session; it rolls over at midnight.

## Storage and sync

| where | what | format |
|---|---|---|
| on the device | one record per solve and per category, plus settings | IndexedDB (web and Android webview) |
| server | the same records, per user | PocketBase collections `solves`, `categories` |
| export / import | everything at once | `solves.json` (below) |

Each solve is its own record because sync works per record. A single JSON file would be rewritten in
full (4 MB+) on every solve, and two devices would conflict on the whole file instead of on one solve.
`solves.json` stays the portable backup and exchange format.

Sync works offline first:

- New records get a client-side PocketBase id (15 chars, a-z0-9), so they can be created offline.
- Local changes mark records `dirty`. Push upserts them through the PocketBase batch API, 200 per request,
  so the first upload of a big history is quick.
- Deletes are tombstones (`deleted = true`), so they reach the other devices.
- Pull fetches `updated >= cursor` per collection.
- Sync runs on start, after every change (debounced), on realtime events, when the server
  reconnects, when the app comes back to the foreground, every 5 minutes, and every 30 s while offline.
- Conflicts: last write wins. A pull never overwrites a local change that hasn't been pushed yet.
- Logging out keeps all data on the device and marks it unsynced, so the next login uploads it.

Settings (theme, timer options, graph lines) stay per device.

### solves.json

```json
{
  "format": "gruvtimer-solves",
  "version": 1,
  "categories": { "333": ["Normal", "OH"] },
  "solves": [
    {"id":"…","puzzle":"333","category":"Normal","time":12345,"penalty":"none","scramble":"R U R' …","date":"2026-10-24T18:00:00.000Z","comment":"optional"}
  ]
}
```

- `time` is the raw time in ms, without the penalty. `penalty` is `none`, `+2` or `dnf`.
- Import skips solves it already has, matched by id or by puzzle + date + time.
- csTimer exports: `node scripts/import-cstimer.mjs <export.txt> solves.json`, then Settings → Import.

## Server

[`server/`](server) holds the PocketBase schema (`pb_migrations/`) and a Docker image that also serves
the web app:

GitHub Actions builds the image for `linux/amd64` and `linux/arm64` and pushes it to
`ghcr.io/elrosch/gruvtimer-pocketbase` (`latest` from main, plus `X.Y.Z` for releases). Pull it, or build
the image locally:

```
docker compose -f server/docker-compose.yml up -d     # http://<server>:8091 (host port set in the compose file)
docker build -f server/Dockerfile -t ghcr.io/elrosch/gruvtimer-pocketbase .   # optional local build
```

- Open the installer link from the container logs to create the superuser, or set `PB_ADMIN_EMAIL` and
  `PB_ADMIN_PASSWORD`.
- Users sign up in the app (Settings → Sync → Create account) or in the dashboard at `/_/`.
- Every record belongs to its user, and the API rules only let users see their own records.
- The Android app needs an **https** server URL: a cleartext http URL is blocked by the webview.

Local development: run PocketBase 0.40.5 with
`pocketbase serve --migrationsDir=server/pb_migrations --http=127.0.0.1:8091`.

## CI and releases

- **CI** (`.github/workflows/ci.yml`, every push and pull request):
  - lint, unit tests and web build
  - applies the PocketBase schema to a fresh server
  - builds an Android APK, downloadable from the run as `gruvtimer-apk`
- **Server image** (`server-image.yml`): builds the Docker image and pushes it on main and on version tags.
- **Releases:**
  1. Add a section to `CHANGELOG.md`.
  2. Commit "Release X.Y.Z" and tag `vX.Y.Z`.
  3. Publish a GitHub release for the tag. `release.yml` builds the APK with versionName `X.Y.Z` and
     versionCode `X*1000000 + Y*1000 + Z`, and attaches it.
- **APK signing:** set the secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` to sign with your own key. Without them the APK is signed
  with a debug key.

## Code map

- `src/lib/stats.ts` – WCA averages (mo3, ao5…ao1000), rolling series, session summary
- `src/lib/graph.ts` – graph series (per solve / per session-day), histogram
- `src/lib/db.ts` – local IndexedDB records
- `src/lib/sync.ts` – PocketBase sync engine
- `src/lib/storage.ts` – solves.json export/import, settings, migration from the old file storage
- `src/lib/store.tsx` – app state, sessions, categories
- `server/` – PocketBase migrations, Dockerfile, compose file
- `src/components/` – Timer, History, Stats, Settings, solve dialog
- `src/theme.css` – gruvbox dark/light palette

## Contributing

Issues and pull requests are welcome. For bigger changes, please open an issue first so we can agree on the
approach. Before you open a pull request, run `npm run lint`, `npm test` and `npm run build`. CI runs the same
checks. By contributing you agree that your contribution is licensed under GPL-3.0-or-later.

## Security

Please don't report security problems in public issues. Report them privately through the repository's
**Security** tab → *Report a vulnerability*.

## License and credits

gruvtimer is free software under the [GNU General Public License v3.0 or later](LICENSE).

- Inspired by [Twisty Timer](https://github.com/aricneto/TwistyTimer) and Prisma Puzzle Timer. No code
  is taken from either.
- Scrambles and scramble images by [cubing.js](https://github.com/cubing/cubing.js) (MPL-2.0 / GPL-3.0).
- Colours from [Gruvbox](https://github.com/morhetz/gruvbox) (MIT).

`npm run build` writes the notices of all bundled third-party packages to `dist/THIRD_PARTY_LICENSES.txt`.
That file ships in the web app, the APK and the Docker image, and is shown in Settings → About →
Open-source licenses. The Docker image also contains the PocketBase license.
