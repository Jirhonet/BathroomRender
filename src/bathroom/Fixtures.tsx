import { RoundedBox } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { FIXTURES, ROOM } from "./config";
import {
	makeTileTexture,
	makeWallTileTexture,
	makeWoodTexture,
	tiledBox,
} from "./textures";

// Every fixture is modelled in centimetres with its origin at the centre of
// its footprint on the floor. Local -z is the wall side ("back").

export const materials = {
	ceramic: new THREE.MeshStandardMaterial({
		color: "#f7f7f5",
		roughness: 0.15,
		metalness: 0,
	}),
	chrome: new THREE.MeshStandardMaterial({
		color: "#e8e8ea",
		roughness: 0.08,
		metalness: 1,
	}),
	black: new THREE.MeshStandardMaterial({
		color: "#1d1d1f",
		roughness: 0.5,
		metalness: 0.4,
	}),
	wallWhite: new THREE.MeshStandardMaterial({
		color: "#ecebe7",
		roughness: 0.85,
	}),
	glass: new THREE.MeshStandardMaterial({
		color: "#cfe8ee",
		roughness: 0.02,
		metalness: 0.1,
		transparent: true,
		opacity: 0.22,
		depthWrite: false,
		side: THREE.DoubleSide,
	}),
	mirror: new THREE.MeshStandardMaterial({
		color: "#e9eef1",
		roughness: 0.03,
		metalness: 0.95,
	}),
	led: new THREE.MeshStandardMaterial({
		color: "#fff",
		emissive: "#fff6e0",
		emissiveIntensity: 2,
	}),
};

/** Outline points for a wall-hung toilet bowl, in (x, forward) cm. */
function bowlShape(halfW: number, straight: number, length: number) {
	const s = new THREE.Shape();
	const r = 4;
	s.moveTo(-halfW + r, 0);
	s.lineTo(halfW - r, 0);
	s.quadraticCurveTo(halfW, 0, halfW, -r);
	s.lineTo(halfW, -straight);
	const front = length - straight;
	const steps = 32;
	for (let i = 1; i <= steps; i++) {
		const t = (i / steps) * Math.PI;
		// Shape y = -forward so that after rotateX(-90°) forward maps to +z.
		s.lineTo(halfW * Math.cos(t), -(straight + front * Math.sin(t)));
	}
	s.lineTo(-halfW, -r);
	s.quadraticCurveTo(-halfW, 0, -halfW + r, 0);
	return s;
}

function extrudeUp(shape: THREE.Shape, height: number, bevel = 1.2) {
	const g = new THREE.ExtrudeGeometry(shape, {
		depth: height,
		bevelEnabled: true,
		bevelSize: bevel,
		bevelThickness: bevel,
		bevelSegments: 4,
		curveSegments: 24,
	});
	// Shape lies in XY; extrusion along +Z. Rotate so extrusion points up.
	g.rotateX(-Math.PI / 2);
	return g;
}

export function Toilet() {
	const { d } = FIXTURES.toilet;
	const back = -d / 2; // wall side
	const frameDepth = 20;
	const bowlStart = back + frameDepth;

	const geo = useMemo(() => {
		return {
			body: extrudeUp(bowlShape(17, 16, 52), 16, 2),
			neck: extrudeUp(bowlShape(13, 10, 34), 10, 2),
			seat: extrudeUp(bowlShape(18, 16, 53), 1.6, 0.8),
			lid: extrudeUp(bowlShape(17.2, 16, 51.5), 1.2, 0.8),
		};
	}, []);

	return (
		<group>
			{/* Pre-wall with built-in cistern */}
			<mesh
				position={[0, 115 / 2, back + frameDepth / 2]}
				material={materials.wallWhite}
				castShadow
				receiveShadow
			>
				<boxGeometry args={[60, 115, frameDepth]} />
			</mesh>
			{/* Flush plate */}
			<RoundedBox
				args={[24, 16, 1]}
				radius={0.4}
				position={[0, 100, bowlStart + 0.5]}
				material={materials.black}
			/>
			<mesh
				position={[-5.5, 100, bowlStart + 1.05]}
				material={materials.chrome}
			>
				<boxGeometry args={[10, 10, 0.2]} />
			</mesh>
			<mesh position={[5.5, 100, bowlStart + 1.05]} material={materials.chrome}>
				<boxGeometry args={[6, 10, 0.2]} />
			</mesh>

			{/* Bowl (hanging – nothing touches the floor) */}
			<group position={[0, 0, bowlStart]}>
				<mesh
					geometry={geo.neck}
					position={[0, 12, 0]}
					material={materials.ceramic}
					castShadow
				/>
				<mesh
					geometry={geo.body}
					position={[0, 20, 0]}
					material={materials.ceramic}
					castShadow
				/>
				<mesh
					geometry={geo.seat}
					position={[0, 37.4, 0]}
					material={materials.ceramic}
					castShadow
				/>
				<mesh
					geometry={geo.lid}
					position={[0, 39.2, 0.3]}
					material={materials.ceramic}
					castShadow
				/>
			</group>

			{/* Toilet roll holder on the pre-wall */}
			<group position={[24, 70, bowlStart + 3]}>
				<mesh rotation={[0, 0, Math.PI / 2]} material={materials.chrome}>
					<cylinderGeometry args={[0.6, 0.6, 14, 12]} />
				</mesh>
				<mesh
					rotation={[0, 0, Math.PI / 2]}
					position={[0, 0, 3]}
					material={materials.ceramic}
				>
					<cylinderGeometry args={[5.5, 5.5, 10, 24]} />
				</mesh>
			</group>
		</group>
	);
}

/** Thickness of the tiled partition wall between toilet and shower (cm). */
export const SHOWER_WALL = 10;

export function Shower() {
	const { w: total, d } = FIXTURES.shower;
	// Footprint = partition wall (left) + 100 × 80 cm shower area (right).
	const w = total - SHOWER_WALL;
	const back = -d / 2;
	const left = -w / 2;
	const front = d / 2;
	const glassH = 200;
	const t = 0.8;

	const floorTex = useMemo(() => {
		const tex = makeTileTexture({
			base: "#6f6c68",
			grout: "#4e4b48",
			px: 128,
			variation: 0.08,
		});
		tex.repeat.set(w / 10, d / 10);
		return tex;
	}, [w, d]);

	const wall = useMemo(
		() => ({
			geometry: tiledBox(
				[SHOWER_WALL, ROOM.height, d],
				[-total / 2 + SHOWER_WALL / 2, ROOM.height / 2, 0],
			),
			material: new THREE.MeshStandardMaterial({
				map: makeWallTileTexture(),
				roughness: 0.35,
			}),
		}),
		[total, d],
	);

	return (
		<group>
			{/* Tiled partition wall, floor to ceiling */}
			<mesh
				geometry={wall.geometry}
				material={wall.material}
				castShadow
				receiveShadow
			/>

			<group position={[SHOWER_WALL / 2, 0, 0]}>
				{/* Shower floor (10×10 cm mosaic, flush with floor) */}
				<mesh
					rotation={[-Math.PI / 2, 0, 0]}
					position={[0, 0.15, 0]}
					receiveShadow
				>
					<planeGeometry args={[w, d]} />
					<meshStandardMaterial map={floorTex} roughness={0.7} />
				</mesh>
				{/* Linear drain along the back wall */}
				<mesh
					position={[0, 0.3, back + 5]}
					material={materials.chrome}
					receiveShadow
				>
					<boxGeometry args={[w - 20, 0.3, 5]} />
				</mesh>

				{/* Front: fixed panel 40 cm + door 60 cm */}
				<mesh
					position={[left + 20, glassH / 2 + 1, front - t / 2]}
					material={materials.glass}
				>
					<boxGeometry args={[40, glassH, t]} />
				</mesh>
				<mesh
					position={[left + 40 + 30, glassH / 2 + 1, front - t / 2]}
					material={materials.glass}
				>
					<boxGeometry args={[59.4, glassH, t]} />
				</mesh>
				{/* Door handle */}
				<mesh position={[left + 43, 105, front + 2]} material={materials.black}>
					<boxGeometry args={[1.5, 40, 1.5]} />
				</mesh>
				{/* Black frame profiles */}
				<mesh
					position={[0, glassH + 1.5, front - 0.4]}
					material={materials.black}
				>
					<boxGeometry args={[w, 2, 2]} />
				</mesh>
				<mesh
					position={[left + 1, glassH / 2, front - 0.4]}
					material={materials.black}
				>
					<boxGeometry args={[2, glassH + 2, 2.2]} />
				</mesh>
				<mesh
					position={[w / 2 - 1, glassH / 2, front - 0.4]}
					material={materials.black}
				>
					<boxGeometry args={[2, glassH + 2, 2.2]} />
				</mesh>

				{/* Thermostatic mixer on back wall */}
				<RoundedBox
					args={[30, 7, 6]}
					radius={2.5}
					position={[10, 110, back + 3]}
					material={materials.chrome}
				/>
				{/* Riser pipe + arm + rain head */}
				<mesh position={[10, 160, back + 4]} material={materials.chrome}>
					<cylinderGeometry args={[1.2, 1.2, 100, 16]} />
				</mesh>
				<mesh
					position={[10, 210, back + 4 + 18]}
					rotation={[Math.PI / 2, 0, 0]}
					material={materials.chrome}
				>
					<cylinderGeometry args={[1, 1, 36, 16]} />
				</mesh>
				<mesh position={[10, 210, back + 4]} material={materials.chrome}>
					<sphereGeometry args={[1.4, 16, 16]} />
				</mesh>
				<mesh
					position={[10, 208.5, back + 40]}
					material={materials.chrome}
					castShadow
				>
					<cylinderGeometry args={[15, 15, 1.2, 48]} />
				</mesh>
				{/* Hand shower */}
				<group position={[-12, 115, back + 4]} rotation={[0.3, 0, 0]}>
					<mesh position={[0, 8, 0]} material={materials.chrome}>
						<cylinderGeometry args={[1.3, 1, 22, 16]} />
					</mesh>
					<mesh position={[0, 20, 0.5]} material={materials.chrome}>
						<cylinderGeometry args={[3.5, 3.5, 2, 24]} />
					</mesh>
				</group>
			</group>
		</group>
	);
}

export function Washbasin() {
	const { w, d } = FIXTURES.washbasin;
	const back = -d / 2;
	const topY = 85;
	const topT = 3;
	const cabinetH = 45;
	const cabTop = topY - topT;

	const wood = useMemo(() => {
		const tex = makeWoodTexture();
		tex.repeat.set(1, 1);
		return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
	}, []);

	const topGeo = useMemo(() => {
		const s = new THREE.Shape();
		s.moveTo(-w / 2, 0);
		s.lineTo(w / 2, 0);
		s.lineTo(w / 2, -d);
		s.lineTo(-w / 2, -d);
		s.closePath();
		const hole = new THREE.Path();
		hole.absellipse(0, -d / 2 - 2, 26, 14, 0, Math.PI * 2, true, 0);
		s.holes.push(hole);
		const g = new THREE.ExtrudeGeometry(s, {
			depth: topT,
			bevelEnabled: false,
			curveSegments: 48,
		});
		g.rotateX(-Math.PI / 2);
		return g;
	}, [w, d]);

	const basinGeo = useMemo(
		() =>
			new THREE.SphereGeometry(
				1,
				48,
				16,
				0,
				Math.PI * 2,
				Math.PI / 2,
				Math.PI / 2,
			),
		[],
	);

	return (
		<group>
			{/* Wall-hung vanity cabinet (open top section so the basin bowl shows) */}
			<mesh
				position={[0, (cabTop - cabinetH + 70) / 2, back + (d - 2) / 2]}
				material={wood}
				castShadow
				receiveShadow
			>
				<boxGeometry args={[w, 70 - (cabTop - cabinetH), d - 2]} />
			</mesh>
			{(
				[
					[
						[w, cabTop - 70, 1.8],
						[0, (cabTop + 70) / 2, d / 2 - 2.9],
					],
					[
						[w, cabTop - 70, 1.8],
						[0, (cabTop + 70) / 2, back + 0.9],
					],
					[
						[1.8, cabTop - 70, d - 2],
						[-w / 2 + 0.9, (cabTop + 70) / 2, back + (d - 2) / 2],
					],
					[
						[1.8, cabTop - 70, d - 2],
						[w / 2 - 0.9, (cabTop + 70) / 2, back + (d - 2) / 2],
					],
				] as [[number, number, number], [number, number, number]][]
			).map(([size, pos]) => (
				<mesh key={pos.join()} position={pos} material={wood} castShadow>
					<boxGeometry args={size} />
				</mesh>
			))}
			{/* Drawer split + grip line */}
			<mesh
				position={[0, cabTop - cabinetH / 2, d / 2 - 1.9]}
				material={materials.black}
			>
				<boxGeometry args={[w - 1, 0.4, 0.2]} />
			</mesh>
			<mesh
				position={[0, cabTop - 2.5, d / 2 - 1.9]}
				material={materials.black}
			>
				<boxGeometry args={[w - 1, 1.2, 0.3]} />
			</mesh>

			{/* Ceramic top with basin */}
			<mesh
				geometry={topGeo}
				position={[0, cabTop, back]}
				material={materials.ceramic}
				castShadow
				receiveShadow
			/>
			<mesh
				geometry={basinGeo}
				position={[0, topY, back + d / 2 + 2]}
				scale={[26, 13, 14]}
				receiveShadow
			>
				<meshStandardMaterial
					color="#f3f3f1"
					roughness={0.12}
					side={THREE.DoubleSide}
				/>
			</mesh>
			<mesh
				position={[0, topY - 12.8, back + d / 2 + 2]}
				rotation={[-Math.PI / 2, 0, 0]}
				material={materials.chrome}
			>
				<circleGeometry args={[2, 24]} />
			</mesh>

			{/* Tap */}
			<group position={[0, topY, back + 5]}>
				<mesh position={[0, 9, 0]} material={materials.chrome}>
					<cylinderGeometry args={[1.6, 1.8, 18, 24]} />
				</mesh>
				<mesh
					position={[0, 17, 6]}
					rotation={[Math.PI / 2, 0, 0]}
					material={materials.chrome}
				>
					<cylinderGeometry args={[1, 1, 13, 16]} />
				</mesh>
				<mesh
					position={[0, 20, -0.5]}
					rotation={[0.4, 0, 0]}
					material={materials.chrome}
				>
					<boxGeometry args={[1.2, 1.2, 8]} />
				</mesh>
			</group>

			{/* Mirror */}
			<RoundedBox
				args={[w, 70, 1.5]}
				radius={0.6}
				position={[0, 140, back + 0.75]}
				material={materials.mirror}
			/>
			{/* LED bar above mirror */}
			<mesh position={[0, 178, back + 3]} material={materials.led}>
				<boxGeometry args={[60, 1.5, 4]} />
			</mesh>
		</group>
	);
}

export const FIXTURE_COMPONENTS = {
	toilet: Toilet,
	shower: Shower,
	washbasin: Washbasin,
} as const;
