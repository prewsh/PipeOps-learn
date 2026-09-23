import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { buildCsp } from "@/lib/csp";

/**
 * Routes reachable without a session. Matched exactly, or as a slash-delimited
 * subtree — never by bare `startsWith`, which made `/loginfoo` and
 * `/auth-anything` public because they share a prefix with a real route.
 */
const PUBLIC_PATHS = ["/login", "/verify", "/auth", "/admin/login"];

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase session on every request and gates the app.
 *
 * There is no public signup route (ADR 0002): an unauthenticated request to
 * anything other than the sign-in flow is redirected to /login.
 *
 * This was `middleware.ts`; Next 16 deprecated that convention and renamed it
 * to `proxy`. Behaviour is unchanged — only the file and export names moved.
 */
export async function proxy(request: NextRequest) {
  // One nonce per request, handed to Next through the request headers so its
  // own script tags carry it, and repeated in the CSP below.
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(
    nonce,
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NODE_ENV !== "production",
  );

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  let response = NextResponse.next({ request: { headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request: { headers } });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && !isPublicPath(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // The staff door must remain reachable with an existing session. An
  // authenticated participant may need to switch into a staff account, and an
  // authenticated admin may simply have landed on the wrong door. The admin
  // layout still performs the role check after authentication.
  // …except when /login is carrying an error. The participant app sends a
  // signed-in person with no active enrolment to /login?error=not-enrolled;
  // bouncing them back to "/" from here looped until the browser gave up.
  const showingError = path === "/login" && request.nextUrl.searchParams.has("error");
  if (user && !showingError && (path === "/login" || path === "/verify")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  response.headers.set("content-security-policy", csp);

  // `no-transform` is a best-effort workaround for possible edge rewriting.
  // Rocket Loader is reported to be enabled for the shared pipeops.app zone,
  // but only a live browser check after deployment can confirm whether this
  // directive prevents its script changes. Keep this response non-cacheable
  // because it is personalized and may carry sign-in state.
  //
  response.headers.set(
    "Cache-Control",
    isPublicPath(path)
      ? "no-store, max-age=0, must-revalidate, no-transform"
      : "private, no-store, max-age=0, must-revalidate, no-transform",
  );

  return response;
}

export const config = {
  // Next's development HMR socket is not an application request. Let the
  // dev server handle it directly; running Supabase refresh and CSP logic on
  // a WebSocket upgrade leaves the browser's HMR connection half-open.
  matcher: [
    "/((?!_next/static|_next/image|_next/hmr|_next/webpack-hmr|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
