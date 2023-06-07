const Sync = require("heatsync")
const sync = new Sync()
sync.events.on("any", filename => console.log(`${filename} has changed`))
module.exports = sync
