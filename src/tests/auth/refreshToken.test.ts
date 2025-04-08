import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import { prismaMock } from "../../../prisma/singleton";
import app from "../../app";
import redisUtil from "../../services/redisUtil";
import redisClient from "../../configs/redis";
import { UserRole } from "@prisma/client";
import * as amqp from "amqplib/callback_api";
import { EventEmitter } from "events";

let amqpConnection: amqp.Connection;

jest.mock("../../services/redisUtil");
jest.mock("jsonwebtoken");

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

describe("Refresh Token", () => {
  let userId: string;
  let refreshToken: string;
  let activeSession: any;

  beforeEach(() => {
    userId = uuidv4();
    refreshToken = uuidv4();
    activeSession = {
      userId,
      refreshTokenExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      refreshToken,
      sessionStatus: true,
    };

    redisUtil.get = jest.fn().mockResolvedValue(activeSession);

    jwt.sign = jest.fn().mockReturnValue("newAccessToken");
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

  it("should return 404 if no active session is found", async () => {
    redisUtil.get = jest.fn().mockResolvedValue(null);

    const response = await request(app)
      .post("/api/v1/auth/refreshToken")
      .send({ userId, refreshToken });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("No active session");
    expect(redisUtil.set).not.toHaveBeenCalled();
  });

  it("should return 401 if the session has expired", async () => {
    activeSession.refreshTokenExpiry = new Date(Date.now() - 1 * 60 * 1000);

    const response = await request(app)
      .post("/api/v1/auth/refreshToken")
      .send({ userId, refreshToken });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Session expired!");
  });

  it("should return 401 if the session is inactive", async () => {
    activeSession.sessionStatus = false;

    const response = await request(app)
      .post("/api/v1/auth/refreshToken")
      .send({ userId, refreshToken });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Session expired!");
  });

  it("should return 401 if the refresh token does not match", async () => {
    const invalidRefreshToken = uuidv4();

    const response = await request(app)
      .post("/api/v1/auth/refreshToken")
      .send({ userId, refreshToken: invalidRefreshToken });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Invalid session");
  });

  it("should return 401 if the user does not exist", async () => {
    const invalidUserId = uuidv4();

    redisUtil.get = jest.fn().mockResolvedValue({
      ...activeSession,
      userId: invalidUserId,
    });
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await request(app)
      .post("/api/v1/auth/refreshToken")
      .send({ userId: invalidUserId, refreshToken });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("User does not exist!");
  });

  it("should return 201 with new access token on successful refresh", async () => {
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
      id: userId,
      role: UserRole.USER,
    });

    const response = await request(app)
      .post("/api/v1/auth/refreshToken")
      .send({ userId, refreshToken });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe("Token generated successfully!");
    expect(response.body.accessToken).toBe("newAccessToken");
    expect(response.body.refreshToken).toBe(refreshToken);
    expect(redisUtil.set).toHaveBeenCalledWith({
      dbOperation: false,
      operationName: "Update",
      actionOnError: "log",
      key: "session",
      value: activeSession,
      expiry: 86400,
      dataActions: {
        setAsArray: false,
        actionIfExists: "replace",
        uniqueKey: "userId",
      },
    });
  });

  it("should handle errors gracefully", async () => {
    redisUtil.get = jest.fn().mockRejectedValue(new Error("Redis error"));

    const response = await request(app)
      .post("/api/v1/auth/refreshToken")
      .send({ userId, refreshToken });

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Redis error");
  });
});
