import type { APIUser } from "discord-api-types/v10"

class Amanda {
	public user: APIUser

	// eslint-disable-next-line no-empty-function
	public constructor(public snow: import("snowtransfer").SnowTransfer) {}
}

export = Amanda
