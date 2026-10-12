import { NextResponse } from "next/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export function jsonWithCors(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { ...CORS_HEADERS, ...init?.headers } });
}

export function svgWithCors(svg: string, init?: ResponseInit) {
  return new NextResponse(svg, {
    ...init,
    headers: { ...CORS_HEADERS, "Content-Type": "image/svg+xml; charset=utf-8", ...init?.headers },
  });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
