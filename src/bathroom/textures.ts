import * as THREE from "three";

/**
 * Procedural tile texture. One texture repeat == one tile of `tileW × tileH` cm,
 * so callers set `repeat` to (surfaceWidth / tileW, surfaceHeight / tileH).
 */
export function makeTileTexture(opts: {
	base: string;
	grout: string;
	variation?: number;
	px?: number;
	aspect?: number; // tileW / tileH
}) {
	const { base, grout, variation = 0.04, px = 256, aspect = 1 } = opts;
	const w = px;
	const h = Math.round(px / aspect);
	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d");
	if (!ctx) return new THREE.Texture();

	ctx.fillStyle = base;
	ctx.fillRect(0, 0, w, h);

	// Subtle stone-like noise
	const img = ctx.getImageData(0, 0, w, h);
	for (let i = 0; i < img.data.length; i += 4) {
		const n = (Math.random() - 0.5) * 255 * variation;
		img.data[i] += n;
		img.data[i + 1] += n;
		img.data[i + 2] += n;
	}
	ctx.putImageData(img, 0, 0);

	// Grout line along the top and left edge (tiles seamlessly)
	ctx.fillStyle = grout;
	const g = Math.max(2, Math.round(px / 120));
	ctx.fillRect(0, 0, w, g);
	ctx.fillRect(0, 0, g, h);

	const tex = new THREE.CanvasTexture(canvas);
	tex.wrapS = THREE.RepeatWrapping;
	tex.wrapT = THREE.RepeatWrapping;
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = 8;
	return tex;
}

export function makeWoodTexture() {
	const w = 512;
	const h = 512;
	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d");
	if (!ctx) return new THREE.Texture();
	ctx.fillStyle = "#9a7552";
	ctx.fillRect(0, 0, w, h);
	for (let i = 0; i < 140; i++) {
		const y = Math.random() * h;
		ctx.strokeStyle = `rgba(${60 + Math.random() * 40}, ${40 + Math.random() * 25}, 20, ${0.08 + Math.random() * 0.12})`;
		ctx.lineWidth = 1 + Math.random() * 3;
		ctx.beginPath();
		ctx.moveTo(0, y);
		for (let x = 0; x <= w; x += 32) {
			ctx.lineTo(x, y + Math.sin(x / 70 + i) * 4);
		}
		ctx.stroke();
	}
	const tex = new THREE.CanvasTexture(canvas);
	tex.wrapS = THREE.RepeatWrapping;
	tex.wrapT = THREE.RepeatWrapping;
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

export const WALL_TILE = { w: 60, h: 30 };

/**
 * Box geometry whose UVs are derived from absolute room coordinates (cm), so
 * tiles line up across separate wall pieces. Texture repeat must be 1.
 */
export function tiledBox(
	size: [number, number, number],
	center: [number, number, number],
) {
	const g = new THREE.BoxGeometry(...size);
	g.translate(...center);
	const pos = g.attributes.position;
	const nrm = g.attributes.normal;
	const uv = g.attributes.uv;
	for (let i = 0; i < pos.count; i++) {
		const x = pos.getX(i);
		const y = pos.getY(i);
		const z = pos.getZ(i);
		const nx = Math.abs(nrm.getX(i));
		const ny = Math.abs(nrm.getY(i));
		if (nx > 0.5) uv.setXY(i, z / WALL_TILE.w, y / WALL_TILE.h);
		else if (ny > 0.5) uv.setXY(i, x / WALL_TILE.w, z / WALL_TILE.h);
		else uv.setXY(i, x / WALL_TILE.w, y / WALL_TILE.h);
	}
	uv.needsUpdate = true;
	return g;
}

/** Light 60 × 30 cm wall tiles; use with tiledBox() geometry (repeat 1). */
export function makeWallTileTexture() {
	return makeTileTexture({
		base: "#f1efea",
		grout: "#d6d3cc",
		px: 256,
		aspect: 2,
		variation: 0.02,
	});
}
