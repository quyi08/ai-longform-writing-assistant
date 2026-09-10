export type WorldConsoleModule = {
  title: string;
  tone: "outline" | "character" | "clue" | "ai";
};

export const WORLD_CONSOLE_MODULES: WorldConsoleModule[] = [
  { title: "章纲管理", tone: "outline" },
  { title: "人物管理", tone: "character" },
  { title: "线索管理", tone: "clue" },
  { title: "AI功能", tone: "ai" },
];

export const WORKBENCH_TOOL_DETAILS = {
  outline: { label: "继续写故事", description: "查看章节和大纲" },
  character: { label: "人物资料", description: "管理人物状态与设定" },
  clue: { label: "线索与伏笔", description: "追踪尚未回收的故事线" },
  ai: { label: "AI 写作工具", description: "选择这次需要的写作帮助" },
} as const;

export function getWorldModuleTitleLines(title: string): [string, string] {
  if (title === "AI功能") {
    return ["AI", "功能"];
  }

  if (title.endsWith("管理")) {
    return [title.slice(0, -2), "管理"];
  }

  return [title, ""];
}
