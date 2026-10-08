/// <reference lib="webworker" />
import { playFixture, type SideOverrides } from './simulate';

export interface SimRequest {
  id: number;
  home: string;
  away: string;
  seed: number;
  overrides?: SideOverrides;
}

self.onmessage = (ev: MessageEvent<SimRequest>) => {
  const { id, home, away, seed, overrides } = ev.data;
  const result = playFixture(home, away, seed, true, overrides);
  (self as unknown as Worker).postMessage({ id, result });
};
