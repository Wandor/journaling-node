import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").trim(),
  email: z.string().email("Invalid email format").trim().toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["USER", "ADMIN"], { message: "Invalid role" }),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email format").trim().toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const updatePasswordSchema = z.object({
  email: z.string().email("Invalid email format").trim().toLowerCase(),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});
