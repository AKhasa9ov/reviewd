import Prism from 'prismjs/components/prism-core';

// Prism language components are plain scripts that expect a global instance.
(globalThis as unknown as { Prism?: unknown }).Prism = Prism;

export default Prism;
