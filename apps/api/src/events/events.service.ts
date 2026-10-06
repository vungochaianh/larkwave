import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { SseEvent } from '@larkwave/shared';

/**
 * In-process pub/sub keyed by buildId. The pipeline publishes live events;
 * the SSE controller subscribes a connected client. Single-instance only —
 * for multi-instance, swap the emitter for Redis pub/sub.
 */
@Injectable()
export class EventsService {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(buildId: string, event: SseEvent): void {
    this.emitter.emit(buildId, event);
  }

  subscribe(buildId: string, listener: (event: SseEvent) => void): () => void {
    this.emitter.on(buildId, listener);
    return () => {
      this.emitter.off(buildId, listener);
    };
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
