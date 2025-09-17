# Fix terminal state of multitask-demo

- It still fucks up. Should probably add in additional check with DB before final stop: https://claude.ai/chat/9fe5ed6a-b0e9-4824-baec-6aff51582863
- Can just use https://docs.parallel.ai/api-reference/task-api-beta/stream-task-group-runs
- Write high-level overview of task group API and send to khushi

# Search MCP everywhere using oauth provider

- 1. Put oauth provider at https://login.parallel.ai (central is good since it will be swapped by one with internal connection)
- 2. Search MCP proxy server (https://search-mcp.parallel.ai) that proxies `/mcp` to https://mcp.parallel.ai/v1beta/search_mcp and adds minimally needed additions to make it work with oauth. CAREFULLY test and document these additions!
- 3. Add to smithery. This is easy.
- Curate a list of places to list server (Top 10+ MCP directories). Work from SEO perspective

# Parallel combined MCP

- Search
- Task group with md-retrieval
- Alarm-MCP with notification-ping to stay alive
- Put this in a subagent template. the process is always to use search first to make a list, then do a Parallel Task, then use the Alarm MCP (or just `sleep 900`), and get back with final results https://docs.claude.com/en/docs/claude-code/sub-agents#available-tools

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

not sure

https://wassist.app/mcp/
https://docs.factory.ai/user-guides/factory-bridge/model-context-protocol
https://tessl.io
https://opencode.ai
https://ampcode.com/manual and https://sourcegraph.com
https://x.com/interaction/status/1966900969062773135
