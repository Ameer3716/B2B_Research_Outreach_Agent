const express = require("express");
const { authenticate } = require("../middleware/auth");
const messageController = require("../controllers/message.controller");

const router = express.Router();
router.use(authenticate);

router.get("/", messageController.list);
router.get("/:id", messageController.getOne);

module.exports = router;
