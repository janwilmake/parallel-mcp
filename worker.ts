/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";

export interface Env {
  TaskGroupDO: DurableObjectNamespace<TaskGroupDO>;
}

interface TaskGroupInput {
  /** If it's a URL, fetch that url, expecting an array of structured inputs data (JSON) */
  inputs: string | object[];
  /** If provided, will ping this URL once all tasks are done */
  webhook_url?: string;
  /** If not provided, will suggest processor */
  processor?: string;
  output_type: "text" | "json";
  /**
   * Provide either output_description or output_schema.
   *
   * - if description is provided for "text" output_type, text output will be available
   * - if description is provided for "json" output_type, will suggest output_schema
   * - if not provided, output_schema must be provided for "json" output_type
   * - output_schema will not work in combination with "text" output_type
   */
  output_description?: string;
  output_schema?: JSONSchema;
}

interface TaskGroupOutput {
  /** URL at origin with pathname equal to the task run ID */
  url: string;
}

interface TaskGroupResultOutput {
  taskgroup_id: string;
  metadata: any;
  status: {
    num_task_runs: number;
    task_run_status_counts: object;
    is_active: boolean;
    status_message: string;
    modified_at: string;
  };
  created_at: string;
  results: object[];
}

type JSONSchema = any;

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // Create task group endpoint
    if (url.pathname === "/v1beta/tasks/groups" && request.method === "POST") {
      try {
        const input: TaskGroupInput = await request.json();
        const parallelApiKey = request.headers.get("x-api-key");
        // Validate required fields
        if (!parallelApiKey) {
          return new Response(
            JSON.stringify({
              error: {
                message: "x-api-key header with Parallel API key is required",
              },
            }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }

        // Create a unique task group ID
        const taskGroupId = crypto.randomUUID();

        // Get the Durable Object instance
        const doId = env.TaskGroupDO.idFromName(taskGroupId);
        const doInstance = env.TaskGroupDO.get(doId);

        // Initialize the task group in the DO
        const doUrl = `https://tasks-mcp-demo.parallel.ai/${taskGroupId}`;
        await doInstance.initialize(input, doUrl, parallelApiKey);

        // Return the URL immediately
        const response: TaskGroupOutput = {
          url: doUrl,
        };

        return new Response(JSON.stringify(response), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({
            error: {
              message: error instanceof Error ? error.message : "Unknown error",
            },
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }
    }

    // Handle results endpoint
    const pathMatch = url.pathname.match(
      /^\/([^\/]+)(?:\.(json|md|html|sse))?$/
    );
    if (pathMatch && request.method === "GET") {
      const taskGroupId = pathMatch[1];
      const format =
        pathMatch[2] ||
        getFormatFromAcceptHeader(request.headers.get("accept"));

      const doId = env.TaskGroupDO.idFromName(taskGroupId);
      const doInstance = env.TaskGroupDO.get(doId);

      try {
        if (format === "sse") {
          // Server-Sent Events streaming
          return await doInstance.streamResults();
        } else {
          // Get static results
          const results = await doInstance.getResults(format);

          if (!results) {
            return new Response(
              JSON.stringify({
                error: { message: "Task group not found" },
              }),
              {
                status: 404,
                headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*",
                },
              }
            );
          }

          const contentType = getContentType(format);
          return new Response(results, {
            headers: {
              "Content-Type": contentType,
              "Access-Control-Allow-Origin": "*",
            },
          });
        }
      } catch (error) {
        return new Response(
          JSON.stringify({
            error: {
              message: error instanceof Error ? error.message : "Unknown error",
            },
          }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

function getFormatFromAcceptHeader(acceptHeader: string | null): string {
  if (!acceptHeader) return "json";

  if (acceptHeader.includes("text/html")) return "html";
  if (acceptHeader.includes("text/markdown")) return "md";
  if (acceptHeader.includes("text/event-stream")) return "sse";

  return "json";
}

function getContentType(format: string): string {
  switch (format) {
    case "html":
      return "text/html";
    case "md":
      return "text/markdown";
    case "sse":
      return "text/event-stream";
    default:
      return "application/json";
  }
}

export class TaskGroupDO extends DurableObject<Env> {
  private sql: SqlStorage;
  private env: Env;
  private taskGroupId?: string;
  private parallelTaskGroupId?: string;
  private webhook_url?: string;
  private output_type?: "text" | "json";
  private isCompleted = false;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.sql = state.storage.sql;
    this.env = env;
  }

  async initialize(input: TaskGroupInput, url: string, apiKey: string) {
    this.taskGroupId = url.split("/").pop()!;
    this.webhook_url = input.webhook_url;
    this.output_type = input.output_type;

    // Initialize database schema
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS task_groups (
        id TEXT PRIMARY KEY,
        parallel_taskgroup_id TEXT,
        webhook_url TEXT,
        output_type TEXT,
        created_at TEXT,
        completed_at TEXT,
        url TEXT
      )
    `);

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS task_runs (
        id TEXT PRIMARY KEY,
        task_group_id TEXT,
        parallel_run_id TEXT,
        status TEXT,
        input TEXT,
        output TEXT,
        created_at TEXT,
        modified_at TEXT
      )
    `);

    // Resolve inputs (fetch from URL if needed)
    let resolvedInputs: object[];
    if (typeof input.inputs === "string") {
      try {
        const response = await fetch(input.inputs);
        if (!response.ok) {
          throw new Error(`Failed to fetch inputs: ${response.status}`);
        }
        resolvedInputs = await response.json();
      } catch (error) {
        throw new Error(
          `Failed to fetch inputs from URL: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    } else {
      resolvedInputs = input.inputs;
    }

    // Create task group in Parallel API
    const createGroupResponse = await fetch(
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

    if (!createGroupResponse.ok) {
      throw new Error(
        `Failed to create task group: ${createGroupResponse.status}`
      );
    }

    const groupData = await createGroupResponse.json();
    this.parallelTaskGroupId = groupData.taskgroup_id;

    // Store task group info
    this.sql.exec(
      `INSERT INTO task_groups (id, parallel_taskgroup_id, webhook_url, output_type, created_at, url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      this.taskGroupId,
      this.parallelTaskGroupId,
      this.webhook_url || null,
      this.output_type,
      new Date().toISOString(),
      url
    );

    // Suggest processor if not provided
    let processor = input.processor || "core";
    if (!input.processor) {
      // Use suggest processor API if available
      try {
        const suggestResponse = await fetch(
          "https://api.parallel.ai/v1beta/tasks/suggest-processor",
          {
            method: "POST",
            headers: {
              "x-api-key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              task_spec: {
                output_schema: input.output_schema ||
                  input.output_description || { type: "auto" },
              },
              choose_processors_from: ["lite", "base", "core", "pro", "ultra"],
            }),
          }
        );

        if (suggestResponse.ok) {
          const suggestData: any = await suggestResponse.json();
          if (suggestData.recommended_processors?.length > 0) {
            processor = suggestData.recommended_processors[0];
          }
        }
      } catch (error) {
        console.log(
          "Failed to get processor suggestion, using default:",
          error
        );
      }
    }

    // Prepare task spec
    let taskSpec: any = null;
    if (input.output_schema || input.output_description) {
      taskSpec = {
        output_schema:
          input.output_type === "json"
            ? input.output_schema || { type: "auto" }
            : input.output_description || "Provide the requested information",
      };
    }

    // Format task spec for API
    let formattedTaskSpec: any = null;
    if (taskSpec) {
      formattedTaskSpec = {};
      if (taskSpec.output_schema) {
        if (input.output_type === "json") {
          formattedTaskSpec.output_schema = {
            type: "json",
            json_schema:
              typeof taskSpec.output_schema === "string"
                ? { type: "object", description: taskSpec.output_schema }
                : taskSpec.output_schema,
          };
        } else {
          formattedTaskSpec.output_schema = {
            type: "text",
            description:
              typeof taskSpec.output_schema === "string"
                ? taskSpec.output_schema
                : "Provide the requested information",
          };
        }
      }
    }

    // Create task runs
    const taskInputs = resolvedInputs.map((inputData) => ({
      input: inputData,
      processor: processor,
    }));

    const addRunsResponse = await fetch(
      `https://api.parallel.ai/v1beta/tasks/groups/${this.parallelTaskGroupId}/runs`,
      {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          default_task_spec: formattedTaskSpec,
          inputs: taskInputs,
        }),
      }
    );

    if (!addRunsResponse.ok) {
      throw new Error(
        `Failed to add runs to task group: ${addRunsResponse.status}`
      );
    }

    const runsData: any = await addRunsResponse.json();

    // Store task runs
    for (let i = 0; i < runsData.run_ids.length; i++) {
      const runId = runsData.run_ids[i];
      this.sql.exec(
        `INSERT INTO task_runs (id, task_group_id, parallel_run_id, status, input, created_at, modified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        crypto.randomUUID(),
        this.taskGroupId,
        runId,
        "queued",
        JSON.stringify(resolvedInputs[i]),
        new Date().toISOString(),
        new Date().toISOString()
      );
    }

    // Start streaming results in background
    this.ctx.waitUntil(this.startStreaming(apiKey));
  }

  async startStreaming(apiKey: string) {
    if (!this.parallelTaskGroupId) return;

    try {
      while (!this.isCompleted) {
        const streamResponse = await fetch(
          `https://api.parallel.ai/v1beta/tasks/groups/${this.parallelTaskGroupId}/runs?include_input=true&include_output=true`,
          {
            headers: {
              "x-api-key": apiKey,
            },
          }
        );

        if (!streamResponse.ok) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }

        if (!streamResponse.body) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }

        const reader = streamResponse.body.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n").filter((line) => line.trim());

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === "task_run.state" && data.run) {
                    await this.updateTaskRun(data);
                  }
                } catch (e) {
                  // Ignore parsing errors
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        // Check if all tasks are completed
        await this.checkCompletion();

        if (!this.isCompleted) {
          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    } catch (error) {
      console.error("Streaming error:", error);
      // Retry after a delay
      await new Promise((resolve) => setTimeout(resolve, 10000));
      if (!this.isCompleted) {
        this.ctx.waitUntil(this.startStreaming(apiKey));
      }
    }
  }

  async updateTaskRun(data: any) {
    const runId = data.run.run_id;
    const status = data.run.status;
    const output = data.output ? JSON.stringify(data.output) : null;

    this.sql.exec(
      `UPDATE task_runs 
       SET status = ?, output = ?, modified_at = ? 
       WHERE parallel_run_id = ?`,
      status,
      output,
      new Date().toISOString(),
      runId
    );
  }

  async checkCompletion() {
    const activeTasks = this.sql
      .exec(
        `SELECT COUNT(*) as count FROM task_runs 
       WHERE task_group_id = ? AND status IN ('queued', 'running', 'action_required')`,
        this.taskGroupId
      )
      .toArray()[0] as any;

    if (activeTasks.count === 0) {
      this.isCompleted = true;

      // Mark as completed
      this.sql.exec(
        `UPDATE task_groups SET completed_at = ? WHERE id = ?`,
        new Date().toISOString(),
        this.taskGroupId
      );

      // Send webhook if configured
      if (this.webhook_url) {
        const taskGroup = this.sql
          .exec(`SELECT url FROM task_groups WHERE id = ?`, this.taskGroupId)
          .toArray()[0] as any;

        try {
          await fetch(this.webhook_url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: taskGroup.url,
            }),
          });
        } catch (error) {
          console.error("Webhook error:", error);
        }
      }

      // Schedule cleanup alarm (30 days from now)
      this.ctx.storage.setAlarm(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
  }

  async alarm() {
    // Clean up after 30 days
    this.sql.exec(
      `DELETE FROM task_runs WHERE task_group_id = ?`,
      this.taskGroupId
    );
    this.sql.exec(`DELETE FROM task_groups WHERE id = ?`, this.taskGroupId);
  }

  async getResults(format: string): Promise<string | null> {
    const taskGroup = this.sql
      .exec(`SELECT * FROM task_groups WHERE id = ?`, this.taskGroupId)
      .toArray()[0] as any;

    if (!taskGroup) return null;

    const taskRuns = this.sql
      .exec(
        `SELECT * FROM task_runs WHERE task_group_id = ? ORDER BY created_at`,
        this.taskGroupId
      )
      .toArray();

    // Get status counts
    const statusCounts = this.sql
      .exec(
        `
      SELECT status, COUNT(*) as count 
      FROM task_runs 
      WHERE task_group_id = ? 
      GROUP BY status
    `,
        this.taskGroupId
      )
      .toArray();

    const statusCountsObj: any = {};
    let totalRuns = 0;
    let isActive = false;

    for (const row of statusCounts) {
      const r = row as any;
      statusCountsObj[r.status] = r.count;
      totalRuns += r.count;
      if (["queued", "running", "action_required"].includes(r.status)) {
        isActive = true;
      }
    }

    const results = taskRuns.map((run: any) => {
      const result: any = {
        run_id: run.parallel_run_id,
        status: run.status,
        input: run.input ? JSON.parse(run.input) : null,
      };

      if (run.output) {
        result.output = JSON.parse(run.output);
      }

      return result;
    });

    const resultOutput: TaskGroupResultOutput = {
      taskgroup_id: taskGroup.parallel_taskgroup_id,
      metadata: {},
      status: {
        num_task_runs: totalRuns,
        task_run_status_counts: statusCountsObj,
        is_active: isActive,
        status_message: isActive ? "Processing" : "Completed",
        modified_at: taskGroup.completed_at || taskGroup.created_at,
      },
      created_at: taskGroup.created_at,
      results: results.map((r) => r.output).filter(Boolean),
    };

    switch (format) {
      case "json":
        return JSON.stringify(resultOutput, null, 2);

      case "md":
        return this.formatAsMarkdown(resultOutput);

      case "html":
        return this.formatAsHtml(resultOutput);

      default:
        return JSON.stringify(resultOutput, null, 2);
    }
  }

  private formatAsMarkdown(data: TaskGroupResultOutput): string {
    let md = `# Task Group Results\n\n`;
    md += `**Status**: ${
      data.status.is_active ? "🟡 Processing" : "✅ Completed"
    }\n`;
    md += `**Total Tasks**: ${data.status.num_task_runs}\n`;
    md += `**Created**: ${new Date(data.created_at).toLocaleString()}\n\n`;

    if (data.results.length > 0) {
      md += `## Results\n\n`;

      // Create a simple table
      md += `| # | Result | Confidence |\n`;
      md += `|---|--------|------------|\n`;

      data.results.forEach((result: any, index) => {
        const confidence = this.getConfidenceEmoji(
          result.confidence || "medium"
        );
        const resultText = this.extractResultText(result);
        md += `| ${index + 1} | ${resultText} | ${confidence} |\n`;
      });
    }

    return md;
  }

  private formatAsHtml(data: TaskGroupResultOutput): string {
    const resultHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Task Group Results</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
        .status { padding: 10px; border-radius: 5px; margin: 20px 0; }
        .active { background-color: #fff3cd; border: 1px solid #ffeaa7; }
        .completed { background-color: #d4edda; border: 1px solid #c3e6cb; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
        .confidence { font-size: 1.2em; }
    </style>
</head>
<body>
    <h1>Task Group Results</h1>
    <div class="status ${data.status.is_active ? "active" : "completed"}">
        <strong>Status:</strong> ${
          data.status.is_active ? "🟡 Processing" : "✅ Completed"
        }<br>
        <strong>Total Tasks:</strong> ${data.status.num_task_runs}<br>
        <strong>Created:</strong> ${new Date(data.created_at).toLocaleString()}
    </div>
    
    ${
      data.results.length > 0
        ? `
    <h2>Results</h2>
    <table>
        <thead>
            <tr>
                <th>#</th>
                <th>Result</th>
                <th>Confidence</th>
            </tr>
        </thead>
        <tbody>
            ${data.results
              .map(
                (result: any, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${this.extractResultText(result)}</td>
                <td class="confidence">${this.getConfidenceEmoji(
                  result.confidence || "medium"
                )}</td>
            </tr>
            `
              )
              .join("")}
        </tbody>
    </table>
    `
        : "<p>No results available yet.</p>"
    }
    
    <script type="application/json" id="resultData">
    ${JSON.stringify(data, null, 2)}
    </script>
</body>
</html>`;

    return resultHtml;
  }

  private extractResultText(result: any): string {
    if (typeof result === "string") return result;
    if (result.content) return JSON.stringify(result.content);
    return JSON.stringify(result);
  }

  private getConfidenceEmoji(confidence: string): string {
    switch (confidence?.toLowerCase()) {
      case "high":
        return "🟢";
      case "medium":
        return "🟡";
      case "low":
        return "🔴";
      default:
        return "🟡";
    }
  }

  async streamResults(): Promise<Response> {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    this.ctx.waitUntil(
      (async () => {
        try {
          // Send initial status
          const results = await this.getResults("json");
          if (results) {
            const data = JSON.parse(results);
            await writer.write(
              new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
            );
          }

          // Keep connection alive and stream updates
          while (!this.isCompleted) {
            await new Promise((resolve) => setTimeout(resolve, 5000));

            const updatedResults = await this.getResults("json");
            if (updatedResults) {
              const data = JSON.parse(updatedResults);
              await writer.write(
                new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
              );

              if (!data.status.is_active) {
                this.isCompleted = true;
                break;
              }
            }
          }

          await writer.write(new TextEncoder().encode(`data: [DONE]\n\n`));
        } catch (error) {
          console.error("Stream error:", error);
        } finally {
          await writer.close();
        }
      })()
    );

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}

interface SqlStorage {
  exec<T extends Record<string, SqlStorageValue>>(
    query: string,
    ...bindings: any[]
  ): {
    columnNames: string[];
    raw<U extends SqlStorageValue[]>(): IterableIterator<U>;
    toArray(): T[];
    get rowsRead(): number;
    get rowsWritten(): number;
  };
  /** size in bytes */
  get databaseSize(): number;
}

type SqlStorageValue = ArrayBuffer | string | number | null;
