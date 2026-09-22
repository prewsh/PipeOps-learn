import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { recordLogin } from "@/lib/auth/actions";
import { getSupabase } from "@/lib/supabase/server";

/** Magic-link landing. The OTP path at /verify is the fallback that works in
 *  in-app browsers, which is why both ship (ADR 0002). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/login?error=link`);
  }

  const supabase = await getSupabase();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) return NextResponse.redirect(`${origin}/login?error=link`);

  await recordLogin();
  return NextResponse.redirect(`${origin}/`);
}
