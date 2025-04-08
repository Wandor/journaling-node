import request from "supertest";
import jwt from "jsonwebtoken";
import { prismaMock } from "../../../prisma/singleton";
import { v4 as uuidv4 } from "uuid";
import { UserRole } from "@prisma/client";
import app from "../../app";
import * as amqp from "amqplib/callback_api";
import redisClient from "../../configs/redis";
import { Request, Response, NextFunction } from "express";
import { EventEmitter } from "events";
import { mockUser } from "../util";

let amqpConnection: amqp.Connection;


const JWT_SECRET = process.env.JWT_SECRET || "";

jest.mock("jsonwebtoken", () => ({
  verify: jest.fn().mockImplementation(() => mockUser),
  sign: jest.fn().mockReturnValue("mockedToken"),
}));

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

jest.mock("redis", () => {
  return {
    createClient: jest.fn().mockReturnValue({
      connect: jest.fn(),
      on: jest.fn(),
      quit: jest.fn(),
    }),
  };
});

describe("User Preferences", () => {
  let token: string;
  beforeEach(() => {
    jest.clearAllMocks();
    token = jwt.sign(mockUser, JWT_SECRET, { expiresIn: "1h" });
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
  const mockPreferences = {
    enableNotifications: true,
    autoTag: true,
    autoCategorize: true,
    summarize: true,
    reminderTime: "2025-04-07T10:00:00.000Z",
    language: "en",
    timeZone: "UTC",
    twoFactorEnabled: false,
  };

  it("should create user preferences if they don't exist", async () => {
    (prismaMock.userPreferences.upsert as jest.Mock).mockResolvedValue(
      mockPreferences
    );
    const response = await request(app)
      .post("/api/v1/user/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send(mockPreferences);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Preferences successfully updated!");
    expect(response.body.preferences).toEqual(mockPreferences);
    expect(prismaMock.userPreferences.upsert).toHaveBeenCalledWith({
      where: { userId: mockUser.userId },
      update: expect.any(Object),
      create: expect.any(Object),
    });
  });

  it("should update existing user preferences", async () => {
    (prismaMock.userPreferences.upsert as jest.Mock).mockResolvedValue({
      ...mockPreferences,
      twoFactorEnabled: true,
    });

    const response = await request(app)
      .post("/api/v1/user/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...mockPreferences, twoFactorEnabled: true });

    expect(response.status).toBe(200);
    expect(response.body.preferences.twoFactorEnabled).toBe(true);
    expect(prismaMock.userPreferences.upsert).toHaveBeenCalledWith({
      where: { userId: mockUser.userId as any },
      update: expect.objectContaining({
        twoFactorEnabled: true,
      }),
      create: expect.any(Object),
    });
  });


  it("should handle Prisma errors gracefully", async () => {
    prismaMock.userPreferences.upsert.mockRejectedValue(
      new Error("Database error")
    );

    const response = await request(app)
      .post("/api/v1/user/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send(mockPreferences);

    expect(response.status).toBe(500);
    expect(response.body.message).toBeDefined();
  });

  it("should handle missing fields with defaults", async () => {
    const partialData = {
      userId: mockUser.userId,
      language: "fr",
    };

    (prismaMock.userPreferences.upsert as jest.Mock).mockResolvedValue({
      ...mockPreferences,
      language: "fr",
    });

    const response = await request(app)
      .post("/api/v1/user/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send(partialData);

    expect(response.status).toBe(200);
    expect(response.body.preferences.language).toBe("fr");
    expect(response.body.preferences.enableNotifications).toBe(true);
  });
});
