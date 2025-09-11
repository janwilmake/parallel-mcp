# Parallel Tasks MCP

There are 3 components to this:

1. [Parallel Multitask API](https://github.com/janwilmake/parallel-multitask)
2. [Parallel OAuth Provider](https://github.com/janwilmake/universal-mcp-oauth/tree/main/parallel-oauth-provider) with [simplerauth-client](https://github.com/janwilmake/universal-mcp-oauth/tree/main/simplerauth-client) for MCP-compliant User Authentication
3. The MCP

# The MCP

- `/mcp` with single tool `multitask`: proxies to this API passing MCP request session ID as part of the webhook url
- has a `/webhook` endpoint that sends a notification back to the right session (this should be proven first to work!)

MCP context:

- MCP Specification: https://uithub.com/modelcontextprotocol/modelcontextprotocol/tree/main/docs/specification/2025-06-18?lines=false
- Typescript JSON RPC methods: https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/refs/heads/main/schema/2025-03-26/schema.ts or new https://uithub.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2025-06-18/schema.ts
- with-mcp implementation: https://uithub.com/janwilmake/with-mcp/blob/main/with-mcp.ts

Other Context:

- Parallel Multitask API: https://multitask-demo.parallel.ai/openapi.json
- Parallel oauth provider url: https://oauth-demo.parallel.ai
- Simplerauth-client: https://uithub.com/janwilmake/universal-mcp-oauth/blob/main/simplerauth-client/README.md

# Consideration for sending notifications

To send notifications, the connection needs to remain open with SSE. It's unclear if clients will do this. Also, this still doesn't give us the desired outcome of having the LLM respond to the task results after they're done. Because of this, my initial goal is to see if the current implementation can already be useful. I think it does provide value as it allows for much easier task experimentation with multiple items and multiple configurations, then viewing the results in different tabs as they come back.
