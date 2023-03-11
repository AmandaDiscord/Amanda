declare class ImageStore {
	public store: Map<string, HTMLImageElement>

	public add(url: string): HTMLImageElement | null
	public get(url: string): HTMLImageElement | undefined

	private _create(url: string): HTMLImageElement
}

export const imageStore: ImageStore
