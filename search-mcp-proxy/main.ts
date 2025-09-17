import { withSimplerAuth } from "simplerauth-client";
//Search MCP proxy server (https://search-mcp.parallel.ai) that proxies `/mcp` to https://mcp.parallel.ai/v1beta/search_mcp and adds minimally needed additions to make it work with oauth. CAREFULLY test and document these additions!

export default {
  fetch: withSimplerAuth(
    async (request, env, ctx) => {
      const url = new URL(request.url);
      if (url.pathname === "/mcp") {
        const req = new Request("https://mcp.parallel.ai/v1beta/search_mcp", {
          body: request.body,
          headers: request.headers,
          method: request.method,
        });
        return fetch(req);
      }
      return new Response("Not found", { status: 404 });
    },
    {
      isLoginRequired: false,
      oauthProviderHost: "parallel.simplerauth.com",
      sameSite: "Strict",
      scope: "api",
    }
  ),
};
