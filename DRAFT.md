# Introducing the Parallel Task MCP Server: Enterprise-Grade Async Web Intelligence

Starting today, the Parallel Task MCP Server is available - bringing state-of-the-art web research and structured data enrichment to any MCP-compatible AI agent with a single tool integration. As one of the first enterprise-grade async MCP servers, it transforms how AI agents handle complex, long-running research workflows without blocking execution.

The Task MCP Server provides two core capabilities: deep research tasks that generate comprehensive reports, and enrichment tasks that transform existing datasets with web intelligence. Built on the same infrastructure that powers our [Task API](https://docs.parallel.ai/task-api/task-quickstart), it delivers the highest quality at every price point while eliminating complex integration work.

## Two modes, infinite workflows

**Deep Research Tasks** - Generate extensive, citation-backed reports on any topic. Whether conducting competitive intelligence, due diligence, or market research, agents can now delegate complex multi-hop research that previously required custom workflows. Our processors achieve [state-of-the-art results on benchmarks](https://parallel.ai/blog/deep-research-benchmarks) like DeepResearch Bench and BrowseComp, with our Ultra8x processor reaching 96% win rate against reference reports - significantly outperforming GPT-5 at half the cost.

**Enrichment Tasks** - Transform existing datasets with structured web intelligence. Upload a CSV of companies, contacts, or entities, define what fields you need enriched, and receive back a complete dataset with citations and reasoning for every addition. This enables unprecedented scale - a single tool call can initiate 100 Ultra8x tasks in a task group, completing hundreds of hours of human labor within an hour.

## Async by design: The first enterprise-grade async MCP

The Task MCP Server uses an async architecture that lets agents start research tasks and continue executing other work without blocking. This is critical for production agents handling complex workflows - start a deep research task on competitor analysis, move on to enriching a prospect list, then retrieve the research results when complete.

Long-running deep research tasks that might take minutes no longer freeze your agent's execution. The result: agents can orchestrate multiple parallel research streams and maintain responsiveness while conducting thorough web intelligence gathering.

## Built for production AI agents

Every task returns comprehensive [Basis outputs](https://docs.parallel.ai/task-api/basis-framework) - citations linking to source materials, detailed reasoning for each field, relevant excerpts, and calibrated confidence scores. This verification framework makes the Task MCP Server suitable for production workflows where accuracy and auditability matter.

The MCP integrates seamlessly with various data sources and destinations, as outlined in our [comprehensive documentation](https://docs.parallel.ai/integrations/mcp/task-mcp#enrichment-data-sources-and-destinations):

- **Tabular files** - Excel sheets and CSVs for batch enrichment
- **Database connections** - Via Supabase MCP, Neon MCP, and other database MCPs
- **Document systems** - Notion MCP, Linear MCP for initial data gathering
- **Web search data** - [Parallel Search MCP](https://docs.parallel.ai/integrations/mcp/getting-started) for comprehensive research pipelines

## State-of-the-art performance across price points

The Task MCP Server provides access to our full processor lineup - from Lite to Ultra8x - each optimized to deliver best-in-class performance at its price point. Our processors achieve state-of-the-art results on benchmarks like [WISER-Search](https://parallel.ai/blog/search-api-benchmark) and [BrowseComp](https://parallel.ai/blog/deep-research-benchmarks), with our Ultra8x processor reaching 58% accuracy on BrowseComp - higher than human expert performance and significantly outperforming alternatives like GPT-5 (38%), Exa (14%), and Perplexity (6%).

This means your agent can dial up compute for critical research or dial down for routine enrichment, with transparent per-query pricing and no token-based billing complexity.

## Unprecedented scale in a single tool call

What sets the Parallel Task MCP apart is the sheer amount of work it can accomplish in a single tool call. Through our task group functionality, you can initiate 100 Ultra8x deep research tasks simultaneously - each equivalent to hours of expert human research. This represents hundreds of hours of human labor completed within an hour, all from a single MCP tool invocation. No other MCP server comes close to this level of work density and parallel processing capability.

## Easy integration across all MCP clients

The Parallel Task MCP Server works with any MCP-compatible client, including:

- **Cursor** - [One-click installation](https://cursor.com/en/install-mcp?name=Parallel%20Task%20MCP&config=eyJ1cmwiOiJodHRwczovL3Rhc2stbWNwLnBhcmFsbGVsLmFpL21jcCJ9)
- **Claude Desktop** - Custom connector setup
- **VS Code** - Settings.json configuration
- **Windsurf** - MCP server configuration
- **Programmatic use** - Direct API integration with [OpenAI](https://docs.parallel.ai/integrations/mcp/programmatic-use#openai-integration) and [Anthropic](https://docs.parallel.ai/integrations/mcp/programmatic-use#anthropic-integration) SDKs

For developers building production systems, the MCP can be integrated programmatically using your Parallel API key as a Bearer token, enabling seamless integration into existing agentic workflows.

## Real-world applications

The Task MCP excels in both daily professional use and development experimentation scenarios:

**Daily use cases:**

- [Sentiment analysis for ecommerce products](https://claude.ai/share/4ac5f253-e636-4009-8ade-7c6b08f7a135)
- [Competitive intelligence and market research](https://claude.ai/share/0841e031-a8c4-408d-9201-e1b8a77ff6c9)

**Development and testing:**

- [Comparing processor output quality](https://claude.ai/share/f4d6e523-3c7c-4354-8577-1c953952a360)
- [Entity resolution for social media profiles](https://claude.ai/share/198db715-b0dd-4325-9e2a-1dfab531ba41)
- [Large-scale benchmark testing](https://claude.ai/share/39d98320-fc3e-4bbb-b4d5-da67abac44f2)

## Start building

The Parallel Task MCP Server represents a new paradigm in MCP capabilities - combining enterprise-grade async architecture with unprecedented work density and state-of-the-art accuracy. Whether you're conducting daily research tasks or building production AI applications, it provides the reliability, scale, and performance modern AI agents demand.

Get started today in our [documentation](https://docs.parallel.ai/integrations/mcp/getting-started) or explore the [full integration guide](https://docs.parallel.ai/integrations/mcp/task-mcp).

For the latest benchmark results and technical deep dives, see our research on [search performance](https://parallel.ai/blog/search-api-benchmark) and [deep research capabilities](https://parallel.ai/blog/deep-research-benchmarks).
