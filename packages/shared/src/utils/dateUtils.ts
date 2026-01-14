import { format, parseISO, addDays, startOfDay } from 'date-fns';

/**
 * Generate array of dates between start and end (inclusive)
 */
export function generateDateRange(startDate: string | Date, endDate: string | Date): string[] {
  const start = typeof startDate === 'string' ? parseISO(startDate) : startDate;
  const end = typeof endDate === 'string' ? parseISO(endDate) : endDate;
  const dates: string[] = [];
  let current = startOfDay(start);
  const endDay = startOfDay(end);

  while (current <= endDay) {
    dates.push(format(current, 'yyyy-MM-dd'));
    current = addDays(current, 1);
  }

  return dates;
}

/**
 * Generate N consecutive days from start date
 */
export function generateDaysFromCount(startDate: string | Date, count: number): string[] {
  const start = typeof startDate === 'string' ? parseISO(startDate) : startDate;
  const dates: string[] = [];
  let current = startOfDay(start);

  for (let i = 0; i < count; i++) {
    dates.push(format(current, 'yyyy-MM-dd'));
    current = addDays(current, 1);
  }

  return dates;
}

/**
 * Format date and time for Kimai API (ISO 8601 format)
 */
export function formatDateTimeForKimai(date: string | Date, time?: string): string {
  const dateStr = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');
  const timeStr = time || '00:00:00';
  return `${dateStr}T${timeStr}`;
}

/**
 * Calculate duration in seconds from start and end times
 */
export function calculateDuration(start: string | Date, end: string | Date): number {
  const startTime = typeof start === 'string' ? parseISO(start) : start;
  const endTime = typeof end === 'string' ? parseISO(end) : end;
  return Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
}

/**
 * Parse duration string (e.g., "2h", "1.5h", "30m") to seconds
 */
export function parseDuration(durationStr: string | null | undefined): number {
  if (!durationStr) return 0;

  const str = durationStr.trim().toLowerCase();
  const hoursMatch = str.match(/([\d.]+)\s*h/);
  const minutesMatch = str.match(/([\d.]+)\s*m/);

  let totalSeconds = 0;

  if (hoursMatch) {
    totalSeconds += parseFloat(hoursMatch[1]) * 3600;
  }

  if (minutesMatch) {
    totalSeconds += parseFloat(minutesMatch[1]) * 60;
  }

  // If no unit specified, assume hours
  if (!hoursMatch && !minutesMatch) {
    const num = parseFloat(str);
    if (!isNaN(num)) {
      totalSeconds = num * 3600; // Assume hours
    }
  }

  return Math.floor(totalSeconds);
}

/**
 * Format seconds to human-readable duration
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '0h';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${minutes}m`;
  }
}

/**
 * Calculate end time from begin time and duration (in seconds)
 */
export function calculateEndTime(beginDateTime: string | Date, durationSeconds: number): string {
  const begin = typeof beginDateTime === 'string' ? parseISO(beginDateTime) : beginDateTime;
  const end = new Date(begin.getTime() + durationSeconds * 1000);
  return format(end, "yyyy-MM-dd'T'HH:mm:ss");
}

/**
 * Get today's date in YYYY-MM-DD format
 */
export function getTodayDate(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * Get yesterday's date in YYYY-MM-DD format
 */
export function getYesterdayDate(): string {
  return format(addDays(new Date(), -1), 'yyyy-MM-dd');
}
