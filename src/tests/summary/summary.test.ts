import request from "supertest";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { UserRole } from "@prisma/client";
import app from "../../app";
import { prismaMock } from "../../../prisma/singleton";
import redisClient from "../../configs/redis";
import * as amqp from "amqplib/callback_api";
import { EventEmitter } from "events";
import { mockUser } from "../util";

let amqpConnection: amqp.Connection;

jest.mock("../../services/functions.ts");

const JWT_SECRET = process.env.JWT_SECRET || "";


jest.mock("redis", () => {
  return {
    createClient: jest.fn().mockReturnValue({
      connect: jest.fn(),
      on: jest.fn(),
      quit: jest.fn(),
    }),
  };
});

jest.mock("jsonwebtoken", () => ({
  verify: jest.fn().mockImplementation(() => mockUser),
  sign: jest.fn().mockReturnValue('mockedToken'), 
}));

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

describe("Get Journal Summary", () => {
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

  // it("should retrieve journal summary successfully", async () => {
  //   const mockAnalyticsData = [
  //     {
  //       entryDate: "2025-04-07T17:39:18.702Z",
  //       wordCount: 100,
  //     },
  //     {
  //       entryDate: "2025-04-07T17:39:18.702Z",
  //       wordCount: 200,
  //     },
  //   ];

  //   const mockSentimentData = [
  //     {
  //       createdAt: new Date(),
  //       mood: "happy",
  //       score: 0.9,
  //     },
  //   ];

  //   const mockCategoryDistribution = [
  //     {
  //       categoryId: uuidv4(),
  //       _count: {
  //         categoryId: 3,
  //       },
  //     },
  //   ];

  //   const mockCategory = [
  //     {
  //       id: uuidv4(),
  //       name: "Category 1",
  //     },
  //   ];

  //   (prismaMock.journalEntry.count as jest.Mock).mockResolvedValue(2);
  //   (prismaMock.analyticsData.findMany as jest.Mock).mockResolvedValue(
  //     mockAnalyticsData
  //   );
  //   (prismaMock.sentimentScore.findMany as jest.Mock).mockResolvedValue(
  //     mockSentimentData
  //   );
  //   (prismaMock.journalEntryCategory.groupBy as jest.Mock).mockResolvedValue(
  //     mockCategoryDistribution
  //   );
  //   (prismaMock.category.findMany as jest.Mock).mockResolvedValue(mockCategory);

  //   const response = await request(app)
  //     .get("/api/v1/journal/summary")
  //     .set("Authorization", `Bearer ${token}`)
  //     .query({
  //       startDate: "2024-01-01",
  //       endDate: "2024-12-31",
  //     })
  //     .expect(200);

  //   expect(prismaMock.journalEntry.count).toHaveBeenCalled();
  //   expect(prismaMock.analyticsData.findMany).toHaveBeenCalled();
  //   expect(prismaMock.sentimentScore.findMany).toHaveBeenCalled();
  //   expect(prismaMock.journalEntryCategory.groupBy).toHaveBeenCalled();
  //   expect(prismaMock.category.findMany).toHaveBeenCalled();

  //   expect(response.body).toMatchObject({
  //     totalEntries: 2,
  //     wordCountTrends: expect.any(Array),
  //     categoryDistribution: expect.any(Array),
  //     timeOfDayAnalysis: expect.any(Object),
  //     moodTrends: expect.any(Array),
  //     overallMoodPerDay: expect.any(Object),
  //     totalEntriesPerYear: expect.any(Object),
  //     totalEntriesPerWeek: expect.any(Object),
  //     totalWordsPerYear: expect.any(Object),
  //     totalWordsPerWeek: expect.any(Object),
  //     distinctDaysJournaled: expect.any(Number),
  //     heatmapData: expect.any(Array),
  //   });
  // });

  it("should handle errors gracefully when data retrieval fails", async () => {
    const errorMessage = "Database error occurred";
    (prismaMock.journalEntry.count as jest.Mock).mockRejectedValue(
      new Error(errorMessage)
    );

    const response = await request(app)
      .get("/api/v1/journal/summary")
      .set("Authorization", `Bearer ${token}`)
      .query({
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      })
      .expect(500);

    expect(response.body).toHaveProperty("message", "Database error occurred");
    expect(prismaMock.journalEntry.count).toHaveBeenCalled();
  });

  it("should reject summary request if the user is not authorized", async () => {
    const response = await request(app)
      .get("/api/v1/journal/summary")
      .query({
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      })
      .expect(401);

    expect(response.body).toHaveProperty("message", "Unauthorized");
  });

  it("should reject summary request if the token is invalid", async () => {
    const invalidToken = "invalid-token";

    const response = await request(app)
      .get("/api/v1/journal/summary")
      .set("Authorization", `Bearer ${invalidToken}`)
      .query({
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      })
      .expect(403);

    expect(response.body).toHaveProperty("message", "Invalid token");
  });
});

describe("Get Sentiment Extremes", () => {
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

  it("should return the most positive and most negative sentiment entries", async () => {
    const mockSentimentData = [
      {
        journalId: "1",
        score: 0.9,
        mood: "Happy",
        createdAt: new Date("2025-03-01"),
        journal: { content: "I'm feeling great today!" },
      },
      {
        journalId: "2",
        score: -0.8,
        mood: "Sad",
        createdAt: new Date("2025-03-02"),
        journal: { content: "I'm feeling down..." },
      },
      {
        journalId: "3",
        score: 0.5,
        mood: "Neutral",
        createdAt: new Date("2025-03-03"),
        journal: { content: "It's just an okay day." },
      },
    ];

    (prismaMock.sentimentScore.findMany as jest.Mock).mockResolvedValue(
      mockSentimentData
    );

    const response = await request(app)
      .get("/api/v1/journal/sentiment-extremes")
      .set("Authorization", `Bearer ${token}`)
      .query({ startDate: "2025-03-01", endDate: "2025-03-03" })
      .expect(200);

    expect(response.body).toHaveProperty("mostPositive");
    expect(response.body.mostPositive).toEqual({
      journalId: "1",
      mood: "Happy",
      score: 0.9,
      content: "I'm feeling great today!",
    });

    expect(response.body).toHaveProperty("mostNegative");
    expect(response.body.mostNegative).toEqual({
      journalId: "2",
      mood: "Sad",
      score: -0.8,
      content: "I'm feeling down...",
    });
  });

  it("should handle errors gracefully", async () => {
    const errorMessage = "Database error occurred";
    (prismaMock.sentimentScore.findMany as jest.Mock).mockRejectedValue(
      new Error(errorMessage)
    );

    const response = await request(app)
      .get("/api/v1/journal/sentiment-extremes")
      .set("Authorization", `Bearer ${token}`)
      .query({ startDate: "2025-03-01", endDate: "2025-03-03" })
      .expect(500);

    expect(response.body).toHaveProperty("message", "Database error occurred");
  });

  it("should reject request if the user is not authorized", async () => {
    const response = await request(app)
      .get("/api/v1/journal/sentiment-extremes")
      .query({ startDate: "2025-03-01", endDate: "2025-03-03" })
      .expect(401);

    expect(response.body).toHaveProperty("message", "Unauthorized");
  });

  it("should reject request if the token is invalid", async () => {
    const invalidToken = "invalid-token";

    const response = await request(app)
      .get("/api/v1/journal/sentiment-extremes")
      .set("Authorization", `Bearer ${invalidToken}`)
      .query({ startDate: "2025-03-01", endDate: "2025-03-03" })
      .expect(403);

    expect(response.body).toHaveProperty("message", "Invalid token");
  });

  it("should handle missing startDate and endDate gracefully", async () => {
    const mockSentimentData = [
      {
        journalId: "1",
        score: 0.9,
        mood: "Happy",
        createdAt: new Date("2025-03-01"),
        journal: { content: "I'm feeling great today!" },
      },
    ];

    (prismaMock.sentimentScore.findMany as jest.Mock).mockResolvedValue(
      mockSentimentData
    );

    const response = await request(app)
      .get("/api/v1/journal/sentiment-extremes")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveProperty("mostPositive");
    expect(response.body.mostPositive).toEqual({
      journalId: "1",
      mood: "Happy",
      score: 0.9,
      content: "I'm feeling great today!",
    });

    expect(response.body).toHaveProperty("mostNegative");
  });
});

