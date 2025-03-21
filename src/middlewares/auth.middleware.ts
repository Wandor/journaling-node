import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "";

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
  
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, JWT_SECRET);
  
      if (typeof decoded !== "object" || !("userId" in decoded)) {
        res.status(401).json({ message: "Invalid token" });
        return;
      }
  
      (req as any).user = decoded; // Attach user data to request
      next(); // ✅ Move to next middleware
    } catch (error) {
      res.status(401).json({ message: "Invalid token" });
    }
  };

export const authorize = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes((req as any).user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }
    next();
  };
};
