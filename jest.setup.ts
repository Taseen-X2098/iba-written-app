import '@testing-library/jest-dom';

// NextResponse extends the web Response class at module-evaluation time. Jest's
// isolated Node environment does not consistently expose these globals even on
// Node releases that ship fetch, so use the exact primitives bundled by Next.
// UI tests run in jsdom and provide their own browser-facing mocks; loading the
// server primitives there would require replacing jsdom's entire Web API set.
if (typeof window === 'undefined') {
  const {
    fetch: edgeFetch,
    Headers: EdgeHeaders,
    Request: EdgeRequest,
    Response: EdgeResponse,
  } = require('next/dist/compiled/@edge-runtime/primitives') as typeof import('next/dist/compiled/@edge-runtime/primitives');

  Object.assign(globalThis, {
    fetch: globalThis.fetch ?? edgeFetch,
    Headers: globalThis.Headers ?? EdgeHeaders,
    Request: globalThis.Request ?? EdgeRequest,
    Response: globalThis.Response ?? EdgeResponse,
  });
}
