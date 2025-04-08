import express from "express";
import {
  login,
  sendOTP,
  refreshToken,
  verifyOTP,
  logout,
  resetPassword,
} from "../controllers/auth.controller";
import { registerUser, userPreferences } from "../controllers/user.controller";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { securityHeaders, limiter } from "../middlewares/security.middleware";
import {
  createEntry,
  createJournalCategory,
  createJournalTag,
  deleteEntry,
  deleteJournalCategory,
  deleteJournalTag,
  getCategories,
  getJournalEntries,
  getJournalEntry,
  getTags,
  updateEntry,
  updateJournalCategory,
  updateJournalTag,
} from "../controllers/journal.controller";
import { UserRole } from "@prisma/client";
import {
  getJournalSummary,
  getSentimentExtremes,
} from "../controllers/summary.controller";

const router = express.Router();

router.use(securityHeaders);
router.use(limiter);

router.post("/user/register", registerUser);
router.post(
  "/user/preferences",
  authenticate,
  authorize([UserRole.ADMIN, UserRole.USER]),
  userPreferences
);

router.post("/auth/login", login);
router.post("/auth/refreshToken", refreshToken);
router.post("/auth/verifyOtp", verifyOTP);
router.post("/auth/resendOtp", sendOTP);
router.post("/auth/logout", logout);
router.post("/auth/resetPassword", resetPassword);

router.get(
  "/journal/list-categories",
  authenticate,
  authorize([UserRole.ADMIN]),
  getCategories
);
router.post(
  "/journal/create-tag",
  authenticate,
  authorize([UserRole.ADMIN]),
  createJournalTag
);
router.put(
  "/journal/update-tag/:tagId",
  authenticate,
  authorize([UserRole.ADMIN]),
  updateJournalTag
);
router.delete(
  "/journal/delete-tag/:tagId",
  authenticate,
  authorize([UserRole.ADMIN]),
  deleteJournalTag
);
router.get(
  "/journal/list-tags",
  authenticate,
  authorize([UserRole.ADMIN]),
  getTags
);
router.post(
  "/journal/create-category",
  authenticate,
  authorize([UserRole.ADMIN]),
  createJournalCategory
);
router.put(
  "/journal/update-category/:categoryId",
  authenticate,
  authorize([UserRole.ADMIN]),
  updateJournalCategory
);
router.delete(
  "/journal/delete-category/:categoryId",
  authenticate,
  authorize([UserRole.ADMIN]),
  deleteJournalCategory
);
router.post(
  "/journal/create-entry",
  authenticate,
  authorize([UserRole.ADMIN, UserRole.USER]),
  createEntry
);
router.put(
  "/journal/update-entry/:journalId",
  authenticate,
  authorize([UserRole.ADMIN, UserRole.USER]),
  updateEntry
);
router.delete(
  "/journal/delete-entry/:journalId",
  authenticate,
  authorize([UserRole.ADMIN, UserRole.USER]),
  deleteEntry
);
router.get(
  "/journal/list-entries",
  authenticate,
  authorize([UserRole.ADMIN]),
  getJournalEntries
);
router.get(
  "/journal/view-entry/:journalId",
  authenticate,
  authorize([UserRole.ADMIN]),
  getJournalEntry
);

router.get(
  "/journal/summary",
  authenticate,
  authorize([UserRole.ADMIN]),
  getJournalSummary
);
router.get(
  "/journal/sentiment-extremes",
  authenticate,
  authorize([UserRole.ADMIN]),
  getSentimentExtremes
);

export default router;
