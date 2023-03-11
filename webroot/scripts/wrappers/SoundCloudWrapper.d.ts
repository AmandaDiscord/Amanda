import { Wrapper } from "./interface"

export class SoundCloudWrapper extends Wrapper {
	public frame: HTMLElement | null
	public controller: any
	public ready: boolean
	public seekers: Set<Symbol>
}
