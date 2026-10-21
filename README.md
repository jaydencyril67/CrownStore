# CrownStore

The public CrownStore website for official KingsHall applications. Built with React, TypeScript and Vite.

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

Configure the API CORS allowlist to include the deployed storefront origin before launch.

The site uses live API data and displays clear loading, error, search and empty states. It does not invent app listings or fake download links.
