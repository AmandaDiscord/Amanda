// @ts-check

const Amanda = require("./structures/Discord/Amanda")
const mysql = require("mysql2/promise")
const { EventEmitter } = require("events")

const passthrough = require("../passthrough")

const config = require("../config")
const constants = require("../constants")

const client = new Amanda()
const reloadEvent = new EventEmitter()

Object.assign(passthrough, { config, constants, client, reloadEvent })

module.exports = passthrough
