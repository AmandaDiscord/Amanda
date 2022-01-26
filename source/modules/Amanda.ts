import { Client } from "thunderstorm"

class Amanda extends Client {
	public lavalink: import("lavacord").Manager | undefined

	public constructor(options: import("thunderstorm").ClientOptions) {
		super(options)
	}
}

export = Amanda
