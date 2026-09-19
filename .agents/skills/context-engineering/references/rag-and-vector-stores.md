# RAG & Vector Store Engineering

Production RAG architecture: vector store abstraction, index taxonomy, provider selection, filter DSL translation, and embedding sync patterns.

---

## 1. VectorStore Interface

All vector stores implement a single interface. Program to this interface, not to provider SDKs.

```python
class VectorStore:
    def query(
        self,
        vector: list[float],
        filter: dict[str, Any] | None = None,
        top_k: int = 12,
        include_metadata: bool = True,
        query_text: str | None = None,
    ) -> dict[str, Any]:
        """Returns {"matches": [{"id", "score", "metadata"}]}"""

    def upsert(self, vectors: list[dict[str, Any]]) -> dict[str, Any]:
        """Each vector: {"id", "values": list[float], "metadata": dict}"""

    def update(
        self,
        id: str,
        *,
        set_metadata: dict[str, Any] | None = None,
        values: list[float] | None = None,
    ) -> dict[str, Any]:

    def delete(
        self,
        filter: dict[str, Any] | None = None,
        ids: list[str] | None = None,
    ) -> None:

    def fetch(
        self,
        ids: list[str],
        include_metadata: bool = True,
        include_values: bool = True,
    ) -> dict[str, Any]:
        """Returns {"vectors": {id: {"values": [...], "metadata": {...}}}}"""
```

**Rule**: `query_text` is only supported by file-first providers (openai, azure_openai). ANN-based providers (TurboPuffer, Pinecone) ignore it — always embed the query before calling `query()`.

---

## 2. Provider Ecosystem

Six providers implement the VectorStore interface:

| Provider | Implementation | Distance metric | Filter format | Notes |
|----------|---------------|-----------------|---------------|-------|
| `aws` | `S3VectorsIndex` | cosine | S3 filter DSL | AWS-native; regional |
| `azure` | `AzureAISearchIndex` | cosine | OData string | Supports `query_text` |
| `pinecone` | `PineconeIndex` | cosine | `{$eq, $in, ...}` | Classic Pinecone filter |
| `turbopuffer` | `TurbopufferIndex` | cosine_distance | Tuple DSL | ANN only; no full-text |
| `openai` | `OpenAIVectorStoreIndex` | — | — | File-first; supports `query_text` |
| `azure_openai` | `AzureOpenAIVectorStoreIndex` | — | — | File-first; supports `query_text` |

**Provider selection:**
```python
from services.stores.vector.factory import get_vector_store

# Use configured provider (from VECTOR_EMBEDDINGS_PROVIDER setting)
store = get_vector_store("objects")

# Override provider explicitly
store = get_vector_store("lessons", provider="turbopuffer")
```

**Convenience factories (preferred):**
```python
from services.stores.vector.factory import (
    get_objects_index,
    get_lessons_index,
    get_knowledge_index,
    get_canvas_index,
)

objects_store = get_objects_index()
lessons_store = get_lessons_index()
```

---

## 3. Logical Index Taxonomy

Each logical index stores a different knowledge domain. Always use the canonical name — the factory resolves to the provider-specific ID.

| Logical name | Domain | Factory function |
|-------------|--------|-----------------|
| `objects` | Core HR objects (jobs, candidates, companies) | `get_objects_index()` |
| `canvas` | Agent-generated artifacts and canvases | `get_canvas_index()` |
| `files` | User-uploaded documents | `get_files_index()` |
| `conversations` | Thread and message history | `get_conversations_index()` |
| `logs` | Agent AI call logs | `get_logs_index()` |
| `items` | Structured data items | `get_items_index()` |
| `lessons` | Agent-learned lessons and corrections | `get_lessons_index()` |
| `knowledge` | Curated knowledge base | `get_knowledge_index()` |
| `models` | ML model metadata | `get_models_index()` |
| `reflections` | Self-improvement candidates | `get_reflections_index()` |
| `editorial` | Editorial and content artifacts | `get_editorial_index()` |
| `recitation` | STM recitation cache | `get_recitation_index()` |
| `network` | Social graph / network data | `get_network_index()` |

---

## 4. Filter DSL Translation

Filters are written in a canonical dict format and translated per-provider by `normalize_vector_filter()`.

### Canonical (Pinecone-style) filter format:

```python
# Equality
{"status": "active"}                          # simple equality
{"status": {"$eq": "active"}}                 # explicit $eq
{"status": {"$ne": "archived"}}               # not-equal

# Membership
{"type": {"$in": ["job", "candidate"]}}       # any of

# Compound
{"$and": [{"status": "active"}, {"company_id": "abc"}]}
{"$or":  [{"type": "job"}, {"type": "candidate"}]}
```

### Provider-specific translations (handled automatically):

| Provider | Format | Example |
|----------|--------|---------|
| Pinecone | `{"$eq": value}` | `{"status": {"$eq": "active"}}` |
| Azure | OData string | `"status eq 'active'"` |
| TurboPuffer | Tuple DSL | `["status", "Eq", "active"]` |
| AWS (S3) | S3 filter object | `{"status": {"$eq": "active"}}` |

```python
from services.stores.core.filters import normalize_vector_filter

# Translate to TurboPuffer format
tp_filter = normalize_vector_filter(
    {"status": "active", "company_id": "abc"},
    provider="turbopuffer"
)
# → ["And", [["status", "Eq", "active"], ["company_id", "Eq", "abc"]]]

# Translate to Azure OData
odata = normalize_vector_filter(
    {"$and": [{"status": "active"}, {"type": {"$in": ["job", "candidate"]}}]},
    provider="azure"
)
# → "(status eq 'active') and ((type eq 'job') or (type eq 'candidate'))"
```

### Active document filter (always apply):

```python
from services.stores.core.filters import with_active_vector_filter

# Ensures is_archived != True unless filter already mentions it
filter = with_active_vector_filter({"company_id": "abc"})
# → {"company_id": "abc", "is_archived": {"$ne": True}}
```

**Rule**: always apply `with_active_vector_filter()` before querying unless explicitly fetching archived content.

---

## 5. TurboPuffer Specifics

TurboPuffer uses vector-only ANN search (no full-text). Key constraints:

**Namespace naming**: `[A-Za-z0-9-_.]{1,128}` — invalid chars are replaced with `_`.

**Metadata types**: only `str`, `int`, `float`, `bool`, `list[str]` — other types are dropped by `_sanitize_metadata_for_turbopuffer()`. Do not store nested dicts or None values.

**Filter format**: nested tuples, not dicts:
```python
# Single condition
["status", "Eq", "active"]

# $in → "In"
["type", "In", ["job", "candidate"]]

# Compound (And/Or)
["And", [["status", "Eq", "active"], ["company_id", "Eq", "abc"]]]
["Or",  [["type", "Eq", "job"],      ["type", "Eq", "candidate"]]]
```

**Score conversion**: TurboPuffer returns `$dist` (cosine distance). The implementation converts to a score: `score = 1.0 / (1.0 + dist)`. Higher score = more similar.

**Batch limits**:
- `max_topk`: `min(AZURE_VECTOR_MAX_TOPK, S3_VECTOR_MAX_TOPK)` — typically 30
- `max_batch`: `S3_VECTOR_BATCH_SIZE` — typically 500 vectors per upsert batch

**Fetch by ID workaround**: TurboPuffer has no native fetch-by-id — the implementation uses `rank_by=("id", "asc")` with an `["id", "In", id_list]` filter.

---

## 6. RAG Query Pattern

Standard RAG query flow:

```python
from services.stores.vector.factory import get_objects_index
from services.stores.core.filters import with_active_vector_filter

async def search_objects(
    query_embedding: list[float],
    company_id: str,
    object_type: str | None = None,
    top_k: int = 12,
) -> list[dict]:
    store = get_objects_index()

    filter_spec = {"company_id": company_id}
    if object_type:
        filter_spec["object_type"] = object_type
    filter_spec = with_active_vector_filter(filter_spec)

    result = store.query(
        vector=query_embedding,
        filter=filter_spec,
        top_k=top_k,
        include_metadata=True,
    )
    return result.get("matches", [])
```

**Score threshold**: check `match["score"]` before returning results. Scores below ~0.6 are rarely useful — tune per index.

---

## 7. Upsert & Sync Pattern

```python
from services.stores.vector.factory import get_objects_index

def sync_object_embedding(obj_id: str, embedding: list[float], metadata: dict) -> None:
    store = get_objects_index()

    # Sanitize: remove None values and nested objects
    safe_metadata = {
        k: v for k, v in metadata.items()
        if v is not None and isinstance(v, (str, int, float, bool, list))
    }

    store.upsert([{
        "id": str(obj_id),
        "values": embedding,
        "metadata": safe_metadata,
    }])
```

**Delete pattern**: always delete by ID, not by filter, when removing a known object:
```python
store.delete(ids=[str(obj_id)])
```

---

## 8. Embedding Dimensions

Vector dimensions are index-specific. The factory resolves dimensions from `get_index_embedding_dimensions(index_name)`. Upserts with mismatched dimensions are logged and skipped (TurboPuffer) or raise (Pinecone/Azure).

**Validate before upsert:**
```python
expected_dims = get_index_embedding_dimensions("objects")
assert len(embedding) == expected_dims, f"Dimension mismatch: {len(embedding)} vs {expected_dims}"
```

---

## 9. RAG Failure Modes

| Failure | Symptom | Fix |
|---------|---------|-----|
| Archived content returned | Agent cites deleted records | Apply `with_active_vector_filter()` |
| Low relevance scores | Unrelated results in context | Lower top_k; add metadata filters |
| Dimension mismatch | Upsert silently skipped | Validate dims before upsert |
| Metadata stripped | Retrieved records missing fields | Check metadata type (must be str/int/float/bool/list[str]) |
| Namespace not found | Empty results | Confirm index was created and data seeded |
| Cross-company data leak | Records from wrong company returned | Always filter by `company_id` |

---

## 10. Index Selection Guide

```
User asks about a specific object by topic → objects index
Agent needs to recall its own outputs → canvas index
User uploads a document → files index
Agent needs prior conversation context → conversations index
Agent needs a lesson it learned → lessons index
Agent references company knowledge → knowledge index
Agent checks its reflection candidates → reflections index
Agent needs to recite a specific item from STM → recitation index
```

**Rule**: never search across all indexes in one call. Route queries to the most specific index first. Fallback to a broader index only if the specific one returns zero results.
