Desired URL structure:

`POST /v1beta/tasks/groups`

Desired input:

```ts
type TaskGroupInput = {
  /** If it's a URL, fetch that url, expecting an array of structured inputs data (JSON) */
  inputs: string | object[];

  /** If provided, will ping this URL once all tasks are done */
  webhook_url?: string;

  /** If not provided, will suggest processor*/
  processor?: string;
  output_type: "text" | "json";
  /**
   * Provide either output_description or output_schema.
   *
   * - if description is provided for "text" output_type, text output will be available
   * - if description is provided for "json" output_type, will suggest output_schema
   * - if not provided, output_schema must be provided for "json" output_type
   * - output_schema will not work in combination with "text" output_type
   */
  output_description?: string;
  output_schema?: JSONSchema;
};
```

Desired output:

```ts
type TaskGroupOutput = {
  /** URL at origin with pathname equal to the task run ID */
  url: string;
};
```

`GET /{trun_id}[.(json|md|html|sse)]` - publicly shows (intermediate) result in accepted format. format can be made explicit using optional extension, but otherwise follows accept header.

Make me a cloudflare worker to be hosted at https://tasks-mcp-demo.parallel.ai that creates the task group and inserts all inputs, then streams the results to a durable object unique to that task run.

Stream pointers:

- It's crucial that the stream (performed from the DO) is reactivated after it times out, until all task runs are done.
- After all tasks are done
  - send a POST request to the webhook_url (if available) containing `{url:string}`
  - schedule an alarm to remove the DO after 30 days.

For JSON outputs, the results should become available in the following format:

```ts
type TaskGroupResultOutput = {
  taskgroup_id: string;
  metadata: any;
  status: {
    num_task_runs: number;
    task_run_status_counts: object;
    is_active: boolean;
    status_message: string;
    modified_at: string;
  };
  created_at: string;
  results: object[];
};
```

For MD, parse it into a more readable format that doesn't include reasoning or sources, and has just the data in a table with confidence in color-emoji.

For HTML, inject JSON as application/json script into `resultHtml` which is hardcoded (Render a simple table from it)

For SSE, proxy the current stream from the DO, but keep it alive even if it's interrupted (retry immediately and keep output stream going)

Context:

- https://flaredream.com/system-ts.md
- https://docs.parallel.ai/task-api/features/group-api.md
- https://docs.parallel.ai/api-reference/task-api-beta/create-task-group.md
- https://docs.parallel.ai/api-reference/task-api-beta/add-runs-to-task-group.md
- https://docs.parallel.ai/api-reference/task-api-beta/stream-task-group-runs.md
- https://docs.parallel.ai/api-reference/task-api-beta/stream-task-group-events.md
- https://docs.parallel.ai/api-reference/task-api-beta/retrieve-task-group.md
- https://docs.parallel.ai/api-reference/task-api-beta/retrieve-task-group-run.md
- https://docs.parallel.ai/api-reference/task-api-v1/retrieve-task-run-result.md
- https://docs.parallel.ai/task-api/features/ingest-api.md
