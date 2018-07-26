function q(thing) {
	return document.querySelector(thing);
}
function request(url, callback, body, method) {
	if (!callback) callback = new Function();
	if (!method) method = (body ? "POST" : "GET");
	let requester = new XMLHttpRequest();
	requester.addEventListener("load", () => {
		console.log(requester);
		callback(requester);
	});
	requester.open(method, url);
	if (body) {
		if (typeof(body) == "object" && ["Array", "Object"].includes(body.constructor.name)) body = JSON.stringify(body);
		requester.send(body);
	} else {
		requester.send();
	}
	console.log(method, url, body);
}

const token = window.localStorage.getItem("token");
let shouldRedirect = 0;
if (window.location.pathname == "/login") {
	if (token) {
		request("/api/userid", result => {
			if (result.status == 200) window.location.replace("/");
		}, {token});
	}
} else {
	if (!token) window.location.replace("/login");
	else request("/api/userid", result => {
		if (result.status != 200) window.location.replace("/login");
	}, {token});
}

const protocol = window.location.protocol == "http:" ? "ws" : "wss";
const ws = new WebSocket(protocol+"://"+window.location.hostname+":"+window.location.port, ["soap"]);
function wssend(data) {
	let message = JSON.stringify(data);
	console.log("Sending WS data: "+message);
	ws.send(message);
}

function getGuild() {
	let match = window.location.href.match(new RegExp("servers/([0-9]+)"));
	if (match) return match[1];
	else return null;
}

function getSharedServers(callback) {
	request(`/api/sharedservers`, callback, {token});
}

function login(newToken) {
	request(`/api/userid`, result => {
		if (result.status == 200) {
			window.localStorage.setItem("token", newToken);
			window.location.assign("/");
		}
	}, {token: newToken});
}

function logout() {
	window.localStorage.removeItem("token");
}

function simpleAPI(path, callback) {
	if (!callback) callback = new Function();
	request(`/api/music/${getGuild()}/${path}`, callback, {token});
}

function playPause(playing) {
	if (playing) simpleAPI("pause");
	else simpleAPI("resume");
}