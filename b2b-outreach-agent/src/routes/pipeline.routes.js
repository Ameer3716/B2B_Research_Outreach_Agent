const express = require("express");
const { authenticate } = require("../middleware/auth");
const pipelineController = require("../controllers/pipeline.controller");

const router = express.Router();

router.use(authenticate);

router.post("/run", pipelineController.run);
router.post("/approve", pipelineController.approve);
router.post("/send", pipelineController.send);

module.exports = router;
