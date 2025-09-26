# Context

MCP context:

- MCP Specification: https://uithub.com/modelcontextprotocol/modelcontextprotocol/tree/main/docs/specification/2025-06-18?lines=false
- Typescript JSON RPC methods: https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/refs/heads/main/schema/2025-03-26/schema.ts or new https://uithub.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2025-06-18/schema.ts
- with-mcp implementation: https://uithub.com/janwilmake/with-mcp/blob/main/with-mcp.ts

Other Context:

- Parallel Multitask API: https://task-mcp.parallel.ai/openapi.json
- Parallel oauth provider url: https://oauth-demo.parallel.ai
- Simplerauth-client: https://uithub.com/janwilmake/universal-mcp-oauth/blob/main/simplerauth-client/README.md

# SPEC

Make me a cloudflare worker that creates the task group and inserts all inputs, then streams the results to a durable object unique to that task run.

# `POST /v1beta/tasks/multitask`

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

Required header: x-api-key (the parallel api key) (no env parallel api key is needed)

Process:

- creates the group (see https://docs.parallel.ai/task-api/features/group-api.md and https://docs.parallel.ai/api-reference/task-api-beta/create-task-group.md )
- if needed, uses ingest apis https://docs.parallel.ai/task-api/features/ingest-api.md
- adds all task runs https://docs.parallel.ai/api-reference/task-api-beta/add-runs-to-task-group.md
- creates DO with task group ID as ID, sets all details we have about it including all runs

Desired output: string (URL at origin with pathname equal to the task group ID)

# TaskGroupDO

After creation, should keep continuous streams running to retrieve results of task group and all runs and keep the DB up to date and the output stream.

It should also provide queryable support so we can use the studio

An RPC function `getData` to get current data.

A request/response function (fetch) to connect to the output stream.

Context:

- https://flaredream.com/system-ts.md
- https://uithub.com/janwilmake/queryable-object/blob/main/README.md
- https://docs.parallel.ai/api-reference/task-api-beta/stream-task-group-events.md
- https://docs.parallel.ai/api-reference/task-api-beta/stream-task-group-runs.md
- https://docs.parallel.ai/api-reference/task-api-beta/retrieve-task-group.md
- https://docs.parallel.ai/api-reference/task-api-beta/retrieve-task-group-run.md
- https://docs.parallel.ai/api-reference/task-api-v1/retrieve-task-run-result.md

# `GET /{trun_id}[.(json|md|html|sse|db)]`

- publicly shows (intermediate) result in accepted format. format can be made explicit using optional extension, but otherwise follows accept header.

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
  // make sure the inputs (array of objects) submitted to the original post request are augmenting the output.content when data is retrieved (in json, html, and md)? it is important we know the trun_id matching each input. in the end, results should be: {$id, $status, ...inputs, ...output.content} so it's flat.
  results: object[];

  runs: object[];
};
```

For MD, parse it into a more readable format that doesn't include reasoning or sources, and has just the data in a table with confidence in color-emoji. just the results with statuses is important

For HTML, inject JSON as application/json script into `resultHtml` which is hardcoded (the html should render the content array as a table (needs each property to be a column, and show status as initial column) and keep the .sse stream open to rerender updated rows.)

For SSE, proxy the current stream from the DO, but keep it alive even if it's interrupted (retry immediately and keep output stream going)

For .db, use `studioMiddleware` without authentication (`dangerouslyDisableAuth: true` in config)

The task group gets created initially then the DO gets initialized with the responded task group id being the DO id. the DO has 2 tables created on construction: details and runs. the DO needs to use @Queryable to properly allow studio access.

# `GET /`

HTML file that uses parallel style (see: https://assets.p0web.com
) and cdn.tailwindcss.com script to allow easy access to the main api, storing parallel api key in localStorage.

The form should allow for all possibilities and have a prefilled example so users can try immediately after entering their API key. After submitting, show buttons to open all different formats in new tab
