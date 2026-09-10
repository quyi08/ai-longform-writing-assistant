import type { KnowledgeImage, Project, TimelineEvent, TimelineEventLane } from "./knowledge";

export const timelineZoomMin = 50;
export const timelineZoomMax = 180;
export const timelineCanvasMinHeight = 520;
export type TimelineRelationKind = "chapters" | "characters";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function createTimelineEventId(lane: TimelineEventLane): string {
  return `timeline-${lane}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function createTimelineEvent(lane: TimelineEventLane): TimelineEvent {
  return {
    id: createTimelineEventId(lane),
    lane,
    title: lane === "story" ? "新故事事件" : "新世界观事件",
    timeLabel: "",
    summary: "",
    relatedChapterIds: [],
    relatedCharacterIds: [],
    relatedLocationIds: [],
    relatedOrganizationIds: [],
    impact: "",
    updatedAt: today(),
  };
}

export function clampTimelineZoom(zoom: number): number {
  return Math.min(timelineZoomMax, Math.max(timelineZoomMin, zoom));
}

export function calculateTimelineCanvasHeight(eventCount: number, zoom: number): number {
  if (eventCount <= 0) {
    return timelineCanvasMinHeight;
  }

  const clampedZoom = clampTimelineZoom(zoom);
  const nodeHeight = 72;
  const verticalPadding = 142;
  const eventGap = 34 + clampedZoom * 0.8;

  return Math.max(
    timelineCanvasMinHeight,
    Math.round(verticalPadding + eventCount * nodeHeight + Math.max(0, eventCount - 1) * eventGap),
  );
}

export function calculateTimelineOrbitCount(eventCount: number): number {
  if (eventCount <= 0) {
    return 1;
  }

  return Math.min(8, Math.max(2, Math.ceil(eventCount / 3) + 1));
}

export function calculateTimelineFlightLayout(eventIndex: number, eventCount: number) {
  const safeCount = Math.max(1, eventCount);
  const progress = (eventIndex + 0.5) / safeCount;
  const anchorX = 50 + Math.sin(progress * Math.PI * 2) * 6.5;
  const side = eventIndex % 2 === 0 ? "left" : "right";
  const offset = eventIndex % 4 === 0 ? 20 : 16;
  const nodeX = side === "left" ? anchorX - offset : anchorX + offset;
  const lineLeft = Math.min(anchorX, nodeX);
  const lineRight = Math.max(anchorX, nodeX);

  return {
    anchorX: Number(anchorX.toFixed(2)),
    lineLeft: Number(lineLeft.toFixed(2)),
    lineRight: Number(lineRight.toFixed(2)),
    lineWidth: Number((lineRight - lineLeft).toFixed(2)),
    nodeX: Number(nodeX.toFixed(2)),
    side,
  };
}

type TimelineFlightLayout = ReturnType<typeof calculateTimelineFlightLayout>;

export function calculateTimelineFlightPath(layouts: TimelineFlightLayout[]): string {
  if (layouts.length === 0) {
    return "M50,0 C42,24 58,76 50,100";
  }

  const points = [
    { x: 50, y: 0 },
    ...layouts.map((layout, index) => ({
      x: layout.anchorX,
      y: Number((((index + 0.5) / layouts.length) * 100).toFixed(2)),
    })),
    { x: 50, y: 100 },
  ];

  return points.reduce((path, point, index) => {
    if (index === 0) {
      return `M${point.x},${point.y}`;
    }

    const previous = points[index - 1];
    const beforePrevious = points[index - 2] ?? previous;
    const next = points[index + 1] ?? point;
    const controlScale = 0.18;
    const firstControl = {
      x: previous.x + (point.x - beforePrevious.x) * controlScale,
      y: previous.y + (point.y - beforePrevious.y) * controlScale,
    };
    const secondControl = {
      x: point.x - (next.x - previous.x) * controlScale,
      y: point.y - (next.y - previous.y) * controlScale,
    };

    return `${path} C${Number(firstControl.x.toFixed(2))},${Number(firstControl.y.toFixed(2))} ${Number(secondControl.x.toFixed(2))},${Number(secondControl.y.toFixed(2))} ${point.x},${point.y}`;
  }, "");
}

export function addTimelineEvent(
  events: TimelineEvent[],
  lane: TimelineEventLane,
): TimelineEvent[] {
  return [...events, createTimelineEvent(lane)];
}

export function updateTimelineEvent(
  events: TimelineEvent[],
  eventId: string,
  input: Partial<Omit<TimelineEvent, "id" | "lane" | "updatedAt">>,
): TimelineEvent[] {
  return events.map((event) =>
    event.id === eventId
      ? {
          ...event,
          ...input,
          updatedAt: today(),
        }
      : event,
  );
}

export function updateTimelineEventRelationIds(
  event: TimelineEvent,
  relationKind: TimelineRelationKind,
  ids: string[],
): TimelineEvent {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));

  if (relationKind === "chapters") {
    return {
      ...event,
      relatedChapterIds: uniqueIds,
    };
  }

  return {
    ...event,
    relatedCharacterIds: uniqueIds,
  };
}

export function updateTimelineEventImage(
  event: TimelineEvent,
  image?: KnowledgeImage,
): TimelineEvent {
  return {
    ...event,
    image,
  };
}

export function deleteTimelineEvent(
  events: TimelineEvent[],
  eventId: string,
): TimelineEvent[] {
  return events.filter((event) => event.id !== eventId);
}

export function moveTimelineEvent(
  events: TimelineEvent[],
  sourceEventId: string,
  targetEventId: string,
): TimelineEvent[] {
  if (sourceEventId === targetEventId) {
    return events;
  }

  const sourceEvent = events.find((event) => event.id === sourceEventId);
  const targetEvent = events.find((event) => event.id === targetEventId);
  if (!sourceEvent || !targetEvent || sourceEvent.lane !== targetEvent.lane) {
    return events;
  }

  const laneEvents = events.filter((event) => event.lane === sourceEvent.lane);
  const otherEvents = events.filter((event) => event.lane !== sourceEvent.lane);
  const nextLaneEvents = laneEvents.filter((event) => event.id !== sourceEventId);
  const targetIndex = nextLaneEvents.findIndex((event) => event.id === targetEventId);
  nextLaneEvents.splice(targetIndex, 0, sourceEvent);

  const laneOrder = new Map(nextLaneEvents.map((event, index) => [event.id, index]));

  return [...otherEvents, ...nextLaneEvents].sort((first, second) => {
    if (first.lane !== second.lane) {
      return first.lane === "story" ? -1 : 1;
    }

    return (laneOrder.get(first.id) ?? 0) - (laneOrder.get(second.id) ?? 0);
  });
}

export function moveTimelineEventToIndex(
  events: TimelineEvent[],
  sourceEventId: string,
  targetIndex: number,
): TimelineEvent[] {
  const sourceEvent = events.find((event) => event.id === sourceEventId);
  if (!sourceEvent) {
    return events;
  }

  const laneEvents = events.filter((event) => event.lane === sourceEvent.lane);
  const otherEvents = events.filter((event) => event.lane !== sourceEvent.lane);
  const nextLaneEvents = laneEvents.filter((event) => event.id !== sourceEventId);
  const safeTargetIndex = Math.min(Math.max(targetIndex, 0), nextLaneEvents.length);
  nextLaneEvents.splice(safeTargetIndex, 0, sourceEvent);

  const laneOrder = new Map(nextLaneEvents.map((event, index) => [event.id, index]));

  return [...otherEvents, ...nextLaneEvents].sort((first, second) => {
    if (first.lane !== second.lane) {
      return first.lane === "story" ? -1 : 1;
    }

    return (laneOrder.get(first.id) ?? 0) - (laneOrder.get(second.id) ?? 0);
  });
}

export function updateProjectTimelineEvents(
  projects: Project[],
  projectId: string,
  timelineEvents: TimelineEvent[],
): Project[] {
  return projects.map((project) =>
    project.id === projectId ? { ...project, timelineEvents } : project,
  );
}
