"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // src/scanner/tokens.ts
  function rgbToHex(r, g, b) {
    const toHex = (n) => Math.round(n * 255).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }
  function colorWithOpacity(r, g, b, a) {
    if (a < 1) {
      const ri = Math.round(r * 255);
      const gi = Math.round(g * 255);
      const bi = Math.round(b * 255);
      return `rgba(${ri},${gi},${bi},${a.toFixed(2)})`;
    }
    return rgbToHex(r, g, b);
  }
  function colorDelta(a, b) {
    return Math.sqrt(
      Math.pow((a.r - b.r) * 255, 2) + Math.pow((a.g - b.g) * 255, 2) + Math.pow((a.b - b.b) * 255, 2)
    );
  }
  function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function setPath(obj, path, value) {
    let cur = obj;
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!cur[key] || typeof cur[key].$type !== "undefined") {
        cur[key] = {};
      }
      cur = cur[key];
    }
    cur[path[path.length - 1]] = value;
  }
  function clusterColors(colors, group) {
    var _a2;
    const clusters = [];
    for (const color of colors) {
      let assigned = false;
      for (const cluster of clusters) {
        const rep = cluster[0];
        if (colorDelta({ r: rep.r, g: rep.g, b: rep.b }, { r: color.r, g: color.g, b: color.b }) < 10) {
          cluster.push(color);
          assigned = true;
          break;
        }
      }
      if (!assigned)
        clusters.push([color]);
    }
    for (const cluster of clusters) {
      const canonical = (_a2 = cluster.find((c) => c.source === "variable")) != null ? _a2 : cluster[0];
      const token = {
        $value: colorWithOpacity(canonical.r, canonical.g, canonical.b, canonical.a),
        $type: "color"
      };
      setPath(group, canonical.path, token);
    }
  }
  async function scanVariables(colorRaws, spacingGroup) {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    for (const collection of collections) {
      const modeId = collection.defaultModeId;
      for (const varId of collection.variableIds) {
        const variable = await figma.variables.getVariableByIdAsync(varId);
        if (!variable)
          continue;
        const rawValue = variable.valuesByMode[modeId];
        if (rawValue === void 0)
          continue;
        const nameParts = variable.name.split("/").map(slugify);
        if (variable.resolvedType === "COLOR") {
          const val = rawValue;
          colorRaws.push({
            path: nameParts,
            r: val.r,
            g: val.g,
            b: val.b,
            a: val.a,
            source: "variable"
          });
        } else if (variable.resolvedType === "FLOAT") {
          const val = rawValue;
          const token = {
            $value: `${val}px`,
            $type: "dimension"
          };
          setPath(spacingGroup, nameParts, token);
        }
      }
    }
  }
  async function scanLocalStyles(colorRaws, typographyGroup) {
    var _a2;
    const paintStyles = await figma.getLocalPaintStylesAsync();
    for (const style of paintStyles) {
      const solid = style.paints.find((p) => p.type === "SOLID");
      if (!solid)
        continue;
      colorRaws.push({
        path: style.name.split("/").map(slugify),
        r: solid.color.r,
        g: solid.color.g,
        b: solid.color.b,
        a: (_a2 = solid.opacity) != null ? _a2 : 1,
        source: "style"
      });
    }
    const textStyles = await figma.getLocalTextStylesAsync();
    for (const style of textStyles) {
      addTypographyToken(typographyGroup, style);
    }
  }
  function collectStyleIds(node, fillIds, textIds) {
    if ("fillStyleId" in node && typeof node.fillStyleId === "string" && node.fillStyleId) {
      fillIds.add(node.fillStyleId);
    }
    if ("textStyleId" in node && typeof node.textStyleId === "string" && node.textStyleId) {
      textIds.add(node.textStyleId);
    }
    if ("children" in node) {
      for (const child of node.children) {
        collectStyleIds(child, fillIds, textIds);
      }
    }
  }
  function addTypographyToken(group, style) {
    const token = {
      $value: {
        fontFamily: style.fontName.family,
        fontSize: `${style.fontSize}px`,
        fontWeight: String(style.fontName.style),
        lineHeight: style.lineHeight.unit === "PERCENT" ? (style.lineHeight.value / 100).toFixed(2) : style.lineHeight.unit === "PIXELS" ? `${style.lineHeight.value}px` : "1.4"
      },
      $type: "typography"
    };
    setPath(group, style.name.split("/").map(slugify), token);
  }
  async function scanUsedStyles(colorRaws, typographyGroup, seenStyleIds) {
    var _a2;
    const fillIds = /* @__PURE__ */ new Set();
    const textIds = /* @__PURE__ */ new Set();
    for (const page of figma.root.children) {
      collectStyleIds(page, fillIds, textIds);
    }
    for (const id of fillIds) {
      if (seenStyleIds.has(id))
        continue;
      seenStyleIds.add(id);
      const style = await figma.getStyleByIdAsync(id);
      if (!style || style.type !== "PAINT")
        continue;
      const paintStyle = style;
      const solid = paintStyle.paints.find((p) => p.type === "SOLID");
      if (!solid)
        continue;
      colorRaws.push({
        path: style.name.split("/").map(slugify),
        r: solid.color.r,
        g: solid.color.g,
        b: solid.color.b,
        a: (_a2 = solid.opacity) != null ? _a2 : 1,
        source: "style"
      });
    }
    for (const id of textIds) {
      if (seenStyleIds.has(id))
        continue;
      seenStyleIds.add(id);
      const style = await figma.getStyleByIdAsync(id);
      if (!style || style.type !== "TEXT")
        continue;
      addTypographyToken(typographyGroup, style);
    }
  }
  async function scanTokens() {
    const colorRaws = [];
    const spacingGroup = {};
    const typographyGroup = {};
    const seenStyleIds = /* @__PURE__ */ new Set();
    await scanVariables(colorRaws, spacingGroup);
    await scanLocalStyles(colorRaws, typographyGroup);
    const localPaintStyles = await figma.getLocalPaintStylesAsync();
    for (const s of localPaintStyles)
      seenStyleIds.add(s.id);
    const localTextStyles = await figma.getLocalTextStylesAsync();
    for (const s of localTextStyles)
      seenStyleIds.add(s.id);
    await scanUsedStyles(colorRaws, typographyGroup, seenStyleIds);
    const colorGroup = {};
    clusterColors(colorRaws, colorGroup);
    const result = {};
    if (Object.keys(colorGroup).length)
      result.color = colorGroup;
    if (Object.keys(spacingGroup).length)
      result.spacing = spacingGroup;
    if (Object.keys(typographyGroup).length)
      result.typography = typographyGroup;
    return result;
  }

  // src/scanner/uuid.ts
  var PLUGIN_DATA_KEY = "designbridge_uuid";
  function uuidv4() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : r & 3 | 8;
      return v.toString(16);
    });
  }
  function getOrCreateUUID(node) {
    const existing = node.getPluginData(PLUGIN_DATA_KEY);
    if (existing)
      return existing;
    const fresh = uuidv4();
    node.setPluginData(PLUGIN_DATA_KEY, fresh);
    return fresh;
  }

  // src/scanner/components.ts
  function slugify2(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }
  function toTokenPath(name, prefix) {
    const segments = name.split("/").map(slugify2).filter(Boolean);
    return [prefix, ...segments].join(".");
  }
  function inferCategory(node) {
    const nameLower = node.name.toLowerCase();
    if (/^(atoms?|atom\/)/.test(nameLower))
      return "atom";
    if (/^(molecules?|molecule\/)/.test(nameLower))
      return "molecule";
    if (/^(organisms?|organism\/)/.test(nameLower))
      return "organism";
    if (/^(templates?|template\/)/.test(nameLower))
      return "template";
    const { width: w, height: h } = node;
    if (w < 100 && h < 100)
      return "atom";
    if (w < 400 && h < 300)
      return "molecule";
    return "organism";
  }
  function inferPropType(values) {
    if (values.length === 2) {
      const lower = values.map((v) => v.toLowerCase());
      if (lower.includes("true") && lower.includes("false"))
        return "boolean";
    }
    if (values.length >= 2)
      return "enum";
    return "string";
  }
  function parseProps(node) {
    var _a2;
    const props = [];
    for (const [propName, propDef] of Object.entries(node.componentPropertyDefinitions)) {
      const cleanName = propName.replace(/#\d+$/, "").trim();
      if (propDef.type === "VARIANT") {
        const values = (_a2 = propDef.variantOptions) != null ? _a2 : [];
        props.push({ name: cleanName, type: inferPropType(values), values, default: propDef.defaultValue });
      } else if (propDef.type === "BOOLEAN") {
        props.push({ name: cleanName, type: "boolean", values: ["true", "false"], default: propDef.defaultValue });
      } else if (propDef.type === "TEXT") {
        props.push({ name: cleanName, type: "string", values: [], default: propDef.defaultValue });
      } else if (propDef.type === "INSTANCE_SWAP") {
        props.push({ name: cleanName, type: "string", values: [], default: null });
      }
    }
    return props;
  }
  function buildFigmaUrl(fileKey, nodeId) {
    if (!fileKey)
      return "";
    return `https://www.figma.com/design/${fileKey}?node-id=${nodeId.replace(":", "-")}`;
  }
  async function collectTokenRefs(node, refs, styleCache, varCache) {
    if ("boundVariables" in node && node.boundVariables) {
      const bound = node.boundVariables;
      for (const binding of Object.values(bound)) {
        const aliases = Array.isArray(binding) ? binding : [binding];
        for (const alias of aliases) {
          if (!alias || alias.type !== "VARIABLE_ALIAS")
            continue;
          if (!varCache.has(alias.id)) {
            const v = await figma.variables.getVariableByIdAsync(alias.id);
            varCache.set(alias.id, v ? v.name.split("/").map(slugify2).join(".") : "");
          }
          const path = varCache.get(alias.id);
          if (path)
            refs.add(path);
        }
      }
    }
    if ("fillStyleId" in node && typeof node.fillStyleId === "string" && node.fillStyleId) {
      const id = node.fillStyleId;
      if (!styleCache.has(id)) {
        const s = await figma.getStyleByIdAsync(id);
        styleCache.set(id, s ? toTokenPath(s.name, "color") : "");
      }
      const path = styleCache.get(id);
      if (path)
        refs.add(path);
    }
    if ("textStyleId" in node && typeof node.textStyleId === "string" && node.textStyleId) {
      const id = node.textStyleId;
      if (!styleCache.has(id)) {
        const s = await figma.getStyleByIdAsync(id);
        styleCache.set(id, s ? toTokenPath(s.name, "typography") : "");
      }
      const path = styleCache.get(id);
      if (path)
        refs.add(path);
    }
    if ("strokeStyleId" in node && typeof node.strokeStyleId === "string" && node.strokeStyleId) {
      const id = node.strokeStyleId;
      if (!styleCache.has(id)) {
        const s = await figma.getStyleByIdAsync(id);
        styleCache.set(id, s ? toTokenPath(s.name, "color") : "");
      }
      const path = styleCache.get(id);
      if (path)
        refs.add(path);
    }
    if ("children" in node) {
      for (const child of node.children) {
        await collectTokenRefs(child, refs, styleCache, varCache);
      }
    }
  }
  async function scanComponents(fileKey) {
    var _a2, _b;
    const entries = [];
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const styleCache = /* @__PURE__ */ new Map();
    const varCache = /* @__PURE__ */ new Map();
    const componentSets = figma.root.findAllWithCriteria({ types: ["COMPONENT_SET"] });
    const standaloneComponents = figma.root.findAllWithCriteria({ types: ["COMPONENT"] }).filter((c) => {
      var _a3;
      return ((_a3 = c.parent) == null ? void 0 : _a3.type) !== "COMPONENT_SET";
    });
    for (const set of componentSets) {
      const uuid = getOrCreateUUID(set);
      const refs = /* @__PURE__ */ new Set();
      await collectTokenRefs(set, refs, styleCache, varCache);
      entries.push({
        uuid,
        name: set.name,
        figmaNodeId: set.id,
        figmaFileKey: fileKey,
        figmaUrl: buildFigmaUrl(fileKey, set.id),
        category: inferCategory(set),
        description: (_a2 = set.description) != null ? _a2 : "",
        props: parseProps(set),
        tokenRefs: Array.from(refs),
        codeRef: null,
        status: "new",
        lastSyncedAt: now
      });
    }
    for (const comp of standaloneComponents) {
      const uuid = getOrCreateUUID(comp);
      const refs = /* @__PURE__ */ new Set();
      await collectTokenRefs(comp, refs, styleCache, varCache);
      entries.push({
        uuid,
        name: comp.name,
        figmaNodeId: comp.id,
        figmaFileKey: fileKey,
        figmaUrl: buildFigmaUrl(fileKey, comp.id),
        category: inferCategory(comp),
        description: (_b = comp.description) != null ? _b : "",
        props: [],
        tokenRefs: Array.from(refs),
        codeRef: null,
        status: "new",
        lastSyncedAt: now
      });
    }
    return entries;
  }

  // src/scanner/diff.ts
  function propsSignature(entry) {
    return JSON.stringify(entry.props.map((p) => ({ name: p.name, type: p.type, values: p.values })));
  }
  function applyDiff(current, previous) {
    const prevMap = new Map(previous.map((c) => [c.figmaNodeId, c]));
    const stats = { new: 0, synced: 0, modified: 0 };
    const components = current.map((entry) => {
      const prev = prevMap.get(entry.figmaNodeId);
      if (!prev) {
        stats.new++;
        return __spreadProps(__spreadValues({}, entry), { status: "new" });
      }
      const changed = entry.name !== prev.name || propsSignature(entry) !== propsSignature(prev);
      if (changed) {
        stats.modified++;
        return __spreadProps(__spreadValues({}, entry), { status: "modified" });
      }
      stats.synced++;
      return __spreadProps(__spreadValues({}, entry), {
        status: "synced",
        codeRef: prev.codeRef,
        lastSyncedAt: prev.lastSyncedAt
      });
    });
    return { components, stats };
  }

  // src/main.ts
  var SHARED_NS = "designbridge";
  var SHARED_KEY_MANIFEST = "manifest";
  var SHARED_KEY_FILEKEY = "fileKey";
  figma.showUI(__html__, { width: 420, height: 600, themeColors: true });
  var _a;
  var cachedKey = (_a = figma.fileKey) != null ? _a : figma.root.getSharedPluginData(SHARED_NS, SHARED_KEY_FILEKEY);
  if (cachedKey) {
    figma.ui.postMessage({ type: "FILE_KEY", value: cachedKey });
  }
  function extractKey(raw) {
    const match = raw.match(/figma\.com\/(?:design|file)\/([A-Za-z0-9]+)/);
    return match ? match[1] : raw.trim();
  }
  function resolveFileKey(providedKey) {
    if (providedKey && providedKey.trim()) {
      const key = extractKey(providedKey);
      figma.root.setSharedPluginData(SHARED_NS, SHARED_KEY_FILEKEY, key);
      return key;
    }
    if (figma.fileKey) {
      figma.root.setSharedPluginData(SHARED_NS, SHARED_KEY_FILEKEY, figma.fileKey);
      return figma.fileKey;
    }
    const cached = figma.root.getSharedPluginData(SHARED_NS, SHARED_KEY_FILEKEY);
    return cached || "";
  }
  function loadPreviousManifest() {
    var _a2;
    try {
      const raw = figma.root.getSharedPluginData(SHARED_NS, SHARED_KEY_MANIFEST);
      if (!raw)
        return [];
      const manifest = JSON.parse(raw);
      return (_a2 = manifest.components) != null ? _a2 : [];
    } catch (e) {
      return [];
    }
  }
  function saveManifest(manifest) {
    figma.root.setSharedPluginData(SHARED_NS, SHARED_KEY_MANIFEST, JSON.stringify(manifest));
  }
  function postStatus(message) {
    const msg = { type: "STATUS", message };
    figma.ui.postMessage(msg);
  }
  figma.ui.onmessage = async (msg) => {
    if (msg.type !== "EXPORT")
      return;
    try {
      const fileKey = resolveFileKey(msg.fileKey);
      const previousComponents = loadPreviousManifest();
      const isFirstRun = previousComponents.length === 0;
      postStatus("Scanning tokens\u2026");
      const tokens = await scanTokens();
      postStatus("Scanning components\u2026");
      const scanned = await scanComponents(fileKey);
      postStatus("Comparing with previous export\u2026");
      const { components, stats } = isFirstRun ? { components: scanned, stats: { new: scanned.length, synced: 0, modified: 0 } } : applyDiff(scanned, previousComponents);
      const manifest = {
        version: "1.0.0",
        exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
        components
      };
      saveManifest(manifest);
      const response = {
        type: "EXPORT_READY",
        payload: { tokens, components: manifest, stats }
      };
      figma.ui.postMessage(response);
    } catch (err) {
      const errorMsg = {
        type: "ERROR",
        message: err instanceof Error ? err.message : String(err)
      };
      figma.ui.postMessage(errorMsg);
    }
  };
})();
