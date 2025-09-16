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
            protocolVersion: "2025-03-26",
            capabilities: { tools: {} },
            serverInfo: {
              name: "Sleep-MCP-Server",
              version: "1.0.0",
            },
          },
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers":
              "Content-Type, Authorization, Accept",
          },
        }
      );
    }

    // Handle initialized notification
    if (message.method === "notifications/initialized") {
      return new Response(null, { status: 202 });
    }

    // Handle tools/list
    if (message.method === "tools/list") {
      const tools = [
        {
          name: "sleep",
          title: "Sleep Timer",
          description:
            "Sleep for a specified number of seconds with progress updates",
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
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers":
              "Content-Type, Authorization, Accept",
          },
        }
      );
    }

    // Handle tools/call
    if (message.method === "tools/call") {
      const { name, arguments: args, _meta } = message.params;

      if (name !== "sleep") {
        return createError(message.id, -32602, `Unknown tool: ${name}`);
      }

      if (!args.seconds || typeof args.seconds !== "number") {
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

      try {
        // Check accept header from original request
        const acceptHeader = request.headers.get("accept");
        const isStreaming = acceptHeader?.includes("text/event-stream");

        if (isStreaming) {
          // Handle streaming response with Server-Sent Events
          const stream = new ReadableStream({
            start(controller) {
              const processSleep = async () => {
                try {
                  let currentSecond = 0;

                  // Send progress notifications every second
                  const interval = setInterval(() => {
                    currentSecond++;

                    // Send progress notification
                    const notification = JSON.stringify({
                      jsonrpc: "2.0",
                      method: "notifications/progress",
                      params: {
                        progressToken: _meta.progressToken,
                        progress: currentSecond,
                        total: seconds,
                        message: `${currentSecond}/${seconds}`,
                      },
                    });

                    const event = `data: ${notification}\n\n`;
                    controller.enqueue(new TextEncoder().encode(event));

                    // Check if we're done
                    if (currentSecond >= seconds) {
                      clearInterval(interval);

                      // Send final response
                      const finalResponse = JSON.stringify({
                        jsonrpc: "2.0",
                        id: message.id,
                        result: {
                          content: [
                            {
                              type: "text",
                              text: `slept ${seconds} seconds`,
                            },
                          ],
                          isError: false,
                        },
                      });

                      controller.enqueue(
                        new TextEncoder().encode(`data: ${finalResponse}\n\n`)
                      );
                      controller.close();
                    }
                  }, 1000); // Send update every 1000ms (1 second)
                } catch (error) {
                  // Send error response
                  const errorResponse = JSON.stringify({
                    jsonrpc: "2.0",
                    id: message.id,
                    error: {
                      code: -32603,
                      message: `Error during sleep: ${error.message}`,
                    },
                  });
                  controller.enqueue(
                    new TextEncoder().encode(`data: ${errorResponse}\n\n`)
                  );
                  controller.close();
                }
              };

              processSleep();
            },
          });

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "POST, OPTIONS",
              "Access-Control-Allow-Headers":
                "Content-Type, Authorization, Accept",
            },
          });
        } else {
          // Handle non-streaming response (just sleep and return final result)
          await new Promise((resolve) => setTimeout(resolve, seconds * 1000));

          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              result: {
                content: [
                  {
                    type: "text",
                    text: `slept ${seconds} seconds`,
                  },
                ],
                isError: false,
              },
            }),
            {
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers":
                  "Content-Type, Authorization, Accept",
              },
            }
          );
        }
      } catch (error) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              content: [
                {
                  type: "text",
                  text: `Error executing sleep: ${error.message}`,
                },
              ],
              isError: true,
            },
          }),
          {
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "POST, OPTIONS",
              "Access-Control-Allow-Headers":
                "Content-Type, Authorization, Accept",
            },
          }
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

function createError(id: any, code: number, message: string) {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code, message },
    }),
    {
      status: 200, // JSON-RPC errors use 200 status
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
      },
    }
  );
}
