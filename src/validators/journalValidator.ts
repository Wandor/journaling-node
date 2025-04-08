import { z } from "zod";

export const createJournalEntrySchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(255).optional(),
  content: z.string().min(10, "Content must be at least 10 characters"),
  entryDate: z.coerce.date(),
  tags: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
});


export const categorySchema = z.object({
  categoryName: z.string().min(1, 'Category name is required').max(255, 'Category name is too long'),
});

export const tagSchema = z.object({
  tagName: z.string().min(1, 'Tag name is required').max(255, 'Category name is too long'),
});