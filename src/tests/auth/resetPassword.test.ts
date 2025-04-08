import request from "supertest";
import { UserRole } from "@prisma/client";
import { prismaMock } from "../../../prisma/singleton";
import app from "../../app";
import argon2 from "argon2";
import redisClient from "../../configs/redis";
import * as amqp from "amqplib/callback_api";
import { EventEmitter } from "events";

let amqpConnection: amqp.Connection;

jest.mock("argon2");

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

describe("Reset Password", () => {
  const mockEmail = "user@example.com";
  const mockPassword = "newPassword@123";
  const mockHashedPassword = "hashedPassword";
  const mockUser = {
    id: 1,
    emailAddress: mockEmail,
    status: false,
    isLockedOut: true,
    lastPasswordChangedDate: null,
  };
  const passwordExpiry = 30;

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
      .post("/api/v1/auth/resetPassword")
      .send({ emailAddress: mockEmail, password: mockPassword });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("User does not exists");
  });


  it("should not allow password reset if user does not exist", async () => {
    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await request(app)
      .post("/api/v1/auth/resetPassword")
      .send({
        emailAddress: "nonexistent@example.com",
        password: "new@Password123",
      });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("User does not exists");
  });
});
