/** Auth.js / NextAuth session cookies that must die with a full account logout. */

export function isPublicAuthCookieName(name: string) {
  return (
    name.startsWith("authjs.") ||
    name.startsWith("__Secure-authjs.") ||
    name.startsWith("__Host-authjs.") ||
    name.startsWith("next-auth.") ||
    name.startsWith("__Secure-next-auth.") ||
    name.startsWith("__Host-next-auth.")
  );
}

type CookieWriter = {
  set: (
    name: string,
    value: string,
    options?: {
      httpOnly?: boolean;
      secure?: boolean;
      path?: string;
      maxAge?: number;
      expires?: Date;
      sameSite?: "lax" | "strict" | "none";
    },
  ) => unknown;
  delete?: (name: string) => unknown;
};

/** Expire a cookie with attributes that match how Auth.js typically sets it. */
export function expireAuthCookie(
  writer: CookieWriter,
  name: string,
  production = process.env.NODE_ENV === "production",
) {
  const secure = name.startsWith("__Secure-") || name.startsWith("__Host-");
  writer.delete?.(name);
  writer.set(name, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    sameSite: "lax",
    ...(secure || production ? { secure: true } : {}),
  });
}

/**
 * Clear Studio admin + public Auth.js cookies on a Response or cookie store.
 * Used by admin logout so public homepage shows Sign in after refresh.
 */
export function clearAllAuthCookies(
  writer: CookieWriter,
  presentCookieNames: string[],
  adminCookieName: string,
  adminExpireOptions: {
    httpOnly: boolean;
    sameSite: "lax" | "strict" | "none";
    secure: boolean;
    path: string;
  },
) {
  writer.delete?.(adminCookieName);
  writer.set(adminCookieName, "", {
    ...adminExpireOptions,
    maxAge: 0,
    expires: new Date(0),
  });

  for (const name of presentCookieNames) {
    if (name === adminCookieName || isPublicAuthCookieName(name)) {
      expireAuthCookie(writer, name, adminExpireOptions.secure);
    }
  }
}
