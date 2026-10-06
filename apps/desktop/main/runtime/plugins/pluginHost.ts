import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { PluginInfo, PluginPanelField, PluginPanelInfo } from '@larkwave/core';
import type { LarkToolDef } from '../lark/tools';
import { pathAllowed, validateManifest, type PluginManifest, type PluginToolDecl } from './manifest';
import { verifyManifestSignature } from './verifier';

interface RegistryEntry {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  signed: boolean;
  author?: string;
  description?: string;
  permissions: string[];
  toolCount: number;
}

/**
 * Manages curated plugins under `${userData}/plugins/`. Each plugin is a folder
 * `<id>/manifest.json`; `registry.json` tracks enabled/signed state. Enabled
 * plugins contribute their declared (permission-scoped) Lark tools to the agent
 * loop via `collectTools()` — the dispatcher runs the manifest's `{method, path}`
 * through the LarkClient, never any plugin-supplied code.
 */
export class PluginHost {
  private readonly dir: string;

  constructor(baseDir: string) {
    this.dir = join(baseDir, 'plugins');
    mkdirSync(this.dir, { recursive: true });
  }

  private registryPath() {
    return join(this.dir, 'registry.json');
  }
  private manifestPath(id: string) {
    return join(this.dir, id, 'manifest.json');
  }
  private trustedKeysPath() {
    return join(this.dir, 'trusted-keys.json');
  }

  private readRegistry(): RegistryEntry[] {
    try {
      const arr = JSON.parse(readFileSync(this.registryPath(), 'utf8'));
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  private writeRegistry(entries: RegistryEntry[]): void {
    writeFileSync(this.registryPath(), JSON.stringify(entries, null, 2));
  }
  private readTrustedKeys(): string[] {
    try {
      const arr = JSON.parse(readFileSync(this.trustedKeysPath(), 'utf8'));
      return Array.isArray(arr) ? arr.filter((k) => typeof k === 'string') : [];
    } catch {
      return [];
    }
  }

  list(): PluginInfo[] {
    return this.readRegistry().map((e) => ({
      id: e.id,
      name: e.name,
      version: e.version,
      enabled: e.enabled,
      signed: e.signed,
      author: e.author,
      description: e.description,
      permissions: e.permissions,
      toolCount: e.toolCount,
    }));
  }

  /** Install from a local manifest.json path (or a folder containing one). */
  install(source: string): PluginInfo[] {
    const file =
      existsSync(source) && statSync(source).isDirectory() ? join(source, 'manifest.json') : source;
    if (!existsSync(file)) throw new Error('Không tìm thấy manifest.json tại đường dẫn đó.');

    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      throw new Error('manifest.json không phải JSON hợp lệ.');
    }
    const res = validateManifest(parsed);
    if (!res.ok || !res.manifest) throw new Error(res.error || 'Manifest không hợp lệ.');
    const manifest = res.manifest;

    const signed = verifyManifestSignature(manifest, this.readTrustedKeys());

    mkdirSync(join(this.dir, manifest.id), { recursive: true });
    writeFileSync(this.manifestPath(manifest.id), JSON.stringify(manifest, null, 2));

    const registry = this.readRegistry();
    const prev = registry.find((e) => e.id === manifest.id);
    const entry: RegistryEntry = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      enabled: prev?.enabled ?? false, // keep prior enabled state on update
      signed,
      author: manifest.author,
      description: manifest.description,
      permissions: manifest.permissions,
      toolCount: manifest.tools.length,
    };
    this.writeRegistry([...registry.filter((e) => e.id !== manifest.id), entry]);
    return this.list();
  }

  setEnabled(id: string, enabled: boolean): PluginInfo[] {
    const registry = this.readRegistry();
    const entry = registry.find((e) => e.id === id);
    if (entry) {
      entry.enabled = enabled;
      this.writeRegistry(registry);
    }
    return this.list();
  }

  uninstall(id: string): PluginInfo[] {
    try {
      rmSync(join(this.dir, id), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    this.writeRegistry(this.readRegistry().filter((e) => e.id !== id));
    return this.list();
  }

  /** Lark tool defs contributed by ENABLED plugins (read manifests fresh). */
  collectTools(): LarkToolDef[] {
    const out: LarkToolDef[] = [];
    for (const manifest of this.enabledManifests()) {
      for (const t of manifest.tools) out.push(toDef(manifest, t));
    }
    return out;
  }

  /** Declarative form panels contributed by ENABLED plugins. */
  collectPanels(): PluginPanelInfo[] {
    const out: PluginPanelInfo[] = [];
    for (const manifest of this.enabledManifests()) {
      for (const panel of manifest.panels ?? []) {
        const tool = manifest.tools.find((t) => t.name === panel.tool);
        if (!tool) continue;
        out.push({
          pluginId: manifest.id,
          pluginName: manifest.name,
          panelId: panel.id,
          title: panel.title,
          description: panel.description,
          submitLabel: panel.submitLabel,
          toolName: `plugin_${manifest.id}__${tool.name}`,
          gated: !!tool.gated,
          fields: deriveFields(tool.inputSchema),
        });
      }
    }
    return out;
  }

  private enabledManifests(): PluginManifest[] {
    const out: PluginManifest[] = [];
    for (const e of this.readRegistry()) {
      if (!e.enabled) continue;
      try {
        out.push(JSON.parse(readFileSync(this.manifestPath(e.id), 'utf8')));
      } catch {
        /* skip unreadable manifest */
      }
    }
    return out;
  }
}

/** Derive UI form fields from a tool's JSON input schema. */
function deriveFields(schema: Record<string, unknown>): PluginPanelField[] {
  const props = (schema?.properties ?? {}) as Record<string, any>;
  const required = new Set<string>(Array.isArray(schema?.required) ? (schema.required as string[]) : []);
  return Object.entries(props).map(([name, p]) => {
    const t = p?.type;
    const type: PluginPanelField['type'] =
      t === 'number' || t === 'integer' || t === 'boolean' || t === 'object' ? t : 'string';
    return {
      name,
      type,
      description: typeof p?.description === 'string' ? p.description : undefined,
      required: required.has(name),
      enum: Array.isArray(p?.enum) ? p.enum.map(String) : undefined,
    };
  });
}

/** Map one manifest tool to a LarkToolDef whose exec is the generic dispatcher. */
function toDef(manifest: PluginManifest, tool: PluginToolDecl): LarkToolDef {
  const method = tool.lark.method.toUpperCase();
  return {
    name: `plugin_${manifest.id}__${tool.name}`,
    description: tool.description,
    inputSchema: tool.inputSchema,
    gated: !!tool.gated,
    exec: (input, client) => {
      const { path, rest } = fillPath(tool.lark.path, input);
      // Defense-in-depth: re-check the (filled) path is within granted permissions.
      if (!pathAllowed(path, manifest.permissions)) {
        return Promise.reject(new Error('Plugin không có quyền cho endpoint này.'));
      }
      return method === 'GET' || method === 'DELETE'
        ? client.request(method, path, { params: rest })
        : client.request(method, path, { data: rest });
    },
  };
}

/** Substitute `{key}` placeholders from input; return the rest as params/body. */
function fillPath(template: string, input: Record<string, any>): { path: string; rest: Record<string, any> } {
  const used = new Set<string>();
  const path = template.replace(/\{(\w+)\}/g, (_, key: string) => {
    used.add(key);
    return encodeURIComponent(String(input[key] ?? ''));
  });
  const rest: Record<string, any> = {};
  for (const [k, v] of Object.entries(input)) if (!used.has(k)) rest[k] = v;
  return { path, rest };
}
