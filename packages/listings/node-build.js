const fs = require("fs")
const path = require("path")
const sass = require("node-sass")

const outputDir = "build"
const commonDir = "common"

const mdDir = `${commonDir}/template.md`

const localDirs = fs.readdirSync(__dirname)
const dirs = localDirs.filter(d => d !== outputDir && d !== commonDir && d !== "node_modules" && d !== ".turbo" && fs.statSync(d).isDirectory())

const md = fs.readFileSync(path.join(__dirname, mdDir), { encoding: "utf-8" })

for (const dir of dirs) {
	console.log(`Building ${dir}...`)
	const meta = fs.readFileSync(path.join(dir, "meta.fish"), { encoding: "utf-8" })
	const template = fs.readFileSync(path.join(dir, "output.template"), { encoding: "utf-8" })
	const style = sass.renderSync({ file: path.join(dir, "style.sass") })

	const metaVars = meta.split("\n").map(line => line.match(/set meta_(\w+) ([\w\-/:.?&=]+)/)?.slice(1))

	const fileName = metaVars.find(v => v?.[0] === "name")
	if (!fileName) {
		console.error(`No meta_name meta var in meta.fish for ${dir}`)
		continue
	}

	let finalFile = template
	for (const variable of metaVars) {
		if (!variable || variable[0] === "name") continue
		finalFile = finalFile.replace(new RegExp(`@${variable[0]}`, "g"), variable[1])
	}

	finalFile = finalFile.replace("@markdown", md)
	finalFile = finalFile.replace("@sass", style.css.toString("utf-8"))
	if (!fs.existsSync(path.join(__dirname, outputDir))) fs.mkdirSync(path.join(__dirname, outputDir))
	fs.writeFileSync(path.join(__dirname, outputDir, `${fileName[1]}.md`), finalFile, { encoding: "utf8", flag: "w" })
	console.log("Done building listings")
}
