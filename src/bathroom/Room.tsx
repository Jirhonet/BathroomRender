import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { DOOR, ROOM } from "./config";
import { materials } from "./Fixtures";
import { makeTileTexture, makeWallTileTexture, tiledBox } from "./textures";

const { width: W, depth: D, height: H, wallThickness: T } = ROOM;

export type WallMode = "auto" | "all" | "none";
type WallId = "back" | "front" | "left" | "right";

type Piece = {
	size: [number, number, number];
	center: [number, number, number];
};

const doorRight = DOOR.x + DOOR.width;

const WALLS: Record<WallId, Piece[]> = {
	back: [{ size: [W + 2 * T, H, T], center: [W / 2, H / 2, -T / 2] }],
	left: [{ size: [T, H, D], center: [-T / 2, H / 2, D / 2] }],
	right: [{ size: [T, H, D], center: [W + T / 2, H / 2, D / 2] }],
	front: [
		{ size: [DOOR.x + T, H, T], center: [(DOOR.x - T) / 2, H / 2, D + T / 2] },
		{
			size: [W - doorRight + T, H, T],
			center: [(doorRight + W + T) / 2, H / 2, D + T / 2],
		},
		{
			size: [DOOR.width, H - DOOR.height, T],
			center: [DOOR.x + DOOR.width / 2, (H + DOOR.height) / 2, D + T / 2],
		},
	],
};

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

function Door({ open }: { open: boolean }) {
	const pivot = useRef<THREE.Group>(null);
	const hingeX = DOOR.hingeRight ? doorRight : DOOR.x;
	const dir = DOOR.hingeRight ? -1 : 1;
	const leafT = 4;
	const target = open
		? (DOOR.hingeRight ? -1 : 1) * THREE.MathUtils.degToRad(80)
		: 0;

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
		<group ref={pivot} position={[hingeX, 0, D - leafT / 2]}>
			<group position={[(dir * leafW) / 2, 0, 0]}>
				<mesh position={[0, DOOR.height / 2, 0]} castShadow receiveShadow>
					<boxGeometry args={[leafW, DOOR.height - 1, leafT]} />
					<meshStandardMaterial color="#f2f1ee" roughness={0.5} />
				</mesh>
				{/* Lever handles both sides */}
				{[-1, 1].map((s) => (
					<group
						key={s}
						position={[(dir * leafW) / 2 - dir * 7, 105, s * (leafT / 2 + 2.5)]}
					>
						<mesh rotation={[Math.PI / 2, 0, 0]} material={materials.chrome}>
							<cylinderGeometry args={[0.9, 0.9, 5, 12]} />
						</mesh>
						<mesh
							position={[-dir * 6, 0, s * 2.5]}
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

function DoorSwing() {
	const hingeX = DOOR.hingeRight ? doorRight : DOOR.x;
	const points = useMemo(() => {
		const pts: [number, number, number][] = [];
		const r = DOOR.width;
		for (let i = 0; i <= 48; i++) {
			const a = (i / 48) * (Math.PI / 2);
			const dx = (DOOR.hingeRight ? -1 : 1) * Math.cos(a) * r;
			pts.push([hingeX + dx, 0.6, D - Math.sin(a) * r]);
		}
		pts.push([hingeX, 0.6, D]);
		pts.unshift([hingeX, 0.6, D]);
		return pts;
	}, [hingeX]);
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
			<Wall id="right" mode={wallMode} texture={wallTex} roomRef={roomRef} />
			<Wall id="front" mode={wallMode} texture={wallTex} roomRef={roomRef}>
				{/* Door frame */}
				<mesh
					position={[DOOR.x - 1.5, DOOR.height / 2, D + T / 2]}
					material={materials.wallWhite}
				>
					<boxGeometry args={[3, DOOR.height, T + 2]} />
				</mesh>
				<mesh
					position={[doorRight + 1.5, DOOR.height / 2, D + T / 2]}
					material={materials.wallWhite}
				>
					<boxGeometry args={[3, DOOR.height, T + 2]} />
				</mesh>
				<mesh
					position={[DOOR.x + DOOR.width / 2, DOOR.height + 1.5, D + T / 2]}
					material={materials.wallWhite}
				>
					<boxGeometry args={[DOOR.width + 6, 3, T + 2]} />
				</mesh>
				<Door open={doorOpen} />
			</Wall>

			{showDoorSwing && <DoorSwing />}
		</group>
	);
}
