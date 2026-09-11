const mongoose = require("mongoose");

const verificationSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
    },
    verdict: {
      type: String,
      enum: ["verified", "partially_true", "false", "unverifiable"],
      required: true,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },
    explanation: {
      type: String,
      required: true,
    },
    sources: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Verification", verificationSchema);
