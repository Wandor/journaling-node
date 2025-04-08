import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import app from "../../app";
import { prismaMock } from "../../../prisma/singleton";
import redisUtil from "../../services/redisUtil";
import argon2 from "argon2";
import { UserRole } from "@prisma/client";
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

jest.mock("../../services/redisUtil");

describe("Send OTP", () => {
  const mockUserId = uuidv4();
  const mockOtpValue = "123456";
  const mockOtpExpiry = new Date(Date.now() + 5 * 60 * 1000);
  const mockSession = {
    userId: mockUserId,
    otpValue: mockOtpValue,
    otpVerified: false,
    otpExpiry: mockOtpExpiry,
  };

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
      .post("/api/v1/auth/resendOtp")
      .send({ userId: mockUserId });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("User does not exists");
  });

  it("should return 429 if maximum OTP resend count is exceeded", async () => {
    const mockLastResendDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
      id: mockUserId,
      role: UserRole.USER,
      otpResendCount: 5,
      lastOTPResendDate: mockLastResendDate,
    });

    // Simulate the condition where max OTP resend count is exceeded
    process.env.OTP_RESEND_MAX_COUNT = "3";
    process.env.OTP_SEND_MAX_HOURS = "24";

    const response = await request(app)
      .post("/api/v1/auth/resendOtp")
      .send({ userId: mockUserId });

    expect(response.status).toBe(429);
    expect(response.body.error).toBe(true);
    expect(response.body.message).toBe(
      "Surpassed Maximum Number of OTP Resends! Contact Administrator!"
    );
  });

  it("should return 404 if session not found", async () => {
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
      id: mockUserId,
      role: UserRole.USER,
      lastOTPResendDate: new Date(),
      otpResendCount: 0,
    });

    redisUtil.get = jest.fn().mockResolvedValue(null);

    const response = await request(app)
      .post("/api/v1/auth/resendOtp")
      .send({ userId: mockUserId });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe(true);
    expect(response.body.message).toBe("Session not found! Log in again");
  });

  it("should generate OTP and update session successfully", async () => {
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
      id: mockUserId,
      role: UserRole.USER,
      lastOTPResendDate: new Date(),
      otpResendCount: 0,
    });
    redisUtil.get = jest.fn().mockResolvedValue(mockSession);

    (argon2.hash as jest.Mock).mockResolvedValue("hashed-password");
    redisUtil.set = jest.fn().mockResolvedValue(true);

    (prismaMock.user.update as jest.Mock).mockResolvedValue({
      id: mockUserId,
      role: UserRole.USER,
      lastOTPResendDate: new Date(),
      otpResendCount: 0,
    });

    const response = await request(app)
      .post("/api/v1/auth/resendOtp")
      .send({ userId: mockUserId });
    expect(response.status).toBe(200);
    expect(response.body.message).toContain("Your One Time Password is:");

    expect(redisUtil.set).toHaveBeenCalledWith({
      dbOperation: false,
      operationName: "Update",
      actionOnError: "log",
      key: "session",
      value: expect.any(Object),
      dataActions: {
        setAsArray: false,
        actionIfExists: "replace",
        uniqueKey: "userId",
      },
    });

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: mockUserId },
      data: {
        otpResendCount: { increment: 1 },
        otpSent: true,
        lastOTPResendDate: expect.any(Date),
      },
    });
  });
});
