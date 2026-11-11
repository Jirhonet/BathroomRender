import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { DOOR, DOOR_Z, ROOM } from "./config";
import { materials } from "./Fixtures";
import { makeTileTexture, makeWallTileTexture, tiledBox } from "./textures";

const { width: W, depth: D, height: H, wallThickness: T } = ROOM;

export type WallMode = "auto" | "all" | "none";
type WallId = "back" | "front" | "left" | "right";

type Piece = {
	size: [number, number, number];
	center: [number, number, number];
};

const WALLS: Record<WallId, Piece[]> = {
	back: [{ size: [W + 2 * T, H, T], center: [W / 2, H / 2, -T / 2] }],
	front: [{ size: [W + 2 * T, H, T], center: [W / 2, H / 2, D + T / 2] }],
	left: [{ size: [T, H, D], center: [-T / 2, H / 2, D / 2] }],
	// Right (long) wall with the door opening
	right: [
		{
			size: [T, H, DOOR_Z.start],
			center: [W + T / 2, H / 2, DOOR_Z.start / 2],
		},
		{
			size: [T, H, D - DOOR_Z.end],
			center: [W + T / 2, H / 2, (DOOR_Z.end + D) / 2],
		},
		{
			size: [T, H - DOOR.height, DOOR.width],
			center: [
				W + T / 2,
				(H + DOOR.height) / 2,
				(DOOR_Z.start + DOOR_Z.end) / 2,
			],
		},
	],
};

// The door is modelled in a wall-local frame: x runs along the wall starting
// at the front corner, the wall's inner face is z = 0 and the room is at -z.
// This transform maps that frame onto the right wall:
// (a, y, c) → (W + c, y, D - a).
const DOOR_FRAME = {
	position: [W, 0, D] as [number, number, number],
	rotation: [0, Math.PI / 2, 0] as [number, number, number],
};
const S0 = DOOR.fromCorner; // hinge side (towards the corner)
const S1 = DOOR.fromCorner + DOOR.width;

/** Is the camera (in room cm coordinates) on the outside of this wall? */
function cameraOutside(id: WallId, cam: THREE.Vector3) {
	switch (id) {
		case "back":
			return cam.z < 0;
		case "front":
			return cam.z > D;
		case "left":
			return cam.x < 0;
		case "right":
			return cam.x > W;
	}
}

function Wall({
	id,
	mode,
	texture,
	roomRef,
	children,
}: {
	id: WallId;
	mode: WallMode;
	texture: THREE.Texture;
	roomRef: React.RefObject<THREE.Group | null>;
	children?: React.ReactNode;
}) {
	const group = useRef<THREE.Group>(null);
	const material = useMemo(
		() =>
			new THREE.MeshStandardMaterial({
				map: texture,
				roughness: 0.35,
				transparent: true,
				opacity: 1,
			}),
		[texture],
	);
	const geometries = useMemo(
		() => WALLS[id].map((p) => tiledBox(p.size, p.center)),
		[id],
	);
	const camLocal = useMemo(() => new THREE.Vector3(), []);

	useFrame(({ camera }, delta) => {
		if (!group.current || !roomRef.current) return;
		let target = 1;
		if (mode === "none") target = 0;
		else if (mode === "auto") {
			camLocal.copy(camera.position);
			roomRef.current.worldToLocal(camLocal);
			// Hide walls between camera and room, and all walls when looking down
			// from above the ceiling (plan view).
			const overhead =
				camLocal.y > H &&
				camLocal.x > -T &&
				camLocal.x < W + T &&
				camLocal.z > -T &&
				camLocal.z < D + T;
			target = cameraOutside(id, camLocal) || overhead ? 0 : 1;
		}
		const next = THREE.MathUtils.damp(material.opacity, target, 10, delta);
		material.opacity = Math.abs(next - target) < 0.01 ? target : next;
		material.depthWrite = material.opacity > 0.98;
		group.current.visible = material.opacity > 0.01;
	});

	return (
		<>
			<group ref={group}>
				{geometries.map((g, i) => (
					<mesh
						// biome-ignore lint/suspicious/noArrayIndexKey: static list
						key={i}
						geometry={g}
						material={material}
						castShadow
						receiveShadow
					/>
				))}
				{children}
			</group>
			{/* Section cut at the floor so the footprint stays readable */}
			{WALLS[id].map((p, i) => (
				<mesh
					// biome-ignore lint/suspicious/noArrayIndexKey: static list
					key={i}
					position={[p.center[0], 1, p.center[2]]}
				>
					<boxGeometry args={[p.size[0], 2, p.size[2]]} />
					<meshStandardMaterial color="#3a3d42" roughness={0.9} />
				</mesh>
			))}
		</>
	);
}

/** Door leaf hinged at S0, opening inward (towards local -z). */
function Door({ open }: { open: boolean }) {
	const pivot = useRef<THREE.Group>(null);
	const leafT = 4;
	const target = open ? THREE.MathUtils.degToRad(80) : 0;

	useFrame((_, delta) => {
		if (!pivot.current) return;
		pivot.current.rotation.y = THREE.MathUtils.damp(
			pivot.current.rotation.y,
			target,
			6,
			delta,
		);
	});

	const leafW = DOOR.width - 1;
	return (
		<group ref={pivot} position={[S0, 0, -leafT / 2]}>
			<group position={[leafW / 2, 0, 0]}>
				<mesh position={[0, DOOR.height / 2, 0]} castShadow receiveShadow>
					<boxGeometry args={[leafW, DOOR.height - 1, leafT]} />
					<meshStandardMaterial color="#f2f1ee" roughness={0.5} />
				</mesh>
				{/* Lever handles both sides */}
				{[-1, 1].map((s) => (
					<group key={s} position={[leafW / 2 - 7, 105, s * (leafT / 2 + 2.5)]}>
						<mesh rotation={[Math.PI / 2, 0, 0]} material={materials.chrome}>
							<cylinderGeometry args={[0.9, 0.9, 5, 12]} />
						</mesh>
						<mesh
							position={[-6, 0, s * 2.5]}
							rotation={[0, 0, Math.PI / 2]}
							material={materials.chrome}
						>
							<cylinderGeometry args={[0.9, 0.9, 13, 12]} />
						</mesh>
					</group>
				))}
			</group>
		</group>
	);
}

function DoorFrame() {
	return (
		<>
			<mesh
				position={[S0 - 1.5, DOOR.height / 2, T / 2]}
				material={materials.wallWhite}
			>
				<boxGeometry args={[3, DOOR.height, T + 2]} />
			</mesh>
			<mesh
				position={[S1 + 1.5, DOOR.height / 2, T / 2]}
				material={materials.wallWhite}
			>
				<boxGeometry args={[3, DOOR.height, T + 2]} />
			</mesh>
			<mesh
				position={[(S0 + S1) / 2, DOOR.height + 1.5, T / 2]}
				material={materials.wallWhite}
			>
				<boxGeometry args={[DOOR.width + 6, 3, T + 2]} />
			</mesh>
		</>
	);
}

function DoorSwing() {
	const points = useMemo(() => {
		const r = DOOR.width;
		const pts: [number, number, number][] = [[S0, 0.6, 0]];
		for (let i = 0; i <= 48; i++) {
			const a = (i / 48) * (Math.PI / 2);
			pts.push([S0 + Math.cos(a) * r, 0.6, -Math.sin(a) * r]);
		}
		pts.push([S0, 0.6, 0]);
		return pts;
	}, []);
	return (
		<Line
			points={points}
			color="#2563eb"
			lineWidth={1.5}
			dashed
			dashSize={4}
			gapSize={3}
		/>
	);
}

export function Room({
	wallMode,
	doorOpen,
	showDoorSwing,
	roomRef,
}: {
	wallMode: WallMode;
	doorOpen: boolean;
	showDoorSwing: boolean;
	roomRef: React.RefObject<THREE.Group | null>;
}) {
	const floorTex = useMemo(() => {
		const t = makeTileTexture({
			base: "#8d8984",
			grout: "#6b6864",
			px: 256,
			variation: 0.07,
		});
		t.repeat.set(W / 60, D / 60);
		return t;
	}, []);
	const wallTex = useMemo(() => makeWallTileTexture(), []);

	return (
		<group>
			{/* Base slab like an architectural model */}
			<mesh position={[W / 2, -4, D / 2]} receiveShadow>
				<boxGeometry args={[W + 2 * T + 20, 8, D + 2 * T + 20]} />
				<meshStandardMaterial color="#d9d7d2" roughness={0.95} />
			</mesh>

			{/* Tiled floor, 60 × 60 cm tiles */}
			<mesh
				rotation={[-Math.PI / 2, 0, 0]}
				position={[W / 2, 0.05, D / 2]}
				receiveShadow
			>
				<planeGeometry args={[W, D]} />
				<meshStandardMaterial map={floorTex} roughness={0.55} />
			</mesh>

			<Wall id="back" mode={wallMode} texture={wallTex} roomRef={roomRef} />
			<Wall id="left" mode={wallMode} texture={wallTex} roomRef={roomRef} />
			<Wall id="front" mode={wallMode} texture={wallTex} roomRef={roomRef} />
			<Wall id="right" mode={wallMode} texture={wallTex} roomRef={roomRef}>
				<group {...DOOR_FRAME}>
					<DoorFrame />
					<Door open={doorOpen} />
				</group>
			</Wall>

			{showDoorSwing && (
				<group {...DOOR_FRAME}>
					<DoorSwing />
				</group>
			)}
		</group>
	);
}
