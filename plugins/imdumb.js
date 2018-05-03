function embed() {
  var emb = new Discord.RichEmbed().setDescription("This works");
  return msg.channel.send({emb});
}

module.exports = function(passthrough) {
  const {Discord, djs, dio} = passthrough;
  return {
    "test": {
      description: "Im the dumb one",
      process: function(msg, suffix) {
        embed();
      }
    }
  }
}