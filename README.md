This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Internal Auth Note

Admin API routes under `/api/internal/admin/*` rely on browser cookies. Avoid rewriting or stripping cookies in middleware/proxy handling for those paths.

## Central affiliate and payment ledger

LineScout sends idempotent payment and referral events to the Sure Imports ledger. Configure the same `LINESCOUT_LEDGER_SECRET` in both applications. It also verifies the signed, 30-day cross-subdomain attribution bridge created by the main Sure Imports referral link. `SUREIMPORTS_LEDGER_ENDPOINT` may be set for local testing; production defaults to the canonical Sure Imports endpoint. Apply `npm run affiliate:migrate-outbox` before enabling the cron. The one-time account migration additionally requires `AFFILIATE_DATABASE_URL` and `AFFILIATE_SECURITY_KEY`, then runs with `npm run affiliate:migrate-accounts`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
