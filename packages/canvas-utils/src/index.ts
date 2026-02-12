import Canvas = require("canvas")

const fontRegex = /(?<value>\d+\.?\d*)/

/**
 * Mask an image, typically with a black and white image for transparency
 * @param base The image that will be masked
 * @param imageMask A black and white image to mask the transparency
 * @param width The width of the returned canvas (defaults to the base width)
 * @param height The height of the returned canvas (defaults to the base height)
 * @returns A new canvas rendering context 2d. Doesn't mutate the base or mask image
 */
export function mask(base: Canvas.Image | Canvas.Canvas, imageMask: Canvas.Image | Canvas.Canvas, width?: number, height?: number): Canvas.CanvasRenderingContext2D {
	const canvas = Canvas.createCanvas(width ?? base.width, height ?? base.height).getContext("2d")
	canvas.drawImage(imageMask, 0, 0, width ?? base.width, height ?? base.height)
	const oldOp = canvas.globalCompositeOperation
	canvas.globalCompositeOperation = "source-in"
	canvas.drawImage(base, 0, 0, width ?? base.width, height ?? base.height)
	canvas.globalCompositeOperation = oldOp
	return canvas
}

/**
 * Buldge an image by a specific amount
 *
 * Taken and adapted from https://stackoverflow.com/a/33407226
 * @param amountX The amount of pixels to buldge the image by in the X direction
 * @param image The image to buldge
 * @param quality
 * @returns A new canvas rendering context 2d. Doesn't mutate the supplied image
 */
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

/**
 * Helper function to change the font size of a context's font
 * @param size The font size to set it to
 * @param ctx The context to change
 * @returns Mutates the supplied the context
 */
export function setFontSize(size: number, ctx: Canvas.CanvasRenderingContext2D): void {
	ctx.font = ctx.font.replace(fontRegex, String(size))
}
