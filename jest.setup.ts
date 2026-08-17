import '@testing-library/jest-dom';

// NextResponse extends the web Response class at module-evaluation time. Jest's
// isolated Node environment does not consistently expose these globals even on
// Node releases that ship fetch, so use the exact primitives bundled by Next.
import {
  fetch as edgeFetch,
  Headers as EdgeHeaders,
  Request as EdgeRequest,
  Response as EdgeResponse,
} from 'next/dist/compiled/@edge-runtime/primitives';

Object.assign(globalThis, {
  fetch: globalThis.fetch ?? edgeFetch,
  Headers: globalThis.Headers ?? EdgeHeaders,
  Request: globalThis.Request ?? EdgeRequest,
  Response: globalThis.Response ?? EdgeResponse,
});
