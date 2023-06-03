import passthrough = require("../passthrough");
const { server, sync } = passthrough

const utils: typeof import("../utils") = sync.require("../utils")

// non specified paths (fs)
server.get("/*", (res, req) => utils.streamFile(req.getUrl(), res, req.getHeader("accept"), req.getHeader("if-modified-since")))

server.get("/", (res, req) => utils.streamFile("index.html", res, req.getHeader("accept"), req.getHeader("if-modified-since")))
