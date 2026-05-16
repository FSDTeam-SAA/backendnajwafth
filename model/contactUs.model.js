const { Schema, model } = require("mongoose");

const contractModel = new Schema({
  email: {
    type: String,
    required: [true, "Email is required"],
  },
  subject: {
    type: String,
    required: [true, "Subject is required"],
  },
  message: {
    type: String,
    required: [true, "Message is required"],
  },
});

const Contract = model("Contract", contractModel);
module.exports = Contract;
