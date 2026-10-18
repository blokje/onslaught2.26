// Minimal event emitter used by Game (on/off/emit). Listener errors never break the simulation.
import type { GameEventName, GameEvents } from '../types.ts';

type Listener<K extends GameEventName> = (payload: GameEvents[K]) => void;

export class Emitter {
  map: Map<GameEventName, Listener<GameEventName>[]>;

  constructor() {
    this.map = new Map();
  }
  on<K extends GameEventName>(name: K, fn: Listener<K>): () => void {
    let a = this.map.get(name) as Listener<K>[] | undefined;
    if (!a) this.map.set(name, (a = []) as Listener<GameEventName>[]);
    a.push(fn);
    return () => this.off(name, fn);
  }
  off<K extends GameEventName>(name: K, fn: Listener<K>): void {
    const a = this.map.get(name) as Listener<K>[] | undefined;
    if (!a) return;
    const i = a.indexOf(fn);
    if (i >= 0) a.splice(i, 1);
  }
  has(name: GameEventName): boolean {
    const a = this.map.get(name);
    return !!a && a.length > 0;
  }
  emit<K extends GameEventName>(name: K, payload: GameEvents[K]): void {
    const a = this.map.get(name) as Listener<K>[] | undefined;
    if (!a || a.length === 0) return;
    const list = a.length === 1 ? a : a.slice();
    for (let i = 0; i < list.length; i++) {
      try {
        list[i](payload);
      } catch (err) {
        if (typeof console !== 'undefined') console.error(`[Game] listener for "${name}" threw`, err);
      }
    }
  }
}
