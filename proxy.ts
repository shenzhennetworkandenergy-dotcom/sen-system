import { NextResponse, type NextRequest } from "next/server";
import { ACCOUNTS_REQUEST_PATH, accountsHost, isAccountsRoute } from "@/lib/murshida-manzil/accounts-routing";
import { propertiesCookieHeader } from "@/lib/murshida-manzil/properties-access";

export function proxy(request: NextRequest) {
  const incoming = new Headers(request.headers);
  incoming.delete(ACCOUNTS_REQUEST_PATH);
  if (!accountsHost(request.headers)) return NextResponse.next({ request: { headers: incoming } });
  if (!isAccountsRoute(request.nextUrl.pathname)) return new NextResponse("Not found", { status: 404 });
  incoming.set(ACCOUNTS_REQUEST_PATH, request.nextUrl.pathname + request.nextUrl.search);
  incoming.delete("authorization");
  // A member's Properties session cannot authenticate an unrelated ERP Server Action.
  incoming.set("cookie", propertiesCookieHeader(request.headers.get("cookie") ?? ""));
  const response = NextResponse.next({ request: { headers: incoming } });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("X-Frame-Options", "DENY");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
