This is a great idea I think that will unlock lots of productivity.

Can be further extended to also allow for doing multiple tasks (based on a contextual file)

If approved (talk to Manvesh): Would need simle oauth provider where the Parallel API key can be provided (and ultimately, needs login with parallel). Make parallel oauth provider that binds parallel API key to your X account (until they release 'login with parallel')

When MCP supports async tools and notifications to re-activate a chat with new information, we can also make parallel toolcalls possible. This will be super useful, but not sure how yet!

# TODO

Create an MCP worker that:

1. create a task with callback and instantly return Result URL
2. receive callback and query result, then set result into KV
3. make KV accessible at that URL
