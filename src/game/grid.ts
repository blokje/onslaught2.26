// Uniform spatial grid (cell 64) rebuilt every simulation step for attacker queries.
import type { Attacker } from '../types.ts';

export class SpatialGrid {
  cell: number;
  cols: number;
  rows: number;
  cells: Attacker[][];

  constructor(width: number, height: number, cell = 64) {
    this.cell = cell;
    this.cols = Math.ceil(width / cell) + 1;
    this.rows = Math.ceil(height / cell) + 1;
    this.cells = [];
    for (let i = 0; i < this.cols * this.rows; i++) this.cells.push([]);
  }

  rebuild(attackers: Attacker[]): void {
    const cells = this.cells;
    for (let i = 0; i < cells.length; i++) cells[i].length = 0;
    const { cell, cols, rows } = this;
    for (let i = 0; i < attackers.length; i++) {
      const a = attackers[i];
      if (a.dead) continue;
      let cx = (a.x / cell) | 0, cy = (a.y / cell) | 0;
      cx = cx < 0 ? 0 : cx >= cols ? cols - 1 : cx;
      cy = cy < 0 ? 0 : cy >= rows ? rows - 1 : cy;
      cells[cy * cols + cx].push(a);
    }
  }

  /**
   * Fills `out` with living attackers whose centre is within r of (x, y); returns the count.
   * (out.length is also set to the count.)
   */
  query(x: number, y: number, r: number, out: Attacker[]): number {
    const { cell, cols, rows, cells } = this;
    let x0 = Math.floor((x - r) / cell), x1 = Math.floor((x + r) / cell);
    let y0 = Math.floor((y - r) / cell), y1 = Math.floor((y + r) / cell);
    x0 = x0 < 0 ? 0 : x0; y0 = y0 < 0 ? 0 : y0;
    x1 = x1 >= cols ? cols - 1 : x1; y1 = y1 >= rows ? rows - 1 : y1;
    const r2 = r * r;
    let n = 0;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = cells[cy * cols + cx];
        for (let i = 0; i < c.length; i++) {
          const a = c[i];
          if (a.dead) continue;
          const dx = a.x - x, dy = a.y - y;
          if (dx * dx + dy * dy <= r2) out[n++] = a;
        }
      }
    }
    out.length = n;
    return n;
  }
}
