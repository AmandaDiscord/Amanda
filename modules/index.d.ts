import { Snowflake, Collection, TextChannel, VoiceChannel, StreamDispatcher, VoiceConnection, Message, RichEmbed, GuildMember, User, Guild } from 'discord.js';
import { Socket } from 'net';
import { EventEmitter } from 'events';
import { BetterTimeout } from './util';

declare interface utils {
	sql: {
		all(string: string, prepared: Array<any>, connection: any, attempts: number): Array<BinaryRow>;
		get(string: string, prepared: Array<any>, connection: any): BinaryRow;
	}
	waifuGifts: {
		"Flowers": WaifuGift;
		"Cupcake": WaifuGift;
		"Thigh highs": WaifuGift;
		"Soft toy": WaifuGift;
		"Fancy dinner": WaifuGift;
		"Expensive pudding": WaifuGift;
		"Trip to Timbuktu": WaifuGift;
	}
	coinsManager: {
		get(userID: Snowflake): number;
		set(userID: Snowflake, value: number): void;
		award(userID: Snowflake, value: number): BinaryRow;
	}
	waifu: {
		get(userID: Snowflake, options: object): Promise<object>;
		bind(claimer: Snowflake, claimed: Snowflake, price: number): Promise<void>;
		unbind(userID: Snowflake): Promise<void>;
		transact(userID: Snowflake, amount: number): Promise<void>;
		all: Promise<Array<BinaryRow>>;
	}
	queueStorage: {
		"storage": Collection<Snowflake, Queue>;

		addQueue(queue: Queue): Collection<Snowflake, Queue>;
	}

	BetterTimeout: typeof BetterTimeout;
	DMUser: typeof DMUser;

	hasPermission(Object: User | Guild, Permission: string): Promise<Boolean>;
	cooldownManager(userID: Snowflake, command: string, info: object): Number;
	progressBar(length: Number, value: Number, max: Number, text: string): string;
	stringify(data: any, depth: Number): Promise<string>;
	addMusicLogEntry(guild: Guild, entry: object): void;
	getSixTime(when: any, separator: string): string;
	getConnection(): any;
	addTemporaryListener(target: EventEmitter, name: string, filename: string, code: Function): void;
}

type WaifuGift = {
	price?: number;
	value?: number;
	emoji?: string;
	description?: string;
};
type BinaryRow = {};

declare class Queue {
	constructor(textchannel: TextChannel, voicechannel: VoiceChannel);
	private _voiceChannel: VoiceChannel;
	private _dispatcher: StreamDispatcher;
	private reactionMenu: typeof ReactionMenu;

	public id: Snowflake;
	public connection: VoiceConnection;
	public playedSongs: Set<string>;
	public songs: Array<YouTubeSong | FriskySong>;
	public playing: Boolean;
	public skippable: Boolean;
	public auto: Boolean;
	public nowPlayingMsg: Message;
	public queueStorage: utils["queueStorage"];
	public voiceLeaveTimeout: typeof BetterTimeout;

	public toObject(): object;
	public dissolve(): void;
	public destroy(): Collection<Snowflake, Queue>;
	public addSong(song: Song, insert: Boolean): void;
	public voiceStateUpdate(oldMember: GuildMember, newMember: GuildMember): void;
	public getNPEmbed(): RichEmbed;
	public generateReactions(): void;
	public queueAction(code: Function): any;
	public play(): void;
	public pause(web: any): Array<any>;
	public resume(web: any): Array<any>;
	public skip(web: any): Array<any>;
	public stop(web: any): Array<any>;
}
declare class Song {
	constructor(title: string, source: string, live: Boolean);

	public title: string;
	public source: string;
	public live: Boolean;
	public streaming: Boolean;
	public connectionPlayFunction: string;

	public toObject(): object;
	public object(): undefined;
	public getStream(): void;
	public related(): Promise<Array<object>>;
}
declare class YouTubeSong extends Song {
	constructor(info: object, cache: Boolean);

	public url: string;
	public basic: object;
	public info: object;
}
declare class FriskySong extends Song {
	constructor(station: string);

	public station: string;

	public toUnified(): object;
	public stream(): Promise<Socket>;
}

declare class DMUser {
	constructor(userID: Snowflake);

	public userID: Snowflake;
	public user: User;
	public events: EventEmitter;

	public fetch(): Promise<void>;
	public send(): Promise<Message | Error>;
}
declare class ReactionMenu {
	constructor(message: Message, actions: Array<object>);

	public message: Message;
	public actions: Array<object>;
	public promise: Promise<void>;

	public react(): Promise<void>;
	public destroy(remove: Boolean): void;
}

export { utils };