/// <reference types="@cloudflare/workers-types" />
/// <reference lib="esnext" />

import { withMcp } from "with-mcp";
import Parallel from "parallel-web";
import { withSimplerAuth } from "simplerauth-client";
//@ts-ignore
import openapi from "./openapi.json";

interface TaskGroupInput {
  inputs: string | { [key: string]: unknown }[];
  processor?: string;
  output_type: "text" | "json";
  output_description?: string;
  output_schema?: any;
}

const fetchHandler = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);

  // Handle multitask creation
  if (url.pathname === "/v1beta/tasks/multitask" && request.method === "POST") {
    return handleMultitask(request);
  }

  // Handle task group results
  const pathMatch = url.pathname.match(
    /^\/([a-zA-Z0-9_-]+)(?:\.(json|md|html))?$/
  );
  if (pathMatch) {
    const taskGroupId = pathMatch[1];
    const format =
      pathMatch[2] || getFormatFromAccept(request.headers.get("accept"));

    return handleTaskGroupResults(request, taskGroupId, format);
  }

  return new Response("Not Found", { status: 404 });
};

export default {
  fetch: withMcp(
    withSimplerAuth(fetchHandler, {
      oauthProviderHost: "parallel.simplerauth.com",
      scope: "api",
      isLoginRequired: false,
    }),
    openapi,
    {
      authEndpoint: "/me",
      serverInfo: { name: "Parallel Multitask MCP", version: "1.0.0" },
      toolOperationIds: ["createMultitask", "getTaskGroupResultsMarkdown"],
    }
  ),
} satisfies ExportedHandler;

async function handleTaskGroupResults(
  request: Request,
  taskGroupId: string,
  format: string
): Promise<Response> {
  const apiKey = getApiKeyFromRequest(request);
  if (!apiKey) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/authorize?redirect_to=${encodeURIComponent(request.url)}`,
      },
    });
  }

  try {
    const data = await getTaskGroupData(apiKey, taskGroupId);

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

      default:
        return new Response(JSON.stringify(data, null, 2), {
          headers: { "content-type": "application/json;charset=utf8" },
        });
    }
  } catch (error) {
    console.error("Error fetching task group data:", error);
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}

async function handleMultitask(request: Request): Promise<Response> {
  const apiKey = getApiKeyFromRequest(request);
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        error: "Authentication required",
        detail:
          "Missing x-api-key or Authorization header. Please provide a valid API key.",
        status: 401,
      }),
      {
        status: 401,
        headers: { "content-type": "application/json" },
      }
    );
  }

  let body: TaskGroupInput;
  try {
    body = await request.json();
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Invalid JSON",
        detail: "Request body must be valid JSON",
        status: 400,
      }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    );
  }

  // Validate required fields
  if (!body.inputs || !body.output_type) {
    return new Response(
      JSON.stringify({
        error: "Missing required fields",
        detail: "Both 'inputs' and 'output_type' are required fields",
        required_fields: ["inputs", "output_type"],
        received_fields: Object.keys(body),
        status: 400,
      }),
      {
        status: 400,
        headers: { "content-type": "application/json" },
      }
    );
  }

  try {
    // Initialize Parallel SDK client
    const parallel = new Parallel({ apiKey });

    // Process inputs with detailed error handling
    let inputs: { [key: string]: unknown }[] = [];
    try {
      if (typeof body.inputs === "string") {
        try {
          inputs = JSON.parse(body.inputs);
          if (!Array.isArray(inputs)) {
            throw new Error("Parsed JSON is not an array");
          }
        } catch (parseError) {
          // Try as URL
          try {
            const url = new URL(body.inputs);
            const inputsResponse = await fetch(body.inputs);
            if (!inputsResponse.ok) {
              throw new Error(
                `Failed to fetch inputs from URL: ${inputsResponse.status} ${inputsResponse.statusText}`
              );
            }
            const contentType = inputsResponse.headers.get("content-type");
            if (!contentType?.includes("application/json")) {
              throw new Error(
                `URL returned non-JSON content type: ${contentType}`
              );
            }
            inputs = await inputsResponse.json();
            if (!Array.isArray(inputs)) {
              throw new Error("URL content is not a JSON array");
            }
          } catch (urlError) {
            throw new Error(
              `Failed to process inputs string - not valid JSON (${parseError.message}) and not valid URL (${urlError.message})`
            );
          }
        }
      } else {
        inputs = body.inputs;
        if (!Array.isArray(inputs)) {
          throw new Error("Inputs must be an array");
        }
      }
    } catch (inputError) {
      return new Response(
        JSON.stringify({
          error: "Invalid inputs format",
          detail: inputError.message,
          expected:
            "Array of objects or JSON string containing array or URL returning JSON array",
          status: 400,
        }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        }
      );
    }

    if (inputs.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Empty inputs",
          detail: "At least one input is required",
          status: 400,
        }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        }
      );
    }

    // Prepare task specification with error handling
    let taskSpec: any = {};
    let schemaGenerationWarnings: string[] = [];

    if (body.output_type === "json") {
      if (body.output_schema) {
        taskSpec.output_schema = {
          type: "json",
          json_schema: body.output_schema,
        };
      } else if (body.output_description) {
        // Use suggest API to generate schema from description
        try {
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
            const suggestion: any = await suggestResponse.json();
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
          } else {
            const errorText = await suggestResponse.text();
            schemaGenerationWarnings.push(
              `Failed to generate schema from description: ${suggestResponse.status} ${errorText}`
            );
            taskSpec.output_schema = { type: "auto" };
          }
        } catch (suggestError) {
          schemaGenerationWarnings.push(
            `Schema generation failed: ${suggestError.message}`
          );
          taskSpec.output_schema = { type: "auto" };
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

    // Suggest processor if not provided with error handling
    let processor = body.processor;
    let processorWarnings: string[] = [];

    if (!processor) {
      try {
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
          const suggestion: any = await processorResponse.json();
          processor = suggestion.recommended_processors?.[0] || "core";
          if (suggestion.recommended_processors?.length > 1) {
            processorWarnings.push(
              `Multiple processors recommended: ${suggestion.recommended_processors.join(
                ", "
              )}. Using: ${processor}`
            );
          }
        } else {
          const errorText = await processorResponse.text();
          processorWarnings.push(
            `Failed to get processor recommendation: ${processorResponse.status} ${errorText}. Using default: core`
          );
          processor = "core";
        }
      } catch (processorError) {
        processorWarnings.push(
          `Processor recommendation failed: ${processorError.message}. Using default: core`
        );
        processor = "core";
      }
    }

    // Create task group using SDK with error handling
    let taskGroup;
    try {
      taskGroup = await parallel.beta.taskGroup.create({
        metadata: {
          created_via: "task-mcp",
          output_type: body.output_type,
          processor_used: processor,
          inputs_count: inputs.length,
          created_at: new Date().toISOString(),
        },
      });
    } catch (createError) {
      return new Response(
        JSON.stringify({
          error: "Failed to create task group",
          detail: createError.message,
          status: 500,
        }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        }
      );
    }

    const taskGroupId = taskGroup.taskgroup_id;

    // Create task run inputs
    const runInputs = inputs.map((input, index) => ({
      input,
      processor: processor as string,
      metadata: {
        input_index: index.toString(),
      },
      // TODO: Add source_policy and mcp_servers when needed
      // source_policy,
      // mcp_servers,
    }));

    // Add runs to group in batches using SDK with detailed error tracking
    const batchSize = 500;
    const batchResults: any[] = [];
    let totalProcessed = 0;

    try {
      for (let i = 0; i < runInputs.length; i += batchSize) {
        const batch = runInputs.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(runInputs.length / batchSize);

        try {
          const result = await parallel.beta.taskGroup.addRuns(taskGroupId, {
            default_task_spec: taskSpec,
            inputs: batch,
          });

          batchResults.push({
            batch: batchNumber,
            success: true,
            runs_added: batch.length,
            run_ids: result.run_ids,
          });
          totalProcessed += batch.length;
        } catch (batchError) {
          batchResults.push({
            batch: batchNumber,
            success: false,
            error: batchError.message,
            attempted_runs: batch.length,
          });

          // Continue with other batches even if one fails
          console.error(
            `Batch ${batchNumber}/${totalBatches} failed:`,
            batchError
          );
        }
      }
    } catch (overallError) {
      return new Response(
        JSON.stringify({
          error: "Failed to add runs to task group",
          detail: overallError.message,
          task_group_id: taskGroupId,
          inputs_processed: totalProcessed,
          total_inputs: inputs.length,
          batch_results: batchResults,
          status: 500,
        }),
        {
          status: 500,
          headers: { "content-type": "application/json" },
        }
      );
    }

    const origin = new URL(request.url).origin;
    const successResponse = {
      task_group_url: `${origin}/${taskGroupId}`,
      task_group_id: taskGroupId,
      summary: {
        total_inputs: inputs.length,
        total_processed: totalProcessed,
        batches_processed: batchResults.length,
        successful_batches: batchResults.filter((b) => b.success).length,
        failed_batches: batchResults.filter((b) => !b.success).length,
      },
      processor_used: processor,
      warnings: [...schemaGenerationWarnings, ...processorWarnings].filter(
        (w) => w
      ),
      batch_details: batchResults,
    };

    // Return detailed response based on success/failure
    if (batchResults.every((b) => b.success)) {
      return new Response(successResponse.task_group_url, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } else {
      return new Response(
        JSON.stringify({
          ...successResponse,
          error: "Some batches failed",
          status: 207, // Multi-status
        }),
        {
          status: 207,
          headers: { "content-type": "application/json" },
        }
      );
    }
  } catch (error) {
    console.error("Error in handleMultitask:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        detail: error.message,
        stack: error.stack,
        status: 500,
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
}

async function getTaskGroupData(
  apiKey: string,
  taskGroupId: string
): Promise<any> {
  const parallel = new Parallel({ apiKey });

  // Get task group status
  const taskGroup = await parallel.beta.taskGroup.retrieve(taskGroupId);

  // Get all runs with their inputs and outputs
  const runs: any[] = [];
  const events = await parallel.beta.taskGroup.getRuns(taskGroupId, {
    include_input: true,
    include_output: true,
  });
  for await (const event of events) {
    if (event.type === "task_run.state") {
      runs.push({
        run_id: event.run.run_id,
        status: event.run.status,
        is_active: event.run.is_active,
        processor: event.run.processor,
        created_at: event.run.created_at,
        modified_at: event.run.modified_at,
        error: event.run.error,
        input: event.input?.input,
        output: event.output,
      });
    }
  }

  // Process runs to create flat results with merged input and output
  const results: any[] = [];

  for (const run of runs) {
    // Parse input data
    let inputData = {};
    if (run.input) {
      try {
        inputData =
          typeof run.input === "object" ? run.input : JSON.parse(run.input);
      } catch {
        inputData = { input: run.input };
      }
    }

    // Parse output data
    let outputContent = {};
    if (run.output?.content) {
      outputContent =
        typeof run.output.content === "object"
          ? run.output.content
          : { content: run.output.content };
    }

    // Create flat result object: {$id, status, ...input, ...output.content}
    const resultItem = {
      $id: run.run_id,
      status: run.status,
      ...inputData,
      ...outputContent,
    };

    results.push(resultItem);
  }

  return {
    id: taskGroupId,
    metadata: taskGroup.metadata || {},
    status: taskGroup.status,
    created_at: taskGroup.created_at,
    results,
    runs,
  };
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
  return "json";
}

function formatAsMarkdown(data: any): string {
  let md = `# Task Group Results\n\n`;
  md += `**Task Group ID:** ${data.id}\n`;
  md += `**Status:** ${data.status.is_active ? "🟡 Active" : "✅ Complete"}\n`;
  md += `**Total Runs:** ${data.status.num_task_runs}\n`;
  md += `**Running:** ${data.status.task_run_status_counts.running || 0}\n`;
  md += `**Completed:** ${data.status.task_run_status_counts.completed || 0}\n`;
  md += `**Failed:** ${data.status.task_run_status_counts.failed || 0}\n`;
  md += `**Created:** ${data.created_at}\n`;

  // Add status message if available
  if (data.status.status_message) {
    md += `**Status Message:** ${data.status.status_message}\n`;
  }

  md += `\n`;

  // Show overall warnings if any runs have warnings
  const runsWithWarnings = data.runs.filter(
    (run) => run.warnings && run.warnings.length > 0
  );
  if (runsWithWarnings.length > 0) {
    md += `## ⚠️ Warnings Summary\n\n`;
    md += `**Runs with warnings:** ${runsWithWarnings.length} of ${data.runs.length}\n\n`;

    // Collect unique warning types
    const warningTypes = new Set();
    runsWithWarnings.forEach((run) => {
      run.warnings.forEach((warning) => warningTypes.add(warning.type));
    });

    md += `**Warning types encountered:** ${Array.from(warningTypes).join(
      ", "
    )}\n\n`;
  }

  // Show overall errors if any runs failed
  const failedRuns = data.runs.filter((run) => run.status === "failed");
  if (failedRuns.length > 0) {
    md += `## ❌ Errors Summary\n\n`;
    md += `**Failed runs:** ${failedRuns.length} of ${data.runs.length}\n\n`;

    // Collect unique error types
    const errorTypes = new Set();
    failedRuns.forEach((run) => {
      if (run.error?.detail?.errors) {
        run.error.detail.errors.forEach((error) =>
          errorTypes.add(error.error || "Unknown error")
        );
      } else if (run.error?.message) {
        errorTypes.add(run.error.message);
      }
    });

    if (errorTypes.size > 0) {
      md += `**Error types encountered:**\n`;
      Array.from(errorTypes).forEach((errorType) => {
        md += `- ${errorType}\n`;
      });
      md += `\n`;
    }
  }

  if (data.results.length === 0) {
    md += `## Results\n\n*No results yet...*\n`;
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

  // Add legend for status and confidence indicators
  md += `**Legend:**\n`;
  md += `- Status: ✅ Completed | ❌ Failed | 🟡 Running/Queued\n`;
  md += `- Confidence: 🟢 High | 🟡 Medium | 🔴 Low\n`;
  md += `- ⚠️ = Has warnings | 🚨 = Has errors\n\n`;

  md += `| Status | ${properties
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" | ")} |\n`;
  md += `|--------|${properties.map(() => "--------").join("|")}|\n`;

  for (const result of data.results) {
    // Get the full run data for this result to access confidence, warning and error info
    const fullRun = data.runs.find((run) => run.run_id === result.$id);

    let statusEmoji = "";
    let statusText = result.status;

    switch (result.status) {
      case "completed":
        statusEmoji = "✅";
        break;
      case "failed":
        statusEmoji = "❌";
        break;
      case "running":
        statusEmoji = "🟡";
        break;
      case "queued":
        statusEmoji = "🟡";
        statusText = "queued";
        break;
      default:
        statusEmoji = "🟡";
    }

    // Add warning/error indicators
    let indicators = "";
    if (fullRun?.warnings && fullRun.warnings.length > 0) {
      indicators += " ⚠️";
    }
    if (result.status === "failed") {
      indicators += " 🚨";
    }

    // Format error details for failed runs
    if (result.status === "failed" && fullRun?.error) {
      let errorDetails = "";
      if (fullRun.error.detail?.errors) {
        errorDetails = fullRun.error.detail.errors
          .map((e) => e.error || "Unknown error")
          .join(", ");
      } else if (fullRun.error.message) {
        errorDetails = fullRun.error.message;
      }

      if (errorDetails.length > 100) {
        errorDetails = errorDetails.substring(0, 100) + "...";
      }

      statusText = `failed: ${errorDetails}`;
    }

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

      // Truncate very long values but preserve line breaks with <br>
      if (valueStr.length > 200) {
        valueStr = valueStr.substring(0, 200) + "...";
      }
      valueStr = valueStr.replace(/\n/g, "<br>");

      return confidenceEmoji + valueStr;
    });

    md += `| ${statusEmoji} ${statusText}${indicators} | ${values.join(
      " | "
    )} |\n`;
  }

  // Add detailed warnings section if there are any
  if (runsWithWarnings.length > 0) {
    md += `\n## ⚠️ Detailed Warnings\n\n`;

    runsWithWarnings.forEach((run, index) => {
      md += `### Run ${index + 1}: ${run.run_id}\n\n`;
      run.warnings.forEach((warning) => {
        md += `- **${warning.type}**: ${warning.message}\n`;
        if (warning.detail) {
          md += `  - Detail: ${JSON.stringify(warning.detail)}\n`;
        }
      });
      md += `\n`;
    });
  }

  // Add detailed errors section if there are any
  if (failedRuns.length > 0) {
    md += `\n## 🚨 Detailed Errors\n\n`;

    failedRuns.forEach((run, index) => {
      md += `### Failed Run ${index + 1}: ${run.run_id}\n\n`;
      if (run.error) {
        md += `**Error ID:** ${run.error.ref_id}\n\n`;
        md += `**Message:** ${run.error.message}\n\n`;

        if (run.error.detail?.errors) {
          md += `**Specific Errors:**\n`;
          run.error.detail.errors.forEach((error) => {
            md += `- ${error.error}\n`;
          });
        }

        if (run.error.detail && Object.keys(run.error.detail).length > 1) {
          md += `\n**Additional Details:**\n`;
          md += `\`\`\`json\n${JSON.stringify(
            run.error.detail,
            null,
            2
          )}\n\`\`\`\n`;
        }
      }
      md += `\n`;
    });
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
    body { 
      font-family: 'FT System Mono', monospace;
      background: #fcfcfa;
      color: #1d1b16;
    }
    .signal { color: #fb631b; }
  </style>
</head>
<body class="bg-gray-50 p-8">
  <div class="max-w-6xl mx-auto">
    <div class="text-center mb-8">
      <h1 class="text-4xl font-bold mb-4">Task Group ${data.id}</h1>
      <div class="flex justify-center gap-2 mb-6">
        <a href="${
          data.id
        }.json" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors">
          View JSON
        </a>
        <a href="${
          data.id
        }.md" class="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 transition-colors">
          View Markdown
        </a>
        <button onclick="location.reload()" class="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition-colors">
          Refresh
        </button>
        <a href="/" class="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600 transition-colors">
          Create New
        </a>
      </div>
    </div>
    
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p><strong>Status:</strong> <span class="${
            data.status.is_active ? "text-yellow-600" : "text-green-600"
          }">${data.status.is_active ? "🟡 Active" : "✅ Complete"}</span></p>
        </div>
        <div>
          <p><strong>Total Runs:</strong> ${data.status.num_task_runs}</p>
        </div>
        <div>
          <p><strong>Running:</strong> ${
            data.status.task_run_status_counts.running || 0
          }</p>
        </div>
        <div>
          <p><strong>Completed:</strong> ${
            data.status.task_run_status_counts.completed || 0
          }</p>
        </div>
      </div>
      <div class="mt-4">
        <p><strong>Created:</strong> ${new Date(
          data.created_at
        ).toLocaleString()}</p>
        <p><strong>Modified:</strong> ${new Date(
          data.status.modified_at
        ).toLocaleString()}</p>
      </div>
    </div>
    
    ${
      data.results.length === 0
        ? `<div class="bg-white rounded-lg shadow p-6 text-center">
           <p class="text-gray-500 italic">No results yet...</p>
         </div>`
        : `<div class="bg-white rounded-lg shadow overflow-hidden">
          <table class="min-w-full">
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
            <tbody class="bg-white divide-y divide-gray-200">
              ${data.results
                .map((result) => {
                  // Get the full run data for this result to access confidence and error info
                  const fullRun = data.runs.find(
                    (run) => run.run_id === result.$id
                  );

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

                    return confidenceEmoji + valueStr;
                  });

                  const statusEmoji =
                    result.status === "completed"
                      ? "✅"
                      : result.status === "failed"
                      ? "❌"
                      : "🟡";

                  const statusText =
                    result.status === "failed"
                      ? `failed ${
                          fullRun?.error?.detail?.errors
                            ?.map((x) => x.error)
                            .join(", ") || ""
                        }`
                      : result.status;

                  return `
                <tr>
                  <td class="px-6 py-4 text-sm">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      result.status === "completed"
                        ? "bg-green-100 text-green-800"
                        : result.status === "failed"
                        ? "bg-red-100 text-red-800"
                        : "bg-yellow-100 text-yellow-800"
                    }">
                      ${statusEmoji} ${statusText}
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
        </div>`
    }
  </div>
</body>
</html>`;
}
