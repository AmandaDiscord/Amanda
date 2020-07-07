const tap = require("tap")
const passthrough = require("../fakebot")

const { replace } = require("./langutils")

tap.test("replace", async childTest => {
	childTest.equal(replace("hello world", { username: "Cadence" }), "hello world", "no action")

	childTest.equal(replace("%username", { username: "Cadence" }), "Cadence", "simple replace")

	childTest.equal(replace("Hello %username.", { username: "Cadence" }), "Hello Cadence.", "replace in middle")

	childTest.equal(replace("%username %username", { username: "Cadence" }), "Cadence Cadence", "multiple replace")
})

tap.teardown(() => {
	passthrough.client.destroy()
})
