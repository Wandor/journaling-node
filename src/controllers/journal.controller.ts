import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Create a journal entry
export const createEntry = async (req: Request, res: Response) => {
  try {
    const { title, content, category } = req.body;
    const userId = (req as any).user.userId;

    const entry = await prisma.journalEntry.create({
        data: { title, content, category,  user: { connect: { id: userId } } },
      });

    res.status(201).json(entry);
  } catch (error) {
    res.status(500).json({ message: "Error creating entry" });
  }
};

// Get all journal entries
export const getEntries = async (req: Request, res: Response) => {
  try {
    const entries = await prisma.journalEntry.findMany({ where: { userId: (req as any).user.userId } });
    res.json(entries);
  } catch (error) {
    res.status(500).json({ message: "Error fetching entries" });
  }
};
