/**
 * Minimales `localStorage` für die Node-Testumgebung — `progress.ts` spricht
 * den Browser-Store direkt an, jsdom/happy-dom brauchen wir dafür nicht.
 * Wird pro Testdatei einmal geladen; einzelne Tests räumen selbst über
 * `localStorage.clear()` in `beforeEach` auf.
 */
class MemoryStorage {
  #map = new Map<string, string>();
  get length(): number {
    return this.#map.size;
  }
  clear(): void {
    this.#map.clear();
  }
  getItem(key: string): string | null {
    return this.#map.has(key) ? this.#map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.#map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.#map.delete(key);
  }
  key(i: number): string | null {
    return [...this.#map.keys()][i] ?? null;
  }
}

if (!("localStorage" in globalThis)) {
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    writable: true,
  });
}
