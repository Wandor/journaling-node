import { Mood, TimeOfDay } from "@prisma/client";
import prisma from "../../prisma";
import logger from "../configs/logger";

const queue = require("../configs/queueing");

export const addMinutes = (date: Date, minutes: number): string =>
  new Date(date.getTime() + minutes * 60000).toString();

export const checkAndDeactivateExpiredPasswords = async (): Promise<void> => {
  try {
    const now = new Date();

    const { count } = await prisma.password.updateMany({
      where: {
        passwordExpiry: { lte: now },
        isActive: true,
      },
      data: { isActive: false },
    });

    logger.info(`Deactivated ${count} users due to expired passwords.`);
  } catch (error) {
    logger.error(error);
  }
};

export const isFutureDate = (savedDate: Date): boolean => {
  return savedDate > new Date();
};

export const isStopWord = (word: string): boolean => {
  const stopWords = [
    "the",
    "is",
    "at",
    "of",
    "and",
    "a",
    "in",
    "to",
    "for",
    "on",
    "with",
    "by",
    "an",
    "this",
    "that",
    "it",
    "he",
    "she",
    "we",
    "you",
    "they",
    "or",
    "so",
  ];

  return stopWords.includes(word.toLowerCase());
};

export const publishToqueue = (key: string, route: string, content: Buffer) => {
  queue.publish(key, route, content);
};


export const determineMood = (sentiment: any): string => {
  if (sentiment.score > 0) {
    return Mood.POSITIVE;
  } else if (sentiment.score < 0) {
    return Mood.NEGATIVE;
  } else {
    return Mood.NEUTRAL;
  }
};

export const determineTimeOfDay = (date: Date) => {
  const hour = new Date(date).getHours();
  if (hour >= 5 && hour < 12) return TimeOfDay.MORNING;
  if (hour >= 12 && hour < 18) return TimeOfDay.AFTERNOON;
  return TimeOfDay.EVENING;
};

export const calculateAnalytics = (content: string) => {
  const wordCount = content.split(/\s+/).length;
  const characterCount = content.length;
  const sentenceCount = content.split(/[.!?]+/).filter(Boolean).length;
  const readingTime = Math.floor(wordCount / 200);
  const averageSentenceLength =
    sentenceCount > 0 ? wordCount / sentenceCount : 0;

  return {
    characterCount,
    wordCount,
    sentenceCount,
    readingTime,
    averageSentenceLength,
  };
};

export const formatDate = (date: string) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
};

export const getWeek = (date: Date): number => {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const week = Math.floor(diff / (7 * oneDay));
  return week + 1;
};

export const getOverallMoodPerDay = (moodTrends: { date: string; score: number }[]): Record<string, string> => {
  const moodsPerDay: Record<string, { totalScore: number; count: number }> = {};

  moodTrends.forEach((entry) => {
    const date = entry.date.split('T')[0]; 
    if (!moodsPerDay[date]) {
      moodsPerDay[date] = { totalScore: 0, count: 0 };
    }
    moodsPerDay[date].totalScore += entry.score;
    moodsPerDay[date].count += 1;
  });

  const overallMoodPerDay: Record<string, string> = {};
  Object.keys(moodsPerDay).forEach((date) => {
    const { totalScore, count } = moodsPerDay[date];
    const averageScore = totalScore / count;

    if (averageScore >= 7) {
      overallMoodPerDay[date] = Mood.POSITIVE;
    } else if (averageScore >= 4) {
      overallMoodPerDay[date] = Mood.NEUTRAL;
    } else {
      overallMoodPerDay[date] = Mood.NEGATIVE;
    }
  });

  return overallMoodPerDay;
};
