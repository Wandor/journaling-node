import { Message } from "amqplib";
import Sentiment from "sentiment";
import {
  analyzeSentimentOpenAi,
  generateTags,
  entryAnalysis,
  summarizeEntry,
} from "./openAi";
import prisma from "../../prisma";
import {
  calculateAnalytics,
  determineMood,
  determineTimeOfDay,
} from "./functions";
import logger from "../configs/logger";

const sentiment = new Sentiment();

class Workers {
  static async journalEntryWorker(
    msg: Message,
    callback: (ok: boolean) => void
  ): Promise<void> {
    const json = msg.content.toString();
    const data = JSON.parse(json);

    const { content, id, title, userId, entryDate } = data;

    try {
      const userPreferences = await prisma.userPreferences.findUnique({
        where: { userId },
        select: {
          autoCategorize: true,
          autoTag: true,
          summarize: true,
        },
      });

      const {
        autoCategorize = false,
        autoTag = false,
        summarize = false,
      } = userPreferences || {};

      const sentimentAnalysis =
        process.env.SENTIMENT_ANALYSIS === "sentiment"
          ? sentiment.analyze(content)
          : await analyzeSentimentOpenAi(content);

      const { score, comparative, positive, negative, calculation } =
        sentimentAnalysis;
      const mood = determineMood(sentimentAnalysis);

      await prisma.sentimentScore.create({
        data: {
          journalId: id,
          score,
          magnitude: comparative,
          mood,
          calculation: calculation,
          positiveWords: positive.join(","),
          negativeWords: negative.join(","),
        },
      });

      const analysis = await entryAnalysis(content);

      const { title: analysisTitle, summary, categories, tags } = analysis;

      const updateData: any = {
        title: title === "" || title === null ? analysisTitle : title,
      };

      if (summarize) {
        updateData.summary = summary;
      }
      const existingJournalEntry = await prisma.journalEntry.findUnique({
        where: { id },
        include: {
          tags: true,
          categories: true,
        },
      });

      const existingTags = existingJournalEntry?.tags || [];
      const existingCategories = existingJournalEntry?.categories || [];

      // Only autoTag if there are no existing tags
      if (autoTag && existingTags.length === 0) {
        updateData.tags = {
          create: tags?.map((tag: any) => ({
            tag: {
              connectOrCreate: {
                where: { name_userId: { name: tag.toLowerCase(), userId } },
                create: { name: tag.toLowerCase(), userId },
              },
            },
          })),
        };
      }

      // Only autoCategorize if there are no existing categories
      if (autoCategorize && existingCategories.length === 0) {
        updateData.categories = {
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
        };
      }

      await prisma.journalEntry.update({
        where: { id },
        data: updateData,
        include: {
          tags: true,
          categories: true,
        },
      });

      const analyticsData = calculateAnalytics(content);
      const timeOfDay = determineTimeOfDay(entryDate);

      const {
        wordCount,
        characterCount,
        sentenceCount,
        readingTime,
        averageSentenceLength,
      } = analyticsData;

      await prisma.analyticsData.upsert({
        where: {
          journalId: id,
        },
        update: {
          wordCount,
          characterCount,
          sentenceCount,
          readingTime,
          averageSentenceLength,
          tagsCount: existingTags.length || tags.length,
          categoriesCount: existingCategories.length || categories.length,
          timeOfDay,
          entryDate,
        },
        create: {
          journalId: id,
          wordCount,
          characterCount,
          sentenceCount,
          readingTime,
          averageSentenceLength,
          tagsCount: existingTags.length || tags.length,
          categoriesCount: existingCategories.length || categories.length,
          timeOfDay,
          entryDate,
        },
      });
      
    } catch (error) {

      logger.error(error);
    }

    callback(true);
  }
}

export default Workers;
