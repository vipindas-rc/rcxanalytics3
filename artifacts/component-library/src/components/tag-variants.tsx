import { TagColor, TagColorScheme, TagComponent } from '@ringcx/ui';

/* Shared Tag variants.
 *
 * Wraps the core @ringcx/ui Tag so every look is a named variant:
 * - tinted   — core Tag default (soft background, colored text)
 * - bordered — core Tag with the bordered prop
 * - inverted — solid pill using the core palette's text color as background,
 *              matching the core Tag shape and typography exactly
 *
 * The severity scale maps to core colors: High = Red, Medium = Orange,
 * Low = Grey. All colors, fonts, and metrics come from the vendored
 * ringcx/ui source (TagColorScheme + Tag.styled.ts) — nothing hardcoded
 * outside the core palette.
 */

export type TagVariant = 'tinted' | 'bordered' | 'inverted';

// Matches vendored Tag.styled.ts: 2px radius, 12px/16px Roboto 500,
// 0.4px letter spacing, 2px 4px text padding.
const TAG_SHAPE_CLASSES =
  'inline-flex max-w-full items-center overflow-hidden whitespace-nowrap rounded-[2px] px-1 py-0.5 text-[12px] font-medium leading-4 tracking-[0.4px]';
const TAG_FONT_FAMILY = "'Roboto', Helvetica, Arial, sans-serif";

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
  if (variant === 'inverted') {
    return (
      <span
        className={`${TAG_SHAPE_CLASSES} text-white`}
        style={{
          backgroundColor: TagColorScheme[color].text,
          fontFamily: TAG_FONT_FAMILY,
        }}
        data-testid={testId}
      >
        {text}
      </span>
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

export function SeverityTag({
  severity,
  variant = 'tinted',
}: {
  severity: Severity;
  variant?: TagVariant;
}) {
  return (
    <TagVariantComponent
      color={SEVERITY_COLOR[severity]}
      text={severity}
      variant={variant}
      data-testid={`tag-severity-${variant}-${severity.toLowerCase()}`}
    />
  );
}
