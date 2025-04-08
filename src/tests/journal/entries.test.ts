import request from "supertest";
import app from "../../app";
import { prismaMock } from "../../../prisma/singleton";
import redisClient from "../../configs/redis";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { UserRole } from "@prisma/client";
import { publishToqueue } from "../../services/functions";
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

describe("Create Entry", () => {
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

  it("should create a new journal entry and return a success message", async () => {
    const mockJournal = {
      id: uuidv4(),
      title: "Test Title",
      content: "Test Content",
      userId: uuidv4(),
      entryDate: "2025-04-07T17:39:18.702Z",
      tags: [{ tag: { name: "tag1" } }],
      categories: [{ category: { name: "category1" } }],
    };

    (prismaMock.journalEntry.create as jest.Mock).mockResolvedValue(
      mockJournal
    );

    const response = await request(app)
      .post("/api/v1/journal/create-entry")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Test Title",
        content: "Test Content",
        tags: ["tag1"],
        categories: ["category1"],
        entryDate: "2025-04-07T17:39:18.702Z",
      })
      .expect(201);

    expect(prismaMock.journalEntry.create).toHaveBeenCalled();
    expect(publishToqueue).toHaveBeenCalled();

    expect(response.body).toMatchObject({
      message: "Entry created!",
      journal: mockJournal,
    });
  });

  it("should handle errors gracefully", async () => {
    const errorMessage = "Database error occurred";
    (prismaMock.journalEntry.create as jest.Mock).mockRejectedValue(
      new Error(errorMessage)
    );

    const response = await request(app)
      .post("/api/v1/journal/create-entry")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Test Title",
        content: "Test Content",
        tags: ["tag1"],
        categories: ["category1"],
        entryDate: "2025-04-07T17:39:18.702Z",
      })
      .expect(500);

    expect(response.body).toHaveProperty("message", "Database error occurred");
    expect(prismaMock.journalEntry.create).toHaveBeenCalled();
  });

  it("should reject creation if the user is not authorized", async () => {
    const response = await request(app)
      .post("/api/v1/journal/create-entry")
      .send({
        title: "Test Title",
        content: "Test Content",
        tags: ["tag1"],
        categories: ["category1"],
      })
      .expect(401);

    expect(response.body).toHaveProperty("message", "Unauthorized");
    expect(prismaMock.journalEntry.create).not.toHaveBeenCalled();
  });

  it("should reject creation if the token is invalid", async () => {
    const invalidToken = "invalid-token";

    const response = await request(app)
      .post("/api/v1/journal/create-entry")
      .set("Authorization", `Bearer ${invalidToken}`)
      .send({
        title: "Test Title",
        content: "Test Content",
        tags: ["tag1"],
        categories: ["category1"],
      })
      .expect(403);

    expect(response.body).toHaveProperty("message", "Invalid token");
    expect(prismaMock.journalEntry.create).not.toHaveBeenCalled();
  });

  it("should handle missing required fields gracefully", async () => {
    const response = await request(app)
      .post("/api/v1/journal/create-entry")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "",
        content: "",
      })
      .expect(400);

    expect(response.body).toHaveProperty("message", "Validation error");
    expect(prismaMock.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe("Update Entry", () => {
  let token: string;
  const journalId = uuidv4();

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

  it("should update a journal entry and return a success message", async () => {
    const mockUpdatedJournal = {
      id: journalId,
      title: "Updated Test Title",
      content: "Updated Test Content",
      userId: mockUser.userId,
      entryDate: "2025-04-07T17:39:18.702Z",
      tags: [{ tag: { name: "tag1" } }],
      categories: [{ category: { name: "category1" } }],
    };
    (prismaMock.journalEntry.update as jest.Mock).mockResolvedValue(
      mockUpdatedJournal
    );

    const response = await request(app)
      .put(`/api/v1/journal/update-entry/${journalId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Updated Test Title",
        content: "Updated Test Content",
        tags: ["tag1"],
        categories: ["category1"],
      })
      .expect(200);

    expect(prismaMock.journalEntry.update).toHaveBeenCalled();
    expect(publishToqueue).toHaveBeenCalled();

    expect(response.body).toMatchObject({
      message: "Journal updated successfully",
      journal: mockUpdatedJournal,
    });
  });

  it("should handle errors gracefully during journal update", async () => {
    const errorMessage = "Database error occurred";
    (prismaMock.journalEntry.update as jest.Mock).mockRejectedValue(
      new Error(errorMessage)
    );

    const response = await request(app)
      .put(`/api/v1/journal/update-entry/${journalId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Updated Test Title",
        content: "Updated Test Content",
        tags: ["tag1"],
        categories: ["category1"],
      })
      .expect(500); 

    expect(response.body).toHaveProperty("message", "Database error occurred");
    expect(prismaMock.journalEntry.update).toHaveBeenCalled();
  });

  it("should reject update if the user is not authorized", async () => {
    const response = await request(app)
      .put(`/api/v1/journal/update-entry/${journalId}`)
      .send({
        title: "Updated Test Title",
        content: "Updated Test Content",
        tags: ["tag1"],
        categories: ["category1"],
      })
      .expect(401);

    expect(response.body).toHaveProperty("message", "Unauthorized");
    expect(prismaMock.journalEntry.update).not.toHaveBeenCalled();
  });

  it("should reject update if the token is invalid", async () => {
    const invalidToken = "invalid-token";

    const response = await request(app)
      .put(`/api/v1/journal/update-entry/${journalId}`)
      .set("Authorization", `Bearer ${invalidToken}`)
      .send({
        title: "Updated Test Title",
        content: "Updated Test Content",
        tags: ["tag1"],
        categories: ["category1"],
      })
      .expect(403);

    expect(response.body).toHaveProperty("message", "Invalid token");
    expect(prismaMock.journalEntry.update).not.toHaveBeenCalled();
  });
});

describe("Delete Entry", () => {
  let token: string;
  const journalId = uuidv4();

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

  it("should delete a journal entry successfully and return a success message", async () => {
    (prismaMock.journalEntry.deleteMany as jest.Mock).mockResolvedValue({
      count: 1,
    });

    const response = await request(app)
      .delete(`/api/v1/journal/delete-entry/${journalId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(prismaMock.journalEntry.deleteMany).toHaveBeenCalled();
    expect(response.body).toMatchObject({ message: "Entry deleted" });
  });

  it("should return 404 if the journal entry does not exist", async () => {
    (prismaMock.journalEntry.deleteMany as jest.Mock).mockResolvedValue({
      count: 0,
    });

    const response = await request(app)
      .delete(`/api/v1/journal/delete-entry/${journalId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);

    expect(response.body).toHaveProperty("message", "Entry not found");
    expect(prismaMock.journalEntry.deleteMany).toHaveBeenCalled();
  });

  it("should handle errors gracefully during journal entry deletion", async () => {
    const errorMessage = "Database error occurred";
    (prismaMock.journalEntry.deleteMany as jest.Mock).mockRejectedValue(
      new Error(errorMessage)
    );

    const response = await request(app)
      .delete(`/api/v1/journal/delete-entry/${journalId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(500); 

    expect(response.body).toHaveProperty("message", "Database error occurred");
    expect(prismaMock.journalEntry.deleteMany).toHaveBeenCalled();
  });

  it("should reject delete if the user is not authorized", async () => {
    const response = await request(app)
      .delete(`/api/v1/journal/delete-entry/${journalId}`)
      .expect(401);

    expect(response.body).toHaveProperty("message", "Unauthorized");
    expect(prismaMock.journalEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("should reject delete if the token is invalid", async () => {
    const invalidToken = "invalid-token";

    const response = await request(app)
      .delete(`/api/v1/journal/delete-entry/${journalId}`)
      .set("Authorization", `Bearer ${invalidToken}`)
      .expect(403);

    expect(response.body).toHaveProperty("message", "Invalid token");
    expect(prismaMock.journalEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("should reject delete if the journal ID is missing", async () => {
    const response = await request(app)
      .delete(`/api/v1/journal/delete-entry/`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
    expect(prismaMock.journalEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("should handle missing token", async () => {
    const response = await request(app)
      .delete(`/api/v1/journal/delete-entry/${journalId}`)
      .expect(401);

    expect(response.body).toHaveProperty("message", "Unauthorized");
    expect(prismaMock.journalEntry.deleteMany).not.toHaveBeenCalled();
  });
});

describe("Get Journal Entries", () => {
  let token: string;
  const journalEntries = [
    {
      id: uuidv4(),
      title: "Journal 1",
      content: "Content 1",
      userId: mockUser.userId,
      createdAt: "2025-04-07T17:39:18.702Z", 
      updatedAt: "2025-04-07T17:39:18.702Z", 
      categories: [{ category: { name: "Category1" } }],
      tags: [{ tag: { name: "Tag1" } }],
    },
    {
      id: uuidv4(),
      title: "Journal 2",
      content: "Content 2",
      userId: mockUser.userId,
      createdAt: "2025-04-07T17:39:18.702Z", 
      updatedAt: "2025-04-07T17:39:18.702Z", 
      categories: [{ category: { name: "Category2" } }],
      tags: [{ tag: { name: "Tag2" } }],
    },
  ];

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

  it("should fetch journal entries successfully with pagination", async () => {
    
    (prismaMock.journalEntry.findMany as jest.Mock).mockResolvedValue(
      journalEntries
    );

    const response = await request(app)
      .get("/api/v1/journal/list-entries")
      .set("Authorization", `Bearer ${token}`)
      .query({ page: 1, limit: 2 })
      .expect(200);

    expect(prismaMock.journalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: mockUser.userId },
        skip: 0,
        take: 2,
      })
    );
    expect(response.body).toHaveLength(2);
    expect(response.body[0]).toMatchObject(journalEntries[0]);
    expect(response.body[1]).toMatchObject(journalEntries[1]);
  });

  it("should return empty array if no journal entries are found", async () => {
    (prismaMock.journalEntry.findMany as jest.Mock).mockResolvedValue([]);

    const response = await request(app)
      .get("/api/v1/journal/list-entries")
      .set("Authorization", `Bearer ${token}`)
      .query({ page: 1, limit: 10 })
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it("should handle pagination properly (default page and limit)", async () => {
    (prismaMock.journalEntry.findMany as jest.Mock).mockResolvedValue(
      journalEntries
    );

    const response = await request(app)
      .get("/api/v1/journal/list-entries")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(prismaMock.journalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: mockUser.userId },
        skip: 0,
        take: 10,
      })
    );
    expect(response.body).toHaveLength(2);
  });

  it("should handle errors gracefully if Prisma throws an error", async () => {
    const errorMessage = "Database error occurred";
    (prismaMock.journalEntry.findMany as jest.Mock).mockRejectedValue(
      new Error(errorMessage)
    );

    const response = await request(app)
      .get("/api/v1/journal/list-entries")
      .set("Authorization", `Bearer ${token}`)
      .query({ page: 1, limit: 10 })
      .expect(500); 

    expect(response.body).toHaveProperty("message", "Database error occurred");
  });

  it("should reject request if no token is provided", async () => {
    const response = await request(app)
      .get("/api/v1/journal/list-entries")
      .expect(401);

    expect(response.body).toHaveProperty("message", "Unauthorized");
  });

  it("should reject request if invalid token is provided", async () => {
    const invalidToken = "invalid-token";

    const response = await request(app)
      .get("/api/v1/journal/list-entries")
      .set("Authorization", `Bearer ${invalidToken}`)
      .expect(403);

    expect(response.body).toHaveProperty("message", "Invalid token");
  });
});

describe("Get Journal Entry", () => {
  let token: string;
  const journalEntry = {
    id: uuidv4(),
    title: "Test Journal",
    content: "Test Content",
    userId: mockUser.userId,
    createdAt: "2025-04-07T17:39:18.702Z",
    updatedAt: "2025-04-07T17:39:18.702Z",
    categories: [{ category: { name: "Category1" } }],
    tags: [{ tag: { name: "Tag1" } }],
  };

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

  it("should fetch a journal entry successfully if found", async () => {
    (prismaMock.journalEntry.findUnique as jest.Mock).mockResolvedValue(
      journalEntry
    );

    const response = await request(app)
      .get(`/api/v1/journal/view-entry/${journalEntry.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(prismaMock.journalEntry.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: journalEntry.id, userId: mockUser.userId },
      })
    );
    expect(response.body).toMatchObject(journalEntry);
  });

  it("should return 404 if journal entry is not found", async () => {
    (prismaMock.journalEntry.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await request(app)
      .get(`/api/v1/journal/view-entry/${uuidv4()}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(404);

    expect(response.body).toHaveProperty("message", "Entry not found");
  });

  it("should return 400 if journalId is invalid", async () => {
    const invalidJournalId = "invalid-id";

    const response = await request(app)
      .get(`/api/v1/journal/view-entry/${invalidJournalId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);

    expect(response.body).toHaveProperty("message", "Invalid journal ID");
  });

  it("should return 401 if no token is provided", async () => {
    const response = await request(app)
      .get(`/api/v1/journal/view-entry/${journalEntry.id}`)
      .expect(401);

    expect(response.body).toHaveProperty("message", "Unauthorized");
  });

  it("should return 403 if the token is invalid", async () => {
    const invalidToken = "invalid-token";

    const response = await request(app)
      .get(`/api/v1/journal/view-entry/${journalEntry.id}`)
      .set("Authorization", `Bearer ${invalidToken}`)
      .expect(403);

    expect(response.body).toHaveProperty("message", "Invalid token");
  });

  it("should handle errors gracefully if Prisma throws an error", async () => {
    const errorMessage = "Database error occurred";
    (prismaMock.journalEntry.findUnique as jest.Mock).mockRejectedValue(
      new Error(errorMessage)
    );

    const response = await request(app)
      .get(`/api/v1/journal/view-entry/${journalEntry.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(500); 

    expect(response.body).toHaveProperty("message", "Database error occurred");
  });
});
