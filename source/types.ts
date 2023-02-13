export type Config = {
	"live_bot_token": string
	"test_bot_token": string
	"bot_token": string
	"sql_password": string
	"yt_api_key": string
	"chewey_api_key": string
	"lavalink_password": string
	"weeb_api_key": string
	"redis_password": string
	"top_api_key": string
	"botson_api_key": string
	"boats_api_key": string
	"dbl_api_key": string
	"botsgg_api_key": string
	"del_api_key": string
	"discords_api_key": string
	"listen_moe_username": string
	"listen_moe_password": string
	"app_public_key": string

	"sql_domain": string
	"website_protocol": "http" | "https"
	"website_domain": string
	"weeb_identifier": string
	"additional_intents": Array<string>
	"shard_list": Array<number>
	"cluster_id": string
	"add_url": string
	"amqp_url": string
	"amqp_queue": string
	"amqp_music_queue": string
	"amqp_website_queue": string

	"music_dash_enabled": boolean
	"total_shards": number
	"is_dev_env": boolean
	"db_enabled": boolean
	"amqp_enabled": boolean
}

export type UnpackArray<T> = T extends Array<infer R> ? R : never
export type UnpackRecord<T> = T extends Record<string, infer R> ? R : never
export type InferMapK<T> = T extends Map<infer K, unknown> ? K : never
export type InferMapV<T> = T extends Map<string, infer V> ? V : never
export type Merge<A, B> = ({ [K in keyof A]: K extends keyof B ? B[K] : A[K] } & B) extends infer O ? { [K in keyof O]: O[K] } : never

export type InferModelDef<M extends import("./client/utils/orm").Model<unknown>> = M extends import("./client/utils/orm").Model<infer D> ? D : unknown

export type LavalinkInfo = {
	identifier: string
	isSeekable: boolean
	author: string
	length: number
	isStream: boolean
	position: number
	title: string
	uri: string
}

export type InvidiousPlaylistAuthorThumbnail = {
	url: string
	width: number
	height: number
}

export type InvidiousPlaylistVideoThumbnail = {
	quality: string
	url: string
	width: number
	height: number
}

export type InvidiousPlaylistVideo = {
	title: string
	videoId: string
	author: string
	authorId: string
	authorUrl: string
	videoThumbnails: InvidiousPlaylistVideoThumbnail[]
	index: number
	lengthSeconds: number
}

export type InvidiousPlaylist = {
	type: "playlist"
	title: string
	playlistid: string
	playlistThumbnail: string
	author: string
	authorId: string
	authorUrl: string
	authorThumbnails: InvidiousPlaylistAuthorThumbnail[]
	description: string
	descriptionHtml: string
	videoCount: number
	viewCount: number
	updated: number
	isListed: boolean
	videos: InvidiousPlaylistVideo[]
}

export type iTunesSearchResult = {
	wrapperType: string
	kind: string
	artistId: number
	collectionId: number
	trackId: number
	artistName: string
	collectionName: string
	trackName: string
	collectionCensoredName: string
	trackCensoredName: string
	artistViewUrl: string
	collectionViewUrl: string
	trackViewUrl: string
	previewUrl: string
	artworkUrl30: string
	artworkUrl60: string
	artworkUrl100: string
	collectionPrice: number
	trackPrice: number
	releaseDate: string
	collectionExplicitness: string
	trackExplicitness: string
	discCount: number
	discNumber: number
	trackCount: number
	trackNumber: number
	trackTimeMillis: number
	country: string
	currency: string
	primaryGenreName: string
	contentAdvisoryRating: string
	isStreamable: boolean
}

export type PartialTrack = {
	title: string
	class: string
	id: string
	length: number
	thumbnail: { src: string; width: number; height: number }
	live: boolean
}

export type WebQueue = {
	members: Array<{ id: string; tag: string; avatar: string | null; isAmanda: boolean }>
	tracks: Array<PartialTrack>
	playing: boolean
	voiceChannel: { name: string; id: string }
	pausedAt: number | null
	trackStartTime: number
	attributes: {
		loop: boolean
	}
}
