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

### Local Railway behavior

Set this in `.env.local` to make `npm run dev` launch the same process roles used
in Railway:

```dotenv
USE_MOCK_RAILWAY=true
```

This starts the Next.js web server and the grading worker on port `8080`. The
web server talks to the worker through localhost, and Ctrl+C stops the complete
stack. Set `USE_MOCK_RAILWAY=false` (or remove it) to run only Next.js, or use
`npm run dev:web` explicitly.

The local stack still uses the Supabase and Upstash resources configured in the
environment. Use staging resources when testing finalization or grading. Useful
optional overrides are `LOCAL_GRADING_WORKER_PORT` and
`LOCAL_RAILWAY_REPLICA_ID`.

### Real OpenAI grading

Mock grading uses the local `get_rubric` function. Real grading uses OpenAI's
hosted file search and requires the vector store that contains the rubrics:

```dotenv
USE_MOCK_GRADER=false
OPENAI_API_KEY=sk-...
OPENAI_VECTOR_IBA_WRITTEN=vs_...
```

Both values stay server-side. After configuring them, run the fixed 15-answer
comparison suite with `npm run eval:grading`. It verifies the vector store,
grades every AI-supported writing type, and writes
`evaluation/grading/latest-report.json`. The submissions and human-proposed
score bands are kept in separate files under `evaluation/grading/` so the
proposed scores are never included in model input. Translation remains a
manual-review type and is intentionally excluded.

### Z.ai OCR

Z.ai OCR uses one server-side API key; there is no separate API ID. To switch
between the local OCR stub and the real GLM-OCR endpoint, set:

```dotenv
Z_AI_MOCK=false
Z_AI_API_KEY=your-z-ai-api-key
```

Set `Z_AI_MOCK=true` for local OCR. Real and mock OCR both require an
authenticated, authorized question and at least one remaining test slot. OCR
does not consume that slot. Successful results are deduplicated by image hash,
while burst and generous daily provider limits protect against bulk misuse
without imposing a retry limit on an individual answer.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
