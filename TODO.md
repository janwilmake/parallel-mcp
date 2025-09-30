# Failure modes

- People may have many other tools enabled (e.g. if they have a `fetch` tool, the LLM may try to use it with the URL, which won't work)
- People could use this MCP with a tiny model. The tiny model won't be as good reasoning
- People may upload unreadable files or very large input datasets. This could clutter the context window making it harder to be used.

How to test the MCP properly? This is HARD.

# Pending to be fixed (Manvesh)

- input shows in several columns (now shows 1 column if input is structured data)
- deep research platform url works
- ✅ cursor deeplink works for installation
- footnotes are in markdown syntax ([^N])

# Reasoning traces

🤔 The team wants to see reasoning traces while the task is being executed. This would mean blocking the thing to continue and showing updates, or, if async tool-calls are possible, sending status updates to the client to show latest reasoning.

- Option 1: Long running MCP with streaming notifications (may not work >30s in most clients, may work well in some coding clients)
- Option 2: Wait for async MCP (https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1391)
- Option 3: Creating a streaming Chat Completions endpoint from it, so it can be added to different clients, and returns reasoning traces.
- Option 4: Explore using MCP UI so we actually can have the full-fledged platform interface, but control stuff with MCP

Best course of action now: start with AISDK `@parallel-web/ai-sdk` with:

- easy to configure search as tool (ability to pre-configure with simple ways to alter how large response-context will be)
- search chat completions as model
- task to `/chat/completions` stream proxy and use that for `generateText`, `generateObject`, `streamText`, `streamObject`

The chat completions endpoint is then also able to be used as MCP (use notifications as in https://github.com/janwilmake/chat-completions-mcp)

# Testing & Demos

Goal: getting hands dirty, lots of experimentation. Test more, uncover failure modes, fix these.

Think about:

- which MCP client
- which data source / data destination
- authentic use cases

- VScode demo: new!

- **ChatGPT Demo**: User uploads CSV and says what we need to add, and instructions on repeating with first 5 until quality is good. Task Group API is used repeatedly. Finally, perform batch API on all rows. Download final CSV.

- **Subagent (Claude Code or Cursor)** - Put this MCP in a subagent template. The process is always to use search first to make a list, then do a Parallel Task, then use the Alarm MCP (or just `sleep 900`), and get back with final results https://docs.claude.com/en/docs/claude-code/sub-agents#available-tools. This can be added as description to the agent context. The input can come from a JSON file, the outputs can be written to a JSON files as well. Ideally we perform an experiment of choosing processors here: it can be an example of an experiemnt where we compare chaining tasks with doing one bigger task.

- **CRM (Attio) input**. First, get the people that I follow on X into a CRM. Ask to enrich my people with social media based on logical proof, put back a summary into CRM.

- **Claude Demo**: use Parallel Search to find all MCP directories. Then determine an SEO strategy for each via a task. Output is a small actionable list of tasks.

**Authentic Use cases:**

- Based People: task chaining: how to more effectively prototype different strategies?!
- Get personal X network into CRM, then research them more (find other owned socials, find company, etc)
- Make agent-friendly forward thinking assessment score for any company. KYB: derisk the future!

# Directories

Registry registry:

https://mastra.ai/mcp-registry-registry

Client without registry:

- https://ampcode.com/manual and https://sourcegraph.com
- 🔥 https://docs.factory.ai/user-guides/factory-bridge/model-context-protocol
- ❌ https://x.com/interaction/status/1966900969062773135

Client Registries:

- vscode - https://github.com/mcp (needs mcp repo to be oss)
- cursor - https://docs.cursor.com/en/tools/mcp and https://docs.claude.com/en/docs/claude-code/mcp#popular-mcp-servers
- claude (code) - https://docs.claude.com/en/docs/agents-and-tools/remote-mcp-servers
- https://lobehub.com/mcp

Registries:

- https://mcp.composio.dev and https://rube.app
- mcp - https://modelcontextprotocol.io/examples and https://github.com/modelcontextprotocol/servers
- https://mcpservers.org
- https://mcp.so
- https://github.com/punkpeye/awesome-mcp-servers
- https://mcpmarket.com
- https://www.pulsemcp.com/servers
- https://github.com/jaw9c/awesome-remote-mcp-servers
- https://cline.bot/mcp-marketplace
- https://block.github.io/goose/docs/category/mcp-servers/
- https://glama.ai/mcp/servers
- https://zed.dev/extensions?filter=context-servers
- https://smithery.ai
- https://klavis.ai

Not sure:

https://opencode.ai ()

Create task group using MCP to enhance this list into actionable items on how actually get listed.
