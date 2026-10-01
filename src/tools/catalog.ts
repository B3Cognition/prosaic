/** Read-only neutral tool discovery. Never resolve executables or run probes here. */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { z } from 'zod';

const arg = z.string().max(4096).refine((s) => !s.includes('\0'));
const schema = z.object({
  schema_version: z.literal(1),
  name: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),
  description: z.string().min(1).max(4096),
  tool_version: z.string().min(1).max(40),
  executable: arg.refine((s) => s.length > 0 && !/[{}]/.test(s)),
  argv: z.array(arg).max(64),
  parameters: z.object({ type: z.literal('object'), additionalProperties: z.literal(false),
    properties: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
    required: z.array(z.string()).optional(),
  }).passthrough(),
  path_parameters: z.record(z.string(), z.literal('read')).optional(),
  version_probe: z.array(arg.refine((s) => !/[{}]/.test(s))).max(8).optional(),
  version_contains: z.string().min(1).optional(),
  output_format: z.literal('json'),
  timeout_s: z.number().finite().positive().max(3600).optional(),
  max_output_bytes: z.number().int().min(128).max(1048576).optional(),
  pass_env: z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/)).max(64).optional(),
  success_exit_codes: z.array(z.number().int().min(0).max(255)).min(1).optional(),
}).strict();

export type ToolManifest = z.infer<typeof schema>;

function validate(raw: unknown): ToolManifest {
  const m = schema.parse(raw);
  const properties = m.parameters.properties ?? {};
  if (Object.values(properties).some((p) => p.type !== 'string')) throw new Error('string parameters required');
  for (const token of m.argv) {
    if (/[{}]/.test(token)) {
      const match = /^\{([A-Za-z][A-Za-z0-9_]*)\}$/.exec(token);
      if (!match || !Object.hasOwn(properties, match[1]) || !m.parameters.required?.includes(match[1])) {
        throw new Error('whole required parameter placeholders only');
      }
    }
  }
  if (Object.keys(m.path_parameters ?? {}).some((key) => !Object.hasOwn(properties, key))) throw new Error('unknown path parameter');
  if (m.version_contains && !m.version_probe?.length) throw new Error('version probe required');
  if (new Set(m.pass_env ?? []).size !== (m.pass_env ?? []).length) throw new Error('duplicate environment names');
  const seen = new Set<object>();
  function visit(v: unknown, level: number): void {
    if (level > 64) throw new Error('manifest nesting limit');
    if (v && typeof v === 'object') {
      if (seen.has(v) || v instanceof Date || '$ref' in v || '$dynamicRef' in v) throw new Error('unsupported manifest value or reference');
      seen.add(v);
      for (const child of Object.values(v)) visit(child, level + 1);
      seen.delete(v);
    } else if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('nonfinite value');
  }
  visit(m, 0);
  return m;
}

export function discoverTools(directory: string): { schema_version: 1; tools: { path: string; manifest: ToolManifest }[] } {
  const root = path.resolve(directory);
  if (!fs.existsSync(root)) return { schema_version: 1, tools: [] };
  if (fs.lstatSync(root).isSymbolicLink() || !fs.statSync(root).isDirectory()) throw new Error('invalid tool manifest directory');
  const files = fs.readdirSync(root).filter((p) => /\.ya?ml$/i.test(p)).sort();
  if (files.length > 128) throw new Error('too many tool manifests');
  const names = new Set<string>();
  const tools = files.map((name) => {
    const file = path.join(root, name);
    try {
      if (fs.lstatSync(file).isSymbolicLink() || !fs.statSync(file).isFile()) throw new Error('regular manifests only');
      const fd = fs.openSync(file, 'r');
      let raw: string;
      try {
        const buffer = Buffer.alloc(65537);
        const count = fs.readSync(fd, buffer, 0, buffer.length, 0);
        if (count > 65536) throw new Error('manifest size limit');
        raw = buffer.subarray(0, count).toString('utf8');
      } finally { fs.closeSync(fd); }
      const manifest = validate(yaml.load(raw));
      if (names.has(manifest.name)) throw new Error('duplicate name');
      names.add(manifest.name);
      return { path: file, manifest };
    } catch {
      // YAML/schema diagnostics can contain private source contents. Do not echo them.
      throw new Error(`Invalid or duplicate tool manifest: ${name}`);
    }
  });
  return { schema_version: 1, tools };
}
