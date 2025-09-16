# Sleep MCP Server

This MCP server provides a simple `sleep` tool that demonstrates progress notifications in the Model Context Protocol.

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
