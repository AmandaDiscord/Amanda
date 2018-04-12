const pluginsDir = "plugins";
const fs = require("fs");
const pj = require("path").join;

let watched = [];

module.exports = (passthrough, callback) => {
    function loadFile(filename) {
        if (!watched.includes(filename)) { // If file isn't already being watched,
            watched.push(filename);
            fs.watchFile(filename, {interval: 2018}, () => { // watch it.
                loadFile(filename);
            });
            console.log("Watching "+filename);
        }
        try {
            console.log("Loading "+filename);
            delete require.cache[require.resolve(filename)]; // Otherwise it loads from the cache and ignores file changes
            callback(require(filename)(passthrough));
        } catch (e) {
            console.log("Failed to reload module "+filename+"\n"+e.stack);
            //throw e;
        }
    }

    fs.readdir(pluginsDir, (err, files) => {
        files.filter(f => f.endsWith(".js")).forEach(f => {
            let filename = "./"+pj(pluginsDir, f);
            loadFile(filename);
        });
    });
}