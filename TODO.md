# Fix terminal state of multitask-demo

- It still fucks up. Should probably add in additional check with db before final stop: https://claude.ai/chat/9fe5ed6a-b0e9-4824-baec-6aff51582863
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
