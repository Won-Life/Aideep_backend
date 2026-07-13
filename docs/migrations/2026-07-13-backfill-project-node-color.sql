-- =====================================================================
-- Migration: backfill-project-node-color (이슈 #52)
-- Date: 2026-07-13
-- Target: PostgreSQL
-- Idempotent: 같은 SQL을 여러 번 실행해도 안전.
--   - content->>'color'가 이미 있는 노드는 WHERE에서 제외됨
--   - 팔레트 폴백은 node_id 해시 기반 결정적 선택이라 재실행해도 동일한 색
--
-- 내용
--   content->>'color'가 없는 PROJECT 노드(soft delete 제외)에 대해:
--   (1) 자식 노드(edges: source=부모, target=자식)가 있으면
--       엣지 생성순으로 첫 번째 자식의 content->>'color' / 'textColor'를 상속
--   (2) 자식이 없거나 자식도 색이 없으면
--       디자인 시스템 9색 팔레트에서 node_id 해시로 한 쌍 지정
--   (팔레트 출처: AiDeep-web src/features/graph/constants/colors.ts COLOR_PALETTE)
--
-- 적용 방법
--   psql "$DATABASE_URL" -f docs/migrations/2026-07-13-backfill-project-node-color.sql
-- 또는 prisma 환경:
--   pnpm exec prisma db execute --file docs/migrations/2026-07-13-backfill-project-node-color.sql --schema prisma/schema.prisma
--
-- 주의: 적용 후 Redis의 WORKSPACE_SYNC:* 캐시에 옛 content가 남아 있을 수
--       있으므로 해당 키들을 flush해야 클라이언트에 즉시 반영된다.
-- =====================================================================

BEGIN;

WITH palette AS (
  SELECT * FROM (VALUES
    (0, 'rgb(var(--ds-sub-gray))',   'rgb(var(--ds-text-gray))'),
    (1, 'rgb(var(--ds-sub-red))',    'rgb(var(--ds-text-red))'),
    (2, 'rgb(var(--ds-sub-orange))', 'rgb(var(--ds-text-orange))'),
    (3, 'rgb(var(--ds-sub-yellow))', 'rgb(var(--ds-text-yellow))'),
    (4, 'rgb(var(--ds-sub-green))',  'rgb(var(--ds-text-green))'),
    (5, 'rgb(var(--ds-sub-mint))',   'rgb(var(--ds-text-mint))'),
    (6, 'rgb(var(--ds-sub-blue))',   'rgb(var(--ds-text-blue))'),
    (7, 'rgb(var(--ds-sub-purple))', 'rgb(var(--ds-text-purple))'),
    (8, 'rgb(var(--ds-sub-pink))',   'rgb(var(--ds-text-pink))')
  ) AS p(idx, color, text_color)
),
targets AS (
  SELECT
    n.node_id,
    child.color      AS child_color,
    child.text_color AS child_text_color,
    ((('x' || substr(md5(n.node_id::text), 1, 8))::bit(32)::int & 2147483647) % 9) AS palette_idx
  FROM nodes n
  LEFT JOIN LATERAL (
    SELECT
      c.content ->> 'color'     AS color,
      c.content ->> 'textColor' AS text_color
    FROM edges e
    JOIN nodes c
      ON c.node_id = e.target_id
     AND c.deleted_at IS NULL
    WHERE e.source_id = n.node_id
      AND e.deleted_at IS NULL
      AND c.content ->> 'color' IS NOT NULL
    ORDER BY e.created_at
    LIMIT 1
  ) child ON true
  WHERE n.node_type = 'PROJECT'
    AND n.deleted_at IS NULL
    AND (n.content IS NULL OR n.content ->> 'color' IS NULL)
)
UPDATE nodes n
SET
  content = COALESCE(n.content, '{}'::jsonb)
            || jsonb_build_object(
                 'color',     COALESCE(t.child_color, p.color),
                 'textColor', COALESCE(t.child_text_color, p.text_color)
               ),
  updated_at = now()
FROM targets t
JOIN palette p ON p.idx = t.palette_idx
WHERE n.node_id = t.node_id;

COMMIT;
