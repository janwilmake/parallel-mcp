/**
 * Super minimal OAuth provider for Parallel.ai API keys
 * 
 * Note: We intentionally allow any client (even unregistered ones) to use this OAuth provider.
  Security is ensured by requiring users to explicitly trust the client by showing the
  hostname of the redirect_uri and requiring manual confirmation before proceeding.
  This design choice enables frictionless integration while maintaining user consent.
 * 
 * @param {Request} request - The incoming request
 * @param {KVNamespace} kv - Cloudflare KV namespace for temporary storage
 * @param {string} secret - secret for encryption
 * @returns {undefined|Promise<Response>} - Returns undefined if not an OAuth route, otherwise a Response
 */
export async function parallelOauthProvider(request, kv, secret) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Helper function for CORS headers
  const getCorsHeaders = () => ({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });

  // Helper function for OPTIONS responses
  const handleOptionsRequest = (allowedMethods = ["GET", "OPTIONS"]) => {
    return new Response(null, {
      status: 204,
      headers: {
        ...getCorsHeaders(),
        "Access-Control-Allow-Methods": allowedMethods.join(", "),
      },
    });
  };

  // Cryptographically secure random token generation
  const generateSecureToken = (length = 32) => {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
      ""
    );
  };

  // Derive encryption key from secret
  const deriveKey = async (secret) => {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    return await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: encoder.encode("parallel-oauth-salt"),
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  };

  // Encrypt API key
  const encryptApiKey = async (apiKey, secret) => {
    const key = await deriveKey(secret);
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );

    return {
      encrypted: Array.from(new Uint8Array(encrypted)),
      iv: Array.from(iv),
    };
  };

  // Decrypt API key
  const decryptApiKey = async (encryptedData, secret) => {
    const key = await deriveKey(secret);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(encryptedData.iv) },
      key,
      new Uint8Array(encryptedData.encrypted)
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  };

  // Parse cookies
  const parseCookies = (cookieHeader) => {
    const cookies = {};
    if (cookieHeader) {
      cookieHeader.split(";").forEach((cookie) => {
        const [name, ...rest] = cookie.trim().split("=");
        if (name && rest.length > 0) {
          cookies[name] = decodeURIComponent(rest.join("="));
        }
      });
    }
    return cookies;
  };

  // Get stored access token from cookie
  const getStoredAccessToken = async (request) => {
    const cookies = parseCookies(request.headers.get("Cookie"));
    const tokenCookie = cookies["parallel_access_token"];

    if (!tokenCookie || !secret) {
      return null;
    }

    try {
      const encryptedData = JSON.parse(tokenCookie);
      return await decryptApiKey(encryptedData, secret);
    } catch (error) {
      return null;
    }
  };

  // XSS protection - only allow safe characters in client ID
  const sanitizeClientId = (clientId) => {
    // Only allow alphanumeric, dots, hyphens, and colons (for ports)
    return clientId.replace(/[^a-zA-Z0-9.-:]/g, "");
  };

  // Validate PKCE code challenge
  const validatePKCE = async (codeVerifier, codeChallenge) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
    return base64 === codeChallenge;
  };

  // Handle OPTIONS requests
  if (request.method === "OPTIONS") {
    return handleOptionsRequest(["GET", "POST", "OPTIONS"]);
  }

  // OAuth Authorization Server Metadata (RFC8414)
  if (
    path === "/.well-known/oauth-authorization-server" ||
    path.startsWith("/.well-known/oauth-authorization-server/")
  ) {
    const metadata = {
      issuer: url.origin,
      authorization_endpoint: `${url.origin}/authorize`,
      token_endpoint: `${url.origin}/token`,
      token_endpoint_auth_methods_supported: ["none"],
      registration_endpoint: `${url.origin}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      scopes_supported: ["api"],
      code_challenge_methods_supported: ["S256"],
    };

    return new Response(JSON.stringify(metadata, null, 2), {
      headers: {
        ...getCorsHeaders(),
        "Content-Type": "application/json",
      },
    });
  }

  // Protected resource metadata
  const protectedResourcePath = "/.well-known/oauth-protected-resource";
  if (
    path === protectedResourcePath ||
    path.startsWith(protectedResourcePath + "/")
  ) {
    const suffix = path.slice(protectedResourcePath.length);
    const metadata = {
      resource: url.origin + suffix,
      authorization_servers: [url.origin],
      scopes_supported: ["api"],
      bearer_methods_supported: ["header"],
    };

    return new Response(JSON.stringify(metadata, null, 2), {
      headers: {
        ...getCorsHeaders(),
        "Content-Type": "application/json",
      },
    });
  }

  // Dynamic Client Registration endpoint
  if (path === "/register") {
    if (request.method === "OPTIONS") {
      return handleOptionsRequest(["POST", "OPTIONS"]);
    }

    const corsHeaders = getCorsHeaders();

    if (request.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers: corsHeaders,
      });
    }

    try {
      const body = await request.json();
      // Validate redirect_uris is present and is an array
      if (
        !body.redirect_uris ||
        !Array.isArray(body.redirect_uris) ||
        body.redirect_uris.length === 0
      ) {
        return new Response(
          JSON.stringify({
            error: "invalid_client_metadata",
            error_description: "redirect_uris must be a non-empty array",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      // Extract hosts from all redirect URIs
      const hostnames = new Set();
      for (const uri of body.redirect_uris) {
        try {
          const url = new URL(uri);
          hostnames.add(url.hostname);
        } catch (e) {
          return new Response(
            JSON.stringify({
              error: "invalid_redirect_uri",
              error_description: `Invalid redirect URI: ${uri}`,
            }),
            {
              status: 400,
              headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
              },
            }
          );
        }
      }

      // Ensure all redirect URIs have the same host
      if (hostnames.size < 1) {
        return new Response(
          JSON.stringify({
            error: "invalid_client_metadata",
            error_description: "Less than 1 redirect uri",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      const clientHost = Array.from(hostnames)[0];

      // Response with client_id as the host
      const response = {
        client_id: clientHost,
        redirect_uris: body.redirect_uris,
        token_endpoint_auth_method: "none", // Public client, no secret needed
        grant_types: ["authorization_code"],
        response_types: ["code"],
      };

      return new Response(JSON.stringify(response, null, 2), {
        status: 201,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "invalid_client_metadata",
          error_description: "Invalid JSON in request body",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }
  }

  // Authorization endpoint - shows the API key input form
  if (path === "/authorize") {
    const redirectUri = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state");
    const responseType = url.searchParams.get("response_type") || "code";
    const codeChallenge = url.searchParams.get("code_challenge");
    const codeChallengeMethod = url.searchParams.get("code_challenge_method");

    if (!redirectUri || responseType !== "code") {
      return new Response("Invalid request parameters", {
        status: 400,
        headers: getCorsHeaders(),
      });
    }

    // PKCE is required for public clients
    if (!codeChallenge || codeChallengeMethod !== "S256") {
      return new Response(
        "PKCE required: code_challenge and code_challenge_method=S256",
        {
          status: 400,
          headers: getCorsHeaders(),
        }
      );
    }

    let redirectUrl;

    // Validate redirect_uri matches client_id hostname
    try {
      redirectUrl = new URL(redirectUri);

      if (
        redirectUrl.protocol === "http:" &&
        redirectUrl.hostname !== "localhost"
      ) {
        return new Response("Invalid redirect_uri: must use HTTPS", {
          status: 400,
          headers: getCorsHeaders(),
        });
      }
    } catch {
      return new Response("Invalid redirect_uri format", {
        status: 400,
        headers: getCorsHeaders(),
      });
    }

    const clientId =
      redirectUrl.protocol === "https:" ||
      (redirectUrl.hostname === "localhost" && redirectUrl.protocol === "http:")
        ? redirectUrl.host
        : redirectUrl.protocol + redirectUrl.host;

    // Sanitize client ID for XSS protection
    const safeClientId = sanitizeClientId(clientId);

    // Get existing access token from cookie
    const existingToken = await getStoredAccessToken(request);
    const tokenScript = existingToken
      ? `window.existingAccessToken = '${existingToken}';`
      : `window.existingAccessToken = null;`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Parallel.ai API Access</title>
    <style>
        @font-face {
            font-family: 'FT System Mono';
            src: url('/FTSystemMono-Regular.woff2') format('woff2');
            font-weight: 400;
            font-style: normal;
        }
        @font-face {
            font-family: 'FT System Mono';
            src: url('/FTSystemMono-Medium.woff2') format('woff2');
            font-weight: 500;
            font-style: normal;
        }
        @font-face {
            font-family: 'Gerstner Programm';
            src: url('/Gerstner-ProgrammRegular.woff2') format('woff2');
            font-weight: 400;
            font-style: normal;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'FT System Mono', monospace;
            background-color: #fcfcfa;
            color: #1d1b16;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .container {
            max-width: 400px;
            width: 100%;
            text-align: center;
        }

        .logo {
            width: 80px;
            height: 80px;
            margin: 0 auto 32px;
            background: url('/dark-parallel-symbol-270.svg') no-repeat center;
            background-size: contain;
        }

        h1 {
            font-family: 'Gerstner Programm', serif;
            font-size: 24px;
            font-weight: 400;
            margin-bottom: 32px;
            color: #1d1b16;
        }

        .trust-question {
            font-size: 16px;
            color: #1d1b16;
            margin-bottom: 24px;
            text-align: left;
        }

        .checkbox-group {
            margin-bottom: 24px;
            text-align: left;
        }

        .checkbox-container {
            display: flex;
            align-items: center;
            gap: 12px;
            cursor: pointer;
        }

        input[type="checkbox"] {
            width: 18px;
            height: 18px;
            accent-color: #fb631b;
            cursor: pointer;
        }

        .checkbox-label {
            font-size: 14px;
            color: #1d1b16;
            cursor: pointer;
            user-select: none;
        }

        .form-group {
            margin-bottom: 24px;
            text-align: left;
        }

        label {
            display: block;
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 8px;
            color: #1d1b16;
        }

        input[type="password"] {
            width: 100%;
            padding: 12px 16px;
            font-family: 'FT System Mono', monospace;
            font-size: 14px;
            border: 2px solid #d8d0bf;
            border-radius: 8px;
            background: #fcfcfa;
            color: #1d1b16;
            transition: border-color 0.2s;
        }

        input[type="password"]:focus {
            outline: none;
            border-color: #fb631b;
        }

        input[type="password"]::placeholder {
            color: #d8d0bf;
        }

        .button {
            width: 100%;
            padding: 12px 24px;
            font-family: 'FT System Mono', monospace;
            font-size: 14px;
            font-weight: 500;
            background: #fb631b;
            color: #fcfcfa;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: background-color 0.2s, opacity 0.2s;
        }

        .button:hover:not(:disabled) {
            background: #e55a18;
        }

        .button:disabled {
            background: #d8d0bf;
            cursor: not-allowed;
            opacity: 0.6;
        }

        .link {
            display: inline-block;
            margin-top: 16px;
            font-size: 14px;
            color: #fb631b;
            text-decoration: none;
            transition: color 0.2s;
        }

        .link:hover {
            color: #e55a18;
        }

        .error {
            color: #fb631b;
            font-size: 12px;
            margin-top: 8px;
            text-align: left;
        }

        .existing-token {
            background: rgba(251, 99, 27, 0.1);
            border: 2px solid #fb631b;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
            font-size: 14px;
            text-align: left;
        }

        .existing-token h3 {
            margin-bottom: 8px;
            color: #fb631b;
        }

        .use-existing-btn {
            background: transparent;
            color: #fb631b;
            border: 2px solid #fb631b;
            margin-bottom: 16px;
        }

        .use-existing-btn:hover {
            background: #fb631b;
            color: #fcfcfa;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo"></div>
        <h1>Grant access to your Parallel.ai API key</h1>
        
        <div class="trust-question">
            Do you trust <strong>${safeClientId}</strong> to access your Parallel.ai API key?
        </div>
        
        <div id="existingTokenSection" class="existing-token" style="display: none;">
            <h3>Existing Access Token Found</h3>
            <div>You already have an active access token. You can use it or create a new one.</div>
        </div>
        
        <form id="authForm">
            <div class="checkbox-group">
                <label class="checkbox-container" for="trustCheckbox">
                    <input type="checkbox" id="trustCheckbox" name="trust" required>
                    <span class="checkbox-label">I trust ${safeClientId}</span>
                </label>
            </div>

            <button type="button" class="button use-existing-btn" id="useExistingBtn" style="display: none;">
                Use Existing Token
            </button>

            <div class="form-group">
                <label for="apiKey">Your Parallel.ai API Key</label>
                <input 
                    type="password" 
                    id="apiKey" 
                    name="apiKey" 
                    placeholder="Enter your API key..."
                    required
                />
                <div id="error" class="error"></div>
                <a href="https://platform.parallel.ai/settings?tab=api-keys" class="link" target="_blank">Go to Parallel API Keys →</a>
            </div>
            
            <button type="submit" class="button" id="submitBtn" disabled>
                Continue
            </button>
        </form>
        

    </div>

    <script>
        ${tokenScript}

        // Handle existing token
        const existingTokenSection = document.getElementById('existingTokenSection');
        const useExistingBtn = document.getElementById('useExistingBtn');
        
        if (window.existingAccessToken) {
            existingTokenSection.style.display = 'block';
            useExistingBtn.style.display = 'block';
        }

        // Handle checkbox state
        const trustCheckbox = document.getElementById('trustCheckbox');
        const submitBtn = document.getElementById('submitBtn');
        const apiKeyInput = document.getElementById('apiKey');

        function updateSubmitButton() {
            const apiKey = apiKeyInput.value.trim();
            const isChecked = trustCheckbox.checked;
            
            submitBtn.disabled = !isChecked || !apiKey;
            useExistingBtn.disabled = !isChecked;
        }

        trustCheckbox.addEventListener('change', updateSubmitButton);
        apiKeyInput.addEventListener('input', updateSubmitButton);

        // Use existing token
        useExistingBtn.addEventListener('click', async () => {
            if (!trustCheckbox.checked) {
                document.getElementById('error').textContent = 'Please confirm you trust this application';
                return;
            }

            await authorizeWithToken(window.existingAccessToken);
        });

        document.getElementById('authForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const apiKey = apiKeyInput.value.trim();
            const errorDiv = document.getElementById('error');
            
            if (!trustCheckbox.checked) {
                errorDiv.textContent = 'Please confirm you trust this application';
                return;
            }
            
            if (!apiKey) {
                errorDiv.textContent = 'Please enter your API key';
                return;
            }
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Authorizing...';
            errorDiv.textContent = '';
            
            await authorizeWithToken(apiKey);
        });

        async function authorizeWithToken(apiKey) {
            const errorDiv = document.getElementById('error');
            
            try {
                // Generate 32-character auth code
                const authCode = 'auth_' + Array.from(crypto.getRandomValues(new Uint8Array(28)), 
                    byte => byte.toString(16).padStart(2, '0')).join('');
                
                // Store API key with auth code in KV (10 minutes expiration)
                const response = await fetch('/store-key', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        authCode, 
                        apiKey,
                        codeChallenge: '${codeChallenge}'
                    })
                });
                
                if (!response.ok) {
                    console.log('store key not ok',response.status, await response.text())
                    throw new Error('Failed to store API key');
                }
                
                // Redirect back to client
                const redirectUrl = new URL('${redirectUri}');
                redirectUrl.searchParams.set('code', authCode);
                ${
                  state
                    ? `redirectUrl.searchParams.set('state', '${state}');`
                    : ""
                }
                
                window.location.href = redirectUrl.toString();
                
            } catch (error) {
             console.error(error);
                errorDiv.textContent = 'Authorization failed. Please try again.';
                submitBtn.disabled = false;
                submitBtn.textContent = 'Continue';
            }
        }
    </script>
</body>
</html>`;

    return new Response(html, {
      headers: {
        ...getCorsHeaders(),
        "Content-Type": "text/html",
      },
    });
  }

  // Store API key endpoint (called by the authorization form)
  if (path === "/store-key" && request.method === "POST") {
    try {
      const { authCode, apiKey, codeChallenge } = await request.json();

      if (!authCode || !apiKey || !codeChallenge) {
        return new Response("Invalid request", {
          status: 400,
          headers: getCorsHeaders(),
        });
      }

      if (!secret) {
        return new Response("Server configuration error", {
          status: 500,
          headers: getCorsHeaders(),
        });
      }

      // Encrypt the API key before storing
      const encryptedData = await encryptApiKey(apiKey, secret);

      // Store encrypted API key with code challenge in KV with 10 minute expiration
      await kv.put(
        authCode,
        JSON.stringify({
          encrypted: encryptedData.encrypted,
          iv: encryptedData.iv,
          codeChallenge,
          timestamp: Date.now(),
        }),
        { expirationTtl: 600 }
      );

      return new Response("OK", { headers: getCorsHeaders() });
    } catch (error) {
      return new Response("Invalid JSON", {
        status: 400,
        headers: getCorsHeaders(),
      });
    }
  }

  // Token endpoint - exchanges auth code for API key
  if (path === "/token" && request.method === "POST") {
    if (request.method === "OPTIONS") {
      return handleOptionsRequest(["POST", "OPTIONS"]);
    }

    try {
      const formData = await request.formData();
      const grantType = formData.get("grant_type");
      const code = formData.get("code");
      const codeVerifier = formData.get("code_verifier");

      if (grantType !== "authorization_code" || !code || !codeVerifier) {
        return new Response(
          JSON.stringify({
            error: "invalid_request",
            error_description:
              "Invalid grant_type, missing code, or missing code_verifier",
          }),
          {
            status: 400,
            headers: {
              ...getCorsHeaders(),
              "Content-Type": "application/json",
            },
          }
        );
      }

      if (!secret) {
        return new Response(
          JSON.stringify({
            error: "server_error",
            error_description: "Server configuration error",
          }),
          {
            status: 500,
            headers: {
              ...getCorsHeaders(),
              "Content-Type": "application/json",
            },
          }
        );
      }

      // Get encrypted data from KV
      const storedData = await kv.get(code);

      if (!storedData) {
        return new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "Authorization code not found or expired",
          }),
          {
            status: 400,
            headers: {
              ...getCorsHeaders(),
              "Content-Type": "application/json",
            },
          }
        );
      }

      const { encrypted, iv, codeChallenge } = JSON.parse(storedData);

      // Validate PKCE
      const isPKCEValid = await validatePKCE(codeVerifier, codeChallenge);
      if (!isPKCEValid) {
        return new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "Invalid code_verifier",
          }),
          {
            status: 400,
            headers: {
              ...getCorsHeaders(),
              "Content-Type": "application/json",
            },
          }
        );
      }

      // Decrypt the API key
      const apiKey = await decryptApiKey({ encrypted, iv }, secret);

      // Delete the code from KV (one-time use)
      await kv.delete(code);

      // Encrypt API key for cookie storage
      const cookieEncryptedData = await encryptApiKey(apiKey, secret);
      const cookieValue = encodeURIComponent(
        JSON.stringify(cookieEncryptedData)
      );

      // Set 30-day cookie with the encrypted access token
      const cookieHeader = `parallel_access_token=${cookieValue}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`; // 30 days

      // Return the API key as access token (by design - client needs full API access)
      return new Response(
        JSON.stringify({
          access_token: apiKey,
          token_type: "bearer",
          scope: "api",
          expires_in: 2592000, // 30 days
        }),
        {
          headers: {
            ...getCorsHeaders(),
            "Content-Type": "application/json",
            "Set-Cookie": cookieHeader,
          },
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: "server_error",
          error_description: "Internal server error",
        }),
        {
          status: 500,
          headers: {
            ...getCorsHeaders(),
            "Content-Type": "application/json",
          },
        }
      );
    }
  }

  if (path === "/me") {
    const accessToken =
      request.headers.get("Authorization")?.slice("Bearer ".length) || "";
    const resourceMetadataUrl = `${url.origin}/.well-known/oauth-protected-resource`;
    const loginUrl = `${url.origin}/authorize?redirect_to=${encodeURIComponent(
      request.url
    )}`;

    // Get access token from request
    if (!accessToken) {
      return new Response(
        JSON.stringify({
          error: "unauthorized",
          error_description: "Access token required",
        }),
        {
          status: 401,
          headers: {
            ...getCorsHeaders(),
            "Content-Type": "application/json",
            "WWW-Authenticate": `Bearer realm="main", login_url="${loginUrl}", resource_metadata="${resourceMetadataUrl}"`,
          },
        }
      );
    }

    return new Response("me endpoint");
  }

  // Not an OAuth route - return undefined to let other handlers process the request
  return undefined;
}
