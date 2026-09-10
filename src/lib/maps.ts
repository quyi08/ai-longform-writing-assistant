import type {
  MapBaseCategory,
  MapImageOverlay,
  MapMarker,
  MapTextColor,
  MapTextFont,
  MapTextOverlay,
  Project,
  StoryMap,
} from "./knowledge";

export type BuiltInMapBase = {
  id: string;
  title: string;
  category: Exclude<MapBaseCategory, "custom">;
  thumbnailUrl: string;
  imageUrl: string;
};

export type CreateStoryMapInput = {
  title?: string;
  base: {
    id?: string;
    title: string;
    category: MapBaseCategory;
    imageUrl: string;
  };
};

export type AddMapMarkerInput = {
  title?: string;
  x: number;
  y: number;
  note?: string;
};

export type AddMapTextInput = {
  text?: string;
  x: number;
  y: number;
  color: MapTextColor;
  font: MapTextFont;
  fontSize: number;
};

export type UpdateMapTextInput = Partial<
  Pick<MapTextOverlay, "text" | "color" | "font" | "fontSize">
>;

export type AddMapImageInput = {
  name: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type UpdateMapImageInput = Partial<
  Pick<MapImageOverlay, "x" | "y" | "width" | "height">
>;

export type MapContextMenuPlacementInput = {
  clientX: number;
  clientY: number;
  frameLeft: number;
  frameTop: number;
  frameWidth: number;
  frameHeight: number;
  menuWidth?: number;
  menuHeight?: number;
  padding?: number;
};

export const MAP_TEXT_COLORS: Array<{ value: MapTextColor; label: string; hex: string }> = [
  { value: "white", label: "白色", hex: "#f8fff7" },
  { value: "black", label: "黑色", hex: "#111827" },
  { value: "red", label: "红色", hex: "#ef4444" },
  { value: "orange", label: "橙色", hex: "#f97316" },
  { value: "yellow", label: "黄色", hex: "#facc15" },
  { value: "green", label: "绿色", hex: "#86efac" },
  { value: "cyan", label: "青色", hex: "#67e8f9" },
  { value: "blue", label: "蓝色", hex: "#60a5fa" },
  { value: "purple", label: "紫色", hex: "#c084fc" },
  { value: "pink", label: "粉色", hex: "#f9a8d4" },
];

export const MAP_TEXT_FONTS: Array<{ value: MapTextFont; label: string; family: string }> = [
  { value: "sans", label: "雅黑", family: '"Microsoft YaHei", "PingFang SC", sans-serif' },
  { value: "serif", label: "宋体", family: 'SimSun, "Songti SC", serif' },
  { value: "mono", label: "等宽", family: 'Consolas, "Courier New", monospace' },
  { value: "kai", label: "楷体", family: 'KaiTi, "Kaiti SC", serif' },
  { value: "hei", label: "黑体", family: 'SimHei, "Heiti SC", sans-serif' },
];

export function calculateMapContextMenuPlacement({
  clientX,
  clientY,
  frameLeft,
  frameTop,
  frameWidth,
  frameHeight,
  menuWidth = 260,
  menuHeight = 360,
  padding = 8,
}: MapContextMenuPlacementInput): { x: number; y: number } {
  const maxX = Math.max(padding, frameWidth - menuWidth - padding);
  const maxY = Math.max(padding, frameHeight - menuHeight - padding);
  const x = Math.min(maxX, Math.max(padding, clientX - frameLeft));
  const y = Math.min(maxY, Math.max(padding, clientY - frameTop));

  return {
    x: Math.round(x),
    y: Math.round(y),
  };
}

const builtInBase = (
  id: string,
  title: string,
  category: Exclude<MapBaseCategory, "custom">,
  fileName: string,
): BuiltInMapBase => ({
  id,
  title,
  category,
  thumbnailUrl: `/map-bases/${fileName}`,
  imageUrl: `/map-bases/${fileName}`,
});

export const BUILT_IN_MAP_BASES: BuiltInMapBase[] = [
  builtInBase("western-01", "西境诸国", "western", "01-western-continent.jpg"),
  builtInBase("western-02", "雾海群岛", "western", "02-western-isles.jpg"),
  builtInBase("western-03", "旧王国边疆", "western", "03-western-empire.jpg"),
  builtInBase("western-04", "裂谷诸侯", "western", "04-western-borderlands.jpg"),
  builtInBase("western-05", "北境海岸", "western", "05-western-coast.jpg"),
  builtInBase("western-06", "骑士王领", "western", "06-western-kingdoms.jpg"),
  builtInBase("xianxia-01", "云山仙域", "xianxia", "07-xianxia-mountains.jpg"),
  builtInBase("xianxia-02", "浮云洞天", "xianxia", "08-xianxia-cloudlands.jpg"),
  builtInBase("xianxia-03", "宗门灵谷", "xianxia", "09-xianxia-sect-valley.jpg"),
  builtInBase("xianxia-04", "仙海诸洲", "xianxia", "10-xianxia-immortal-sea.jpg"),
  builtInBase("xianxia-05", "灵峰古道", "xianxia", "11-xianxia-spirit-peaks.jpg"),
  builtInBase("xianxia-06", "烟水八荒", "xianxia", "12-xianxia-riverlands.jpg"),
  builtInBase("cosmic-01", "星门航路", "cosmic", "13-cosmic-starchart.jpg"),
  builtInBase("cosmic-02", "星云边境", "cosmic", "14-cosmic-nebula-routes.jpg"),
  builtInBase("cosmic-03", "行星群落", "cosmic", "15-cosmic-planet-cluster.jpg"),
  builtInBase("cosmic-04", "深空遗迹", "cosmic", "16-cosmic-deep-space.jpg"),
  builtInBase("city-01", "城防要塞", "city", "17-city-fortress.jpg"),
  builtInBase("city-02", "海港城区", "city", "18-city-port.jpg"),
  builtInBase("city-03", "运河旧城", "city", "19-city-canal.jpg"),
  builtInBase("city-04", "环形街区", "city", "20-city-districts.jpg"),
];

const today = (): string => new Date().toISOString().slice(0, 10);

const createId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)));

const clampSize = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)));

export function createStoryMap(project: Project, input: CreateStoryMapInput): Project {
  const date = today();
  const storyMap: StoryMap = {
    id: createId("map"),
    title: input.title?.trim() || input.base.title,
    baseId: input.base.id,
    baseImageUrl: input.base.imageUrl,
    baseImageName: input.base.title,
    category: input.base.category,
    markers: [],
    texts: [],
    images: [],
    zoom: 100,
    createdAt: date,
    updatedAt: date,
  };

  return {
    ...project,
    maps: [...(project.maps ?? []), storyMap],
  };
}

export function deleteStoryMap(project: Project, mapId: string): Project {
  return {
    ...project,
    maps: (project.maps ?? []).filter((map) => map.id !== mapId),
  };
}

export function updateStoryMapZoom(project: Project, mapId: string, zoom: number): Project {
  return {
    ...project,
    maps: (project.maps ?? []).map((map) =>
      map.id === mapId ? { ...map, zoom: clamp(zoom, 50, 220), updatedAt: today() } : map,
    ),
  };
}

export function updateStoryMapTitle(project: Project, mapId: string, title: string): Project {
  const normalizedTitle = title.trim() || "未命名地图";

  return {
    ...project,
    maps: (project.maps ?? []).map((map) =>
      map.id === mapId ? { ...map, title: normalizedTitle, updatedAt: today() } : map,
    ),
  };
}

export function addStoryMapMarker(
  project: Project,
  mapId: string,
  input: AddMapMarkerInput,
): Project {
  const marker: MapMarker = {
    id: createId("marker"),
    title: input.title?.trim() || "新标记",
    x: clamp(input.x, 0, 100),
    y: clamp(input.y, 0, 100),
    note: input.note?.trim() ?? "",
  };

  return {
    ...project,
    maps: (project.maps ?? []).map((map) =>
      map.id === mapId
        ? { ...map, markers: [...map.markers, marker], updatedAt: today() }
        : map,
    ),
  };
}

export function addStoryMapText(project: Project, mapId: string, input: AddMapTextInput): Project {
  const text: MapTextOverlay = {
    id: createId("map-text"),
    text: input.text?.trim() || "新文本",
    x: clamp(input.x, 0, 100),
    y: clamp(input.y, 0, 100),
    color: input.color,
    font: input.font,
    fontSize: clampSize(input.fontSize, 12, 72),
  };

  return {
    ...project,
    maps: (project.maps ?? []).map((map) =>
      map.id === mapId
        ? { ...map, texts: [...(map.texts ?? []), text], updatedAt: today() }
        : map,
    ),
  };
}

export function updateStoryMapText(
  project: Project,
  mapId: string,
  textId: string,
  input: UpdateMapTextInput,
): Project {
  return {
    ...project,
    maps: (project.maps ?? []).map((map) =>
      map.id === mapId
        ? {
            ...map,
            texts: (map.texts ?? []).map((text) =>
              text.id === textId
                ? {
                    ...text,
                    text: input.text === undefined ? text.text : input.text.trim() || "新文本",
                    color: input.color ?? text.color,
                    font: input.font ?? text.font,
                    fontSize:
                      input.fontSize === undefined
                        ? text.fontSize
                        : clampSize(input.fontSize, 12, 72),
                  }
                : text,
            ),
            updatedAt: today(),
          }
        : map,
    ),
  };
}

export function addStoryMapImage(
  project: Project,
  mapId: string,
  input: AddMapImageInput,
): Project {
  const image: MapImageOverlay = {
    id: createId("map-image"),
    name: input.name.trim() || "插入图片",
    url: input.url,
    x: clamp(input.x, 0, 100),
    y: clamp(input.y, 0, 100),
    width: clampSize(input.width, 48, 640),
    height: clampSize(input.height, 48, 640),
  };

  return {
    ...project,
    maps: (project.maps ?? []).map((map) =>
      map.id === mapId
        ? { ...map, images: [...(map.images ?? []), image], updatedAt: today() }
        : map,
    ),
  };
}

export function updateStoryMapImage(
  project: Project,
  mapId: string,
  imageId: string,
  input: UpdateMapImageInput,
): Project {
  return {
    ...project,
    maps: (project.maps ?? []).map((map) =>
      map.id === mapId
        ? {
            ...map,
            images: (map.images ?? []).map((image) =>
              image.id === imageId
                ? {
                    ...image,
                    x: input.x === undefined ? image.x : clamp(input.x, 0, 100),
                    y: input.y === undefined ? image.y : clamp(input.y, 0, 100),
                    width:
                      input.width === undefined
                        ? image.width
                        : clampSize(input.width, 48, 640),
                    height:
                      input.height === undefined
                        ? image.height
                        : clampSize(input.height, 48, 640),
                  }
                : image,
            ),
            updatedAt: today(),
          }
        : map,
    ),
  };
}
