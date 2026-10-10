import type { FixtureResult } from './league';
import { playFixture } from './simulate';
import type { SimRequest } from './worker';

let shared: SimPool | null = null;
/** One pool for the whole app (league and career share the workers). */
export function sharedPool(): SimPool {
  shared ??= new SimPool();
  return shared;
}

/** A small pool of Web Workers so a whole round simulates in parallel off the main thread. */
export class SimPool {
  private workers: Worker[] = [];
  private queue: { req: SimRequest; resolve: (r: FixtureResult) => void }[] = [];
  private busy = new Map<Worker, (r: FixtureResult) => void>();

  constructor(size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))) {
    try {
      for (let i = 0; i < size; i++) {
        const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        // A worker that fails to load (blocked script, sandbox) hands everything to the main thread.
        w.onerror = () => this.fallBack();
        w.onmessage = (ev: MessageEvent<{ id: number; result: FixtureResult }>) => {
          const done = this.busy.get(w);
          this.busy.delete(w);
          this.inFlight.delete(w);
          done?.(ev.data.result);
          this.pump();
        };
        this.workers.push(w);
      }
    } catch {
      this.workers = []; // fall back to the main thread
    }
  }

  run(req: SimRequest): Promise<FixtureResult> {
    if (!this.workers.length) {
      return new Promise((resolve) => setTimeout(() => resolve(playFixture(req.home, req.away, req.seed, true, req.overrides)), 0));
    }
    return new Promise((resolve) => {
      this.queue.push({ req, resolve });
      this.pump();
    });
  }

  private inFlight = new Map<Worker, SimRequest>();

  private fallBack(): void {
    const pending = [...this.inFlight.entries()].map(([w, req]) => ({ req, resolve: this.busy.get(w)! }));
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.busy.clear();
    this.inFlight.clear();
    for (const job of [...pending, ...this.queue.splice(0)]) {
      setTimeout(() => job.resolve(playFixture(job.req.home, job.req.away, job.req.seed, true, job.req.overrides)), 0);
    }
  }

  private pump(): void {
    for (const w of this.workers) {
      if (this.busy.has(w)) continue;
      const job = this.queue.shift();
      if (!job) return;
      this.busy.set(w, job.resolve);
      this.inFlight.set(w, job.req);
      w.postMessage(job.req);
    }
  }
}
