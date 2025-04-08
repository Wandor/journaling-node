import request from "supertest";
import app from "../../app";
import argon2 from "argon2";
import { UserRole } from "@prisma/client";
import { prismaMock } from "../../../prisma/singleton";
import { v4 as uuidv4 } from "uuid";
import redisClient from "../../configs/redis";
import * as amqp from "amqplib/callback_api";
import { EventEmitter } from "events";

let amqpConnection: amqp.Connection;

jest.mock("argon2");

jest.mock("redis", () => {
  return {
    createClient: jest.fn().mockReturnValue({
      connect: jest.fn(),
      on: jest.fn(),
      quit: jest.fn(),
    }),
  };
});

jest.mock("amqplib/callback_api", () => {
  const { EventEmitter } = require("events"); 
  const mockConn = new EventEmitter();
  const mockChannel = new EventEmitter();

  mockConn.on = jest.fn();
  mockChannel.on = jest.fn();


  mockChannel.prefetch = jest.fn();
  mockChannel.assertQueue = jest.fn().mockImplementation((queue, options, callback) => {
    callback(null, { queue, messageCount: 0, consumerCount: 0 });
  });
  mockChannel.consume = jest.fn();
  mockConn.createConfirmChannel = jest.fn().mockImplementation((callback) => {
    
    callback(null, mockChannel);
  });

  return {
    connect: jest.fn().mockImplementation((url, callback) => {
      callback(null, mockConn);
    }),
    createConfirmChannel: jest.fn().mockResolvedValue(mockChannel),
  };
});

describe("User Registration", () => {
  const currentDate = new Date("2025-04-05T18:16:48.861Z");

  const mockUser = {
    id: uuidv4(),
    userName: "testuser",
    firstName: "Test",
    lastName: "User",
    emailAddress: "test@example.com",
    mobileNumber: "1234567890",
    password: "Strong@Password123",
    role: UserRole.USER,
    twoFactorEnabled: false,
    accessFailedCount: 0,
    otpResendCount: 0,
    isLockedOut: false,
    status: true,
    otpSent: false,
    lastOTPResendDate: null,
    lastLoginDate: null,
    lastPasswordChangedDate: currentDate,
    createdAt: currentDate,
    updatedAt: currentDate,
  };

  const hashedPassword = "hashed-password";
  const passwordExpiry = Number(process.env.PASSWORD_EXPIRY_DAYS);

  beforeEach(() => {
    jest.clearAllMocks();
    amqpConnection = {
      close: jest.fn(),
      createConfirmChannel: jest.fn().mockResolvedValue({
        sendToQueue: jest.fn(),
        assertQueue: jest.fn(),
      }),
    } as unknown as amqp.Connection;

    (amqp.connect as jest.Mock).mockResolvedValue(amqpConnection);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  afterAll(async () => {
    await redisClient.quit();
      if (amqpConnection) {
    await amqpConnection.close();
  }
  });

  it("should hash the password before saving the user", async () => {
    const passwordExpiryDate = new Date(currentDate);
    passwordExpiryDate.setDate(passwordExpiryDate.getDate() + passwordExpiry);

    (argon2.hash as jest.Mock).mockResolvedValue(hashedPassword);

    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue(mockUser);

    prismaMock.password.create.mockResolvedValue({
      userId: mockUser.id,
      password: hashedPassword,
      passwordExpiry: passwordExpiryDate,
      isActive: true,
      id: uuidv4(),
      createdAt: currentDate,
      clusteredId: 1,
    });

    const response = await request(app)
      .post("/api/v1/user/register")
      .send(mockUser)
      .expect(201);

    expect(argon2.hash).toHaveBeenCalledWith(mockUser.password);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userName: mockUser.userName,
          firstName: mockUser.firstName,
          lastName: mockUser.lastName,
          emailAddress: mockUser.emailAddress,
          mobileNumber: mockUser.mobileNumber,
          role: mockUser.role,
          lastPasswordChangedDate: expect.any(Date),
        }),
      })
    );
    expect(prismaMock.password.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: mockUser.id,
          password: hashedPassword,
          passwordExpiry: expect.any(Date),
          isActive: true,
        }),
      })
    );
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { emailAddress: mockUser.emailAddress },
    });
    expect(response.body).toMatchObject({ message: "User registered" });
  });

  it("should return 409 if user already exists", async () => {
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

    const response = await request(app)
      .post("/api/v1/user/register")
      .send(mockUser)
      .expect(409);

    expect(response.body).toMatchObject({ message: "User already exists" });
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("should return validation error for invalid email", async () => {
    const response = await request(app)
      .post("/api/v1/user/register")
      .send({ ...mockUser, emailAddress: "invalid-email" })
      .expect(400);

    expect(response.body).toHaveProperty("errors.emailAddress");
  });

  it("should return validation error for weak password", async () => {
    const response = await request(app)
      .post("/api/v1/user/register")
      .send({ ...mockUser, password: "123" })
      .expect(400);

    expect(response.body).toHaveProperty("errors.password");
  });

  it("should return 500 on server error", async () => {
    prismaMock.user.findUnique.mockRejectedValue(
      new Error("Internal server error")
    );

    const response = await request(app)
      .post("/api/v1/user/register")
      .send(mockUser)
      .expect(500);

    expect(response.body).toMatchObject({ message: "Internal server error" });
  });
});
