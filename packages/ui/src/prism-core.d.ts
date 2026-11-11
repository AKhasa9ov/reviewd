declare module 'prismjs/components/prism-core' {
  import type { TokenStream } from 'prismjs';

  const Prism: {
    languages: Record<string, unknown>;
    tokenize(text: string, grammar: unknown): TokenStream;
  };

  export default Prism;
}
