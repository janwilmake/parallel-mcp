The task group API of Parallel is quite a lot to take in. With the Parallel Multitask API, the goal is to make the Task Group API as accessible as possible through a simplified 'multitask api', basically turning a task group APIs into a single API call.

This simplification is designed to allow doing 80% of what's possible in a minimal API that allows a simple minimal interface to the entire workflow of the task group API suite. This type of minimal interface is ideal for use with MCP as also [advocated by Vercel](https://vercel.com/blog/the-second-wave-of-mcp-building-for-llms-not-developers#performance-improvements-with-workflow-tools), but it's also great for making it easier to build powerful apps on top of the Task Group API. For more low-level control, see https://docs.parallel.ai/

![task-group-to-url](design.drawio.png)

# Making Task Group Public

The task run ID is 32 hex characters (https://letmeprompt.com/rules-httpsuithu-28mr600, https://letmeprompt.com/rules-httpsuithu-uq2vhc0) save to make publicly accessible assuming it's generated at random.

The URL outputted will open HTML when the user clicks on it, but returns markdown when the agent scrapes it with any client. This is accomplished using the `accept` header.

You may think having a tool that immediately returns a URL isn't very useful, but in combination with an agent that can do fetching, it's much more powerful, since you can just wait a while and message the chat later for the agent to scrape the urls. The scrape will result in token-dense markdown so the agent can continue.

# Need alarms instead of silent stops

The key insight is that instead of trying to maintain one long-lived connection (which can fail silently), we now have many short-lived sessions with guaranteed restarts. This approach is much more resilient to network issues, Durable Object limitations, and API timeouts.

https://letmeprompt.com/rules-httpsuithu-7dvc3z0

# Realized no state was needed!

After realizing [this](https://docs.parallel.ai/api-reference/task-api-beta/fetch-task-group-runs) is an INSTANT response endpoint, it became clear that keeping my own state of individual runs wasn't needed, and since I am only interested in the state snapshot at any given moment, I also didn't need to use other streaming endpoint, nor did I need to provide one (also since my HTML page can remain simple as it won't be needed later). Because of this I was able to remove the entire DurableObject from my architecture, halving the amount of lines of code down to less than 1000 lines of code.

# Decision to split up tools

The key insight is that for tasks, structured data isn't really needed. structuring data only becomes useful for task groups. because of this, a deep-research tool is made which just takes `processor` (defaults to "pro") and the `input` (string).
