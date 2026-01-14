import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  KimaiCredentials,
  Project,
  Activity,
  TimesheetInput,
  TimesheetEntry,
  BatchTimesheetResult,
  ConnectionTestResult
} from './types.js';

export interface CreateMultipleOptions {
  stopOnError?: boolean;
  onProgress?: (current: number, total: number, result: BatchTimesheetResult) => void;
}

export class KimaiClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(credentials: KimaiCredentials) {
    this.baseUrl = credentials.baseUrl;

    // Build headers based on auth method
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    // Kimai Cloud authentication: X-AUTH-USER + X-AUTH-TOKEN
    if (credentials.email) {
      headers['X-AUTH-USER'] = credentials.email;
      headers['X-AUTH-TOKEN'] = credentials.token;
    } else {
      // Fallback to Bearer token for compatibility
      headers['Authorization'] = `Bearer ${credentials.token}`;
    }

    this.client = axios.create({
      baseURL: credentials.baseUrl,
      headers
    });
  }

  /**
   * Get all projects, optionally filtered by search term
   */
  async getProjects(term?: string): Promise<Project[]> {
    const params = term ? { term } : {};
    const response = await this.client.get<Project[]>('/api/projects', { params });
    return response.data;
  }

  /**
   * Get a single project by ID
   */
  async getProject(projectId: number): Promise<Project> {
    const response = await this.client.get<Project>(`/api/projects/${projectId}`);
    return response.data;
  }

  /**
   * Get activities, optionally filtered by project and/or search term
   */
  async getActivities(
    projectId?: number | null,
    term?: string,
    includeGlobal?: boolean
  ): Promise<Activity[]> {
    const activities: Activity[] = [];

    // Fetch project-specific activities if projectId provided
    if (projectId) {
      try {
        const params: Record<string, any> = { project: projectId };
        if (term) params.term = term;
        const response = await this.client.get<Activity[]>('/api/activities', { params });
        if (Array.isArray(response.data)) {
          activities.push(...response.data);
        }
      } catch (error) {
        // Log but continue - will try global activities
        console.error('Error fetching project activities:', error);
      }
    }

    // Fetch global activities if requested or if project has none
    if (includeGlobal || (projectId && activities.length === 0)) {
      try {
        const params: Record<string, any> = { globals: 1 };
        if (term) params.term = term;
        const response = await this.client.get<Activity[]>('/api/activities', { params });
        if (Array.isArray(response.data)) {
          const existingIds = new Set(activities.map(a => a.id));
          response.data.forEach(activity => {
            if (!existingIds.has(activity.id)) {
              activities.push(activity);
            }
          });
        }
      } catch (error) {
        console.error('Error fetching global activities:', error);
      }
    }

    // If no projectId and no global flag, fetch all activities
    if (!projectId && !includeGlobal) {
      try {
        const params = term ? { term } : {};
        const response = await this.client.get<Activity[]>('/api/activities', { params });
        if (Array.isArray(response.data)) {
          activities.push(...response.data);
        }
      } catch (error) {
        console.error('Error fetching activities:', error);
      }
    }

    return activities;
  }

  /**
   * Create a single timesheet entry
   */
  async createTimesheet(data: TimesheetInput): Promise<TimesheetEntry> {
    const response = await this.client.post<TimesheetEntry>('/api/timesheets', data);
    return response.data;
  }

  /**
   * Create multiple timesheet entries sequentially
   */
  async createMultipleTimesheets(
    entries: TimesheetInput[],
    options: CreateMultipleOptions = {}
  ): Promise<BatchTimesheetResult[]> {
    const { stopOnError = false, onProgress } = options;
    const results: BatchTimesheetResult[] = [];

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      try {
        const response = await this.client.post<TimesheetEntry>('/api/timesheets', entry);
        const result: BatchTimesheetResult = {
          success: true,
          data: response.data,
          date: entry.begin ? entry.begin.split('T')[0] : null,
          index: i
        };
        results.push(result);

        if (onProgress) {
          onProgress(i + 1, entries.length, result);
        }

        // Small delay to avoid rate limiting
        if (i < entries.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        const axiosError = error as AxiosError;
        const result: BatchTimesheetResult = {
          success: false,
          error: axiosError.response?.data || axiosError.message,
          date: entry.begin ? entry.begin.split('T')[0] : null,
          index: i
        };
        results.push(result);

        if (onProgress) {
          onProgress(i + 1, entries.length, result);
        }

        if (stopOnError) {
          break;
        }
      }
    }

    return results;
  }

  /**
   * Get recent timesheet entries
   */
  async getRecentTimesheets(size: number = 10): Promise<TimesheetEntry[]> {
    const response = await this.client.get<TimesheetEntry[]>('/api/timesheets/recent', {
      params: { size }
    });
    return response.data;
  }

  /**
   * Get timesheets with filters
   */
  async getTimesheets(params: {
    begin?: string;
    end?: string;
    project?: number;
    activity?: number;
    size?: number;
  } = {}): Promise<TimesheetEntry[]> {
    const response = await this.client.get<TimesheetEntry[]>('/api/timesheets', { params });
    return response.data;
  }

  /**
   * Update a timesheet entry
   */
  async updateTimesheet(
    id: number,
    data: Partial<TimesheetInput>
  ): Promise<TimesheetEntry> {
    const response = await this.client.patch<TimesheetEntry>(`/api/timesheets/${id}`, data);
    return response.data;
  }

  /**
   * Delete a timesheet entry
   */
  async deleteTimesheet(id: number): Promise<void> {
    await this.client.delete(`/api/timesheets/${id}`);
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const response = await this.client.get('/api/ping');
      return { success: true, data: response.data };
    } catch (error) {
      const axiosError = error as AxiosError;
      return {
        success: false,
        error: axiosError.response?.data || axiosError.message
      };
    }
  }
}

// Re-export types
export * from './types.js';
