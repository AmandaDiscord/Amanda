import Discord = require("discord.js");
import events = require("events");
import Structures = require("../../structures/");

import Queue = require("../../compiledtypings/queue");
import Game = require("../../compiledtypings/game");

export class QueueManager {
	constructor();

	public storage: Discord.Collection<string, Queue>;
	public events: events.EventEmitter;
	public songsPlayed: number;

	public addQueue(queue: Queue): void;
}
export class GameManager {
	constructor();

	public storage: Discord.Collection<string, Game>;
	public gamesPlayed: number;

	public addGame(game: Game): void;
}
export class ReactionMenu {
	constructor(message: Structures.Message, actions: Array<ReactionMenuAction>);

	public message: Structures.Message;
	public actions: Array<ReactionMenuAction>;
	public promise: Promise<void>;
	public menus: {
		[messageID: string]: ReactionMenu;
	}

	public react(): Promise<void>;
	public destroy(remove?: boolean): void;
}
export class CommandStore extends Discord.Collection<string, Command> {
	constructor();

	public categories: Map<string, Array<string>>;

	public assign(properties: {
		[name: string]: Command;
	}): any;
}


export class ReactionMenuAction {
	constructor();

	public emoji: Discord.Emoji|Discord.ReactionEmoji|String;
	public messageReaction?: Discord.MessageReaction;
	public allowedUsers?: Array<string>;
	public deniedUsers?: Array<string>;
	public ignore?: "that"|"thatTotal"|"all"|"total"|"none";
	public remove?: "user"|"bot"|"all"|"message";
	public actionType?: "reply"|"edit"|"js"|"none";

	public actionData(message?: Structures.Message, emoji?: Discord.Emoji|Discord.ReactionEmoji, user?: Structures.User, messageReaction?: Discord.MessageReaction, reactionMenus?: {
		[messageID: string]: ReactionMenu;
	}): any;
}
export class Command {
	constructor();

	public usage: string;
	public description: string;
	public aliases: Array<string>;
	public category: string;

	public process(msg?: Structures.Message, suffix?: string): any;
}
