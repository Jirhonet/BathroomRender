import {
	CameraControls,
	Environment,
	Html,
	Lightformer,
	Line,
} from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
	bounds,
	constrain,
	FIXTURES,
	type FixtureId,
	type Layout,
	type Placement,
	ROOM,
} from "./config";
import { FIXTURE_COMPONENTS } from "./Fixtures";
import { Room, type WallMode } from "./Room";

const { width: W, depth: D, height: H, wallThickness: T } = ROOM;
const CM = 0.01;

export type ViewName = "perspective" | "top" | "front" | "side" | "door";

export interface SceneOptions {
	wallMode: WallMode;
	showDimensions: boolean;
	doorOpen: boolean;
	showDoorSwing: boolean;
}

type Controls = React.ComponentRef<typeof CameraControls>;

// Camera presets in world metres; the room is centred on the origin.
const VIEWS: Record<
	ViewName,
	[number, number, number, number, number, number]
> = {
	perspective: [2.6, 3.3, 3.6, 0, 0.8, 0],
	top: [0, 5.2, 0.001, 0, 0, 0],
	front: [0, 1.5, 4.6, 0, 1.1, 0],
	side: [-4.4, 1.6, 0, 0, 1.1, 0],
	door: [0.5, 1.65, 1.15, -0.25, 1.1, -0.8],
};

function Label({
	position,
	children,
}: {
	position: [number, number, number];
	children: React.ReactNode;
}) {
	return (
		<Html
			position={position}
			center
			zIndexRange={[20, 0]}
			style={{ pointerEvents: "none" }}
		>
			<div className="whitespace-nowrap rounded-md bg-slate-900/85 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white shadow">
				{children}
			</div>
		</Html>
	);
}

function DimLine({
	from,
	to,
	label,
	color = "#0f172a",
	ticks = true,
}: {
	from: [number, number, number];
	to: [number, number, number];
	label: string;
	color?: string;
	ticks?: boolean;
}) {
	const mid: [number, number, number] = [
		(from[0] + to[0]) / 2,
		(from[1] + to[1]) / 2,
		(from[2] + to[2]) / 2,
	];
	const tickPts = useMemo(() => {
		if (!ticks) return [];
		const dir = new THREE.Vector3(
			to[0] - from[0],
			to[1] - from[1],
			to[2] - from[2],
		).normalize();
		// Perpendicular in the floor plane (or horizontal for vertical lines)
		const perp =
			Math.abs(dir.y) > 0.9
				? new THREE.Vector3(1, 0, 0)
				: new THREE.Vector3(-dir.z, 0, dir.x);
		perp.multiplyScalar(5);
		return [from, to].map((p) => [
			[p[0] - perp.x, p[1] - perp.y, p[2] - perp.z] as [number, number, number],
			[p[0] + perp.x, p[1] + perp.y, p[2] + perp.z] as [number, number, number],
		]);
	}, [from, to, ticks]);
	return (
		<group>
			<Line points={[from, to]} color={color} lineWidth={1.5} />
			{tickPts.map((pts, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: two static ticks
				<Line key={i} points={pts} color={color} lineWidth={1.5} />
			))}
			<Label position={mid}>{label}</Label>
		</group>
	);
}

function RoomDimensions() {
	const off = T + 25;
	return (
		<group>
			<DimLine from={[0, 1, D + off]} to={[W, 1, D + off]} label={`${W} cm`} />
			<DimLine from={[-off, 1, 0]} to={[-off, 1, D]} label={`${D} cm`} />
			<DimLine
				from={[W + off, 0, -T]}
				to={[W + off, H, -T]}
				label={`${H} cm`}
			/>
		</group>
	);
}

function Clearances({
	id,
	placement,
}: {
	id: FixtureId;
	placement: Placement;
}) {
	const b = bounds(id, placement);
	const y = 1.5;
	const cx = placement.x;
	const cz = placement.z;
	const color = "#2563eb";
	const items: {
		from: [number, number, number];
		to: [number, number, number];
		v: number;
	}[] = [
		{ from: [0, y, cz], to: [b.minX, y, cz], v: b.minX },
		{ from: [b.maxX, y, cz], to: [W, y, cz], v: W - b.maxX },
		{ from: [cx, y, 0], to: [cx, y, b.minZ], v: b.minZ },
		{ from: [cx, y, b.maxZ], to: [cx, y, D], v: D - b.maxZ },
	];
	return (
		<group>
			{items
				.filter((i) => i.v >= 1)
				.map((i) => (
					<DimLine
						key={`${i.from.join()}-${i.to.join()}`}
						from={i.from}
						to={i.to}
						label={`${Math.round(i.v)}`}
						color={color}
					/>
				))}
		</group>
	);
}

function Footprint({
	id,
	state,
}: {
	id: FixtureId;
	state: "selected" | "conflict" | "hover";
}) {
	const { w, d } = FIXTURES[id];
	const color = state === "conflict" ? "#dc2626" : "#2563eb";
	const y = 0.8;
	const pts: [number, number, number][] = [
		[-w / 2, y, -d / 2],
		[w / 2, y, -d / 2],
		[w / 2, y, d / 2],
		[-w / 2, y, d / 2],
		[-w / 2, y, -d / 2],
	];
	return (
		<group>
			<Line points={pts} color={color} lineWidth={2.5} />
			<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.7, 0]}>
				<planeGeometry args={[w, d]} />
				<meshBasicMaterial
					color={color}
					transparent
					opacity={0.12}
					depthWrite={false}
				/>
			</mesh>
		</group>
	);
}

function Fixture({
	id,
	placement,
	selected,
	conflict,
	onDragStart,
}: {
	id: FixtureId;
	placement: Placement;
	selected: boolean;
	conflict: boolean;
	onDragStart: (id: FixtureId, e: PointerEvent) => void;
}) {
	const Comp = FIXTURE_COMPONENTS[id];
	return (
		<group
			position={[placement.x, 0, placement.z]}
			rotation={[0, (placement.rotation * Math.PI) / 2, 0]}
			onPointerDown={(e) => {
				if (e.button !== 0) return;
				e.stopPropagation();
				onDragStart(id, e.nativeEvent);
			}}
			onPointerOver={(e) => {
				e.stopPropagation();
				document.body.style.cursor = "grab";
			}}
			onPointerOut={() => {
				document.body.style.cursor = "";
			}}
		>
			<Comp />
			{(selected || conflict) && (
				<Footprint id={id} state={conflict ? "conflict" : "selected"} />
			)}
		</group>
	);
}

function ViewController({ view }: { view: { name: ViewName; nonce: number } }) {
	const controls = useThree((s) => s.controls) as unknown as Controls | null;
	useEffect(() => {
		if (!controls) return;
		const v = VIEWS[view.name];
		controls.setLookAt(...v, true);
	}, [controls, view]);
	return null;
}

function World({
	layout,
	setLayout,
	selected,
	setSelected,
	conflicts,
	options,
	view,
}: BathroomSceneProps) {
	const roomRef = useRef<THREE.Group>(null);
	const { camera, gl, controls } = useThree();
	const layoutRef = useRef(layout);
	layoutRef.current = layout;

	const floorPoint = useMemo(() => {
		const raycaster = new THREE.Raycaster();
		const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
		const ndc = new THREE.Vector2();
		const hit = new THREE.Vector3();
		return (clientX: number, clientY: number) => {
			const rect = gl.domElement.getBoundingClientRect();
			ndc.set(
				((clientX - rect.left) / rect.width) * 2 - 1,
				-((clientY - rect.top) / rect.height) * 2 + 1,
			);
			raycaster.setFromCamera(ndc, camera);
			if (!raycaster.ray.intersectPlane(plane, hit) || !roomRef.current)
				return null;
			return roomRef.current.worldToLocal(hit.clone());
		};
	}, [camera, gl]);

	const onDragStart = useCallback(
		(id: FixtureId, ev: PointerEvent) => {
			setSelected(id);
			const start = floorPoint(ev.clientX, ev.clientY);
			if (!start) return;
			const p = layoutRef.current[id];
			const off = { x: p.x - start.x, z: p.z - start.z };
			const c = controls as unknown as Controls | null;
			if (c) c.enabled = false;
			document.body.style.cursor = "grabbing";

			const move = (e: PointerEvent) => {
				const h = floorPoint(e.clientX, e.clientY);
				if (!h) return;
				setLayout((l) => ({
					...l,
					[id]: constrain(id, { ...l[id], x: h.x + off.x, z: h.z + off.z }),
				}));
			};
			const up = () => {
				window.removeEventListener("pointermove", move);
				window.removeEventListener("pointerup", up);
				if (c) c.enabled = true;
				document.body.style.cursor = "";
			};
			window.addEventListener("pointermove", move);
			window.addEventListener("pointerup", up);
		},
		[controls, floorPoint, setLayout, setSelected],
	);

	return (
		<>
			<CameraControls
				makeDefault
				minDistance={0.3}
				maxDistance={12}
				maxPolarAngle={Math.PI / 2 - 0.02}
				smoothTime={0.35}
			/>
			<ViewController view={view} />

			<hemisphereLight args={["#ffffff", "#b9b2a6", 0.8]} />
			<ambientLight intensity={0.25} />
			<directionalLight
				position={[3, 6, 4]}
				intensity={1.6}
				castShadow
				shadow-mapSize={[2048, 2048]}
				shadow-camera-left={-2.5}
				shadow-camera-right={2.5}
				shadow-camera-top={2.5}
				shadow-camera-bottom={-2.5}
				shadow-bias={-0.0004}
			/>
			<pointLight
				position={[0, H * CM - 0.15, 0]}
				intensity={2.5}
				distance={5}
				decay={2}
			/>

			<Environment resolution={256}>
				<mesh scale={30}>
					<sphereGeometry args={[1, 32, 16]} />
					<meshBasicMaterial color="#9da3ab" side={THREE.BackSide} />
				</mesh>
				<Lightformer
					form="rect"
					intensity={2}
					position={[0, 4, 0]}
					rotation-x={Math.PI / 2}
					scale={[6, 6, 1]}
				/>
				<Lightformer
					form="rect"
					intensity={1}
					position={[-4, 1.5, 0]}
					rotation-y={Math.PI / 2}
					scale={[8, 3, 1]}
				/>
				<Lightformer
					form="rect"
					intensity={1}
					position={[4, 1.5, 0]}
					rotation-y={-Math.PI / 2}
					scale={[8, 3, 1]}
				/>
				<Lightformer
					form="rect"
					intensity={0.6}
					color="#dfe8ff"
					position={[0, 1.5, 4]}
					rotation-y={Math.PI}
					scale={[8, 3, 1]}
				/>
			</Environment>

			<group
				ref={roomRef}
				position={[(-W / 2) * CM, 0, (-D / 2) * CM]}
				scale={CM}
			>
				<Room
					wallMode={options.wallMode}
					doorOpen={options.doorOpen}
					showDoorSwing={options.showDoorSwing}
					roomRef={roomRef}
				/>
				{(Object.keys(layout) as FixtureId[]).map((id) => (
					<Fixture
						key={id}
						id={id}
						placement={layout[id]}
						selected={selected === id}
						conflict={conflicts.has(id)}
						onDragStart={onDragStart}
					/>
				))}
				{options.showDimensions && <RoomDimensions />}
				{options.showDimensions && selected && (
					<Clearances id={selected} placement={layout[selected]} />
				)}
			</group>
		</>
	);
}

export interface BathroomSceneProps {
	layout: Layout;
	setLayout: React.Dispatch<React.SetStateAction<Layout>>;
	selected: FixtureId | null;
	setSelected: (id: FixtureId | null) => void;
	conflicts: Set<FixtureId>;
	options: SceneOptions;
	view: { name: ViewName; nonce: number };
}

export function BathroomScene(props: BathroomSceneProps) {
	return (
		<Canvas
			shadows
			dpr={[1, 2]}
			camera={{
				position: VIEWS.perspective.slice(0, 3) as [number, number, number],
				fov: 45,
				near: 0.05,
				far: 100,
			}}
			gl={{ antialias: true }}
			onPointerMissed={() => props.setSelected(null)}
		>
			<World {...props} />
		</Canvas>
	);
}
