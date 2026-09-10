import type {
  CharacterProfile,
  ClueBoard,
  ClueMention,
  ClueNode,
  ClueRelationLine,
  ClueRelationLineKind,
  ClueSummary,
  Project,
} from "./knowledge";

type ClueNodeMode = "child" | "sibling" | "free";

export type ClueMcpTopicSnapshot = {
  id: string;
  title: string;
  note: string;
  tags: string[];
  mentionCharacterIds: string[];
  children: ClueMcpTopicSnapshot[];
};

export type ClueMcpSnapshot = {
  boardId: string;
  title: string;
  source: "air-to-world";
  topics: ClueMcpTopicSnapshot[];
};

const nowIso = () => new Date().toISOString();

const createId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const clampPercent = (value: number) => Math.max(8, Math.min(92, Math.round(value)));

function createRootNode(): ClueNode {
  const timestamp = nowIso();
  return {
    id: createId("clue-node"),
    title: "中心线索",
    detail: "",
    x: 50,
    y: 50,
    collapsed: false,
    tags: [],
    mentionCharacterIds: [],
    updatedAt: timestamp,
  };
}

export function createClueBoard(title = "主线谜团"): ClueBoard {
  const rootNode = createRootNode();
  const timestamp = nowIso();

  return {
    id: createId("clue-board"),
    title,
    nodes: [rootNode],
    relations: [],
    summaries: [],
    selectedNodeId: rootNode.id,
    zoom: 100,
    updatedAt: timestamp,
  };
}

export function normalizeClueBoards(boards: ClueBoard[] | undefined): ClueBoard[] {
  return (boards ?? []).map((board) => ({
    ...board,
    relations: board.relations ?? [],
    summaries: board.summaries ?? [],
    zoom: Math.max(10, Math.min(400, Math.round(board.zoom || 100))),
  }));
}

export function ensureClueBoards(boards: ClueBoard[] | undefined): ClueBoard[] {
  const normalizedBoards = normalizeClueBoards(boards);
  return normalizedBoards.length ? normalizedBoards : [createClueBoard()];
}

export function addClueBoard(boards: ClueBoard[], title = "主线谜团"): ClueBoard[] {
  return [...boards, createClueBoard(title)];
}

export function createUniqueClueBoardTitle(boards: ClueBoard[], baseTitle: string) {
  const normalizedBaseTitle = baseTitle.trim() || "新线索图";
  const existingTitles = new Set(boards.map((board) => board.title.trim()));

  if (!existingTitles.has(normalizedBaseTitle)) {
    return normalizedBaseTitle;
  }

  let index = 2;
  while (existingTitles.has(`${normalizedBaseTitle} ${index}`)) {
    index += 1;
  }
  return `${normalizedBaseTitle} ${index}`;
}

export function renameClueBoard(
  boards: ClueBoard[],
  boardId: string,
  title: string,
): ClueBoard[] {
  const board = boards.find((item) => item.id === boardId);
  if (!board) {
    return boards;
  }

  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    return boards;
  }

  const siblingBoards = boards.filter((item) => item.id !== boardId);
  const uniqueTitle = createUniqueClueBoardTitle(siblingBoards, normalizedTitle);

  return mapBoards(boards, boardId, (item) => ({
    ...item,
    title: uniqueTitle,
    updatedAt: nowIso(),
  }));
}

export function deleteClueBoard(boards: ClueBoard[], boardId: string): ClueBoard[] {
  const nextBoards = boards.filter((board) => board.id !== boardId);
  return nextBoards.length ? nextBoards : [createClueBoard()];
}

export function deleteClueBoardWithoutFallback(boards: ClueBoard[], boardId: string): ClueBoard[] {
  return boards.filter((board) => board.id !== boardId);
}

export function upsertClueBoard(boards: ClueBoard[], draftBoard: ClueBoard): ClueBoard[] {
  const normalizedDraft = normalizeClueBoards([draftBoard])[0];
  const boardExists = boards.some((board) => board.id === draftBoard.id);

  if (!boardExists) {
    return [...boards, normalizedDraft];
  }

  return boards.map((board) => (board.id === draftBoard.id ? normalizedDraft : board));
}

export function updateProjectClueBoards(projects: Project[], projectId: string, clueBoards: ClueBoard[]) {
  return projects.map((project) =>
    project.id === projectId ? { ...project, clueBoards: normalizeClueBoards(clueBoards) } : project,
  );
}

function dedupe(values: string[]) {
  return [...new Set(values)];
}

export function extractCharacterMentions(text: string, characters: CharacterProfile[]): ClueMention[] {
  const matches = [...text.matchAll(/@([\p{L}\p{N}_-]+)/gu)];

  return matches.flatMap((match) => {
    const name = match[1];
    const character = characters.find((item) => item.name === name);

    if (!character || match.index === undefined) {
      return [];
    }

    return [
      {
        characterId: character.id,
        name: character.name,
        text: `@${character.name}`,
        start: match.index,
        end: match.index + character.name.length + 1,
      },
    ];
  });
}

function getMentionCharacterIds(title: string, detail: string, characters: CharacterProfile[]) {
  return dedupe(
    [...extractCharacterMentions(title, characters), ...extractCharacterMentions(detail, characters)].map(
      (mention) => mention.characterId,
    ),
  );
}

function mapBoards(
  boards: ClueBoard[],
  boardId: string,
  mapper: (board: ClueBoard) => ClueBoard,
): ClueBoard[] {
  return boards.map((board) => (board.id === boardId ? mapper(board) : board));
}

export function addClueNode(
  boards: ClueBoard[],
  boardId: string,
  sourceNodeId: string | undefined,
  mode: ClueNodeMode,
): ClueBoard[] {
  return mapBoards(boards, boardId, (board) => {
    const sourceNode =
      board.nodes.find((node) => node.id === sourceNodeId) ?? board.nodes[board.nodes.length - 1];
    const siblingCount = sourceNode
      ? board.nodes.filter((node) => node.parentId === sourceNode.parentId).length
      : board.nodes.length;
    const childCount = sourceNode
      ? board.nodes.filter((node) => node.parentId === sourceNode.id).length
      : board.nodes.length;
    const timestamp = nowIso();
    const parentId =
      mode === "child" ? sourceNode?.id : mode === "sibling" ? sourceNode?.parentId : undefined;
    const nextX =
      mode === "child" && sourceNode ? sourceNode.x + 18 : mode === "sibling" && sourceNode ? sourceNode.x : 50;
    const nextY =
      mode === "child" && sourceNode
        ? sourceNode.y + (childCount % 2 === 0 ? 16 + childCount * 5 : -16 - childCount * 5)
        : mode === "sibling" && sourceNode
          ? sourceNode.y + 16 + siblingCount * 3
          : 50 + board.nodes.length * 8;
    const nextNode: ClueNode = {
      id: createId("clue-node"),
      title: mode === "child" ? "子线索" : mode === "sibling" ? "同级线索" : "自由线索",
      detail: "",
      x: clampPercent(nextX),
      y: clampPercent(nextY),
      parentId,
      collapsed: false,
      tags: [],
      mentionCharacterIds: [],
      updatedAt: timestamp,
    };

    return {
      ...board,
      nodes: [...board.nodes, nextNode],
      selectedNodeId: nextNode.id,
      updatedAt: timestamp,
    };
  });
}

export function addClueNodeAt(boards: ClueBoard[], boardId: string, x: number, y: number): ClueBoard[] {
  return mapBoards(boards, boardId, (board) => {
    const timestamp = nowIso();
    const nextNode: ClueNode = {
      id: createId("clue-node"),
      title: "自由线索",
      detail: "",
      x: clampPercent(x),
      y: clampPercent(y),
      collapsed: false,
      tags: [],
      mentionCharacterIds: [],
      updatedAt: timestamp,
    };

    return {
      ...board,
      nodes: [...board.nodes, nextNode],
      selectedNodeId: nextNode.id,
      updatedAt: timestamp,
    };
  });
}

function isDescendantNode(nodes: ClueNode[], nodeId: string, potentialDescendantId: string): boolean {
  let parentId = nodes.find((node) => node.id === potentialDescendantId)?.parentId;

  while (parentId) {
    if (parentId === nodeId) {
      return true;
    }
    parentId = nodes.find((node) => node.id === parentId)?.parentId;
  }

  return false;
}

export function reparentClueNode(
  boards: ClueBoard[],
  boardId: string,
  nodeId: string,
  parentId: string | undefined,
): ClueBoard[] {
  return mapBoards(boards, boardId, (board) => {
    const nodeExists = board.nodes.some((node) => node.id === nodeId);
    const parentExists = parentId ? board.nodes.some((node) => node.id === parentId) : true;

    if (
      !nodeExists ||
      !parentExists ||
      nodeId === parentId ||
      (parentId && isDescendantNode(board.nodes, nodeId, parentId))
    ) {
      return board;
    }

    const timestamp = nowIso();
    return {
      ...board,
      nodes: board.nodes.map((node) =>
        node.id === nodeId ? { ...node, parentId, updatedAt: timestamp } : node,
      ),
      selectedNodeId: nodeId,
      updatedAt: timestamp,
    };
  });
}

export function addClueRelation(
  boards: ClueBoard[],
  boardId: string,
  fromNodeId: string,
  toNodeId: string,
  kind: ClueRelationLineKind,
): ClueBoard[] {
  return mapBoards(boards, boardId, (board) => {
    const fromNodeExists = board.nodes.some((node) => node.id === fromNodeId);
    const toNodeExists = board.nodes.some((node) => node.id === toNodeId);

    if (!fromNodeExists || !toNodeExists || fromNodeId === toNodeId) {
      return board;
    }

    const relations = board.relations ?? [];
    const alreadyExists = relations.some(
      (relation) =>
        relation.fromNodeId === fromNodeId &&
        relation.toNodeId === toNodeId &&
        relation.kind === kind,
    );

    if (alreadyExists) {
      return board;
    }

    const timestamp = nowIso();
    const relation: ClueRelationLine = {
      id: createId("clue-relation"),
      fromNodeId,
      toNodeId,
      kind,
      label: "",
      updatedAt: timestamp,
    };

    return {
      ...board,
      relations: [...relations, relation],
      selectedNodeId: toNodeId,
      updatedAt: timestamp,
    };
  });
}

export function updateClueRelationLabel(
  boards: ClueBoard[],
  boardId: string,
  relationId: string,
  label: string,
): ClueBoard[] {
  return mapBoards(boards, boardId, (board) => {
    const relations = board.relations ?? [];
    if (!relations.some((relation) => relation.id === relationId)) {
      return board;
    }

    const timestamp = nowIso();
    return {
      ...board,
      relations: relations.map((relation) =>
        relation.id === relationId
          ? { ...relation, label: label.trim(), updatedAt: timestamp }
          : relation,
      ),
      updatedAt: timestamp,
    };
  });
}

export function deleteClueRelation(
  boards: ClueBoard[],
  boardId: string,
  relationId: string,
): ClueBoard[] {
  return mapBoards(boards, boardId, (board) => {
    const relations = board.relations ?? [];
    const nextRelations = relations.filter((relation) => relation.id !== relationId);

    if (nextRelations.length === relations.length) {
      return board;
    }

    return {
      ...board,
      relations: nextRelations,
      updatedAt: nowIso(),
    };
  });
}

function getSummaryNodeIds(nodes: ClueNode[], rootNodeId: string) {
  return [
    rootNodeId,
    ...nodes.filter((node) => node.parentId === rootNodeId).map((node) => node.id),
  ];
}

export function addClueSummary(boards: ClueBoard[], boardId: string, rootNodeId: string): ClueBoard[] {
  return mapBoards(boards, boardId, (board) => {
    const rootNodeExists = board.nodes.some((node) => node.id === rootNodeId);
    if (!rootNodeExists) {
      return board;
    }

    const summaries = board.summaries ?? [];
    const existingSummary = summaries.find((summary) => summary.rootNodeId === rootNodeId);
    const timestamp = nowIso();
    const nodeIds = getSummaryNodeIds(board.nodes, rootNodeId);

    if (existingSummary) {
      return {
        ...board,
        summaries: summaries.map((summary) =>
          summary.id === existingSummary.id ? { ...summary, nodeIds, updatedAt: timestamp } : summary,
        ),
        updatedAt: timestamp,
      };
    }

    const summary: ClueSummary = {
      id: createId("clue-summary"),
      rootNodeId,
      nodeIds,
      text: "概要",
      updatedAt: timestamp,
    };

    return {
      ...board,
      summaries: [...summaries, summary],
      selectedNodeId: rootNodeId,
      updatedAt: timestamp,
    };
  });
}

export function updateClueSummary(
  boards: ClueBoard[],
  boardId: string,
  summaryId: string,
  text: string,
): ClueBoard[] {
  return mapBoards(boards, boardId, (board) => {
    const summaries = board.summaries ?? [];
    if (!summaries.some((summary) => summary.id === summaryId)) {
      return board;
    }

    const timestamp = nowIso();
    return {
      ...board,
      summaries: summaries.map((summary) =>
        summary.id === summaryId ? { ...summary, text: text.trim() || "概要", updatedAt: timestamp } : summary,
      ),
      updatedAt: timestamp,
    };
  });
}

export function deleteClueSummary(boards: ClueBoard[], boardId: string, summaryId: string): ClueBoard[] {
  return mapBoards(boards, boardId, (board) => {
    const summaries = board.summaries ?? [];
    const nextSummaries = summaries.filter((summary) => summary.id !== summaryId);

    if (nextSummaries.length === summaries.length) {
      return board;
    }

    return {
      ...board,
      summaries: nextSummaries,
      updatedAt: nowIso(),
    };
  });
}

export function updateClueNode(
  boards: ClueBoard[],
  boardId: string,
  nodeId: string,
  input: Partial<Pick<ClueNode, "title" | "detail" | "x" | "y" | "parentId" | "collapsed" | "tags">>,
  characters: CharacterProfile[] = [],
): ClueBoard[] {
  return mapBoards(boards, boardId, (board) => {
    const timestamp = nowIso();
    const nodes = board.nodes.map((node) => {
      if (node.id !== nodeId) {
        return node;
      }

      const title = input.title ?? node.title;
      const detail = input.detail ?? node.detail;
      return {
        ...node,
        ...input,
        title,
        detail,
        x: input.x === undefined ? node.x : clampPercent(input.x),
        y: input.y === undefined ? node.y : clampPercent(input.y),
        tags: input.tags === undefined ? node.tags : dedupe(input.tags.map((tag) => tag.trim()).filter(Boolean)),
        mentionCharacterIds: getMentionCharacterIds(title, detail, characters),
        updatedAt: timestamp,
      };
    });

    return { ...board, nodes, updatedAt: timestamp };
  });
}

export function toggleClueNodeCollapsed(
  boards: ClueBoard[],
  boardId: string,
  nodeId: string,
): ClueBoard[] {
  return mapBoards(boards, boardId, (board) => {
    const timestamp = nowIso();
    return {
      ...board,
      nodes: board.nodes.map((node) =>
        node.id === nodeId ? { ...node, collapsed: !node.collapsed, updatedAt: timestamp } : node,
      ),
      selectedNodeId: nodeId,
      updatedAt: timestamp,
    };
  });
}

function hasCollapsedAncestor(nodes: ClueNode[], node: ClueNode): boolean {
  let parentId = node.parentId;

  while (parentId) {
    const parent = nodes.find((item) => item.id === parentId);
    if (!parent) {
      return false;
    }
    if (parent.collapsed) {
      return true;
    }
    parentId = parent.parentId;
  }

  return false;
}

export function getVisibleClueNodes(board: ClueBoard): ClueNode[] {
  return board.nodes.filter((node) => !hasCollapsedAncestor(board.nodes, node));
}

function createTopicSnapshot(node: ClueNode, nodes: ClueNode[]): ClueMcpTopicSnapshot {
  return {
    id: node.id,
    title: node.title,
    note: node.detail,
    tags: node.tags ?? [],
    mentionCharacterIds: node.mentionCharacterIds,
    children: nodes
      .filter((child) => child.parentId === node.id)
      .map((child) => createTopicSnapshot(child, nodes)),
  };
}

export function getClueMcpSnapshot(board: ClueBoard): ClueMcpSnapshot {
  return {
    boardId: board.id,
    title: board.title,
    source: "air-to-world",
    topics: board.nodes
      .filter((node) => !node.parentId || !board.nodes.some((item) => item.id === node.parentId))
      .map((node) => createTopicSnapshot(node, board.nodes)),
  };
}

export function selectClueNode(boards: ClueBoard[], boardId: string, nodeId: string): ClueBoard[] {
  return mapBoards(boards, boardId, (board) => ({
    ...board,
    selectedNodeId: board.nodes.some((node) => node.id === nodeId) ? nodeId : board.selectedNodeId,
  }));
}

export function deleteClueNode(boards: ClueBoard[], boardId: string, nodeId: string): ClueBoard[] {
  return mapBoards(boards, boardId, (board) => {
    const idsToDelete = new Set<string>([nodeId]);
    let changed = true;

    while (changed) {
      changed = false;
      for (const node of board.nodes) {
        if (node.parentId && idsToDelete.has(node.parentId) && !idsToDelete.has(node.id)) {
          idsToDelete.add(node.id);
          changed = true;
        }
      }
    }

    const nodes = board.nodes.filter((node) => !idsToDelete.has(node.id));
    const fallbackNodeId = nodes[0]?.id;
    const relations = (board.relations ?? []).filter(
      (relation) =>
        !idsToDelete.has(relation.fromNodeId) && !idsToDelete.has(relation.toNodeId),
    );
    const remainingNodeIds = new Set(nodes.map((node) => node.id));
    const summaries = (board.summaries ?? [])
      .filter((summary) => !idsToDelete.has(summary.rootNodeId))
      .map((summary) => ({
        ...summary,
        nodeIds: summary.nodeIds.filter((summaryNodeId) => remainingNodeIds.has(summaryNodeId)),
        updatedAt: nowIso(),
      }));

    return {
      ...board,
      nodes,
      relations,
      summaries,
      selectedNodeId:
        board.selectedNodeId && !idsToDelete.has(board.selectedNodeId)
          ? board.selectedNodeId
          : fallbackNodeId,
      updatedAt: nowIso(),
    };
  });
}

export function deleteClueNodeOnly(boards: ClueBoard[], boardId: string, nodeId: string): ClueBoard[] {
  return mapBoards(boards, boardId, (board) => {
    const nodeToDelete = board.nodes.find((node) => node.id === nodeId);
    if (!nodeToDelete || board.nodes.length <= 1) {
      return board;
    }

    const timestamp = nowIso();
    const nodes = board.nodes
      .filter((node) => node.id !== nodeId)
      .map((node) =>
        node.parentId === nodeId
          ? { ...node, parentId: nodeToDelete.parentId, updatedAt: timestamp }
          : node,
      );
    const remainingNodeIds = new Set(nodes.map((node) => node.id));
    const relations = (board.relations ?? []).filter(
      (relation) => relation.fromNodeId !== nodeId && relation.toNodeId !== nodeId,
    );
    const summaries = (board.summaries ?? [])
      .filter((summary) => summary.rootNodeId !== nodeId)
      .map((summary) => ({
        ...summary,
        nodeIds: summary.nodeIds.filter((summaryNodeId) => remainingNodeIds.has(summaryNodeId)),
        updatedAt: timestamp,
      }));

    return {
      ...board,
      nodes,
      relations,
      summaries,
      selectedNodeId: nodeToDelete.parentId ?? nodes[0]?.id,
      updatedAt: timestamp,
    };
  });
}

export function updateClueBoardTitle(
  boards: ClueBoard[],
  boardId: string,
  title: string,
): ClueBoard[] {
  return mapBoards(boards, boardId, (board) => ({
    ...board,
    title: title.trim() || board.title,
    updatedAt: nowIso(),
  }));
}

export function updateClueBoardZoom(
  boards: ClueBoard[],
  boardId: string,
  zoom: number,
): ClueBoard[] {
  return mapBoards(boards, boardId, (board) => ({
    ...board,
    zoom: Math.max(10, Math.min(400, Math.round(zoom))),
    updatedAt: nowIso(),
  }));
}
