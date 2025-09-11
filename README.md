# Parallel Multitask

A Cloudflare Worker implementation that creates Parallel.ai task groups and provides streaming results through unique URLs.

## Features

- **Task Group Creation**: Create task groups with inputs from JSON arrays or URLs
- **Automatic Processing**: Automatically suggests processors and handles task execution
- **Multiple Output Formats**: Support for JSON, Markdown, HTML, and Server-Sent Events
- **Real-time Streaming**: Stream results as they become available
- **Webhook Support**: Notify external services when tasks complete
- **Auto-cleanup**: Automatically remove data after 30 days

## API Endpoints

### Create Task Group

```http
POST /v1beta/tasks/groups
Content-Type: application/json

{
  "inputs": [
    {"company_name": "OpenAI", "website": "https://openai.com"},
    {"company_name": "Anthropic", "website": "https://anthropic.com"}
  ],
  "output_type": "json",
  "output_description": "Find the CEO and founding year for each company",
  "webhook_url": "https://example.com/webhook",
  "processor": "pro"
}
```

**Response:**

```json
{ "url": "https://tasks-mcp-demo.parallel.ai/abc123-def456-ghi789" }
```

### Get Results

Access results through the returned URL in different formats:

- **JSON**: `GET /{task_id}` or `GET /{task_id}.json`
- **Markdown**: `GET /{task_id}.md`
- **HTML**: `GET /{task_id}.html`
- **Server-Sent Events**: `GET /{task_id}.sse`

## Input Schema

```typescript
interface TaskGroupInput {
  // Input data: either JSON array or URL to fetch JSON array
  inputs: string | object[];

  // Optional webhook URL to notify on completion
  webhook_url?: string;

  // Processor type (auto-suggested if not provided)
  processor?: string;

  // Output format type
  output_type: "text" | "json";

  // Either description or schema (but not both)
  output_description?: string;
  output_schema?: JSONSchema;
}
```

## Output Formats

### JSON Format

```json
{
  "taskgroup_id": "tgrp_abc123",
  "metadata": {},
  "status": {
    "num_task_runs": 2,
    "task_run_status_counts": { "completed": 2 },
    "is_active": false,
    "status_message": "Completed",
    "modified_at": "2025-01-11T10:30:00Z"
  },
  "created_at": "2025-01-11T10:00:00Z",
  "results": [
    { "ceo": "Sam Altman", "founded": 2015 },
    { "ceo": "Dario Amodei", "founded": 2021 }
  ]
}
```

### Markdown Format

Clean table format with confidence indicators:

```markdown
# Task Group Results

**Status**: ✅ Completed
**Total Tasks**: 2
**Created**: 1/11/2025, 10:00:00 AM

## Results

| #   | Result                                   | Confidence |
| --- | ---------------------------------------- | ---------- |
| 1   | {"ceo": "Sam Altman", "founded": 2015}   | 🟢         |
| 2   | {"ceo": "Dario Amodei", "founded": 2021} | 🟢         |
```

### HTML Format

Styled webpage with embedded JSON data for client-side processing.

### Server-Sent Events

Real-time streaming of results as they become available:

```
data: {"status": {"is_active": true, "num_task_runs": 2, ...}, ...}

data: {"status": {"is_active": false, "num_task_runs": 2, ...}, "results": [...]}

data: [DONE]
```

## Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Set your Parallel API key:**

   ```bash
   wrangler secret put PARALLEL_API_KEY
   ```

3. **Deploy:**

   ```bash
   npm run deploy
   ```

4. **Development:**
   ```bash
   npm run dev
   ```

## Environment Variables

- `PARALLEL_API_KEY` (required): Your Parallel.ai API key

## Architecture

- **Main Worker**: Handles HTTP requests and creates Durable Object instances
- **TaskGroupDO**: Durable Object that manages individual task groups
  - Creates Parallel.ai task groups
  - Streams results in real-time
  - Stores data in SQLite
  - Handles webhooks and cleanup

## Features Details

### Input Resolution

- If `inputs` is a string URL, it fetches the JSON array from that URL
- Validates that the fetched content is a valid JSON array

### Processor Suggestion

- If no processor is specified, uses Parallel.ai's suggest-processor API
- Falls back to "core" processor if suggestion fails

### Real-time Streaming

- Continuously polls Parallel.ai's streaming endpoint
- Updates local database with task results
- Automatically retries on connection failures
- Keeps streams alive until all tasks complete

### Webhook Notifications

- Sends POST request to `webhook_url` when all tasks complete
- Payload: `{"url": "https://tasks-mcp-demo.parallel.ai/{task_id}"}`

### Auto-cleanup

- Sets a 30-day alarm when tasks complete
- Automatically removes all data after 30 days

## Error Handling

- Comprehensive error handling for all external API calls
- Graceful degradation when optional features fail
- Automatic retry logic for streaming connections
- Proper HTTP status codes and error messages

## CORS Support

All endpoints include proper CORS headers for browser usage.
