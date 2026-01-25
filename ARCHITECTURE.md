# 🏢 MCP Knowledge Mind - Architecture Guide

> **Welcome to the Knowledge Mind Corporation!** This guide will take you on a tour of our company's organizational structure, where every department has a specific role in managing and searching through documentation.

## 🎯 The Big Picture: Hexagonal Architecture

Think of this codebase as a **well-organized company** where:

- **The Core Business** (Domain) defines what we do
- **The Managers** (Application) coordinate the work
- **The Workers** (Infrastructure) do the actual technical tasks
- **The Reception** (Interface) handles external requests

```
┌─────────────────────────────────────────────────────────┐
│  👔 @interface (The Reception Desk)                     │
│  "Hello! How can I help you index documents today?"     │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  📋 @application (The Project Managers)                 │
│  "Let me coordinate the teams to get this done!"        │
└──────┬────────────────────┬─────────────────────────────┘
       │                    │
       ▼                    ▼
┌──────────────┐    ┌──────────────────────┐
│ 🔧 @infra    │    │ 🧠 @domain           │
│ (Workers)    │    │ (Business Rules)     │
└──────────────┘    └──────────────────────┘
```

---

## 🧠 @domain - The Brain (Business Logic)

**What it is:** The core business rules that never change, regardless of technology.

**Analogy:** The company's mission statement and core values - they're true whether you work from an office, remotely, or on Mars.

### 📁 Directory Structure

```
@domain/
├── entities/              → The "Things" we work with
│   ├── Doc.js            → 📄 What IS a document?
│   └── Chunk.js          → 📦 What IS a chunk of text?
│
├── repositories/          → Contracts for data storage
│   ├── IDocsRepository.js       → 💾 "How should we save docs?"
│   └── IEmbeddingService.js     → 🔮 "How should we generate embeddings?"
│
└── services/              → Pure business logic
    ├── ContentSplitter.js       → ✂️ How to intelligently split text
    └── BatchProcessor.js        → 📊 How to process items in batches
```

### 🎭 Meet the Domain Team

#### 📄 **Doc.js** - The Document Definition

```javascript
// "A document is a document, whether it's in SQLite, MongoDB, or carved in stone"
class Doc {
  constructor({ repoOwner, repoName, path, content, ... }) {
    // Defines what makes a document a document
  }
}
```

**Role:** Defines the essence of a document - its owner, name, path, content, and source type.

---

#### 📦 **Chunk.js** - The Text Chunk Definition

```javascript
// "A chunk is a piece of text with a header, content, and word count"
class Chunk {
  constructor({ docId, header, content, wordCount, embedding }) {
    // Defines what makes a chunk a chunk
  }
}
```

**Role:** Represents a searchable piece of a document with its embedding vector.

---

#### ✂️ **ContentSplitter.js** - The Smart Text Splitter

```javascript
// "I know how to split Markdown intelligently by headers"
static smartChunk(text, maxChunkSize = 1000) {
  // Business rule: Split by ## headers, max 1000 words per chunk
  // Business rule: Chunks must be > 50 characters
  // Business rule: Keep headers with their content
}
```

**Role:** Implements the **business logic** of how to split documents into searchable chunks.

**Why it's domain logic:** These rules are true regardless of whether the text comes from GitHub, local files, or a carrier pigeon.

---

#### 📊 **BatchProcessor.js** - The Concurrency Manager

```javascript
// "I know the optimal way to process items in batches"
static calculateOptimalBatchSize(totalItems) {
  // Business rule: Use √(totalItems) for balanced concurrency
  // Business rule: Minimum 5, maximum 20
}

static async processBatch(items, batchSize, processFn, onBatchComplete) {
  // Business rule: Process in controlled batches
  // Business rule: Report progress after each batch
}
```

**Role:** Implements the **strategy** for efficient batch processing with concurrency control.

---

#### 💾 **IDocsRepository.js** - The Storage Contract

```javascript
// "This is what ANY storage system must be able to do"
interface IDocsRepository {
  saveDoc(doc)
  saveChunks(docId, chunks)
  search(query, limit)
  getStats()
}
```

**Role:** Defines the **contract** - what operations any storage system must support. It's like a job description.

---

#### 🔮 **IEmbeddingService.js** - The Embedding Contract

```javascript
// "This is what ANY embedding service must be able to do"
interface IEmbeddingService {
  embed(text)
  init()
}
```

**Role:** Defines what any embedding service (Ollama, OpenAI, local transformers) must provide.

---

## 📋 @application - The Project Managers

**What it is:** Use cases that coordinate domain logic and infrastructure to accomplish specific tasks.

**Analogy:** Project managers who say "To index a GitHub repo, we need someone to fetch files, someone to split them, someone to generate embeddings, and someone to save everything."

### 📁 Directory Structure

```
@application/
└── use-cases/
    ├── LearnRepositoryUseCase.js    → 🌐 "Index a GitHub repository"
    ├── LearnFilesystemUseCase.js    → 📁 "Index local files"
    ├── AskKnowledgeUseCase.js       → 🔍 "Search indexed docs"
    └── GetSystemStatusUseCase.js    → 📊 "Get system stats"
```

### 🎭 Meet the Management Team

#### 🌐 **LearnRepositoryUseCase.js** - The GitHub Indexing Manager

```javascript
async execute({ owner, repo, branch }) {
  // 1. Ask GithubService to fetch files
  // 2. Use ContentSplitter to chunk them
  // 3. Ask EmbeddingService for vectors
  // 4. Ask DocsRepository to save everything
  // 5. Use BatchProcessor for efficiency
}
```

**Role:** Orchestrates the entire GitHub indexing workflow. Doesn't know HOW to fetch from GitHub or HOW to save to SQLite - just coordinates the teams.

**Key Features:**

- ✅ Automatic batch size calculation (√totalFiles)
- ✅ Progress logging after each batch
- ✅ Handles both .md and .pdf files

---

#### 📁 **LearnFilesystemUseCase.js** - The Local Files Manager

```javascript
async execute({ directoryPath, maxDepth }) {
  // Same workflow as GitHub, but uses FileSystemService instead
}
```

**Role:** Same as LearnRepositoryUseCase, but for local files instead of GitHub repos.

---

#### 🔍 **AskKnowledgeUseCase.js** - The Search Coordinator

```javascript
async execute({ query, limit }) {
  // 1. Generate embedding for query
  // 2. Search using hybrid (lexical + semantic)
  // 3. Rank results using RRF (Reciprocal Rank Fusion)
  // 4. Return formatted results
}
```

**Role:** Coordinates the search process using both keyword matching (FTS5) and semantic search (vectors).

---

#### 📊 **GetSystemStatusUseCase.js** - The Stats Reporter

```javascript
async execute() {
  // Ask repository for statistics
  // Format and return
}
```

**Role:** Simple coordinator to get and format system statistics.

---

## 🔧 @infrastructure - The Workers

**What it is:** The actual implementations that do the technical work.

**Analogy:** The workers who know HOW to use specific tools - one knows SQLite, another knows GitHub's API, another knows Ollama.

### 📁 Directory Structure

```
@infrastructure/
├── database/
│   └── SqliteDocsRepository.js      → 💾 SQLite expert
│
├── services/
│   ├── GithubService.js             → 🐙 GitHub API expert
│   ├── FileSystemService.js         → 📂 File system expert
│   ├── OllamaEmbeddingService.js    → 🦙 Ollama expert
│   └── LocalEmbeddingService.js     → 🤖 Transformers expert
│
└── utils/
    └── Logger.js                     → 📝 Logging utility
```

### 🎭 Meet the Technical Team

#### 💾 **SqliteDocsRepository.js** - The Database Specialist

```javascript
class SqliteDocsRepository implements IDocsRepository {
  saveDoc(doc) {
    // Uses better-sqlite3 to save to SQLite
    // Uses sqlite-vec for vector embeddings
    // Uses FTS5 for full-text search
  }

  search(query, limit) {
    // Hybrid search: FTS5 + vector similarity
    // Reciprocal Rank Fusion for ranking
  }
}
```

**Role:** Knows the intricate details of SQLite, sqlite-vec, and FTS5. Implements the IDocsRepository contract.

**Key Features:**

- ✅ WAL mode for performance
- ✅ Hybrid search (lexical + semantic)
- ✅ Automatic cache cleanup
- ✅ Embedding caching for speed

---

#### 🐙 **GithubService.js** - The GitHub Specialist

```javascript
class GithubService {
  async getTree(owner, repo, branch) {
    // Uses Octokit to fetch repository tree
  }

  async getFileContent(owner, repo, fileSha, filePath) {
    // Fetches file content from GitHub
    // Handles both .md and .pdf files
    // Uses PDFParse for PDF extraction
  }
}
```

**Role:** Knows how to talk to GitHub's API using Octokit. Handles PDF parsing too.

---

#### 📂 **FileSystemService.js** - The File System Specialist

```javascript
class FileSystemService {
  async getFilesRecursive(directoryPath, maxDepth) {
    // Recursively finds .md, .mdx, and .pdf files
  }

  async readFile(filePath) {
    // Reads file content
    // Handles both text and PDF files
  }
}
```

**Role:** Knows how to navigate the file system and read files. Handles PDF parsing for local files.

---

#### 🦙 **OllamaEmbeddingService.js** - The Ollama Specialist

```javascript
class OllamaEmbeddingService implements IEmbeddingService {
  async init() {
    // Checks if Ollama is running
  }

  async embed(text) {
    // Uses Ollama API to generate embeddings
    // Fast! (10-50x faster than local transformers)
  }
}
```

**Role:** Knows how to communicate with Ollama for fast embedding generation.

**Performance:** ⚡ **10-50x faster** than local transformers!

---

#### 🤖 **LocalEmbeddingService.js** - The Transformers Specialist

```javascript
class LocalEmbeddingService implements IEmbeddingService {
  async init() {
    // Loads nomic-ai/nomic-embed-text-v1.5 model
    // Downloads model on first run
  }

  async embed(text) {
    // Uses @xenova/transformers locally
    // No external dependencies
  }
}
```

**Role:** Fallback embedding service using local transformers. Slower but works offline.

**Performance:** 🐌 Slow but reliable (no external service needed)

---

#### 📝 **Logger.js** - The Communications Specialist

```javascript
class Logger {
  static info(message)              // General logging
  static error(message)             // Error logging
  static progress(current, total)   // Progress tracking
}
```

**Role:** Handles all logging to both stderr (for MCP) and files (for persistence).

**Logs to:**

- `~/.mcp-knowledge-mind/server_info.log`
- `~/.mcp-knowledge-mind/server_error.log`

---

## 👔 @interface - The Reception Desk

**What it is:** The entry point that handles external requests (MCP protocol).

**Analogy:** The receptionist who greets visitors, understands their requests, and directs them to the right manager.

### 📁 Directory Structure

```
@interface/
└── mcp/
    └── ToolsHandler.js    → 📞 MCP protocol handler
```

### 🎭 Meet the Front Desk

#### 📞 **ToolsHandler.js** - The Receptionist

```javascript
class ToolsHandler {
  getToolDefinitions() {
    // Returns available MCP tools:
    // - learn_repository
    // - learn_filesystem
    // - ask_knowledge
    // - get_status
  }

  async handleToolCall(name, args) {
    // Routes requests to the appropriate use case
    // Formats responses for MCP protocol
  }
}
```

**Role:** Translates MCP requests into use case calls and formats responses back to MCP.

**Handles:**

- ✅ Tool definitions (schema)
- ✅ Request routing
- ✅ Response formatting
- ✅ Error handling

---

## 🔄 How It All Works Together

### Example: Indexing a GitHub Repository

```
1. 👔 MCP Client → ToolsHandler
   "Please index lit/lit.dev"

2. 📋 ToolsHandler → LearnRepositoryUseCase
   "Execute with owner='lit', repo='lit.dev'"

3. 🧠 LearnRepositoryUseCase coordinates:
   ├─ 🐙 GithubService: "Fetch the file tree"
   ├─ ✂️ ContentSplitter: "Split each file into chunks"
   ├─ 🦙 OllamaEmbeddingService: "Generate embeddings"
   ├─ 📊 BatchProcessor: "Process in batches of 17"
   └─ 💾 SqliteDocsRepository: "Save everything"

4. 📋 LearnRepositoryUseCase → ToolsHandler
   "Done! Indexed 279 files, 1745 chunks"

5. 👔 ToolsHandler → MCP Client
   "✅ Success!"
```

---

## 🎨 Why This Architecture?

### ✅ **Flexibility**

```javascript
// Today: SQLite
const repo = new SqliteDocsRepository();

// Tomorrow: PostgreSQL
const repo = new PostgresDocsRepository();

// Use cases don't change! 🎉
```

### ✅ **Testability**

```javascript
// Test with mocks
const fakeGithub = new FakeGithubService();
const useCase = new LearnRepositoryUseCase(repo, fakeGithub, embedding);
```

### ✅ **Maintainability**

- Change database? → Only touch `@infrastructure/database`
- Change embedding provider? → Only touch `@infrastructure/services`
- Change business rules? → Only touch `@domain`
- Add new MCP tool? → Only touch `@interface`

---

## 📊 Quick Reference

| Layer               | Purpose           | Examples                                  | Can Change?  |
| ------------------- | ----------------- | ----------------------------------------- | ------------ |
| **@domain**         | Business rules    | "Chunks > 50 chars", "Process in batches" | ❌ Rarely    |
| **@application**    | Workflows         | "Index repo", "Search docs"               | 🟡 Sometimes |
| **@infrastructure** | Technical details | SQLite, Ollama, GitHub API                | ✅ Often     |
| **@interface**      | External API      | MCP protocol                              | ✅ Often     |

---

## 🚀 Getting Started

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Optional: Install Ollama for speed:**

   ```bash
   brew install ollama
   ollama serve
   ollama pull nomic-embed-text
   ```

3. **Run the server:**

   ```bash
   npm start
   ```

4. **Use with MCP Inspector:**
   ```bash
   npm run inspect
   ```

---

## 📚 Learn More

- **Hexagonal Architecture:** [Alistair Cockburn's original article](https://alistair.cockburn.us/hexagonal-architecture/)
- **Domain-Driven Design:** [Eric Evans' book](https://www.domainlanguage.com/ddd/)
- **MCP Protocol:** [Model Context Protocol docs](https://modelcontextprotocol.io/)

---

## 🎯 Summary

Think of this codebase as a **well-run company**:

- 🧠 **@domain** = The unchanging business rules
- 📋 **@application** = The managers who coordinate
- 🔧 **@infrastructure** = The workers who execute
- 👔 **@interface** = The reception that handles requests

Each layer has a clear responsibility, making the code **flexible**, **testable**, and **maintainable**! 🎉

---

_Built with ❤️ using Hexagonal Architecture_
