import { NextRequest } from "next/server";

import { proxy } from "@/proxy";

const SESSION_COOKIE = "sb-project-auth-token=session-value";

function mutation(path: string, options?: { origin?: string; fetchSite?: string; cookie?: boolean }) {
  const headers = new Headers({ host: "app.example.test" });
  if (options?.cookie !== false) headers.set("cookie", SESSION_COOKIE);
  if (options?.origin) headers.set("origin", options.origin);
  if (options?.fetchSite) headers.set("sec-fetch-site", options.fetchSite);
  return new NextRequest(`https://app.example.test${path}`, { method: "POST", headers });
}

describe("proxy request-boundary CSRF protection", () => {
  it("allows an authenticated same-origin API mutation", () => {
    const response = proxy(mutation("/api/grade", { origin: "https://app.example.test", fetchSite: "same-origin" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("blocks an authenticated cross-origin API mutation", async () => {
    const response = proxy(mutation("/api/grade", { origin: "https://evil.example", fetchSite: "cross-site" }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Cross-site request blocked", code: "FORBIDDEN" });
  });

  it("leaves unauthenticated requests for route-level authentication", () => {
    const response = proxy(mutation("/api/grade", { origin: "https://evil.example", fetchSite: "cross-site", cookie: false }));
    expect(response.status).toBe(200);
  });

  it("does not alter bKash integration requests", () => {
    const response = proxy(mutation("/api/bkash/create", { origin: "https://evil.example", fetchSite: "cross-site" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows server-to-server webhook requests", () => {
    const response = proxy(mutation("/api/webhooks/push", { cookie: false }));
    expect(response.status).toBe(200);
  });
});
