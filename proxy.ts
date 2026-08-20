import { NextResponse, type NextRequest } from "next/server";

const AUTH_PATHS = [
  "/login",
  "/signup",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
];

const PUBLIC_PATHS = ["/subscription"];

function hasSupabaseSession(request: NextRequest) {
  return request.cookies.getAll().some(({ name, value }) =>
    Boolean(value) && name.startsWith("sb-") && name.includes("auth-token"),
  );
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isTrustedBrowserMutation(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const expectedHost = forwardedHost || request.headers.get("host") || request.nextUrl.host;
    return originUrl.host.toLowerCase() === expectedHost.toLowerCase();
  } catch {
    return false;
  }
}

// Next.js Proxy is intentionally an optimistic cookie router. It performs no
// network or database work; protected layouts and route handlers validate the
// user beside the data access they protect.
export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/api")) {
    const isExcludedIntegration = pathname.startsWith("/api/bkash/")
      || pathname.startsWith("/api/webhooks/");
    if (
      !SAFE_METHODS.has(request.method)
      && !isExcludedIntegration
      && hasSupabaseSession(request)
      && !isTrustedBrowserMutation(request)
    ) {
      return NextResponse.json(
        { error: "Cross-site request blocked", code: "FORBIDDEN" },
        { status: 403 },
      );
    }
    return NextResponse.next();
  }
  const authPath = AUTH_PATHS.some((path) => pathname.startsWith(path));
  const publicPath = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const hasSession = hasSupabaseSession(request);

  if (!hasSession && !authPath && !publicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }
  if (hasSession && authPath && !pathname.startsWith("/reset-password") && !pathname.startsWith("/auth/callback")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js|firebase-messaging-sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)",
  ],
};
