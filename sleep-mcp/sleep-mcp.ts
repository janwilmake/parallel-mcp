export default {
  fetch: (request: Request, env: Env) => {
    const url = new URL(request.url);
    if (url.pathname === "/mcp") {
      return handleSleepMcp(request);
    }
    return new Response(
      `Connect 'npx @modelcontextprotocol/inspector' with ${url.origin}/mcp`
    );
  },
};

type Env = {};

export async function handleSleepMcp(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  try {
    const message: any = await request.json();

    // Handle initialize
    if (message.method === "initialize") {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: message.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: {
              name: "Sleep-MCP-Server",
              version: "1.0.0",
            },
          },
        }),
        {
          headers: getCorsHeaders("application/json"),
        }
      );
    }

    // Handle initialized notification
    if (message.method === "notifications/initialized") {
      return new Response(null, {
        status: 202,
        headers: getCorsHeaders(),
      });
    }

    // Handle tools/list
    if (message.method === "tools/list") {
      const tools = [
        {
          name: "sleep",
          title: "Sleep Timer",
          description:
            "Sleep for a specified number of seconds with progress updates every 10 seconds",
          inputSchema: {
            type: "object",
            properties: {
              seconds: {
                type: "number",
                description: "The number of seconds to sleep",
                minimum: 1,
                maximum: 3600,
              },
            },
            required: ["seconds"],
          },
        },
      ];

      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: message.id,
          result: { tools },
        }),
        {
          headers: getCorsHeaders("application/json"),
        }
      );
    }

    // Handle tools/call
    if (message.method === "tools/call") {
      const { name, arguments: args, _meta } = message.params || {};

      if (name !== "sleep") {
        return createError(message.id, -32602, `Unknown tool: ${name}`);
      }

      if (!args?.seconds || typeof args.seconds !== "number") {
        return createError(
          message.id,
          -32602,
          "Missing or invalid required parameter: seconds (must be a number)"
        );
      }

      const seconds = Math.floor(args.seconds);
      if (seconds < 1 || seconds > 3600) {
        return createError(
          message.id,
          -32602,
          "Parameter 'seconds' must be between 1 and 3600"
        );
      }

      // Check if progress token is provided for progress notifications
      const progressToken = _meta?.progressToken;
      const shouldSendProgress = !!progressToken;

      try {
        if (shouldSendProgress) {
          // Handle with progress notifications using Server-Sent Events
          return handleSleepWithProgress(message, seconds, progressToken);
        } else {
          // Handle simple sleep without progress
          return handleSimpleSleep(message, seconds);
        }
      } catch (error) {
        return createToolError(
          message.id,
          `Error executing sleep: ${error.message}`
        );
      }
    }

    return createError(
      message.id,
      -32601,
      `Method not found: ${message.method}`
    );
  } catch (error) {
    return createError(null, -32700, "Parse error");
  }
}

async function handleSleepWithProgress(
  message: any,
  seconds: number,
  progressToken: string
): Promise<Response> {
  const stream = new ReadableStream({
    start(controller) {
      let currentSecond = 0;
      let interval: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      };

      const sendProgress = () => {
        if (currentSecond < seconds) {
          const progress = {
            jsonrpc: "2.0",
            method: "notifications/progress",
            params: {
              progressToken,
              progress: currentSecond,
              total: seconds,
              message: `Sleeping progress: ${currentSecond}/${seconds} seconds elapsed`,
            },
          };

          try {
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify(progress)}\n\n`)
            );
          } catch (error) {
            console.error("Error sending progress:", error);
            cleanup();
            controller.error(error);
          }

          const message = {
            jsonrpc: "2.0",
            method: "notifications/message",
            params: {
              level: "info",
              data: `Sleeping message: ${currentSecond}/${seconds} seconds elapsed`,
              logger: "user-service",
            },
          };
          try {
            controller.enqueue(
              new TextEncoder().encode(`data: ${JSON.stringify(message)}\n\n`)
            );
          } catch (error) {
            console.error("Error sending progress:", error);
            cleanup();
            controller.error(error);
          }
        }
      };

      const processSleep = async () => {
        try {
          // Send initial progress
          sendProgress();

          // Set up interval to send progress every 10 seconds
          interval = setInterval(() => {
            currentSecond = Math.min(currentSecond + 10, seconds);
            sendProgress();

            // If we've reached the end, finish up
            if (currentSecond >= seconds) {
              cleanup();

              // Send final response after a short delay to ensure progress was sent
              setTimeout(() => {
                const finalResponse = {
                  jsonrpc: "2.0",
                  id: message.id,
                  result: {
                    content: [
                      {
                        type: "text",
                        text: `Successfully slept for ${seconds} seconds`,
                      },
                    ],
                    isError: false,
                  },
                };

                try {
                  controller.enqueue(
                    new TextEncoder().encode(
                      `data: ${JSON.stringify(finalResponse)}\n\n`
                    )
                  );
                  controller.close();
                } catch (error) {
                  console.error("Error sending final response:", error);
                  controller.error(error);
                }
              }, 100);
            }
          }, 10000); // 10 seconds

          // Actually sleep for the full duration
          await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
        } catch (error) {
          cleanup();
          const errorResponse = {
            jsonrpc: "2.0",
            id: message.id,
            error: {
              code: -32603,
              message: `Error during sleep: ${error.message}`,
            },
          };

          try {
            controller.enqueue(
              new TextEncoder().encode(
                `data: ${JSON.stringify(errorResponse)}\n\n`
              )
            );
            controller.close();
          } catch (controllerError) {
            controller.error(controllerError);
          }
        }
      };

      processSleep();
    },
  });

  return new Response(stream, {
    headers: getCorsHeaders("text/event-stream", {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    }),
  });
}

async function handleSimpleSleep(
  message: any,
  seconds: number
): Promise<Response> {
  // Simple sleep without progress notifications
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));

  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        content: [
          {
            type: "text",
            text: `Successfully slept for ${seconds} seconds`,
          },
        ],
        isError: false,
      },
    }),
    {
      headers: getCorsHeaders("application/json"),
    }
  );
}

function getCorsHeaders(
  contentType?: string,
  additionalHeaders?: Record<string, string>
) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    ...additionalHeaders,
  };

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  return headers;
}

function createError(id: any, code: number, message: string) {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code, message },
    }),
    {
      status: 200, // JSON-RPC errors use 200 status
      headers: getCorsHeaders("application/json"),
    }
  );
}

function createToolError(id: any, errorMessage: string) {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: errorMessage,
          },
        ],
        isError: true,
      },
    }),
    {
      headers: getCorsHeaders("application/json"),
    }
  );
}
