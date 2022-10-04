class Command {
	public author: import("discord-typings").User
	public member: import("discord-typings").Interaction["member"]
	public guild_id: string | null
	public channel_id: string
	public locale: import("discord-typings").Interaction["locale"]
	public guild_locale: import("discord-typings").Interaction["guild_locale"]
	public data: Data

	public id: string
	public application_id: string
	public token: string

	public constructor(interaction: import("discord-typings").Interaction) {
		this.author = interaction.user ? interaction.user : interaction.member!.user
		this.member = interaction.member
		this.guild_id = interaction.guild_id ?? null
		this.channel_id = interaction.channel_id!
		this.locale = interaction.locale
		this.guild_locale = interaction.guild_locale
		this.data = new Data(interaction.data!)

		this.id = interaction.id
		this.application_id = interaction.application_id
		this.token = interaction.token
	}
}

class Data {
	public users: Map<string, import("discord-typings").User>
	public members: Map<string, import("discord-typings").Member & { user: import("discord-typings").User }>
	public roles: Map<string, import("discord-typings").Role>
	public channels: Map<string, import("discord-typings").Channel>
	public messages: Map<string, import("discord-typings").Message>
	public attachments: Map<string, import("discord-typings").Attachment>

	public options: Map<string, Option>

	public constructor(data: import("discord-typings").InteractionData) {
		this.users = new Map(Object.entries(data.resolved?.users || {}))
		this.members = new Map(Object.entries(data.resolved?.members || {}))
		this.roles = new Map(Object.entries(data.resolved?.roles || {}))
		this.channels = new Map(Object.entries(data.resolved?.channels || {}))
		this.messages = new Map(Object.entries(data.resolved?.messages || {}))
		this.attachments = new Map(Object.entries(data.resolved?.attachments || {}))

		this.options = new Map(data.options?.map(c => [c.name, new Option(c)]) || [])
	}
}

class Option {
	public options: Map<string, Option>
	public value: unknown

	public constructor(data: import("discord-typings").ApplicationCommandInteractionDataOption) {
		this.options = new Map((data as import("discord-typings").ApplicationCommandOptionAsTypeSub).options?.map(c => [c.name, new Option(c as import("discord-typings").ApplicationCommandInteractionDataOption)]))
		this.value = (data as { value: unknown }).value ?? null
	}

	public asString(): string | null {
		return this.value as string
	}

	public asNumber(): number | null {
		return this.value as number
	}

	public asBoolean(): boolean | null {
		return this.value as boolean
	}
}

export = Command
