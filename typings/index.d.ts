import MySQL = require("MySQL2/promise");
import Discord = require("discord.js");
import ReactionMenu = require("@amanda/reactionmenu");

export interface FilteredGuild {
	id: string;
	name: string;
	icon: string;
	nameAcronym: string;
}

export interface SQLWrapper {
	all(string: string): Promise<Array<MySQL.RowDataPacket>>;
	all(string: string, prepared?: string|number|symbol): Promise<Array<MySQL.RowDataPacket>>;
	all(string: string, prepared?: Array<(string|number|symbol)>): Promise<Array<MySQL.RowDataPacket>>;
	all(string: string, prepared?: string|number|symbol, connection?: MySQL.Pool|MySQL.PoolConnection): Promise<Array<MySQL.RowDataPacket>>;
	all(string: string, prepared?: Array<(string|number|symbol)>, connection?: MySQL.Pool|MySQL.PoolConnection): Promise<Array<MySQL.RowDataPacket>>;
	all(string: string, prepared?: string|number|symbol, connection?: MySQL.Pool|MySQL.PoolConnection, attempts?: number): Promise<Array<MySQL.RowDataPacket>>;
	all(string: string, prepared?: Array<(string|number|symbol)>, connection?: MySQL.Pool|MySQL.PoolConnection, attempts?: number): Promise<Array<MySQL.RowDataPacket>>;

	get(string: string): Promise<MySQL.RowDataPacket>;
	get(string: string, prepared?: string|number|symbol): Promise<MySQL.RowDataPacket>;
	get(string: string, prepared?: Array<(string|number|symbol)>): Promise<MySQL.RowDataPacket>;
	get(string: string, prepared?: string|number|symbol, connection?: MySQL.Pool|MySQL.PoolConnection): Promise<MySQL.RowDataPacket>;
	get(string: string, prepared?: Array<(string|number|symbol)>, connection?: MySQL.Pool|MySQL.PoolConnection): Promise<MySQL.RowDataPacket>;
	get(string: string, prepared?: string|number|symbol, connection?: MySQL.Pool|MySQL.PoolConnection, attempts?: number): Promise<MySQL.RowDataPacket>;
	get(string: string, prepared?: Array<(string|number|symbol)>, connection?: MySQL.Pool|MySQL.PoolConnection, attempts?: number): Promise<MySQL.RowDataPacket>;
}

export interface IPCReceiver {
	op: string;
	fn: (data: any) => any;
}

export interface CombinedShardStats {
	ping: number[],
	uptime: number[],
	ram: number[],
	combinedRam: number,
	users: number,
	guilds: number,
	channels: number,
	connections: number
}

export interface InvidiousPlaylistAuthorThumbnail {
	url: string,
	width: number,
	height: number
}

export interface InvidiousPlaylistVideoThumbnail {
	quality: string,
	url: string,
	width: number,
	height: number
}

export interface InvidiousPlaylistVideo {
	title: string,
	videoId: string,
	author: string,
	authorId: string,
	authorUrl: string,
	videoThumbnails: InvidiousPlaylistVideoThumbnail[],
	index: number,
	lengthSeconds: number
}

export interface InvidiousPlaylist {
	type: "playlist",
	title: string,
	playlistid: string,
	playlistThumbnail: string,
	author: string,
	authorId: string,
	authorUrl: string,
	authorThumbnails: InvidiousPlaylistAuthorThumbnail[],
	description: string,
	descriptionHtml: string,
	videoCount: number,
	viewCount: number,
	updated: number,
	isListed: boolean,
	videos: InvidiousPlaylistVideo[]
}

export interface Command<T extends Array<any>> {
	usage: string;
	description: string;
	aliases: Array<string>;
	category: string;
	example?: string;
	process(message: Discord.Message, args?: string, ...extras: T): any;
}

export declare function reactionMenu1(message: Discord.Message, actions: Array<import("@amanda/reactionmenu").ReactionMenuAction>): ReactionMenu;
export declare function reactionMenu2(message: Discord.Message, actions: Array<import("@amanda/reactionmenu").ReactionMenuActionEdit>): ReactionMenu;
export declare function reactionMenu3(message: Discord.Message, actions: Array<import("@amanda/reactionmenu").ReactionMenuActionReply>): ReactionMenu;
export declare function reactionMenu4(message: Discord.Message, actions: Array<import("@amanda/reactionmenu").ReactionMenuActionJS>): ReactionMenu;
