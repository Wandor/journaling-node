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
const limit = 10;
const page = 1;

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

describe("Get tags", () => {
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

  it("should return a list of tags for a user", async () => {
    const mockTags = [{ id: uuidv4(), name: "Tag 1", userId: mockUser.userId }];
    (prismaMock.tag.findMany as jest.Mock).mockResolvedValue(mockTags);

    const response = await request(app)
      .get("/api/v1/journal/list-tags")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(prismaMock.tag.findMany).toHaveBeenCalledWith(
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

describe("Create Journal Tag", () => {
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

  it("should create a new tag", async () => {
    const tagName = "New tag";
    const mockTag = { id: uuidv4(), name: tagName, userId: mockUser.userId };
    (prismaMock.tag.findUnique as jest.Mock).mockResolvedValue(null);

    (prismaMock.tag.create as jest.Mock).mockResolvedValue(mockTag);

    const response = await request(app)
      .post("/api/v1/journal/create-tag")
      .set("Authorization", `Bearer ${token}`)
      .send({ tagName })
      .expect(201);

    expect(prismaMock.tag.findUnique).toHaveBeenCalledWith({
      where: {
        name_userId: { name: tagName.toLowerCase(), userId: mockUser.userId as any },
      },
    });

    expect(prismaMock.tag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: tagName.toLowerCase(),
        }),
      })
    );

    expect(response.body).toMatchObject({
      message: "Tag created!",
      tag: mockTag,
    });
  });

  it("should return 409 if tag already exists", async () => {
    const tagName = "Existing Tag";
    (prismaMock.tag.findUnique as jest.Mock).mockResolvedValue({
      id: uuidv4(),
      name: tagName,
    });

    const response = await request(app)
      .post("/api/v1/journal/create-tag")
      .set("Authorization", `Bearer ${token}`)
      .send({ tagName })
      .expect(409);

    expect(response.body).toMatchObject({ message: "Tag exists!" });
    expect(prismaMock.tag.create).not.toHaveBeenCalled();
  });
});

describe("Update Journal Tag", () => {
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

  it("should update the tag", async () => {
    const tagName = "Updated Tag";
    const mockTag = { id: uuidv4(), name: tagName };

    (prismaMock.tag.update as jest.Mock).mockResolvedValue(mockTag);

    const response = await request(app)
      .put(`/api/v1/journal/update-tag/${mockTag.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ tagName })
      .expect(200);

    expect(prismaMock.tag.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockTag.id as any },
        data: expect.objectContaining({
          name: tagName.toLowerCase(),
        }),
      })
    );

    expect(response.body).toMatchObject({
      message: "Tag updated!",
    });
  });
});

describe("Delete Journal Tag", () => {
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
  });

  it("should delete the tag", async () => {
    const id = uuidv4();
    (prismaMock.journalEntryTag.findFirst as jest.Mock).mockResolvedValue(null);
    (prismaMock.tag.delete as jest.Mock).mockResolvedValue({ id });

    const response = await request(app)
      .del(`/api/v1/journal/delete-tag/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(prismaMock.journalEntryTag.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tagId: id },
      })
    );

    expect(prismaMock.tag.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id },
      })
    );

    expect(response.body).toMatchObject({
      message: "Tag deleted!",
    });
  });

  it("should return 400 if the tag is used in a journal entry", async () => {
    const id = uuidv4();
    (prismaMock.journalEntryTag.findFirst as jest.Mock).mockResolvedValue({
      id,
    });

    const response = await request(app)
      .del(`/api/v1/journal/delete-tag/${id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);

    expect(prismaMock.journalEntryTag.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tagId: id },
      })
    );

    expect(prismaMock.tag.delete).not.toHaveBeenCalled();

    expect(response.body).toMatchObject({
      message: "Tag cannot be deleted as it is used in a journal entry.",
    });
  });
});
