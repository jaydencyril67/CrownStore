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
- Live app catalogue with search and category filters for KingsHall, HallsChat and CryBots.
- App details with package ID, version, build number, APK size, publication date, changelog and SHA-256 checksum when a verified release exists.
- Direct APK downloads through the API's release-checked redirect; unreleased apps never show fake download links.
- Token-protected publisher panel for importing and verifying official GitHub Release assets.

Configure ApiCrownStore's CORS allowlist to include the deployed storefront origin before launch. The frontend does not need database or GitHub publishing credentials.
