# Sleep MCP Server

[Thread](https://x.com/janwilmake/status/1973409552398778786)

This MCP server provides a simple `sleep` tool that demonstrates progress notifications in the Model Context Protocol.

See the screenshots for evidence that it works (or doesn't) in different clients:

- Inspector works and receives notifications and messages
- Cursor seems fine, easily sleeps for 15m. Only shows progress.
- VSCode seems fine, still going for the 45m. Only shows progress.
- Claude.ai times out for 6 minutes, but succeeds for 3 minutes. Does NOT show messages or progress. After failing a few times, 3 minutes now also fails. Unreliable. Also doesn't show intermittent output after navigating away and back.

## Features

- **Sleep Tool**: Sleep for a specified number of seconds (1-60)
- **Progress Updates**: Sends `{currentSecond}/{totalSeconds}` updates every second
- **Streaming Support**: Uses Server-Sent Events for real-time progress updates
- **Non-streaming Fallback**: Works with regular HTTP requests too

## Usage

1. Connect with MCP Inspector:
   ```bash
   npx @modelcontextprotocol/inspector
   ```
2. Use the server URL (e.g., `http://localhost:8787/mcp`)

3. Call the `sleep` tool with:

   ```json
   {
     "seconds": 5
   }
   ```

4. Watch progress notifications: `1/5`, `2/5`, `3/5`, `4/5`, `5/5`

5. Final response: `"slept 5 seconds"`

## How It Works

- When called with streaming (`Accept: text/event-stream`), sends progress notifications every second
- Each notification shows current progress as `{n}/{seconds}`
- Final response contains the completion message
- Non-streaming requests just wait and return the final result

This demonstrates how MCP tools can provide real-time feedback for long-running operations.
