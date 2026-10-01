import type { PulseEvent } from './types.ts';

type EventHandler = (event: PulseEvent) => void;

export class EventBus {
  private listeners: Set<EventHandler> = new Set();
  private pending: Set<ReturnType<typeof setTimeout>> = new Set();
  
  // Debug mode for the event inspector
  public debugMode: boolean = false;

  public subscribe(handler: EventHandler): () => void {
    if (this.listeners.has(handler)) {
      if (this.debugMode) console.warn('[EventBus] duplicate subscription ignored');
      return () => {};
    }
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  public unsubscribe(handler: EventHandler): void {
    this.listeners.delete(handler);
  }

  public get listenerCount(): number {
    return this.listeners.size;
  }

  public clearPending(): void {
    for (const timer of this.pending) clearTimeout(timer);
    this.pending.clear();
  }

  public emit(event: PulseEvent): void {
    if (this.debugMode) {
      console.log(`[EventBus] ${event.type} | source: ${event.source} | priority: ${event.priority} | id: ${event.id}`);
    }

    // Dispatch asynchronously to prevent blocking the provider loop
    const timer = setTimeout(() => {
      this.pending.delete(timer);
      for (const listener of this.listeners) {
        try {
          listener(event);
        } catch (e) {
          console.error(`[EventBus] Error in event listener:`, e);
        }
      }
    }, 0);
    this.pending.add(timer);
  }
}

// Export a singleton instance of the Event Bus
export const pulseEventBus = new EventBus();
