// [OS3] 3D view: procedural instanced meshes for turrets and attackers.
// Every shape is a unit geometry (z up, standing on z = 0 or centred, see SHAPES) drawn through one THREE.InstancedMesh,
// so the 3D view adds about ten draw calls no matter how many units there are. Per instance: position, yaw, scale and
// colour. Materials are Lambert (one sun + ambient light) and transparent, so three.js sorts them by renderOrder with
// the sprite batches instead of drawing them before the ground.

import * as THREE from 'three';

export class MeshBatch {
  mesh: THREE.InstancedMesh;
  capacity: number;
  count = 0;
  _m = new THREE.Matrix4();
  _c = new THREE.Color();
  constructor(geometry: THREE.BufferGeometry, capacity: number, order: number, opts: { opacity?: number; emissive?: number } = {}) {
    const op = opts.opacity ?? 1;
    const mat = new THREE.MeshLambertMaterial({
      color: 0xffffff, transparent: true, opacity: op, depthTest: true, depthWrite: op >= 1,
      emissive: new THREE.Color(opts.emissive ?? 0, opts.emissive ?? 0, opts.emissive ?? 0),
    });
    this.capacity = capacity;
    this.mesh = new THREE.InstancedMesh(geometry, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, this._c.setRGB(1, 1, 1)); // creates instanceColor
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }
  begin(): void { this.count = 0; }
  /** World position (x right, y down, z up), yaw `rot` (world angle, as the sprites use it), scale (sx, sy, sz), colour. */
  add(x: number, y: number, z: number, rot: number, sx: number, sy: number, sz: number, r: number, g: number, b: number): void {
    if (this.count >= this.capacity) return;
    // world angle a (y down) is -a around three.js z (y up); the shapes point along +x
    const c = Math.cos(-rot), s = Math.sin(-rot);
    this._m.set(
      c * sx, -s * sy, 0, x,
      s * sx, c * sy, 0, -y,
      0, 0, sz, z,
      0, 0, 0, 1,
    );
    this.mesh.setMatrixAt(this.count, this._m);
    this.mesh.setColorAt(this.count, this._c.setRGB(r, g, b));
    this.count++;
  }
  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = this.count > 0;
  }
  dispose(): void { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}

/** Unit cylinder of radius 1 and height 1 standing on z = 0 (z up). */
function cylinder(seg: number, top: number = 1): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(top, 1, 1, seg);
  g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5);
  return g;
}

/** Flat outline (world units, x forward, y down) extruded to height 1 on z = 0..1. */
function slab(pts: [number, number][]): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], i) => { if (i === 0) sh.moveTo(x, -y); else sh.lineTo(x, -y); });
  sh.closePath();
  return new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false });
}
function mantaOutline(): [number, number][] {
  const out: [number, number][] = [];
  const half = (sgn: number): void => {
    for (let i = 0; i <= 8; i++) { const k = i / 8; out.push([10 - 15.4 * k, sgn * (10 * Math.sin(k * Math.PI * 0.5) * (0.35 + 0.65 * k))]); }
    for (let i = 1; i <= 4; i++) { const k = i / 4; out.push([-5.4 - 4 * k, sgn * 10 * (1 - k)]); }
  };
  half(-1);
  const back: [number, number][] = [];
  for (const [x, y] of out.slice(1, -1)) back.push([x, -y]);
  return out.concat(back.reverse());
}

/** The shapes a turret is built from (the solid batches, or the translucent ghost set for the build preview). */
export interface ShapeSet { cyl: MeshBatch; oct: MeshBatch; box: MeshBatch; sph: MeshBatch; tor: MeshBatch }

export interface Meshes {
  /** Turret plinths (cylinder) and bodies. */
  cyl: MeshBatch;
  /** Octagonal drums: modifier dishes, Armored attackers. */
  oct: MeshBatch;
  /** Unit boxes centred on z = 0.5: barrels, launchers, armour plates. */
  box: MeshBatch;
  /** Unit spheres centred at the origin: heads, Runners, Splitter halves, Regenerators. */
  sph: MeshBatch;
  tet: MeshBatch;
  dod: MeshBatch;
  /** Flat torus (ring) around z = 0: Regenerator halo, modifier rings. */
  tor: MeshBatch;
  /** Transparent spheres: shields. */
  shell: MeshBatch;
  /** Wheels: unit cylinder with its axis sideways (local y), centred. */
  wheel: MeshBatch;
  /** Delta-wing and manta outlines extruded to height 1 (sizes in world units at scale 1). */
  delta: MeshBatch;
  manta: MeshBatch;
  /** Translucent copies for the build preview (ghost), drawn after everything solid. */
  ghost: ShapeSet;
  all: MeshBatch[];
  lights: THREE.Object3D[];
}

/** Build the 3D batches and lights and add them to the scene (hidden until used). */
export function buildMeshes(scene: THREE.Scene, order: number): Meshes {
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0, 0.5);
  const m: Meshes = {
    cyl: new MeshBatch(cylinder(20, 0.86), 3000, order),
    oct: new MeshBatch(cylinder(8), 1600, order),
    box: new MeshBatch(box, 8000, order),
    sph: new MeshBatch(new THREE.SphereGeometry(1, 14, 10), 6000, order),
    tet: new MeshBatch(new THREE.TetrahedronGeometry(1), 1600, order),
    dod: new MeshBatch(new THREE.DodecahedronGeometry(1), 200, order),
    tor: new MeshBatch(new THREE.TorusGeometry(1, 0.16, 6, 20), 1600, order),
    shell: new MeshBatch(new THREE.SphereGeometry(1, 16, 12), 1200, order + 0.05, { opacity: 0.32, emissive: 0.15 }),
    wheel: new MeshBatch(new THREE.CylinderGeometry(1, 1, 1, 12), 6000, order),
    delta: new MeshBatch(slab([[10.6, 0], [-6.8, -8.4], [-3.6, 0], [-6.8, 8.4]]), 800, order),
    manta: new MeshBatch(slab(mantaOutline()), 800, order),
    all: [],
    lights: [],
    ghost: null as unknown as ShapeSet, // filled right below (needs the geometries)
  };
  const gOpt = { opacity: 0.6, emissive: 0.3 };
  m.ghost = {
    cyl: new MeshBatch(m.cyl.mesh.geometry, 8, order + 0.2, gOpt), oct: new MeshBatch(m.oct.mesh.geometry, 8, order + 0.2, gOpt),
    box: new MeshBatch(m.box.mesh.geometry, 8, order + 0.2, gOpt), sph: new MeshBatch(m.sph.mesh.geometry, 8, order + 0.2, gOpt),
    tor: new MeshBatch(m.tor.mesh.geometry, 8, order + 0.2, gOpt),
  };
  m.all = [m.cyl, m.oct, m.box, m.sph, m.tet, m.dod, m.tor, m.wheel, m.delta, m.manta, m.shell, m.ghost.cyl, m.ghost.oct, m.ghost.box, m.ghost.sph, m.ghost.tor];
  for (const b of m.all) scene.add(b.mesh);
  const amb = new THREE.AmbientLight(0xffffff, 1.35);
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.1);
  sun.position.set(-0.45, 0.6, 1); // from the upper left, high: shadows fall to the lower right (as the 2D art)
  m.lights = [amb, sun];
  for (const l of m.lights) { l.visible = false; scene.add(l); }
  return m;
}

export function meshesVisible(m: Meshes, on: boolean): void {
  for (const l of m.lights) l.visible = on;
  if (!on) for (const b of m.all) { b.begin(); b.end(); }
}
