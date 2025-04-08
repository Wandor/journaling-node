import { UserRole } from "@prisma/client";

export const mockUser = {
  userId: "test-user-id",
  role: UserRole.ADMIN,   
};

export const mockValidToken = "valid-token";
export const mockInvalidToken = "invalid-token";
