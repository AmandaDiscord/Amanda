import type { APIUser } from "discord-api-types/v10"

class Amanda {
	// @ts-expect-error It will get assigned
	public user: APIUser

	public constructor(public snow: import("snowtransfer").SnowTransfer) {}
}

export = Amanda
