# Claude.ai

Works well! woop woop! https://claude.ai/share/39d98320-fc3e-4bbb-b4d5-da67abac44f2

Can't be reminded

# ChatGPT

https://chatgpt.com/share/68c96e8c-4898-800b-9c58-f01007ee015d

- often decides itself it will just use web search. not able to be prevented
- if you deny tool, will not be found again until you deselect/reselect in a new chat
- couldn't find the tool at all in GPT5-instant. GPT5 is fine.
- chatgpt natively can set reminders to re-engage chats from the background. Very powerful. if we have a reliable ETA for a task group, we may be able to instruct setting an alarm.

# Cursor

[This link](cursor://anysphere.cursor-deeplink/mcp/install?name=Parallel%20Tasks&config=eyJ1cmwiOiJodHRwczovL211bHRpdGFzay1kZW1vLnBhcmFsbGVsLmFpL21jcCJ9) should work (using oauth to directly install it)

The problem with cursor was the redirect uri: `cursor://anysphere.cursor-retrieval`. This wasn't allowed, but I've edited the provider to basically ignore the client_id completely and base the dialog on the callback URI instead.

Now, cursor successfully installs the MCP too, with oauth.

# VSCode

[Deeplink](vscode:mcp/install?%7B%22name%22%3A%22parallel%22%2C%22gallery%22%3Afalse%2C%22url%22%3A%22https%3A%2F%2Fmultitask-demo.parallel.ai%2Fmcp%22%7D)

Not working!

```
2025-09-16 16:09:00.317 [info] Connection state: Error Error sending message to https://multitask-demo.parallel.ai/mcp: Error: Protected Resource Metadata resource "https://multitask-demo.parallel.ai" does not match MCP server resolved resource "https://multitask-demo.parallel.ai/mcp". The MCP server must follow OAuth spec https://datatracker.ietf.org/doc/html/rfc9728#PRConfigurationValidation
```

`with-mcp` 401 must lead to `.well-known/oauth-protected-resource/mcp` which, in turn, should protect resource https://multitask-demo.parallel.ai/mcp

Update: I've added https://multitask-demo.parallel.ai/.well-known/oauth-protected-resource/mcp but now I get stuck at 'dynamic client registration failed'. Likely, because it wants to sign up with 2 different hostnames, something that should normally be fine.

Maybe I should not care about client_id, and instead, just make client_id the first redirect-uri hostname. Then, in the consent screen we can just show the hostname from the redirect uri, since this is what needs to be trusted.

**Update**: I've made this change, but can't test since I can't find how to reset the MCP DCR. Let's test with a different MCP or on a different device.

# Claude Desktop

# Claude Code
