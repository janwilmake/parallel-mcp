# Why MCP sucks (and how we can fix it)

- Hard to install https://x.com/janwilmake/status/1980196514719813645
- No long-running operations - go for when its certain enough https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1391
- No easy way to test or observe whats happening in production - https://x.com/janwilmake/status/1973103641331372160
- Long context - see [CLOUDFLARE](CLOUDFLARE.md)
- No way to insert prompt as the tool input, or response - https://x.com/janwilmake/status/1977292952054399047
- No way to agentically select the right servers or context: https://www.pulsemcp.com/posts/agentic-mcp-configuration https://x.com/janwilmake/status/1980346301540888847
- Servers aren't explorable https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649

# Security is a real problem

Any enabled tool (including built-in tools like web-search) that may provide untrusted information into the context-window can affect other tools to do things the user didn't ask for. This is the [context poisoning problem](https://www.backslash.security/blog/simulating-a-vulnerable-mcp-server-for-context-poisoning) and isn't solved yet.

# People are just using tools

Although the spec clearly specifies tools, resources, and prompts, most clients just support tools. This disincentivizes MCP builders to use the other two. Practically this means most MCPs end up providing resources and prompts as tools, polluting the MCP ecosystem. Are there any clients (or popular MCP servers) that actually adopted resources and prompts? If not, should we just scrap them? Tools seem to work just fine. [Discuss](https://x.com/janwilmake/status/1961042369194668478)
