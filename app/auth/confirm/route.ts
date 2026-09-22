import { type NextRequest, NextResponse } from "next/server";
import { recordLogin } from "@/lib/auth/actions";
import { env } from "@/lib/env";
import { getSupabase } from "@/lib/supabase/server";
import { emailOtpType } from "@/lib/validation";

/** Magic-link landing. The OTP path at /verify is the fallback that works in
 *  in-app browsers, which is why both ship (ADR 0002). */
export async function GET(request: NextRequest) {
  // Redirects are built from the configured origin, never from the request's.
  // A forwarded Host header must not be able to choose where a freshly
  // authenticated participant lands.
  const origin = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = emailOtpType.safeParse(searchParams.get("type"));

  if (!tokenHash || !type.success) {
    return NextResponse.redirect(`${origin}/login?error=link`);
  }

  const supabase = await getSupabase();
  const { error } = await supabase.auth.verifyOtp({ type: type.data, token_hash: tokenHash });

  if (error) return NextResponse.redirect(`${origin}/login?error=link`);

  await recordLogin();
  return NextResponse.redirect(`${origin}/`);
}
