import { z } from 'zod';

// Kimai credentials
export const KimaiCredentialsSchema = z.object({
  baseUrl: z.string().url(),
  token: z.string().min(1),
  email: z.string().email().optional()  // Email for X-AUTH-USER header (Kimai Cloud)
});
export type KimaiCredentials = z.infer<typeof KimaiCredentialsSchema>;

// Project schema
export const ProjectSchema = z.object({
  id: z.number(),
  name: z.string(),
  customer: z.union([
    z.object({ id: z.number(), name: z.string() }),
    z.string(),
    z.number(),
    z.null()
  ]).optional(),
  visible: z.boolean().optional(),
  globalActivities: z.boolean().optional()
});
export type Project = z.infer<typeof ProjectSchema>;

// Activity schema
export const ActivitySchema = z.object({
  id: z.number(),
  name: z.string(),
  project: z.union([
    z.object({ id: z.number() }),
    z.number(),
    z.null()
  ]).optional(),
  visible: z.boolean().optional()
});
export type Activity = z.infer<typeof ActivitySchema>;

// Timesheet entry input (for creating)
export const TimesheetInputSchema = z.object({
  project: z.number(),
  activity: z.number(),
  begin: z.string(), // ISO 8601 format: YYYY-MM-DDTHH:mm:ss
  end: z.string(),   // ISO 8601 format: YYYY-MM-DDTHH:mm:ss
  description: z.string().optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional()
});
export type TimesheetInput = z.infer<typeof TimesheetInputSchema>;

// Timesheet entry response (from API)
export const TimesheetEntrySchema = z.object({
  id: z.number(),
  project: z.union([z.number(), z.object({ id: z.number(), name: z.string() })]),
  activity: z.union([z.number(), z.object({ id: z.number(), name: z.string() })]),
  begin: z.string(),
  end: z.string(),
  duration: z.number().optional(),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  user: z.any().optional()
});
export type TimesheetEntry = z.infer<typeof TimesheetEntrySchema>;

// Result of creating multiple timesheets
export const BatchTimesheetResultSchema = z.object({
  success: z.boolean(),
  data: TimesheetEntrySchema.optional(),
  error: z.any().optional(),
  date: z.string().nullable(),
  index: z.number()
});
export type BatchTimesheetResult = z.infer<typeof BatchTimesheetResultSchema>;

// Connection test result
export const ConnectionTestResultSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.any().optional()
});
export type ConnectionTestResult = z.infer<typeof ConnectionTestResultSchema>;

// Work hours summary
export const WorkHoursSummarySchema = z.object({
  date: z.string(),
  totalSeconds: z.number(),
  totalHours: z.number(),
  entries: z.array(z.object({
    project: z.union([z.string(), z.number()]),
    activity: z.union([z.string(), z.number()]),
    duration: z.number(),
    description: z.string().nullable().optional()
  }))
});
export type WorkHoursSummary = z.infer<typeof WorkHoursSummarySchema>;
