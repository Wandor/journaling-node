import request from "supertest";
import app from "../../app";
import { prismaMock } from "../../../prisma/singleton";
import redisClient from "../../configs/redis";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { UserRole } from "@prisma/client";
import * as amqp from "amqplib/callback_api";
import { EventEmitter } from "events";
import { mockUser } from "../util";

let amqpConnection: amqp.Connection;

jest.mock("../../services/functions.ts");

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

const limit = 10;
const page = 1;

describe("Get Categories", () => {
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

  it("should return a list of categories for a user", async () => {
    const mockCategories = [{ id: 1, name: "Category 1" }];
    (prismaMock.category.findMany as jest.Mock).mockResolvedValue(
      mockCategories
    );

    const response = await request(app)
      .get("/api/v1/journal/list-categories")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(prismaMock.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: mockUser.userId },
        orderBy: { name: "asc" },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      })
    );
    expect(response.status).toBe(200);
  });
});

describe("Create Journal Category", () => {
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

  it("should create a new category", async () => {
    const categoryName = "New Category";
    const mockCategory = { id: uuidv4(), name: categoryName };
    (prismaMock.category.findUnique as jest.Mock).mockResolvedValue(null);

    (prismaMock.category.create as jest.Mock).mockResolvedValue(mockCategory);

    const response = await request(app)
      .post("/api/v1/journal/create-category")
      .set("Authorization", `Bearer ${token}`)
      .send({ categoryName })
      .expect(201);

    expect(prismaMock.category.findUnique).toHaveBeenCalledWith({
      where: {
        name_userId: {
          name: categoryName.toLowerCase(),
          userId: mockUser.userId as any,
        },
      },
    });

    expect(prismaMock.category.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: categoryName.toLowerCase(),
        }),
      })
    );

    expect(response.body).toMatchObject({
      message: "Category created!",
      category: mockCategory,
    });
  });

  it("should return 409 if category already exists", async () => {
    const categoryName = "Existing Category";
    (prismaMock.category.findUnique as jest.Mock).mockResolvedValue({
      id: 1,
      name: categoryName,
    });

    const response = await request(app)
      .post("/api/v1/journal/create-category")
      .set("Authorization", `Bearer ${token}`)
      .send({ categoryName })
      .expect(409);

    expect(response.body).toMatchObject({ message: "Category exists!" });
    expect(prismaMock.category.create).not.toHaveBeenCalled();
  });
});

describe("Update Journal Category", () => {
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

  it("should update the category", async () => {
    const categoryName = "Updated Category";
    const mockCategory = { id: uuidv4(), name: categoryName };

    (prismaMock.category.update as jest.Mock).mockResolvedValue(mockCategory);

    const response = await request(app)
      .put(`/api/v1/journal/update-category/${mockCategory.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ categoryName })
      .expect(200);

    expect(prismaMock.category.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockCategory.id as any },
        data: expect.objectContaining({
          name: categoryName.toLowerCase(),
        }),
      })
    );

    expect(response.body).toMatchObject({
      message: "Category updated!",
    });
  });
});

describe("Delete Journal Category", () => {
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

  it("should delete the category", async () => {
    const id = uuidv4();
    (prismaMock.journalEntryCategory.findFirst as jest.Mock).mockResolvedValue(
      null
    );
    (prismaMock.category.delete as jest.Mock).mockResolvedValue({ id });

    const response = await request(app)
      .del(`/api/v1/journal/delete-category/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(prismaMock.journalEntryCategory.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { categoryId: id },
      })
    );

    expect(prismaMock.category.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id },
      })
    );

    expect(response.body).toMatchObject({
      message: "Category deleted!",
    });
  });

  it("should return 400 if the category is used in a journal entry", async () => {
    const id = uuidv4();
    (prismaMock.journalEntryCategory.findFirst as jest.Mock).mockResolvedValue({
      id,
    });

    const response = await request(app)
      .del(`/api/v1/journal/delete-category/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);

    expect(prismaMock.journalEntryCategory.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { categoryId: id },
      })
    );

    expect(prismaMock.category.delete).not.toHaveBeenCalled();

    expect(response.body).toMatchObject({
      message: "Category cannot be deleted as it is used in a journal entry.",
    });
  });
});
