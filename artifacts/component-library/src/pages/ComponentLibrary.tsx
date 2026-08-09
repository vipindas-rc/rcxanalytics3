import { useState } from 'react';
import { ThemeProvider } from 'styled-components';
// Juno ships types that don't resolve under bundler moduleResolution;
// runtime import works fine, so silence the declaration lookup.
// @ts-ignore -- see note above
import { RcThemeProvider } from '@ringcentral/juno';
import { theme, TagComponent, TagColor } from '@ringcx/ui';

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
              from the vendored source, along with the Severity pill recipe
              built on the same shape.
            </p>

            <div className="flex flex-col gap-6">
              <Section
                title="Tag"
                importPath='import { TagComponent, TagColor } from "@ringcx/ui"'
                description="A rounded, tinted label for categorical values, such as states, dispositions, and skills. Each color pairs a soft background with a matching text color. Use Tag when the value belongs to a small, fixed set and color adds meaning."
                propHighlights={[
                  'color: TagColor',
                  'text: string',
                  'bordered?',
                  'onClose?',
                  'onClick?',
                  'disabled?',
                  'shouldShowAlertIcon?',
                ]}
              >
                <Row label="All colors">
                  {TAG_COLORS.map((color) => (
                    <TagComponent key={color} color={color} text={color} />
                  ))}
                </Row>
                <Row label="Bordered">
                  {TAG_COLORS.map((color) => (
                    <TagComponent
                      key={color}
                      color={color}
                      text={color}
                      bordered
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
              </Section>

              <Section
                title="Severity (usage recipe)"
                importPath="custom pill — not a core component"
                description="A solid-fill pill for severity levels, matched to the reference design. The core Tag renders a soft tinted background with colored text, so a solid pill with white text is a custom recipe layered on the same shape. High is red, Medium is mustard, and Low is grey."
                propHighlights={[
                  'High: #D9364C',
                  'Medium: #B07B0A',
                  'Low: #757575',
                ]}
              >
                <Row label="Severity pills">
                  {(
                    [
                      ['High', '#D9364C'],
                      ['Medium', '#B07B0A'],
                      ['Low', '#757575'],
                    ] as const
                  ).map(([label, bg]) => (
                    <span
                      key={label}
                      className="inline-flex h-6 items-center rounded-full px-3 text-[13px] font-semibold text-white"
                      style={{ backgroundColor: bg }}
                      data-testid={`pill-severity-${label.toLowerCase()}`}
                    >
                      {label}
                    </span>
                  ))}
                </Row>
                <Row label="Tinted (core Tag) equivalent">
                  <TagComponent color={TagColor.Red} text="High" />
                  <TagComponent color={TagColor.Orange} text="Medium" />
                  <TagComponent color={TagColor.Grey} text="Low" />
                </Row>
                <Row label="Bordered (core Tag) equivalent">
                  <TagComponent color={TagColor.Red} text="High" bordered />
                  <TagComponent color={TagColor.Orange} text="Medium" bordered />
                  <TagComponent color={TagColor.Grey} text="Low" bordered />
                </Row>
                <Row label="Inverted (ringcx/ui colors)">
                  {(
                    [
                      ['High', '#C40C05'],
                      ['Medium', '#D3720E'],
                      ['Low', '#757575'],
                    ] as const
                  ).map(([label, bg]) => (
                    <span
                      key={label}
                      className="inline-flex h-6 items-center rounded-full px-3 text-[13px] font-semibold text-white"
                      style={{ backgroundColor: bg }}
                      data-testid={`pill-severity-inverted-${label.toLowerCase()}`}
                    >
                      {label}
                    </span>
                  ))}
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
