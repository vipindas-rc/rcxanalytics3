import { useState } from 'react';
import { ThemeProvider } from 'styled-components';
// Juno ships types that don't resolve under bundler moduleResolution;
// runtime import works fine, so silence the declaration lookup.
// @ts-ignore -- see note above
import { RcThemeProvider } from '@ringcentral/juno';
import { theme, TagComponent, TagColor } from '@ringcx/ui';
import {
  SeverityTag,
  TagVariantComponent,
} from '@/components/tag-variants';

/* Tag showcase.
 *
 * Renders the Tag component from the vendored @ringcx/ui core library live
 * from its real source, plus the Severity pill usage recipe, on a single page.
 *
 * Everything is wrapped in the same styled-components + juno theme providers
 * used in the supervisor app so Tag resolves theme.font.family (Roboto).
 */

const TAG_COLORS = Object.values(TagColor);

function Section({
  title,
  importPath,
  description,
  propHighlights,
  children,
}: {
  title: string;
  importPath: string;
  description: string;
  propHighlights: string[];
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[#0000001f] bg-white p-6">
      <div className="mb-1 flex items-baseline gap-3">
        <h2 className="text-[17px] font-semibold text-[#121212]">{title}</h2>
        <code className="rounded bg-[#f2f2f2] px-1.5 py-0.5 text-[11px] text-[#5b5b5b]">
          {importPath}
        </code>
      </div>
      <p className="mb-3 max-w-[720px] text-[13px] leading-5 text-[#5b5b5b]">
        {description}
      </p>
      <ul className="mb-5 flex flex-wrap gap-x-4 gap-y-1">
        {propHighlights.map((p) => (
          <li
            key={p}
            className="text-[12px] leading-5 text-[#757575] before:mr-1.5 before:content-['•']"
          >
            <code className="text-[11px] text-[#444]">{p}</code>
          </li>
        ))}
      </ul>
      {children}
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 py-2">
      <span className="w-44 shrink-0 text-[12px] font-medium text-[#757575]">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

const noop = () => undefined;

export function ComponentLibraryShowcase({
  section: _section,
}: {
  section?: string | null;
}) {
  const [closableTagVisible, setClosableTagVisible] = useState(true);

  return (
    <RcThemeProvider>
      <ThemeProvider theme={theme as any}>
        <main className="min-h-screen bg-[#f7f8fa]">
          <div className="mx-auto max-w-[960px] px-6 py-8">
            <h1 className="mb-1 text-[22px] font-semibold text-[#121212]">
              RCX component library
            </h1>
            <p className="mb-6 max-w-[720px] text-[13px] leading-5 text-[#5b5b5b]">
              The Tag component from the RingCX UI core library, rendered live
              from the vendored source, with tinted, bordered, and filled
              variants plus the severity scale built on the core palette.
            </p>

            <div className="flex flex-col gap-6">
              <Section
                title="Tag"
                importPath='import { TagComponent, TagColor } from "@ringcx/ui"'
                description="A rounded, tinted label for categorical values, such as states, dispositions, and skills. Each color pairs a soft background with a matching text color. Use Tag when the value belongs to a small, fixed set and color adds meaning. The filled variant reuses the core palette, shape, and typography with a solid background. Severity always renders filled: High is red, Medium is orange, and Low is grey."
                propHighlights={[
                  'color: TagColor',
                  'text: string',
                  'bordered?',
                  'onClose?',
                  'onClick?',
                  'disabled?',
                  'shouldShowAlertIcon?',
                  "TagVariantComponent (local): variant?: 'tinted' | 'bordered' | 'filled'",
                ]}
              >
                <Row label="All colors">
                  {TAG_COLORS.map((color) => (
                    <TagVariantComponent
                      key={color}
                      color={color}
                      text={color}
                      data-testid={`tag-tinted-${color.toLowerCase()}`}
                    />
                  ))}
                </Row>
                <Row label="Bordered">
                  {TAG_COLORS.map((color) => (
                    <TagVariantComponent
                      key={color}
                      color={color}
                      text={color}
                      variant="bordered"
                      data-testid={`tag-bordered-${color.toLowerCase()}`}
                    />
                  ))}
                </Row>
                <Row label="Closable">
                  {closableTagVisible ? (
                    <TagComponent
                      color={TagColor.Blue}
                      text="Remove me"
                      onClose={() => setClosableTagVisible(false)}
                    />
                  ) : (
                    <button
                      type="button"
                      className="text-[12px] text-[#175cd3] hover:underline"
                      onClick={() => setClosableTagVisible(true)}
                      data-testid="button-restore-tag"
                    >
                      Restore tag
                    </button>
                  )}
                </Row>
                <Row label="Alert icon">
                  <TagComponent
                    color={TagColor.Red}
                    text="Needs attention"
                    shouldShowAlertIcon
                  />
                  <TagComponent
                    color={TagColor.Orange}
                    text="Check config"
                    shouldShowAlertIcon
                    bordered
                  />
                </Row>
                <Row label="Disabled">
                  <TagComponent
                    color={TagColor.Green}
                    text="Disabled"
                    disabled
                    onClose={noop}
                  />
                </Row>
                <Row label="Filled">
                  {TAG_COLORS.map((color) => (
                    <TagVariantComponent
                      key={color}
                      color={color}
                      text={color}
                      variant="filled"
                      data-testid={`tag-filled-${color.toLowerCase()}`}
                    />
                  ))}
                </Row>
                <Row label="Severity">
                  <SeverityTag severity="High" />
                  <SeverityTag severity="Medium" />
                  <SeverityTag severity="Low" />
                </Row>
              </Section>
            </div>
          </div>
        </main>
      </ThemeProvider>
    </RcThemeProvider>
  );
}

export default ComponentLibraryShowcase;
