# Phase 26 verification — performance, accessibility, SEO and PWA/mobile quality

Status: repository implementation complete; Cloudflare runtime measurements remain the authoritative deployment gate.

## Implemented controls

- Replaced runtime Google Fonts stylesheet loading with `next/font` self-hosting and `display: swap`.
- Added shared metadata base, title template, Open Graph/Twitter metadata, canonical metadata, Organization/WebSite JSON-LD, robots policy, sitemap and PWA manifest.
- Preserved the existing database-backed sitemap entries for active TLDs and published blog posts while adding missing public discovery routes.
- Added a same-origin service worker with deliberately conservative caching: authenticated/admin/checkout/API routes are never persisted for offline use.
- Added a polished offline route and an online/offline status announcement. Payments and mutations are explicitly described as connection-dependent.
- Added keyboard skip navigation, stronger focus defaults, reduced-motion handling, minimum interactive target sizing and mobile-safe form sizing.
- Added AVIF/WebP preference for `next/image`, responsive table overflow and cache controls for the service worker/icon.
- Added 192 px, 512 px and maskable PWA icon assets plus a global loading state suitable for slow networks.

## Safety invariants

1. Service-worker navigation caching is restricted to public same-origin pages.
2. `/admin`, `/api`, `/checkout`, `/dashboard`, login and password-recovery routes are network-only and are never cached by the service worker.
3. Service-worker registration is progressive enhancement and cannot prevent the application from loading.
4. SEO discovery excludes authenticated and operational surfaces.
5. No UI claim states that checkout or provider actions work offline.
6. Existing dynamic sitemap discovery for real TLD/blog data is preserved.

## Static review performed

- Root metadata uses the existing `APP_URL` contract and defaults to `https://getsawa.app`.
- New TypeScript/TSX files use Next.js App Router metadata route types.
- PWA cache logic only handles `GET` and same-origin requests.
- Service-worker and Next configuration JavaScript passed local JavaScript syntax checks. Full application type/build verification remains unavailable in the isolated local runtime because repository dependencies cannot be downloaded there and GitHub Actions allowance is exhausted.
- No provider credentials or runtime secrets were introduced into public assets.

## Cloudflare staging gate still required

After Phase 28 creates staging, verify the deployed artifact with real network/runtime evidence:

1. Run Lighthouse/mobile tests for the homepage, domain search, product catalog, login and representative dashboard pages.
2. Record Core Web Vitals (LCP, INP, CLS) and fix regressions before launch.
3. Test keyboard-only navigation and a screen reader across public navigation, forms, dialogs, tables and checkout.
4. Test 320 px mobile, tablet and desktop widths and browser text zoom to 200%.
5. Test offline navigation, reconnect behavior and service-worker upgrade/unregister behavior.
6. Validate `robots.txt`, `sitemap.xml`, `manifest.webmanifest`, metadata, JSON-LD and canonical URLs on staging, then repeat on production after Phase 29.
7. Confirm the deployed app is installable in supported Chromium browsers using the committed 192 px, 512 px and maskable icon assets.

Phase 26 is repository-complete when these changes are committed. Runtime performance/accessibility/installability evidence remains a Phase 28/30 launch gate and must not be claimed before measurement.
