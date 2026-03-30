// ──────────────────────────────────────────
// Yjs CRDT 상수
// ──────────────────────────────────────────

/** Socket.io 이벤트명 */
export const YJS_EVENT = {
  JOIN: 'yjs:join',
  LEAVE: 'yjs:leave',
  SYNC: 'yjs:sync',
  AWARENESS: 'yjs:awareness'
} as const;

/** 타이머 (ms) */
export const DEBOUNCE_SAVE_MS = 2_000;
export const SAFETY_FLUSH_INTERVAL_MS = 30_000;
export const DOC_IDLE_TIMEOUT_MS = 300_000; // 5분

/** Socket.io room 이름 */
export const yjsRoom = (nodeId: string) => `yjs:${nodeId}`;
