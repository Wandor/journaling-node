import request from "supertest";
import redisUtil from "../../services/redisUtil";
import app from "../../app";
import redisClient from "../../configs/redis";
import * as amqp from "amqplib/callback_api";
import { EventEmitter } from "events";
import { mockUser } from "../util";

let amqpConnection: amqp.Connection;

jest.mock("../../services/redisUtil");

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

describe("Logout", () => {
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
  it("should logout successfully when userId is provided", async () => {
    const mockUserId = mockUser.userId;

    (redisUtil.del as jest.Mock).mockResolvedValue(true);

    const response = await request(app)
      .post("/api/v1/auth/logout")
      .send({ userId: mockUserId });

    expect(redisUtil.del).toHaveBeenCalledWith(`session-${mockUserId}`);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("logout successful");
  });

  it("should handle missing userId in the request body", async () => {
    const response = await request(app).post("/api/v1/auth/logout").send({});

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("userId is required");
  });

  it("should handle Redis deletion failure", async () => {
    const mockUserId = mockUser.userId;

    (redisUtil.del as jest.Mock).mockRejectedValue(new Error("Redis error"));

    const response = await request(app)
      .post("/api/v1/auth/logout")
      .send({ userId: mockUserId });

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Redis error");
  });

  it("should handle unexpected errors", async () => {
    const mockUserId = mockUser.userId;
    (redisUtil.del as jest.Mock).mockRejectedValue(
      new Error("Unexpected error")
    );

    const response = await request(app)
      .post("/api/v1/auth/logout")
      .send({ userId: mockUserId });

    expect(response.status).toBe(500);
    expect(response.body.message).toBe("Unexpected error");
  });
});
