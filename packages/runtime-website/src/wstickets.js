const ticketLifetime = 30 * 1000;
const tickets = new Map();
export function mint(userID, channelID) {
    const ticket = nodeCrypto.randomBytes(24).toString("base64url");
    tickets.set(ticket, { userID, channelID });
    setTimeout(() => tickets.delete(ticket), ticketLifetime);
    return ticket;
}
export function redeem(ticket) {
    const data = tickets.get(ticket);
    tickets.delete(ticket);
    return data !== null && data !== void 0 ? data : null;
}
