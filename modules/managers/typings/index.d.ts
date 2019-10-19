import Discord = require("discord.js");
import Lang = require("@amanda/lang");
import events = require("events");

export class CommandStore extends Discord.Collection<string, Command> {
	constructor();

	public categories: Map<string, Array<string>>;

	public assign(properties: { [name: string]: Command; }): void;
};

export import GameStore = require("../datastores/GameStore");

export import QueueStore = require("../datastores/QueueStore");

export import PeriodicHistory = require("../datastores/PeriodicHistory");

export class ReactionMenu {
	constructor(message: Discord.Message, actions: Array<ReactionMenuAction>);

	public message: Discord.Message;
	public actions: Array<ReactionMenuAction>;

	public react(): Promise<void>;
	public destroy(remove: boolean): void;

	private _removeAll(): void;
	private _removeEach(): void;
}

export const reactionMenus: Map<string, ReactionMenu>;

export type Command = {
	usage: string;
	description: string;
	aliases: Array<string>;
	category: string;
	process(msg?: Discord.Message, suffix?: string, lang?: Lang.Lang): any;
};

export type ReactionMenuAction = {
	emoji: Discord.EmojiIdentifierResolvable;
	messageReaction?: Discord.MessageReaction;
	allowedUsers?: Array<string>;
	deniedUsers?: Array<string>;
	ignore?: string;
	remove?: string;
	actionType?: string;
	actionData?(message: Discord.Message, emoji: Discord.Emoji|Discord.ReactionEmoji, user: Discord.User): any;
}
