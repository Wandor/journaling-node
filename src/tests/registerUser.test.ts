import request from "supertest";
import app from "../app";
import argon2 from "argon2";
import { UserRole } from "@prisma/client";
import { prismaMock } from "../../prisma/singleton";

jest.mock("argon2");

describe("User Registration", () => {
  const mockUser = {
    id: "user-id",
    name: "Test User",
    email: "test@example.com",
    password: "hashed-password",
    role: UserRole.ADMIN,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginDate: null,
    lastPasswordChangeDate: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
  it("should hash the password before saving the user", async () => {
    const hashedPassword = "hashed-password";

    // Mock argon2.hash to return a fake hash
    (argon2.hash as jest.Mock).mockResolvedValue(hashedPassword);

    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      ...mockUser,
      password: hashedPassword,
    });

    const response = await request(app)
      .post("/api/auth/register")
      .send(mockUser)
      .expect(201);

    expect(argon2.hash).toHaveBeenCalledWith(mockUser.password);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ password: hashedPassword }),
      })
    );
    expect(response.body).toMatchObject({ message: "User registered" });
  });

  it("should register a new user successfully", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue(mockUser);

    const response = await request(app)
      .post("/api/auth/register")
      .send(mockUser)
      .expect(201);

    expect(response.body).toMatchObject({ message: "User registered" });
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: mockUser.email },
    });
    expect(prismaMock.user.create).toHaveBeenCalled();
  });

  it("should return 400 if user already exists", async () => {
    prismaMock.user.findUnique.mockResolvedValue(mockUser);

    const response = await request(app)
      .post("/api/auth/register")
      .send(mockUser)
      .expect(400);

    expect(response.body).toMatchObject({ message: "User already exists" });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("should return validation error for invalid email", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ ...mockUser, email: "invalid-email" })
      .expect(400);

    expect(response.body).toHaveProperty("errors.email");
  });

  it("should return validation error for weak password", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ ...mockUser, password: "123" })
      .expect(400);

    expect(response.body).toHaveProperty("errors.password");
  });

  it("should return 500 on server error", async () => {
    prismaMock.user.findUnique.mockRejectedValue(
      new Error("Internal server error")
    );

    const response = await request(app)
      .post("/api/auth/register")
      .send(mockUser)
      .expect(500);

    expect(response.body).toMatchObject({ message: "Internal server error" });
  });
});
