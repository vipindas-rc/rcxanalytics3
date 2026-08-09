import styled, { ThemeProvider, useTheme } from 'styled-components';
import {
  TagBorder,
  TagColor,
  TagColorScheme,
  TagComponent,
  TagText,
  theme as coreTheme,
} from '@ringcx/ui';

/* Shared Tag variants.
 *
 * Wraps the core @ringcx/ui Tag so every look is a named variant:
 * - tinted   — core Tag default (soft background, colored text)
 * - bordered — core Tag with the bordered prop
 * - filled   — solid pill using the core palette's text color as background,
 *              built from the core Tag's own styled primitives (TagBorder +
 *              TagText) so its shape and typography track Tag.styled.ts
 *              automatically instead of duplicating metrics here.
 *
 * Severity always renders filled and maps to core colors: High = Red,
 * Medium = Orange, Low = Grey. All colors, fonts, and metrics come from the
 * vendored ringcx/ui source (TagColorScheme + Tag.styled.ts) — nothing
 * hardcoded outside the core palette.
 */

export type TagVariant = 'tinted' | 'bordered' | 'filled';

// Filled pill = the core Tag frame with the palette's text color promoted to
// the background. Everything else (radius, padding, font metrics, overflow)
// is inherited from TagBorder/TagText in the vendored Tag.styled.ts.
const FilledTagRoot = styled(TagBorder)`
  && {
    color: #ffffff;
    background-color: ${({ color }: { color: TagColor }) =>
      TagColorScheme[color].text};
    overflow: hidden;
  }

  /* A solid pill has no border, including the core hover border. */
  &&::before {
    display: none;
  }
`;

// The core styled components read the font family (and only crash without a
// theme), so guarantee one: reuse the active styled-components theme when
// present, otherwise fall back to the core theme.
function useEnsuredTheme() {
  const activeTheme = useTheme() as { font?: { family?: string } } | undefined;
  return activeTheme?.font?.family ? undefined : coreTheme;
}

export function TagVariantComponent({
  color,
  text,
  variant = 'tinted',
  'data-testid': testId,
}: {
  color: TagColor;
  text: string;
  variant?: TagVariant;
  'data-testid'?: string;
}) {
  const fallbackTheme = useEnsuredTheme();
  if (variant === 'filled') {
    const filled = (
      <FilledTagRoot color={color} data-testid={testId}>
        <TagText>{text}</TagText>
      </FilledTagRoot>
    );
    return fallbackTheme ? (
      <ThemeProvider theme={fallbackTheme}>{filled}</ThemeProvider>
    ) : (
      filled
    );
  }
  // Core TagComponent doesn't forward arbitrary DOM attributes, so anchor
  // the test id on a neutral wrapper for tinted/bordered variants.
  return (
    <span className="inline-flex max-w-full" data-testid={testId}>
      <TagComponent
        color={color}
        text={text}
        bordered={variant === 'bordered'}
      />
    </span>
  );
}

export type Severity = 'High' | 'Medium' | 'Low';

export const SEVERITY_COLOR: Record<Severity, TagColor> = {
  High: TagColor.Red,
  Medium: TagColor.Orange,
  Low: TagColor.Grey,
};

// Severity is always a filled tag.
export function SeverityTag({ severity }: { severity: Severity }) {
  return (
    <TagVariantComponent
      color={SEVERITY_COLOR[severity]}
      text={severity}
      variant="filled"
      data-testid={`tag-severity-${severity.toLowerCase()}`}
    />
  );
}
