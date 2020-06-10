// @ts-check

const Amanda = require("./structures/Discord/Amanda")
const mysql = require("mysql2/promise")
const { EventEmitter } = require("events")

const passthrough = require("../passthrough")

const config = require("../config")

passthrough.client = new Amanda()
passthrough.constants = require("../constants")
passthrough.config = config
passthrough.reloadEvent = new EventEmitter()

module.exports = passthrough
