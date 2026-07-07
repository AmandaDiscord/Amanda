var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const { rootFolder, confprovider, lavalink, commands, snow, commandWorkers, queues, gatewayShardIndex, sync } = passthrough;
const sharedUtils = sync.require("@amanda/shared-utils");
const autocomplete = sync.require("./autocomplete");
import { Locale } from "discord-api-types/v10";
const commaRegex = /,/g;
const slashSingleRegex = /\//;
const toEndOfSemiRegex = /([^;]+);?/;
export function toArrayBuffer(buffer) {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}
export function onAbortedOrFinishedResponseStream(res, readStream) {
    if (res.id !== -1)
        readStream.destroy();
    res.id = -1;
}
export function streamResponse(res, readStream, totalSize) {
    let resolveOuter;
    let cancel = false;
    const onAbort = () => {
        onAbortedOrFinishedResponseStream(res, readStream);
        if (resolveOuter)
            resolveOuter();
        else
            cancel = true;
    };
    attachResponseAbortListener(res, onAbort);
    return new Promise((resolve, reject) => {
        if (cancel)
            return resolve();
        resolveOuter = reject;
        readStream.on("data", chunk => {
            const ab = toArrayBuffer(chunk);
            const lastOffset = res.getWriteOffset();
            res.cork(() => {
                const [ok, done] = res.tryEnd(ab, totalSize);
                if (done) {
                    onAbortedOrFinishedResponseStream(res, readStream);
                    resolve(void 0);
                }
                else if (!ok) {
                    readStream.pause();
                    res.ab = ab;
                    res.abOffset = lastOffset;
                    res.onWritable(offset => {
                        const [ok2, done2] = res.tryEnd(res.ab.slice(offset - res.abOffset), totalSize);
                        if (done2) {
                            onAbortedOrFinishedResponseStream(res, readStream);
                            resolve(void 0);
                        }
                        else if (ok2)
                            readStream.resume();
                        return ok2;
                    });
                }
            });
        }).once("error", e => {
            readStream.destroy();
            res.end();
            reject(e);
        });
    });
}
export function attachResponseAbortListener(res, callback) {
    if (res.alreadyAborted)
        return void (callback === null || callback === void 0 ? void 0 : callback());
    if (res.abortListeners)
        res.abortListeners.push(callback);
    else {
        res.continue = true;
        res.abortListeners = [];
        res.onAborted(() => {
            res.continue = false;
            for (const cb of res.abortListeners) {
                cb();
                res.abortListeners = undefined;
                res.alreadyAborted = true;
            }
        });
    }
}
export function streamFile(path_1, res_1, acceptHead_1, ifModifiedSinceHeader_1) {
    return __awaiter(this, arguments, void 0, function* (path, res, acceptHead, ifModifiedSinceHeader, headersOnly = false, status = 200, cameFrom404 = false) {
        attachResponseAbortListener(res);
        let stats;
        const joined = p.join(rootFolder, path);
        if (!joined.startsWith(rootFolder))
            return streamFile("404.html", res, acceptHead, ifModifiedSinceHeader, headersOnly, 404, true);
        try {
            stats = yield fs.promises.stat(joined);
            if (!res.continue)
                return;
        }
        catch (_a) {
            console.log(`404 ${path}`);
            if (!res.continue)
                return;
            if (cameFrom404) {
                let written = false;
                return void res.cork(() => {
                    if (written)
                        return;
                    written = true;
                    res.writeStatus("404").endWithoutBody();
                });
            }
            else
                return streamFile("404.html", res, acceptHead, ifModifiedSinceHeader, headersOnly, 404, true);
        }
        if (!stats.isFile()) {
            if (cameFrom404) {
                let written = false;
                return void res.cork(() => {
                    if (written)
                        return;
                    written = true;
                    res.writeStatus("404").endWithoutBody();
                });
            }
            else
                return streamFile("404.html", res, acceptHead, ifModifiedSinceHeader, headersOnly, 404, true);
        }
        if (stats.size === 0) {
            let written = false;
            return void res.cork(() => {
                if (written)
                    return;
                written = true;
                res.writeStatus("204").endWithoutBody();
            });
        }
        const type = mime.lookup(path) || "application/octet-stream";
        const acceptable = acceptHead !== null && acceptHead !== void 0 ? acceptHead : "*/*";
        const splitAccept = acceptable.split(commaRegex);
        const canAccept = splitAccept.some(i => {
            const [reqNamespace, reqType] = i.split(slashSingleRegex);
            if (!reqNamespace || !reqType)
                return false;
            const vWithoutQ = toEndOfSemiRegex.exec(reqType);
            if (!vWithoutQ)
                return false;
            const [resNamespace, resType] = type.split(slashSingleRegex);
            if (reqNamespace !== "*" && resNamespace !== reqNamespace)
                return false;
            if (vWithoutQ[1] !== "*" && resType !== vWithoutQ[1])
                return false;
            return true;
        });
        if (!canAccept) {
            let written = false;
            return void res.cork(() => {
                if (written)
                    return;
                written = true;
                res.writeStatus("406").endWithoutBody();
            });
        }
        if (!cameFrom404 && ifModifiedSinceHeader) {
            if (sharedUtils.checkDateHeader(ifModifiedSinceHeader)) {
                const expecting = new Date(ifModifiedSinceHeader);
                if (stats.mtimeMs >= expecting.getTime()) {
                    status = 304;
                    headersOnly = true;
                }
            }
        }
        let written = false;
        res.cork(() => {
            if (written)
                return;
            written = true;
            res.writeStatus(String(status));
            res.writeHeader("Content-Type", type);
            res.writeHeader("Last-Modified", stats.mtime.toUTCString());
            res.writeHeader("Cache-Control", "no-cache");
        });
        if (headersOnly)
            return void res.cork(() => res.endWithoutBody());
        const stream = fs.createReadStream(joined);
        yield streamResponse(res, stream, stats.size);
    });
}
export function redirect(res, location) {
    const bod = `Redirecting to <a href="${location}">${location}</a>...`;
    let written = false;
    res.cork(() => {
        if (written)
            return;
        written = true;
        res
            .writeStatus("303")
            .writeHeader("Location", location)
            .writeHeader("Content-Type", "text/html")
            .end(bod);
    });
}
export function generateCSRF(loginToken = null) {
    const token = nodeCrypto.randomBytes(32).toString("hex");
    const expires = Date.now() + 6 * 60 * 60 * 1000;
    sql.raw("INSERT INTO csrf_tokens (token, login_token, expires) VALUES ($1, $2, $3)", [token, loginToken, expires]).catch(console.error);
    return token;
}
export function checkCSRF(token, loginToken, consume) {
    return __awaiter(this, void 0, void 0, function* () {
        let result = true;
        const row = yield sql.orm.get("csrf_tokens", { token });
        if (!row || (row.expires < Date.now()) || (loginToken && row.login_token != loginToken))
            result = false;
        if (consume)
            yield sql.orm.delete("csrf_tokens", { token });
        return result;
    });
}
const anyAfterSemiRegex = /; */;
export function getCookies(cookie) {
    const result = new Map();
    if (cookie) {
        cookie.split(anyAfterSemiRegex).forEach(pair => {
            const eqIndex = pair.indexOf("=");
            if (eqIndex > 0) {
                const key = pair.slice(0, eqIndex);
                const value = pair.slice(eqIndex + 1);
                result.set(key, value);
            }
        });
    }
    return result;
}
export function getSession(token) {
    if (token instanceof Map)
        token = token.get("token");
    if (token)
        return sql.orm.get("web_tokens", { token }).then(d => d !== null && d !== void 0 ? d : null);
    else
        return Promise.resolve(null);
}
export function requestBody(res, length) {
    return new Promise((resolve, rej) => {
        const acc = new sharedUtils.BufferAccumulator(length);
        res.onData((chunk, isLast) => {
            var _a;
            acc.add(Buffer.from(chunk));
            if (isLast)
                resolve((_a = acc.concat()) !== null && _a !== void 0 ? _a : Buffer.allocUnsafe(0));
        });
        attachResponseAbortListener(res, () => rej(new Error("ABORTED")));
    });
}
export class Validator {
    constructor() {
        this.state = {};
        this.operations = [];
        this.stage = 0;
    }
    do(code, expected, errorValue, assign) {
        this.operations.push({ expected, assign, errorValue, code });
        return this;
    }
    go() {
        var _a;
        (_a = this.promise) !== null && _a !== void 0 ? _a : (this.promise = new Promise((resolve, reject) => setImmediate(() => void this._next(resolve, reject))));
        return this.promise;
    }
    _next(resolve, reject) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.operations.length === 0)
                return resolve(this.state);
            this.stage++;
            const input = this.operations.shift();
            if (!input)
                return reject([500, "NO_INPUT"]);
            const processSuccess = (result) => __awaiter(this, void 0, void 0, function* () {
                if (input.expected && (typeof input.expected === "function" ? !input.expected(result) : input.expected !== result))
                    return processError();
                if (input.assign)
                    this.state[input.assign] = result;
                this.previousValue = result;
                yield this._next(resolve, reject);
            });
            const processError = () => {
                if (input.errorValue)
                    reject(input.errorValue);
                else
                    reject([500, `Unlabelled error in validator stage ${this.stage}`]);
            };
            try {
                const result = input.code(this.state, this.previousValue);
                if (result instanceof Promise)
                    yield result.then(processSuccess);
                else
                    yield processSuccess(result);
            }
            catch (_a) {
                processError();
            }
        });
    }
}
export class FormValidator extends Validator {
    trust({ origin, referrer, host, body, contentType }) {
        if (!body)
            throw new Error("Not all parameters were passed");
        this.do(() => { var _a; return (_a = origin !== null && origin !== void 0 ? origin : referrer) !== null && _a !== void 0 ? _a : ""; }, (v) => {
            if (v.startsWith(`${confprovider.config.website_protocol}://${confprovider.config.website_domain}`))
                return true;
            if (confprovider.config.website_domain.startsWith("localhost") && host && v.startsWith(`http://${host}`))
                return true;
            return false;
        }, [400, "Origin or referer must start with the current domain"]).do(() => contentType !== null && contentType !== void 0 ? contentType : "", "application/x-www-form-urlencoded", [400, "Content-Type must be application/x-www-form-urlencoded"]).do(() => body.toString("ascii"), void 0, [400, "Failed to convert body to a string"]).do((_, bod) => new URLSearchParams(bod), void 0, [400, "Failed to convert body to URLSearchParams"], "params");
        return this;
    }
    ensureParams(list, matchMode = "get") {
        if (!Array.isArray(list))
            list = [list];
        list.forEach(item => {
            this.do(state => !!state.params[matchMode](item), v => v, [400, `Missing ${item}`]);
        });
        return this;
    }
    useCSRF(loginToken) {
        this.do(state => checkCSRF(state.params.get("csrftoken"), loginToken, true), true, [400, "Invalid CSRF token"]);
        return this;
    }
}
export function onGatewayMessage(ws, message) {
    var _a;
    const parsed = JSON.parse(Buffer.from(message).toString());
    const wsData = ws.getUserData();
    parsed.cluster_id = wsData.clusterID;
    switch (parsed.t) {
        case "SHARD_LIST":
            wsData.worker.shards.forEach(s => {
                gatewayShardIndex.delete(s);
                wsData.worker.shards.delete(s);
            });
            parsed.d.forEach((sid) => {
                gatewayShardIndex.set(sid, wsData.worker.clusterID);
                wsData.worker.shards.add(sid);
            });
            break;
        case "VOICE_STATE_UPDATE":
            if (!parsed.d.guild_id)
                return;
            lavalink.voiceStateUpdate(parsed.d);
            (_a = queues.get(parsed.d.guild_id)) === null || _a === void 0 ? void 0 : _a.voiceStateUpdate(parsed.d);
            break;
        case "VOICE_SERVER_UPDATE":
            lavalink.voiceServerUpdate(parsed.d);
            break;
        case "INTERACTION_CREATE": {
            handleInteraction(parsed.d).catch(console.error);
            break;
        }
        case "USER_UPDATE":
            sharedUtils.updateUser(parsed.d);
            updateUserInAllQueues(parsed.d);
            break;
    }
}
export function handleInteraction(payload_1) {
    return __awaiter(this, arguments, void 0, function* (payload, returnJSON = false) {
        var _a, _b;
        let commandHandled = false;
        let rt = "{}";
        const user = (_b = (_a = payload.member) === null || _a === void 0 ? void 0 : _a.user) !== null && _b !== void 0 ? _b : payload.user;
        sharedUtils.updateUser(user);
        updateUserInAllQueues(user);
        switch (payload.type) {
            case 1:
                rt = "{\"type\":1}";
                commandHandled = true;
                break;
            case 2:
                rt = "{\"type\":5}";
                if (commands.handle(payload, returnJSON ? void 0 : () => snow.interaction.createInteractionResponse(payload.id, payload.token, { type: 5 })))
                    commandHandled = true;
                break;
            case 3:
                rt = "{\"type\":6}";
                if (!returnJSON)
                    yield snow.interaction.createInteractionResponse(payload.id, payload.token, { type: 6 });
                buttons.handle(payload);
                commandHandled = true;
                break;
            case 4: {
                const handler = autocomplete.handlers.get(payload.data.name);
                const choices = handler
                    ? yield handler(payload).catch(() => [])
                    : [];
                rt = JSON.stringify({ type: 8, data: { choices } });
                if (!returnJSON)
                    yield snow.interaction.createInteractionResponse(payload.id, payload.token, { type: 8, data: { choices } });
                commandHandled = true;
                break;
            }
            default:
                console.error(`Unknown payload type ${payload.type}\n`, payload);
                break;
        }
        if (!commandHandled) {
            if (!commandWorkers.length)
                throw new Error("NO_WORKERS");
            const worker = sharedUtils.arrayRandom(commandWorkers);
            worker.send({
                op: 0,
                t: "INTERACTION_CREATE",
                d: payload
            });
        }
        if (returnJSON)
            return rt;
    });
}
export function updateUserInAllQueues(user) {
    for (const q of queues.values()) {
        if (!q.listeners.has(user.id))
            continue;
        q.listeners.set(user.id, user);
        q.sendToSubscribedSessions("onListenersUpdate", q.toJSON().members);
    }
}
export function buttonHandlerParamsToInteraction(data, user) {
    return {
        id: "",
        application_id: confprovider.config.client_id,
        type: 3,
        token: "",
        version: 1,
        locale: Locale.EnglishUS,
        channel: {
            type: 0,
            id: ""
        },
        user,
        channel_id: "",
        data,
        app_permissions: "0",
        message: {
            id: "",
            channel_id: "",
            author: {
                id: confprovider.config.client_id,
                username: "amanda_internal_user",
                discriminator: "0",
                avatar: null,
                global_name: "Amanda Internal User"
            },
            content: "",
            timestamp: "",
            edited_timestamp: null,
            tts: false,
            mention_everyone: false,
            mentions: [],
            mention_roles: [],
            attachments: [],
            embeds: [],
            pinned: false,
            type: 0
        },
        entitlements: [],
        authorizing_integration_owners: {
            0: "",
            1: ""
        },
        attachment_size_limit: 1024 * 1024 * 1024 * 10
    };
}
