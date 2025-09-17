# Search MCP everywhere using oauth provider

- ✅ Put oauth provider at https://parallel.simplerauth.com (central is good since it will be swapped by one with internal connection)
- 2. Search MCP proxy server (https://search-mcp.parallel.ai) that proxies `/mcp` to https://mcp.parallel.ai/v1beta/search_mcp and adds minimally needed additions to make it work with oauth. CAREFULLY test and document these additions!
- 3. Add to smithery. This is easy.
- 4. Use oauth provider from login.parallel.ai instead for `multitask-demo`

It'd be great to also start with a simple CLI `parallel` that can do tasks from a markdown spec.

# SSE cookbook

If there's still time, work on this

# Alarm MCP

Test this MCP in cursor, claude code, and others, and see what the limitations are and if they can be raised.

# Parallel combined MCP

- Search
- Task group with md-retrieval
- Alarm-MCP with notification-ping to stay alive
- Put this MCP in a subagent template. The process is always to use search first to make a list, then do a Parallel Task, then use the Alarm MCP (or just `sleep 900`), and get back with final results https://docs.claude.com/en/docs/claude-code/sub-agents#available-tools. This can be added as description to the agent context.

# Directories

Directories:

- vscode - https://github.com/mcp
- cursor - https://docs.cursor.com/en/tools/mcp and https://docs.claude.com/en/docs/claude-code/mcp#popular-mcp-servers
- mcp - https://modelcontextprotocol.io/examples and https://github.com/modelcontextprotocol/servers
- claude (code) - https://docs.claude.com/en/docs/agents-and-tools/remote-mcp-servers
- https://mcpservers.org
- https://lobehub.com/mcp
- https://mcp.so
- https://github.com/punkpeye/awesome-mcp-servers
- https://mcpmarket.com
- https://www.pulsemcp.com/servers
- https://github.com/jaw9c/awesome-remote-mcp-servers
- https://cline.bot/mcp-marketplace
- https://smithery.ai
- https://mcp.composio.dev and https://rube.app
- https://block.github.io/goose/docs/category/mcp-servers/
- https://glama.ai/mcp/servers
- https://zed.dev/extensions?filter=context-servers

Not sure

https://wassist.app/mcp/
https://docs.factory.ai/user-guides/factory-bridge/model-context-protocol
https://tessl.io
https://opencode.ai
https://ampcode.com/manual and https://sourcegraph.com
https://x.com/interaction/status/1966900969062773135

Create task group using MCP to enhance this list into actionable items on how actually get listed.
