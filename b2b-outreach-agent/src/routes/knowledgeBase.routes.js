const express = require("express");
const { authenticate } = require("../middleware/auth");
const kbController = require("../controllers/knowledgeBase.controller");

const router = express.Router();
router.use(authenticate);

router.get("/", kbController.list);
router.get("/:id", kbController.getOne);
router.post("/", kbController.create);
router.delete("/:id", kbController.remove);

module.exports = router;
