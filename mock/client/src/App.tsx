import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Editor } from './Editor';
import { SocketYjsProvider, ConnectionStatus } from './socket-provider';

// 랜덤 색상 생성
const COLORS = [
  '#e06c75',
  '#61afef',
  '#98c379',
  '#d19a66',
  '#c678dd',
  '#56b6c2',
  '#e5c07b'
];
const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

const DEFAULT_SERVER = 'http://localhost:3320';

export default function App() {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER);
  const [token, setToken] = useState('');
  const [workspaceId, setWorkspaceId] = useState(
    '08612bb4-2dd8-471b-9133-bbc213f97aee'
  );
  const [nodeId, setNodeId] = useState('fe0cc873-11ab-44ee-b70f-5f75d9958e33');
  const [userName, setUserName] = useState(
    `User-${Math.random().toString(36).slice(2, 6)}`
  );
  const [userColor] = useState(randomColor);

  const [provider, setProvider] = useState<SocketYjsProvider | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [logs, setLogs] = useState<{ time: string; msg: string }[]>([]);
  const [users, setUsers] = useState<
    Map<number, { name: string; color: string }>
  >(new Map());

  const logRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    setLogs((prev) => [...prev.slice(-100), { time, msg }]);
  }, []);

  // awareness 변경 감지 → 유저 목록 업데이트
  useEffect(() => {
    if (!provider) return;

    const updateUsers = () => {
      const states = provider.awareness.getStates();
      const map = new Map<number, { name: string; color: string }>();
      states.forEach((state, clientId) => {
        if (state.user) {
          map.set(clientId, { name: state.user.name, color: state.user.color });
        }
      });
      setUsers(new Map(map));
    };

    provider.awareness.on('change', updateUsers);
    updateUsers();

    return () => {
      provider.awareness.off('change', updateUsers);
    };
  }, [provider]);

  // 로그 자동 스크롤
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const handleConnect = useCallback(() => {
    if (!token || !workspaceId || !nodeId) {
      addLog('token, workspaceId, nodeId를 모두 입력하세요');
      return;
    }

    const p = new SocketYjsProvider({
      serverUrl,
      token,
      workspaceId,
      nodeId,
      userName,
      userColor
    });

    p.on('status', (e: { status: string }) => {
      setStatus(e.status as ConnectionStatus);
    });
    p.onLog(addLog);
    p.manualConnect();
    setProvider(p);
  }, [serverUrl, token, workspaceId, nodeId, userName, userColor, addLog]);

  const handleDisconnect = useCallback(() => {
    provider?.destroy();
    setProvider(null);
    setStatus('disconnected');
    setUsers(new Map());
    addLog('Provider destroyed');
  }, [provider, addLog]);

  const isConnected = status === 'connected';

  return (
    <div className='container'>
      <h1>Yjs + Lexical Mock Client</h1>

      {/* Connection Panel */}
      <div className='connect-panel'>
        <input
          placeholder='Server URL'
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          disabled={!!provider}
          style={{ width: 180 }}
        />
        <input
          placeholder='JWT Token'
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={!!provider}
          style={{ width: 200 }}
        />
        <input
          placeholder='Workspace ID'
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
          disabled={!!provider}
          style={{ width: 180 }}
        />
        <input
          placeholder='Node ID'
          value={nodeId}
          onChange={(e) => setNodeId(e.target.value)}
          disabled={!!provider}
          style={{ width: 180 }}
        />
        <input
          placeholder='User Name'
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          disabled={!!provider}
          style={{ width: 120 }}
        />
        {!provider ? (
          <button className='btn-connect' onClick={handleConnect}>
            Connect
          </button>
        ) : (
          <button className='btn-disconnect' onClick={handleDisconnect}>
            Disconnect
          </button>
        )}
      </div>

      {/* Status Bar */}
      <div className='status-bar'>
        <span
          className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}
        />
        <span>{status}</span>
      </div>

      {/* Online Users */}
      {users.size > 0 && (
        <div className='users-panel'>
          <span className='users-label'>Online ({users.size}):</span>
          {Array.from(users.entries()).map(([clientId, user]) => (
            <span
              key={clientId}
              className={`user-badge ${clientId === provider?.awareness.clientID ? 'me' : ''}`}
              style={{ background: user.color + '30', color: user.color }}>
              <span className='cursor-dot' />
              {user.name}
              {clientId === provider?.awareness.clientID ? ' (me)' : ''}
            </span>
          ))}
        </div>
      )}

      {/* Lexical Editor */}
      <div className='editor-wrapper'>
        {provider ? (
          <Editor provider={provider} nodeId={nodeId} />
        ) : (
          <div className='editor-container'>
            <div className='editor-placeholder'>
              Connect to start editing...
            </div>
          </div>
        )}
      </div>

      {/* Log Panel */}
      <div className='log-panel' ref={logRef}>
        <h3>Event Log</h3>
        {logs.map((entry, i) => (
          <div className='log-entry' key={i}>
            <span className='timestamp'>{entry.time}</span>
            {entry.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
