# SEN Android 2.0

Full SEN website in an Android Trusted Web Activity (Google's Android Browser Helper 2.7.4). All roles retain their existing server permissions. Browser handles sign-in, password manager, uploads, downloads, camera permissions, printing and new windows. There is no native credential store or JavaScript bridge. An updated compatible browser is required; unsupported or unverified origins fall back to a browser tab with visible origin.

Production: `https://www.sen.com.bd/?source=android`. Website serves `.well-known/assetlinks.json` on both SEN origins using the **existing SEN release signing certificate**. An APK signed with another key must not be published under this package. Version code 4 succeeds archived versions 1–3; use the same release key for updates.

Use JDK 17, Android SDK 36 / build-tools 36.0.0, Gradle 8.13. Run `gradle testDebugUnitTest lintRelease assembleRelease --no-daemon` from this directory. Supply `SEN_RELEASE_KEYSTORE`, `SEN_RELEASE_STORE_PASSWORD`, `SEN_RELEASE_KEY_ALIAS`, `SEN_RELEASE_KEY_PASSWORD` in the build process environment. No secrets belong in source or command arguments. A missing signing configuration fails release builds.

Local preview APK has separate package `.preview`; the launcher is overridden in its debug source set for local loopback. Use `adb reverse tcp:3022 tcp:3022` with the local server at 3022. Local HTTP is never a verified full-screen TWA; a browser tab is expected. Do not add debug certificates or localhost to production assetlinks. Do not disable origin verification on a user's device.

Before publishing: verify APK signature against the existing registry certificate, ZIP alignment, minimum/target SDK, launch URL, package/version, requested permissions, endpoint and protected credentials absence; run website production build and mobile browser flows. A physical Android phone and iPhone installation check should be recorded separately from browser emulation. Full-screen verified Android behavior also needs the matching website assetlinks deployed and verified.

Website remains online-only. This release adds no service worker, response caching, background sync, transaction queue or ERP database. Existing modules are loaded directly from the existing SEN site without changing their code or data.
