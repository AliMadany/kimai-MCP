import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  KimaiCredentials,
  Project,
  Activity,
  TimesheetInput,
  TimesheetEntry,
  BatchTimesheetResult,
  ConnectionTestResult,
  Customer,
  User,
  Team
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

  // Active timers
  async getActiveTimesheets(): Promise<TimesheetEntry[]> {
    const response = await this.client.get<TimesheetEntry[]>('/api/timesheets/active');
    return response.data;
  }

  // Start a live timer (no end = running timer)
  async startTimerEntry(data: {
    project: number;
    activity: number;
    description?: string;
    tags?: string;
    begin?: string;
  }): Promise<TimesheetEntry> {
    const response = await this.client.post<TimesheetEntry>('/api/timesheets', data);
    return response.data;
  }

  // Stop an active timer
  async stopTimesheetEntry(id: number): Promise<TimesheetEntry> {
    const response = await this.client.patch<TimesheetEntry>(`/api/timesheets/${id}/stop`);
    return response.data;
  }

  // Duplicate a timesheet
  async duplicateTimesheet(id: number): Promise<TimesheetEntry> {
    const response = await this.client.patch<TimesheetEntry>(`/api/timesheets/${id}/duplicate`);
    return response.data;
  }

  // Customers
  async getCustomers(search?: string): Promise<Customer[]> {
    const params = search ? { term: search } : {};
    const response = await this.client.get<Customer[]>('/api/customers', { params });
    return response.data;
  }

  async createCustomer(data: { name: string; comment?: string; visible?: boolean }): Promise<Customer> {
    const response = await this.client.post<Customer>('/api/customers', data);
    return response.data;
  }

  async updateCustomer(id: number, data: Partial<{ name: string; comment: string; visible: boolean }>): Promise<Customer> {
    const response = await this.client.patch<Customer>(`/api/customers/${id}`, data);
    return response.data;
  }

  // Projects (create/update/delete)
  async createProject(data: {
    name: string;
    customer: number;
    comment?: string;
    visible?: boolean;
    globalActivities?: boolean;
  }): Promise<Project> {
    const response = await this.client.post<Project>('/api/projects', data);
    return response.data;
  }

  async updateProject(id: number, data: Partial<{
    name: string;
    customer: number;
    comment: string;
    visible: boolean;
    globalActivities: boolean;
  }>): Promise<Project> {
    const response = await this.client.patch<Project>(`/api/projects/${id}`, data);
    return response.data;
  }

  async deleteProject(id: number): Promise<void> {
    await this.client.delete(`/api/projects/${id}`);
  }

  // Activities (create/update/delete)
  async createActivity(data: {
    name: string;
    project?: number | null;
    comment?: string;
    visible?: boolean;
  }): Promise<Activity> {
    const response = await this.client.post<Activity>('/api/activities', data);
    return response.data;
  }

  async updateActivity(id: number, data: Partial<{
    name: string;
    project: number | null;
    comment: string;
    visible: boolean;
  }>): Promise<Activity> {
    const response = await this.client.patch<Activity>(`/api/activities/${id}`, data);
    return response.data;
  }

  async deleteActivity(id: number): Promise<void> {
    await this.client.delete(`/api/activities/${id}`);
  }

  // Users
  async getUsers(search?: string): Promise<User[]> {
    const params = search ? { term: search } : {};
    const response = await this.client.get<User[]>('/api/users', { params });
    return response.data;
  }

  async getMe(): Promise<User> {
    const response = await this.client.get<User>('/api/users/me');
    return response.data;
  }

  async createUser(data: {
    username: string;
    email: string;
    plainPassword: string;
    alias?: string;
    enabled?: boolean;
    roles?: string[];
  }): Promise<User> {
    const response = await this.client.post<User>('/api/users', data);
    return response.data;
  }

  async updateUser(id: number, data: Partial<{
    alias: string;
    enabled: boolean;
    email: string;
    plainPassword: string;
  }>): Promise<User> {
    const response = await this.client.patch<User>(`/api/users/${id}`, data);
    return response.data;
  }

  // Teams
  async getTeams(): Promise<Team[]> {
    const response = await this.client.get<Team[]>('/api/teams');
    return response.data;
  }

  async createTeam(data: { name: string; teamlead: number }): Promise<Team> {
    const response = await this.client.post<Team>('/api/teams', data);
    return response.data;
  }

  async updateTeam(id: number, data: Partial<{ name: string; teamlead: number }>): Promise<Team> {
    const response = await this.client.patch<Team>(`/api/teams/${id}`, data);
    return response.data;
  }

  async deleteTeam(id: number): Promise<void> {
    await this.client.delete(`/api/teams/${id}`);
  }

  async addTeamMember(teamId: number, userId: number): Promise<void> {
    await this.client.post(`/api/teams/${teamId}/members/${userId}`);
  }

  async removeTeamMember(teamId: number, userId: number): Promise<void> {
    await this.client.delete(`/api/teams/${teamId}/members/${userId}`);
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
