import { NextFunction, Request, Response } from "express";
import prisma from "../../prisma";
import {
  categorySchema,
  createJournalEntrySchema,
  tagSchema,
} from "../validators/journalValidator";
import { publishToqueue } from "../services/functions";
import { validate as isUUID } from "uuid";

export const getCategories = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { userId } = (req as any).user;
    const { page = 1, limit = 10 } = req.query;

    const categories = await prisma.category.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });

    return res.status(200).json(categories);
  } catch (error) {
    next(error);
  }
};

export const createJournalCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const parsedData = categorySchema.parse(req.body);
    const { categoryName } = parsedData;

    const { userId } = (req as any).user;

    const existingCategory = await prisma.category.findUnique({
      where: {
        name_userId: {
          name: categoryName.toLowerCase(),
          userId: userId,
        },
      },
    });

    if (existingCategory)
      return res.status(409).json({ message: "Category exists!" });

    const category = await prisma.category.create({
      data: {
        name: categoryName.toLowerCase(),
        userId,
      },
    });

    return res.status(201).json({ message: "Category created!", category });
  } catch (error) {
    next(error);
  }
};

export const updateJournalCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const parsedData = categorySchema.parse(req.body);
    const { categoryName } = parsedData;
    const { userId, categoryId } = {
      ...req.body,
      ...req.params,
      ...(req as any).user,
    };

    await prisma.category.update({
      where: {
        id: categoryId,
      },
      data: {
        name: categoryName.toLowerCase(),
      },
    });

    return res.status(200).json({ message: "Category updated!" });
  } catch (error) {
    next(error);
  }
};

export const deleteJournalCategory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { userId, categoryId } = {
      ...req.body,
      ...req.params,
      ...(req as any).user,
    };

    const categoryUsage = await prisma.journalEntryCategory.findFirst({
      where: { categoryId },
    });

    if (categoryUsage) {
      return res.status(400).json({
        message: "Category cannot be deleted as it is used in a journal entry.",
      });
    }

    await prisma.category.delete({
      where: {
        id: categoryId,
      },
    });

    return res.status(200).json({ message: "Category deleted!" });
  } catch (error) {
    next(error);
  }
};

export const getTags = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { userId } = (req as any).user;
    const { page = 1, limit = 10 } = req.query;

    const tags = await prisma.tag.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
    });

    return res.status(200).json(tags);
  } catch (error) {
    next(error);
  }
};

export const createJournalTag = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const parsedData = tagSchema.parse(req.body);
    const { tagName } = parsedData;

    const { userId } = (req as any).user;

    const existingTag = await prisma.tag.findUnique({
      where: {
        name_userId: {
          name: tagName.toLowerCase(),
          userId: userId,
        },
      },
    });

    if (existingTag) return res.status(409).json({ message: "Tag exists!" });

    const tag = await prisma.tag.create({
      data: {
        name: tagName.toLowerCase(),
        userId,
      },
    });

    return res.status(201).json({ message: "Tag created!", tag });
  } catch (error) {
    next(error);
  }
};

export const updateJournalTag = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const parsedData = tagSchema.parse(req.body);
    const { tagName } = parsedData;
    const { userId, tagId } = {
      ...req.body,
      ...req.params,
      ...(req as any).user,
    };

    await prisma.tag.update({
      where: {
        id: tagId,
      },
      data: {
        name: tagName.toLowerCase(),
      },
    });

    return res.status(200).json({ message: "Tag updated!" });
  } catch (error) {
    next(error);
  }
};

export const deleteJournalTag = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { userId, tagId } = {
      ...req.body,
      ...req.params,
      ...(req as any).user,
    };

    const tagUsage = await prisma.journalEntryTag.findFirst({
      where: { tagId },
    });

    if (tagUsage) {
      return res.status(400).json({
        message: "Tag cannot be deleted as it is used in a journal entry.",
      });
    }

    await prisma.tag.delete({
      where: {
        id: tagId,
      },
    });

    return res.status(200).json({ message: "Tag deleted!" });
  } catch (error) {
    next(error);
  }
};

export const createEntry = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const parsedData = createJournalEntrySchema.parse(req.body);
    let { title = "", content, tags = [], categories = [] } = parsedData;
    const { userId } = (req as any).user;

    const journal = await prisma.journalEntry.create({
      data: {
        title: title as string,
        content,
        userId,
        entryDate: new Date(),
        tags: {
          create: tags.map((tag) => ({
            tag: {
              connectOrCreate: {
                where: { name_userId: { name: tag.toLowerCase(), userId } },
                create: { name: tag.toLowerCase(), userId },
              },
            },
          })),
        },
        categories: {
          create: categories.map((category) => ({
            category: {
              connectOrCreate: {
                where: {
                  name_userId: { name: category.toLowerCase(), userId },
                },
                create: { name: category.toLowerCase(), userId },
              },
            },
          })),
        },
      },
      include: {
        tags: true,
        categories: true,
      },
    });

    publishToqueue("", "entry_queue", Buffer.from(JSON.stringify(journal)));

    return res.status(201).json({ message: "Entry created!", journal });
  } catch (error) {
    next(error);
  }
};

export const updateEntry = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const {
      title,
      content,
      tags = [],
      categories = [],
      journalId,
    } = { ...req.body, ...req.params, ...(req as any).user };

    if (!isUUID(journalId)) {
      return res.status(400).json({ message: "Invalid journal ID" });
    }

    const { userId } = (req as any).user;

    const journal = await prisma.journalEntry.update({
      where: { id: journalId },
      data: {
        title,
        content,
        tags: {
          deleteMany: {
            journalEntryId: journalId,
          },
          create: tags?.map((tag: any) => ({
            tag: {
              connectOrCreate: {
                where: { name_userId: { name: tag.toLowerCase(), userId } },
                create: { name: tag.toLowerCase(), userId },
              },
            },
          })),
        },
        categories: {
          deleteMany: {
            journalEntryId: journalId,
          },
          create: categories?.map((category: any) => ({
            category: {
              connectOrCreate: {
                where: {
                  name_userId: { name: category.toLowerCase(), userId },
                },
                create: { name: category.toLowerCase(), userId },
              },
            },
          })),
        },
      },
      include: {
        tags: true,
        categories: true,
      },
    });

    publishToqueue("", "entry_queue", Buffer.from(JSON.stringify(journal)));

    return res
      .status(200)
      .json({ message: "Journal updated successfully", journal });
  } catch (error) {
    next(error);
  }
};

export const deleteEntry = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { journalId } = { ...(req as any).user, ...req.params };

    if (!isUUID(journalId)) {
      return res.status(400).json({ message: "Invalid journal ID" });
    }
    const deleted = await prisma.journalEntry.deleteMany({
      where: { id: journalId },
    });

    if (!deleted.count)
      return res.status(404).json({ message: "Entry not found" });

    return res.status(200).json({ message: "Entry deleted" });
  } catch (error) {
    next(error);
  }
};

export const getJournalEntries = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { userId } = (req as any).user;
    const { page = 1, limit = 10 } = req.query;

    const journals = await prisma.journalEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      include: {
        categories: {
          include: { category: true },
        },
        tags: {
          include: { tag: true },
        },
      },
    });

    return res.status(200).json(journals);
  } catch (error) {
    next(error);
  }
};

export const getJournalEntry = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { userId, journalId } = { ...(req as any).user, ...req.params };

    if (!isUUID(journalId)) {
      return res.status(400).json({ message: "Invalid journal ID" });
    }
    const journal = await prisma.journalEntry.findUnique({
      where: { id: journalId, userId },
      include: {
        categories: {
          include: { category: true },
        },
        tags: {
          include: { tag: true },
        },
      },
    });

    if (!journal) return res.status(404).json({ message: "Entry not found" });

    res.status(200).json(journal);
  } catch (error) {
    next(error);
  }
};
