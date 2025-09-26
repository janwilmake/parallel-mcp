Designed for tabular data enrichment, this MCP is works best together with an MCP that can get your data source.

![](mcp-apps.drawio.png)

# Links

- OpenAPI Playground: https://task-mcp.parallel.ai/openapi
- OpenAPI JSON: https://task-mcp.parallel.ai/openapi.json
- Design SPEC (outdated): [SPEC.md](SPEC.md)
- MCP docs: https://docs.parallel.ai/features/remote-mcp

[![Install Parallel Task MCP](https://img.shields.io/badge/Install_MCP-Parallel%20Task%20MCP-black?style=for-the-badge)](https://installthismcp.com/Parallel%20Task%20MCP?url=https%3A%2F%2Ftask-mcp.parallel.ai%2Fmcp)

# Testing & Deployment

## Testing oauth provider locally

- On localhost, run `wrangler dev --env oauth`
- In `parallel-oauth-provider` run `wrangler dev --env dev`
- Run `npx @modelcontextprotocol/inspector` and test `http://localhost:8787/mcp`. The oauth flow should work.

## Testing MCP Locally

On localhost, run `wrangler dev --env dev`

[![Install Parallel Task MCP (Localhost)](<https://img.shields.io/badge/Install_MCP-Parallel%20Task%20MCP%20(Localhost)-black?style=for-the-badge>)](<https://installthismcp.com/Parallel%20Task%20MCP%20(Localhost)?url=http%3A%2F%2Flocalhost%3A8787%2Fmcp>)

## Deployment

To deploy to staging or prod use:

- staging: `wrangler deploy --env staging`
- prod: `wrangler deploy --env prod`

Ensure you have a [Cloudflare account](https://dash.cloudflare.com/sign-up/workers). Then, install [wrangler](https://developers.cloudflare.com/workers/wrangler/) and login. You may need to change the [wrangler.jsonc](wrangler.jsonc) configuration
