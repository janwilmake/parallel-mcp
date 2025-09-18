The task group API of Parallel is quite a lot to take in. With the Parallel Multitask API, the goal is to make the Task Group API as accessible as possible through a simplified 'multitask api', basically turning a task group APIs into a single API call.

This simplification is designed to allow doing 80% of what's possible in a minimal API that allows a simple minimal interface to the entire workflow of the task group API suite. This type of minimal interface is ideal for use with MCP as also [advocated by Vercel](https://vercel.com/blog/the-second-wave-of-mcp-building-for-llms-not-developers#performance-improvements-with-workflow-tools), but it's also great for making it easier to build powerful apps on top of the Task Group API. For more low-level control, see https://docs.parallel.ai/

![task-group-to-url](design.drawio.png)

- OpenAPI Playground: https://multitask-demo.parallel.ai/openapi
- OpenAPI JSON: https://multitask-demo.parallel.ai/openapi.json
- Design SPEC (outdated): https://multitask-demo.parallel.ai/SPEC.md

# How to test MCP locally

- On localhost, run `wrangler dev --env dev`
- Run `npx @modelcontextprotocol/inspector` and test `http://localhost:8787/mcp`. The oauth flow should work.

# Context

MCP context:

- MCP Specification: https://uithub.com/modelcontextprotocol/modelcontextprotocol/tree/main/docs/specification/2025-06-18?lines=false
- Typescript JSON RPC methods: https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/refs/heads/main/schema/2025-03-26/schema.ts or new https://uithub.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2025-06-18/schema.ts
- with-mcp implementation: https://uithub.com/janwilmake/with-mcp/blob/main/with-mcp.ts

Other Context:

- Parallel Multitask API: https://multitask-demo.parallel.ai/openapi.json
- Parallel oauth provider url: https://oauth-demo.parallel.ai
- Simplerauth-client: https://uithub.com/janwilmake/universal-mcp-oauth/blob/main/simplerauth-client/README.md
