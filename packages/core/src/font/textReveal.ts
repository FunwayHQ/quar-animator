import type { TextNode } from '@quar/types';

/** Resolve the source text prefix shown by an animated character-count value. */
export function getVisibleTextContent(
  node: Pick<TextNode, 'content' | 'visibleCharacters'>
): string {
  if (node.visibleCharacters === undefined) return node.content;
  const characters = Array.from(node.content);
  const visibleCount = Math.max(0, Math.min(characters.length, Math.floor(node.visibleCharacters)));
  return characters.slice(0, visibleCount).join('');
}
