const { server, confprovider, commandWorkers, sync } = passthrough;
const utils = sync.require("../utils");
const handlers = {};
buttons.setHandlers(btn => encoding.decode(btn.custom_id).cluster, handlers);
export class CommandWorker {
    constructor(ws, clusterID) {
        this.ws = ws;
        this.clusterID = clusterID;
        commandWorkers.push(this);
        console.log(`${this.clusterID} command worker connected. ${commandWorkers.length} total workers`);
    }
    send(data) {
        const result = this.ws.send(JSON.stringify(data));
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
        const index = commandWorkers.indexOf(this);
        if (index !== -1)
            commandWorkers.splice(index, 1);
        console.log(`${this.clusterID} command worker disconnected. ${commandWorkers.length} total workers`);
    }
}
server.ws("/internal", {
    maxPayloadLength: 1024 * 1024,
    upgrade(res, req, context) {
        const secWebSocketKey = req.getHeader("sec-websocket-key");
        const secWebSocketProtocol = req.getHeader("sec-websocket-protocol");
        const secWebSocketExtensions = req.getHeader("sec-websocket-extensions");
        const auth = req.getHeader("authorization");
        const clusterID = req.getHeader("x-cluster-id");
        if (auth !== confprovider.config.current_token || !clusterID) {
            res.writeStatus("401 Unauthorized");
            return void res.endWithoutBody();
        }
        res.writeStatus("101 Switching Protocols");
        res.upgrade({ worker: void 0, clusterID }, secWebSocketKey, secWebSocketProtocol, secWebSocketExtensions, context);
    },
    open(ws) {
        const data = ws.getUserData();
        const worker = new CommandWorker(ws, data.clusterID);
        handlers[data.clusterID] = (btn, user) => worker.send({ op: 0, t: "INTERACTION_CREATE", d: utils.buttonHandlerParamsToInteraction(btn, user) });
        data.worker = worker;
    },
    close(ws, code, message) {
        console.log(code, Buffer.from(message).toString("utf8"));
        const worker = ws.getUserData().worker;
        delete handlers[worker.clusterID];
        worker.onClose();
    }
});
console.log("Internal websocket API loaded");
