import { z } from 'zod';

// AI Parser configuration
export const AIParserConfigSchema = z.object({
  openaiApiKey: z.string().min(1),
  model: z.string().optional(),
  baseUrl: z.string().url().optional(),
  temperature: z.number().min(0).max(2).optional()
});
export type AIParserConfig = z.infer<typeof AIParserConfigSchema>;

// Parsed time entry from AI
export const ParsedTimeEntrySchema = z.object({
  project_hint: z.string().nullable(),
  activity_hint: z.string().nullable(),
  dates: z.array(z.string()), // YYYY-MM-DD format
  start_time: z.string().nullable(), // HH:MM:SS format
  end_time: z.string().nullable(), // HH:MM:SS format
  duration: z.number(), // seconds
  description: z.string().nullable(),
  tags: z.array(z.string())
});
export type ParsedTimeEntry = z.infer<typeof ParsedTimeEntrySchema>;

// Parse context for better AI understanding
export const ParseContextSchema = z.object({
  projects: z.array(z.object({
    id: z.number(),
    name: z.string(),
    customer: z.string().optional()
  })).optional(),
  activities: z.array(z.object({
    id: z.number(),
    name: z.string(),
    projectId: z.number().optional()
  })).optional(),
  recentHistory: z.string().optional(),
  chatHistory: z.string().optional(),
  currentTime: z.date().optional()
});
export type ParseContext = z.infer<typeof ParseContextSchema>;

// Parse result
export const ParseResultSchema = z.object({
  entries: z.array(ParsedTimeEntrySchema),
  friendlyResponse: z.string().nullable().optional(),
  rawResponse: z.string().optional()
});
export type ParseResult = z.infer<typeof ParseResultSchema>;

// Project match result
export const ProjectMatchSchema = z.object({
  id: z.number(),
  name: z.string(),
  score: z.number(),
  customer: z.string().optional()
});
export type ProjectMatch = z.infer<typeof ProjectMatchSchema>;

// Activity match result
export const ActivityMatchSchema = z.object({
  id: z.number(),
  name: z.string(),
  score: z.number(),
  projectId: z.number().optional()
});
export type ActivityMatch = z.infer<typeof ActivityMatchSchema>;
