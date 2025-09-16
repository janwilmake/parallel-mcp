/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import { Queryable, studioMiddleware } from "queryable-object";
import { parallelOauthProvider } from "../parallel-oauth-provider";
import { withMcp } from "with-mcp";

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

  // Handle root path - serve HTML interface
  if (url.pathname === "/" && request.method === "GET") {
    return new Response(await getIndexHTML(), {
      headers: { "content-type": "text/html" },
    });
  }

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
        "Set-Cookie": `access_token=${accessToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`, // 30 days
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
    // Create task group
    const groupResponse = await fetch(
      "https://api.parallel.ai/v1beta/tasks/groups",
      {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      }
    );

    if (!groupResponse.ok) {
      throw new Error(
        `Failed to create task group: ${groupResponse.statusText}`
      );
    }

    const groupData = await groupResponse.json();
    const taskGroupId = groupData.taskgroup_id;

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
        // Use suggest API to generate schema from description
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

    // Suggest processor if not provided
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

    // Add runs to group in batches
    const batchSize = 500;
    const runIds: string[] = [];

    for (let i = 0; i < runInputs.length; i += batchSize) {
      const batch = runInputs.slice(i, i + batchSize);

      const runsResponse = await fetch(
        `https://api.parallel.ai/v1beta/tasks/groups/${taskGroupId}/runs`,
        {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            default_task_spec: taskSpec,
            inputs: batch,
          }),
        }
      );

      if (!runsResponse.ok) {
        throw new Error(
          `Failed to add runs to group: ${runsResponse.statusText}`
        );
      }

      const runsData = await runsResponse.json();
      runIds.push(...runsData.run_ids);
    }

    // Initialize Durable Object
    const stub = env.TASK_GROUP_DO.get(
      env.TASK_GROUP_DO.idFromName(taskGroupId)
    );
    await stub.initialize(
      taskGroupId,
      apiKey,
      body.webhook_url,
      groupData,
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
  private streamController: AbortController | null = null;
  private isStreaming = false;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.env = env;
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
  }

  async initialize(
    taskGroupId: string,
    apiKey: string,
    webhookUrl: string | undefined,
    groupData: any,
    runIds: string[],
    originalInputs: object[]
  ): Promise<void> {
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

    // Start streaming
    this.startStreaming();
  }

  async getData(requestApiKey?: string): Promise<any> {
    const taskGroupId = this.sql
      .exec("SELECT value FROM details WHERE key = ?", "taskgroup_id")
      .toArray()[0]?.value;
    const groupDataRaw = this.sql
      .exec("SELECT value FROM details WHERE key = ?", "group_data")
      .toArray()[0]?.value;
    const groupData = groupDataRaw ? JSON.parse(groupDataRaw) : {};
    const storedApiKey = this.sql
      .exec("SELECT value FROM details WHERE key = ?", "api_key")
      .toArray()[0]?.value;

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
    for (const run of initialData.runs) {
      lastRunStates.set(run.run_id, {
        status: run.status,
        output: run.output,
        output_basis: run.output_basis,
      });
    }

    // Keep connection alive and send updates for individual run changes
    const updateInterval = setInterval(async () => {
      try {
        const currentData = await this.getData(requestApiKey);

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

  private async startStreaming(): Promise<void> {
    if (this.isStreaming) return;

    this.isStreaming = true;
    this.streamController = new AbortController();

    try {
      await this.streamTaskGroupData();
    } catch (error) {
      console.error("Streaming error:", error);
      // Retry after delay
      setTimeout(() => {
        this.isStreaming = false;
        this.startStreaming();
      }, 10000);
    }
  }

  private async streamTaskGroupData(): Promise<void> {
    const apiKey = this.sql
      .exec("SELECT value FROM details WHERE key = ?", "api_key")
      .toArray()[0]?.value as string | undefined;
    const taskGroupId = this.sql
      .exec("SELECT value FROM details WHERE key = ?", "taskgroup_id")
      .toArray()[0]?.value as string | undefined;

    if (!apiKey || !taskGroupId) return;

    const runsUrl = `https://api.parallel.ai/v1beta/tasks/groups/${taskGroupId}/runs?include_input=true&include_output=true`;

    while (this.isStreaming && !this.streamController?.signal.aborted) {
      try {
        const response = await fetch(runsUrl, {
          headers: { "x-api-key": apiKey },
          signal: this.streamController?.signal,
        });

        if (!response.ok) {
          throw new Error(`Stream request failed: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += new TextDecoder().decode(value);
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const eventData = JSON.parse(line.slice(6));
                if (eventData.type === "task_run.state") {
                  await this.updateRun(eventData);
                }
              } catch (error) {
                console.error("Error parsing event data:", error);
              }
            }
          }
        }

        // Check if all tasks are complete
        const activeRuns = this.sql
          .exec("SELECT COUNT(*) as count FROM runs WHERE is_active = 1")
          .toArray()[0];
        if (activeRuns?.count === 0) {
          await this.handleCompletion();
          break;
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Stream error:", error);
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    }
  }

  private async updateRun(eventData: any): Promise<void> {
    const run = eventData.run;
    const input = eventData.input;
    const output = eventData.output;

    this.sql.exec(
      `
      UPDATE runs SET
        status = ?,
        is_active = ?,
        processor = ?,
        metadata = ?,
        modified_at = ?,
        output = ?,
        output_basis = ?,
        error = ?
      WHERE run_id = ?
    `,
      run.status,
      run.is_active ? 1 : 0,
      run.processor,
      JSON.stringify(run.metadata || {}),
      run.modified_at,
      output ? JSON.stringify(output) : null,
      output?.basis ? JSON.stringify(output.basis) : null,
      run.error ? JSON.stringify(run.error) : null,
      run.run_id
    );
  }

  private async handleCompletion(): Promise<void> {
    this.isStreaming = false;

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

    // Schedule cleanup alarm (30 days)
    await this.state.storage.setAlarm(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }

  async alarm(): Promise<void> {
    // Clean up DO after 30 days
    await this.state.storage.deleteAll();
  }
}

function formatAsMarkdown(data: any): string {
  let md = `# Task Group Results\n\n`;
  md += `**Task Group ID:** ${data.id}\n`;
  md += `**Status:** ${data.status.is_active ? "🟡 Active" : "✅ Complete"}\n`;
  md += `**Total Runs:** ${data.status.num_task_runs}\n`;
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
    const values = properties.map((prop) => {
      const value = result[prop];
      if (value === undefined || value === null) return "";

      const valueStr =
        typeof value === "object" ? JSON.stringify(value) : String(value);
      return valueStr.slice(0, 50) + (valueStr.length > 50 ? "..." : "");
    });

    md += `| ${statusEmoji} ${result.status} | ${values.join(" | ")} |\n`;
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

async function getIndexHTML(): Promise<string> {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Parallel.ai Task Groups</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://assets.p0web.com/FTSystemMono-Regular.woff2" rel="preload" as="font" type="font/woff2" crossorigin>
  <style>
    @font-face {
      font-family: 'FT System Mono';
      src: url('https://assets.p0web.com/FTSystemMono-Regular.woff2') format('woff2');
    }
    body { font-family: 'FT System Mono', monospace; background: #fcfcfa; color: #1d1b16; }
    .neural { background: #d8d0bf; }
    .signal { color: #fb631b; }
  </style>
</head>
<body class="min-h-screen p-8">
  <div class="max-w-4xl mx-auto">
    <div class="text-center mb-8">
      <h1 class="text-4xl font-bold mb-2">Parallel.ai Task Groups</h1>
      <p class="text-gray-600">Batch process tasks at scale</p>
    </div>

    <div class="bg-white rounded-lg shadow-lg p-8 mb-8">
      <form id="taskForm" class="space-y-6">
        <div>
          <label class="block text-sm font-medium mb-2">Parallel API Key</label>
          <input type="password" id="apiKey" class="w-full p-3 border rounded-lg" placeholder="Enter your Parallel API key" required>
          <p class="text-sm text-gray-500 mt-1">Your API key is stored locally in your browser</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label class="block text-sm font-medium mb-2">Output Type</label>
            <select id="outputType" class="w-full p-3 border rounded-lg" required>
              <option value="json">JSON</option>
              <option value="text">Text</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium mb-2">Processor (optional)</label>
            <select id="processor" class="w-full p-3 border rounded-lg">
              <option value="">Auto-suggest</option>
              <option value="lite">Lite</option>
              <option value="base">Base</option>
              <option value="core">Core</option>
              <option value="pro">Pro</option>
              <option value="ultra">Ultra</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium mb-2">Output Description</label>
          <textarea id="outputDescription" class="w-full p-3 border rounded-lg h-24" placeholder="Describe what you want the output to contain..."></textarea>
        </div>

        <div>
          <label class="block text-sm font-medium mb-2">Output Schema (JSON only, optional)</label>
          <textarea id="outputSchema" class="w-full p-3 border rounded-lg h-32 font-mono text-sm" placeholder='{"type": "object", "properties": {...}}'></textarea>
        </div>

        <div>
          <label class="block text-sm font-medium mb-2">Inputs</label>
          <textarea id="inputs" class="w-full p-3 border rounded-lg h-48 font-mono text-sm" placeholder="Enter JSON array of inputs or URL to fetch inputs" required></textarea>
          <p class="text-sm text-gray-500 mt-1">Enter a JSON array of objects or a URL that returns a JSON array</p>
        </div>

        <div>
          <label class="block text-sm font-medium mb-2">Webhook URL (optional)</label>
          <input type="url" id="webhookUrl" class="w-full p-3 border rounded-lg" placeholder="https://your-webhook-url.com">
          <p class="text-sm text-gray-500 mt-1">We'll POST to this URL when all tasks are complete</p>
        </div>

        <div class="flex gap-4">
          <button type="submit" class="flex-1 signal bg-orange-500 text-white py-3 px-6 rounded-lg hover:bg-orange-600 transition-colors">
            Create Task Group
          </button>
          <button type="button" id="loadExample" class="neural px-6 py-3 rounded-lg hover:bg-gray-300 transition-colors">
            Load Example
          </button>
        </div>
      </form>
    </div>

    <div id="results" class="hidden bg-white rounded-lg shadow-lg p-6">
      <h2 class="text-2xl font-bold mb-4">Task Group Created!</h2>
      <p class="mb-4">Your task group URL: <a id="resultUrl" class="signal underline" target="_blank"></a></p>
      <div class="flex flex-wrap gap-2">
        <a id="jsonLink" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors" target="_blank">View JSON</a>
        <a id="htmlLink" class="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors" target="_blank">View HTML</a>
        <a id="mdLink" class="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 transition-colors" target="_blank">View Markdown</a>
        <a id="sseLink" class="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600 transition-colors" target="_blank">Live Stream</a>
        <a id="dbLink" class="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition-colors" target="_blank">Database Studio</a>
      </div>
    </div>
  </div>

  <script>
    // Load API key from localStorage
    const apiKeyInput = document.getElementById('apiKey');
    const savedApiKey = localStorage.getItem('parallelApiKey');
    if (savedApiKey) {
      apiKeyInput.value = savedApiKey;
    }

    // Save API key to localStorage on input
    apiKeyInput.addEventListener('input', () => {
      localStorage.setItem('parallelApiKey', apiKeyInput.value);
    });

    // Load example data
    document.getElementById('loadExample').addEventListener('click', () => {
      document.getElementById('outputType').value = 'json';
      document.getElementById('processor').value = 'lite';
      document.getElementById('outputDescription').value = 'Extract company information including CEO, industry, and revenue';
      document.getElementById('outputSchema').value = JSON.stringify({
        "type": "object",
        "properties": {
          "company_name": {"type": "string"},
          "ceo": {"type": "string"},
          "industry": {"type": "string"},
          "revenue": {"type": "string"}
        },
        "required": ["company_name", "ceo", "industry"]
      }, null, 2);
      document.getElementById('inputs').value = JSON.stringify([
        {"company_name": "Apple", "company_website": "https://apple.com"},
        {"company_name": "Microsoft", "company_website": "https://microsoft.com"},
        {"company_name": "Google", "company_website": "https://google.com"}
      ], null, 2);
    });

    // Handle form submission
    document.getElementById('taskForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = new FormData(e.target);
      const apiKey = document.getElementById('apiKey').value;
      
      if (!apiKey) {
        alert('Please enter your Parallel API key');
        return;
      }

      const data = {
        inputs: document.getElementById('inputs').value,
        output_type: document.getElementById('outputType').value,
        processor: document.getElementById('processor').value || undefined,
        output_description: document.getElementById('outputDescription').value || undefined,
        output_schema: document.getElementById('outputSchema').value ? JSON.parse(document.getElementById('outputSchema').value) : undefined,
        webhook_url: document.getElementById('webhookUrl').value || undefined
      };

      // Try to parse inputs as JSON, otherwise treat as URL
      try {
        data.inputs = JSON.parse(data.inputs);
      } catch {
        // Keep as string (URL)
      }

      try {
        const response = await fetch('/v1beta/tasks/multitask', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
          },
          body: JSON.stringify(data)
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const resultUrl = await response.text();
        
        // Show results
        const resultsDiv = document.getElementById('results');
        const urlLink = document.getElementById('resultUrl');
        
        urlLink.href = resultUrl;
        urlLink.textContent = resultUrl;
        
        // Set up format links
        document.getElementById('jsonLink').href = resultUrl + '.json';
        document.getElementById('htmlLink').href = resultUrl + '.html';
        document.getElementById('mdLink').href = resultUrl + '.md';
        document.getElementById('sseLink').href = resultUrl + '.sse';
        document.getElementById('dbLink').href = resultUrl + '.db';
        
        resultsDiv.classList.remove('hidden');
        resultsDiv.scrollIntoView({ behavior: 'smooth' });

      } catch (error) {
        alert('Error: ' + error.message);
      }
    });
  </script>
</body>
</html>`;
}
