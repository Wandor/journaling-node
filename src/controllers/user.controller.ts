import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import argon2 from "argon2";

import { registerSchema, loginSchema } from "../validators/userValidator";
import prisma from "../../prisma";
import { v4 as uuidv4 } from "uuid";

const JWT_SECRET = process.env.JWT_SECRET || "";

export const registerUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {

    const parsedData = registerSchema.parse(req.body);

    const { name, email, password, role = "ADMIN" } = parsedData;

    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }
    const hashedPassword = await argon2.hash(password);

    await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        lastPasswordChangeDate: new Date(),
      },
    });

    return res.status(201).json({ message: "User registered" });
  } catch (error) {
    next(error)
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const parsedData = loginSchema.parse(req.body);
    const { email, password } = parsedData;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ message: "User does not exist" });

    // Compare password
    const isMatch = await argon2.verify(user.password, password);
    if (!isMatch)
      return res.status(401).json({ message: "Invalid credentials" });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginDate: new Date() },
    });

    // Generate JWT
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: "1h",
    });

    const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];

     // Generate refresh token
     const refreshToken = uuidv4();
     const expiresAt = new Date();
     const expiryDays = Number(process.env.REFRESH_TOKEN_EXPIRY_DAYS) || 7;
     expiresAt.setDate(expiresAt.getDate() + expiryDays);
 
     // Create or update session
   // Invalidate old active sessions for the user
   await prisma.session.updateMany({
    where: { userId: user.id, isActive: true },
    data: { isActive: false },
  });

  // Create new session
  await prisma.session.create({
    data: {
      userId: user.id,
      refreshToken,
      expiresAt,
      ipAddress: ipAddress as string,
      deviceId: userAgent,
      isActive: true,
    },
  });

    return res.status(200).json({ token, refreshToken });
  } catch (error) {
    next(error);
  }
};

// Reset Password
export const resetPassword = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ message: "User does not exists" });

    // Generate JWT
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: "1h",
    });

    return res.json({ token });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

// refreshToken
export const refreshToken = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ message: "User does not exists" });

    // Generate JWT
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: "1h",
    });

    return res.json({ token });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Sent One Time Password
export const sendOTP = async (req: Request, res: Response): Promise<any> => {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ message: "User does not exists" });

    // Generate JWT
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: "1h",
    });

    return res.json({ token });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Verify OTP
export const verifyOTP = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ message: "User does not exists" });

    // Generate JWT
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: "1h",
    });

    return res.json({ token });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};
