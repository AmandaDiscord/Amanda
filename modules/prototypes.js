Object.defineProperties(Array.prototype, {
	random: {
		value: function() {
			return this[Math.floor(Math.random()*this.length)];
		},
		configurable: true
	},
	shuffle: {
		value: function() {
			let old = [...this];
			let output = [];
			while (old.length) {
				let random = old.splice(Math.floor(Math.random()*old.length), 1)[0];
				output.push(random);
			}
			return output;
		},
		configurable: true
	}
});

Object.defineProperties(Number.prototype, {
	humanize: {
		value: function(format) {
			let msec;
			if (!format) throw new RangeError("No Input was provided");
			if (format.toLowerCase() == "ms") msec = Math.floor(this);
			else if (format.toLowerCase() == "sec") msec = Math.floor(this * 1000);
			else throw new TypeError("Invalid format provided");
			if (isNaN(msec)) throw new TypeError("Input provided is NaN");
			let days = Math.floor(msec / 1000 / 60 / 60 / 24);
			msec -= days * 1000 * 60 * 60 * 24;
			let hours = Math.floor(msec / 1000 / 60 / 60);
			msec -= hours * 1000 * 60 * 60;
			let mins = Math.floor(msec / 1000 / 60);
			msec -= mins * 1000 * 60;
			let secs = Math.floor(msec / 1000);
			let timestr = "";
			if (days > 0) timestr += days + "d ";
			if (hours > 0) timestr += hours + "h ";
			if (mins > 0) timestr += mins + "m ";
			if (secs > 0) timestr += secs + "s";
			return timestr;
		},
		configurable: true
	}
});