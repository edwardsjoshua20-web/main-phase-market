import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, 'config', 'source-registry.json');
const PUBLIC_DATA_ROOT = path.join(ROOT, 'public', 'data');

let cachedRegistry = null;

function readRegistry() {
  if (cachedRegistry) return cachedRegistry;
  cachedRegistry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  return cachedRegistry;
}

export function getSourceRegistry() {
  return readRegistry();
}

export function getGameRegistry(game) {
  const registry = readRegistry();
  return registry?.games?.[game] || {};
}

export function getGameDataAliases(game) {
  const config = getGameRegistry(game);
  const aliases = Array.isArray(config?.dataAliases) && config.dataAliases.length > 0
    ? config.dataAliases
    : [game];
  return aliases;
}

export function resolveGameDataFile(game, relativePath) {
  const aliases = getGameDataAliases(game);
  for (const alias of aliases) {
    const candidate = path.join(PUBLIC_DATA_ROOT, alias, relativePath);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(PUBLIC_DATA_ROOT, aliases[0], relativePath);
}

export function getGameSourceConfig(game, key = 'catalogSource') {
  const config = getGameRegistry(game);
  return config?.[key] || null;
}

export function resolveConfiguredSourcePath(game, key = 'catalogSource') {
  const source = getGameSourceConfig(game, key);
  if (!source || source.type !== 'file') return null;
  const raw = process.env[source.envVar] || source.path || '';
  if (!raw) return null;
  return path.isAbsolute(raw) ? raw : path.resolve(ROOT, raw);
}

export function sourceRequirementStatus(game, key = 'catalogSource') {
  const source = getGameSourceConfig(game, key);
  if (!source) {
    return {
      configured: false,
      type: 'missing'
    };
  }

  if (source.type === 'remote') {
    return {
      configured: true,
      type: 'remote',
      url: source.url || null
    };
  }

  const resolvedPath = resolveConfiguredSourcePath(game, key);
  return {
    configured: true,
    type: 'file',
    envVar: source.envVar || null,
    path: resolvedPath,
    exists: Boolean(resolvedPath && fs.existsSync(resolvedPath))
  };
}
