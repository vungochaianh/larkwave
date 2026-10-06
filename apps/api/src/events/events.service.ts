import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

/**
 * In-process pub/sub: per-user channels (chat, notifications, relay results) and per-user
 * desktop AGENT command channels. Single-instance only — for multi-instance, swap the
 * emitter for Redis pub/sub.
 */
@Injectable()
export class EventsService {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  /** Per-user channel (chat etc.) — pushed to a user's connected SSE stream. */
  publishUser(userId: string, payload: unknown): void {
    this.emitter.emit(`u:${userId}`, payload);
  }

  subscribeUser(userId: string, listener: (payload: unknown) => void): () => void {
    const ch = `u:${userId}`;
    this.emitter.on(ch, listener);
    return () => {
      this.emitter.off(ch, listener);
    };
  }

  /** Per-user AGENT command channel — pushed to a user's connected desktop SSE
   *  command stream (the remote-run relay). Mirrors publishUser/subscribeUser. */
  publishAgent(userId: string, payload: unknown): void {
    this.emitter.emit(`agent:${userId}`, payload);
  }

  subscribeAgent(userId: string, listener: (payload: unknown) => void): () => void {
    const ch = `agent:${userId}`;
    this.emitter.on(ch, listener);
    return () => {
      this.emitter.off(ch, listener);
    };
  }
}
