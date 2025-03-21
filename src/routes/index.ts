import express from "express";
import { registerUser, login, sendOTP } from "../controllers/user.controller";
import { createEntry, getEntries } from "../controllers/journal.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { securityHeaders, limiter } from "../middlewares/security.middleware";

const router = express.Router();

router.use(securityHeaders);
router.use(limiter);

router.post("/auth/register", registerUser);
router.post("/auth/login", login);
router.post("/auth/verifyOtp", sendOTP);
router.post("/auth/resetPassword", login);
router.post("/entries", authenticate, createEntry);
router.get("/entries", authenticate, getEntries);

export default router;
