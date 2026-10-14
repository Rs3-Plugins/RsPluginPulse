import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { buildAuthorizeUrl, setStateCookie } from "@/lib/discordAuth";

// Reached via a real top-level browser navigation (the "Log in with
// Discord" button does `window.location.href = ...`, not a fetch) -- CORS
// doesn't apply to navigations, only to XHR/fetch, so this route needs none.
export async function GET() {
  const state = randomBytes(24).toString("base64url");
  const response = NextResponse.redirect(buildAuthorizeUrl(state), { status: 302 });
  setStateCookie(response, state);
  return response;
}
