/// <reference types="@cloudflare/workers-types" />
/// <reference lib="esnext" />

import { withMcp } from "with-mcp";
import Parallel from "parallel-web";

//@ts-ignore
import openapi from "./openapi.json";
const PROVIDER_TOKEN_ENDPOINT = "https://parallel.simplerauth.com/token";
const PROVIDER_AUTHORIZE_ENDPOINT =
  "https://parallel.simplerauth.com/authorize";

interface TaskGroupInput {
  inputs: string | { [key: string]: unknown }[];
  webhook_url?: string;
  processor?: string;
  output_type: "text" | "json";
  output_description?: string;
  output_schema?: any;
}

// Add PKCE helper functions
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function generateState(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

const fetchHandler = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);

  // Handle OAuth callback from oauth provider
  if (url.pathname === "/callback" && request.method === "GET") {
    return handleOauthCallback(request);
  }

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
  fetch: withMcp(fetchHandler, openapi, {
    authEndpoint: "/me",
    serverInfo: { name: "Parallel Multitask MCP", version: "1.0.0" },
    toolOperationIds: ["createMultitask", "getTaskGroupResultsMarkdown"],
  }),
} satisfies ExportedHandler;

async function handleOauthCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const redirectTo = url.searchParams.get("redirect_to");

  if (!code) {
    return new Response("Missing authorization code", { status: 400 });
  }

  // Verify state parameter from cookie
  const cookieHeader = request.headers.get("Cookie");
  const cookies = parseCookies(cookieHeader);
  const storedState = cookies["oauth_state"];
  const codeVerifier = cookies["code_verifier"];

  if (!storedState || state !== storedState) {
    return new Response("Invalid state parameter", { status: 400 });
  }

  if (!codeVerifier) {
    return new Response("Missing code verifier", { status: 400 });
  }

  try {
    // Exchange code for access token with external OAuth provider
    const tokenResponse = await fetch(PROVIDER_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        client_id: url.hostname,
        redirect_uri: `${url.origin}/callback`,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      const fail = await tokenResponse.text();
      throw new Error(
        "Token exchange failed: status = " + tokenResponse.status + ": " + fail
      );
    }

    const tokenData: { access_token: string } = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const securePart = url.hostname === "localhost" ? "" : "Secure; ";

    // Clear OAuth state cookies and set access token cookie
    const clearStateCookie = `oauth_state=; HttpOnly; ${securePart}SameSite=Lax; Path=/; Max-Age=0`;
    const clearVerifierCookie = `code_verifier=; HttpOnly; ${securePart}SameSite=Lax; Path=/; Max-Age=0`;
    const accessTokenCookie = `access_token=${accessToken}; HttpOnly; ${securePart}SameSite=Lax; Path=/; Max-Age=2592000`; // 30 days

    const headers = new Headers({
      Location: redirectTo || "/",
    });
    headers.append("Set-Cookie", clearStateCookie);
    headers.append("Set-Cookie", clearVerifierCookie);
    headers.append("Set-Cookie", accessTokenCookie);

    return new Response(null, { status: 302, headers });
  } catch (error) {
    console.error("OAuth callback error:", error);
    return new Response("OAuth callback failed", { status: 500 });
  }
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (cookieHeader) {
    cookieHeader.split(";").forEach((cookie) => {
      const [name, ...rest] = cookie.trim().split("=");
      if (name && rest.length > 0) {
        cookies[name] = decodeURIComponent(rest.join("="));
      }
    });
  }
  return cookies;
}

async function handleTaskGroupResults(
  request: Request,
  taskGroupId: string,
  format: string
): Promise<Response> {
  const apiKey = getApiKeyFromRequest(request);
  if (!apiKey) {
    const url = new URL(request.url);

    // Generate PKCE parameters for OAuth flow
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();

    // Store OAuth state and code verifier in cookies
    const securePart = url.hostname === "localhost" ? "" : "Secure; ";
    const stateCookie = `oauth_state=${state}; HttpOnly; ${securePart}SameSite=Lax; Path=/; Max-Age=600`; // 10 minutes
    const verifierCookie = `code_verifier=${codeVerifier}; HttpOnly; ${securePart}SameSite=Lax; Path=/; Max-Age=600`; // 10 minutes

    const currentUrl = encodeURIComponent(request.url);
    const redirectUri = encodeURIComponent(
      `${url.origin}/callback?redirect_to=${currentUrl}`
    );

    // Build authorization URL for external OAuth provider
    const authUrl = new URL(PROVIDER_AUTHORIZE_ENDPOINT);
    authUrl.searchParams.set("client_id", url.hostname);
    authUrl.searchParams.set(
      "redirect_uri",
      `${url.origin}/callback?redirect_to=${currentUrl}`
    );
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("scope", "api");
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

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
      <p class="text-gray-600 mb-6">Please authorize to view the task group results.</p>
      <a href="${authUrl.toString()}" class="inline-block bg-orange-500 text-white px-6 py-3 rounded-lg hover:bg-orange-600 transition-colors">
        Authorize Access
      </a>
    </div>
  </div>
</body>
</html>`;

    const headers = new Headers({
      "content-type": "text/html",
    });
    headers.append("Set-Cookie", stateCookie);
    headers.append("Set-Cookie", verifierCookie);
    return new Response(unauthorizedHtml, { status: 401, headers });
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

    // Process inputs
    let inputs: { [key: string]: unknown }[] = [];
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
        const suggestion: any = await processorResponse.json();
        processor = suggestion.recommended_processors?.[0] || "core";
      } else {
        processor = "core";
      }
    }

    // Create task group using SDK with webhook URL in metadata
    const taskGroup = await parallel.beta.taskGroup.create({
      metadata: {
        created_via: "multitask-demo",
        output_type: body.output_type,
        webhook_url: body.webhook_url,
      },
    });

    const taskGroupId = taskGroup.taskgroup_id;

    // TODO: It'd be great to add these at some point, although mcp_servers is hard to make work for the MCP.

    // {include_domains,exclude_domains}
    const source_policy = undefined;

    const mcp_servers = undefined;
    // Create task run inputs
    const runInputs = inputs.map((input) => ({
      input,
      processor: processor as string,
      // source_policy,
      // mcp_servers,
    }));

    // Add runs to group in batches using SDK
    const batchSize = 500;

    for (let i = 0; i < runInputs.length; i += batchSize) {
      const batch = runInputs.slice(i, i + batchSize);

      await parallel.beta.taskGroup.addRuns(taskGroupId, {
        default_task_spec: taskSpec,
        inputs: batch,
      });
    }
    // TODO: webhook_url should be used

    const origin = new URL(request.url).origin;
    return new Response(`${origin}/${taskGroupId}`);
  } catch (error) {
    console.error("Error in handleMultitask:", error);
    return new Response(`Error: ${error.message}`, { status: 500 });
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
            fullRun?.error?.detail?.errors?.map((x) => x.error).join("<br>") ||
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
