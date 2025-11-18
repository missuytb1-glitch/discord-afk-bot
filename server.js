
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot Discord AFK 24/7 jalan 😴");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Web server hidup di port ${PORT}`);
});
