const Gate = require("snowgate")

const config = require("../config")
const [domain, port] = config.rest_server_domain.split(":")

const gate = new Gate({ host: domain, port: Number(port), token: config.bot_token, options: { disableEveryone: true } })

gate.start().then(() => console.log("REST Initialized"))
