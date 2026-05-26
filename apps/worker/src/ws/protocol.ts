export const PROTOCOL_VERSION = 1 as const;

export interface ProgressFrame<P = Record<string, unknown>> {
  v: typeof PROTOCOL_VERSION;
  job_id: string;
  step: string;
  message: string;
  progress: number | null;
  payload: P | null;
  ts: number;
}

export interface HelloFrame {
  v: typeof PROTOCOL_VERSION;
  type: 'hello';
  job_id: string;
  replayed: number;
}

export interface PongFrame { v: 1; type: 'pong'; ts: number }

export type OutboundFrame = ProgressFrame | HelloFrame | PongFrame;
export type InboundFrame  = { v: 1; type: 'ping'; ts: number };

export function encodeFrame(frame: OutboundFrame): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(frame));
}

export function decodeFrame(data: Uint8Array | string): InboundFrame | null {
  try {
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
    const obj = JSON.parse(text) as InboundFrame;
    return obj?.v === PROTOCOL_VERSION ? obj : null;
  } catch {
    return null;
  }
}
