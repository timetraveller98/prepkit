import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig, PUBLIC_ROUTES } from "./auth.config";

const { auth } = NextAuth(authConfig);

export default auth((request) => {
  const signedIn = Boolean(request.auth?.user);
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_ROUTES.has(pathname)) {
    if (!signedIn) return NextResponse.next();
    return NextResponse.redirect(new URL("/kits", request.nextUrl));
  }

  if (!signedIn) {
    const url = new URL("/login", request.nextUrl);
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|backend|_next/static|_next/image|favicon.ico|.*\\.svg).*)"],
};
