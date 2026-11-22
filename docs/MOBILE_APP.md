# SEN mobile release — installation only

The owner requires all existing ERP modules, database and features to remain untouched. This supersedes the broader first local candidate. No GitHub push, production access or deployment has occurred for this task.

## Included scope

- Signed Android2.0 APK, versionCode4, package `bd.com.sen.erp.mobile`, minSDK26/targetSDK36. A Trusted Web Activity opens `https://www.sen.com.bd/?source=android` in the user's compatible browser. The existing SEN release certificate is retained for update compatibility.
- New `/app` download/instructions page, one homepage download section and one footer link. CSS selectors apply only to those new app elements. Apple installation metadata is confined to the new `/app` page.
- Existing web manifest receives installation icons, scope/id and app shortcuts; its original startURL, name, display and theme remain unchanged.
- `/.well-known/assetlinks.json` supplies the public Android association. An exact-path APK response header rule affects only `/downloads/sen-android-2.0.0.apk`.
- No native password database or JavaScript credential bridge. Existing website accounts, sessions, access permissions and business workflows remain authoritative.

## Explicitly excluded

All existing dashboard, currency, navigation and chat components are byte-for-byte restored to main PR76. Root layout, package manifest/lockfile, application libraries, authentication, server actions, APIs and SQL/migration files remain unchanged. Global mobile styling, dashboard search changes, chat behavior changes, currency hydration fixes and dependency security upgrades from the first candidate are excluded from this release.

No service worker, private-data cache, offline request handling, transaction queue or automatic retry is installed. The Android app and iPhone home-screen web app use the existing online ERP without modifying its features. Known pre-existing defects or dependency advisories require separate authorization and scope; they must not be silently included here.

This mobile release needs **no database migration**. No production data or production credentials have been changed. Earlier testing of the superseded candidate prepared synthetic users and applied already-live schema changes to an existing local test database only; do not describe that local database as never modified. No further database writes are authorized as part of this installation-only revision.

## Build and release

1. Build Android with JDK17, SDK/build-tools36 and Gradle8.13. Supply the existing signing key only through environment variables; never commit credentials. Verify certificate `89:69:BD:BC:9B:17:B8:11:AA:29:74:75:73:6D:AC:50:50:91:88:6D:FC:F9:C8:EE:DB:2A:A4:C7:80:64:54:0F`, versionCode4, signature, alignment, package, permissions and production launch URL. Publish the exact verified APK and its checksum.
2. Run a scope boundary check against base `86050aa895b8c7890dae4fd3b8131c7a76e23bfa`, web build/TypeScript, changed-file lint and anonymous app-page/download/manifest checks. No account creation, permission updates, business writes or migrations are needed for these checks.
3. The separate debug APK (`.preview`) uses local3022 with `adb reverse tcp:3022 tcp:3022`; HTTP local preview safely uses browser-tab fallback. Never disable origin verification or add debug certificates to production assetlinks.
4. After local owner verification/approval, push/PR/merge and follow the existing guarded VPS process. Obtain desk readiness and estimated duration before SSH/sudo. Preserve all existing service settings, database configuration and Murshida Accounts host isolation; only deploy app-related file changes.
5. Primary `www.sen.com.bd/.well-known/assetlinks.json` must return JSON200 without redirect for verified full-screen Android mode. The app uses this existing canonicalwww origin. Any apex routing exception needs a separately reviewed, narrowly scoped web-association change; do not alter existing general redirects or unrelated hosts.
6. Physical Android/iPhone installation testing remains pending. Record APK update/launch, existing login, back/navigation, upload/download, printing/popups and iPhone Safari Share→Add to Home Screen separately from browser emulation. Full-screen TWA verification requires the matching public association file to be live.

Official references: [Android TWA guide](https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2), [Android Browser Helper](https://github.com/GoogleChrome/android-browser-helper), [PWA installation](https://web.dev/learn/pwa/installation).