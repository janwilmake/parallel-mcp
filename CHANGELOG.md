# CHANGELOG

## 2025-09-11

GOAL: Get it to work in Claude.ai and hosted on Smithery.

- ✅ initial implementation
- ✅ make mcp work via https://github.com/janwilmake/openapi-to-mcp

Next steps:

- ✅ Initial goal is to get it to work using [withMcp](https://github.com/janwilmake/with-mcp) with parallel oauth provider. This results in ability to use this within claude, chatgpt, cursor, vscode, etc etc etc and starting to add listings.
- ✅ Add oauth to viewer client

## 2025-09-16

OAuth

- ✅ Add oauth using `simplerauth` returning `parallel-api-key`
- ❌ Ensure kv doesn't create eventual consistency problems. If so, switch to DO.
- ❌ It may be easier to host this at `mcp-oauth.parallel.ai` and use in conjunction with `simplerauth-client`. This way, it's just a matter of switching the oauthHost to `mcp-oauth.parallel.ai`, and can then be used from any worker.
- ✅ Get it to work with mcp.agent-friendly.com (now having problem with cache)
- ✅ Get it to work with `npx @modelcontextprotocol/inspector`

# QOL (2025-09-16)

- ✅ For failed tasks, we need the reason in the markdown!
- ✅ Check how streaming works. Ideally we just want to stream the task group and fetch immediately when a result is in.
- ✅ Ensure total tasks and status in markdown are accurate
- ✅ improve cookie setting
- ✅ fix stream bug
- ✅ Show confidence as emoji in markdown (if present)
- ✅ Show entire result in each column with newlines being enters to maintain markdown table
