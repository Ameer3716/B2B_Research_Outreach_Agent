const express = require("express");
const { authenticate } = require("../middleware/auth");
const replyController = require("../controllers/reply.controller");

const router = express.Router();
router.use(authenticate);

router.get("/", replyController.list);
router.post("/webhook", replyController.webhook);

module.exports = router;
