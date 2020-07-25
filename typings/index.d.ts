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

export interface LavalinkInfo {
	identifier: string;
	isSeekable: boolean;
	author: string;
	length: number;
	isStream: boolean;
	position: number;
	title: string;
	uri: string;
}

export interface SpotifyTrack {
	album: SpotifyAlbum;
	artists: Array<SpotifyArtist>;
	disc_number: number;
	duration_ms: number;
	explicit: boolean;
	external_ids: {};
	href: string;
	id: string;
	is_local: boolean;
	is_playable: boolean;
	name: string;
	popularity: number;
	preview_url: string;
	track_number: number;
	type: "track";
	uri: string;
}

export interface SpotifyPlaylist {
	collaborative: boolean;
	description: string;
	external_urls?: {
		spotify?: string;
	};
	followers: {
		href?: string;
		total: number;
	};
	href: string;
	id: string;
	images: Array<SpotifyImage>;
	name: string;
	owner: SpotifyUser;
	primary_color: null;
	public: boolean;
	snapshot_id: string;
	tracks: {
		href: string;
		items: Array<SpotifyPlaylistItem>;
		limit: number;
		next: null;
		offset: number;
		previous: null;
		total: number;
	};
	type: "playlist";
	uri: string;
	etag: string;
}

export interface SpotifyPlaylistItem {
	added_at: string;
	added_by: SpotifyUser;
	is_local: boolean;
	primary_color: null;
	track: SpotifyTrack;
	video_thumbnail: {
		url: null;
	};
}

export interface SpotifyAlbum {
	album_type: string;
	artists: Array<SpotifyArtist>;
	external_urls?: {
		spotify?: string;
	};
	href: string;
	id: string;
	images: Array<SpotifyImage>;
	name: string;
	release_data: string;
	release_date_precision: string;
	total_tracks: number;
	type: "album";
	uri: string;
}

export interface SpotifyArtist {
	external_urls?: {
		spotify?: string;
	};
	href: string;
	id: string;
	name: string;
	type: "artist";
	uri: string;
}

export interface SpotifyUser {
	display_name?: string;
	external_urls?: {
		spotify?: string;
	};
	href: string;
	id: string;
	type: "user";
	uri: string;
}

export interface SpotifyImage {
	height: number;
	url: string;
	width: number;
}

// Overloaded functions

export declare function reactionMenu1(message: Discord.Message, actions: Array<import("@amanda/reactionmenu").ReactionMenuAction>): ReactionMenu;
export declare function reactionMenu2(message: Discord.Message, actions: Array<import("@amanda/reactionmenu").ReactionMenuActionEdit>): ReactionMenu;
export declare function reactionMenu3(message: Discord.Message, actions: Array<import("@amanda/reactionmenu").ReactionMenuActionReply>): ReactionMenu;
export declare function reactionMenu4(message: Discord.Message, actions: Array<import("@amanda/reactionmenu").ReactionMenuActionJS>): ReactionMenu;
