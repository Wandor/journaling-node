import { Request, Response, NextFunction } from "express";
import argon2 from "argon2";
import { registerSchema, userPreferencesSchema } from "../validators/userValidator";
import prisma from "../../prisma";
import { UserRole } from "@prisma/client";

const currentDate = new Date();
const passwordExpiry = Number(process.env.PASSWORD_EXPIRY_DAYS) || 7;

export const registerUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const parsedData = registerSchema.parse(req.body);
    const {
      userName = "",
      firstName,
      lastName,
      emailAddress,
      mobileNumber,
      password,
      role = UserRole.USER,

    } = parsedData;

    const existingUser = await prisma.user.findUnique({
      where: { emailAddress: emailAddress },
    });

    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }
    const hashedPassword = await argon2.hash(password);

    const user = await prisma.user.create({
      data: {
        userName,
        firstName,
        lastName,
        emailAddress,
        mobileNumber,
        role,
        lastPasswordChangedDate: currentDate,
      },
    });

    if (user) {
      const passExpiry = currentDate.setDate(
        currentDate.getDate() + passwordExpiry
      );
      await prisma.password.create({
        data: {
          userId: user.id,
          password: hashedPassword,
          passwordExpiry: new Date(passExpiry),
          isActive: true,
        },
      });
    }

    /* TO DO: Implement code to send an email to create a password*/

    return res.status(201).json({ message: "User registered" });
  } catch (error) {
    next(error);
  }
};


export const userPreferences = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {


    const parsedData = userPreferencesSchema.parse(req.body);

    const {
      enableNotifications,
      autoTag,
      autoCategorize,
      summarize,
      reminderTime,
      language,
      timeZone,
      twoFactorEnabled
    } = parsedData;

    const { userId } = (req as any).user;

    const preferences = await prisma.userPreferences.upsert({
      where: { userId },
      update: {
        enableNotifications,
        autoTag,
        autoCategorize,
        summarize,
        reminderTime: reminderTime ? new Date(reminderTime) : null,
        language,
        timeZone,
        twoFactorEnabled
      },
      create: {
        userId,
        enableNotifications,
        autoTag,
        autoCategorize,
        summarize,
        reminderTime: reminderTime ? new Date(reminderTime) : null,
        language,
        timeZone,
      },
    });

    return res.status(200).json({
      message: 'Preferences successfully updated!',
      preferences,
    });
  } catch (error) {
    next(error);
  }
};

