export const REDIS_KEYS = {
  AUTH_CODE: (email: string) => `auth:${email}`,
  VERIFIED: (email: string) => `verified:${email}`,
  BLOCK: (phone: string) => `block:${phone}`,
  // 세션(sid)별 키 — 유저당 여러 기기(웹·익스텐션) 동시 로그인 지원
  REFRESH_TOKEN: (userId: string, sid: string) => `refreshToken:${userId}:${sid}`,
  MASTER_TOKEN: (userId: string) => `masterToken:${userId}`,
  BLACKLIST: (accessToken: string | undefined) => `blacklist:${accessToken}`,
  WORKSPACE_SYNC: (workspaceId: string) => `workspace:sync:${workspaceId}`,
  INVITE_WORKSPACE: (workspaceId: string) => `inviteCode:${workspaceId}`,
  YJS_DOC: (nodeId: string) => `yjs:doc:${nodeId}`,
  YJS_WS_AWARENESS: (workspaceId: string) => `yjs:ws:awareness:${workspaceId}`,
  WS_PRESENCE: (workspaceId: string) => `ws:presence:${workspaceId}`,
  OAUTH_SIGNUP_TICKET: (ticket: string) => `oauth:signup_ticket:${ticket}`,
  OAUTH_LINK_NONCE: (nonce: string) => `oauth:link_state:${nonce}`
};
