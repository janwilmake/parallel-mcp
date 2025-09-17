This minimal OAuth provider:

1. **Stateless except for temporary KV storage** - Only stores the API key for 10 minutes in KV during the auth flow
2. **Uses cookie for repeat visits** - Saves the API key in a cookie for convenience on repeat visits
3. **Simple flow**:
   - `/authorize` shows a clean form asking for API key
   - User enters API key, it gets stored in KV with a temporary auth code
   - `/token` exchanges the auth code for the API key and deletes it from KV
4. **Proper OAuth compliance** - Includes all the required metadata endpoints

To use it on any server:

```
npm i parallel-oauth-provider
```

```js
import { parallelOauthProvider } from "parallel-oauth-provider";

export default {
  async fetch(request, env) {
    const oauthResponse = await parallelOauthProvider(
      request,
      // Must have {get,put,delete}
      env.KV,
      // Encryption Secret
      env.SECRET,
      // Optional config
      { pathPrefix: "/oauth", assetsPrefix: "/assets/oauth" }
    );
    if (oauthResponse) return oauthResponse;

    // Your other routes...
  },
};
```

It has been abstracted away fully from Cloudflare and can be used in any cloud provider that allows JavaScript. It uses the KV API equal to that of Cloudflare KV.

See [demo](demo.ts) in combination with [index.html](index.html)

The user just needs to get their API key from the Parallel dashboard and enter it once - it'll be remembered in a cookie for future use.
