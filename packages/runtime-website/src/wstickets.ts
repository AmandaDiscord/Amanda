import nodeCrypto = require("node:crypto")

// Short-lived, single-use credentials for the public websocket handshake.
// The dashboard page mints one at render time and embeds it; the client sends it in IDENTIFY.
// This keeps the long-lived auth token in the HttpOnly cookie and out of JavaScript entirely.

const ticketLifetime = 30 * 1000

type Ticket = { userID: string; channelID: string }

const tickets = new Map<string, Ticket>()

/**
 * Mint a single-use ticket authorizing a websocket identify for a user viewing a specific channel
 * @param userID The id of the user the ticket authenticates
 * @param channelID The channel the ticket is scoped to
 * @returns The ticket string to embed in the page
 */
export function mint(userID: string, channelID: string): string {
	const ticket = nodeCrypto.randomBytes(24).toString("base64url")
	tickets.set(ticket, { userID, channelID })
	setTimeout(() => tickets.delete(ticket), ticketLifetime)
	return ticket
}

/**
 * Redeem a ticket, consuming it so it can never be used twice
 * @param ticket The ticket string sent by the client
 * @returns The associated user and channel, or null if the ticket is invalid or expired
 */
export function redeem(ticket: string): Ticket | null {
	const data = tickets.get(ticket)
	tickets.delete(ticket) // single-use regardless of the outcome
	return data ?? null
}
