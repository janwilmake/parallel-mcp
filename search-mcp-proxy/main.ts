import { withSimplerAuth } from "simplerauth-client";
export default {
  fetch: withSimplerAuth(
    async (request, env, ctx) => {
      const url = new URL(request.url);
      if (url.pathname === "/mcp") {
        const headers = new Headers(request.headers);
        headers.set(
          "x-api-key",
          request.headers.get("Authorization")?.slice("Bearer ".length)
        );
        headers.delete("Authorization");

        const response = await fetch(
          "https://mcp.parallel.ai/v1beta/search_mcp/",
          {
            body: request.body,
            headers,
            method: request.method,
          }
        );

        return response;
      }
      return new Response("Not found!", { status: 404 });
    },
    {
      isLoginRequired: false,
      oauthProviderHost: "parallel.simplerauth.com",
      sameSite: "Strict",
      scope: "api",
    }
  ),
};
