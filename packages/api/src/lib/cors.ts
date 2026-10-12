import { NextResponse } from "next/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export function jsonWithCors(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { ...CORS_HEADERS, ...init?.headers } });
}

export function pngWithCors(png: Buffer, init?: ResponseInit) {
  // Buffer's generic ArrayBufferLike parameter doesn't structurally match
  // BodyInit's plain Uint8Array expectation in some @types/node versions;
  // Buffer already *is* a Uint8Array at runtime, this just satisfies TS.
  return new NextResponse(new Uint8Array(png), {
    ...init,
    headers: { ...CORS_HEADERS, "Content-Type": "image/png", ...init?.headers },
  });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
