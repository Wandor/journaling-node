import { NextFunction, Request, Response } from "express";
import prisma from "../../prisma";
import { detectThemes } from "../services/openAi";
import {
  getOverallMoodPerDay,
  getWeek,
} from "../services/functions";
import { TimeOfDay } from "@prisma/client";

export const getJournalSummary = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { userId } = (req as any).user;

    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : new Date(new Date().getFullYear(), 0, 1);
    const endDate = req.query.endDate
      ? new Date(req.query.endDate as string)
      : new Date();

    const totalEntries = await prisma.journalEntry.count({
      where: {
        userId: userId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    if(totalEntries === 0) return res.status(404).json({ message: 'No entries found'})

    const analytics = await prisma.analyticsData.findMany({
      where: {
        journal: { userId },
        entryDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: { journal: true },
      orderBy: { entryDate: "asc" },
    });

    const sentimentData = await prisma.sentimentScore.findMany({
      where: {
        journal: { userId },
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const avgWordCount = totalEntries
    ? analytics.reduce((sum, entry) => sum + entry.wordCount, 0) / totalEntries
    : 0;

    const totalWordsPerYear = analytics.reduce((acc, entry) => {
      const year = entry.entryDate.getFullYear();
      acc[year] = (acc[year] || 0) + entry.wordCount;
      return acc;
    }, {} as Record<number, number>);

    const totalWordsPerWeek = analytics.reduce((acc, entry) => {
      const week = getWeek(entry.entryDate);
      acc[week] = (acc[week] || 0) + entry.wordCount;
      return acc;
    }, {} as Record<number, number>);

    const distinctDaysJournaled = new Set(
      analytics.map((entry) => entry.entryDate.toISOString().split("T")[0])
    ).size;

    const totalEntriesPerYear = analytics.reduce((acc, entry) => {
      const year = entry.entryDate.getFullYear();
      acc[year] = (acc[year] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const totalEntriesPerWeek = analytics.reduce((acc, entry) => {
      const week = getWeek(entry.entryDate);
      acc[week] = (acc[week] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const wordCountTrends = analytics.reduce((acc, entry) => {
      const entryDate = entry.entryDate.toISOString().split("T")[0];
      if (!acc[entryDate]) {
        acc[entryDate] = 0;
      }
      acc[entryDate] += entry.wordCount;
      return acc;
    }, {} as Record<string, number>);

    const wordCountTrendsArray = Object.keys(wordCountTrends).map((date) => ({
      date,
      wordCount: wordCountTrends[date],
    }));

    const moodSummary = sentimentData.reduce(
      (summary, sentiment) => {
        summary.totalScore += sentiment.score;
        if (sentiment.score > summary.maxScore) {
          summary.maxScore = sentiment.score;
          summary.maxMood = sentiment.mood;
        }
        if (sentiment.score < summary.minScore) {
          summary.minScore = sentiment.score;
          summary.minMood = sentiment.mood;
        }
        return summary;
      },
      {
        totalScore: 0,
        maxScore: -Infinity,
        minScore: Infinity,
        maxMood: "",
        minMood: "",
      }
    );

    const categoryDistribution = await prisma.journalEntryCategory.groupBy({
      by: ["categoryId"],
      where: {
        journalEntry: {
          entryDate: {
            gte: startDate,
            lte: endDate,
          },
          userId,
        },
      },
      _count: { categoryId: true },
    });

    const categoryIds = categoryDistribution.map((group) => group.categoryId);
    const categories = await prisma.category.findMany({
      where: {
        id: { in: categoryIds },
      },
      select: {
        id: true,
        name: true,
      },
    });
    const categoryDistributionWithNames = categoryDistribution.map((group) => {
      const category = categories.find((cat) => cat.id === group.categoryId);
      return {
        categoryId: group.categoryId,
        categoryName: category ? category.name : "Unknown",
        count: group._count.categoryId,
      };
    });

    const moodTrends = sentimentData.map((sentiment) => ({
      date: sentiment.createdAt.toISOString().split("T")[0],
      mood: sentiment.mood,
      score: sentiment.score,
    }));

    const overallMoodPerDay = getOverallMoodPerDay(moodTrends);

    const groupedEntries: { [key: string]: number } = {};

    const mostUsedCategory = categoryDistribution.sort(
      (a, b) => b._count.categoryId - a._count.categoryId
    )[0];

    const category = mostUsedCategory
      ? await prisma.category.findUnique({
          where: {
            id: mostUsedCategory.categoryId,
          },
        })
      : null;

    analytics.forEach((entry) => {
      const entryDate = entry.entryDate.toISOString().split("T")[0];
      groupedEntries[entryDate] = (groupedEntries[entryDate] || 0) + 1;
    });

    const heatmapData = Object.keys(groupedEntries).map((date) => ({
      date,
      count: groupedEntries[date],
    }));

    const summary = {
      totalEntries,
      avgWordCount,
      mostUsedCategory: category ? category.name : "No category found",
      wordCountTrends: wordCountTrendsArray,
      categoryDistribution: categoryDistributionWithNames,
      timeOfDayAnalysis: analytics.reduce(
        (acc, entry) => {
          acc[entry.timeOfDay as TimeOfDay] =
            (acc[entry.timeOfDay as TimeOfDay] || 0) + 1;
          return acc;
        },
        {
          [TimeOfDay.MORNING]: 0,
          [TimeOfDay.AFTERNOON]: 0,
          [TimeOfDay.EVENING]: 0,
        } as Record<TimeOfDay, number>
      ),

      moodTrends: sentimentData.map((sentiment) => ({
        date: sentiment.createdAt,
        mood: sentiment.mood,
        score: sentiment.score,
      })),
      overallMoodPerDay,
      totalEntriesPerYear,
      totalEntriesPerWeek,
      totalWordsPerYear,
      totalWordsPerWeek,
      distinctDaysJournaled,
      heatmapData,
      moodSummary
    };

    return res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
};

export const getSentimentExtremes = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { userId } = (req as any).user;
    const { startDate, endDate } = req.query;

    const sentimentData = await prisma.sentimentScore.findMany({
      where: {
        journal: { userId },
        createdAt: {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string),
        },
      },
      include: { journal: true },
    });

    const mostPositive = sentimentData.reduce((prev, current) =>
      current.score > prev.score ? current : prev
    );
    const mostNegative = sentimentData.reduce((prev, current) =>
      current.score < prev.score ? current : prev
    );

    return res.status(200).json({
      mostPositive: {
        journalId: mostPositive.journalId,
        mood: mostPositive.mood,
        score: mostPositive.score,
        content: mostPositive.journal.content,
      },
      mostNegative: {
        journalId: mostNegative.journalId,
        mood: mostNegative.mood,
        score: mostNegative.score,
        content: mostNegative.journal.content,
      },
    });
  } catch (error) {
    next(error);
  }
};


  
