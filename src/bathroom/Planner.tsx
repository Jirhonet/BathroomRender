import { useCallback, useEffect, useMemo, useState } from "react";
import {
	bounds,
	constrain,
	DEFAULT_LAYOUT,
	DOOR,
	DOOR_HINGE,
	DOOR_Z,
	FIXTURES,
	type FixtureId,
	footprint,
	type Layout,
	overlaps,
	ROOM,
} from "./config";
import type { WallMode } from "./Room";
import { BathroomScene, type SceneOptions, type ViewName } from "./Scene";

const STORAGE_KEY = "bathroom-layout-v4";
const IDS = Object.keys(FIXTURES) as FixtureId[];

function loadLayout(): Layout {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return DEFAULT_LAYOUT;
		const parsed = JSON.parse(raw) as Partial<Layout>;
		const out = { ...DEFAULT_LAYOUT };
		for (const id of IDS) {
			const p = parsed[id];
			if (
				p &&
				typeof p.x === "number" &&
				typeof p.z === "number" &&
				[0, 1, 2, 3].includes(p.rotation)
			) {
				out[id] = constrain(id, p, 0);
			}
		}
		return out;
	} catch {
		return DEFAULT_LAYOUT;
	}
}

/** Does the fixture block the inward-opening door's swing? */
function blocksDoor(b: ReturnType<typeof bounds>) {
	const r = DOOR.width;
	// Swing quadrant: from the right wall inward, between the opening's ends.
	if (
		b.maxX <= DOOR_HINGE.x - r ||
		b.maxZ <= DOOR_Z.start ||
		b.minZ >= DOOR_Z.end
	)
		return false;
	const cx = Math.min(Math.max(DOOR_HINGE.x, b.minX), b.maxX);
	const cz = Math.min(Math.max(DOOR_HINGE.z, b.minZ), b.maxZ);
	return Math.hypot(cx - DOOR_HINGE.x, cz - DOOR_HINGE.z) < r;
}

const VIEW_BUTTONS: { name: ViewName; label: string }[] = [
	{ name: "perspective", label: "3D" },
	{ name: "top", label: "Top" },
	{ name: "front", label: "Front" },
	{ name: "side", label: "Side" },
	{ name: "door", label: "Doorway" },
];

const WALL_MODES: { mode: WallMode; label: string }[] = [
	{ mode: "auto", label: "Auto cutaway" },
	{ mode: "all", label: "All walls" },
	{ mode: "none", label: "No walls" },
];

function Segmented<T extends string>({
	value,
	options,
	onChange,
}: {
	value: T | null;
	options: { value: T; label: string }[];
	onChange: (v: T) => void;
}) {
	return (
		<div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
			{options.map((o) => (
				<button
					type="button"
					key={o.value}
					onClick={() => onChange(o.value)}
					className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition ${
						value === o.value
							? "bg-white text-slate-900 shadow-sm"
							: "text-slate-500 hover:text-slate-800"
					}`}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}

function Toggle({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<label className="flex cursor-pointer items-center justify-between gap-3 py-1 text-sm text-slate-700">
			{label}
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				className="h-4 w-4 accent-blue-600"
			/>
		</label>
	);
}

function NumberField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: number;
	onChange: (v: number) => void;
}) {
	return (
		<label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
			{label}
			<div className="flex items-center rounded-md border border-slate-200 bg-white focus-within:border-blue-500">
				<input
					type="number"
					value={Math.round(value)}
					onChange={(e) => {
						const v = Number(e.target.value);
						if (Number.isFinite(v)) onChange(v);
					}}
					className="w-full bg-transparent px-2 py-1 font-mono text-sm text-slate-900 outline-none"
				/>
				<span className="pr-2 text-xs normal-case text-slate-400">cm</span>
			</div>
		</label>
	);
}

export function Planner() {
	const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
	const [loaded, setLoaded] = useState(false);
	const [selected, setSelected] = useState<FixtureId | null>(null);
	// Only affects small screens; the panel is always shown from `md` up.
	const [panelOpen, setPanelOpen] = useState(false);
	const [view, setView] = useState<{ name: ViewName; nonce: number }>({
		name: "perspective",
		nonce: 0,
	});
	const [options, setOptions] = useState<SceneOptions>({
		wallMode: "auto",
		showDimensions: true,
		doorOpen: false,
		showDoorSwing: true,
	});

	useEffect(() => {
		setLayout(loadLayout());
		setLoaded(true);
	}, []);

	useEffect(() => {
		if (!loaded) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
		} catch {
			// storage unavailable – layout just won't persist
		}
	}, [layout, loaded]);

	const conflicts = useMemo(() => {
		const set = new Set<FixtureId>();
		const doorBlocked = new Set<FixtureId>();
		for (let i = 0; i < IDS.length; i++) {
			const bi = bounds(IDS[i], layout[IDS[i]]);
			if (blocksDoor(bi)) doorBlocked.add(IDS[i]);
			for (let j = i + 1; j < IDS.length; j++) {
				if (overlaps(bi, bounds(IDS[j], layout[IDS[j]]))) {
					set.add(IDS[i]);
					set.add(IDS[j]);
				}
			}
		}
		return {
			overlap: set,
			door: doorBlocked,
			all: new Set([...set, ...doorBlocked]),
		};
	}, [layout]);

	const rotate = useCallback((id: FixtureId, dir: 1 | -1) => {
		setLayout((l) => {
			const p = l[id];
			const rotation = (((p.rotation + dir) % 4) + 4) % 4;
			return {
				...l,
				[id]: constrain(id, { ...p, rotation: rotation as 0 | 1 | 2 | 3 }),
			};
		});
	}, []);

	const nudge = useCallback((id: FixtureId, dx: number, dz: number) => {
		setLayout((l) => ({
			...l,
			[id]: constrain(id, { ...l[id], x: l[id].x + dx, z: l[id].z + dz }, 0),
		}));
	}, []);

	// Keyboard: R rotate, arrows nudge (Shift = 10 cm), Esc deselect
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement) return;
			if (e.key === "Escape") setSelected(null);
			if (!selected) return;
			const step = e.shiftKey ? 10 : 1;
			const moves: Record<string, [number, number]> = {
				ArrowLeft: [-step, 0],
				ArrowRight: [step, 0],
				ArrowUp: [0, -step],
				ArrowDown: [0, step],
			};
			if (moves[e.key]) {
				e.preventDefault();
				nudge(selected, ...moves[e.key]);
			} else if (e.key === "r" || e.key === "R") {
				rotate(selected, e.shiftKey ? -1 : 1);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [selected, nudge, rotate]);

	const sel = selected ? FIXTURES[selected] : null;
	const selPlacement = selected ? layout[selected] : null;
	const selBounds =
		selected && selPlacement ? bounds(selected, selPlacement) : null;
	const selFoot =
		selected && selPlacement
			? footprint(selected, selPlacement.rotation)
			: null;

	const setEdge = (edge: "left" | "back", value: number) => {
		if (!selected || !selFoot) return;
		setLayout((l) => {
			const p = l[selected];
			const next =
				edge === "left"
					? { ...p, x: value + selFoot.w / 2 }
					: { ...p, z: value + selFoot.d / 2 };
			return { ...l, [selected]: constrain(selected, next, 0) };
		});
	};

	return (
		<div className="relative h-dvh w-full overflow-hidden bg-gradient-to-b from-slate-200 to-slate-300">
			<div className="absolute inset-0">
				<BathroomScene
					layout={layout}
					setLayout={setLayout}
					selected={selected}
					setSelected={setSelected}
					conflicts={conflicts.all}
					options={options}
					view={view}
				/>
			</div>

			{/* Menu toggle (small screens only) */}
			{!panelOpen && (
				<button
					type="button"
					onClick={() => setPanelOpen(true)}
					aria-label="Open menu"
					aria-expanded={false}
					aria-controls="control-panel"
					className="absolute left-3 top-3 z-30 flex items-center gap-2 rounded-full border border-white/60 bg-white/90 px-4 py-2.5 text-sm font-medium text-slate-800 shadow-lg backdrop-blur-md md:hidden"
				>
					<svg
						viewBox="0 0 20 20"
						className="h-4 w-4"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						aria-hidden="true"
					>
						<path d="M3 5h14M3 10h14M3 15h14" />
					</svg>
					Menu
					{selected && (
						<span className="max-w-[40vw] truncate rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">
							{FIXTURES[selected].name}
						</span>
					)}
				</button>
			)}

			{/* Control panel */}
			<aside
				id="control-panel"
				className={`${panelOpen ? "flex" : "hidden"} absolute left-3 top-3 bottom-3 z-30 w-[300px] max-w-[calc(100vw-24px)] flex-col gap-4 overflow-y-auto rounded-2xl border border-white/60 bg-white/90 p-4 shadow-xl backdrop-blur-md max-md:bottom-auto max-md:max-h-[70dvh] md:flex md:bg-white/85`}
			>
				<header className="flex items-start justify-between gap-3">
					<div>
						<h1 className="text-lg font-semibold text-slate-900">
							Bathroom mockup
						</h1>
						<p className="text-xs text-slate-500">
							{ROOM.width} × {ROOM.depth} cm · ceiling {ROOM.height} cm · to
							scale
						</p>
					</div>
					<button
						type="button"
						onClick={() => setPanelOpen(false)}
						aria-label="Close menu"
						className="-mr-1 -mt-1 rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 md:hidden"
					>
						<svg
							viewBox="0 0 20 20"
							className="h-4 w-4"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							aria-hidden="true"
						>
							<path d="M5 5l10 10M15 5L5 15" />
						</svg>
					</button>
				</header>

				<section className="flex flex-col gap-2">
					<h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
						View
					</h2>
					<Segmented
						value={view.name}
						options={VIEW_BUTTONS.map((v) => ({
							value: v.name,
							label: v.label,
						}))}
						onChange={(name) => setView((v) => ({ name, nonce: v.nonce + 1 }))}
					/>
					<Segmented
						value={options.wallMode}
						options={WALL_MODES.map((w) => ({ value: w.mode, label: w.label }))}
						onChange={(wallMode) => setOptions((o) => ({ ...o, wallMode }))}
					/>
					<div className="mt-1">
						<Toggle
							label="Dimensions"
							checked={options.showDimensions}
							onChange={(showDimensions) =>
								setOptions((o) => ({ ...o, showDimensions }))
							}
						/>
						<Toggle
							label="Door swing"
							checked={options.showDoorSwing}
							onChange={(showDoorSwing) =>
								setOptions((o) => ({ ...o, showDoorSwing }))
							}
						/>
						<Toggle
							label="Door open"
							checked={options.doorOpen}
							onChange={(doorOpen) => setOptions((o) => ({ ...o, doorOpen }))}
						/>
					</div>
				</section>

				<section className="flex flex-col gap-2">
					<h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
						Fixtures
					</h2>
					<ul className="flex flex-col gap-1">
						{IDS.map((id) => {
							const f = FIXTURES[id];
							const warn = conflicts.all.has(id);
							return (
								<li key={id}>
									<button
										type="button"
										onClick={() => setSelected(selected === id ? null : id)}
										className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
											selected === id
												? "border-blue-500 bg-blue-50 text-blue-900"
												: "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
										}`}
									>
										<span className="flex items-center gap-2">
											{warn && (
												<span
													className="h-2 w-2 rounded-full bg-red-500"
													title="Conflict"
												/>
											)}
											{f.name}
										</span>
										<span className="font-mono text-xs text-slate-500">
											{f.size ?? `${f.w}×${f.d}`}
										</span>
									</button>
								</li>
							);
						})}
					</ul>
				</section>

				{sel && selected && selPlacement && selBounds && (
					<section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3">
						<div>
							<h3 className="text-sm font-semibold text-slate-900">
								{sel.name}
							</h3>
							<p className="mt-1 text-xs leading-relaxed text-slate-500">
								{sel.description}
							</p>
						</div>
						<div className="grid grid-cols-2 gap-2">
							<NumberField
								label="From left wall"
								value={selBounds.minX}
								onChange={(v) => setEdge("left", v)}
							/>
							<NumberField
								label="From back wall"
								value={selBounds.minZ}
								onChange={(v) => setEdge("back", v)}
							/>
						</div>
						<dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
							<dt>To right wall</dt>
							<dd className="text-right font-mono">
								{Math.round(ROOM.width - selBounds.maxX)} cm
							</dd>
							<dt>To front wall</dt>
							<dd className="text-right font-mono">
								{Math.round(ROOM.depth - selBounds.maxZ)} cm
							</dd>
							<dt>Rotation</dt>
							<dd className="text-right font-mono">
								{selPlacement.rotation * 90}°
							</dd>
						</dl>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => rotate(selected, -1)}
								className="flex-1 rounded-md bg-slate-100 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
							>
								⟲ Rotate
							</button>
							<button
								type="button"
								onClick={() => rotate(selected, 1)}
								className="flex-1 rounded-md bg-slate-100 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
							>
								Rotate ⟳
							</button>
						</div>
						{conflicts.overlap.has(selected) && (
							<p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">
								Overlaps another fixture.
							</p>
						)}
						{conflicts.door.has(selected) && (
							<p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700">
								Blocks the door swing.
							</p>
						)}
					</section>
				)}

				<div className="mt-auto flex flex-col gap-2">
					<button
						type="button"
						onClick={() => {
							setLayout(DEFAULT_LAYOUT);
							setSelected(null);
						}}
						className="rounded-md border border-slate-200 bg-white py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
					>
						Reset layout
					</button>
					<p className="text-[11px] leading-relaxed text-slate-500">
						Drag to orbit · right-drag to pan · scroll to zoom. Drag a fixture
						to move it (snaps to walls). Selected:{" "}
						<kbd className="font-mono">R</kbd> rotate, arrows nudge 1 cm (Shift
						10 cm).
					</p>
				</div>
			</aside>
		</div>
	);
}
