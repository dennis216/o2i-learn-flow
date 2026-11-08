# O2I Institute

Website: https://www.o2iinstitute.org

Built with Vite, TypeScript, React, shadcn-ui and Tailwind CSS. Data, auth and edge functions live in our own Supabase project (`supabase/`).

## Local development

Requires Node.js and npm.

```sh
npm install
npm run dev     # http://localhost:8080
npm run build   # production build into dist/
```

## Deployment (Cloudflare Pages)

Cloudflare Pages is connected to this GitHub repository and builds on every push.

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |
| Production branch | `main` → https://www.o2iinstitute.org |

- Every other branch gets its own preview URL, e.g. `test-work` → `test-work.<project>.pages.dev`.
- Preview sites use the **same Supabase database** as production. Use test accounts there and avoid deleting or publishing real content.
- Rollback: Cloudflare dashboard → the Pages project → Deployments → pick a previous deployment → Rollback.
- New site URLs must be added to Supabase → Authentication → URL Configuration → Redirect URLs, or sign-up confirmation and password reset links will fail.

## Domain

`o2iinstitute.org` is registered at Hostinger and expires 2027-01-27. Keep auto-renew on.
