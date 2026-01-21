import { ContentSplitter } from '../../@domain/services/ContentSplitter.js';
import { Doc } from '../../@domain/entities/Doc.js';
import { Chunk } from '../../@domain/entities/Chunk.js';
import crypto from 'crypto';

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

    const files = (
      await this.githubService.getTree(owner, repo, branch)
    ).filter(
      (f) =>
        f.path.endsWith('.md') ||
        f.path.endsWith('.mdx') ||
        f.path.endsWith('.pdf'),
    );

    let totalChunks = 0;
    let processedFiles = 0;

    for (const file of files) {
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
    }

    return {
      processedFiles,
      totalFiles: files.length,
      totalChunks,
    };
  }
}
