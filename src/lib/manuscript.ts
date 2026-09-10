import type { Manuscript, ManuscriptFileType, Project } from "./knowledge";

export type ManuscriptMode = "preview" | "chapters" | "outline";

export const manuscriptModeTabs = [
  { mode: "preview", label: "我的小说" },
  { mode: "chapters", label: "章节管理" },
  { mode: "outline", label: "大纲管理" },
] satisfies Array<{ mode: ManuscriptMode; label: string }>;

type WholeUploadInput = {
  fileName: string;
  fileType: ManuscriptFileType;
  text: string;
  storedFileUrl?: string;
};

type ChapterInput = {
  title: string;
  content: string;
};

type ParsedChapter = {
  title: string;
  displayLabel?: string;
  sectionTitle?: string;
  content: string;
};

function decodeWithEncoding(bytes: Uint8Array, encoding: string, fatal = true): string | undefined {
  try {
    return new TextDecoder(encoding, { fatal }).decode(bytes);
  } catch {
    return undefined;
  }
}

export function decodeManuscriptText(buffer: ArrayBufferLike): string {
  const bytes = new Uint8Array(buffer);

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }

  return (
    decodeWithEncoding(bytes, "utf-8") ??
    decodeWithEncoding(bytes, "gb18030") ??
    decodeWithEncoding(bytes, "gbk") ??
    new TextDecoder("utf-8").decode(bytes)
  );
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const chineseNumberMap: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const chapterNumberText = "[一二两三四五六七八九十百千万〇零\\d]+";
const suspiciousInlineChapterWords = /^[天年月日时分秒前后内当]/;

function parseChineseNumber(value: string): number | undefined {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  let result = 0;
  let section = 0;
  let number = 0;
  const unitMap: Record<string, number> = {
    十: 10,
    百: 100,
    千: 1000,
    万: 10000,
  };

  for (const char of value) {
    if (char in chineseNumberMap) {
      number = chineseNumberMap[char];
      continue;
    }

    const unit = unitMap[char];
    if (!unit) {
      return undefined;
    }

    if (unit === 10000) {
      section = (section + number) * unit;
      result += section;
      section = 0;
    } else {
      section += (number || 1) * unit;
    }
    number = 0;
  }

  return result + section + number || undefined;
}

function parseChapterHeading(line: string): { title: string; displayLabel: string } | undefined {
  const trimmed = line.trim();
  const match = trimmed.match(new RegExp(`^第(${chapterNumberText})([章节回话])(.{0,80})$`));
  if (!match) {
    const englishMatch = trimmed.match(/^Chapter\s+(\d+)(?:\s+.*)?$/i);
    if (!englishMatch) {
      return undefined;
    }
    return {
      title: trimmed,
      displayLabel: `Chapter ${Number(englishMatch[1])}`,
    };
  }

  const suffix = match[3] ?? "";
  const compactSuffix = suffix.trim();
  if (compactSuffix && !/^[\s:：、，,。.．\-—]/.test(suffix) && suspiciousInlineChapterWords.test(compactSuffix)) {
    return undefined;
  }

  const chapterNumber = parseChineseNumber(match[1]);
  return {
    title: trimmed,
    displayLabel: chapterNumber ? `第${chapterNumber}${match[2]}` : `第${match[1]}${match[2]}`,
  };
}

function parseSpecialChapterHeading(line: string): { title: string; displayLabel: string } | undefined {
  const trimmed = line.trim();
  if (/^(序章|楔子|引子|尾声|终章|番外)(?:[\s:：、，,。.．\-—].{0,60})?$/.test(trimmed)) {
    return {
      title: trimmed,
      displayLabel: trimmed.match(/^(序章|楔子|引子|尾声|终章|番外)/)?.[1] ?? trimmed,
    };
  }
  return undefined;
}

function parseAnyChapterHeading(line: string): { title: string; displayLabel: string } | undefined {
  return parseChapterHeading(line) ?? parseSpecialChapterHeading(line);
}

function isSectionHeading(line: string): boolean {
  return new RegExp(`^\\s*((第${chapterNumberText}[卷幕册部集篇].{0,80})|((Part|Book)\\s+\\d+.*))\\s*$`, "i").test(
    line,
  );
}

function isWholeBookPlaceholder(title: string): boolean {
  return /^(整本小说|全文|正文|未分章内容)$/.test(title.trim());
}

export function splitManuscriptTextIntoChapters(text: string): ParsedChapter[] {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return [];
  }

  const chapters: ParsedChapter[] = [];
  let currentSectionTitle = "";
  let currentTitle = "";
  let currentDisplayLabel = "";
  let currentLines: string[] = [];

  for (const line of normalizedText.split(/\r?\n/)) {
    if (isSectionHeading(line)) {
      currentSectionTitle = line.trim();
      if (!currentTitle) {
        currentLines.push(line);
      }
      continue;
    }

    const parsedHeading = parseAnyChapterHeading(line);
    if (parsedHeading) {
      if (currentTitle && parsedHeading.displayLabel === currentDisplayLabel) {
        continue;
      }

      if (currentTitle) {
        chapters.push({
          title: currentTitle,
          displayLabel: currentDisplayLabel || undefined,
          sectionTitle: currentSectionTitle || undefined,
          content: currentLines.join("\n").trim(),
        });
        currentLines = [];
      }
      currentTitle = parsedHeading.title;
      currentDisplayLabel = parsedHeading.displayLabel;
      continue;
    }

    currentLines.push(line);
  }

  if (currentTitle || currentLines.some((item) => item.trim())) {
    chapters.push({
      title: currentTitle || "整本小说",
      displayLabel: currentDisplayLabel || undefined,
      sectionTitle: currentSectionTitle || undefined,
      content: currentLines.join("\n").trim(),
    });
  }

  return chapters.length ? chapters : [{ title: "整本小说", content: normalizedText }];
}

export function normalizeManuscriptChapters(manuscript: Manuscript): Manuscript {
  const normalizedChapters: Manuscript["chapters"] = [];
  let currentSectionTitle = "";
  let pendingLines: string[] = [];

  for (const chapter of manuscript.chapters) {
    const title = chapter.title.trim();

    if (isSectionHeading(title)) {
      currentSectionTitle = title;
      if (chapter.content.trim()) {
        pendingLines.push(chapter.content.trim());
      }
      continue;
    }

    const parsedHeading = parseAnyChapterHeading(title);
    if (!parsedHeading || isWholeBookPlaceholder(title)) {
      const parts = [title, chapter.content].filter((part) => part.trim() && !isWholeBookPlaceholder(part));
      if (parts.length) {
        pendingLines.push(parts.join("\n").trim());
      }
      continue;
    }

    normalizedChapters.push({
      ...chapter,
      title: parsedHeading.title,
      displayLabel: chapter.displayLabel ?? parsedHeading.displayLabel,
      sectionTitle: chapter.sectionTitle ?? (currentSectionTitle || undefined),
      content: [pendingLines.join("\n").trim(), chapter.content.trim()]
        .filter(Boolean)
        .join("\n")
        .trim(),
    });
    pendingLines = [];
  }

  if (!normalizedChapters.length) {
    return manuscript;
  }

  return {
    ...manuscript,
    chapters: normalizedChapters,
    parseNote:
      normalizedChapters.length !== manuscript.chapters.length
        ? "已按新的章节识别规则修正旧数据：卷名、引言和整本占位不再占用章节序号。"
        : manuscript.parseNote,
  };
}

export function createWholeManuscript(input: WholeUploadInput): Manuscript {
  const normalizedText = input.text.trim();
  const isParsed = normalizedText.length > 0;
  const parsedChapters = splitManuscriptTextIntoChapters(normalizedText);

  return {
    source: {
      id: createId("source"),
      fileName: input.fileName,
      fileType: input.fileType,
      mode: "whole",
      uploadedAt: today(),
      storedFileUrl: input.storedFileUrl,
    },
    chapters: isParsed
      ? parsedChapters.map((chapter) => ({
          id: createId("chapter"),
          title: chapter.title,
          displayLabel: chapter.displayLabel,
          sectionTitle: chapter.sectionTitle,
          content: chapter.content,
          uploadedAt: today(),
        }))
      : [],
    parseStatus: isParsed ? "parsed" : "stored",
    parseNote: isParsed
      ? undefined
      : "文件已保存在本地浏览器，文本解析待后续接入文档解析或 AI Agent。",
  };
}

export function addManuscriptChapter(
  manuscript: Manuscript | undefined,
  input: ChapterInput,
): Manuscript {
  const chapter = {
    id: createId("chapter"),
    title: input.title.trim() || `章节 ${((manuscript?.chapters.length ?? 0) + 1).toString()}`,
    displayLabel: parseChapterHeading(input.title.trim())?.displayLabel,
    content: input.content.trim(),
    uploadedAt: today(),
  };

  return {
    source: manuscript?.source,
    chapters: [...(manuscript?.chapters ?? []), chapter],
    parseStatus: "parsed",
    parseNote: manuscript?.parseNote,
  };
}

export function renameManuscriptChapter(
  manuscript: Manuscript,
  chapterId: string,
  title: string,
): Manuscript {
  const normalizedTitle = title.trim();

  return {
    ...manuscript,
    chapters: manuscript.chapters.map((chapter) =>
      chapter.id === chapterId && normalizedTitle
        ? { ...chapter, title: normalizedTitle, displayLabel: parseChapterHeading(normalizedTitle)?.displayLabel }
        : chapter,
    ),
  };
}

export function updateManuscriptChapterContent(
  manuscript: Manuscript,
  chapterId: string,
  content: string,
): Manuscript {
  return {
    ...manuscript,
    chapters: manuscript.chapters.map((chapter) =>
      chapter.id === chapterId ? { ...chapter, content } : chapter,
    ),
  };
}

export function hasUnsavedManuscriptChapterContent(
  manuscript: Manuscript | undefined,
  chapterId: string,
  draftContent: string,
): boolean {
  const chapter = manuscript?.chapters.find((item) => item.id === chapterId);
  return Boolean(chapter && chapter.content !== draftContent);
}

export function deleteManuscriptChapter(
  manuscript: Manuscript,
  chapterId: string,
): Manuscript {
  return {
    ...manuscript,
    chapters: manuscript.chapters.filter((chapter) => chapter.id !== chapterId),
  };
}

export function clearManuscriptChapters(manuscript: Manuscript): Manuscript {
  return {
    ...manuscript,
    chapters: [],
  };
}

export function getManuscriptWordCount(manuscript: Manuscript | undefined): number {
  return (manuscript?.chapters ?? [])
    .map((chapter) => chapter.content)
    .join("")
    .replace(/\s/g, "").length;
}

export function updateProjectManuscript(
  projects: Project[],
  projectId: string,
  manuscript: Manuscript,
): Project[] {
  return projects.map((project) =>
    project.id === projectId ? { ...project, manuscript } : project,
  );
}
