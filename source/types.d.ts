import { EventEmitter } from "events"

export interface InternalEventsMap {
	prefixes: [Array<string>, string];
	QueueManager: []
}

export interface internalEvents extends EventEmitter {
	on<K extends keyof InternalEventsMap>(event: K, listener: (...args: InternalEventsMap[K]) => void): this;
	once<K extends keyof InternalEventsMap>(event: K, listener: (...args: InternalEventsMap[K]) => void): this;
	emit<K extends keyof InternalEventsMap>(event: K, ...args: InternalEventsMap[K]): boolean;
}

export type Config = {
	"live_bot_token": string,
	"test_bot_token": string,
	"bot_token": string,
	"sql_password": string,
	"yt_api_key": string,
	"chewey_api_key": string,
	"lavalink_password": string,
	"weeb_api_key": string,
	"genius_access_token": string,
	"redis_password": string,
	"top_api_key": string,
	"botson_api_key": string,
	"boats_api_key": string,
	"dbl_api_key": string,
	"botsgg_api_key": string,
	"del_api_key": string,
	"listen_moe_username": string,
	"listen_moe_password": string,

	"sql_domain": string,
	"website_protocol": string,
	"website_domain": string,
	"website_ipc_bind": string,
	"machine_id": string,
	"weeb_identifier": string,
	"additional_intents": Array<string>,
	"shard_list": Array<number>,
	"cluster_id": string,

	"music_dash_enabled": boolean,
	"total_shards": number,
	"is_dev_env": boolean
}
