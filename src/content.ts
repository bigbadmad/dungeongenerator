import { Rng } from './rng.js';
import type { TableEntry } from './tables.js';
import type { TrapType } from './types.js';

// ── Monsters ────────────────────────────────────────────────────────────────

export interface MonsterDef {
  name: string;
  plural: string;
  /** Number appearing, as dice: [count, sides, bonus]. */
  number: [number, number, number];
  minLevel: number;
  maxLevel: number;
  weight: number;
}

export const MONSTERS: MonsterDef[] = [
  { name: 'Giant Rat',        plural: 'Giant Rats',        number: [2, 6, 0], minLevel: 1, maxLevel: 2,  weight: 10 },
  { name: 'Kobold',           plural: 'Kobolds',           number: [2, 4, 0], minLevel: 1, maxLevel: 3,  weight: 10 },
  { name: 'Goblin',           plural: 'Goblins',           number: [2, 4, 0], minLevel: 1, maxLevel: 3,  weight: 10 },
  { name: 'Skeleton',         plural: 'Skeletons',         number: [2, 4, 0], minLevel: 1, maxLevel: 4,  weight: 8 },
  { name: 'Giant Centipede',  plural: 'Giant Centipedes',  number: [1, 4, 0], minLevel: 1, maxLevel: 3,  weight: 6 },
  { name: 'Stirge',           plural: 'Stirges',           number: [1, 6, 0], minLevel: 1, maxLevel: 4,  weight: 5 },
  { name: 'Orc',              plural: 'Orcs',              number: [2, 4, 0], minLevel: 2, maxLevel: 5,  weight: 10 },
  { name: 'Zombie',           plural: 'Zombies',           number: [1, 6, 0], minLevel: 2, maxLevel: 5,  weight: 7 },
  { name: 'Giant Spider',     plural: 'Giant Spiders',     number: [1, 3, 0], minLevel: 2, maxLevel: 6,  weight: 5 },
  { name: 'Gnoll',            plural: 'Gnolls',            number: [1, 6, 1], minLevel: 3, maxLevel: 6,  weight: 8 },
  { name: 'Hobgoblin',        plural: 'Hobgoblins',        number: [1, 6, 1], minLevel: 3, maxLevel: 6,  weight: 8 },
  { name: 'Ghoul',            plural: 'Ghouls',            number: [1, 4, 0], minLevel: 3, maxLevel: 7,  weight: 6 },
  { name: 'Bugbear',          plural: 'Bugbears',          number: [1, 4, 1], minLevel: 4, maxLevel: 7,  weight: 7 },
  { name: 'Giant Ant',        plural: 'Giant Ants',        number: [2, 4, 0], minLevel: 4, maxLevel: 7,  weight: 5 },
  { name: 'Ogre',             plural: 'Ogres',             number: [1, 3, 0], minLevel: 5, maxLevel: 9,  weight: 8 },
  { name: 'Wight',            plural: 'Wights',            number: [1, 3, 0], minLevel: 5, maxLevel: 9,  weight: 5 },
  { name: 'Owlbear',          plural: 'Owlbears',          number: [1, 2, 0], minLevel: 5, maxLevel: 9,  weight: 5 },
  { name: 'Minotaur',         plural: 'Minotaurs',         number: [1, 2, 0], minLevel: 6, maxLevel: 10, weight: 5 },
  { name: 'Troll',            plural: 'Trolls',            number: [1, 3, 0], minLevel: 7, maxLevel: 10, weight: 7 },
  { name: 'Wraith',           plural: 'Wraiths',           number: [1, 3, 0], minLevel: 7, maxLevel: 10, weight: 5 },
  { name: 'Hill Giant',       plural: 'Hill Giants',       number: [1, 2, 0], minLevel: 8, maxLevel: 10, weight: 5 },
  { name: 'Vampire',          plural: 'Vampires',          number: [1, 1, 0], minLevel: 9, maxLevel: 10, weight: 3 },
];

export function monsterTable(level: number): TableEntry<string>[] {
  const eligible = MONSTERS.filter(m => level >= m.minLevel && level <= m.maxLevel);
  const pool = eligible.length > 0 ? eligible : MONSTERS.filter(m => m.minLevel <= level).slice(-4);
  return pool.map(m => ({
    weight: m.weight,
    value: m.name,
    label: `${m.plural} (${m.number[0]}d${m.number[1]}${m.number[2] ? `+${m.number[2]}` : ''})`,
  }));
}

/** Every monster, for the roll-override dropdowns (which are level independent). */
export function allMonsterOptions(): TableEntry<string>[] {
  return MONSTERS.map(m => ({ weight: m.weight, value: m.name, label: m.plural }));
}

export function describeMonsters(name: string, rng: Rng): string {
  const def = MONSTERS.find(m => m.name === name);
  if (!def) return name;
  const [n, sides, bonus] = def.number;
  let count = bonus;
  for (let i = 0; i < n; i++) count += rng.int(1, sides);
  count = Math.max(1, count);
  return `${count} ${count === 1 ? def.name : def.plural}`;
}

// ── Treasure ────────────────────────────────────────────────────────────────

export type TreasureKind =
  | 'copper_silver'
  | 'gold'
  | 'gems'
  | 'jewellery'
  | 'potion'
  | 'scroll'
  | 'magic_weapon'
  | 'magic_item';

export function treasureTable(level: number): TableEntry<TreasureKind>[] {
  const lv = Math.min(Math.max(level, 1), 10);
  return [
    { weight: Math.max(5, 30 - lv * 3), value: 'copper_silver', label: 'Copper and silver coins' },
    { weight: 25,                       value: 'gold',          label: 'Gold coins' },
    { weight: 10 + lv,                  value: 'gems',          label: 'Gems' },
    { weight: 5 + lv,                   value: 'jewellery',     label: 'Jewellery' },
    { weight: 6,                        value: 'potion',        label: 'Potion' },
    { weight: 5,                        value: 'scroll',        label: 'Scroll' },
    { weight: 2 + lv,                   value: 'magic_weapon',  label: 'Magic weapon or armour' },
    { weight: 1 + lv,                   value: 'magic_item',    label: 'Miscellaneous magic item' },
  ];
}

const GEMS = ['agate', 'garnet', 'jade', 'pearl', 'opal', 'sapphire', 'ruby', 'emerald'];
const JEWELLERY = ['silver ring', 'gold bracelet', 'jewelled goblet', 'ivory comb', 'electrum torc', 'platinum circlet'];
const POTIONS = ['healing', 'speed', 'invisibility', 'giant strength', 'poison (unlabelled)', 'levitation', 'gaseous form'];
const SCROLLS = ['one spell', 'two spells', 'protection from undead', 'a map to another level', 'cursed text'];
const MAGIC_WEAPONS = ['+1 sword', '+1 dagger', '+1 shield', '+1 chain mail', '+1 arrows (2d6)', '+2 mace', '-1 cursed sword'];
const MAGIC_ITEMS = ['ring of protection', 'wand of magic missiles', 'boots of elvenkind', 'bag of holding', 'rope of climbing', 'amulet (unknown)'];

export function describeTreasure(kind: TreasureKind, level: number, rng: Rng): string {
  const lv = Math.min(Math.max(level, 1), 10);
  switch (kind) {
    case 'copper_silver':
      return `${rng.int(1, 6) * 100 * Math.ceil(lv / 2)} cp and ${rng.int(1, 6) * 50 * Math.ceil(lv / 2)} sp`;
    case 'gold':
      return `${rng.int(2, 12) * 25 * lv} gp`;
    case 'gems': {
      const n = rng.int(1, 4);
      const gem = rng.pick(GEMS);
      return `${n} ${gem}${n > 1 ? 's' : ''} (${rng.int(1, 6) * 10 * lv} gp each)`;
    }
    case 'jewellery':
      return `${rng.pick(JEWELLERY)} (${rng.int(1, 10) * 50 * lv} gp)`;
    case 'potion':
      return `Potion of ${rng.pick(POTIONS)}`;
    case 'scroll':
      return `Scroll: ${rng.pick(SCROLLS)}`;
    case 'magic_weapon':
      return rng.pick(MAGIC_WEAPONS);
    case 'magic_item':
      return rng.pick(MAGIC_ITEMS);
  }
}

/** Every treasure kind, for the roll-override dropdowns. */
export function allTreasureOptions(): TableEntry<TreasureKind>[] {
  return treasureTable(5);
}

// ── Special rooms ───────────────────────────────────────────────────────────

export const SPECIAL_FEATURE: TableEntry<string>[] = [
  { weight: 10, value: 'fountain',   label: 'Fountain: water runs red; drinking it heals 1d6 hp or poisons (50/50)' },
  { weight: 10, value: 'altar',      label: 'Altar to a forgotten god; desecrating it draws a curse' },
  { weight: 8,  value: 'mirror',     label: 'Magic mirror that shows a different room when touched' },
  { weight: 8,  value: 'idol',       label: 'Idol with gem eyes (worth 500 gp each), guarded by a curse' },
  { weight: 8,  value: 'library',    label: 'Ruined library: 1d4 readable books, one is a spellbook' },
  { weight: 8,  value: 'forge',      label: 'Cold forge and anvil; tools still usable' },
  { weight: 8,  value: 'throne',     label: 'Throne of black stone; sitting on it grants a vision (and a geas)' },
  { weight: 8,  value: 'well',       label: 'Deep well; a faint voice answers from far below' },
  { weight: 8,  value: 'teleporter', label: 'Teleport pad linked to a random room in the dungeon' },
  { weight: 8,  value: 'statues',    label: 'Garden of life-sized stone figures — some are petrified adventurers' },
  { weight: 8,  value: 'oracle',     label: 'Entombed oracle who answers one question per visitor, at a price' },
];

// ── Traps ───────────────────────────────────────────────────────────────────

export const TRAP_DETAIL: Record<TrapType, string> = {
  pit: 'Hidden pit, 10 ft deep (1d6 damage); save vs. paralysis to avoid',
  spiked_pit: 'Spiked pit, 10 ft deep (2d6 damage); save vs. paralysis to avoid',
  chute: 'Sloping chute drops victims to the level below',
  teleporter: 'Teleports victims to a random spot elsewhere in the dungeon',
  gas: 'Poison gas fills the room (save vs. poison or take 2d6 damage)',
  flooding: 'Doors seal and the room floods over 6 rounds',
  ceiling_block: 'Stone block falls from the ceiling (3d6 damage); save vs. paralysis for half',
  dart: 'Poisoned darts (1d3 each) from the walls; save vs. poison or die',
  spear: 'Spears thrust from the floor (1d8 damage)',
  pendulum_blade: 'Swinging scythe blade (2d6 damage) crosses the room every round',
  rolling_rock: 'Boulder rolls down the passage (4d6 damage); save for half',
  portcullis_drop: 'Portcullis drops behind the party, trapping them inside',
};

export function trapDetail(type: TrapType): string {
  return TRAP_DETAIL[type];
}
