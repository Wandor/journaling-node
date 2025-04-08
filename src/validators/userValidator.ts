import { z } from "zod";

export const registerSchema = z.object({
  userName: z
    .string()
    .min(2, "User name must be at least 2 characters")
    .trim()
    .optional()
    .default(""),
  firstName: z.string().min(1, "First name is required").trim(),
  lastName: z.string().min(1, "Last name is required").trim(),
  emailAddress: z.string().email("Invalid email format").trim().toLowerCase(),
  mobileNumber: z
    .string()
    .min(10, "Mobile number must be at least 10 digits")
    .max(15, "Mobile number must not exceed 15 digits")
    .regex(/^\+?[1-9]\d{9,14}$/, "Invalid mobile number format"),
  role: z.enum(["USER", "ADMIN"], { message: "Invalid role" }),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(
      /[^A-Za-z0-9]/,
      "Password must contain at least one special character"
    ),
});

export const userPreferencesSchema = z.object({
  enableNotifications: z.boolean().default(true),
  autoTag: z.boolean().default(true),
  autoCategorize: z.boolean().default(true),
  summarize: z.boolean().default(true),
  reminderTime: z.string().optional(),
  language: z.string().default("en"),
  timeZone: z.string().default("UTC"),
  twoFactorEnabled: z.boolean().default(false),
});



