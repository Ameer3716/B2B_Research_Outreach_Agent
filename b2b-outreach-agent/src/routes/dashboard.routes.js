const express = require("express");
const { authenticate } = require("../middleware/auth");
const dashboardController = require("../controllers/dashboard.controller");

const router = express.Router();
router.use(authenticate);

router.get("/stats", dashboardController.stats);

module.exports = router;
