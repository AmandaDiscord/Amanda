var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const { sync, server, confprovider, queues, sessions, sessionGuildIndex } = passthrough;
const wstickets = sync.require("../wstickets");
const opcodes = {
    IDENTIFY: 1,
    ACKNOWLEDGE: 2,
    STATE: 3,
    TRACK_ADD: 4,
    TRACK_REMOVE: 5,
    TRACK_UPDATE: 6,
    NEXT: 7,
    TIME_UPDATE: 8,
    TOGGLE_PLAYBACK: 9,
    SKIP: 10,
    STOP: 11,
    ATTRIBUTES_CHANGE: 12,
    CLEAR_QUEUE: 13,
    LISTENERS_UPDATE: 14,
    TRACK_PLAY_NOW: 15,
    SEEK: 16,
    ERROR: 17
};
const opcodeMethodMap = new Map([
    [opcodes.IDENTIFY, "identify"],
    [opcodes.STATE, "sendState"],
    [opcodes.TOGGLE_PLAYBACK, "togglePlayback"],
    [opcodes.SKIP, "requestSkip"],
    [opcodes.STOP, "requestStop"],
    [opcodes.ATTRIBUTES_CHANGE, "requestAttributesChange"],
    [opcodes.CLEAR_QUEUE, "requestClearQueue"],
    [opcodes.TRACK_REMOVE, "requestTrackRemove"],
    [opcodes.TRACK_PLAY_NOW, "requestPlayNow"],
    [opcodes.SEEK, "requestSeek"]
]);
export class Session {
    constructor(ws) {
        this.ws = ws;
        this.loggedin = false;
        this.guild = null;
        this.user = null;
        this.closed = false;
        setTimeout(() => {
            if (!this.loggedin)
                this.cleanClose();
        }, 5000);
    }
    send(data) {
        if (this.closed)
            return;
        const d = JSON.stringify(data);
        const result = this.ws.send(d);
        switch (result) {
            case 0:
                console.warn("message was added to a queue that will drain over time due to backpressure");
                break;
            case 1: break;
            case 2:
                console.error("message dropped due to backpressure limit");
                break;
            default:
                console.warn("NOTHING HAPPENED???");
                break;
        }
    }
    onClose() {
        var _a;
        this.closed = true;
        this.loggedin = false;
        console.log(`WebSocket disconnected: ${(_a = this.user) !== null && _a !== void 0 ? _a : "Unauthenticated"}`);
        this.removeFromIndexes();
        console.log(`${sessions.size} sessions in memory`);
    }
    invalidate() {
        this.removeFromIndexes();
        this.loggedin = false;
        this.cleanClose();
    }
    removeFromIndexes() {
        var _a, _b;
        if (!this.user || sessions.get(this.user) !== this)
            return;
        sessions.delete(this.user);
        if (this.guild) {
            (_a = sessionGuildIndex.get(this.guild)) === null || _a === void 0 ? void 0 : _a.delete(this.user);
            if (!((_b = sessionGuildIndex.get(this.guild)) === null || _b === void 0 ? void 0 : _b.size))
                sessionGuildIndex.delete(this.guild);
        }
    }
    deny(data, code) {
        var _a;
        this.send({ op: opcodes.ERROR, nonce: (_a = data === null || data === void 0 ? void 0 : data.nonce) !== null && _a !== void 0 ? _a : null, d: { code } });
    }
    identify(data) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            if (this.loggedin)
                return this.cleanClose();
            if ((data === null || data === void 0 ? void 0 : data.d) && typeof data.d.ticket === "string" && typeof data.d.channel_id === "string" && typeof data.d.timestamp === "number") {
                const serverTimeDiff = Date.now() - data.d.timestamp;
                if (!confprovider.config.db_enabled)
                    return this.deny(data, "UNAVAILABLE");
                const redeemed = wstickets.redeem(data.d.ticket);
                if ((redeemed === null || redeemed === void 0 ? void 0 : redeemed.channelID) !== data.d.channel_id)
                    return this.deny(data, "AUTH_FAILED");
                const state = yield redis.GET("voice", redeemed.userID);
                if (!state) {
                    console.warn(`Fake user tried to identify: ${redeemed.userID}`);
                    return this.deny(data, "NO_VOICE_STATE");
                }
                const existingSession = sessions.get(redeemed.userID);
                if (existingSession) {
                    console.warn(`User re-identified. Replacing existing session: ${redeemed.userID}`);
                    existingSession.invalidate();
                }
                this.loggedin = true;
                this.guild = state.guild_id;
                this.user = redeemed.userID;
                sessions.set(this.user, this);
                const existing = (_a = sessionGuildIndex.get(this.guild)) !== null && _a !== void 0 ? _a : new Set();
                existing.add(this.user);
                sessionGuildIndex.set(this.guild, existing);
                console.log(`WebSocket identified: ${this.user}`);
                console.log(`${sessions.size} sessions in memory`);
                this.send({ op: opcodes.ACKNOWLEDGE, nonce: (_b = data.nonce) !== null && _b !== void 0 ? _b : null, d: { serverTimeDiff } });
                this.sendState();
            }
        });
    }
    sendState(data) {
        var _a, _b;
        if (!this.loggedin)
            return;
        const state = (_a = queues.get(this.guild)) !== null && _a !== void 0 ? _a : null;
        let nonce = null;
        if (data && typeof data.nonce === "number")
            nonce = data.nonce;
        this.send({ op: opcodes.STATE, nonce: nonce, d: (_b = state === null || state === void 0 ? void 0 : state.toJSON()) !== null && _b !== void 0 ? _b : null });
    }
    cleanClose() {
        if (this.closed)
            return;
        this.send({ op: opcodes.STATE, nonce: null, d: null });
        this.ws.close();
    }
    onTrackAdd(track, position) {
        this.send({ op: opcodes.TRACK_ADD, d: { track: track.toObject(), position } });
    }
    onTrackRemove(index) {
        this.send({ op: opcodes.TRACK_REMOVE, d: { index } });
    }
    onTrackUpdate(track, index) {
        this.send({ op: opcodes.TRACK_UPDATE, d: { track: track.toObject(), index } });
    }
    onClearQueue() {
        this.send({ op: opcodes.CLEAR_QUEUE });
    }
    onNext() {
        this.send({ op: opcodes.NEXT });
    }
    onListenersUpdate(members) {
        this.send({ op: opcodes.LISTENERS_UPDATE, d: { members: members } });
    }
    onAttributesChange(queue) {
        this.send({ op: opcodes.ATTRIBUTES_CHANGE, d: { loop: queue.loop } });
    }
    onTimeUpdate(info) {
        this.send({ op: opcodes.TIME_UPDATE, d: info });
    }
    onStop() {
        this.send({ op: opcodes.STATE, nonce: null, d: null });
    }
    allowedToAction() {
        if (!this.loggedin)
            return false;
        const state = queues.get(this.guild);
        if (!state)
            return false;
        if (!state.listeners.has(this.user))
            return false;
        return true;
    }
    togglePlayback(data) {
        const allowed = this.allowedToAction();
        if (!allowed)
            return this.deny(data, "NOT_LISTENING");
        const q = queues.get(this.guild);
        if (!q)
            return this.cleanClose();
        q.paused = !q.paused;
    }
    requestSkip(data) {
        const allowed = this.allowedToAction();
        if (!allowed)
            return this.deny(data, "NOT_LISTENING");
        const q = queues.get(this.guild);
        if (!q)
            return this.cleanClose();
        q.skip();
    }
    requestStop(data) {
        const allowed = this.allowedToAction();
        if (!allowed)
            return this.deny(data, "NOT_LISTENING");
        const q = queues.get(this.guild);
        if (!q)
            return this.cleanClose();
        q.destroy(true);
    }
    requestAttributesChange(data) {
        var _a;
        const allowed = this.allowedToAction();
        if (!allowed)
            return this.deny(data, "NOT_LISTENING");
        const q = queues.get(this.guild);
        if (!q)
            return this.cleanClose();
        if (typeof ((_a = data === null || data === void 0 ? void 0 : data.d) === null || _a === void 0 ? void 0 : _a.loop) === "boolean")
            q.loop = data.d.loop;
    }
    requestClearQueue(data) {
        const allowed = this.allowedToAction();
        if (!allowed)
            return this.deny(data, "NOT_LISTENING");
        const q = queues.get(this.guild);
        if (!q)
            return this.cleanClose();
        q.tracks.splice(1, q.tracks.length - 1);
        this.onClearQueue();
    }
    requestTrackRemove(data) {
        var _a;
        const allowed = this.allowedToAction();
        if (!allowed)
            return this.deny(data, "NOT_LISTENING");
        const q = queues.get(this.guild);
        if (!q)
            return this.cleanClose();
        if (typeof ((_a = data === null || data === void 0 ? void 0 : data.d) === null || _a === void 0 ? void 0 : _a.index) === "number")
            q.removeTrack(data.d.index);
    }
    requestPlayNow(data) {
        var _a;
        const allowed = this.allowedToAction();
        if (!allowed)
            return this.deny(data, "NOT_LISTENING");
        const q = queues.get(this.guild);
        if (!q)
            return this.cleanClose();
        if (typeof ((_a = data === null || data === void 0 ? void 0 : data.d) === null || _a === void 0 ? void 0 : _a.index) === "number") {
            if (data.d.index === 0)
                return;
            if (!q.tracks[data.d.index])
                return;
            const tracks = q.tracks.splice(data.d.index, 1);
            q.tracks.splice(1, 0, ...tracks);
            q.skip();
            this.sendState();
        }
    }
    requestSeek(data) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const allowed = this.allowedToAction();
            if (!allowed)
                return this.deny(data, "NOT_LISTENING");
            const q = queues.get(this.guild);
            if (!q)
                return this.cleanClose();
            if (typeof ((_a = data === null || data === void 0 ? void 0 : data.d) === null || _a === void 0 ? void 0 : _a.time) === "number") {
                const result = yield q.seek(data.d.time);
                if (result === 3)
                    this.cleanClose();
            }
        });
    }
}
server.ws("/public", {
    maxPayloadLength: 16 * 1024,
    idleTimeout: 120,
    upgrade(res, req, context) {
        const secWebSocketKey = req.getHeader("sec-websocket-key");
        const secWebSocketProtocol = req.getHeader("sec-websocket-protocol");
        const secWebSocketExtensions = req.getHeader("sec-websocket-extensions");
        res.writeStatus("101 Switching Protocols");
        res.upgrade({ session: void 0 }, secWebSocketKey, secWebSocketProtocol, secWebSocketExtensions, context);
    },
    open(ws) {
        const session = new Session(ws);
        ws.getUserData().session = session;
    },
    message(ws, message) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const msg = Buffer.from(message).toString();
            const session = ws.getUserData().session;
            try {
                const data = JSON.parse(msg);
                const method = opcodeMethodMap.get(data.op);
                if (method)
                    yield session[method](data);
            }
            catch (e) {
                console.log(`${(_a = session.user) !== null && _a !== void 0 ? _a : "Unauthenticated"} sent an invalid JSON:\n${msg}`, e);
                session.cleanClose();
            }
        });
    },
    close(ws) {
        ws.getUserData().session.onClose();
    }
});
console.log("Public websocket API loaded");
