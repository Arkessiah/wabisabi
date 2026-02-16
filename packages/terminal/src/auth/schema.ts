/**
 * WabiSabi Auth Schemas
 *
 * Zod schemas for authentication configuration and OAuth device flow.
 * All sensitive tokens are validated as non-empty strings to prevent
 * accidental storage of blank credentials.
 */

import { z } from "zod";

export const AuthProviderSchema = z.enum(["substratum", "github", "apikey"]);

export const AuthConfigSchema = z.object({
  provider: AuthProviderSchema,
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  expiresAt: z.number().optional(),
  userId: z.string().optional(),
  email: z.string().email().optional(),
});

export const DeviceCodeResponseSchema = z.object({
  deviceCode: z.string().min(1),
  userCode: z.string().min(1),
  verificationUri: z.string().url(),
  expiresIn: z.number().int().positive(),
  interval: z.number().int().positive().default(5),
});

export type AuthProvider = z.infer<typeof AuthProviderSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type DeviceCodeResponse = z.infer<typeof DeviceCodeResponseSchema>;
