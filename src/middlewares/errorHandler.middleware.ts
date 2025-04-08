import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import logger from "../configs/logger";

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): any => {
  logger.error(err);
  if (err instanceof ZodError) {
    const formattedErrors = err.errors.reduce((acc, curr) => {
      acc[curr.path.join(".")] = curr.message;
      return acc;
    }, {} as Record<string, string>);

    return res.status(400).json({ message: "Validation error", errors: formattedErrors });
  }

  return res.status(err.status || 500).json({
    message: err.message || "Internal server error",
  });
};
