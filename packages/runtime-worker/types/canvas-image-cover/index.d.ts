declare module "canvas-image-cover" {
	import Canvas = require("canvas")

	class Cover {
		public img: Canvas.Image
		public x: number
		public y: number
		public width: number
		public height: number

		public bounds: Array<{ width: number, height: number, sx: number, sy: number }>
		public sw: number
		public sh: number

		/**
		 * Provides a mechanism to draw an image in canvas such that it will cover the
		 * area provided exactly.
		 *
		 * @param img the image to render
		 * @param x offset x coordinate on the canvas
		 * @param y offset y coordinate on the canvas
		 * @param width width to fit to on the canvas
		 * @param height height to fit to on the canvas
		 */
		constructor(img: Canvas.Image, x: number, y: number, width: number, height: number)

		/**
		 * Doesn't actually crop the input image but does redefine the bounds of the
		 * image for the sake of panning. ie. after a crop, the pan cx and cy will
		 * be with regard to the currently defined area rather than the whole image
		 * or previously cropped area.
		 */
		public crop(): this

		/**
		 * Change the center point of the image.
		 *
		 * @param cx value between 0 and 1 representing the left or right
		 *   side of the image bounds. The bounds will be the whole image or the
		 *   defined source area at the time of the last crop().
		 * @param cy value between 0 and 1 representing the top or the
		 *   bottom of the image bounds.
		 */
		public pan(cx: number, cy: number): this

		/**
		 * Zoom in at the current location.
		 *
		 * @param factor how much to zoom in by (>0).
		 */
		public zoom(factor: number): this

		/**
		 * Render to the provided context.
		 *
		 * @param ctx canvas context to render to
		 */
		public render(ctx: Canvas.CanvasRenderingContext2D): this
	}

	function cover(img: Canvas.Image, x: number, y: number, width: number, height: number): Cover

	export = cover
}
