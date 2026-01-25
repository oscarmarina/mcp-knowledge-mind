import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { IDocsRepository } from '../../@domain/repositories/IDocsRepository.js';

export class SqliteDocsRepository extends IDocsRepository {
  constructor(serverDir) {
    super();
    this.serverDir =
      serverDir || path.join(os.homedir(), '.mcp-knowledge-mind');
    this.dbPath = path.join(this.serverDir, 'docs.db');

    if (!fs.existsSync(this.serverDir)) {
      fs.mkdirSync(this.serverDir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.loadExtension(sqliteVec.getLoadablePath());
    this.init();
  }

  init() {
    this.db.exec(`
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
  }

  async saveDoc(doc) {
    const stmt = this.db.prepare(`
      INSERT INTO docs (repo_owner, repo_name, path, sha, content, source_type)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(repo_owner, repo_name, path) DO UPDATE SET
        sha = excluded.sha,
        content = excluded.content,
        source_type = excluded.source_type
      RETURNING id
    `);

    const result = stmt.get(
      doc.repoOwner,
      doc.repoName,
      doc.path,
      doc.sha,
      doc.content,
      doc.sourceType,
    );
    return result.id;
  }

  async saveChunks(docId, chunks) {
    const saveChunksTx = this.db.transaction(() => {
      this.db
        .prepare(
          'DELETE FROM chunks_embeddings WHERE chunk_id IN (SELECT id FROM chunks WHERE doc_id = ?)',
        )
        .run(docId);
      this.db.prepare('DELETE FROM chunks WHERE doc_id = ?').run(docId);

      const insertChunk = this.db.prepare(`
        INSERT INTO chunks (doc_id, header, content, word_count)
        VALUES (?, ?, ?, ?)
        RETURNING id
      `);

      const insertEmbedding = this.db.prepare(`
        INSERT INTO chunks_embeddings (chunk_id, embedding)
        VALUES (?, ?)
      `);

      for (const chunk of chunks) {
        const res = insertChunk.get(
          docId,
          chunk.header,
          chunk.content,
          chunk.wordCount || 0,
        );
        const chunkId = res.id;

        if (chunk.embedding) {
          insertEmbedding.run(BigInt(chunkId), chunk.embedding);
        }
      }
    });

    saveChunksTx();
  }

  async getCachedEmbedding(hash) {
    const cached = this.db
      .prepare(
        `
      SELECT embedding, last_accessed
      FROM query_embeddings_cache
      WHERE query_hash = ?
    `,
      )
      .get(hash);

    if (cached) {
      this.db
        .prepare(
          `
        UPDATE query_embeddings_cache
        SET last_accessed = CURRENT_TIMESTAMP,
            access_count = access_count + 1
        WHERE query_hash = ?
      `,
        )
        .run(hash);

      return new Float32Array(
        cached.embedding.buffer,
        cached.embedding.byteOffset,
        cached.embedding.byteLength / Float32Array.BYTES_PER_ELEMENT,
      );
    }
    return null;
  }

  async cacheEmbedding(hash, text, model, embedding) {
    this.db
      .prepare(
        `
      INSERT INTO query_embeddings_cache (query_text, query_hash, model, embedding)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(query_hash) DO UPDATE SET
        last_accessed = CURRENT_TIMESTAMP,
        access_count = access_count + 1
    `,
      )
      .run(
        text.substring(0, 500),
        hash,
        model,
        Buffer.from(
          embedding.buffer,
          embedding.byteOffset,
          embedding.byteLength,
        ),
      );
  }

  async cleanup() {
    this.db
      .prepare(
        `
      DELETE FROM query_embeddings_cache
      WHERE query_hash IN (
        SELECT query_hash FROM query_embeddings_cache
        ORDER BY last_accessed ASC
        LIMIT (
          SELECT CASE
            WHEN COUNT(*) > 1000 THEN COUNT(*) - 1000
            ELSE 0
          END
          FROM query_embeddings_cache
        )
      )
    `,
      )
      .run();
  }

  async getStats() {
    return this.db
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
  }

  async searchHybrid(query, queryEmbedding, limit) {
    const sanitizedFtsQuery = `"${query.replace(/"/g, '""')}"`;

    const ftsResults = this.db
      .prepare(
        `
       SELECT
         rowid,
         bm25(chunks_fts) as bm25_score
       FROM chunks_fts
       WHERE chunks_fts MATCH ?
       ORDER BY bm25_score ASC
       LIMIT ?
     `,
      )
      .all(sanitizedFtsQuery, limit * 2);

    const vecResults = this.db
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

    const rankedIds = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map((entry) => entry[0]);

    if (rankedIds.length === 0) {
      return [];
    }

    const placeholders = rankedIds.map(() => '?').join(',');
    const finalResults = this.db
      .prepare(
        `
       SELECT c.id, c.header, c.content, d.path, d.repo_owner, d.repo_name, d.source_type
       FROM chunks c
       JOIN docs d ON c.doc_id = d.id
       WHERE c.id IN (${placeholders})
     `,
      )
      .all(...rankedIds);

    return rankedIds
      .map((id) => {
        const r = finalResults.find((res) => Number(res.id) === id);
        if (!r) return null;
        return r;
      })
      .filter(Boolean);
  }
}
