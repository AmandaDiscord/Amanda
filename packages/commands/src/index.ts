import {
	type APIUser,
	type APIInteractionGuildMember,
	type Locale,
	type APIChatInputApplicationCommandInteraction,
	type APIInteractionDataResolvedGuildMember,
	type APIRole,
	type APIInteractionDataResolvedChannel,
	type APIMessage,
	type APIAttachment,
	type APIChatInputApplicationCommandInteractionData,
	type APIApplicationCommandInteractionDataOption,
	type APIApplicationCommandInteractionDataBasicOption,
	type APIApplicationCommandInteractionDataSubcommandOption,
	type APIApplicationCommandInteractionDataSubcommandGroupOption,
	type APIApplicationCommandOption,
	type APIContextMenuInteractionData,
	type APIContextMenuInteraction,
} from "discord-api-types/v10"

/**
 * A wrapper around the Discord Chat Input Interaction
 */
export class ChatInputCommand {
	/** The user who initiated this command */
	public readonly author: APIUser
	/** The member object of the user if this command was initiated in a guild */
	public readonly member: APIInteractionGuildMember | null
	/** The id of the guild this command was initiated in if any */
	public readonly guild_id: string | null
	/** The channel this command was initiated in */
	public readonly channel: APIChatInputApplicationCommandInteraction["channel"]
	/** The language the user initiating this command has set on their Discord client */
	public readonly locale: Locale
	/** The preferred language of the guild this command was initiated in if any */
	public readonly guild_locale: Locale | null
	/** The data inputted to the command if any such as options and their resolutions */
	public readonly data: ChatInputCommandData

	/** The Discord auto generated id of the command/webhook */
	public readonly id: string
	/** The id of the app this command is for */
	public readonly application_id: string
	/** The token for this command/webhook to respond/update responses */
	public readonly token: string
	/** The permissions the app or bot has within the channel the command was initiated in */
	public readonly app_permissions: string

	/**
	 * @param interaction The Chat Input Interaction received from Discord
	 */
	public constructor(interaction: APIChatInputApplicationCommandInteraction) {
		this.author = interaction.member?.user ?? interaction.user!
		this.member = interaction.member ?? null
		this.guild_id = interaction.guild_id ?? null
		this.channel = interaction.channel
		this.locale = interaction.locale
		this.guild_locale = interaction.guild_locale ?? null
		this.data = new ChatInputCommandData(interaction.data)

		this.id = interaction.id
		this.application_id = interaction.application_id
		this.token = interaction.token
		this.app_permissions = interaction.app_permissions
	}
}

/**
 * A wrapper around the Chat Input Interaction's options and their resolutions
 * using Maps for fast K, V fetching instead of iterating over the raw Object from the
 * API to find options and their resolutions
 */
export class ChatInputCommandData {
	/** Resolved users from the supplied options */
	public readonly users: Map<string, APIUser>
	/** Resolved members from the supplied options */
	public readonly members: Map<string, APIInteractionDataResolvedGuildMember>
	/** Resolved roles from the supllied options */
	public readonly roles: Map<string, APIRole>
	/** Resolved channels from the supplied options */
	public readonly channels: Map<string, APIInteractionDataResolvedChannel>
	/** Resolved attachments from the supplied options */
	public readonly attachments: Map<string, APIAttachment>

	/** The options the user sent. For options that needed resolutions, the command options wrap id strings */
	public readonly options: Map<string, CommandOption>

	/**
	 * @param data The data for the Chat Input Interaction received from Discord
	 */
	public constructor(data: APIChatInputApplicationCommandInteractionData) {
		this.users = new Map(Object.entries(data.resolved?.users ?? {}))
		this.members = new Map(Object.entries(data.resolved?.members ?? {}))
		this.roles = new Map(Object.entries(data.resolved?.roles ?? {}))
		this.channels = new Map(Object.entries(data.resolved?.channels ?? {}))
		this.attachments = new Map(Object.entries(data.resolved?.attachments ?? {}))

		this.options = new Map(data.options?.map(c => [c.name, new CommandOption(c)]) ?? [])
	}
}

/**
 * A wrapper around any of the option types Discord could send from a user
 * Supports sub commands and their subsequent options
 */
export class CommandOption {
	/** If a sub command, the options for said sub command. Empty Map otherwise */
	public readonly options: Map<string, CommandOption>
	/** The backing value this CommandOption represents or null if a sub command or was optional and not supplied. Use the as* methods to assert types */
	public readonly value: unknown

	/**
	 * @param data The data for this option received from Discord
	 */
	public constructor(data: APIApplicationCommandInteractionDataOption | APIApplicationCommandInteractionDataBasicOption) {
		this.options = new Map(
			(data as APIApplicationCommandInteractionDataSubcommandOption)
				.options
				?.map(c => [c.name, new CommandOption(c)]))

		this.value = (data as Exclude<
			typeof data,
			APIApplicationCommandInteractionDataSubcommandOption | APIApplicationCommandInteractionDataSubcommandGroupOption
		>).value ?? null
	}

	/** Assert this command option to be a string or null if the option was optional and not supplied */
	public asString(): string | null {
		return this.value as string
	}

	/** Assert this command option to be a number or null if the option was optional and not supplied */
	public asNumber(): number | null {
		return this.value as number
	}

	/** Assert this command option to be a boolean or null if the option was optional and not supplied */
	public asBoolean(): boolean | null {
		return this.value as boolean
	}
}

/**
 * A wrapper around commands issued from the Discord context menu
 */
export class ContextMenuCommand {
	/** The user who initiated this command */
	public readonly author: APIUser
	/** The member object of the user if this command was initiated in a guild */
	public readonly member: APIInteractionGuildMember | null
	/** The id of the guild this command was initiated in if any */
	public readonly guild_id: string | null
	/** The channel this command was initiated in */
	public readonly channel: APIChatInputApplicationCommandInteraction["channel"]
	/** The language the user initiating this command has set on their Discord client */
	public readonly locale: Locale
	/** The preferred language of the guild this command was initiated in if any */
	public readonly guild_locale: Locale | null
	/** The resolved data for the target of this command */
	public readonly data: ContextMenuCommandData
	/** The id of the target this command was issued for */
	public readonly target: string

	/** The Discord auto generated id of the command/webhook */
	public readonly id: string
	/** The id of the app this command is for */
	public readonly application_id: string
	/** The token for this command/webhook to respond/update responses */
	public readonly token: string
	/** The permissions the app or bot has within the channel the command was initiated in */
	public readonly app_permissions: string

	/**
	 * @param interaction The Context Menu Interaction from Discord
	 */
	public constructor(interaction: APIContextMenuInteraction) {
		this.author = interaction.member?.user ?? interaction.user!
		this.member = interaction.member ?? null
		this.guild_id = interaction.guild_id ?? null
		this.channel = interaction.channel
		this.locale = interaction.locale
		this.guild_locale = interaction.guild_locale ?? null
		this.data = new ContextMenuCommandData(interaction.data)
		this.target = interaction.data.target_id

		this.id = interaction.id
		this.application_id = interaction.application_id
		this.token = interaction.token
		this.app_permissions = interaction.app_permissions
	}
}

/**
 * A wrapper around the Context Menu command and its resolutions
 * using Maps for fast K, V fetching instead of iterating over the raw Object from the
 * API to find options and their resolutions
 */
export class ContextMenuCommandData {
	/** The id of the target this command was issued for */
	public readonly target_id: string

	/** Resolved users from the context menu interaction */
	public readonly users: Map<string, APIUser>
	/** Resolved members from the context menu interaction */
	public readonly members: Map<string, APIInteractionDataResolvedGuildMember>
	/** Resolved messages from the context menu interaction */
	public readonly messages: Map<string, APIMessage>

	/**
	 * @param data The data for the Context Menu Interaction from Discord
	 */
	public constructor(data: APIContextMenuInteractionData) {
		this.target_id = data.target_id

		if (data.type === 2) {
			this.users = new Map(Object.entries(data.resolved.users))
			this.members = new Map(Object.entries(data.resolved.members ?? {}))
			this.messages = new Map()
		} else {
			this.messages = new Map(Object.entries(data.resolved.messages))
			this.users = new Map()
			this.members = new Map()
		}
	}
}

/**
 * A manager to store command info and their callback along with a centralized
 * way to handle incoming commands and handle the errors that might arise from
 * their execution
 */
export class CommandManager<Params extends Array<unknown>> {
	/** Commands assigned to this manager */
	public readonly commands = new Map<string, Command<Params>>()
	/** Categories from assigned commands. Managed automatically */
	public readonly categories = new Map<string, Array<string>>()

	/**
	 * @param paramGetter Function to get the types and values for every or specific commands. Typically for all
	 * @param errorHandler Function to handle errors from command execution or from the reply function
	 */
	public constructor(
		public paramGetter: (command: APIChatInputApplicationCommandInteraction) => Params,
		public errorHandler?: (command: APIChatInputApplicationCommandInteraction, error: unknown) => unknown
	) {}

	/**
	 * Assign commands to this manager
	 * @param properties An Array of commands
	 */
	public assign(properties: Array<Command<Params>>): void {
		properties.forEach(i => {
			if (this.commands.get(i.name)) this.commands.delete(i.name)
			this.commands.set(i.name, i)
			this.categories.forEach(c => {
				if (c.includes(i.name)) c.splice(c.indexOf(i.name), 1)
			})
			const cat = this.categories.get(i.category)
			if (!cat) this.categories.set(i.category, [i.name])
			else if (!cat.includes(i.name)) cat.push(i.name)
		})
	}

	/**
	 * Remove commands from this manager
	 * @param commands An array of command names
	 */
	public remove(commands: Array<string>): void {
		for (const command of commands) {
			if (this.commands.get(command)) {
				this.commands.delete(command)
				this.categories.forEach((c, k) => {
					if (c.includes(command)) c.splice(c.indexOf(command), 1)
					if (c.length === 0) this.categories.delete(k)
				})
			}
		}
	}

	/**
	 * Handler for incoming chat input command interactions
	 * @param command The interaction from Discord
	 * @param replyFn An optional function to reply to Discord
	 * @returns A boolean of if the command was handled or not
	 */
	public handle(command: APIChatInputApplicationCommandInteraction, replyFn?: () => Promise<unknown> | unknown): boolean {
		if (!this.commands.has(command.data?.name)) return false

		this._handle(command, replyFn)

		return true
	}

	private async _handle(command: APIChatInputApplicationCommandInteraction, replyFn?: () => Promise<unknown> | unknown): Promise<void> {
		const params = this.paramGetter(command)
		let returnValue: unknown
		try {
			await replyFn?.()
			returnValue = this.commands.get(command.data.name)!.process(...params)
		} catch (e) {
			this.errorHandler?.(command, e)
		}
		if (returnValue instanceof Promise) returnValue.catch(reason => this.errorHandler?.(command, reason))
	}
}

export type Command<Params extends Array<unknown>> = {
	name: string
	type?: 1 | 2 | 3
	integration_types?: Array<number>
	contexts?: Array<number>
	options?: Array<APIApplicationCommandOption>
	description: string
	category: string
	guild_ids?: Array<string>
	examples?: Array<string>
	order?: number
	process(...args: Params): unknown
}
