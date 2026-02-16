/**
 * WabiSabi JWT Token Utilities
 *
 * Client-side JWT decoding and expiry checks.
 * Tokens are decoded WITHOUT signature verification -- the server is the
 * authority. These helpers only drive UX decisions (refresh, re-login prompts).
 *
 * SECURITY: Never trust decoded claims for authorization decisions on the
 * client. They are used solely for token lifecycle management.
 */

export interface JwtPayload {
  sub?: string;
  exp?: number;
  iat?: number;
  email?: string;
  [key: string]: unknown;
}

/**
 * Base64-url decode a single segment of a JWT.
 * Handles the padding that standard atob / Buffer.from expects.
 */
function decodeBase64Url(segment: string): string {
  // Replace URL-safe chars and restore padding
  const padded = segment
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(segment.length + ((4 - (segment.length % 4)) % 4), "=");

  return Buffer.from(padded, "base64").toString("utf-8");
}

/**
 * Decode a JWT payload without verifying the signature.
 * Returns null for malformed tokens instead of throwing, so callers
 * can treat invalid tokens as "not authenticated".
 */
export function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    return JSON.parse(decodeBase64Url(parts[1])) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Check whether a JWT has passed its `exp` claim.
 * Treats tokens without an `exp` claim as non-expiring (returns false).
 */
export function isExpired(token: string): boolean {
  const payload = decodeJwt(token);
  if (!payload?.exp) return false;
  return Math.floor(Date.now() / 1000) >= payload.exp;
}

/**
 * Check whether a JWT should be proactively refreshed.
 * Default buffer is 300 seconds (5 minutes) so the user never hits
 * a hard expiry mid-request.
 */
export function needsRefresh(token: string, bufferSeconds = 300): boolean {
  const payload = decodeJwt(token);
  if (!payload?.exp) return false;
  return Math.floor(Date.now() / 1000) >= payload.exp - bufferSeconds;
}
