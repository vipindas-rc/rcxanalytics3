import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import Tag from "./vendor/ringcx-ui/components/Tag/Tag";
import { TagColor } from "./vendor/ringcx-ui/components/Tag/types";
import { Autocomplete as RingCxAutocomplete } from "./vendor/ringcx-ui/components/form/Autocomplete";
import RingCxButton from "./vendor/ringcx-ui/components/Button/Button";
import RingCxDialog from "./vendor/ringcx-ui/components/Dialog/Dialog";
import {
  CONVERSATION_CATEGORIES,
  type ConversationCategory,
} from "./claimedDigitalStore";

// ---------------------------------------------------------------------------
// Active messages dialogs — Recategorize thread (searchable, removable
// category chips) and End message (required disposition + optional notes).
// Both close on Escape and on Cancel without committing draft state.
// ---------------------------------------------------------------------------

function DialogShell({
  title,
  onClose,
  children,
  testId,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  testId: string;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid={testId}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex w-[440px] max-w-[92vw] flex-col rounded-lg bg-white shadow-xl outline-none"
      >
        <div className="flex items-center justify-between border-b border-[#0000001a] px-5 py-3.5">
          <span className="font-['Roboto',sans-serif] text-[16px] font-semibold text-[#121212]">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded text-[#666666] hover:bg-[#f2f2f2]"
            data-testid="button-close-dialog"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Categorize dialog — matches the RingCX agent "Categorize" design:
// bold title + X, "Categories" label above a ringcx/ui multi-select
// autocomplete (chips, clear ×, dropdown arrow, grouped options), an
// optional conversation comment, and a primary Save button.
const LANGUAGE_LABELS = new Set(["English", "Russian", "русский (Russian)"]);

// Same TagColor per hex as the table's Categories column (CATEGORIES_MAP).
const HEX_TO_TAG_COLOR: Record<string, TagColor> = {
  "#c40c05": TagColor.Red,
  "#9b45a0": TagColor.Purple,
  "#066fac": TagColor.Blue,
  "#2e7d32": TagColor.Green,
  "#b26205": TagColor.Orange,
  "#0a7f8c": TagColor.Turquoise,
};

const tagColorFor = (label: string): TagColor =>
  HEX_TO_TAG_COLOR[
    CONVERSATION_CATEGORIES.find((c) => c.label === label)?.color ?? ""
  ] ?? TagColor.Grey;

const CATEGORY_OPTIONS = CONVERSATION_CATEGORIES.map((c) => ({
  id: c.label,
  label: c.label === "Russian" ? "русский (Russian)" : c.label,
  groupName: LANGUAGE_LABELS.has(c.label) ? "Language" : "Topic",
}));

export function RecategorizeDialog({
  current,
  onCancel,
  onSave,
}: {
  current: ConversationCategory[];
  onCancel: () => void;
  onSave: (categories: ConversationCategory[]) => void;
}): JSX.Element {
  const [selectedIds, setSelectedIds] = useState<(string | number)[]>(
    current.map((c) => c.label),
  );
  const [comment, setComment] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const handleSave = () => {
    const categories = CONVERSATION_CATEGORIES.filter((c) =>
      selectedIds.includes(c.label),
    );
    onSave(categories);
  };

  return (
    <div ref={ref} data-testid="dialog-recategorize">
      <RingCxDialog
        open
        onClose={onCancel}
        maxWidth="xs"
        style={{ zIndex: 10050 }}
        dialogTitle="Categorize"
        closeButtonText="Close"
        actions={
          <RingCxButton
            onClick={handleSave}
            color="primary"
            variant="contained"
            data-testid="button-save-recategorize"
          >
            Save
          </RingCxButton>
        }
        content={
          <div className="flex w-[380px] max-w-full flex-col">
            {/* The vendor Autocomplete pins its popper at the MUI modal
                z-index and its dropdown arrow at the input's top; both need
                overrides while this dialog sits above the phone window. */}
            <style>{`
              .MuiAutocomplete-popper { z-index: 10060 !important; }
              [data-testid="input-categories"] .MuiAutocomplete-endAdornment {
                top: 50% !important;
                transform: translateY(-50%) !important;
              }
            `}</style>
            <span className="mb-1.5 block font-['Roboto',sans-serif] text-[14px] text-[#494949]">
              Categories
            </span>
            <div data-testid="input-categories">
              <RingCxAutocomplete
                multiple
                data={CATEGORY_OPTIONS as any}
                value={selectedIds as any}
                onChange={((ids: (string | number)[]) =>
                  setSelectedIds(ids ?? [])) as any}
                groupBy={(option: any) => option.groupName}
                disableClearable
                blurOnSelect={false}
                filterSelectedOptions
                renderTags={((value: any[], getTagProps: any) =>
                  value.map((option, index) => {
                    const { key, onDelete } = getTagProps({ index });
                    return (
                      <span
                        key={key}
                        className="mx-0.5 my-0.5 inline-flex"
                        data-testid={`chip-category-${String(option.id).toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        <Tag
                          text={option.label}
                          color={tagColorFor(String(option.id))}
                          onClose={() => onDelete({})}
                        />
                      </span>
                    );
                  })) as any}
                name="categories"
                onBlur={() => undefined}
                ref={null as any}
              />
            </div>
            <label
              htmlFor="conversation-comment"
              className="mb-1.5 mt-4 block font-['Roboto',sans-serif] text-[14px] text-[#494949]"
            >
              Add a conversation comment
            </label>
            <textarea
              id="conversation-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="w-full resize-none rounded border border-[#c7c7c7] px-3 py-2 font-['Roboto',sans-serif] text-[14px] text-[#121212] outline-none focus:border-[#066fac]"
              data-testid="input-conversation-comment"
            />
          </div>
        }
      />
    </div>
  );
}

const DISPOSITIONS = [
  "Resolved",
  "Follow-up needed",
  "Escalated",
  "Transferred",
  "Spam",
];

export function EndMessageDialog({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (disposition: string, notes: string) => void;
}): JSX.Element {
  const [disposition, setDisposition] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState(false);

  return (
    <DialogShell
      title="End message"
      onClose={onCancel}
      testId="dialog-end-message"
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        <fieldset>
          <legend className="mb-1.5 font-['Roboto',sans-serif] text-[12px] font-medium text-[#666666]">
            Disposition (required)
          </legend>
          <div className="flex flex-col gap-1">
            {DISPOSITIONS.map((d) => (
              <label
                key={d}
                className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 font-['Roboto',sans-serif] text-[13px] text-[#121212] hover:bg-[#f9f9f9]"
              >
                <input
                  type="radio"
                  name="disposition"
                  value={d}
                  checked={disposition === d}
                  onChange={() => {
                    setDisposition(d);
                    setError(false);
                  }}
                  className="h-4 w-4 accent-[#066fac]"
                  data-testid={`radio-disposition-${d.toLowerCase().replace(/\s+/g, "-")}`}
                />
                {d}
              </label>
            ))}
          </div>
          {error ? (
            <span
              role="alert"
              className="mt-1.5 block font-['Roboto',sans-serif] text-[12px] text-[#c40c05]"
              data-testid="error-disposition-required"
            >
              Select a disposition to end this message.
            </span>
          ) : null}
        </fieldset>
        <div>
          <label
            htmlFor="disposition-notes"
            className="mb-1.5 block font-['Roboto',sans-serif] text-[12px] font-medium text-[#666666]"
          >
            Notes (optional)
          </label>
          <textarea
            id="disposition-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Add any notes about this conversation"
            className="w-full resize-none rounded border border-[#c7c7c7] px-3 py-2 font-['Roboto',sans-serif] text-[13px] text-[#121212] outline-none focus:border-[#066fac]"
            data-testid="input-disposition-notes"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-[#0000001a] px-5 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="h-8 rounded border border-[#c7c7c7] px-3.5 font-['Roboto',sans-serif] text-[13px] font-medium text-[#121212] hover:bg-[#f9f9f9]"
          data-testid="button-cancel-end-message"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            if (!disposition) {
              setError(true);
              return;
            }
            onSubmit(disposition, notes);
          }}
          className="h-8 rounded bg-[#c40c05] px-3.5 font-['Roboto',sans-serif] text-[13px] font-medium text-white hover:bg-[#a30a04]"
          data-testid="button-submit-end-message"
        >
          Submit
        </button>
      </div>
    </DialogShell>
  );
}
