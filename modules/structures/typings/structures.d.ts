import Discord = require("discord.js");

import managers = require("../../managers");

import Queue = require("../../compiledtypings/queue");

// Export Structures Classes
export class Amanda extends Discord.Client {
	constructor(options?: Discord.ClientOptions);

	public user: ClientUser
	public users: UserStore;
	public guilds: GuildStore;

	public findUser(message: Message, string: string, self: boolean): Promise<User>;
}
export class DMChannel extends Discord.DMChannel {
	constructor(client: Amanda, data: any);

	public client: Amanda;
	public recipient: User;
	public messages: MessageStore;

	public send(content?: Discord.StringResolvable, options?: Discord.MessageOptions | Discord.MessageAdditions): Promise<Message>;
	public send(content?: Discord.StringResolvable, options?: Discord.MessageOptions & { split?: false } | Discord.MessageAdditions): Promise<Message>;
	public send(content?: Discord.StringResolvable, options?: Discord.MessageOptions & { split: true | Discord.SplitOptions } | Discord.MessageAdditions): Promise<Message[]>;
	public send(options?: Discord.MessageOptions | Discord.MessageAdditions | Discord.APIMessage): Promise<Message>;
	public send(options?: Discord.MessageOptions & { split?: false } | Discord.MessageAdditions | Discord.APIMessage): Promise<Message>;
	public send(options?: Discord.MessageOptions & { split: true | Discord.SplitOptions } | Discord.MessageAdditions | Discord.APIMessage): Promise<Message[]>;

	public sendTyping(): Promise<void>;
}
export class Guild extends Discord.Guild {
	constructor(client: Amanda, data: any);

	public queue: Queue;

	public findMember(message: Message, string: string, self: boolean): Promise<GuildMember>;
}
export class GuildMember extends Discord.GuildMember {
	constructor(client: Amanda, data: any, guild: Guild);

	public user: User;

	readonly displaTag: string;
	readonly activityEmoji: string;

	public send(content?: Discord.StringResolvable, options?: Discord.MessageOptions | Discord.MessageAdditions): Promise<Message>;
	public send(content?: Discord.StringResolvable, options?: Discord.MessageOptions & { split?: false } | Discord.MessageAdditions): Promise<Message>;
	public send(content?: Discord.StringResolvable, options?: Discord.MessageOptions & { split: true | Discord.SplitOptions } | Discord.MessageAdditions): Promise<Message[]>;
	public send(options?: Discord.MessageOptions | Discord.MessageAdditions | Discord.APIMessage): Promise<Message>;
	public send(options?: Discord.MessageOptions & { split?: false } | Discord.MessageAdditions | Discord.APIMessage): Promise<Message>;
	public send(options?: Discord.MessageOptions & { split: true | Discord.SplitOptions } | Discord.MessageAdditions | Discord.APIMessage): Promise<Message[]>;
}
export class Message extends Discord.Message {
	constructor(client: Amanda, data: any, channel: TextChannel|DMChannel);

	public channel: TextChannel|DMChannel;
	public guild: Guild;
	public author: User;
	public member: GuildMember;

	public menu: managers.ReactionMenu;

	public edit(content: Discord.StringResolvable, options?: Discord.MessageEditOptions | Discord.MessageEmbed): Promise<Message>;
	public edit(options: Discord.MessageEditOptions | Discord.MessageEmbed | Discord.APIMessage): Promise<Message>;

	public reactionMenu(actions: Array<managers.ReactionMenuAction>): managers.ReactionMenu;
}
export class TextChannel extends Discord.TextChannel {
	constructor(guild: Guild, data: any);

	public messages: MessageStore;

	public send(content?: any, options?: Discord.MessageOptions | Discord.MessageAdditions): Promise<Message>;
	public send(content?: any, options?: Discord.MessageOptions & { split?: false } | Discord.MessageAdditions): Promise<Message>;
	public send(content?: any, options?: Discord.MessageOptions & { split: true | Discord.SplitOptions } | Discord.MessageAdditions): Promise<Message[]>;
	public send(options?: Discord.MessageOptions | Discord.MessageAdditions | Discord.APIMessage): Promise<Message>;
	public send(options?: Discord.MessageOptions & { split?: false } | Discord.MessageAdditions | Discord.APIMessage): Promise<Message>;
	public send(options?: Discord.MessageOptions & { split: true | Discord.SplitOptions } | Discord.MessageAdditions | Discord.APIMessage): Promise<Message[]>;

	public sendTyping(): Promise<void>;
}
export class User extends Discord.User {
	constructor(client: Amanda, data: any);

	readonly activityPrefix: "Playing"|"Streaming"|"Listening to"|"Watching";
	readonly activityEmoji: string;
	readonly activeOn: string;

	public send(content?: Discord.StringResolvable, options?: Discord.MessageOptions | Discord.MessageAdditions): Promise<Message>;
	public send(content?: Discord.StringResolvable, options?: Discord.MessageOptions & { split?: false } | Discord.MessageAdditions): Promise<Message>;
	public send(content?: Discord.StringResolvable, options?: Discord.MessageOptions & { split: true | Discord.SplitOptions } | Discord.MessageAdditions): Promise<Message[]>;
	public send(options?: Discord.MessageOptions | Discord.MessageAdditions | Discord.APIMessage): Promise<Message>;
	public send(options?: Discord.MessageOptions & { split?: false } | Discord.MessageAdditions | Discord.APIMessage): Promise<Message>;
	public send(options?: Discord.MessageOptions & { split: true | Discord.SplitOptions } | Discord.MessageAdditions | Discord.APIMessage): Promise<Message[]>;
}


// Export Typings Classes
export class ClientUser extends User {
	constructor(client: Amanda, data: any);

	readonly mfaEnabled: boolean;
	readonly verified: boolean;

	public setActivity(name?: string|Discord.ActivityOptions, options?: Discord.ActivityOptions): Promise<Discord.Presence>;
	public setAFK(afk: boolean): Promise<Discord.Presence>;
	public setAvatar(avatar: Discord.BufferResolvable|Discord.Base64Resolvable): Promise<ClientUser>;
	public setPresence(data: Discord.PresenceData): Promise<Discord.Presence>;
	public setStatus(status: Discord.PresenceStatusData, shardID?: number|Array<number>): Promise<Discord.Presence>;
	public setUsername(username: string): Promise<ClientUser>;
}
export class MessageReaction extends Discord.MessageReaction {
	constructor(client: Amanda, data: any, message: Message);

	public message: Message;
}


export class GuildStore extends Discord.DataStore<string, Guild, typeof Guild, GuildResolvable> {
	constructor(client: Amanda, iterable?: Iterable<any>);

	public create(name: string, options?: { region?: string, icon: Discord.BufferResolvable|Discord.Base64Resolvable|null }): Promise<Guild>;
}
export class UserStore extends Discord.DataStore<string, User, typeof User, UserResolvable> {
	constructor(client: Amanda, iterable?: Iterable<any>);

	public fetch(id: string, cache?: boolean): Promise<User>;
}
export class MessageStore extends Discord.DataStore<string, Message, typeof Message, MessageResolvable> {
	constructor(channel: TextChannel|DMChannel, iterable?: Iterable<any>);

	public fetch(message: string, cache?: boolean): Promise<Message>;
	public fetch(options?: Discord.ChannelLogsQueryOptions, cache?: boolean): Promise<Discord.Collection<string, Message>>;
	public fetchPinned(cache?: boolean): Promise<Discord.Collection<string, Message>>;
	public remove(message: MessageResolvable, reason?: string): Promise<void>;
}

// Local Types
type GuildResolvable = Guild|string;
type UserResolvable = User|string;
type MessageResolvable = Message|string;