// @ts-check

const utils = require("../modules/utilities.js")

utils.sql.all("DELETE FROM csrf_tokens WHERE expires < $1", Date.now()) // delete expired tokens

module.exports = []
