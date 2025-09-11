# Parallel Multitask API

The task group API of Parallel is quite a lot to take in. With the Parallel Tasks MCP, the goal is to make the Task Group API as accessible as possible through a simplified 'multitask api', basically turning a task group APIs into a single API call.

This simplification is designed to allow doing 80% of what's possible in a minimal API. For more low-level control, see https://docs.parallel.ai/

![task-group-to-url](design.drawio.png)

- OpenAPI Playground: https://multitask-demo.parallel.ai/openapi
- OpenAPI JSON: https://multitask-demo.parallel.ai/openapi.json
- Design SPEC (outdated): https://multitask-demo.parallel.ai/SPEC.md
- Demo: https://multitask-demo.parallel.ai
- MCP: https://mcp.openapisearch.com/multitask-demo.parallel.ai/mcp

## TODO

- improve HTML and streaming behavior to be fully realtime
- make HTML mobile-friendly
- add confidence and references into HTML
- show confidence as emoji in markdown
- figure out how to make it loose no functionality that doesn't increase complexity: https://letmeprompt.com/rules-httpsuithu-jza7uv0
