const express = require("express");
const { authenticate } = require("../middleware/auth");
const leadController = require("../controllers/lead.controller");

const router = express.Router();

router.use(authenticate);

router.get("/", leadController.list);
router.get("/:id", leadController.getOne);
router.post("/", leadController.create);
router.put("/:id", leadController.update);
router.delete("/:id", leadController.remove);
router.patch("/:id/status", leadController.updateStatus);

module.exports = router;
