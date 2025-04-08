import OpenAI from "openai";

import nlp from "compromise";
import logger from "../configs/logger";
import { isStopWord } from "./functions";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const analyzeSentimentOpenAi = async (text: string) => {
  try {
    const prompt = `Analyze the sentiment of the following text and return a JSON object with the following fields:
    - "score" (a number between -1 and 1 representing the sentiment, where -1 is negative and 1 is positive).
    - "magnitude" (a number representing the strength of the sentiment).
    - "emotion" (e.g., Happy, Sad, Neutral, Angry, etc.)
    
    Text: "${text}"`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an assistant that performs sentiment analysis.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 100,
    });

    const content =
      typeof response.choices[0].message.content === "string"
        ? response.choices[0].message.content
        : JSON.stringify(response.choices[0].message.content);

    return JSON.parse(content);
  } catch (error) {
    logger.error(error);
    return { score: 0, magnitude: 0, emotion: "Neutral" };
  }
};

export const entryAnalysis = async (
  text: string
): Promise<{
  title: string;
  categories: string[];
  tags: string[];
  summary: string;
}> => {
  try {
    const prompt = `Analyze the following journal entry and suggest a short descriptive title, a summary of the content, categories (Personal, Work, Travel, Health, Relationships, Miscellaneous), and relevant tags. Output the result in the following JSON format:\n\n{
  "title": "title",
  "summary": "summary",
  "categories": ["category1", "category2", ...],
  "tags": ["tag1", "tag2", ...]
}\n\nEntry: ${text}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content:
            "You are an assistant that generates journaling titles, summaries, categories, and tags.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 250,
    });

    const content =
      typeof response.choices[0].message.content === "string"
        ? response.choices[0].message.content
        : JSON.stringify(response.choices[0].message.content);

    const parsedResponse = JSON.parse(content);

    return {
      title: parsedResponse.title || "Untitled",
      summary: parsedResponse.summary || "No summary available.",
      categories: parsedResponse.categories || ["Miscellaneous"],
      tags: parsedResponse.tags || [],
    };
  } catch (error) {
    logger.error(error);
    return {
      title: "Untitled",
      summary: "No summary available.",
      categories: ["Miscellaneous"],
      tags: [],
    };
  }
};

export function generateTags(text: string) {
  const doc = nlp(text);
  const wordCounts = doc.terms().out("array");

  const frequencyMap: Record<string, number> = {};

  wordCounts.forEach((word: string) => {
    frequencyMap[word] = (frequencyMap[word] || 0) + 1;
  });

  const commonWords = Object.entries(frequencyMap)
    .filter(([word, count]) => count > 1 && !isStopWord(word))
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);

  const tags = commonWords.slice(0, 5).map((w) => w.word);

  return tags;
}

export const summarizeEntry = async (text: string): Promise<string> => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that summarizes text concisely in the first person.",
        },
        {
          role: "user",
          content: `Summarize the following text:\n\n${text}`,
        },
      ],
    });

    const content =
      typeof response.choices[0].message.content === "string"
        ? response.choices[0].message.content
        : JSON.stringify(response.choices[0].message.content);

    return content;
  } catch (error) {
    console.error("Error summarizing entry:", error);
    return "Error generating summary";
  }
};

export const generateWritingPrompt = async (previousEntries: string[]) => {
  try {
    const prompt = `Based on the following past journal entries, suggest a new writing prompt:\n\n${previousEntries.join(
      "\n"
    )}\n\nSuggested Prompt:`;

    const response = await openai.completions.create({
      model: "gpt-4-turbo",
      prompt,
      max_tokens: 50,
    });
    console.log(response, "response");
    return response.choices[0].text.trim();
  } catch (error) {
    console.error("Writing Prompt Error:", error);
    return "Write about something that made you happy today.";
  }
};

export const detectThemes = async (entries: string[]) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "system",
          content: "You are an assistant that helps analyze journal entries.",
        },
        {
          role: "user",
          content: `Analyze the following journal entries and detect recurring themes. Return a list of themes in JSON format and include one theme that stands out:\n\n${entries.join(
            "\n\n"
          )}`,
        },
      ],
      max_tokens: 100,
    });

    const content =
      typeof response.choices[0].message.content === "string"
        ? response.choices[0].message.content
        : JSON.stringify(response.choices[0].message.content);

    const cleanContent = content
      .replace(/^```json\n/, "")
      .replace(/```$/, "")
      .trim();

    return JSON.parse(cleanContent);
  } catch (error) {
    console.error("Theme Detection Error:", error);
    return ["General Reflection"];
  }
};

export const detectWordTrends = (entries: string[]): Record<string, number> => {
  const wordCount: Record<string, number> = {};

  entries.forEach((entry) => {
    entry.split(/\s+/).forEach((word) => {
      const cleanedWord = word.toLowerCase().replace(/[^a-z]/g, "");
      wordCount[cleanedWord] = (wordCount[cleanedWord] || 0) + 1;
    });
  });

  return wordCount;
};

export const summarizeEntries = async (entries: string[]) => {
  try {
    const prompt = `Summarize the following journal entries into key takeaways:\n\n${entries.join(
      "\n\n"
    )}`;

    const response = await openai.completions.create({
      model: "gpt-4-turbo",
      prompt,
      max_tokens: 100,
    });

    return response.choices[0].text.trim();
  } catch (error) {
    console.error("Summary Generation Error:", error);
    return "No summary available.";
  }
};
