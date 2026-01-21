export class ContentSplitter {
  static smartChunk(text, maxChunkSize = 1000) {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const chunks = [];
    const lines = text.split('\n');
    let currentHeader = 'Introduction';
    let currentChunk = [];
    let currentWordCount = 0;

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
        currentHeader =
          trimmedLine.replace(/^#+\s*/, '').trim() || currentHeader;
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
          currentWordCount + lineWordCount > maxChunkSize &&
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
        if (currentWordCount > maxChunkSize * 1.5) {
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
}
