import type {
  Project,
  RelationshipGraph,
  RelationshipLineDirection,
} from "./knowledge";

const nowIso = () => new Date().toISOString();

const createId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const clampPercent = (value: number) => Math.max(8, Math.min(92, Math.round(value)));

function mapGraphs(
  graphs: RelationshipGraph[],
  graphId: string,
  mapper: (graph: RelationshipGraph) => RelationshipGraph,
): RelationshipGraph[] {
  return graphs.map((graph) => (graph.id === graphId ? mapper(graph) : graph));
}

export function createRelationshipGraph(title = "主线人物关系"): RelationshipGraph {
  const timestamp = nowIso();

  return {
    id: createId("relationship-graph"),
    title: title.trim() || "主线人物关系",
    nodes: [],
    relations: [],
    selectedNodeId: undefined,
    zoom: 100,
    updatedAt: timestamp,
  };
}

export function addRelationshipGraph(
  graphs: RelationshipGraph[],
  title = "主线人物关系",
): RelationshipGraph[] {
  return [...graphs, createRelationshipGraph(title)];
}

export function normalizeRelationshipGraphs(
  graphs: RelationshipGraph[] | undefined,
): RelationshipGraph[] {
  return (graphs ?? []).map((graph) => ({
    ...graph,
    nodes: graph.nodes ?? [],
    relations: graph.relations ?? [],
    zoom: Math.max(10, Math.min(400, Math.round(graph.zoom || 100))),
  }));
}

export function renameRelationshipGraph(
  graphs: RelationshipGraph[],
  graphId: string,
  title: string,
): RelationshipGraph[] {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    return graphs;
  }

  return mapGraphs(graphs, graphId, (graph) => ({
    ...graph,
    title: normalizedTitle,
    updatedAt: nowIso(),
  }));
}

export function addRelationshipCharacterNode(
  graphs: RelationshipGraph[],
  graphId: string,
  characterId: string,
  x = 50,
  y = 50,
): RelationshipGraph[] {
  return mapGraphs(graphs, graphId, (graph) => {
    const existingNode = graph.nodes.find((node) => node.characterId === characterId);
    if (existingNode) {
      return {
        ...graph,
        selectedNodeId: existingNode.id,
      };
    }

    const timestamp = nowIso();
    const node = {
      id: createId("relationship-node"),
      characterId,
      x: clampPercent(x),
      y: clampPercent(y),
      updatedAt: timestamp,
    };

    return {
      ...graph,
      nodes: [...graph.nodes, node],
      selectedNodeId: node.id,
      updatedAt: timestamp,
    };
  });
}

export function updateRelationshipNodePosition(
  graphs: RelationshipGraph[],
  graphId: string,
  nodeId: string,
  x: number,
  y: number,
): RelationshipGraph[] {
  return mapGraphs(graphs, graphId, (graph) => {
    if (!graph.nodes.some((node) => node.id === nodeId)) {
      return graph;
    }

    const timestamp = nowIso();
    return {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === nodeId
          ? { ...node, x: clampPercent(x), y: clampPercent(y), updatedAt: timestamp }
          : node,
      ),
      selectedNodeId: nodeId,
      updatedAt: timestamp,
    };
  });
}

export function addRelationshipLine(
  graphs: RelationshipGraph[],
  graphId: string,
  fromNodeId: string,
  toNodeId: string,
  direction: RelationshipLineDirection,
  label = "",
): RelationshipGraph[] {
  return mapGraphs(graphs, graphId, (graph) => {
    const fromNodeExists = graph.nodes.some((node) => node.id === fromNodeId);
    const toNodeExists = graph.nodes.some((node) => node.id === toNodeId);
    if (!fromNodeExists || !toNodeExists || fromNodeId === toNodeId) {
      return graph;
    }

    const relations = graph.relations ?? [];
    const alreadyExists = relations.some(
      (relation) =>
        relation.fromNodeId === fromNodeId &&
        relation.toNodeId === toNodeId &&
        relation.direction === direction,
    );
    if (alreadyExists) {
      return graph;
    }

    const timestamp = nowIso();
    return {
      ...graph,
      relations: [
        ...relations,
        {
          id: createId("relationship-line"),
          fromNodeId,
          toNodeId,
          direction,
          label: label.trim(),
          updatedAt: timestamp,
        },
      ],
      updatedAt: timestamp,
    };
  });
}

export function updateRelationshipLine(
  graphs: RelationshipGraph[],
  graphId: string,
  relationId: string,
  input: { direction?: RelationshipLineDirection; label?: string },
): RelationshipGraph[] {
  return mapGraphs(graphs, graphId, (graph) => {
    const relations = graph.relations ?? [];
    if (!relations.some((relation) => relation.id === relationId)) {
      return graph;
    }

    const timestamp = nowIso();
    return {
      ...graph,
      relations: relations.map((relation) =>
        relation.id === relationId
          ? {
              ...relation,
              direction: input.direction ?? relation.direction,
              label: input.label === undefined ? relation.label : input.label.trim(),
              updatedAt: timestamp,
            }
          : relation,
      ),
      updatedAt: timestamp,
    };
  });
}

export function deleteRelationshipLine(
  graphs: RelationshipGraph[],
  graphId: string,
  relationId: string,
): RelationshipGraph[] {
  return mapGraphs(graphs, graphId, (graph) => {
    const relations = graph.relations ?? [];
    const nextRelations = relations.filter((relation) => relation.id !== relationId);
    if (nextRelations.length === relations.length) {
      return graph;
    }

    return {
      ...graph,
      relations: nextRelations,
      updatedAt: nowIso(),
    };
  });
}

export function deleteRelationshipCharacterNode(
  graphs: RelationshipGraph[],
  graphId: string,
  nodeId: string,
): RelationshipGraph[] {
  return mapGraphs(graphs, graphId, (graph) => {
    if (!graph.nodes.some((node) => node.id === nodeId)) {
      return graph;
    }

    const nodes = graph.nodes.filter((node) => node.id !== nodeId);
    return {
      ...graph,
      nodes,
      relations: (graph.relations ?? []).filter(
        (relation) => relation.fromNodeId !== nodeId && relation.toNodeId !== nodeId,
      ),
      selectedNodeId:
        graph.selectedNodeId && graph.selectedNodeId !== nodeId
          ? graph.selectedNodeId
          : nodes[0]?.id,
      updatedAt: nowIso(),
    };
  });
}

export function selectRelationshipNode(
  graphs: RelationshipGraph[],
  graphId: string,
  nodeId: string,
): RelationshipGraph[] {
  return mapGraphs(graphs, graphId, (graph) => ({
    ...graph,
    selectedNodeId: graph.nodes.some((node) => node.id === nodeId) ? nodeId : graph.selectedNodeId,
  }));
}

export function updateRelationshipGraphZoom(
  graphs: RelationshipGraph[],
  graphId: string,
  zoom: number,
): RelationshipGraph[] {
  return mapGraphs(graphs, graphId, (graph) => ({
    ...graph,
    zoom: Math.max(10, Math.min(400, Math.round(zoom))),
    updatedAt: nowIso(),
  }));
}

export function deleteRelationshipGraph(
  graphs: RelationshipGraph[],
  graphId: string,
): RelationshipGraph[] {
  return graphs.filter((graph) => graph.id !== graphId);
}

export function updateProjectRelationshipGraphs(
  projects: Project[],
  projectId: string,
  relationshipGraphs: RelationshipGraph[],
): Project[] {
  return projects.map((project) =>
    project.id === projectId
      ? { ...project, relationshipGraphs: normalizeRelationshipGraphs(relationshipGraphs) }
      : project,
  );
}
