import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  sw: "sw.js",
  register: true,
  disable: process.env.NODE_ENV === "development",
  // The home route is personalized and can redirect based on authentication.
  // Never put a user's rendered dashboard in the shared start-url cache.
  cacheStartUrl: false,
  dynamicStartUrl: false,
  reloadOnOnline: false,
  fallbacks: {
    document: "/~offline",
  },
  publicExcludes: ["!firebase-messaging-sw.js", "!firebase-sdk/**/*"],
  workboxOptions: {
    // FCM and offline support must live in the same root-scoped worker. The
    // Firebase worker remains a plain, independently testable public asset.
    importScripts: ["/firebase-messaging-sw.js"],
    skipWaiting: false,
    clientsClaim: true,
    runtimeCaching: [
      {
        urlPattern: /\/_next\/static\/.+\.(?:js|css|woff2?|png|jpg|jpeg|webp|svg)$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "next-static-assets",
          expiration: {
            maxEntries: 128,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          },
        },
      },
      {
        urlPattern: /\.(?:png|jpg|jpeg|gif|svg|ico|webp)$/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "public-images",
          expiration: {
            maxEntries: 64,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          },
        },
      },
      {
        urlPattern: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
        // Authenticated HTML is deliberately never persisted. When the network
        // is unavailable, next-pwa's document fallback serves /~offline.
        handler: "NetworkOnly",
        options: {},
      },
    ],
  },
});

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.120.218.215"],
  // next-pwa is disabled in development, so Turbopack can remain the local
  // bundler while production builds opt into Webpack for worker generation.
  turbopack: {},
  async headers() {
    const serviceWorkerHeaders = [
      { key: "Content-Type", value: "application/javascript; charset=utf-8" },
      { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
      { key: "Service-Worker-Allowed", value: "/" },
    ];

    return [
      { source: "/sw.js", headers: serviceWorkerHeaders },
      { source: "/firebase-messaging-sw.js", headers: serviceWorkerHeaders },
    ];
  },
};

export default withPWA(nextConfig);
