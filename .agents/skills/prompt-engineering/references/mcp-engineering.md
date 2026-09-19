# MCP Engineering

Model Context Protocol (MCP) integration patterns: server types, lifecycle management, security, auth, caching, tool filtering, and hosted vs local deployment.

---

## 1. MCP Layer in the AI Stack

```
Application / Agent
        │
        ├── Local tools (Python functions, ToolSpec)
        │
        ├── MCP (local via Stdio)        ← subprocess, local process
        │     └── MCPServerStdio
        │
        ├── MCP (remote via HTTP)        ← external services
        │     └── MCPServerStreamableHttp
        │
        └── Hosted MCP (OpenAI-managed)  ← delegated execution
              └── HostedMCPTool
```

**MCP vs native tools:** MCP extends agents with external system access (Notion, Slack, GitHub) without writing tool implementations. Native tools give more control over behavior, category, and persistence policy.

---

## 2. Server Types

### MCPServerStdio — Local Process

```python
from agents.mcp import MCPServerStdio

server = MCPServerStdio(
    name="local-tools",
    params={
        "command": "python",
        "args": ["-m", "my_mcp_server"],
    },
    cache_tools_list=True,   # cache the tool list after first fetch
)
```

**Use when:**
- The MCP server is a local process (same machine or container)
- Communication via stdin/stdout is sufficient
- You control the server implementation

**Security:** local stdio servers run with the same permissions as the agent process. Sandbox if untrusted.

---

### MCPServerStreamableHttp — Remote HTTP

```python
from agents.mcp import MCPServerStreamableHttp

server = MCPServerStreamableHttp(
    name="notion-mcp",
    url="https://mcp.notion.so/sse",
    headers={
        "Authorization": f"Bearer {token}",
        "X-Session-Id": session_id,
    },
    timeout=3.0,
)
```

**Use when:**
- The MCP server is an external HTTP service
- You need to pass auth headers per session
- Integrating with third-party MCP providers (Notion, Slack, GitHub, Linear)

---

### HostedMCPTool — OpenAI-Managed Remote MCP

```python
from agents import HostedMCPTool

tool = HostedMCPTool(
    mcp=Mcp(
        server={"url": "https://mcp.example.com", "type": "url"},
        headers={"Authorization": f"Bearer {token}"},
        approval="never",    # or "always" for sensitive ops
    )
)
```

**Use when:**
- OpenAI manages the remote MCP server connection
- Delegated execution: OpenAI handles the MCP call, returns results
- Lower operational overhead — no connection lifecycle management on your side

**ToolCategory for HostedMCPTool:** `hosted_mcp_tool` — applies separate streaming and confirmation behavior.

---

## 3. Connection Lifecycle & Reuse

MCP connections are expensive to establish. Reuse them across requests to prevent memory and latency issues.

**MCPCacheManager** is a singleton that caches the tool list per server:

```python
class MCPCacheManager:
    _default_ttl = 300   # 5-minute cache for tool lists

    def is_expired(self, server_id: str) -> bool:
        # Returns True if cache for this server has exceeded TTL
```

**Cache invalidation triggers:**
- TTL expiry (5 min default)
- Server restart or reconnect
- Explicit cache clear (operator action)

**Implementation rule:** never create a new MCP server connection per request. Cache connections at the manager level; only recreate on connection failure.

---

## 4. Tool List Caching

```python
from services.mcp.caching import MCPCacheManager

cache_manager = MCPCacheManager()

@cache_manager.with_cache(server_id=server.name, ttl=300)
async def get_server_tools(server):
    return await server.list_tools()
```

**When to lower TTL:**
- The MCP server updates its tool list frequently (dynamic tool registration)
- You need near-real-time reflection of tool availability changes

**When to raise TTL:**
- The MCP server has a static, stable tool list
- Latency reduction is critical
- The server is rate-limited for list_tools calls

---

## 5. Tool Filtering

When an MCP server exposes many tools but you only need a subset:

```python
from agents.mcp import create_static_tool_filter

# Only expose these tools from the server to the agent
tool_filter = create_static_tool_filter(
    allowed_tools=["search_pages", "get_page", "create_page"]
)

server = MCPServerStreamableHttp(
    name="notion-mcp",
    url=url,
    headers=headers,
    tool_filter=tool_filter,
)
```

**Why filter:** exposing all tools from an MCP server degrades tool selection accuracy. An agent with 50 MCP tools makes more wrong calls than one with 10 filtered tools. Apply filtering to match the agent's actual scope.

---

## 6. Authentication — 401-Driven OAuth Flow

MCP servers return `401 Unauthorized` when the session token expires or is missing. Handle this without crashing the agent run.

**Protocol (per MCP Authorization spec):**
1. Server returns `401` + `WWW-Authenticate` header
2. Client parses the challenge: `Bearer realm="...", authorization_uri="...", resource="...", scope="..."`
3. Trigger OAuth flow via SDK HITL (pause agent, redirect user to OAuth)
4. After OAuth completes, resume agent execution on the same thread

```python
from services.mcp.auth_handler import parse_www_authenticate

# Parse the 401 response header
challenge = parse_www_authenticate(response.headers.get("WWW-Authenticate"))

# challenge contains:
# {
#   "scheme": "Bearer",
#   "realm": "...",
#   "authorization_uri": "https://oauth.provider.com/authorize",
#   "resource": "https://mcp.service.com",
#   "scope": "read write",
# }

# Trigger HITL confirmation (pauses agent)
auth_confirmation = AuthConfirmation(
    authorization_uri=challenge["authorization_uri"],
    scopes=challenge["scope"].split(),
    resource=challenge["resource"],
)
```

**Auth confirmation flow maps to:** `ToolCategory.AUTH_CONFIRMATION` → `ConfirmationPolicy.ALWAYS_ASK`

---

## 7. Security — DNS Rebinding Protection

**Critical:** MCP HTTP servers running on localhost MUST have DNS rebinding protection. Without it, malicious web pages can make cross-origin requests to your local MCP server.

**Required configuration:**
```python
# Applied to FastMCP HTTP servers
uvicorn.Config(
    app,
    host="127.0.0.1",           # localhost only, never 0.0.0.0
    proxy_headers=False,         # CRITICAL: disable proxy header trust
    forwarded_allow_ips="127.0.0.1",  # only trust forwarded headers from localhost
    server_header=False,         # don't expose server information
)
```

**How the patch is applied:**
```python
def _patch_fastmcp_dns_rebinding_protection():
    """Monkeypatch FastMCP before any server is started."""
    # Override run_streamable_http_async with secure config
```

**Rule:** always apply this patch before starting any local HTTP MCP server. Failure to do so is a security vulnerability.

---

## 8. Approval Handler for Sensitive Operations

For MCP tools that mutate external systems, attach an approval handler:

```python
def approval_handler(tool_name: str, args: dict) -> bool:
    """Return True to approve, False to block."""
    # Log the tool call for audit
    # Check if operation is in the allowed whitelist
    # Optionally: pause for user confirmation via HITL
    return tool_name in APPROVED_MCP_TOOLS

server = MCPServerStreamableHttp(
    name="github-mcp",
    url=url,
    headers=headers,
    approval_handler=approval_handler,
)
```

**When to require approval:**
- The MCP tool creates, modifies, or deletes data in an external system
- The operation is not easily reversible
- The tool has high blast radius (bulk operations, permission changes)

---

## 9. Resource Sync

MCP resources are contextual data (documents, files, state) exposed by the MCP server — distinct from tools (actions).

```python
from services.mcp.resource_sync import sync_mcp_resources

# Sync resources from a connected MCP server into the platform
synced = sync_mcp_resources(
    server=server,
    company_id=company_id,
    resource_types=["file", "page", "record"],
)
```

**MCP tools vs MCP resources:**
| | MCP Tools | MCP Resources |
|-|-----------|---------------|
| What they are | Actions the agent can invoke | Data the agent can read |
| Example | `create_issue`, `send_message` | Document contents, file metadata |
| Invocation | Tool call (`function_call`) | Included in context (RAG) |
| Mutation | Yes (side effects) | No |

---

## 10. Build Hosted MCP Tool

```python
from services.mcp.hosted_tool_builder import build_hosted_mcp_tool

tool = build_hosted_mcp_tool(
    provider="notion",
    url="https://mcp.notion.so/sse",
    headers={"Authorization": f"Bearer {token}", "X-Session-Id": session_id},
    server_name="Notion",
    server_key="notion:company:123",     # cache key
    approval_handler=approval_handler,   # optional
    timeout=3.0,
    defer_loading=False,                 # if True, don't connect until first use
)
```

**Returns:** `HostedMCPTool` instance (or `None` if SDK doesn't support it — falls back to `MCPServerStreamableHttp`).

---

## 11. MCP Tool Design Rules

When authoring an MCP server's tools, apply the same principles as native tools:

- **Intern Test** on every tool description — see [tool-call-design.md](./tool-call-design.md)
- **Narrow tool affordances** — avoid broad "do_anything" tools
- **Explicit auth** — document what credentials are required per tool
- **Precise inputs/outputs** — use schemas, not free-form strings
- **Observable side effects** — every mutation is logged via approval handler

---

## 12. Debugging MCP Failures

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `401 Unauthorized` on tool call | Session token expired | Trigger OAuth refresh via auth handler |
| `connection refused` | MCP server not running | Check server process, restart |
| Tool list empty after connect | Cache returning empty | Clear `MCPCacheManager` cache, retry |
| Agent calls wrong MCP tool | Too many tools visible | Apply `create_static_tool_filter` |
| High latency on first call | No connection reuse | Verify MCPCacheManager is used |
| DNS rebinding attack surface | HTTP server on 0.0.0.0 | Apply DNS rebinding protection patch |
| Tool returned unexpected format | Schema mismatch | Validate tool output against expected schema |
