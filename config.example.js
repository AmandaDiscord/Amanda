const cluster_id = "dev-env"

const config = {
	// tokens
	current_token: "",
	live_token: "",
	donor_status_manager_token: "",
	chewey_token: "",
	weeb_token: "",
	discord_app_public_key: "",
	lastfm_key: "",
	lastfm_sec: "",

	// usernames/identifiers
	sql_user: "",
	weeb_identifier: "",
	client_id: "",

	// passwords
	sql_password: "",
	lavalink_password: "youshallnotpass",

	// service connections
	sql_domain: "",
	website_protocol: "http",
	website_domain: "localhost:10400",
	chewey_api_url: "https://api.chewey-bot.top",

	// this cluster
	cluster_id,
	shards: [0],
	is_dev: true,

	// settings/global (not synced)
	total_shards: 1,
	dash_enabled: true,
	music_enabled: true,
	db_enabled: true,
	add_url_for_web_redirect: "",
	lavalink_default_search_prefix: "scsearch:",
	website_port: 10400,
	lavalink_nodes: [{
		host: "localhost",
		port: 10402,
		invidious_origin: "",
		enabled: 1,
		search_with_invidious: 0,
		name: "DEV",
		password: "youshallnotpass",
		id: "dev",
		resumeKey: "",
		resumeTimeout: 75
	}],
	standard_embed_color: 0x2f3136,
	error_log_channel_id: "",

	// constants
	patreon_url: "",
	paypal_url: "",
	twitch_url: "",
	server_url: "",
	invite_link_for_help: "",
	stats_url: "",
	privacy_url: "",
	terms_url: "",
	todo_url: "",
	add_url: "",

	// image placeholders
	unknown_placeholder: "",
	local_placeholder: ""
}

// Auto populate some of the config options

if (!config.live_token.length) config.live_token = config.current_token
if (!config.client_id.length && config.current_token.length) config.client_id = Buffer.from(config.current_token.split(".")[0] || "dW5rbm93bg==", "base64").toString("utf8")
if (!config.add_url_for_web_redirect.length && config.current_token.length) {
	config.add_url_for_web_redirect = `https://discord.com/api/oauth2/authorize?client_id=${config.client_id}&permissions=0&scope=bot%20applications.commands`
}
if (!config.weeb_identifier.length) config.weeb_identifier = `Amanda/1.0.0/${config.is_dev ? "dev" : "prod"}`


const baseURL = `${config.website_protocol}://${config.website_domain}`
config.patreon_url = `${baseURL}/to/patreon`
config.paypal_url = `${baseURL}/to/paypal`
config.server_url = `${baseURL}/to/server`
config.stats_url = `${baseURL}/to/stats`
config.privacy_url = `${baseURL}/to/privacy`
config.terms_url = `${baseURL}/to/terms`
config.todo_url = `${baseURL}/to/todo`
config.add_url = `${baseURL}/to/add`

config.local_placeholder = `${baseURL}/images/local.webp`
config.unknown_placeholder = `${baseURL}/images/unknown.webp`

module.exports = config
