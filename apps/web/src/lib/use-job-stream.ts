'use client';
import { useEffect, useMemo, useReducer, useRef } from 'react';

export const WS_PROTOCOL_VERSION = 1 as const;

export interface ProgressFrame<P = Record<string, unknown>> {
  v: typeof WS_PROTOCOL_VERSION;
  job_id: string;
  step: string;
  message: string;
  progress: number | null;
  payload: P | null;
  ts: number;
}

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

interface State {
  status: ConnectionState;
  events: ProgressFrame[];
  latestByStep: Record<string, ProgressFrame>;
  latestByGroup: Record<string, ProgressFrame>;
}

type Action =
  | { type: 'status'; status: ConnectionState }
  | { type: 'event'; frame: ProgressFrame }
  | { type: 'reset'; events?: ProgressFrame[] };

const INITIAL: State = {
  status: 'idle',
  events: [],
  latestByStep: {},
  latestByGroup: {},
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'status':
      return { ...state, status: action.status };
    case 'event': {
      const group = action.frame.step.split(':')[0] ?? action.frame.step;
      return {
        ...state,
        events: [...state.events, action.frame],
        latestByStep: { ...state.latestByStep, [action.frame.step]: action.frame },
        latestByGroup: { ...state.latestByGroup, [group]: action.frame },
      };
    }
    case 'reset':
      return action.events?.reduce((next, frame) => reducer(next, { type: 'event', frame }), INITIAL) ?? INITIAL;
  }
}

export interface UseJobStreamOpts {
  wsUrl: string | null;
  initialEvents?: Omit<ProgressFrame, 'v'>[];
  pingMs?: number;
  retryDelayMs?: number;
}

export function useJobStream({ wsUrl, initialEvents = [], pingMs = 20_000, retryDelayMs = 2000 }: UseJobStreamOpts) {
  const seededEvents = useMemo(
    () => initialEvents.map((event) => ({ ...event, v: WS_PROTOCOL_VERSION })),
    [initialEvents],
  );
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const wsRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedByUserRef = useRef(false);

  useEffect(() => {
    if (!wsUrl) return;
    closedByUserRef.current = false;
    dispatch({ type: 'reset', events: seededEvents });

    function connect() {
      dispatch({ type: 'status', status: 'connecting' });
      const ws = new WebSocket(wsUrl!);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        dispatch({ type: 'status', status: 'open' });
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ v: WS_PROTOCOL_VERSION, type: 'ping', ts: Date.now() }));
          }
        }, pingMs);
      };

      ws.onmessage = async (ev) => {
        try {
          const frame = JSON.parse(await readMessageData(ev.data)) as ProgressFrame & { type?: string };
          if (frame?.type === 'hello' || frame?.type === 'pong') return;
          if (typeof frame?.step !== 'string') return;
          dispatch({ type: 'event', frame });
        } catch { /* drop malformed */ }
      };

      const cleanup = () => {
        if (pingTimerRef.current) {
          clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
        }
      };

      ws.onclose = () => {
        cleanup();
        dispatch({ type: 'status', status: 'closed' });
        if (!closedByUserRef.current) {
          retryTimerRef.current = setTimeout(connect, retryDelayMs);
        }
      };
      ws.onerror = () => {
        cleanup();
        dispatch({ type: 'status', status: 'error' });
      };
    }

    connect();

    return () => {
      closedByUserRef.current = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
      try { wsRef.current?.close(1000); } catch {}
      wsRef.current = null;
    };
  }, [wsUrl, seededEvents, pingMs, retryDelayMs]);

  return useMemo(() => ({
    status:        state.status,
    events:        state.events,
    latestByStep:  state.latestByStep,
    latestByGroup: state.latestByGroup,
    isOpen:        state.status === 'open',
  }), [state]);
}

async function readMessageData(data: MessageEvent['data']) {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (data instanceof Blob) return data.text();
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  throw new Error('unsupported ws payload');
}
