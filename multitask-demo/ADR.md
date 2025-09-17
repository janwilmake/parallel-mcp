# Making Task Group Public

The task run ID is 32 hex characters (https://letmeprompt.com/rules-httpsuithu-28mr600, https://letmeprompt.com/rules-httpsuithu-uq2vhc0) save to make publicly accessible assuming it's generated at random.

The URL outputted will open HTML when the user clicks on it, but returns markdown when the agent scrapes it with any client. This is accomplished using the `accept` header.

You may think having a tool that immediately returns a URL isn't very useful, but in combination with an agent that can do fetching, it's much more powerful, since you can just wait a while and message the chat later for the agent to scrape the urls. The scrape will result in token-dense markdown so the agent can continue.

# Need alarms instead of silent stops

The key insight is that instead of trying to maintain one long-lived connection (which can fail silently), we now have many short-lived sessions with guaranteed restarts. This approach is much more resilient to network issues, Durable Object limitations, and API timeouts.

https://letmeprompt.com/rules-httpsuithu-7dvc3z0

# Realized no state was needed!

After realizing [this](https://docs.parallel.ai/api-reference/task-api-beta/fetch-task-group-runs) is an INSTANT response endpoint, it became clear that keeping my own state of individual runs wasn't needed, and since I am only interested in the state snapshot at any given moment, I also didn't need to use other streaming endpoint, nor did I need to provide one (also since my HTML page can remain simple as it won't be needed later). Because of this I was able to remove the entire DurableObject from my architecture, halving the amount of lines of code down to less than 1000 lines of code.
