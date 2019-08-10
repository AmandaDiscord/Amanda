import Discord = require("discord.js");

import Queue = require("../../compiledtypings/queue");

// Export Structures Classes
export class Amanda extends Discord.Client {
	constructor(options?: Discord.ClientOptions);

	public users: UserStore;
	public guilds: GuildStore;

	public findUser(message: Message, string: string, self: boolean): Promise<User>;
}
export class DMChannel extends Discord.DMChannel {
	constructor(client: Amanda, data: any);

	public client: Amanda;
	public recipient: User;

	public sendTyping(): Promise<void>;
}
export class Guild extends Discord.Guild {
	constructor(client: Amanda, data: any);

	public queue: Queue;
}
export class GuildMember extends Discord.GuildMember {

}
export class Message extends Discord.Message {

}
export class MessageReaction extends Discord.MessageReaction {
	
}
export class TextChannel extends Discord.TextChannel {

}
export class User extends Discord.User {

}


// Export Typings Classes
export class ClientUser extends Discord.ClientUser {
	constructor(client: Amanda, data: any);

	public activityPrefix: "Playing"|"Streaming"|"Listening to"|"Watching";
}


export class GuildStore extends Discord.DataStore<string, Guild, typeof Guild, GuildResolvable> {
	constructor(client: Amanda, iterable?: Iterable<any>);

	public create(name: string, options?: { region?: string, icon: Discord.BufferResolvable|Discord.Base64Resolvable|null }): Promise<Guild>;
}
export class UserStore extends Discord.DataStore<string, User, typeof User, UserResolvable> {
	constructor(client: Amanda, iterable?: Iterable<any>);

	public fetch(id: string, cache?: boolean): Promise<User>;
}

// Local Types
type GuildResolvable = Guild|string;
type UserResolvable = User|string