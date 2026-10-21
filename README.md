# CrownStore

The public CrownStore website for official KingsHall applications. Built with React, TypeScript and Vite. The storefront reads its app catalogue and stable release metadata from ApiCrownStore; it does not hard-code or fabricate download links.

## Local setup
1. Install Node.js 20 or newer.
2. Copy .env.example to .env and set VITE_API_BASE_URL to the API base URL. For local development, use http://localhost:4000.
3. Run npm install.
4. Run npm run dev.

## Scripts
- npm run dev — local development server
- npm run build — production type-check and build
- npm run preview — preview the production build
- npm run typecheck — TypeScript validation

## Cloudflare Pages deployment
- Repository: this CrownStore repository
- Root directory: /
- Build command: npm install && npm run build
- Output directory: dist
- Environment variable: VITE_API_BASE_URL=https://api.crownstore.kingshall.online

## Storefront capabilities
- Live app catalogue with search, category filters and app shelves; app records are loaded from ApiCrownStore, not hardcoded into the frontend.
- App details include package ID, release version, build number, APK size, publication date, changelog, screenshots and SHA-256 when available.
- Direct APK downloads go through the API's release-checked redirect; unreleased or hidden apps never display a download button.
- Token-protected **Manage Apps** panel to create, edit, and hide catalogue entries, including icon and screenshot URLs.
- Token-protected **Publisher** panel that loads the current catalogue dynamically and imports verified APK releases without hardcoded app choices.

## App administration and publishing
1. Open **Manage Apps** in the storefront footer and provide the Render `PUBLISHING_TOKEN`.
2. Load the catalogue to add a new application or edit an existing entry. Use a lowercase hyphenated slug, the exact Android package ID, a GitHub source repository in `owner/repo` format, and publicly reachable HTTPS icon/screenshot URLs.
3. Keep apps listed to make them public. Hiding an app removes it from the public catalogue without deleting its release history.
4. Create a stable GitHub Release with the APK attached in the public `jaydencyril67/CrownStoreApk` repository, then use **Publisher** to verify and publish it. The APK is checked against the app package and manifest version before CrownStore enables downloads.

The frontend never embeds the admin token or database credentials. The administrator enters the token into the management panel, and it is held in UI state for that session. Configure ApiCrownStore's CORS allowlist to include the deployed storefront origin.
