import type { APIUser } from "discord-api-types/v10"

class Amanda {
	public user: APIUser

	public constructor(public snow: import("snowtransfer").SnowTransfer) {
		void snow
	}
}

export = Amanda
