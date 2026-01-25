#!/usr/bin/env node
// @ts-nocheck
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Infrastructure
import { SqliteDocsRepository } from './@infrastructure/database/SqliteDocsRepository.js';
import { OllamaEmbeddingService } from './@infrastructure/services/OllamaEmbeddingService.js';
import { LocalEmbeddingService } from './@infrastructure/services/LocalEmbeddingService.js';
import { GithubService } from './@infrastructure/services/GithubService.js';
import { FileSystemService } from './@infrastructure/services/FileSystemService.js';

// Application
import { LearnRepositoryUseCase } from './@application/use-cases/LearnRepositoryUseCase.js';
import { LearnFilesystemUseCase } from './@application/use-cases/LearnFilesystemUseCase.js';
import { AskKnowledgeUseCase } from './@application/use-cases/AskKnowledgeUseCase.js';
import { GetSystemStatusUseCase } from './@application/use-cases/GetSystemStatusUseCase.js';

// Interface
import { ToolsHandler } from './@interface/mcp/ToolsHandler.js';

const SERVER_DIR = path.join(os.homedir(), '.mcp-knowledge-mind');
if (!fs.existsSync(SERVER_DIR)) {
  fs.mkdirSync(SERVER_DIR, { recursive: true });
}

// Setup error logging
const logError = (msg) => {
  fs.appendFileSync(
    `${SERVER_DIR}/server_error.log`,
    `[${new Date().toISOString()}] ${msg}\n`,
  );
};

logError('SYSTEM: Starting MCP server (Hexagonal)...');

class AppContainer {
  async init() {
    // 1. Initialize Infrastructure
    const docsRepo = new SqliteDocsRepository(SERVER_DIR);

    let embeddingService;
    try {
      logError('SYSTEM: Checking embedding provider...');
      const ollamaService = new OllamaEmbeddingService();
      await ollamaService.init();
      embeddingService = ollamaService;
      logError('✅ OLLAMA is active. Using it for embeddings.');
    } catch (e) {
      logError('⚠️ OLLAMA not detected. Switching to local transformers.');
      const localService = new LocalEmbeddingService();
      await localService.init();
      embeddingService = localService;
      logError('✅ Internal model loaded successfully.');
    }

    const githubService = new GithubService(process.env.GITHUB_CLASSIC_TOKEN);
    const fsService = new FileSystemService();

    // 2. Initialize Use Cases
    const learnRepository = new LearnRepositoryUseCase(
      docsRepo,
      githubService,
      embeddingService,
    );
    const learnFilesystem = new LearnFilesystemUseCase(
      docsRepo,
      fsService,
      embeddingService,
    );
    const askKnowledge = new AskKnowledgeUseCase(docsRepo, embeddingService);
    const getSystemStatus = new GetSystemStatusUseCase(docsRepo);

    // 3. Initialize Interface Config
    this.toolsHandler = new ToolsHandler({
      learnRepository,
      learnFilesystem,
      askKnowledge,
      getSystemStatus,
    });

    // 4. Start Server
    this.server = new Server(
      { name: 'docs-mcp-knowledge-mind', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );

    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.toolsHandler.getToolDefinitions(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this.toolsHandler.handleToolCall(name, args);
    });

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logError('MCP Server Connected via Stdio');
  }
}

// Run
const app = new AppContainer();
app.init().catch((error) => {
  logError(`Fatal startup error: ${error.stack || error}`);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logError(`Uncaught Exception: ${error.stack || error}`);
});

process.on('unhandledRejection', (reason) => {
  logError(`Unhandled Rejection: ${reason}`);
});
