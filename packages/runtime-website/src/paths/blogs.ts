import fs = require("fs")
import path = require("path")

import marked = require("marked")

import passthrough = require("../passthrough");
const { server, sync, rootFolder } = passthrough

const utils: typeof import("../utils") = sync.require("../utils")

const fileNameRegex = /(.+?)\.\w+$/
const dashRegex = /-/g
const bodyRegex = /\$body/gm
const timestampRegex = /\$timestamp/gm
const titleRegex = /\$title/gm
const bodyShortRegex = /\$bodyshort/gm
const modifiedRegex = /\$modified/gm

server.get("/blogs", async (res) => {
	utils.attachResponseAbortListener(res)

	const [template, blogsDir] = await Promise.all([
		fs.promises.readFile(path.join(rootFolder, "./templates/blogs.html"), { encoding: "utf-8" }),
		fs.promises.readdir(path.join(rootFolder, "./blogs"))
	])

	if (!res.continue) return

	const stats = await Promise.all(
		blogsDir.map(blog => fs.promises.stat(path.join(rootFolder, `./blogs/${blog}`))
			.then(i => ({ name: blog, stats: i })))
	)

	if (!res.continue) return

	const htmlData = stats
		.sort((a, b) => b.stats.ctimeMs - a.stats.ctimeMs)
		.map(blog => {
			const name = fileNameRegex.exec(blog.name)?.[1] ?? "unknown regex failure"
			return "<h2 class=\"heading-box\">" +
				`Blog from ${blog.stats.ctime.getMonth() + 1}/${blog.stats.ctime.getDate()}/${blog.stats.ctime.getFullYear()}` +
			"</h2>" +
			"<div class=\"section\">" +
				`<a href="/blog/${name}">` +
					`${name.replace(dashRegex, " ").split(" ").map(s => `${s[0]?.toUpperCase()}${s.slice(1)}`).join(" ")}` +
				"</a>" +
			"</div>"
		}).join("\n")

	const template2 = template.replace(bodyRegex, htmlData)

	res
		.writeStatus("200")
		.writeHeader("Content-Type", "text/html")
		.writeHeader("Content-Length", String(Buffer.byteLength(template2)))
		.end(template2)
})

server.get("/blog/:blogID", async (res, req) => {
	utils.attachResponseAbortListener(res)

	const blogID = req.getParameter(0)
	const title = blogID.split("-").map(i => `${i[0]?.toUpperCase()}${i.slice(1)}`).join(" ")
	const toMD = path.join(rootFolder, `./blogs/${blogID}.md`)
	const stat = await fs.promises.stat(toMD)

	if (!stat) {
		if (!res.continue) return
		return utils.streamFile("404.html", res, undefined, undefined, false, 404)
	}

	if (!res.continue) return

	const [template, data] = await Promise.all([
		fs.promises.readFile(path.join(rootFolder, "./templates/blog.html"), { encoding: "utf-8" }),
		fs.promises.readFile(toMD, { encoding: "utf-8" })
	])

	if (!res.continue) return

	const rendered = marked.marked(data, { mangle: false, headerIds: false })

	const sliced = data.slice(0, 60)
	const short = data.length > 60 ? `${sliced}...` : sliced
	const html = template
		.replace(titleRegex, title)
		.replace(timestampRegex, stat.ctime.toISOString())
		.replace(modifiedRegex, stat.mtime.toISOString())
		.replace(bodyShortRegex, short)
		.replace(bodyRegex, rendered)

	res
		.writeStatus("200")
		.writeHeader("Content-Type", "text/html")
		.writeHeader("Content-Length", String(Buffer.byteLength(html)))
		.end(html)
})
