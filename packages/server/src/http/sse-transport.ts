import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

/**
 * HTTP SSE Transport for MCP
 *
 * This transport uses Server-Sent Events (SSE) for server-to-client messages
 * and a POST endpoint for client-to-server messages.
 *
 * Flow:
 * 1. Client opens SSE connection to GET /mcp
 * 2. Client sends messages via POST /mcp
 * 3. Server responds via SSE
 */
export class HttpSseTransport implements Transport {
  private sseResponse: Response | null = null;
  private messageQueue: JSONRPCMessage[] = [];
  private closeCallbacks: (() => void)[] = [];
  private errorCallbacks: ((error: Error) => void)[] = [];
  private messageCallbacks: ((message: JSONRPCMessage) => void)[] = [];
  private _sessionId: string;
  private closed = false;

  constructor() {
    this._sessionId = randomUUID();
  }

  /**
   * Get the session ID for this transport
   */
  getSessionId(): string {
    return this._sessionId;
  }

  /**
   * Start the transport (called by MCP Server.connect())
   */
  async start(): Promise<void> {
    // Nothing to do - we're ready when the SSE connection is established
  }

  /**
   * Handle an incoming SSE connection request
   */
  handleSseConnection(req: Request, res: Response): void {
    if (this.closed) {
      res.status(410).json({ error: 'Transport closed' });
      return;
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Store the response for sending messages
    this.sseResponse = res;

    // Send any queued messages
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()!;
      this.sendSseMessage(message);
    }

    // Send a ping to confirm connection
    res.write(`event: ping\ndata: ${JSON.stringify({ sessionId: this._sessionId })}\n\n`);

    // Handle client disconnect
    req.on('close', () => {
      this.sseResponse = null;
      if (!this.closed) {
        this.close();
      }
    });
  }

  /**
   * Handle an incoming message from the client (POST /mcp)
   */
  async handleMessage(message: JSONRPCMessage): Promise<void> {
    if (this.closed) {
      throw new Error('Transport closed');
    }

    // Notify listeners of the incoming message
    for (const callback of this.messageCallbacks) {
      callback(message);
    }
  }

  /**
   * Send a message to the client via SSE
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed) {
      throw new Error('Transport closed');
    }

    if (this.sseResponse) {
      this.sendSseMessage(message);
    } else {
      // Queue the message for when SSE connection is established
      this.messageQueue.push(message);
    }
  }

  private sendSseMessage(message: JSONRPCMessage): void {
    if (!this.sseResponse) return;

    try {
      this.sseResponse.write(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
    } catch (error) {
      console.error('Error sending SSE message:', error);
      this.errorCallbacks.forEach(cb => cb(error as Error));
    }
  }

  /**
   * Close the transport
   */
  async close(): Promise<void> {
    if (this.closed) return;

    this.closed = true;

    if (this.sseResponse) {
      try {
        this.sseResponse.end();
      } catch {
        // Ignore errors during close
      }
      this.sseResponse = null;
    }

    this.closeCallbacks.forEach(cb => cb());
  }

  /**
   * Register a callback for when the transport is closed
   */
  set onclose(callback: (() => void) | undefined) {
    if (callback) {
      this.closeCallbacks.push(callback);
    }
  }

  /**
   * Register a callback for transport errors
   */
  set onerror(callback: ((error: Error) => void) | undefined) {
    if (callback) {
      this.errorCallbacks.push(callback);
    }
  }

  /**
   * Register a callback for incoming messages
   */
  set onmessage(callback: ((message: JSONRPCMessage) => void) | undefined) {
    if (callback) {
      this.messageCallbacks.push(callback);
    }
  }

  /**
   * Check if the transport is connected
   */
  isConnected(): boolean {
    return this.sseResponse !== null && !this.closed;
  }
}

/**
 * Session manager for multiple concurrent MCP connections
 */
export class SessionManager {
  private sessions = new Map<string, HttpSseTransport>();

  /**
   * Create a new session
   */
  createSession(): HttpSseTransport {
    const transport = new HttpSseTransport();
    this.sessions.set(transport.getSessionId(), transport);

    // Clean up when session closes
    transport.onclose = () => {
      this.sessions.delete(transport.getSessionId());
    };

    return transport;
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): HttpSseTransport | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active session IDs
   */
  getSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Close all sessions
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.sessions.values()).map(s => s.close());
    await Promise.all(closePromises);
    this.sessions.clear();
  }
}
