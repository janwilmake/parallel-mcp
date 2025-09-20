# Bugs

- Logo doesnt show up for task-mcp.parallel.ai

# Demos

Goal: getting hands dirty, lots of experimentation

Think about:

- which MCP client
- which data source / data destination
- authentic use cases

<!-- It's demo time. The thing fucking works! Ideally I make highly authentic demos that show the benefit and experimental process. This is a testing ground. The ones that get engagement can be turned into professional blogs with more enterprise use-case -->

- vscode demo: new!

- **Subagent (Claude Code or Cursor)** - Put this MCP in a subagent template. The process is always to use search first to make a list, then do a Parallel Task, then use the Alarm MCP (or just `sleep 900`), and get back with final results https://docs.claude.com/en/docs/claude-code/sub-agents#available-tools. This can be added as description to the agent context. The input can come from a JSON file, the outputs can be written to a JSON files as well. Ideally we perform an experiment of choosing processors here: it can be an example of an experiemnt where we compare chaining tasks with doing one bigger task.

- **CRM (Attio) input**. First, get the people that I follow on X into a CRM. Ask to enrich my people with social media based on logical proof, put back a summary into CRM.

- **ChatGPT demo**: user uploads CSV and says what we need to add, and instructions on repeating with first 5 until quality is good. Task Group API is used repeatedly. Finally, perform batch API on all rows. Download final CSV.

- **Wassist/Claude Demo**: use Parallel Search to find all MCP directories. Then determine an SEO strategy for each via a task. Output is a small actionable list of tasks.

**Authentic Use cases:**

- Based People: task chaining: how to more effectively prototype different strategies?!
- Get personal X network into CRM, then research them more (find other owned socials, find company, etc)
- Make agent-friendly forward thinking assessment score for any company. KYB: derisk the future!

# ⏳ After Manvesh deploys Task Group Link (Monday)

- Replace link with `platform.parallel.ai/view/task-run-groups/{task_group_id}`
- Put login provider at `oauth.parallel.ai`
- Replace `parallel.simplerauth.com` with `platform.parallel.ai` after it works!
- Get merged: https://github.com/shapleyai/documentation/pull/221
- Talk to travers

# Directories

Registry registry:

https://mastra.ai/mcp-registry-registry

Client without registry:

- https://ampcode.com/manual and https://sourcegraph.com
- 🔥 https://docs.factory.ai/user-guides/factory-bridge/model-context-protocol
- 🔥 https://x.com/interaction/status/1966900969062773135

Client Registries:

- vscode - https://github.com/mcp (needs mcp repo to be oss)
- cursor - https://docs.cursor.com/en/tools/mcp and https://docs.claude.com/en/docs/claude-code/mcp#popular-mcp-servers
- claude (code) - https://docs.claude.com/en/docs/agents-and-tools/remote-mcp-servers
- https://lobehub.com/mcp
- https://wassist.app/mcp/

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

Not sure:

https://opencode.ai

Create task group using MCP to enhance this list into actionable items on how actually get listed.
