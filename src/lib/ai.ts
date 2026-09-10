export type AiTaskType =
  | "extractKnowledge"
  | "generateOutline"
  | "continueChapter"
  | "consistencyCheck"
  | "rewriteSelection";

export type AiTaskDescriptor = {
  type: AiTaskType;
  projectId: string;
  title: string;
  description: string;
  enabled: boolean;
  statusLabel: string;
};

const taskCopy: Record<AiTaskType, Pick<AiTaskDescriptor, "title" | "description">> = {
  extractKnowledge: {
    title: "AI 资料抽取",
    description: "从已有小说文档中识别人名、地点、物品、势力、伏笔和时间线。",
  },
  generateOutline: {
    title: "大纲规划",
    description: "基于已确认资料库生成全书方向、卷纲和近期章纲。",
  },
  continueChapter: {
    title: "章节续写",
    description: "根据资料库、章纲和风格档案续写下一章正文。",
  },
  consistencyCheck: {
    title: "一致性检查",
    description: "检查人物状态、世界观设定、时间线、伏笔和章节目标是否冲突。",
  },
  rewriteSelection: {
    title: "选区改写",
    description: "对选中文本进行扩写、压缩、润色、增强冲突或调整对白。",
  },
};

export function createAiTaskDescriptor(
  type: AiTaskType,
  projectId: string,
): AiTaskDescriptor {
  const copy = taskCopy[type];

  return {
    type,
    projectId,
    title: copy.title,
    description: copy.description,
    enabled: false,
    statusLabel: "预留中",
  };
}
