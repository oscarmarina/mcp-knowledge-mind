import { Logger } from '../../@infrastructure/utils/Logger.js';

export class ToolsHandler {
  constructor(useCases) {
    this.useCases = useCases;
  }

  getToolDefinitions() {
    return [
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
            limit: {
              type: 'number',
              description: 'Number of results to return (default: 10)',
            },
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
        description:
          'Index all Markdown files in a local directory recursively.',
        inputSchema: {
          type: 'object',
          properties: {
            directoryPath: {
              type: 'string',
              description: 'Absolute path to the local directory',
            },
            maxDepth: {
              type: 'number',
              description: 'Recursion depth (default: 10)',
            },
          },
          required: ['directoryPath'],
        },
      },
    ];
  }

  async handleToolCall(name, args) {
    try {
      if (name === 'learn_repository') {
        const result = await this.useCases.learnRepository.execute(args);
        return {
          content: [
            {
              type: 'text',
              text: `✅ Successfully indexed ${result.processedFiles}/${result.totalFiles} files from GitHub into ${result.totalChunks} chunks.`,
            },
          ],
        };
      }

      if (name === 'learn_filesystem') {
        const result = await this.useCases.learnFilesystem.execute(args);
        return {
          content: [
            {
              type: 'text',
              text: `✅ Successfully indexed ${result.processedFiles}/${result.totalFiles} local files into ${result.totalChunks} chunks.`,
            },
          ],
        };
      }

      if (name === 'ask_knowledge') {
        const results = await this.useCases.askKnowledge.execute(args);

        if (results.length === 0) {
          return {
            content: [
              { type: 'text', text: 'No results found matching your query.' },
            ],
          };
        }

        const formattedResults = results
          .map((r, idx) => {
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
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `### Search Results for: "${args.query}"\n\n${formattedResults}`,
            },
          ],
        };
      }

      if (name === 'get_status') {
        const stats = await this.useCases.getSystemStatus.execute();
        return {
          content: [
            {
              type: 'text',
              text: `📊 **System Stats**\n- Total Docs: ${stats.total_docs}\n  - 🌐 GitHub: ${stats.github_docs}\n  - 📁 Local: ${stats.local_docs}\n- Total Chunks: ${stats.total_chunks}\n- Cache Entries: ${stats.cache_entries}`,
            },
          ],
        };
      }

      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      Logger.error(`Tool Error (${name}): ${errorStack || errorMsg}`);
      return {
        content: [{ type: 'text', text: `Error: ${errorMsg}` }],
        isError: true,
      };
    }
  }
}
