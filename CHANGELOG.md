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

# Improve prompting MCP (2025-09-30)

✅ Ensure it doesn't use curl or fetch with the url, url is only for clicking. use other tool for retreiving as markdown

✅ Try editing prompt to instruct it to do a deep research TaskSDK. Maybe we can completely omit `inputs` since it's just text output. If the results there aren't great, maybe another tool for a deep research works better.

✅ The MCP should be able to choose to do a single deep research as well. A single deep research just requires inputting

✅ Make task run status viewable in markdown using the same `getResult` tool (keeps MCP definition short)

# W40 (2025-10-01)

- ✅ claude code can't use spaces for mcp name. use hyphen
- ✅ add json `input_schema` for inputs on the fly
- ✅ added source policy
- ✅ add neon db for events
- ✅ try sleeping mcp server
- 🟠 Try creating streaming chat completion from the streaming task endpoint
- 🪲 Tool execution failed (happens sometimes in Claude, unclear why)
- 🪲 When trying "json" with a string for output it may fail too
- 🪲 I dont think suggest is working properly @Jan Wilmake because for relatively simple tasks it is picking the pro processor
- 🤔 People expect a notification when it’s done. When it’s finished we wanna send a notification. Maybe email at the end? But we don’t have the chat link and we don’t have the email so that’s though!

Potential improvements:

- ✅ We can instruct the LLM it that needs to instruct the user to check back himself AND show a markdown BUTTON (not just link), and also ensure it never says things like "ill check later wehen its done" because it can't actually do that.
- ✅ Instruct LLM to format the `getResults` tool better (prompt LLM to do a table).
- ✅ We can improve the instructions for choosing the right processor.
- ✅ We can instruct not to use the `deepResearch` tool for small tasks (lite, core, base) OR we can add the ability to have these processors too (and calling it `singleTask` instead).

✅ Put docs back into `remote-mcp.mdx`

✅ Work on separate docs/blogpost for Task MCP with usage examples.
