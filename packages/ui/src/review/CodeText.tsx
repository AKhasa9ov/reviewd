import type { SyntaxLine } from './syntax.js';

interface CodeTextProps {
  text: string;
  syntax?: SyntaxLine | null | undefined;
}

/** Renders one line of source with Prism token spans, never raw HTML. */
export function CodeText({ text, syntax }: CodeTextProps): JSX.Element {
  const segments = syntax?.segments;
  if (segments === undefined || segments.length === 0) {
    return <>{text === '' ? ' ' : text}</>;
  }
  if (segments.map((segment) => segment.text).join('') !== text) {
    return <>{text === '' ? ' ' : text}</>;
  }
  return (
    <>
      {segments.map((segment, index) =>
        segment.token === null ? (
          <span key={index}>{segment.text}</span>
        ) : (
          <span key={index} className={`cr-token cr-token-${segment.token}`}>
            {segment.text}
          </span>
        ),
      )}
    </>
  );
}
