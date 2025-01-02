import Canvas = require("canvas")

const fontRegex = /(?<value>\d+\.?\d*)/

export function mask(base: Canvas.Image | Canvas.Canvas, imageMask: Canvas.Image, width?: number, height?: number): Canvas.CanvasRenderingContext2D {
	const canvas = Canvas.createCanvas(width ?? base.width, height ?? base.height).getContext("2d")
	canvas.drawImage(imageMask, 0, 0, width ?? base.width, height ?? base.height)
	const oldOp = canvas.globalCompositeOperation
	canvas.globalCompositeOperation = "source-in"
	canvas.drawImage(base, 0, 0, width ?? base.width, height ?? base.height)
	canvas.globalCompositeOperation = oldOp
	return canvas
}

// Taken and adapted from https://stackoverflow.com/a/33407226
export function pinchBuldge(amountX: number, image: Canvas.Image | Canvas.Canvas, quality = 1): Canvas.CanvasRenderingContext2D {
	const w = image.width
	const h = image.height
	const easeW = (amountX / w) * 4
	const wh = w / 2
	const hh = h / 2
	const stepUnit = (0.5 / (wh)) * quality
	const result = new Canvas.Canvas(w, h).getContext("2d")
	result.drawImage(image, 0, 0)

	for (let i = 0; i < 0.5; i += stepUnit) {
		const r = i * 2
		const x = r * wh
		const y = r * hh
		const xw = w - (x * 2)
		const rx = (x) * easeW
		const ry = (y) * easeW
		const rw = w - (rx * 2)
		const rh = h - (ry * 2);
		result.save();
		result.beginPath();
		result.arc(wh, hh, xw / 2, 0, Math.PI * 2);
		result.clip();
		result.drawImage(image, rx, ry, rw, rh, 0, 0, w, h);
		result.restore();
	}

	return result;
}

export function setFontSize(size: number, ctx: Canvas.CanvasRenderingContext2D): void {
	ctx.font = ctx.font.replace(fontRegex, String(size))
}
