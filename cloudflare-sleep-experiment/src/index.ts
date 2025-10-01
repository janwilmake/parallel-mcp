import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
  server = new McpServer({
    name: "Authless Calculator",
    version: "1.0.0",
  });

  async init() {
    // Simple addition tool
    this.server.tool(
      "add",
      { a: z.number(), b: z.number() },
      async ({ a, b }) => ({
        content: [{ type: "text", text: String(a + b) }],
      })
    );

    this.server.tool("sleep", { seconds: z.number() }, async ({ seconds }) => {
      let currentSecond = 0;
      let interval: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      };
      // Set up interval to send progress every 10 seconds
      interval = setInterval(async () => {
        currentSecond = Math.min(currentSecond + 10, seconds);
        console.log("Still sleeping");
        await this.server.sendLoggingMessage({
          level: "alert",
          logger: "Still sleeping",
        });

        // If we've reached the end, finish up
        if (currentSecond >= seconds) {
          cleanup();

          // Send final response after a short delay to ensure progress was sent
          setTimeout(async () => {
            await this.server.sendLoggingMessage({
              level: "alert",
              logger: "Done sleeping",
            });
          }, 100);
        }
      }, 10000); // 10 seconds

      // Actually sleep for the full duration
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));

      return {
        content: [{ type: "text", text: `Slept for ${seconds} seconds` }],
      };
    });

    // Calculator tool with multiple operations
    this.server.tool(
      "calculate",
      {
        operation: z.enum(["add", "subtract", "multiply", "divide"]),
        a: z.number(),
        b: z.number(),
      },
      async ({ operation, a, b }) => {
        let result: number;
        switch (operation) {
          case "add":
            result = a + b;
            break;
          case "subtract":
            result = a - b;
            break;
          case "multiply":
            result = a * b;
            break;
          case "divide":
            if (b === 0)
              return {
                content: [
                  {
                    type: "text",
                    text: "Error: Cannot divide by zero",
                  },
                ],
              };
            result = a / b;
            break;
        }
        return { content: [{ type: "text", text: String(result) }] };
      }
    );
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
    }

    if (url.pathname === "/mcp") {
      return MyMCP.serve("/mcp").fetch(request, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  },
};
