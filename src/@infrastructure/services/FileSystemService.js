import fs from 'fs';
import path from 'path';
import { PDFParse } from 'pdf-parse';

export class FileSystemService {
  constructor() {}

  async getFilesRecursive(dir, maxDepth = 10) {
    if (!fs.existsSync(dir)) {
      throw new Error(`Directory does not exist: ${dir}`);
    }

    const getFiles = (currentDir, depth) => {
      if (depth > maxDepth) return [];
      let results = [];
      try {
        const list = fs.readdirSync(currentDir);
        list.forEach((file) => {
          const filePath = path.join(currentDir, file);
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
            // Include error handling or logging if needed, skipping for now
          }
        });
      } catch (e) {
        // Directory read error
      }
      return results;
    };

    return getFiles(dir, 0);
  }

  async readFile(filePath) {
    if (filePath.endsWith('.pdf')) {
      const buffer = fs.readFileSync(filePath);
      const pdfData = await new PDFParse().getText({ data: buffer });
      return pdfData.text;
    } else {
      return fs.readFileSync(filePath, 'utf8');
    }
  }
}
