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

# Fix terminal state of task-mcp (2025-09-17)

- ❌ It still fucks up. Should probably add in additional check with DB before final stop: https://claude.ai/chat/9fe5ed6a-b0e9-4824-baec-6aff51582863
- 🔥✅ Can just use https://docs.parallel.ai/api-reference/task-api-beta/stream-task-group-runs
- ✅ Write high-level overview of task group API in docs, make PR

# Search MCP everywhere using oauth provider (2025-09-17)

- ✅ Put oauth provider at https://parallel.simplerauth.com (central is good since it will be swapped by one with internal connection)
- ✅ Search MCP proxy server
- ✅ Use oauth provider from login.parallel.ai instead for `task-mcp`

# Task MCP (2025-09-18)

**Improve oauth provider setup**

- ✅ Use simplerauth in `task-mcp` and test again for it to work everywhere!
- ✅ Remove UX of "use previous key", just add eye to view/hide previous one in input.
- ✅ `simplerauth-client`: needs `pathPrefix` or to use `.well-known` to know where to go (will require extra fetch)
- ✅ `simplerauth-client` Must have the same workings as using `parallel-oauth-provider` directly. Test it actually works everywhere including cursor/vscode

**Improve task MCP**

- ✅ Remove callback functionality; instruct manual polling, later replace with [automatic mcp polling when this SEP lands](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1391)
- ✅ Ensure task warnings/errors show up in the markdown for easier iteration

**Deployment**

- ✅ Improve README and repo name/structure
- ✅ rename to search-mcp.parallel.ai and task-mcp.parallel.ai
- ✅ deploy both on smithery
- ✅ Create Draft PR for new MCP docs: https://github.com/shapleyai/documentation/pull/226
- ✅ Create dogfooding guide (test myself first) and share in Slack

# Improvements (GOAL: Task Group MCP stable, works with reminder after it's done) - 2025-09-23

🤔 **Devtool, no-coder target audience, or both?** - Determine what the target user is: developer building an app with parallel (devtool) or no-coder that doesn't know anything about the tasks? The latter needs better guardrails and a simpler API with less control.

- ✅ Put login provider at `oauth.parallel.ai` for better trust
- ✅ Remove de-emphasize chatgpt from docs. make it a group table with 2 mcps
- ✅ Get merged: https://github.com/shapleyai/documentation/pull/221
- ✅ Ensure the processor is added as metadata, and all metadata is shown in markdown response
- ✅ For the result markdown tool, add a way to retrieve the basis too, below the table, as JSON: optional parameter `basis?:"index:{number}"|"field:{string}"|"all"` for specific row (by index) or field (by field name) or all basis content. Ensure that when the table is shown, it shows the index as first column before status.
- ✅ make parameter output work as the openapi suggests
- ✅ Make output description task spec aware
- ✅ Make processor description pricing aware
- ✅ Add description for inputs to be cautious adding too many inputs at once unless the user explicitnly says all
- ✅ Logo doesnt show up for task-mcp.parallel.ai. In claude it does though so it's fine I guess.
