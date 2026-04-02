import { useState, useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

export function DebugPanel() {
  const [editor] = useLexicalComposerContext();
  const [json, setJson] = useState('');

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      setJson(JSON.stringify(editorState.toJSON(), null, 2));
    });
  }, [editor]);

  return (
    <div className="ne-debug">
      <div className="ne-debug-header">Editor State (JSON)</div>
      <pre className="ne-debug-content">{json}</pre>
    </div>
  );
}
