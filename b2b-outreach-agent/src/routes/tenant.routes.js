const express = require("express");
const { authenticate } = require("../middleware/auth");
const { me, listMyTenantUsers } = require("../controllers/tenant.controller");

const router = express.Router();

router.get("/me", authenticate, me);
router.get("/tenant/users", authenticate, listMyTenantUsers);

module.exports = router;
