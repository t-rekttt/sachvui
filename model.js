const Mongoose = require("mongoose"),
  Types = Mongoose.Schema.Types;

const schema = new Mongoose.Schema({
  href: { type: String, unique: true }
},
  {strict:false }
);

module.exports = Mongoose.model('Book', schema);