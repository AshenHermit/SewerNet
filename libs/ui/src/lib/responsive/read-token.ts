import layoutTokens from '../../layout-tokens.css?raw';

/**
 * Reads a single custom-property value from a tokens stylesheet.
 * Throws when the token is missing, empty, or declared more than once.
 */
export function readToken(cssText: string, token: string): string {
  if (typeof cssText !== 'string') {
    throw new Error(
      `layout tokens stylesheet was not loaded as raw CSS (received ${typeof cssText}) for ${token}`,
    );
  }
  const pattern = new RegExp(`${token}\\s*:\\s*([^;]*);`, 'g');
  const values = [...cssText.matchAll(pattern)].map((match) => match[1].trim());
  if (values.length === 0) {
    throw new Error(`layout tokens must declare ${token}; none was found in the shared stylesheet`);
  }
  if (values.length > 1) {
    throw new Error(`layout tokens declare ${token} multiple times; exactly one value is allowed`);
  }
  if (!values[0]) {
    throw new Error(`layout tokens declare an empty ${token}`);
  }
  return values[0];
}

/** Breakpoint token value shared by CSS and the adaptive slot mechanism. */
export const WIDE_BREAKPOINT = readToken(layoutTokens, '--breakpoint-sn-wide');
