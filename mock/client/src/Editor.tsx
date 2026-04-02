import { useMemo, useState, useCallback } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { CollaborationPlugin } from '@lexical/react/LexicalCollaborationPlugin';
import { $convertToMarkdownString } from '@lexical/markdown';
import type { EditorState } from 'lexical';
import type { Provider } from '@lexical/yjs';
import { SocketYjsProvider } from './socket-provider';
import { CursorsPlugin } from './CursorsPlugin';
import { EDITOR_THEME } from './editor/theme';
import { REGISTERED_NODES } from './editor/nodes';
import { TRANSFORMERS } from './editor/transformers';
import { ToolbarPlugin } from './editor/ToolbarPlugin';
import { DebugPanel } from './editor/DebugPanel';

interface EditorProps {
  provider: SocketYjsProvider;
  nodeId: string;
}

function createProviderFactory(socketProvider: SocketYjsProvider) {
  return (id: string, yjsDocMap: Map<string, any>): Provider => {
    yjsDocMap.set(id, socketProvider.doc);
    return socketProvider as unknown as Provider;
  };
}

export function Editor({ provider, nodeId }: EditorProps) {
  const [showDebug, setShowDebug] = useState(false);
  const providerFactory = useMemo(() => createProviderFactory(provider), [provider]);

  const initialConfig = {
    namespace: `ne-${nodeId}`,
    theme: EDITOR_THEME,
    nodes: REGISTERED_NODES,
    onError: (error: Error) => console.error('[NotionEditor]', error),
    editable: true,
  };

  const handleChange = useCallback(
    (editorState: EditorState) => {
      let markdown = '';
      editorState.read(() => {
        markdown = $convertToMarkdownString(TRANSFORMERS);
      });
      // 필요 시 onSave 콜백 호출 가능
      void markdown;
    },
    [],
  );

  return (
    <div className='ne-wrapper'>
      <LexicalComposer initialConfig={initialConfig}>
        <ToolbarPlugin
          showDebug={showDebug}
          onDebugToggle={() => setShowDebug((v) => !v)}
        />
        <div className='ne-editor-scroll'>
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className='ne-root nodrag nowheel'
                spellCheck
              />
            }
            placeholder={
              <div className='ne-placeholder'>
                노트를 작성하세요…{' '}
                <span style={{ color: '#555' }}>(마크다운 단축키 지원)</span>
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
        </div>
        {showDebug && <DebugPanel />}
        <ListPlugin />
        <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
        <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
        <CollaborationPlugin
          id={`yjs-${nodeId}`}
          providerFactory={providerFactory}
          shouldBootstrap={false}
          cursorColor={
            provider.awareness.getLocalState()?.user?.color ?? '#646cff'
          }
          username={
            provider.awareness.getLocalState()?.user?.name ?? 'Anonymous'
          }
        />
        <CursorsPlugin awareness={provider.awareness} />
      </LexicalComposer>
    </div>
  );
}
