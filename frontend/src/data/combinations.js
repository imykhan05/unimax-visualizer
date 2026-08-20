// Ready-made colour schemes, built from the Unimax shade card.
//
// Each scheme assigns a shade to a surface role, so one photo can be shown in
// every scheme without the customer choosing anything: pick the photo, get the
// board. Roles map to what detection finds — the main wall, the trim bands and
// the gate.

import SHADES from './shades.js';

const byCode = new Map(SHADES.map((s) => [s.code, s]));
const pick = (code) => {
  const s = byCode.get(code);
  if (!s) throw new Error(`Unknown shade code in a scheme: ${code}`);
  return s;
};

const RAW = [
  { name: 'Classic White',  wall: '1101', trim: '1115', gate: 'BLACK' },
  { name: 'Cream & Cocoa',  wall: '1105', trim: '1117', gate: '1117' },
  { name: 'Desert Sand',    wall: '1107', trim: '1113', gate: '1117' },
  { name: 'Terracotta',     wall: '1103', trim: '1114', gate: '1113' },
  { name: 'Peach Sunrise',  wall: '1106', trim: '1112', gate: '1114' },
  { name: 'Rose Blush',     wall: '1104', trim: '1119', gate: '1117' },
  { name: 'Silver Steel',   wall: '1115', trim: '1116', gate: 'BLACK' },
  { name: 'Sky Calm',       wall: '1122', trim: '1123', gate: '1116' },
  { name: 'Garden Fresh',   wall: '1126', trim: '1127', gate: '1116' },
  { name: 'Lilac Evening',  wall: '1124', trim: '1125', gate: '1116' },
  { name: 'Honey Warm',     wall: '1111', trim: '1109', gate: '1117' },
  { name: 'Bold Tile',      wall: '1108', trim: '1121', gate: 'BLACK' },
];

export const COMBINATIONS = RAW.map((c, i) => ({
  id: `scheme-${i + 1}`,
  name: c.name,
  roles: { wall: pick(c.wall), trim: pick(c.trim), gate: pick(c.gate) },
}));

/** The shades a scheme actually uses, de-duplicated, in role order. */
export function schemeShades(scheme, availableRoles) {
  const order = ['wall', 'trim', 'gate'];
  const label = { wall: 'Walls', trim: 'Trim', gate: 'Gate' };
  const seen = new Set();
  const out = [];
  for (const role of order) {
    if (availableRoles && !availableRoles.includes(role)) continue;
    const shade = scheme.roles[role];
    const key = `${shade.code}|${role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...shade, role, roleLabel: label[role] });
  }
  return out;
}

export default COMBINATIONS;
