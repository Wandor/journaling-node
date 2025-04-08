import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import argon2 from "argon2";
import { loginSchema, updatePasswordSchema } from "../validators/authValidator";
import prisma from "../../prisma";
import { v4 as uuidv4 } from "uuid";
import { addMinutes, isFutureDate } from "../services/functions";
import redisUtil from "../services/redisUtil";

const otpGenerator = require("otp-generator");

const JWT_SECRET = process.env.JWT_SECRET || "";
const currentDate = new Date();
const passwordExpiry = Number(process.env.PASSWORD_EXPIRY_DAYS) || 7;

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const parsedData = loginSchema.parse(req.body);
    const { emailAddress, password } = parsedData;
    let otp = "",
      otpVerified = true;

    const user = await prisma.user.findUnique({
      where: { emailAddress },
      select: {
        id: true,
        status: true,
        isLockedOut: true,
        accessFailedCount: true,
        role: true,
        otpResendCount: true,
        otpSent: true,
        lastOTPResendDate: true,
      },
    });

    if (!user) return res.status(404).json({ message: "User does not exist" });

    const {
      id,
      status,
      isLockedOut,
      accessFailedCount,
      role,
      otpResendCount,
      lastOTPResendDate,
    } = user;

    if (!status || isLockedOut)
      return res
        .status(401)
        .json({ message: "Account locked! Contact our help desk" });

    const userPassword = await prisma.password.findFirst({
      where: { userId: user.id, isActive: true },
      select: {
        password: true,
        passwordExpiry: true,
        isActive: true,
        id: true,
      },
    });

    if (!userPassword)
      return res.status(401).json({ message: "Unauthorized!" });

    const { password: userPass, id: passId, passwordExpiry } = userPassword;

    if (!isFutureDate(passwordExpiry)) {
      await prisma.password.update({
        where: { id: passId },
        data: {
          isActive: false,
        },
      });
      return res.status(401).json({ message: "Password expired!" });
    }

    const isMatch = await argon2.verify(userPass, password);
    if (!isMatch) {
      await prisma.user.update({
        where: { id },
        data: {
          accessFailedCount: { increment: 1 },
          isLockedOut:
            accessFailedCount + 1 ===
            Number(process.env.ACCOUNT_LOCK_MAX_COUNT),
        },
      });

      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: id, role }, JWT_SECRET, {
      expiresIn: "1h",
    });

    const ipAddress =
      req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    const refreshToken = uuidv4();
    const expiresAt = new Date();
    const expiryDays = Number(process.env.REFRESH_TOKEN_EXPIRY_DAYS) || 7;
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    const userPreferences = await prisma.userPreferences.findUnique({
      where: { userId: id },
      select: {
        twoFactorEnabled: true,
      },
    });

    const twoFactorEnabled = userPreferences?.twoFactorEnabled ?? false;

    if (twoFactorEnabled) {
      /* for now send the OTP as a response */
      const lastResendTimestamp = lastOTPResendDate
        ? new Date(lastOTPResendDate).getTime()
        : 0;

      const hoursPassedAfterLastOTP =
        Math.abs(
          new Date(lastResendTimestamp).getTime() - new Date().getTime()
        ) / 36e5;

      if (
        otpResendCount >= Number(process.env.OTP_RESEND_MAX_COUNT) &&
        hoursPassedAfterLastOTP < Number(process.env.OTP_SEND_MAX_HOURS)
      ) {
        return res.status(429).send({
          message: "Too Many OTP requests, try again later!",
        });
      }

      otp = await otpGenerator.generate(6, {
        lowerCaseAlphabets: false,
        upperCaseAlphabets: false,
        specialChars: false,
      });
      otpVerified = false;
    }

    await prisma.user.update({
      where: { id },
      data: twoFactorEnabled
        ? {
            otpResendCount: { increment: 1 },
            otpSent: true,
            lastOTPResendDate: currentDate,
          }
        : { lastLoginDate: currentDate },
    });

    const hashedOtp = await argon2.hash(otp);

    const sessionObj = {
      otpValue: twoFactorEnabled ? hashedOtp : null,
      otpVerified,
      otpExpiry: addMinutes(
        currentDate,
        Number(process.env.OTP_EXPIRY_MINUTES)
      ),
      refreshToken,
      refreshTokenExpiry: addMinutes(
        currentDate,
        Number(process.env.JWT_REFRESH_EXPIRATION)
      ),
      userId: id,
      sessionStart: currentDate.toString(),
      sessionEnd: null,
      sessionAddress: ipAddress,
      sessionStatus: false,
    };
    await redisUtil.set({
      dbOperation: false,
      operationName: "create",
      actionOnError: "log",
      key: "session",
      value: sessionObj,
      expiry: 86400,
      dataActions: {
        setAsArray: false,
        actionIfExists: "replace",
        uniqueKey: "userId",
      },
    });
    if (twoFactorEnabled) {
      return res
        .status(200)
        .json({ message: `Your One Time Password is: ${otp}` });
    }

    return res.status(200).json({ token, refreshToken });
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { userId, refreshToken } = req.body;

    const activeSession = await redisUtil.get(`session-${userId}`);
    if (!activeSession)
      return res.status(404).json({ message: "No active session" });

    const {
      refreshTokenExpiry,
      refreshToken: token,
      sessionStatus,
    } = activeSession;

    if (
      currentDate.getTime() >= new Date(refreshTokenExpiry).getTime() ||
      !sessionStatus
    )
      return res.status(401).json({ message: "Session expired!" });

    if (refreshToken !== token)
      return res.status(401).json({ message: "Invalid session" });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
      },
    });

    if (!user) return res.status(401).json({ message: "User does not exist!" });

    const { role } = user;

    const accessToken = jwt.sign({ userId, role }, JWT_SECRET, {
      expiresIn: "1h",
    });

    await redisUtil.set({
      dbOperation: false,
      operationName: "Update",
      actionOnError: "log",
      key: "session",
      value: activeSession,
      expiry: 86400,
      dataActions: {
        setAsArray: false,
        actionIfExists: "replace",
        uniqueKey: "userId",
      },
    });

    return res.status(201).json({
      message: "Token generated successfully!",
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
};

export const verifyOTP = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { userId, otpValue: otp } = req.body;

    const activeSession = await redisUtil.get(`session-${userId}`);
    if (!activeSession)
      return res.status(401).json({ message: "No active session" });

    const { otpExpiry, otpValue, otpVerified } = activeSession;

    if (otpVerified)
      return res
        .status(409)
        .json({ message: "OTP already used, request for another one" });

    if (
      new Date(currentDate.toString()).getTime() > new Date(otpExpiry).getTime()
    )
      return res.status(409).json({ message: "OTP expired!" });

    const isMatch = await argon2.verify(otpValue, otp);

    if (!isMatch) return res.status(400).json({ message: "Invalid OTP" });

    activeSession.otpVerified = true;
    activeSession.otpExpiry = addMinutes(
      new Date(),
      Number(process.env.OTP_EXPIRY_MINUTES)
    );

    await redisUtil.set({
      dbOperation: false,
      operationName: "Update",
      actionOnError: "log",
      key: "session",
      expiry: 86400,
      value: activeSession,
      dataActions: {
        setAsArray: false,
        actionIfExists: "replace",
        uniqueKey: "userId",
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: {
        otpResendCount: { increment: 1 },
        otpSent: true,
        lastOTPResendDate: currentDate,
      },
    });

    return res.status(200).send({
      success: true,
      message: "OTP Verified!",
      status: "OK",
    });
  } catch (error) {
    next(error);
  }
};

export const sendOTP = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { userId } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        lastOTPResendDate: true,
        otpResendCount: true,
      },
    });
    if (!user) return res.status(404).json({ message: "User does not exists" });

    const { role, lastOTPResendDate, otpResendCount } = user;

    const hoursSinceLastResend =
      Math.abs(
        new Date(lastOTPResendDate || 0).getTime() - new Date().getTime()
      ) / 36e5;

    if (
      otpResendCount > Number(process.env.OTP_RESEND_MAX_COUNT) &&
      hoursSinceLastResend < Number(process.env.OTP_SEND_MAX_HOURS)
    )
      return res.status(429).send({
        error: true,
        message:
          "Surpassed Maximum Number of OTP Resends! Contact Administrator!",
      });

    const currentSession = await redisUtil.get(`session-${userId}`);

    if (!currentSession)
      return res
        .status(404)
        .send({ error: true, message: "Session not found! Log in again" });

    const otp = await otpGenerator.generate(6, {
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false,
    });

    currentSession.otpVerified = false;
    currentSession.otpValue = await argon2.hash(otp);
    currentSession.otpExpiry = addMinutes(currentDate, 5);

    await redisUtil.set({
      dbOperation: false,
      operationName: "Update",
      actionOnError: "log",
      key: "session",
      value: currentSession,
      dataActions: {
        setAsArray: false,
        actionIfExists: "replace",
        uniqueKey: "userId",
      },
    });
    await prisma.user.update({
      where: { id: userId },
      data: {
        otpResendCount: { increment: 1 },
        otpSent: true,
        lastOTPResendDate: currentDate,
      },
    });

    return res
      .status(200)
      .json({ message: `Your One Time Password is: ${otp}` });
  } catch (error) {
    next();
  }
};

export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const parsedData = updatePasswordSchema.parse(req.body);
    const { emailAddress, password } = parsedData;

    const user = await prisma.user.findUnique({ where: { emailAddress } });
    if (!user) return res.status(404).json({ message: "User does not exists" });

    const { id } = user;
    const hashedPassword = await argon2.hash(password);

    /* For now user changing their password will make their account active */

    await prisma.user.update({
      where: { id },
      data: {
        status: true,
        isLockedOut: false,
        lastPasswordChangedDate: currentDate,
      },
    });

    const passExpiry = currentDate.setDate(
      currentDate.getDate() + passwordExpiry
    );

    await prisma.$transaction([
      prisma.password.updateMany({
        where: { userId: user.id, isActive: true },
        data: { isActive: false },
      }),

      prisma.password.create({
        data: {
          userId: user.id,
          password: hashedPassword,
          passwordExpiry: new Date(passExpiry),
          isActive: true,
        },
      }),
    ]);

    return res.status(201).json({ message: "Password has been changed" });
  } catch (error) {
    next(error);
  }
};

export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { userId } = req.body;

    if (!userId)
      res.status(400).json({
        message: "userId is required",
      });

    await redisUtil.del(`session-${userId}`);

    return res.status(200).json({ message: `logout successful` });
  } catch (error) {
    next(error);
  }
};
