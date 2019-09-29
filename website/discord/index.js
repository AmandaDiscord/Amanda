//@ts-check

const Snow = require("snowtransfer")
const config = require("../../config")
const snow = new Snow(config.bot_token, {disableEveryone: true})
//snow.requestHandler.on("request", console.log)
snow.requestHandler.on("requestError", console.error)
snow.user.getUser("320067006521147393").then(console.log)
snow.user.getUser("176580265294954507").then(() => {
	console.log(snow.user.cache.get("176580265294954507"))
})
