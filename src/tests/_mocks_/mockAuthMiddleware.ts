import { UserRole } from "@prisma/client";
import { NextFunction, Response, Request } from "express";
import { mockUser } from "../util";

jest.mock("../../middlewares/auth.middleware.ts", () => ({
  authenticate: (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];

    if (token === "invalid-token") {
      return res.status(403).json({ message: "Invalid token" });
    }

    (req as any).user = mockUser;
    next();
  },

  authorize: (roles: string[]) => (req: Request, res: Response, next: NextFunction) => {
    if (roles.includes((req as any).user.role)) {
      next();
    } else {
      res.status(403).json({ message: "Access denied" });
    }
  },
}));
