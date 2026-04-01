declare module "gifencoder" {
	import { Readable, Duplex } from "stream";
	import { CanvasRenderingContext2D, ImageData } from "canvas";

	declare function GIFEncoder(width: number, height: number): void;

	declare class GIFEncoder {
		constructor(width: number, height: number);
		width: number;
		height: number;
		transparent: number | null;
		transIndex: number;
		repeat: number;
		delay: number;
		image: Uint8ClampedArray;
		pixels: Uint8Array<ArrayBuffer> | null;
		indexedPixels: Uint8Array<ArrayBuffer> | null;
		colorDepth: number | null;
		colorTab: number[] | null;
		usedEntry: boolean[];
		palSize: number;
		dispose: number;
		firstFrame: boolean;
		sample: number;
		started: boolean;
		readStreams: Readable[];
		out: ByteArray;
		createReadStream(rs?: Readable): Readable;
		createWriteStream(options: { delay: number, frameRate: number, dispose: number, repeat: number, transparent: number, quality: number }): Duplex;
		emit(): void;
		end(): void;
		setDelay(milliseconds: number): void;
		setFrameRate(fps: number): void;
		setDispose(disposalCode: number): void;
		setRepeat(repeat: number): void;
		setTransparent(color: number | string): void;
		addFrame(imageData: CanvasRenderingContext2D | ImageData): void;
		finish(): void;
		setQuality(quality: any): void;
		start(): void;
		analyzePixels(): void;
		findClosest(c: number): number;
		getImagePixels(): void;
		writeGraphicCtrlExt(): void;
		writeImageDesc(): void;
		writeLSD(): void;
		writeNetscapeExt(): void;
		writePalette(): void;
		writeShort(pValue: number): void;
		writePixels(): void;
	}

	declare function ByteArray(): void;

	declare class ByteArray {
		data: any[];
		getData(): any;
		writeByte(val: any): void;
		writeUTFBytes(string: any): void;
		writeBytes(array: any, offset: any, length: any): void;
	}

	export = GIFEncoder;
}
