# W42

#1 Push out MCP: First create demand ==> Small datasets -> After that, scale it up with n8n or using APIs

⏳ Make ChatGPT MCP integration work! --> Perfect timing! (wait for bugfix openai)

⏳ After Task MCP / Search MCP public, list in directories

⏳ GET IN THERE Grammarly Slack, Cloudflare Slack, AISDK Slack, etc.

Test it out: Research on using Parallel and X posts context for enriching a person. **Entity Resolution**. Usecase: Recruitment/headhunting.

❌ NOT ATM: Large files — Ultimate: CSV to CSV over 1 chat completion

# Reasoning traces

🤔 The team wants to see reasoning traces while the task is being executed. This would mean blocking the thing to continue and showing updates, or, if async tool-calls are possible, sending status updates to the client to show latest reasoning.

- ➡️ Option 1: Long running MCP with streaming notifications (may not work >30s in most clients, may work well in some coding clients)
- ➡️ Option 2: Creating a streaming Chat Completions endpoint from it, so it can be added to different clients, and returns reasoning traces.
- ⏳ Option 3: Wait for async MCP (https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1391)
- ⏳ Option 4: Explore using MCP UI so we actually can have the full-fledged platform interface, but control stuff with MCP

The only way to stream in results, as of now is via a "status notification". But for this we need a stateful architecture so it's a bit more complicated to add this in now. However I made a Sleep MCP and Chat Completions MCP before intended to test this functionality. I can do some testing with this tomorrow :+1: If it works (and shows nicely) in major clients I suppose we can refactor to make it stateful and send status notifications.

- https://github.com/janwilmake/parallel-mcp/tree/main/sleep-mcp
- https://github.com/janwilmake/chat-completions-mcp

Best course of action now: start with AISDK `@parallel-web/ai-sdk` with:

- easy to configure search as tool (ability to pre-configure with simple ways to alter how large response-context will be)
- search chat completions as model
- task to `/chat/completions` stream proxy and use that for `generateText`, `generateObject`, `streamText`, `streamObject`

The chat completions endpoint is then also able to be used as MCP (use notifications as in https://github.com/janwilmake/chat-completions-mcp)

# Pending to be fixed (Manvesh)

- ✅ cursor deeplink works for installation
- Footnotes are in markdown syntax ([^N])
- Get new deep research platform url that renders the text output using footnotes and basis
- Glitches (sent over DM)

# Testing & Demos

Goal: getting hands dirty, lots of experimentation. Test more, uncover failure modes, fix these.

Think about:

- which MCP client
- which data source / data destination
- authentic use cases

- **VScode Demo**: new!

- **ChatGPT Demo**: User uploads CSV and says what we need to add, and instructions on repeating with first 5 until quality is good. Task Group API is used repeatedly. Finally, perform batch API on all rows. Download final CSV.

- **Subagent (Claude Code or Cursor)** - Put this MCP in a subagent template. The process is always to use search first to make a list, then do a Parallel Task, then use the Alarm MCP (or just `sleep 900`), and get back with final results https://docs.claude.com/en/docs/claude-code/sub-agents#available-tools. This can be added as description to the agent context. The input can come from a JSON file, the outputs can be written to a JSON files as well. Ideally we perform an experiment of choosing processors here: it can be an example of an experiemnt where we compare chaining tasks with doing one bigger task.

- **CRM (Attio) input**. First, get the people that I follow on X into a CRM. Ask to enrich my people with social media based on logical proof, put back a summary into CRM.

- **Claude Demo**: use Parallel Search to find all MCP directories. Then determine an SEO strategy for each via a task. Output is a small actionable list of tasks.

**Authentic Use cases:**

- Based People: task chaining: how to more effectively prototype different strategies?!
- Get personal X network into CRM, then research them more (find other owned socials, find company, etc)
- Make agent-friendly forward thinking assessment score for any company. KYB: derisk the future!

## other MCP-related ideas

- MCP to test using Parallel APIs and write code ("Task playground MCP")
- Claude.ai in browser
- ChatGPT connectors
- Rube.app
- MCP IDP for Task proxy (and playground)
- Tackle MCP problems: https://x.com/janwilmake/status/1965135300184998109

Tina ideas: I think we should do these roughly in the order listed:

- (1) sales CRM
- (2) KYB (know your business)
- (3) example of chaining tasks
- (4) product matching

# Directories

Submitted:

- MCP - https://modelcontextprotocol.io/examples
  - Edit: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/examples.mdx
  - ❌ doesnt seem to be getting any PRs
- MCP - https://github.com/modelcontextprotocol/servers
  - ⏳ https://github.com/modelcontextprotocol/servers/pull/2829
- Cursor - https://docs.cursor.com/en/tools/mcp
  - ⏳ https://github.com/cursor/mcp-servers/issues/48
- https://lobehub.com/mcp (✅ submitted task+search)
- https://mcp.composio.dev and https://rube.app
  - Need to change from https://rube.app/team/parallel to https://docs.parallel.ai/integrations/mcp/installation
  - ⏳ Asked Composio team in slack.
- https://mcpservers.org
  - ✅ submitted Task MCP, paid for 'official' badge
- https://mcp.so
  - ✅ submitted both
  - ⏳ status at: https://mcp.so/my-servers

Needs contact person:

- VSCode - https://github.com/mcp ❌ no way to make PR
- Claude https://docs.claude.com/en/docs/claude-code/mcp#popular-mcp-servers ❌ no way to make pr
- Claude (code) - https://docs.claude.com/en/docs/agents-and-tools/remote-mcp-servers ❌ no way to make pr

To do:

- Official MCP registry
  - follow: https://github.com/modelcontextprotocol/registry/blob/main/docs/guides/publishing/publish-server.md
- https://www.pulsemcp.com/servers
- https://github.com/punkpeye/awesome-mcp-servers
- https://github.com/jaw9c/awesome-remote-mcp-servers
- https://mcpmarket.com
- https://cline.bot/mcp-marketplace
- https://block.github.io/goose/docs/category/mcp-servers/
- https://glama.ai/mcp/servers
- https://zed.dev/extensions?filter=context-servers
- https://smithery.ai
- https://klavis.ai
- https://mastra.ai/mcp-registry-registry
- https://ampcode.com/manual and https://sourcegraph.com
- 🔥 https://docs.factory.ai/user-guides/factory-bridge/model-context-protocol
- ❌ https://x.com/interaction/status/1966900969062773135
- https://opencode.ai
