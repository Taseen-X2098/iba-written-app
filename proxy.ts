import { NextResponse, type NextRequest } from "next/server";

const AUTH_PATHS = [
  "/login",
  "/signup",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
];

function hasSupabaseSession(request: NextRequest) {
  return request.cookies.getAll().some(({ name, value }) =>
    Boolean(value) && name.startsWith("sb-") && name.includes("auth-token"),
  );
}

// Next.js Proxy is intentionally an optimistic cookie router. It performs no
// network or database work; protected layouts and route handlers validate the
// user beside the data access they protect.
export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/api")) return NextResponse.next();
  const authPath = AUTH_PATHS.some((path) => pathname.startsWith(path));
  const hasSession = hasSupabaseSession(request);

  if (!hasSession && !authPath) {
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

