var exports = module.exports = {};

/**
 * Converts seconds or miliseconds to a time string
 * @param {Int} input Any number
 * @param {String} format What format the input is; sec or ms
 * @returns {String} A humanized string of time
 */
exports.humanize = function(input, format) {
  if (!input) return "RangeError: Not enough input";
  if (!format) return "RangeError: No format was provided to describe the input";
  if (format.toLowerCase() == "ms") var msec = parseInt(Math.floor(input * 1000));
  else if (format.toLowerCase() == "sec") var msec = parseInt(Math.floor(input * 1000));
  else return "TypeError: Invalid format provided";
  if (isNaN(msec)) return "TypeError: Input provided is NaN";
  var days = Math.floor(msec / 1000 / 60 / 60 / 24);
  msec -= days * 1000 * 60 * 60 * 24;
  var hours = Math.floor(msec / 1000 / 60 / 60);
  msec -= hours * 1000 * 60 * 60;
  var mins = Math.floor(msec / 1000 / 60);
  msec -= mins * 1000 * 60;
  var secs = Math.floor(msec / 1000);
  var timestr = "";
  if (days > 0) timestr += days + " days ";
  if (hours > 0) timestr += hours + " hours ";
  if (mins > 0) timestr += mins + " minutes ";
  if (secs > 0) timestr += secs + " seconds";
  return timestr;
}

/**
 * Finds a member in a guild
 * @param {*} msg MessageResolvable
 * @param {String} usertxt Text that contains user's display data to search them by
 * @param {Boolean} self If the function should return <MessageResolvable>.member if no usertxt is provided
 * @returns {*} A member object or null if it couldn't find a member
 */
exports.findMember = function(msg, usertxt, self = false) {
  if (!usertxt) {
    if (self) return msg.member;
    else return null;
  } else {
    let member = msg.guild.members.find(m => m.user.tag.toLowerCase().includes(usertxt.toLowerCase())) || msg.mentions.members.first() || msg.guild.members.get(usertxt) || msg.guild.members.find(m => m.displayName.toLowerCase().includes(usertxt.toLowerCase()) || m.user.username.toLowerCase().includes(usertxt.toLowerCase()));
    return member;
  }
}

/**
 * Finds a user in cache
 * @param {*} msg MessageResolvable
 * @param {*} client Discord client
 * @param {String} usertxt Text that contains user's display data to search them by
 * @param {Boolean} self If the function should return <MessageResolvable>.author if no usertxt is provided
 * @returns {*} A user object or null if it couldn't find a user
 */
exports.findUser = function(msg, client, usertxt, self = false) {
  if (!usertxt) {
    if (self) return msg.author;
    else return null;
  } else {
    let user = client.users.find(u => u.username.toLowerCase() == usertxt.toLowerCase() || u.tag.toLowerCase().includes(usertxt.toLowerCase())) || msg.mentions.users.first() || client.users.get(usertxt) || client.users.find(u => u.username.toLowerCase().includes(usertxt.toLowerCase()));
    return user;
  }
}