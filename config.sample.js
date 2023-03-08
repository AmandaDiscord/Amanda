const cluster_id = "cluster"

module.exports = {
	// Keys
	bot_token: "discord bot token here",
	live_bot_token: "can be same as bot_token if not using multiple bots",
	helper_bot_token: "optional bot token that's allowed to access the GUILD_MEMBERS intent for premium updates",
	sql_password: "mysql password here",
	chewey_api_key: "chewey bot api key here",
	lavalink_password: "lavalink password here",
	weeb_api_key: "weeb.sh api key here",
	top_api_key: "top.gg api key here",
	botson_api_key: "bots.ondiscord.xyz api key here",
	boats_api_key: "discord.boats api key here",
	dbl_api_key: "discordbotlist.com api key here",
	botsgg_api_key: "discord.bots.gg api key here",
	del_api_key: "discordextremelist.xyz api key here",
	discords_api_key: "discords.com api key here",
	app_public_key: "discord app public key here",
	lastfm_key: "last.fm api key here",
	lastfm_secret: "last.fm api secret here",

	// Environment
	sql_domain: "example.com",
	sql_user: "user",
	website_protocol: "http",
	website_domain: "localhost:10400",
	weeb_identifier: "AmandaSelfhosted/1.0.0/prod",
	shard_list: [0],
	cluster_id: cluster_id,
	add_url: "your url here",
	amqp_url: "amqp://quest:guest@localhost:56782",
	amqp_queue: "amanda",
	amqp_music_queue: "amanda_music",
	amqp_website_queue: "amanda_website",
	error_log_channel_id: "channel id here",
	premium_guild_id: "guild id here",
	premium_role_id: "role id here",

	// Settings
	music_dash_enabled: true,
	total_shards: 1,
	is_dev_env: true,
	db_enabled: true,
	amqp_enabled: true
}
