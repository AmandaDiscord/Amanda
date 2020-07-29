import TaihouImport = require("taihou");
import Taihou = require("taihou");

export = class Taihou {
	constructor(token: string, wolken: boolean, options?: ConstructorOptions)

	public axios: any;
	public token: string;
	public options: ConstructorOptions;

	public korra: TaihouImport.Taihou["korra"];
	public shimakaze: TaihouImport.Taihou["shimakaze"];
	public toph: TaihouImport.Taihou["toph"];
	public tama: TaihouImport.Taihou["tama"];

	public imageGeneration: Taihou["korra"];
	public reputation: Taihou["shimakaze"];
	public images: Taihou["toph"];
	public settings: Taihou["tama"];
}

declare interface TaihouOptions {
	userAgent: string;
	baseURL?: string;
	timeout?: number;
	headers?: {
		[header: string]: string | number | symbol;
	};
}

declare interface PerServiceOptions {
	toph?: TaihouImport.TophOptions & TaihouOptions;
	images?: TaihouImport.TophOptions & TaihouOptions;
	korra?: TaihouImport.KorraOptions & TaihouOptions;
	imageGeneration?: TaihouImport.KorraOptions & TaihouOptions;
	shimakaze?: TaihouImport.ShimakazeOptions & TaihouOptions;
	reputation?: TaihouImport.ShimakazeOptions & TaihouOptions;
	tama?: TaihouImport.TamaOptions & TaihouOptions;
	settings?: TaihouImport.TamaOptions & TaihouOptions;
}

declare type ConstructorOptions = TaihouOptions & PerServiceOptions;


export = Taihou;
