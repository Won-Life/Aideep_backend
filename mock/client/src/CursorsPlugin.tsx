import React, { useEffect, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';

interface CursorInfo {
  name: string;
  color: string;
}

interface CursorsPluginProps {
  awareness: Awareness;
}

export function CursorsPlugin({ awareness }: CursorsPluginProps) {
  const [cursors, setCursors] = useState<Map<number, CursorInfo>>(new Map());

  useEffect(() => {
    const update = () => {
      const states = awareness.getStates();
      const localId = awareness.clientID;
      const map = new Map<number, CursorInfo>();

      states.forEach((state, clientId) => {
        if (clientId !== localId && state.user) {
          map.set(clientId, {
            name: state.user.name,
            color: state.user.color,
          });
        }
      });

      setCursors(new Map(map));
    };

    awareness.on('change', update);
    update();

    return () => {
      awareness.off('change', update);
    };
  }, [awareness]);

  // Lexical의 CollaborationPlugin이 커서를 직접 렌더링하므로
  // 여기서는 CSS 변수만 주입 (커서 색상 적용용)
  return (
    <style>
      {Array.from(cursors.entries())
        .map(
          ([id, info]) => `
          .yjs-cursor-${id} {
            --cursor-color: ${info.color};
            border-left-color: ${info.color};
          }
          .yjs-cursor-${id} .yjs-cursor-label {
            background: ${info.color};
          }
        `,
        )
        .join('\n')}
    </style>
  );
}
