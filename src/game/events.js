// Minimal event emitter used by Game (on/off/emit). Listener errors never break the simulation.
export class Emitter {
  constructor() {
    this.map = new Map();
  }
  on(name, fn) {
    let a = this.map.get(name);
    if (!a) this.map.set(name, (a = []));
    a.push(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    const a = this.map.get(name);
    if (!a) return;
    const i = a.indexOf(fn);
    if (i >= 0) a.splice(i, 1);
  }
  has(name) {
    const a = this.map.get(name);
    return !!a && a.length > 0;
  }
  emit(name, payload) {
    const a = this.map.get(name);
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
