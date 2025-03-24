import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import * as argon2 from "argon2";
import { UserRole } from "@prisma/client";
import { prismaMock } from "../../prisma/singleton";
import app from "../app";

jest.mock("argon2");

const mockUser = {
  id: "user-123",
  email: "test@example.com",
  password: "hashed-password",
  role: "user",
  lastLoginDate: new Date(),
};

const mockSession = {
  userId: "user-123",
  refreshToken: uuidv4(),
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days expiry
  ipAddress: "127.0.0.1",
  deviceId: "Test-Device",
  isActive: true,
};

const JWT_SECRET = process.env.JWT_SECRET || "test-secret";

describe("User Login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should return 401 if user does not exist", async () => {
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "invalid@example.com", password: "password123" });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("User does not exist");
  });

  test("should return 401 if password is incorrect", async () => {
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (argon2.verify as jest.Mock).mockResolvedValue(false); // Mock incorrect password

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@example.com", password: "wrongpassword" });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid credentials");
  });

  test("should return 200 and generate token on successful login", async () => {
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    (prismaMock.user.update as jest.Mock).mockResolvedValue(mockUser);
    (prismaMock.session.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prismaMock.session.create as jest.Mock).mockResolvedValue(mockSession);

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "johndoe@example.com", password: "SecurePassword123!" });

      console.log(response, 'response')

    // expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("token");
    expect(response.body).toHaveProperty("refreshToken");
  });

  test("should invalidate old sessions and create a new one", async () => {
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    (prismaMock.user.update as jest.Mock).mockResolvedValue(mockUser);
    (prismaMock.session.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prismaMock.session.create as jest.Mock).mockResolvedValue(mockSession);

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "johndoe@example.com", password: "SecurePassword123!" });

    expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
      where: { userId: mockUser.id, isActive: true },
      data: { isActive: false },
    });

    expect(prismaMock.session.create).toHaveBeenCalledWith({
      data: {
        userId: mockUser.id,
        refreshToken: expect.any(String),
        expiresAt: expect.any(Date),
        ipAddress: expect.any(String),
        deviceId: expect.any(String),
        isActive: true,
      },
    });

    expect(response.status).toBe(200);
  });

  test("should return 500 if an error occurs", async () => {
    (prismaMock.user.findUnique as jest.Mock).mockRejectedValue(new Error("Database error"));

    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@example.com", password: "password123" });

    expect(response.status).toBe(500);
  });
});
