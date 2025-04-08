import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import * as argon2 from "argon2";
import { UserRole } from "@prisma/client";
import { prismaMock } from "../../../prisma/singleton";
import app from "../../app";
import redisUtil from "../../services/redisUtil";
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
  mockChannel.assertQueue = jest
    .fn()
    .mockImplementation((queue, options, callback) => {
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

jest.mock("../../services/redisUtil");

const mockUser = {
  id: uuidv4(),
  emailAddress: "test@example.com",
  password: "hashed-password",
  role: UserRole.USER,
  status: true,
  isLockedOut: false,
  accessFailedCount: 0,
  twoFactorEnabled: false,
  otpResendCount: 0,
  otpSent: false,
  lastOTPResendDate: null,
};

const mockSession = {
  userId: "user-123",
  refreshToken: uuidv4(),
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  ipAddress: "127.0.0.1",
  deviceId: "Test-Device",
  isActive: true,
};

const mockPassword = {
  password: "hashed-password",
  passwordExpiry: new Date(Date.now() + 86400000),
  isActive: true,
  id: "pass123",
};

describe("User Login", () => {
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

  it("should return 404 if user does not exist", async () => {
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ emailAddress: "invalid@example.com", password: "password123" })

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("User does not exist");
  });

  it("should return 401 if account is locked or inactive", async () => {
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
      ...mockUser,
      status: false,
      isLockedOut: true
    });

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ emailAddress: "test@example.com", password: "password123" });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Account locked! Contact our help desk");
  });

  it("should return 401 if password not found", async () => {
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prismaMock.password.findFirst as jest.Mock).mockResolvedValue(null);

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ emailAddress: "test@example.com", password: "password123" });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Unauthorized!");
  });

  it("should return 401 if password expired", async () => {
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prismaMock.password.findFirst as jest.Mock).mockResolvedValue({
      ...mockUser,
      isActive: false,
      passwordExpiry: new Date(Date.now() - 86400000),
    });

    (prismaMock.password.update as jest.Mock).mockResolvedValue({});

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ emailAddress: "test@example.com", password: "password123" });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Password expired!");
  });

  it("should return 401 if password is incorrect", async () => {
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prismaMock.password.findFirst as jest.Mock).mockResolvedValue(mockPassword);
    (argon2.verify as jest.Mock).mockResolvedValue(false);

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ emailAddress: "test@example.com", password: "wrongpassword" });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid credentials");
  });

  it("should return 200 and generate token on successful login", async () => {
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prismaMock.password.findFirst as jest.Mock).mockResolvedValue(mockPassword);
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    (prismaMock.user.update as jest.Mock).mockResolvedValue(mockUser);
    (prismaMock.session.create as jest.Mock).mockResolvedValue(mockSession);

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ emailAddress: "test@example.com", password: "password123" });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("token");
    expect(response.body).toHaveProperty("refreshToken");
    expect(redisUtil.set).toHaveBeenCalledWith({
      dbOperation: false,
      operationName: "create",
      actionOnError: "log",
      key: "session",
      value: expect.any(Object),
      expiry: 86400,
      dataActions: {
        setAsArray: false,
        actionIfExists: "replace",
        uniqueKey: "userId",
      },
    });
  });

  it("should return OTP if two-factor authentication is enabled", async () => {
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
      ...mockUser,
      lastOTPResendDate: new Date(),
      otpResendCount: 0,
    });

    (prismaMock.password.findFirst as jest.Mock).mockResolvedValue(mockPassword);

    (prismaMock.userPreferences.findUnique as jest.Mock).mockResolvedValue({
      twoFactorEnabled: true,
    });

    (argon2.verify as jest.Mock).mockResolvedValue(true);
    (prismaMock.user.update as jest.Mock).mockResolvedValue(mockUser);
    (prismaMock.user.update as jest.Mock).mockResolvedValue(mockUser);

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ emailAddress: "test@example.com", password: "password123" });

    expect(response.status).toBe(200);
    expect(response.body.message).toContain("Your One Time Password is:");

    expect(redisUtil.set).toHaveBeenCalled();
  });

  it("should return 500 if an error occurs", async () => {
    (prismaMock.user.findUnique as jest.Mock).mockRejectedValue(
      new Error("Database error")
    );

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ emailAddress: "test@example.com", password: "password123" });

    expect(response.status).toBe(500);
  });
});
