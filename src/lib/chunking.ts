import type { ManuscriptChapter } from "./knowledge";

export type ChapterChunkDraft = {
  chapterId: string;
  chapterIndex: number;
  chunkIndex: number;
  content: string;
  contentHash: string;
  characterCount: number;
};

const TARGET_SIZE = 1000;
const OVERLAP_SIZE = 120;

export function createContentHash(content: string): string {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function splitOversizedParagraph(paragraph: string): string[] {
  const pieces: string[] = [];
  let remaining = paragraph;

  while (remaining.length > TARGET_SIZE) {
    const candidate = remaining.slice(0, TARGET_SIZE);
    const sentenceBreak = Math.max(candidate.lastIndexOf("。"), candidate.lastIndexOf("！"), candidate.lastIndexOf("？"));
    const cutAt = sentenceBreak >= Math.floor(TARGET_SIZE * 0.6) ? sentenceBreak + 1 : TARGET_SIZE;
    pieces.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt);
  }

  if (remaining) pieces.push(remaining);
  return pieces;
}

export function createChapterChunks(
  chapter: Pick<ManuscriptChapter, "id" | "content">,
  chapterIndex: number,
): ChapterChunkDraft[] {
  const paragraphs = chapter.content
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .flatMap((paragraph) => (paragraph.length > TARGET_SIZE ? splitOversizedParagraph(paragraph) : [paragraph]));

  const contents: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
      continue;
    }
    if (current.length + 2 + paragraph.length <= TARGET_SIZE) {
      current = `${current}\n\n${paragraph}`;
      continue;
    }
    contents.push(current);
    current = `${current.slice(-OVERLAP_SIZE)}\n\n${paragraph}`;
  }
  if (current) contents.push(current);

  return contents.map((content, chunkIndex) => ({
    chapterId: chapter.id,
    chapterIndex,
    chunkIndex,
    content,
    contentHash: createContentHash(content),
    characterCount: content.length,
  }));
}
