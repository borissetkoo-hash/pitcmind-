/// <reference lib="webworker" />
import { playFixture } from './simulate';

export interface SimRequest {
  id: number;
  home: string;
  away: string;
  seed: number;
}

self.onmessage = (ev: MessageEvent<SimRequest>) => {
  const { id, home, away, seed } = ev.data;
  const result = playFixture(home, away, seed);
  (self as unknown as Worker).postMessage({ id, result });
};
