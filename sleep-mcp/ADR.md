## Consideration for sending notifications

Our goal:

- `/mcp` with single tool `multitask`: proxies to this API passing MCP request session ID as part of the webhook url
- has a `/webhook` endpoint that sends a notification back to the right session (this should be proven first to work!)

To send notifications, the connection needs to remain open with SSE. It's unclear if clients will do this for up to an hour, probably most desktop clients do, but for example, does ChatGPT does it after the chat has completed? Support may be limited. Also, this still doesn't give us the desired outcome of having the LLM respond to the task results after they're done. There are several proposals in the MCP spec that may improve the situation.

Because of this, my initial goal is to see if the current implementation can already be useful without notification. I think it does provide value as it allows for much easier task experimentation with multiple items and multiple configurations, then viewing the results in different tabs as they come back.

Friday if no oauth yet:

- Create demo without oauth if preferred, test output quality and ease of use
  - requires with-mcp or openapi-to-mcp to support `?apiKey` (and `.well-known/mcp-config`)
- Test if adding `/.well-known/mcp-config` works for curlmcp. If so, ask saunack to add to https://docs.parallel.ai/features/remote-mcp.
- Add https://docs.parallel.ai/features/remote-mcp to MCP registry https://blog.modelcontextprotocol.io/posts/2025-09-08-mcp-registry-preview/
