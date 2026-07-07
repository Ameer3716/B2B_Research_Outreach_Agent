const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.json({ status: "ok", service: "b2b-outreach-agent-backend", milestone: 1 });
});

module.exports = router;
