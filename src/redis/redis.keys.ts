export const REDIS_KEYS = {
  AUTH_CODE: (email: string) => `auth:${email}`,
  VERIFIED: (email: string) => `verified:${email}`,
  BLOCK: (phone: string) => `block:${phone}`,
  REFRESH_TOKEN: (userId: string) => `refreshToken:${userId}`,
  BLACKLIST: (accessToken: string | undefined) => `blacklist:${accessToken}`
};
