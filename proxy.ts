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

  if (user && (path === "/login" || path === "/verify" || path === "/admin/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  response.headers.set("content-security-policy", csp);

  // Sign-in screens carry tokens in the query string. Keep every variant out
  // of shared caches, including the ones next.config.ts does not match.
  if (isPublicPath(path)) {
    response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
