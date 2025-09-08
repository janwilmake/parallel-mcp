# Parallel Tasks MCP

![](multitask.drawio.png)

The task group API of Parallel is quite a lot to take in. With the Parallel Tasks MCP, the goal is to make the Task Group API as accessible as possible through:

1. a simplified 'multitask api'
2. MCP

There are 3 components to this:

## Task Group To URL API

First, I need an endpoint that makes tasks much easier, basically turning a task group into a single API call. See [task-group-to-url](task-group-to-url.md)

## The MCP worker

- Single tool `multitask`: proxies to this API passing MCP request session ID as part of the webhook url
- has a `/webhook` endpoint that sends a notification back to the right session.

## Parallel mcp-compliant oauth provider

Would need simle oauth provider where the Parallel API key can be provided (and ultimately, needs login with parallel). Make parallel oauth provider that binds parallel API key to your X account (until they release 'login with parallel')

- github-oauth-provider (infer from x-oauth-provider)
- parallel-oauth-provider (similar but add ability to select or add api key)

This is literally 2 prompts!
