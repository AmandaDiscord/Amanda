const path = require("path")
const fs = require("fs")

const replaceRegex = /export { (\w+) as default }+/

const toDTS = path.join(process.cwd(), "./dist/index.d.ts")

const dts = fs.readFileSync(toDTS, { encoding: "utf8" })
fs.writeFileSync(toDTS, dts.replace(replaceRegex, "export = $1"))

console.log("Done fixing tsup's jank")
