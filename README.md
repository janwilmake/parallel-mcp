This is a great idea I think that will unlock lots of productivity.

Can be further extended to also allow for doing multiple tasks (based on a contextual file)

If approved (talk to Manvesh): Would need simle oauth provider where the Parallel API key can be provided (and ultimately, needs login with parallel). Make parallel oauth provider that binds parallel API key to your X account (until they release 'login with parallel')

When MCP supports async tools and notifications to re-activate a chat with new information, we can also make parallel toolcalls possible. This will be super useful, but not sure how yet!

# TODO

Create an MCP worker that:

1. Create a task with callback and instantly return Result URL
2. Receive callback and query result, then set result into KV
3. Make KV accessible at that URL. Maybe also a MD version that's more readable and doesn't include reasoning, just confidence in emoji.
4. The second tool is just requesting the result URL, but this could be made optional

# Parallel mcp-compliant oauth provider

- github-oauth-provider (infer from x-oauth-provider)
- parallel-oauth-provider (similar but add ability to select or add api key)

This is literally 2 prompts!
