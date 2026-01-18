# MCP GitHub & Local Docs RAG Server

A high-performance "Personal Knowledge" MCP server that enables AI tools (like Claude Desktop or GitHub Copilot) to index and search through **files (Markdown, PDF)** from GitHub repositories and local folders using an advanced Hybrid Search engine.

## 🏗 Architecture: The 3-Layer Design

The server uses a multi-layered storage strategy to ensure speed, accuracy, and semantic depth.

```text
┌───────────────────────────────────────────────────────────────────┐
│                      PERSONAL KNOWLEDGE RAG                       │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│   [ DATA SOURCES ]          [ ARCHITECTURE ]      [ ENGINE ]      │
│                                                                   │
│   📁 Local Path  ───┐      ┌────────────────┐                     │
│                     │      │    LAYER A     │      ┌──────────┐   │
│                     ├─────►│ SQL Metadata   │      │  OLLAMA  │   │
│   🌐 GitHub Repo ───┘      └───────┬────────┘      │  (Local  │   │
│                                    │               │  Embeds) │   │
│                            ┌───────▼────────┐      └────▲─────┘   │
│                            │    LAYER B     │           │         │
│                            │ Lexical (FTS5) │           │         │
│                            └───────┬────────┘           │         │
│                                    │                    │         │
│                            ┌───────▼────────┐           │         │
│                            │    LAYER C     │───────────┘         │
│                            │ Semantic Vector│                     │
│                            └────────────────┘                     │
│                                                                   │
│             [ BACKED BY SQLITE + VEC0 + BM25 SCORING ]            │
└───────────────────────────────────────────────────────────────────┘
```

### 🔹 Layer A: Structured Data (SQLite)

Handles metadata management (repos, file paths, SHA hashes, source types). It ensures that only changed files are re-indexed, optimizing resources.

### 🔹 Layer B: Lexical Store (FTS5 + BM25)

Standard "keyword" search using SQLite's Full-Text Search. This layer is critical for finding specific technical terms or function names that semantic search might generalize too much.

### 🔹 Layer C: Semantic Store (Vector Embeddings)

Uses `sqlite-vec` to perform vector similarity searches. It understands the "meaning" of your query, allowing it to find relevant documentation even if you don't use the exact keywords.

> [sqlite-vec-hybrid-search](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html)

---

## 🚀 Features

- **Multi-Source Indexing**: Index local folders and GitHub repos simultaneously. Supports **Markdown (.md, .mdx)** and **PDF** files.
- **Smart Chunking**: Automatically breaks documents into significant sections while maintaining header context.
- **Zero Setup**: Works out-of-the-box! If Ollama is not detected, it falls back to `nomic-ai/nomic-embed-text-v1.5` (running locally via `transformers.js`), which is fully compatible with the Ollama model.
- **Hybrid Search (RRF)**: Combines Lexical and Semantic results using Reciprocal Rank Fusion for superior relevance.
- **Local-First**: Uses Ollama for embeddings. Your private data never leaves your machine.
- **Self-Cleaning Cache**: Optimized embedding cache with automatic cleanup.
- **Persistent Storage**: Automatically saves indexing data in `~/.mcp-knowledge-mind/` for persistence across sessions.

## 🛠 Usage

### Tools

- **`learn_repository`**: Download and index a remote GitHub repository.
- **`learn_filesystem`**: Index a local directory (Markdown + PDF).
- **`ask_knowledge`**: Perform a hybrid search across all indexed data.
- **`get_status`**: View index statistics (doc counts, cache size, etc.).

### Usage

```bash
npx @blockquote-playground/mcp-knowledge-mind
```

### Installation for Developers

1. Clone this repository.
2. Install dependencies: `npm install`.
3. Configure your MCP client (Claude Desktop) to run:
   ```bash
   node /absolute/path/to/index.js
   ```

## ⚙️ Requirements

- [Ollama](https://ollama.com/) with `nomic-embed-text` installed.
- Node.js 18+.
- SQLite.
