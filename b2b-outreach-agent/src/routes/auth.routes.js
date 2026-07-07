const express = require("express");
const { registerTenant, registerUser, login } = require("../controllers/auth.controller");

const router = express.Router();

router.post("/register-tenant", registerTenant);
router.post("/register-user", registerUser);
router.post("/login", login);

module.exports = router;
