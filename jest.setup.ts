import '@testing-library/jest-dom';

if (typeof global.Request === 'undefined') {
  // A minimal polyfill for Jest since we aren't actually running real requests in jsdom
  global.Request = class Request {} as any;
}
