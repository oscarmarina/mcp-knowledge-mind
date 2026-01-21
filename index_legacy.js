#!/usr/bin/env node
// @ts-nocheck
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import Database from 'better-sqlite3';
import { Octokit } from '@octokit/rest';
import ollama from 'ollama';
import * as sqliteVec from 'sqlite-vec';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PDFParse } from 'pdf-parse';
import { pipeline } from '@xenova/transformers';
import os from 'os';

const SERVER_DIR = path.join(os.homedir(), '.mcp-knowledge-mind');
if (!fs.existsSync(SERVER_DIR)) {
  fs.mkdirSync(SERVER_DIR, { recursive: true });
}

// Configuration
const SYSTEM_CONFIG = {
  embeddingModel: 'nomic-embed-text',
  maxChunkSize: 1000,
  hybridSearchLimit: 10,
  maxEmbeddingChars: 8000,
  embeddingParams: {
    provider: 'ollama', // 'ollama' or 'local-transformers'
    model: 'nomic-embed-text',
    pipeline: null,
  },
};

const logInfo = (msg) => {
  fs.appendFileSync(
    `${SERVER_DIR}/server_info.log`,
    `[${new Date().toISOString()}] ${msg}\n`,
  );
};

// Setup error logging to file because Claude stdio is tricky
const logError = (msg) => {
  fs.appendFileSync(
    `${SERVER_DIR}/server_error.log`,
    `[${new Date().toISOString()}] ${msg}\n`,
  );
};

logError('SYSTEM: Starting MCP server...');

// 1. SETUP DATABASE
const db = new Database(`${SERVER_DIR}/docs.db`);
db.loadExtension(sqliteVec.getLoadablePath());

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA cache_size = -2000;

  -- Layer A: Structured Data
  CREATE TABLE IF NOT EXISTS docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_owner TEXT,
    repo_name TEXT,
    path TEXT,
    sha TEXT,
    content TEXT,
    indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    source_type TEXT CHECK(source_type IN ('github', 'local')) DEFAULT 'github',
    UNIQUE(repo_owner, repo_name, path)
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id INTEGER,
    header TEXT,
    content TEXT,
    word_count INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(doc_id) REFERENCES docs(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);

  -- [NEW] Cache for query embeddings
  CREATE TABLE IF NOT EXISTS query_embeddings_cache (
    query_hash TEXT PRIMARY KEY,
    query_text TEXT,
    model TEXT,
    embedding BLOB,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    access_count INTEGER DEFAULT 1
  );

  CREATE INDEX IF NOT EXISTS idx_cache_accessed ON query_embeddings_cache(last_accessed);
  CREATE INDEX IF NOT EXISTS idx_cache_model ON query_embeddings_cache(model);

  -- Layer B: Lexical Index (FTS5)
  CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    header,
    content,
    content='chunks',
    content_rowid='id'
  );

  -- Triggers to keep FTS index in sync
  CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
    INSERT INTO chunks_fts(rowid, header, content) VALUES (new.id, new.header, new.content);
  END;
  CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, header, content) VALUES('delete', old.id, old.header, old.content);
  END;
  CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
    INSERT INTO chunks_fts(chunks_fts, rowid, header, content) VALUES('delete', old.id, old.header, old.content);
    INSERT INTO chunks_fts(rowid, header, content) VALUES (new.id, new.header, new.content);
  END;

  -- Layer C: Semantic Index (Vector)
  CREATE VIRTUAL TABLE IF NOT EXISTS chunks_embeddings USING vec0(
    chunk_id INTEGER PRIMARY KEY,
    embedding FLOAT[768]
  );
`);

const octokit = new Octokit({ auth: process.env.GITHUB_CLASSIC_TOKEN });

async function initEmbeddingProvider() {
  logInfo('SYSTEM: Checking embedding provider...');
  try {
    await ollama.list();
    SYSTEM_CONFIG.embeddingParams.provider = 'ollama';
    SYSTEM_CONFIG.embeddingParams.model = SYSTEM_CONFIG.embeddingModel;
    logInfo('✅ OLLAMA is active. Using it for embeddings.');
  } catch (e) {
    SYSTEM_CONFIG.embeddingParams.provider = 'local-transformers';
    SYSTEM_CONFIG.embeddingParams.model = 'nomic-ai/nomic-embed-text-v1.5';
    logInfo(
      '⚠️ OLLAMA not detected. Switching to local transformers (nomic-ai/nomic-embed-text-v1.5).',
    );
    logInfo('⏳ Loading internal model... (this may take a moment first time)');
    SYSTEM_CONFIG.embeddingParams.pipeline = await pipeline(
      'feature-extraction',
      SYSTEM_CONFIG.embeddingParams.model,
    );
    logInfo('✅ Internal model loaded successfully.');
  }
}

/**
 * Process an array of items in batches with concurrency control
 * @param {Array} items - Array of items to process
 * @param {number} batchSize - Number of items to process concurrently
 * @param {Function} processFn - Async function to process each item
 */
async function processBatch(items, batchSize, processFn) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(processFn));
  }
}

// 2. UTILITY FUNCTIONS
async function getEmbedding(text, model = SYSTEM_CONFIG.embeddingModel) {
  if (!text || text.trim().length === 0) {
    throw new Error('Empty text for embedding');
  }

  // Calculate query and model hash
  const queryHash = crypto
    .createHash('sha256')
    .update(`${model}:${text}`)
    .digest('hex');

  // Attempt to retrieve from cache
  const cached = db
    .prepare(
      `
    SELECT embedding, last_accessed
    FROM query_embeddings_cache
    WHERE query_hash = ?
  `,
    )
    .get(queryHash);

  if (cached) {
    // Update last_accessed and access count
    db.prepare(
      `
      UPDATE query_embeddings_cache
      SET last_accessed = CURRENT_TIMESTAMP,
          access_count = access_count + 1
      WHERE query_hash = ?
    `,
    ).run(queryHash);

    // Convert BLOB to Float32Array
    return new Float32Array(cached.embedding.buffer);
  }

  // Use the active model from params if the default was passed
  const activeModel =
    model === SYSTEM_CONFIG.embeddingModel
      ? SYSTEM_CONFIG.embeddingParams.model
      : model;

  try {
    let embedding;

    if (SYSTEM_CONFIG.embeddingParams.provider === 'local-transformers') {
      const output = await SYSTEM_CONFIG.embeddingParams.pipeline(text, {
        pooling: 'mean',
        normalize: true,
      });
      embedding = output.data;
    } else {
      // Intelligently limit text length
      const limitedText =
        text.length > SYSTEM_CONFIG.maxEmbeddingChars
          ? text.substring(0, SYSTEM_CONFIG.maxEmbeddingChars)
          : text;

      const response = await ollama.embeddings({
        model: activeModel,
        prompt: limitedText,
      });

      if (!response.embedding || !Array.isArray(response.embedding)) {
        throw new Error('Invalid embedding response from Ollama');
      }
      embedding = new Float32Array(response.embedding);
    }

    // Save to cache
    db.prepare(
      `
      INSERT INTO query_embeddings_cache (query_text, query_hash, model, embedding)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(query_hash) DO UPDATE SET
        last_accessed = CURRENT_TIMESTAMP,
        access_count = access_count + 1
    `,
    ).run(
      text.substring(0, 500),
      queryHash,
      activeModel,
      Buffer.from(embedding.buffer),
    );

    return embedding;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    logError(`Embedding error: ${errorStack || errorMsg}`);
    throw new Error(`Failed to generate embedding: ${errorMsg}`);
  }
}

function cleanupCache() {
  try {
    // Keep only the most recent 1000 entries
    const result = db
      .prepare(
        `
      DELETE FROM query_embeddings_cache
      WHERE query_hash IN (
        SELECT query_hash FROM query_embeddings_cache
        ORDER BY last_accessed ASC
        LIMIT (SELECT COUNT(*) - 1000 FROM query_embeddings_cache)
      )
    `,
      )
      .run();
    if (result.changes > 0) {
      logInfo(
        `SYSTEM: Cache cleanup complete. Entries removed: ${result.changes}`,
      );
    }
  } catch (error) {
    logError(`Cache cleanup error: ${error.message}`);
  }
}

function smartChunk(text) {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const chunks = [];
  const lines = text.split('\n');
  let currentHeader = 'Introduction';
  let currentChunk = [];
  let currentWordCount = 0;

  const MAX_CHUNK_SIZE = SYSTEM_CONFIG.maxChunkSize;

  function finalizeChunk() {
    if (currentChunk.length === 0) return;

    const content = currentChunk.join('\n').trim();
    if (content.length > 50) {
      chunks.push({
        header: currentHeader,
        content: content,
        wordCount: currentWordCount,
      });
    }
    currentChunk = [];
    currentWordCount = 0;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Detect headers (## or ###)
    if (
      trimmedLine.startsWith('## ') ||
      trimmedLine.startsWith('### ') ||
      trimmedLine.startsWith('#### ')
    ) {
      if (currentChunk.length > 0) {
        finalizeChunk();
      }
      currentHeader = trimmedLine.replace(/^#+\s*/, '').trim() || currentHeader;
      currentChunk.push(line);
      currentWordCount += line.split(/\s+/).length;
    } else if (trimmedLine.startsWith('# ') && trimmedLine.length > 1) {
      // Main header - reset completely
      if (currentChunk.length > 0) {
        finalizeChunk();
      }
      currentHeader = trimmedLine.substring(2).trim();
      currentChunk = [line];
      currentWordCount = line.split(/\s+/).length;
    } else {
      const lineWordCount = line.split(/\s+/).length;

      // If adding this line exceeds the limit, finalize the current chunk
      if (
        currentWordCount + lineWordCount > MAX_CHUNK_SIZE &&
        currentChunk.length > 0
      ) {
        finalizeChunk();
        // Continue with the same header
        currentChunk.push(`(Continuation of: ${currentHeader})`);
        currentWordCount += `(Continuation of: ${currentHeader})`.split(
          /\s+/,
        ).length;
      }

      currentChunk.push(line);
      currentWordCount += lineWordCount;

      // Force split every few lines to avoid giant chunks
      if (currentWordCount > MAX_CHUNK_SIZE * 1.5) {
        finalizeChunk();
      }
    }
  }

  // Add the last chunk if it exists
  if (currentChunk.length > 0) {
    finalizeChunk();
  }

  return chunks;
}

// 3. CREATE THE SERVER
const server = new Server(
  { name: 'docs-mcp-knowledge-mind', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'learn_repository',
      description:
        'Download and index docs from a GitHub repo recursively using Hybrid Search layers.',
      inputSchema: {
        type: 'object',
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
          branch: { type: 'string', default: 'main' },
        },
        required: ['owner', 'repo'],
      },
    },
    {
      name: 'ask_knowledge',
      description:
        'Search through indexed docs using Hybrid Search (RRF - Lexical + Semantic).',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_status',
      description:
        'Get system architectural statistics, source distribution, and cache info.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'learn_filesystem',
      description: 'Index all Markdown files in a local directory recursively.',
      inputSchema: {
        type: 'object',
        properties: {
          directoryPath: {
            type: 'string',
            description: 'Absolute path to the local directory',
          },
        },
        required: ['directoryPath'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'learn_repository') {
    const { owner, repo, branch = 'main' } = args || {};
    if (!owner || !repo) {
      return {
        content: [{ type: 'text', text: 'Error: owner and repo are required' }],
        isError: true,
      };
    }

    logInfo(`🌐 SYSTEM: Starting GitHub crawl: ${owner}/${repo}`);
    try {
      const { data } = await octokit.git.getTree({
        owner,
        repo,
        tree_sha: branch,
        recursive: true,
      });

      const files = data.tree.filter(
        (f) =>
          f.path.endsWith('.md') ||
          f.path.endsWith('.mdx') ||
          f.path.endsWith('.pdf'),
      );
      let totalChunks = 0;
      let processedFiles = 0;

      await processBatch(files, 5, async (file) => {
        try {
          const blob = await octokit.git.getBlob({
            owner,
            repo,
            file_sha: file.sha,
          });

          let text = '';
          if (file.path.endsWith('.pdf')) {
            const buffer = Buffer.from(blob.data.content, 'base64');
            const pdfData = await new PDFParse().getText({ data: buffer });
            text = pdfData.text;
          } else {
            text = Buffer.from(blob.data.content, 'base64').toString('utf8');
          }

          // Layer A: Save Doc
          const insDoc = db
            .prepare(
              `
            INSERT INTO docs (repo_owner, repo_name, path, sha, content, source_type)
            VALUES (?, ?, ?, ?, ?, 'github')
            ON CONFLICT(repo_owner, repo_name, path) DO UPDATE SET
              sha = excluded.sha,
              content = excluded.content,
              source_type = 'github'
            RETURNING id
          `,
            )
            .get(owner, repo, file.path, file.sha, text);

          if (!insDoc || typeof insDoc !== 'object' || !('id' in insDoc)) {
            throw new Error('Failed to insert/update document');
          }
          const docId = insDoc.id;

          // Clean existing chunks
          db.prepare(
            'DELETE FROM chunks_embeddings WHERE chunk_id IN (SELECT id FROM chunks WHERE doc_id = ?)',
          ).run(docId);
          db.prepare('DELETE FROM chunks WHERE doc_id = ?').run(docId);

          // Smart Chunking
          const chunks = smartChunk(text);
          for (const chunk of chunks) {
            const insChunk = db
              .prepare(
                `
                INSERT INTO chunks (doc_id, header, content, word_count)
                VALUES (?, ?, ?, ?)
                RETURNING id
              `,
              )
              .get(docId, chunk.header, chunk.content, chunk.wordCount || 0);

            if (
              !insChunk ||
              typeof insChunk !== 'object' ||
              !('id' in insChunk)
            ) {
              throw new Error('Failed to insert chunk');
            }
            const chunkId = insChunk.id;

            const embeddingText = `${chunk.header}\n${chunk.content}`;
            const embedding = await getEmbedding(embeddingText);

            db.prepare(
              `
                INSERT INTO chunks_embeddings (chunk_id, embedding)
                VALUES (?, ?)
              `,
            ).run(BigInt(chunkId), embedding);

            totalChunks++;
          }
          processedFiles++;
        } catch (fileError) {
          logError(`Error processing file ${file.path}: ${fileError.message}`);
        }
      });
      return {
        content: [
          {
            type: 'text',
            text: `✅ Successfully indexed ${processedFiles}/${files.length} files from GitHub into ${totalChunks} chunks.`,
          },
        ],
      };
    } catch (error) {
      logError(`GitHub crawl error: ${error.stack || error.message}`);
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }

  if (name === 'ask_knowledge') {
    const rawArgs = args || {};
    const query = typeof rawArgs.query === 'string' ? rawArgs.query : '';
    const rawLimit = rawArgs.limit;
    const limit =
      typeof rawLimit === 'number' ? rawLimit : SYSTEM_CONFIG.hybridSearchLimit;

    if (!query) {
      return {
        content: [{ type: 'text', text: 'Error: query is required' }],
        isError: true,
      };
    }

    try {
      const queryEmbedding = await getEmbedding(query);

      // Sanitize query for FTS5 (escape special characters by quoting)
      const sanitizedFtsQuery = `"${query.replace(/"/g, '""')}"`;

      // 1. FTS Search with BM25
      const ftsResults = db
        .prepare(
          `
        SELECT
          rowid,
          rank,
          bm25(chunks_fts) as bm25_score
        FROM chunks_fts
        WHERE chunks_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `,
        )
        .all(sanitizedFtsQuery, limit * 2);

      // 2. Vector Search
      const vecResults = db
        .prepare(
          `
        SELECT
          chunk_id,
          distance
        FROM chunks_embeddings
        WHERE embedding MATCH ?
        ORDER BY distance
        LIMIT ?
      `,
        )
        .all(queryEmbedding, limit * 2);

      // 3. Enhanced Reciprocal Rank Fusion
      const scores = new Map();
      const k = 60;

      ftsResults.forEach((result, rank) => {
        const id = Number(result.rowid);
        const positiveScore = -result.bm25_score;
        const bm25Weighted =
          (1 / (k + rank + 1)) * (1 + Math.log(1 + Math.max(0, positiveScore)));
        scores.set(id, (scores.get(id) || 0) + bm25Weighted);
      });

      vecResults.forEach((result, rank) => {
        const id = Number(result.chunk_id);
        const similarity = 1 - result.distance;
        const vecWeighted = (1 / (k + rank + 1)) * similarity;
        scores.set(id, (scores.get(id) || 0) + vecWeighted);
      });

      // 4. Sort and limit
      const rankedIds = Array.from(scores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map((entry) => entry[0]);

      if (rankedIds.length === 0) {
        return {
          content: [
            { type: 'text', text: 'No results found matching your query.' },
          ],
        };
      }

      // Fetch final content
      const placeholders = rankedIds.map(() => '?').join(',');
      const finalResults = db
        .prepare(
          `
        SELECT c.id, c.header, c.content, d.path, d.repo_owner, d.repo_name, d.source_type
        FROM chunks c
        JOIN docs d ON c.doc_id = d.id
        WHERE c.id IN (${placeholders})
      `,
        )
        .all(...rankedIds);

      // Re-sort to maintain RRF order and format
      const formattedResults = rankedIds
        .map((id, idx) => {
          /** @type {any} */
          const r = finalResults.find((res) => Number(res.id) === id);
          if (!r) return null;
          const icon = r.source_type === 'local' ? '📁' : '🌐';
          const source =
            r.source_type === 'local'
              ? r.path
              : `${r.repo_owner}/${r.repo_name}/${r.path}`;
          return `${idx + 1}. ${icon} **${r.header}** (${source})\n   ${r.content.substring(
            0,
            300,
          )}...\n`;
        })
        .filter(Boolean)
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `### Search Results for: "${query}"\n\n${formattedResults}`,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      logError(`Search Error: ${errorStack || errorMsg}`);
      return {
        content: [{ type: 'text', text: `Search Error: ${errorMsg}` }],
        isError: true,
      };
    }
  }

  if (name === 'learn_filesystem') {
    const { directoryPath, maxDepth = 10 } = args || {};
    if (typeof directoryPath !== 'string') {
      return {
        content: [{ type: 'text', text: 'Error: directoryPath is required' }],
        isError: true,
      };
    }

    try {
      if (!fs.existsSync(directoryPath)) {
        throw new Error(`Directory does not exist: ${directoryPath}`);
      }

      const getFiles = (dir, depth = 0) => {
        if (depth > maxDepth) return [];
        let results = [];
        try {
          const list = fs.readdirSync(dir);
          list.forEach((file) => {
            const filePath = path.join(dir, file);
            try {
              const stat = fs.statSync(filePath);
              if (stat && stat.isDirectory()) {
                results = results.concat(getFiles(filePath, depth + 1));
              } else if (
                file.endsWith('.md') ||
                file.endsWith('.mdx') ||
                file.endsWith('.pdf')
              ) {
                results.push(filePath);
              }
            } catch (e) {
              logError(`Skipping path ${filePath}: ${e.message}`);
            }
          });
        } catch (e) {
          logError(`Error reading dir ${dir}: ${e.message}`);
        }
        return results;
      };

      const files = getFiles(directoryPath);
      let totalChunks = 0;
      let processedFiles = 0;
      const repoOwner = '__local__';
      const repoName = path.basename(directoryPath);

      await processBatch(files, 5, async (filePath) => {
        try {
          let text = '';
          if (filePath.endsWith('.pdf')) {
            const buffer = fs.readFileSync(filePath);
            const pdfData = await new PDFParse().getText({ data: buffer });
            text = pdfData.text;
          } else {
            text = fs.readFileSync(filePath, 'utf8');
          }
          const fileSha = crypto
            .createHash('sha256')
            .update(text)
            .digest('hex');

          // Layer A: Save Doc
          const insDoc = db
            .prepare(
              `
            INSERT INTO docs (repo_owner, repo_name, path, sha, content, source_type)
            VALUES (?, ?, ?, ?, ?, 'local')
            ON CONFLICT(repo_owner, repo_name, path) DO UPDATE SET
              sha = excluded.sha,
              content = excluded.content,
              source_type = 'local'
            RETURNING id
          `,
            )
            .get(repoOwner, repoName, filePath, fileSha, text);

          if (!insDoc || typeof insDoc !== 'object' || !('id' in insDoc)) {
            throw new Error('Failed to insert doc');
          }

          const docId = insDoc.id;

          // Clean existing chunks
          db.prepare(
            'DELETE FROM chunks_embeddings WHERE chunk_id IN (SELECT id FROM chunks WHERE doc_id = ?)',
          ).run(docId);
          db.prepare('DELETE FROM chunks WHERE doc_id = ?').run(docId);

          // Smart Chunking
          const chunks = smartChunk(text);
          for (const chunk of chunks) {
            const insChunk = db
              .prepare(
                `
                INSERT INTO chunks (doc_id, header, content, word_count)
                VALUES (?, ?, ?, ?)
                RETURNING id
              `,
              )
              .get(docId, chunk.header, chunk.content, chunk.wordCount || 0);

            if (
              !insChunk ||
              typeof insChunk !== 'object' ||
              !('id' in insChunk)
            ) {
              throw new Error('Failed to insert chunk');
            }

            const chunkId = insChunk.id;
            const embeddingText = `${chunk.header}\n${chunk.content}`;
            const embedding = await getEmbedding(embeddingText);
            db.prepare(
              `
                INSERT INTO chunks_embeddings (chunk_id, embedding)
                VALUES (?, ?)
              `,
            ).run(BigInt(chunkId), embedding);

            totalChunks++;
          }
          processedFiles++;
        } catch (e) {
          logError(`Failed to index file ${filePath}: ${e.message}`);
        }
      });

      return {
        content: [
          {
            type: 'text',
            text: `✅ Successfully indexed ${processedFiles}/${files.length} local files into ${totalChunks} chunks.`,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logError(`Local Indexing Error: ${errorMsg}`);
      return {
        content: [{ type: 'text', text: `Error: ${errorMsg}` }],
        isError: true,
      };
    }
  }

  if (name === 'get_status') {
    try {
      const stats = db
        .prepare(
          `
        SELECT
          (SELECT COUNT(*) FROM docs) as total_docs,
          (SELECT COUNT(*) FROM docs WHERE source_type = 'github') as github_docs,
          (SELECT COUNT(*) FROM docs WHERE source_type = 'local') as local_docs,
          (SELECT COUNT(*) FROM chunks) as total_chunks,
          (SELECT COUNT(*) FROM query_embeddings_cache) as cache_entries
      `,
        )
        .get();

      if (!stats) throw new Error('Could not retrieve stats');

      return {
        content: [
          {
            type: 'text',
            text: `📊 **System Stats**\n- Total Docs: ${stats.total_docs}\n  - 🌐 GitHub: ${stats.github_docs}\n  - 📁 Local: ${stats.local_docs}\n- Total Chunks: ${stats.total_chunks}\n- Cache Entries: ${stats.cache_entries}`,
          },
        ],
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Stats Error: ${errorMsg}` }],
        isError: true,
      };
    }
  }

  return {
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

// START
const transport = new StdioServerTransport();
try {
  await initEmbeddingProvider();
  cleanupCache();
  await server.connect(transport);
} catch (error) {
  logError(`Fatal startup error: ${error.stack || error}`);
  process.exit(1);
}

process.on('uncaughtException', (error) => {
  logError(`Uncaught Exception: ${error.stack || error}`);
});

process.on('unhandledRejection', (reason) => {
  logError(`Unhandled Rejection: ${reason}`);
});
