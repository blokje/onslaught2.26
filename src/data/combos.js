// Combo recipes. 16 match the original game's mechanics (see SPEC.md section 6); 4 are new
// designs (marked isNew). Recipes are checked top to bottom within the lead colour's list.
//
// needs: partner counts BESIDES the lead, by colour. exact: counts that must match exactly.
// All numeric damage values are base values, scaled by the lead turret's damage modifiers
// (damage multiplier from modifiers/freak-out). "+chain" means the partner Green's chain damage is added.
// Blast radii: small 40, medium 60, large 80, huge 87.5, bfg 87.5, poison 110.

// How many recent combos each turret remembers (comboLog, shown in the panel's Combos tab).
export const COMBO_LOG_MAX = 5;

export const BLAST_RADIUS = { small: 40, medium: 60, large: 80, huge: 87.5, bfg: 87.5, poison: 110 };

export const COMBOS = {
  red: [
    { id: 'napalm', name: 'Napalm Rocket', isNew: true, needs: { red: 1, blue: 1, yellow: 1 }, recharge: 8000,
      fx: { projectile: 'napalmRocket', speed: 150, hit: 8e6, napalm: { length: 160, duration: 4000, dps: 1.1e7 } } },
    { id: 'nuke', name: 'Nuke', needs: { blue: 2 }, recharge: 7400,
      fx: { projectile: 'nuke', speed: 150, hit: 9e6, blast: { size: 'huge', damage: 6e7 } } },
    { id: 'poisonGas', name: 'Poison Gas Rocket', needs: { green: 1, blue: 1 }, recharge: 5000,
      fx: { projectile: 'poisonRocket', speed: 150, hit: 100, blast: { size: 'poison', damage: 100, poison: 2 } } },
    { id: 'laserRocket', name: 'Laser Rocket', needs: { green: 1 }, recharge: 3000,
      fx: { projectile: 'laserRocket', speed: 100, laser: { damage: 2e6, chain: true, range: 200 }, burst: { qty: 6, damage: 1e6, range: 300 } } },
    { id: 'tazerRocket', name: 'Tazer Rockets', isNew: true, needs: { yellow: 1 }, recharge: 4000,
      fx: { projectile: 'tazerRocket', speed: 200, hit: 5e6, chainSpark: { qty: 6, range: 150, damage: 2e6, poison: 4 } } },
  ],
  green: [
    { id: 'rocketBfg', name: 'Rocket BFG', needs: { red: 2, blue: 1 }, recharge: 9000,
      fx: { projectile: 'bfg', speed: 60, hit: 6.5e6, chain: true, blast: { size: 'bfg', damage: 7.5e6 },
            laser: { damage: 4.5e6, range: 250, rate: 180 }, rockets: { damage: 2e6, range: 300, rate: 120 } } },
    { id: 'bfg', name: 'BFG', needs: { red: 1, blue: 1 }, recharge: 9000,
      fx: { projectile: 'bfg', speed: 60, hit: 5.8e6, chain: true, blast: { size: 'bfg', damage: 7.5e6 },
            laser: { damage: 4.2e6, range: 250, rate: 180 } } },
  ],
  blue: [
    { id: 'bigLaserClusterMine', name: 'Big Laser Cluster Landmine', needs: { red: 2, green: 1, blue: 1 }, recharge: 10800,
      fx: { projectile: 'mine', hit: 7e6, blast: { size: 'large', damage: 9e6 }, cluster: { qty: 10, damage: 2e6, laser: 1e6 } } },
    { id: 'bigClusterMine', name: 'Big Cluster Landmine', needs: { red: 2, blue: 1 }, recharge: 8000,
      fx: { projectile: 'mine', hit: 9e6, blast: { size: 'large', damage: 1.5e7 }, cluster: { qty: 10, damage: 4.5e6 } } },
    { id: 'bigLaserClusterBomb', name: 'Big Laser Cluster Bomb', needs: { red: 2, green: 1 }, recharge: 11400,
      fx: { projectile: 'clusterBomb', speed: 750, hit: 4e6, blast: { size: 'large', damage: 6e6 }, cluster: { qty: 8, damage: 2e6, laser: 9e5, chain: true } } },
    { id: 'bigClusterBomb', name: 'Big Cluster Bomb', needs: { red: 2 }, recharge: 6200,
      fx: { projectile: 'clusterBomb', speed: 750, hit: 8e6, blast: { size: 'large', damage: 8e6 }, cluster: { qty: 10, damage: 4.5e6 } } },
    { id: 'sparkyMine', name: 'Sparky Landmine', needs: { red: 1, blue: 1, yellow: 1 }, recharge: 7000,
      fx: { projectile: 'mine', hit: 9e6, blast: { size: 'small', damage: 1.5e7 }, sparks: { qty: 8, damage: 5e4, poison: 20, range: 220 } } },
    { id: 'sparkyClusterBomb', name: 'Sparky Cluster Bomb', needs: { red: 1, yellow: 1 }, recharge: 5000,
      fx: { projectile: 'clusterBomb', speed: 750, hit: 5e6, blast: { size: 'small', damage: 7e6 }, sparks: { qty: 8, damage: 1e4, poison: 20, range: 220 } } },
    { id: 'laserClusterBomb', name: 'Laser Cluster Bomb', needs: { red: 1, green: 1 }, recharge: 10000,
      fx: { projectile: 'clusterBomb', speed: 750, hit: 2e6, blast: { size: 'medium', damage: 4e6 }, cluster: { qty: 5, damage: 2e6, laser: 7e5, chain: true } } },
    { id: 'bigMine', name: 'Big Landmine', needs: { red: 1, blue: 1 }, recharge: 7000,
      fx: { projectile: 'mine', hit: 9e6, blast: { size: 'large', damage: 1.5e7 } } },
    { id: 'clusterBomb', name: 'Cluster Bomb', needs: { red: 1 }, recharge: 5000,
      fx: { projectile: 'clusterBomb', speed: 750, hit: 5e6, blast: { size: 'small', damage: 7e6 }, cluster: { qty: 6, damage: 3.3e6 } } },
    { id: 'mine', name: 'Landmine', needs: { blue: 1 }, recharge: 7000,
      fx: { projectile: 'mine', hit: 1e7, blast: { size: 'small', damage: 9e6 } } },
  ],
  yellow: [
    { id: 'blackHole', name: 'Black Hole', needs: { yellow: 2, green: 1 }, exact: { green: 1 }, recharge: 18000,
      fx: { blackHole: { placeRange: 90, radius: 120, gravity: 800, duration: 3000 } } },
    { id: 'shockwave', name: 'Shockwave', isNew: true, needs: { yellow: 1, blue: 1, green: 1 }, recharge: 10000,
      fx: { shockwave: { radius: 200, speed: 400, damage: 6.5e6, knockback: 60, poison: 2 } } },
    { id: 'tazerBfg', name: 'Tazer BFG', isNew: true, needs: { red: 1, blue: 1 }, recharge: 9000,
      fx: { projectile: 'bfg', speed: 60, hit: 4e6, blast: { size: 'bfg', damage: 5.5e6, poison: 3 },
            sparks: { qty: 6, damage: 1.5e6, poison: 3, range: 250, rate: 180 } } },
  ],
};

// Mines: road points are sampled every 4 units; a mine lands on a random point within the lead's
// maximum possible range and travels there at 220 units/s, then arms (trigger radius 20).
export const MINE = { sampleStep: 4, travelSpeed: 220, triggerRadius: 20 };
