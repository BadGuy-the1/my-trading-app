// index.js
const express = require("express");
const dotenv = require("dotenv");
const { startBot } = require("./botLogic.js");

dotenv.config();

const app = express();

// Simple home route
app.get("/", (req, res) => {
  res.send("🚀 Trading bot + API are running!");
});

// Optional: API endpoint for bot status
app.get("/status", (req, res) => {
  res.json({
    status: "running",
    time: new Date().toISOString()
  });
});

// Start your trading bot logic
startBot();

// Render needs to detect a port
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});

