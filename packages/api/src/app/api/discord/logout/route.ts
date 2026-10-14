import { NextResponse } from "next/server";
import { SESSION_COOKIE, clearSessionCookie, discordCorsHeaders, discordCorsOptions, endSession, readCookie } from "@/lib/discordAuth";

export async function OPTIONS(request: Request) {
  return discordCorsOptions(request);
}

export async function POST(request: Request) {
  const sessionId = readCookie(request, SESSION_COOKIE);
  if (sessionId) await endSession(sessionId);

  const response = NextResponse.json({ ok: true }, { headers: discordCorsHeaders(request) });
  clearSessionCookie(response);
  return response;
}
