export function scopeSelector(selector: string, scope?: string): string;
export function scopeReviewCss(css: string, scope?: string): string;
export function buildReviewCss(options: {
  uiDir: string;
  nativeCssPath: string;
  scope?: string;
}): Promise<string>;
