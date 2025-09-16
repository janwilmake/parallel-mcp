/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import { Queryable, studioMiddleware } from "queryable-object";
import { parallelOauthProvider } from "../parallel-oauth-provider";
import { withMcp } from "with-mcp";
import Parallel from "parallel-web";

//@ts-ignore
import openapi from "./openapi.json";

export interface Env {
  OAUTH_KV: KVNamespace;
  ADMIN_SECRET: string;
  TASK_GROUP_DO: DurableObjectNamespace<TaskGroupDO>;
}

const ORIGIN = "https://multitask-demo.parallel.ai";
// Types
interface TaskGroupInput {
  inputs: string | object[];
  webhook_url?: string;
  processor?: string;
  output_type: "text" | "json";
  output_description?: string;
  output_schema?: any;
}

const fetchHandler = async (
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> => {
  const url = new URL(request.url);
  const oauthResponse = await parallelOauthProvider(request, env.OAUTH_KV);
  if (oauthResponse) return oauthResponse;

  // Handle OAuth callback
  if (url.pathname === "/callback" && request.method === "GET") {
    return handleOauthCallback(request, env);
  }

  // Handle multitask creation
  if (url.pathname === "/v1beta/tasks/multitask" && request.method === "POST") {
    return handleMultitask(request, env);
  }

  // Handle task group results
  const pathMatch = url.pathname.match(
    /^\/([a-zA-Z0-9_-]+)(?:\.(json|md|html|sse|db))?$/
  );
  if (pathMatch) {
    const taskGroupId = pathMatch[1];
    const format =
      pathMatch[2] || getFormatFromAccept(request.headers.get("accept"));

    const stub = env.TASK_GROUP_DO.get(
      env.TASK_GROUP_DO.idFromName(taskGroupId)
    );

    if (format === "db") {
      return studioMiddleware(request, stub.raw, {
        basicAuth: { username: "admin", password: env.ADMIN_SECRET },
      });
    }

    return stub.fetch(request);
  }

  return new Response("Not Found", { status: 404 });
};

export default {
  fetch: withMcp(fetchHandler, openapi, {
    authEndpoint: "/me",
    serverInfo: { name: "Parallel Multitask MCP", version: "1.0.0" },
    toolOperationIds: ["createMultitask", "getTaskGroupResultsMarkdown"],
  }),
} satisfies ExportedHandler<Env>;

async function handleOauthCallback(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const redirectTo = url.searchParams.get("redirect_to");

  if (!code) {
    return new Response("Missing authorization code", { status: 400 });
  }

  try {
    // Exchange code for access token
    const req = new Request(`${url.origin}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        client_id: url.hostname,
      }),
    });

    const tokenResponse = await parallelOauthProvider(req, env.OAUTH_KV);

    if (!tokenResponse.ok) {
      const fail = await tokenResponse.text();
      throw new Error(
        "Token exchange failed: status = " + tokenResponse.status + ": " + fail
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Set cookie and redirect
    const response = new Response("", {
      status: 302,
      headers: {
        Location: redirectTo || "/",
        // lax to allow keeping the cookie when linking from mcp client
        "Set-Cookie": `access_token=${accessToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`, // 30 days
      },
    });

    return response;
  } catch (error) {
    console.error("OAuth callback error:", error);
    return new Response("OAuth callback failed", { status: 500 });
  }
}

async function handleMultitask(request: Request, env: Env): Promise<Response> {
  const apiKey = getApiKeyFromRequest(request);
  if (!apiKey) {
    return new Response("Missing x-api-key or Authorization header", {
      status: 401,
    });
  }

  const body: TaskGroupInput = await request.json();

  // Validate required fields
  if (!body.inputs || !body.output_type) {
    return new Response("Missing required fields: inputs, output_type", {
      status: 400,
    });
  }

  try {
    // Initialize Parallel SDK client
    const parallel = new Parallel({ apiKey });

    // Create task group using SDK
    const taskGroup = await parallel.beta.taskGroup.create({
      metadata: {
        created_via: "multitask-demo",
        output_type: body.output_type,
      },
    });

    const taskGroupId = taskGroup.taskgroup_id;

    // Process inputs
    let inputs: object[] = [];
    if (typeof body.inputs === "string") {
      try {
        inputs = JSON.parse(body.inputs);

        if (!Array.isArray(inputs)) {
          throw new Error("No array");
        }
      } catch (e) {
        const url = new URL(body.inputs);
        const inputsResponse = await fetch(body.inputs);
        if (!inputsResponse.ok) {
          throw new Error("Failed to fetch inputs from URL");
        }
        inputs = await inputsResponse.json();
      }
    } else {
      inputs = body.inputs;
    }

    // Prepare task specification
    let taskSpec: any = {};

    if (body.output_type === "json") {
      if (body.output_schema) {
        taskSpec.output_schema = {
          type: "json",
          json_schema: body.output_schema,
        };
      } else if (body.output_description) {
        // Use suggest API to generate schema from description (keep as direct fetch since no SDK)
        const suggestResponse = await fetch(
          "https://api.parallel.ai/v1beta/tasks/suggest",
          {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              user_intent: body.output_description,
            }),
          }
        );

        if (suggestResponse.ok) {
          const suggestion = await suggestResponse.json();
          taskSpec = {
            input_schema: suggestion.input_schema
              ? {
                  type: "json",
                  json_schema: suggestion.input_schema,
                }
              : undefined,
            output_schema: {
              type: "json",
              json_schema: suggestion.output_schema,
            },
          };
        }
      } else {
        taskSpec.output_schema = { type: "auto" };
      }
    } else {
      taskSpec.output_schema = {
        type: "text",
        description: body.output_description || "Text output from task",
      };
    }

    // Suggest processor if not provided (keep as direct fetch since no SDK)
    let processor = body.processor;
    if (!processor) {
      const processorResponse = await fetch(
        "https://api.parallel.ai/v1beta/tasks/suggest-processor",
        {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            task_spec: taskSpec,
            choose_processors_from: ["lite", "base", "core", "pro", "ultra"],
          }),
        }
      );

      if (processorResponse.ok) {
        const suggestion = await processorResponse.json();
        processor = suggestion.recommended_processors?.[0] || "core";
      } else {
        processor = "core";
      }
    }

    // Create task run inputs
    const runInputs = inputs.map((input) => ({ input, processor }));

    // Add runs to group in batches using SDK
    const batchSize = 500;
    const runIds: string[] = [];

    for (let i = 0; i < runInputs.length; i += batchSize) {
      const batch = runInputs.slice(i, i + batchSize);

      const runsResponse = await parallel.beta.taskGroup.addRuns(taskGroupId, {
        default_task_spec: taskSpec,
        inputs: batch,
      });

      runIds.push(...runsResponse.run_ids);
    }

    // Initialize Durable Object
    const stub = env.TASK_GROUP_DO.get(
      env.TASK_GROUP_DO.idFromName(taskGroupId)
    );
    await stub.initialize(
      taskGroupId,
      apiKey,
      body.webhook_url,
      taskGroup,
      runIds,
      inputs // Pass the original inputs array
    );

    const origin = new URL(request.url).origin;
    return new Response(`${origin}/${taskGroupId}`);
  } catch (error) {
    console.error("Error in handleMultitask:", error);
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}

function getApiKeyFromRequest(request: Request): string | null {
  // Try x-api-key header first
  let apiKey = request.headers.get("x-api-key");
  if (apiKey) return apiKey;

  // Try Authorization header
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }

  // Try access_token cookie
  const cookieHeader = request.headers.get("Cookie");
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    const accessTokenCookie = cookies.find((c) =>
      c.startsWith("access_token=")
    );
    if (accessTokenCookie) {
      return accessTokenCookie.split("=")[1];
    }
  }

  return null;
}

function getFormatFromAccept(accept: string | null): string {
  if (!accept) return "md";

  if (accept.includes("text/html")) return "html";
  if (accept.includes("text/markdown")) return "md";
  if (accept.includes("text/event-stream")) return "sse";
  return "json";
}

@Queryable()
export class TaskGroupDO extends DurableObject<Env> {
  sql: SqlStorage;
  env: Env;
  state: DurableObjectState;
  private parallel: Parallel | null = null;
  private streamController: AbortController | null = null;
  private isStreaming = false;
  private lastEventId: string | null = null;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.env = env;
    this.state = state;
    this.sql = state.storage.sql;

    // Initialize database tables
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS details (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        input_index INTEGER,
        status TEXT,
        is_active BOOLEAN,
        processor TEXT,
        metadata TEXT,
        created_at TEXT,
        modified_at TEXT,
        input TEXT,
        output TEXT,
        output_basis TEXT,
        error TEXT
      )
    `);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS stream_state (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
  }

  async initialize(
    taskGroupId: string,
    apiKey: string,
    webhookUrl: string | undefined,
    groupData: any,
    runIds: string[],
    originalInputs: object[]
  ): Promise<void> {
    // Initialize SDK client
    this.parallel = new Parallel({ apiKey });

    // Store initial data
    this.sql.exec(
      "INSERT OR REPLACE INTO details (key, value) VALUES (?, ?)",
      "taskgroup_id",
      taskGroupId
    );
    this.sql.exec(
      "INSERT OR REPLACE INTO details (key, value) VALUES (?, ?)",
      "api_key",
      apiKey
    );
    this.sql.exec(
      "INSERT OR REPLACE INTO details (key, value) VALUES (?, ?)",
      "webhook_url",
      webhookUrl || ""
    );
    this.sql.exec(
      "INSERT OR REPLACE INTO details (key, value) VALUES (?, ?)",
      "group_data",
      JSON.stringify(groupData)
    );
    this.sql.exec(
      "INSERT OR REPLACE INTO details (key, value) VALUES (?, ?)",
      "run_ids",
      JSON.stringify(runIds)
    );
    this.sql.exec(
      "INSERT OR REPLACE INTO details (key, value) VALUES (?, ?)",
      "original_inputs",
      JSON.stringify(originalInputs)
    );

    // Initialize runs with input index mapping
    for (let i = 0; i < runIds.length; i++) {
      const runId = runIds[i];
      const inputIndex = i;
      this.sql.exec(
        `
        INSERT OR REPLACE INTO runs (run_id, input_index, status, is_active, processor, metadata, created_at, modified_at, input)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        runId,
        inputIndex,
        "queued",
        true,
        "",
        "{}",
        new Date().toISOString(),
        new Date().toISOString(),
        JSON.stringify(originalInputs[i])
      );
    }

    // Start first streaming session
    this.scheduleStreamingSession();
  }

  private scheduleStreamingSession(): void {
    // Schedule an alarm to start streaming immediately
    this.state.storage.setAlarm(Date.now() + 100);
  }

  private scheduleNextStreamingSession(): void {
    // Schedule next streaming session in 10 seconds
    this.state.storage.setAlarm(Date.now() + 10000);
  }

  async alarm(): Promise<void> {
    console.log(
      `[${new Date().toISOString()}] Alarm triggered - starting streaming session`
    );

    // Check if task group is still active
    const groupDataRaw = this.sql
      .exec("SELECT value FROM details WHERE key = ?", "group_data")
      .toArray()[0]?.value;

    if (groupDataRaw) {
      const groupData = JSON.parse(groupDataRaw);
      if (
        groupData.status &&
        !groupData.status.is_active &&
        groupData.status.num_task_runs > 0
      ) {
        console.log(
          `[${new Date().toISOString()}] Task group is complete - not scheduling more sessions`
        );
        return;
      }
    }

    try {
      await this.runStreamingSession();
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] Streaming session failed:`,
        error
      );
    }

    // Schedule next session if task group is still active
    const updatedGroupDataRaw = this.sql
      .exec("SELECT value FROM details WHERE key = ?", "group_data")
      .toArray()[0]?.value;

    if (updatedGroupDataRaw) {
      const updatedGroupData = JSON.parse(updatedGroupDataRaw);
      if (!updatedGroupData.status || updatedGroupData.status.is_active) {
        console.log(
          `[${new Date().toISOString()}] Scheduling next streaming session`
        );
        this.scheduleNextStreamingSession();
      } else {
        console.log(
          `[${new Date().toISOString()}] Task group completed - stopping streaming`
        );
        await this.handleCompletion();
      }
    }
  }

  private async runStreamingSession(): Promise<void> {
    const STREAM_TIMEOUT = 290000; // 4 minutes 50 seconds

    this.initializeParallelClient();

    if (!this.parallel) {
      throw new Error("Parallel client not initialized");
    }

    const taskGroupId = this.sql
      .exec("SELECT value FROM details WHERE key = ?", "taskgroup_id")
      .toArray()[0]?.value as string | undefined;

    if (!taskGroupId) {
      throw new Error("Missing taskGroupId");
    }

    // Load last event ID from storage if available
    if (!this.lastEventId) {
      const storedEventId = this.sql
        .exec("SELECT value FROM stream_state WHERE key = ?", "last_event_id")
        .toArray()[0]?.value as string | undefined;
      this.lastEventId = storedEventId || null;
    }

    console.log(
      `[${new Date().toISOString()}] Starting 290s streaming session for ${taskGroupId} (cursor: ${
        this.lastEventId || "none"
      })`
    );

    this.streamController = new AbortController();

    // Set timeout for the streaming session
    const timeoutId = setTimeout(() => {
      console.log(
        `[${new Date().toISOString()}] Stream timeout reached - aborting session`
      );
      this.streamController?.abort();
    }, STREAM_TIMEOUT);
    const sessionStart = Date.now();

    try {
      // Use SDK to get events stream with cursor support
      const eventsParams =
        //this.lastEventId
        //  ? { last_event_id: this.lastEventId, timeout: 300 } // 5 minutes timeout (longer than our session)
        // :
        { timeout: 300 };

      a;

      console.log(`[${new Date().toISOString()}] Connected to events stream`);

      let eventCount = 0;

      for await (const event of eventsStream) {
        if (this.streamController?.signal.aborted) {
          console.log(`[${new Date().toISOString()}] Stream aborted`);
          break;
        }

        eventCount++;
        const elapsed = Date.now() - sessionStart;

        console.log(
          `[${new Date().toISOString()}] Event #${eventCount} (${elapsed}ms):`,
          event.type
        );

        // Store cursor for reconnection
        if ("event_id" in event && event.event_id) {
          this.lastEventId = event.event_id;
          this.sql.exec(
            "INSERT OR REPLACE INTO stream_state (key, value) VALUES (?, ?)",
            "last_event_id",
            event.event_id
          );
        }

        // Process different event types
        if (event.type === "task_group_status") {
          await this.updateTaskGroupStatus(event);
        } else if (event.type === "task_run.state") {
          await this.handleTaskRunStateEvent(event);
        } else if (event.type === "error") {
          console.error(
            `[${new Date().toISOString()}] Stream error event:`,
            event.error
          );
        }
      }

      const totalElapsed = Date.now() - sessionStart;
      console.log(
        `[${new Date().toISOString()}] Stream session ended normally after ${totalElapsed}ms, ${eventCount} events`
      );
    } catch (error) {
      const totalElapsed = Date.now() - sessionStart;

      if (error.name === "AbortError") {
        console.log(
          `[${new Date().toISOString()}] Stream session aborted after ${totalElapsed}ms (timeout)`
        );
      } else {
        console.error(
          `[${new Date().toISOString()}] Stream session error after ${totalElapsed}ms:`,
          error.message
        );
        throw error;
      }
    } finally {
      clearTimeout(timeoutId);
      this.streamController = null;
    }
  }

  private getStoredApiKey(): string | null {
    return this.sql
      .exec("SELECT value FROM details WHERE key = ?", "api_key")
      .toArray()[0]?.value as string | null;
  }

  private initializeParallelClient(): void {
    const apiKey = this.getStoredApiKey();
    if (apiKey && !this.parallel) {
      this.parallel = new Parallel({ apiKey });
    }
  }

  async getData(requestApiKey?: string): Promise<any> {
    const taskGroupId = this.sql
      .exec("SELECT value FROM details WHERE key = ?", "taskgroup_id")
      .toArray()[0]?.value;
    const groupDataRaw = this.sql
      .exec("SELECT value FROM details WHERE key = ?", "group_data")
      .toArray()[0]?.value;
    const groupData = groupDataRaw ? JSON.parse(groupDataRaw) : {};
    const storedApiKey = this.getStoredApiKey();

    // Check if the requesting API key matches the one that created the task group
    if (storedApiKey && requestApiKey !== storedApiKey) {
      return {
        unauthorized: true,
        taskGroupId,
      };
    }

    const runs = this.sql
      .exec("SELECT * FROM runs ORDER BY input_index")
      .toArray();

    // Process runs to create flat results with merged input and output
    const results: any[] = [];
    const fullRuns: any[] = [];

    for (const run of runs) {
      const runObj: any = {
        run_id: run.run_id,
        input_index: run.input_index,
        status: run.status,
        is_active: !!run.is_active,
        processor: run.processor,
        created_at: run.created_at,
        modified_at: run.modified_at,
      };

      // Parse input data
      let inputData = {};
      if (run.input) {
        try {
          inputData = JSON.parse(run.input as string);
          runObj.input = inputData;
        } catch {
          inputData = { input: run.input };
          runObj.input = run.input;
        }
      }

      // Parse output data
      let outputContent = {};
      if (run.output) {
        try {
          const output = JSON.parse(run.output as string);
          runObj.output = output;

          // Extract content from output
          if (output.content) {
            outputContent =
              typeof output.content === "object"
                ? output.content
                : { content: output.content };
          }
        } catch {
          outputContent = { content: run.output };
          runObj.output = { content: run.output };
        }
      }

      // Create flat result object: {$id, status, ...input, ...output.content}
      const resultItem = {
        $id: run.run_id,
        status: run.status,
        ...inputData, // Spread the input object properties
        ...outputContent, // Spread the output.content properties
      };

      results.push(resultItem);

      if (run.output_basis) {
        try {
          runObj.output_basis = JSON.parse(run.output_basis as string);
        } catch {
          runObj.output_basis = run.output_basis;
        }
      }

      if (run.error) {
        try {
          runObj.error = JSON.parse(run.error as string);
        } catch {
          runObj.error = run.error;
        }
      }

      if (run.metadata && run.metadata !== "{}") {
        try {
          runObj.metadata = JSON.parse(run.metadata as string);
        } catch {
          runObj.metadata = run.metadata;
        }
      }

      fullRuns.push(runObj);
    }

    return {
      id: taskGroupId,
      metadata: groupData.metadata || {},
      status: groupData.status || {
        num_task_runs: runs.length,
        task_run_status_counts: this.getStatusCounts(runs),
        is_active: runs.some((r) => r.is_active),
        status_message: "",
        modified_at: new Date().toISOString(),
      },
      created_at: groupData.created_at || new Date().toISOString(),
      output_schema: groupData.output_schema || null,
      results,
      runs: fullRuns,
    };
  }

  private getStatusCounts(runs: any[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const run of runs) {
      const status = run.status as string;
      counts[status] = (counts[status] || 0) + 1;
    }
    return counts;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathMatch = url.pathname.match(
      /^\/([^.]+)(?:\.(json|md|html|sse))?$/
    );

    if (!pathMatch) {
      return new Response("Not Found", { status: 404 });
    }

    const format =
      pathMatch[2] || getFormatFromAccept(request.headers.get("accept"));

    // Get API key from request
    const requestApiKey = getApiKeyFromRequest(request);
    const data = await this.getData(requestApiKey);

    // Check if unauthorized
    if (data.unauthorized) {
      const currentUrl = encodeURIComponent(request.url);
      const redirect_uri = encodeURIComponent(
        `${url.origin}/callback?redirect_to=${currentUrl}`
      );
      const authUrl = `${url.origin}/authorize?client_id=${url.hostname}&redirect_uri=${redirect_uri}&response_type=code`;

      const unauthorizedHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Authorization Required</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://assets.p0web.com/FTSystemMono-Regular.woff2" rel="preload" as="font" type="font/woff2" crossorigin>
  <style>
    @font-face {
      font-family: 'FT System Mono';
      src: url('https://assets.p0web.com/FTSystemMono-Regular.woff2') format('woff2');
    }
    body { font-family: 'FT System Mono', monospace; }
  </style>
</head>
<body class="bg-gray-50 min-h-screen flex items-center justify-center p-8">
  <div class="max-w-md mx-auto text-center">
    <div class="bg-white rounded-lg shadow-lg p-8">
      <div class="w-16 h-16 mx-auto mb-4 bg-orange-100 rounded-full flex items-center justify-center">
        <svg class="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
        </svg>
      </div>
      <h1 class="text-2xl font-bold mb-4">Authorization Required</h1>
      <p class="text-gray-600 mb-6">This task group was created with a different API key. Please authorize to view the results.</p>
      <a href="${authUrl}" class="inline-block bg-orange-500 text-white px-6 py-3 rounded-lg hover:bg-orange-600 transition-colors">
        Authorize Access
      </a>
    </div>
  </div>
</body>
</html>`;

      return new Response(unauthorizedHtml, {
        status: 401,
        headers: { "content-type": "text/html" },
      });
    }

    switch (format) {
      case "json":
        return new Response(JSON.stringify(data, null, 2), {
          headers: { "content-type": "application/json;charset=utf8" },
        });

      case "md":
        return new Response(formatAsMarkdown(data), {
          headers: { "content-type": "text/markdown;charset=utf8" },
        });

      case "html":
        return new Response(formatAsHTML(data), {
          headers: { "content-type": "text/html;charset=utf8" },
        });

      case "sse":
        return this.handleSSE(request);

      default:
        return new Response(JSON.stringify(data, null, 2), {
          headers: { "content-type": "application/json;charset=utf8" },
        });
    }
  }

  private async handleSSE(request: Request): Promise<Response> {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    const encoder = new TextEncoder();

    // Get API key and check authorization first
    const requestApiKey = getApiKeyFromRequest(request);
    const initialData = await this.getData(requestApiKey);

    if (initialData.unauthorized) {
      await writer.write(
        encoder.encode(`data: ${JSON.stringify({ type: "unauthorized" })}\n\n`)
      );
      await writer.close();
      return new Response(readable, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
          "access-control-allow-origin": "*",
        },
      });
    }

    // Send initial data
    await writer.write(
      encoder.encode(
        `data: ${JSON.stringify({ type: "initial", data: initialData })}\n\n`
      )
    );

    // Store current state to detect changes
    let lastRunStates = new Map();
    let lastGroupStatus = initialData.status;

    for (const run of initialData.runs) {
      lastRunStates.set(run.run_id, {
        status: run.status,
        output: run.output,
        output_basis: run.output_basis,
      });
    }

    // Keep connection alive and send updates
    const updateInterval = setInterval(async () => {
      try {
        const currentData = await this.getData(requestApiKey);

        // Check for group status changes
        if (
          JSON.stringify(lastGroupStatus) !== JSON.stringify(currentData.status)
        ) {
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "group_status_update",
                status: currentData.status,
              })}\n\n`
            )
          );
          lastGroupStatus = currentData.status;
        }

        // Check for run updates
        for (const run of currentData.runs) {
          const lastState = lastRunStates.get(run.run_id);
          const currentState = {
            status: run.status,
            output: run.output,
            output_basis: run.output_basis,
          };

          if (
            !lastState ||
            JSON.stringify(lastState) !== JSON.stringify(currentState)
          ) {
            // Find the corresponding result for this run
            const result = currentData.results.find(
              (r) => r.$id === run.run_id
            );

            // Send individual run update with merged result
            await writer.write(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "run_update",
                  run: run,
                  result: result,
                })}\n\n`
              )
            );

            lastRunStates.set(run.run_id, currentState);
          }
        }

        // Check if all tasks are complete
        if (!currentData.status.is_active) {
          await writer.write(
            encoder.encode(`data: ${JSON.stringify({ type: "complete" })}\n\n`)
          );
          clearInterval(updateInterval);
          await writer.close();
        }
      } catch (error) {
        console.error("SSE update error:", error);
        clearInterval(updateInterval);
        await writer.close();
      }
    }, 2000);

    // Cleanup on client disconnect
    request.signal?.addEventListener("abort", () => {
      clearInterval(updateInterval);
      writer.close();
    });

    return new Response(readable, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "access-control-allow-origin": "*",
      },
    });
  }

  private async handleTaskRunStateEvent(eventData: any): Promise<void> {
    const run = eventData.run;

    // Update basic run information
    this.sql.exec(
      `
    UPDATE runs SET
      status = ?,
      is_active = ?,
      processor = ?,
      metadata = ?,
      modified_at = ?,
      error = ?
    WHERE run_id = ?
  `,
      run.status,
      run.is_active ? 1 : 0,
      run.processor,
      JSON.stringify(run.metadata || {}),
      run.modified_at,
      run.error ? JSON.stringify(run.error) : null,
      run.run_id
    );

    // Update output if provided in the event
    if (eventData.output) {
      this.sql.exec(
        `
        UPDATE runs SET
          output = ?,
          output_basis = ?
        WHERE run_id = ?
      `,
        JSON.stringify(eventData.output),
        eventData.output?.basis ? JSON.stringify(eventData.output.basis) : null,
        run.run_id
      );
    }

    // If the task is completed but we don't have output in the event, fetch it
    if (run.status === "completed" && !eventData.output) {
      await this.fetchAndUpdateRunResult(run.run_id);
    }
  }

  private async fetchAndUpdateRunResult(runId: string): Promise<void> {
    this.initializeParallelClient();

    if (!this.parallel) {
      console.error("Parallel client not initialized");
      return;
    }

    try {
      const result = await this.parallel.taskRun.result(runId, { timeout: 10 });
      const output = result.output;

      // Update run with full output data
      this.sql.exec(
        `
      UPDATE runs SET
        output = ?,
        output_basis = ?
      WHERE run_id = ?
    `,
        JSON.stringify(output),
        output?.basis ? JSON.stringify(output.basis) : null,
        runId
      );
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error(`Error fetching result for run ${runId}:`, error);
      }
    }
  }

  private async updateTaskGroupStatus(eventData: any): Promise<void> {
    const status = eventData.status;

    // Update the stored group data with new status
    const groupDataRaw = this.sql
      .exec("SELECT value FROM details WHERE key = ?", "group_data")
      .toArray()[0]?.value as string | undefined;

    let groupData = groupDataRaw ? JSON.parse(groupDataRaw) : {};
    groupData.status = status;

    this.sql.exec(
      "INSERT OR REPLACE INTO details (key, value) VALUES (?, ?)",
      "group_data",
      JSON.stringify(groupData)
    );

    // The completion will be handled by the next alarm check
  }

  private async handleCompletion(): Promise<void> {
    console.log(
      `[${new Date().toISOString()}] Task group completed - sending webhook`
    );

    // Send webhook if configured
    const webhookUrl = this.sql
      .exec("SELECT value FROM details WHERE key = ?", "webhook_url")
      .toArray()[0]?.value as string | undefined;
    const taskGroupId = this.sql
      .exec("SELECT value FROM details WHERE key = ?", "taskgroup_id")
      .toArray()[0]?.value as string | undefined;

    if (webhookUrl && taskGroupId) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: `${ORIGIN}/${taskGroupId}`,
          }),
        });
      } catch (error) {
        console.error("Webhook error:", error);
      }
    }
  }
}

function formatAsMarkdown(data: any): string {
  let md = `# Task Group Results\n\n`;
  md += `**Task Group ID:** ${data.id}\n`;
  md += `**Status:** ${data.status.is_active ? "🟡 Active" : "✅ Complete"}\n`;
  md += `**Total Runs:** ${data.status.num_task_runs}\n`;
  md += `**Running:** ${data.status.task_run_status_counts.running || 0}\n`;
  md += `**Completed:** ${data.status.task_run_status_counts.completed || 0}\n`;
  md += `**Created:** ${data.created_at}\n\n`;

  if (data.results.length === 0) {
    md += `*No results yet...*\n`;
    return md;
  }

  // Get all unique properties from results (excluding $id and status)
  const allProps = new Set<string>();
  for (const result of data.results) {
    Object.keys(result).forEach((key) => {
      if (key !== "$id" && key !== "status") {
        allProps.add(key);
      }
    });
  }

  const properties = Array.from(allProps);

  md += `## Results\n\n`;
  md += `| Status | ${properties
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" | ")} |\n`;
  md += `|--------|${properties.map(() => "--------").join("|")}|\n`;

  for (const result of data.results) {
    const statusEmoji =
      result.status === "completed"
        ? "✅"
        : result.status === "failed"
        ? "❌"
        : "🟡";

    // Get the full run data for this result to access confidence info
    const fullRun = data.runs.find((run) => run.run_id === result.$id);

    const status =
      result.status === "failed"
        ? `failed ${
            fullRun.error?.detail?.errors?.map((x) => x.error).join("<br>") ||
            ""
          }`
        : result.status;

    const values = properties.map((prop) => {
      const value = result[prop];
      if (value === undefined || value === null) return "";

      let valueStr =
        typeof value === "object"
          ? JSON.stringify(value, null, 2)
          : String(value);

      // Get confidence for this field if available
      let confidenceEmoji = "";
      if (fullRun?.output?.basis) {
        const fieldBasis = fullRun.output.basis.find(
          (basis) => basis.field === prop
        );
        if (fieldBasis?.confidence) {
          switch (fieldBasis.confidence) {
            case "high":
              confidenceEmoji = "🟢 ";
              break;
            case "medium":
              confidenceEmoji = "🟡 ";
              break;
            case "low":
              confidenceEmoji = "🔴 ";
              break;
          }
        }
      }

      // Replace newlines with <br> to maintain table structure while preserving line breaks
      valueStr = valueStr.replace(/\n/g, "<br>");

      return confidenceEmoji + valueStr;
    });

    md += `| ${statusEmoji} ${status} | ${values.join(" | ")} |\n`;
  }

  return md;
}

function formatAsHTML(data: any): string {
  // Get all unique properties from results (excluding $id and status)
  const allProps = new Set<string>();
  for (const result of data.results) {
    Object.keys(result).forEach((key) => {
      if (key !== "$id" && key !== "status") {
        allProps.add(key);
      }
    });
  }

  const properties = Array.from(allProps);

  return `<!DOCTYPE html>
<html>
<head>
  <title>Task Group ${data.id}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://assets.p0web.com/FTSystemMono-Regular.woff2" rel="preload" as="font" type="font/woff2" crossorigin>
  <style>
    @font-face {
      font-family: 'FT System Mono';
      src: url('https://assets.p0web.com/FTSystemMono-Regular.woff2') format('woff2');
    }
    body { font-family: 'FT System Mono', monospace; }
  </style>
  <script type="application/json" id="data">${JSON.stringify(data)}</script>
</head>
<body class="bg-gray-50 p-8">
  <div class="max-w-6xl mx-auto">
    <h1 class="text-3xl font-bold mb-4">Task Group ${data.id}</h1>
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <p><strong>Status:</strong> <span id="taskGroupStatus" class="${
            data.status.is_active ? "text-yellow-600" : "text-green-600"
          }">${data.status.is_active ? "Active" : "Complete"}</span></p>
          <p><strong>Total Runs:</strong> <span id="totalRuns">${
            data.status.num_task_runs
          }</span></p>
        </div>
        <div>
          <p><strong>Created:</strong> ${new Date(
            data.created_at
          ).toLocaleString()}</p>
          <p><strong>Modified:</strong> <span id="modifiedAt">${new Date(
            data.status.modified_at
          ).toLocaleString()}</span></p>
        </div>
      </div>
    </div>
    
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full" id="resultsTable">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            ${properties
              .map(
                (prop) => `
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${
              prop.charAt(0).toUpperCase() + prop.slice(1)
            }</th>`
              )
              .join("")}
          </tr>
        </thead>
        <tbody id="resultsBody" class="bg-white divide-y divide-gray-200">
          ${data.results
            .map((result, index) => {
              const values = properties.map((prop) => {
                const value = result[prop];
                if (value === undefined || value === null) return "";
                return typeof value === "object"
                  ? JSON.stringify(value, null, 2)
                  : String(value);
              });

              return `
            <tr data-run-id="${result.$id}" data-row-index="${index}">
              <td class="px-6 py-4 text-sm">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  result.status === "completed"
                    ? "bg-green-100 text-green-800"
                    : result.status === "failed"
                    ? "bg-red-100 text-red-800"
                    : "bg-yellow-100 text-yellow-800"
                }">
                  ${result.status}
                </span>
              </td>
              ${values
                .map(
                  (value) =>
                    `<td class="px-6 py-4 text-sm text-gray-900 whitespace-pre-wrap">${value}</td>`
                )
                .join("")}
            </tr>
            `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  </div>

  <script>
    const properties = ${JSON.stringify(properties)};
    
    // Setup SSE connection for live updates
    const eventSource = new EventSource(window.location.pathname + '.sse');
    
    eventSource.onmessage = function(event) {
      const message = JSON.parse(event.data);
      
      if (message.type === 'unauthorized') {
        // Redirect to auth page
        const currentUrl = encodeURIComponent(window.location.href);
        const redirect_uri = encodeURIComponent(\`\${window.location.origin}/callback?redirect_to=\${encodeURIComponent(currentUrl)}\`);
        const authUrl = \`\${window.location.origin}/authorize?client_id=\${window.location.hostname}&redirect_uri=\${redirect_uri}&response_type=code\`;
        window.location.href = authUrl;
      } else if (message.type === 'run_update') {
        updateRunRow(message.run, message.result);
      } else if (message.type === 'complete') {
        document.getElementById('taskGroupStatus').textContent = 'Complete';
        document.getElementById('taskGroupStatus').className = 'text-green-600';
        eventSource.close();
      }
    };

    function updateRunRow(run, result) {
      const row = document.querySelector('[data-run-id="' + run.run_id + '"]');
      if (!row) return;

      // Update status
      const statusCell = row.querySelector('td:first-child span');
      if (statusCell) {
        statusCell.textContent = run.status;
        statusCell.className = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ' + 
          (run.status === "completed" ? "bg-green-100 text-green-800" :
           run.status === "failed" ? "bg-red-100 text-red-800" : 
           "bg-yellow-100 text-yellow-800");
      }

      // Update content using the flat result object
      if (result) {
        const cells = row.querySelectorAll('td');
        
        properties.forEach((prop, index) => {
          const cellIndex = index + 1; // +1 because first cell is status
          if (cells[cellIndex]) {
            const value = result[prop];
            if (value !== undefined && value !== null) {
              cells[cellIndex].textContent = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
            }
          }
        });
      }
    }

    eventSource.onerror = function(event) {
      console.error('SSE connection error:', event);
      // Attempt to reconnect after 5 seconds
      setTimeout(() => {
        if (eventSource.readyState === EventSource.CLOSED) {
          location.reload();
        }
      }, 5000);
    };

    window.addEventListener('beforeunload', () => {
      eventSource.close();
    });
  </script>
</body>
</html>`;
}
