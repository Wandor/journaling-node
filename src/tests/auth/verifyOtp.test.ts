import request from "supertest";
import argon2 from "argon2";
import redisUtil from "../../services/redisUtil";
import app from "../../app";
import { prismaMock } from "../../../prisma/singleton";
import redisClient from "../../configs/redis";
import * as amqp from "amqplib/callback_api";
import { EventEmitter } from "events";

let amqpConnection: amqp.Connection;

jest.mock("../../services/redisUtil");
jest.mock("argon2");

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

jest.mock("redis", () => {
  return {
    createClient: jest.fn().mockReturnValue({
      connect: jest.fn(),
      on: jest.fn(),
      quit: jest.fn(),
    }),
  };
});

describe("Verify OTP", () => {
  const mockUserId = "7b15a424-af50-4367-b849-00375780d286";
  const mockOtpValue = "123456";
  const mockOtpExpiry = new Date(Date.now() + 5 * 60 * 1000);
  const mockActiveSession = {
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

  it("should return 401 if no active session exists for the user", async () => {
    redisUtil.get = jest.fn().mockResolvedValue(null);

    const response = await request(app)
      .post("/api/v1/auth/verifyOtp")
      .send({ userId: mockUserId, otpValue: "123456" });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("No active session");
  });

  it("should return 409 if OTP is already verified", async () => {
    redisUtil.get = jest.fn().mockResolvedValue({
      ...mockActiveSession,
      otpVerified: true,
    });

    const response = await request(app)
      .post("/api/v1/auth/verifyOtp")
      .send({ userId: mockUserId, otpValue: "123456" });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe(
      "OTP already used, request for another one"
    );
  });

  it("should return 409 if OTP has expired", async () => {
    redisUtil.get = jest.fn().mockResolvedValue({
      ...mockActiveSession,
      otpExpiry: new Date(Date.now() - 1 * 60 * 1000),
    });

    const response = await request(app)
      .post("/api/v1/auth/verifyOtp")
      .send({ userId: mockUserId, otpValue: "123456" });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe("OTP expired!");
  });

  it("should return 400 if OTP does not match", async () => {
    redisUtil.get = jest.fn().mockResolvedValue(mockActiveSession);

    argon2.verify = jest.fn().mockResolvedValue(false);

    const response = await request(app)
      .post("/api/v1/auth/verifyOtp")
      .send({ userId: mockUserId, otpValue: "wrongOtp" });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Invalid OTP");
  });

  it("should successfully verify OTP and update session", async () => {
    redisUtil.get = jest.fn().mockResolvedValue(mockActiveSession);
    argon2.verify = jest.fn().mockResolvedValue(true);

    redisUtil.set = jest.fn().mockResolvedValue(true);

    (prismaMock.user.update as jest.Mock).mockResolvedValue({
      ...mockActiveSession,
      otpResendCount: 1,
    });

    const response = await request(app)
      .post("/api/v1/auth/verifyOtp")
      .send({ userId: mockUserId, otpValue: mockOtpValue });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("OTP Verified!");
    expect(response.body.status).toBe("OK");

    expect(redisUtil.set).toHaveBeenCalledWith({
      dbOperation: false,
      operationName: "Update",
      actionOnError: "log",
      key: "session",
      expiry: 86400,
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
