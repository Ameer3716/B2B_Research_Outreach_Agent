const express = require("express");
const { authenticate } = require("../middleware/auth");
const agentLogController = require("../controllers/agentLog.controller");

const router = express.Router();
router.use(authenticate);

router.get("/", agentLogController.list);

module.exports = router;
