// @ts-check

const utils = require("../modules/utilities.js")

utils.sql.all("DELETE FROM CSRFTokens WHERE expires < ?", Date.now()) // delete expired tokens

module.exports = []
