// All dimensions are in centimetres. The scene renders 1 unit = 1 cm and the
// whole room group is scaled by 0.01 so three.js works in metres.

export const ROOM = {
	width: 200, // x axis (left → right)
	depth: 240, // z axis (back → front)
	height: 260,
	wallThickness: 10,
} as const;

// Door in the right wall (x = ROOM.width, one of the long 240 cm walls),
// next to the front corner. Hinge on the corner side, opens inward.
export const DOOR = {
	fromCorner: 10, // distance from the front wall to the opening
	width: 80,
	height: 211,
} as const;

/** Door opening along the right wall, in room z (cm from back wall). */
export const DOOR_Z = {
	start: ROOM.depth - DOOR.fromCorner - DOOR.width,
	end: ROOM.depth - DOOR.fromCorner,
} as const;

/** Hinge position in room coordinates. */
export const DOOR_HINGE = { x: ROOM.width, z: DOOR_Z.end } as const;

export type FixtureId = "toilet" | "shower" | "washbasin";

export interface FixtureSpec {
	id: FixtureId;
	name: string;
	/** Footprint width along local x (cm) */
	w: number;
	/** Footprint depth along local z (cm); local -z is the "back" (wall side) */
	d: number;
	/** Overall height (cm) – informational */
	h: number;
	description: string;
	/** Optional display size; defaults to `${w}×${d}` */
	size?: string;
}

export const FIXTURES: Record<FixtureId, FixtureSpec> = {
	toilet: {
		id: "toilet",
		name: "Hanging toilet",
		w: 60,
		d: 74,
		h: 115,
		description:
			"Wall-hung toilet (36 × 54 cm bowl, seat at 40 cm) on a 60 × 20 cm in-wall cistern frame with flush plate.",
	},
	shower: {
		id: "shower",
		name: "Shower",
		w: 90,
		d: 100,
		h: 260,
		size: "80×100 + wall",
		description:
			"Shower area 80 cm wide × 100 cm deep with a 10 cm tiled partition wall (floor to ceiling) on the toilet side, flush floor with linear drain, 20 cm fixed glass + 60 cm glass door, rain shower head.",
	},
	washbasin: {
		id: "washbasin",
		name: "Washbasin",
		w: 90,
		d: 40,
		h: 180,
		size: "60 + 30×40",
		description:
			"90 × 40 cm in total: a 60 cm wall-hung vanity (top at 85 cm) with integrated basin, tap and 60 × 70 cm mirror, next to a 30 cm wide, 180 cm high closet.",
	},
};

/** rotation: quarter turns (0..3). 0 = back against the back wall. */
export interface Placement {
	x: number; // footprint centre, cm from left wall
	z: number; // footprint centre, cm from back wall
	rotation: 0 | 1 | 2 | 3;
}

export type Layout = Record<FixtureId, Placement>;

export const DEFAULT_LAYOUT: Layout = {
	// Shower in the back-right corner: 10 cm wall + 80 cm shower along the back
	// wall, 100 cm deep along the right wall.
	shower: { x: ROOM.width - 45, z: 50, rotation: 0 },
	// Toilet on the back wall, centred in the 110 cm left of the shower wall.
	toilet: { x: 55, z: 37, rotation: 0 },
	// Washbasin on the left wall, back against x = 0.
	washbasin: { x: 20, z: 160, rotation: 1 },
};

/** Footprint size in room space taking the rotation into account. */
export function footprint(id: FixtureId, rotation: number) {
	const { w, d } = FIXTURES[id];
	return rotation % 2 === 0 ? { w, d } : { w: d, d: w };
}

export function bounds(id: FixtureId, p: Placement) {
	const { w, d } = footprint(id, p.rotation);
	return {
		minX: p.x - w / 2,
		maxX: p.x + w / 2,
		minZ: p.z - d / 2,
		maxZ: p.z + d / 2,
	};
}

export function overlaps(
	a: ReturnType<typeof bounds>,
	b: ReturnType<typeof bounds>,
) {
	const eps = 0.01;
	return (
		a.minX < b.maxX - eps &&
		a.maxX > b.minX + eps &&
		a.minZ < b.maxZ - eps &&
		a.maxZ > b.minZ + eps
	);
}

/** Clamp a placement inside the room and snap it to nearby walls. */
export function constrain(id: FixtureId, p: Placement, snap = 8): Placement {
	const { w, d } = footprint(id, p.rotation);
	let x = Math.round(p.x);
	let z = Math.round(p.z);
	x = Math.min(Math.max(x, w / 2), ROOM.width - w / 2);
	z = Math.min(Math.max(z, d / 2), ROOM.depth - d / 2);
	if (x - w / 2 < snap) x = w / 2;
	if (ROOM.width - (x + w / 2) < snap) x = ROOM.width - w / 2;
	if (z - d / 2 < snap) z = d / 2;
	if (ROOM.depth - (z + d / 2) < snap) z = ROOM.depth - d / 2;
	return { ...p, x, z };
}
