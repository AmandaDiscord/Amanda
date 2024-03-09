import util = require("util")

import { getLang, userString } from "@amanda/shared-utils"
import confprovider = require("@amanda/config")

import type {
	APIUser,
	APIInteractionGuildMember,
	LocaleString,
	APIChatInputApplicationCommandInteraction,
	APIInteractionDataResolvedGuildMember,
	APIRole,
	APIInteractionDataResolvedChannel,
	APIMessage,
	APIAttachment,
	APIChatInputApplicationCommandInteractionData,
	APIApplicationCommandInteractionDataOption,
	APIApplicationCommandInteractionDataBasicOption,
	APIApplicationCommandInteractionDataSubcommandOption,
	APIApplicationCommandInteractionDataSubcommandGroupOption,
	APIApplicationCommandOption
} from "discord-api-types/v10"
import type { SnowTransfer } from "snowtransfer"

export class ChatInputCommand {
	public author: APIUser
	public member: APIInteractionGuildMember | null
	public guild_id: string | null
	public channel: APIChatInputApplicationCommandInteraction["channel"]
	public locale: LocaleString
	public guild_locale: LocaleString | null
	public data: ChatInputCommandData

	public id: string
	public application_id: string
	public token: string

	public constructor(interaction: APIChatInputApplicationCommandInteraction) {
		this.author = interaction.user ? interaction.user : interaction.member!.user
		this.member = interaction.member ?? null
		this.guild_id = interaction.guild_id ?? null
		this.channel = interaction.channel
		this.locale = interaction.locale
		this.guild_locale = interaction.guild_locale ?? null
		this.data = new ChatInputCommandData(interaction.data)

		this.id = interaction.id
		this.application_id = interaction.application_id
		this.token = interaction.token
	}
}

export class ChatInputCommandData {
	public users: Map<string, APIUser>
	public members: Map<string, APIInteractionDataResolvedGuildMember>
	public roles: Map<string, APIRole>
	public channels: Map<string, APIInteractionDataResolvedChannel>
	public messages: Map<string, APIMessage>
	public attachments: Map<string, APIAttachment>

	public options: Map<string, CommandOption>

	public constructor(data: APIChatInputApplicationCommandInteractionData) {
		this.users = new Map(Object.entries(data.resolved?.users ?? {}))
		this.members = new Map(Object.entries(data.resolved?.members ?? {}))
		this.roles = new Map(Object.entries(data.resolved?.roles ?? {}))
		this.channels = new Map(Object.entries(data.resolved?.channels ?? {}))
		this.attachments = new Map(Object.entries(data.resolved?.attachments ?? {}))

		this.options = new Map(data.options?.map(c => [c.name, new CommandOption(c)]) ?? [])
	}
}

export class CommandOption {
	public options: Map<string, CommandOption>
	public value: unknown

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


export class CommandManager<Params extends Array<unknown>> {
	public commands = new Map<string, Command<Params>>()
	public categories = new Map<string, Array<string>>()

	public constructor(
		public paramGetter: (command: APIChatInputApplicationCommandInteraction) => Params,
		public errorHandler?: (error: unknown) => unknown
	) { void 0 }

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

	public remove(commands: Array<string>): void {
		for (const command of commands) {
			if (this.commands.get(command)) {
				this.commands.delete(command)
				this.categories.forEach(c => {
					if (c.includes(command)) c.splice(c.indexOf(command), 1)
				})
			}
		}
	}

	public handle(command: APIChatInputApplicationCommandInteraction, snow?: SnowTransfer): boolean {
		if (!this.commands.has(command.data?.name)) return false

		setImmediate(async () => {
			const params = this.paramGetter(command)
			let returnValue: unknown
			try {
				await snow?.interaction.createInteractionResponse(command.id, command.token, { type: 5 })
				returnValue = this.commands.get(command.data.name)!.process(...params)
			} catch (e) {
				if (snow) {
					const userLang = getLang(command.locale)
					snow.interaction.createFollowupMessage(command.application_id, command.token, { content: userLang.GLOBAL.COMMAND_ERROR }).catch(() => void 0)
					if (confprovider.config.error_log_channel_id?.length) {
						const user = (command.member?.user ?? command.user!)

						const undef = "undefined"
						const details = [
							["Tree", confprovider.config.cluster_id],
							["Guild ID", command.guild_id ?? undef],
							["Text Channel", `${command.channel.name ?? undef} (${command.channel.id})`],
							["User ID", user.id],
							["User Tag", userString(user)]
						]
						const maxLength = details.reduce((p, c) => Math.max(p, c[0].length), 0)
						const detailsString = details.map(row =>
							`\`${row[0]}${" ​".repeat(maxLength - row?.[0].length)}\` ${row[1]}` // SC: space + zwsp, wide space
						).join("\n")

						snow.channel.createMessage(confprovider.config.error_log_channel_id, {
							embeds: [
								{
									color: 0xdd2d2d,
									title: "Command error occurred.",
									fields: [
										{ name: "Details", value: detailsString },
										{ name: "Exception", value: util.inspect(e, false, 5, false) }
									]
								}
							]
						})
					}
				}
				this.errorHandler?.(e)
			}
			if (returnValue instanceof Promise) returnValue.catch(reason => this.errorHandler?.(reason))
		})

		return true
	}
}

export type Command<Params extends Array<unknown>> = {
	name: string;
	options?: Array<APIApplicationCommandOption>;
	description: string;
	category: string;
	examples?: Array<string>;
	order?: number;
	process(...args: Params): unknown;
}
