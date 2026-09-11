const express = require("express");
const { verifyText, getHistory } = require("../controllers/verifyController");

const router = express.Router();

// POST /api/verify/text  -> verify a piece of text
router.post("/text", verifyText);

// GET /api/verify/history -> last 50 saved verifications
router.get("/history", getHistory);

module.exports = router;
