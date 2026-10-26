function globToRegExp(glob: string): RegExp {
  let pattern = glob.trim();
  if (pattern.endsWith('/')) pattern += '**';
  const anchored = pattern.includes('/');
  let source = '';

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index] ?? '';
    if (character === '*') {
      if (pattern[index + 1] === '*') {
        index += 1;
        if (pattern[index + 1] === '/') {
          index += 1;
          source += '(?:.*/)?';
        } else {
          source += '.*';
        }
      } else {
        source += '[^/]*';
      }
      continue;
    }
    if (character === '?') {
      source += '[^/]';
      continue;
    }
    source += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  return new RegExp(anchored ? `^${source}$` : `(?:^|.*/)${source}$`);
}

export function isIgnored(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(path));
}
