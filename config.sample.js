const cluster_id = "cluster"

module.exports = {
	// Keys
	bot_token: "discord bot token here",
	mysql_password: "mysql password here",
	yt_api_key: "youtube api key here",
	chewey_api_key: "chewey bot api key here",
	lavalink_password: "lavalink password here",
	weeb_api_key: "weeb.sh api key here",
	genius_access_token: "genius api key here",
	redis_password: "redis password here",
	top_api_key: "top.gg api key here",
	botson_api_key: "bots.ondiscord.xyz api key here",
	boats_api_key: "discord.boats api key here",
	dbl_api_key: "discordbotlist.com api key here",
	botsgg_api_key: "discord.bots.gg api key here",
	del_api_key: "discordextremelist.xyz api key here",
	amqp_data_queue: `amqp-gateway-${cluster_id}`,

	// Environment
	machine_id: "lmao_dev_compname",
	mysql_domain: "example.com",
	sql_domain: "example.com",
	website_protocol: "http",
	website_domain: "localhost:10400",
	cache_server_protocol: "http",
	cache_server_domain: "localhost:10600",
	rest_server_protocol: "http",
	rest_server_domain: "localhost:10700",
	website_ipc_bind: "localhost",
	invidious_origin: "https://invidio.us",
	weeb_identifier: "AmandaSelfhosted/1.0.0/prod",
	additional_intents: [],
	shard_list: [0],
	amqp_username: "user",
	amqp_port: 5672,
	amqp_origin: "example.com",
	cluster_id: cluster_id,

	// Settings
	allow_ai: false,
	music_dash_enabled: true,
	use_invidious: false,
	total_shards: 1,
	fake_token: "(token)",
	is_dev_env: true
}
