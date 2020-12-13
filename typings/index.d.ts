import MySQL = require("MySQL2/promise");
import events = require("events");

export interface FilteredGuild {
	id: string;
	name: string;
	icon: string;
	nameAcronym: string;
}

export interface InternalEvents {
	prefixes: [Array<string>, string];
	QueueManager: [import("../modules/managers/QueueManager")]
}


export class internalEvents extends events.EventEmitter {
	constructor();

	public on<K extends keyof InternalEvents>(event: K, listener: (...args: InternalEvents[K]) => void): this;
	public once<K extends keyof InternalEvents>(event: K, listener: (...args: InternalEvents[K]) => void): this;
	public emit<K extends keyof InternalEvents>(event: K, ...args: InternalEvents[K]): boolean;
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

export interface GatewayStatusUpdateData {
	name: string;
	type: 0 | 1 | 2 | 3 | 5;
	url?: string;
	status?: "online" | "idle" | "dnd" | "offline";
}

export interface PresenceData {
	status: number;
	game?: {
		name: string;
		type: number;
		url?: string;
	};
}

interface CacheUserData { username?: string; id?: string; discriminator?: string; tag?: string; }
interface CacheGuildData { name?: string; id?: string; }
interface CacheChannelData { name?: string; id?: string; guild_id?: string; }
interface CacheMemberData { nick?: string; guild_id?: string }
interface CacheVoiceStateData { channel_id?: string; guild_id?: string; user_id?: string; }

export interface CacheOperations {
	FIND_GUILD: CacheGuildData;
	FILTER_GUILDS: CacheGuildData & { limit?: number; };

	FIND_CHANNEL: CacheChannelData;
	FILTER_CHANNELS: CacheChannelData & { limit?: number; };

	GET_USER: { id: string; };
	FIND_USER: CacheUserData;
	FILTER_USERS: CacheUserData & { limit?: number; };

	FIND_MEMBER: CacheMemberData & CacheUserData;
	FILTER_MEMBERS: CacheMemberData & { limit?: number } & CacheUserData;
	GET_USER_GUILDS: { id: string; };
	GET_MEMBERS_IN_ROLE: { guild_id: string; role_id: string; };

	FIND_VOICE_STATE: CacheVoiceStateData
	FILTER_VOICE_STATES: CacheVoiceStateData & { limit?: number; };

	SAVE_DATA: CacheSaveData;

	DELETE_USER: { id: string };
	DELETE_USERS: CacheUserData & { limit?: number; ids?: Array<string>; confirm?: boolean; };
}

export interface CacheRequestData<E extends keyof CacheOperations> {
	op: E;
	params: CacheOperations[E];
}

export interface CacheSaveData {
	type: "GUILD" | "CHANNEL" | "USER";
	data: any;
}
