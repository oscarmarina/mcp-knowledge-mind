import { ContentSplitter } from '../../@domain/services/ContentSplitter.js';
import { BatchProcessor } from '../../@domain/services/BatchProcessor.js';
import { Doc } from '../../@domain/entities/Doc.js';
import { Chunk } from '../../@domain/entities/Chunk.js';
import { Logger } from '../../@infrastructure/utils/Logger.js';

export class LearnRepositoryUseCase {
  constructor(docsRepo, githubService, embeddingService) {
    this.docsRepo = docsRepo;
    this.githubService = githubService;
    this.embeddingService = embeddingService;
  }

  async execute({ owner, repo, branch }) {
    if (!owner || !repo) {
      throw new Error('owner and repo are required');
    }

    Logger.info(`🌐 Starting GitHub repository indexing: ${owner}/${repo}`);

    const files = (
      await this.githubService.getTree(owner, repo, branch)
    ).filter(
      (f) =>
        f.path.endsWith('.md') ||
        f.path.endsWith('.mdx') ||
        f.path.endsWith('.pdf'),
    );

    Logger.info(`📁 Found ${files.length} files to index (.md, .mdx, .pdf)`);

    const batchSize = BatchProcessor.calculateOptimalBatchSize(files.length);
    Logger.info(
      `⚙️ Using batch size: ${batchSize} (optimized for ${files.length} files)`,
    );

    let totalChunks = 0;
    let processedFiles = 0;

    await BatchProcessor.processBatch(
      files,
      batchSize,
      async (file) => {
        try {
          const text = await this.githubService.getFileContent(
            owner,
            repo,
            file.sha,
            file.path,
          );

          const docObj = new Doc({
            repoOwner: owner,
            repoName: repo,
            path: file.path,
            sha: file.sha,
            content: text,
            sourceType: 'github',
          });

          const docId = await this.docsRepo.saveDoc(docObj);

          const chunksData = ContentSplitter.smartChunk(text);
          const chunks = [];

          for (const chunkData of chunksData) {
            const embeddingText = `${chunkData.header}\n${chunkData.content}`;
            const embedding = await this.embeddingService.embed(embeddingText);

            chunks.push(
              new Chunk({
                docId,
                header: chunkData.header,
                content: chunkData.content,
                wordCount: chunkData.wordCount,
                embedding,
              }),
            );
          }

          await this.docsRepo.saveChunks(docId, chunks);
          totalChunks += chunks.length;
          processedFiles++;
        } catch (error) {
          console.error(`Error processing file ${file.path}:`, error);
        }
      },
      (processed, total) => {
        // Log progress after each batch
        Logger.progress(processed, total, 'files');
      },
    );

    Logger.info(
      `✅ Completed indexing: ${processedFiles}/${files.length} files, ${totalChunks} chunks`,
    );

    return {
      processedFiles,
      totalFiles: files.length,
      totalChunks,
    };
  }
}
