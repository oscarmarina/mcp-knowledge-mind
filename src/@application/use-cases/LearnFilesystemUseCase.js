import { ContentSplitter } from '../../@domain/services/ContentSplitter.js';
import { Doc } from '../../@domain/entities/Doc.js';
import { Chunk } from '../../@domain/entities/Chunk.js';
import crypto from 'crypto';
import path from 'path';

export class LearnFilesystemUseCase {
  constructor(docsRepo, fsService, embeddingService) {
    this.docsRepo = docsRepo;
    this.fsService = fsService;
    this.embeddingService = embeddingService;
  }

  async execute({ directoryPath, maxDepth = 10 }) {
    if (!directoryPath) {
      throw new Error('directoryPath is required');
    }

    const files = await this.fsService.getFilesRecursive(
      directoryPath,
      maxDepth,
    );
    const repoOwner = '__local__';
    const repoName = path.basename(directoryPath);

    let totalChunks = 0;
    let processedFiles = 0;

    for (const filePath of files) {
      try {
        const text = await this.fsService.readFile(filePath);
        const fileSha = crypto.createHash('sha256').update(text).digest('hex');

        const docObj = new Doc({
          repoOwner,
          repoName,
          path: filePath,
          sha: fileSha,
          content: text,
          sourceType: 'local',
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
        console.error(`Error processing local file ${filePath}:`, error);
      }
    }

    return {
      processedFiles,
      totalFiles: files.length,
      totalChunks,
    };
  }
}
