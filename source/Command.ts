class Command {
	public author: import("discord-api-types/v10").APIUser
	public member: import("discord-api-types/v10").APIInteractionGuildMember | null
	public guild_id: string | null
	public channel_id: string
	public locale: import("discord-api-types/v10").LocaleString
	public guild_locale: import("discord-api-types/v10").LocaleString | null
	public data: Data

	public id: string
	public application_id: string
	public token: string

	public constructor(interaction: import("discord-api-types/v10").APIChatInputApplicationCommandInteraction) {
		this.author = interaction.user ? interaction.user : interaction.member!.user
		this.member = interaction.member ?? null
		this.guild_id = interaction.guild_id ?? null
		this.channel_id = interaction.channel_id!
		this.locale = interaction.locale
		this.guild_locale = interaction.guild_locale ?? null
		this.data = new Data(interaction.data!)

		this.id = interaction.id
		this.application_id = interaction.application_id
		this.token = interaction.token
	}
}

class Data {
	public users: Map<string, import("discord-api-types/v10").APIUser>
	public members: Map<string, import("discord-api-types/v10").APIInteractionDataResolvedGuildMember>
	public roles: Map<string, import("discord-api-types/v10").APIRole>
	public channels: Map<string, import("discord-api-types/v10").APIInteractionDataResolvedChannel>
	public messages: Map<string, import("discord-api-types/v10").APIMessage>
	public attachments: Map<string, import("discord-api-types/v10").APIAttachment>

	public options: Map<string, Option>

	public constructor(data: import("discord-api-types/v10").APIChatInputApplicationCommandInteractionData) {
		this.users = new Map(Object.entries(data.resolved?.users || {}))
		this.members = new Map(Object.entries(data.resolved?.members || {}))
		this.roles = new Map(Object.entries(data.resolved?.roles || {}))
		this.channels = new Map(Object.entries(data.resolved?.channels || {}))
		this.attachments = new Map(Object.entries(data.resolved?.attachments || {}))

		this.options = new Map(data.options?.map(c => [c.name, new Option(c)]) || [])
	}
}


class Option {
	public options: Map<string, Option>
	public value: unknown

	public constructor(data: import("discord-api-types/v10").APIApplicationCommandInteractionDataOption | import("discord-api-types/v10").APIApplicationCommandInteractionDataBasicOption) {
		this.options = new Map((data as import("discord-api-types/v10").APIApplicationCommandInteractionDataSubcommandOption).options?.map(c => [c.name, new Option(c)]))
		this.value = (data as Exclude<typeof data, import("discord-api-types/v10").APIApplicationCommandInteractionDataSubcommandOption | import("discord-api-types/v10").APIApplicationCommandInteractionDataSubcommandGroupOption>).value ?? null
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
