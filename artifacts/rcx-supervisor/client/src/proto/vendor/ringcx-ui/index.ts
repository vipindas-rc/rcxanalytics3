/* SLIM @ringcx/ui barrel — re-exports ONLY the symbols the Supervisor render
 * path uses, from their specific source modules. This avoids the full library's
 * `export *` (which in dev eagerly loads all 1,237 files incl. MUI-v4 date
 * pickers / ace-editor and triggers a circular React-interop crash).
 * The original full barrel is preserved at index.full.ts.bak. */

// --- GridList (the table engine) ---
export { GridList } from './components/GridList';
export { GL_CLASSES } from './components/GridList/constants';
export type {
  FiltrationCallback,
  RenderRowGroupData,
  RenderSubRowData,
  RenderRowsOneRowData,
} from './components/GridList/types';

// --- components ---
export { Button } from './components/Button';
export { Dialog } from './components/Dialog';
export { default as IconButton } from './components/IconButton';
export { Menu } from './components/Menu';
export { default as Popper } from './components/Popper';
export { SearchInput } from './components/Inputs/SearchInput';
export { SingleSelect } from './components/DropDown';
export { MultiSelect } from './components/DropDown';
export type { IMenuItem as IMultiSelectItem } from './components/DropDown/types/DropDown';
export type {
  DisplayVariantType,
  IMenuItem,
} from './components/DropDown/types/DropDown';
export { TextEclipse } from './components/TextEclipse';
export { default as TextOverflow } from './components/TextOverflow';
export { default as Tooltip } from './components/Tooltip';
export { TagComponent } from './components/Tag';
export { default as Spinner } from './components/Spinner';
export { default as Checkbox } from './components/Checkbox';
export { KEYBOARD_KEYS } from './constants/keyboard';
// Tag/Dot color enums are runtime values (not just types) so the showcase can
// enumerate them. Both modules are tiny and MUI-free.
export { TagColor } from './components/Tag/types';
export { TagColorScheme } from './components/Tag/constants';
// Styled primitives re-exported so shared Tag variants (e.g. the filled pill
// in the component library) inherit the core Tag shape/typography directly
// from Tag.styled.ts instead of duplicating its metrics.
export { TagBorder, TagText } from './components/Tag/Tag.styled';
export { DotColor } from './components/Dot/types';
export type { ITagProps } from './components/Tag/types';
export type { IDotProps, DotColorKeys } from './components/Dot/types';

// --- Chip / Badge / Dot (narrow re-exports from their specific modules only;
// the full-library barrel stays untouched to avoid the dev-mode eager-load
// circular crash) ---
export { default as Chip } from './components/Chip';
export type { IChipProps, ChipSize } from './components/Chip/types/ChipProps';
export { default as Badge } from './components/Badge';
export type { IBadgeProps } from './components/Badge/types/Badge';
export { Dot } from './components/Dot';

// --- helpers / utils (small, MUI-free modules: export * to cover the full set) ---
export { SortType } from './helpers/sorting/types';
export * from './helpers/accessibility/accessibility';
export * from './helpers/keyboard';

// --- theme (slim: avoids theme.ts's module-load MUI v4 crash) ---
export { theme } from './theme/theme.slim';
export { digitalColorMap } from './theme/colors';

// --- icons (all SVG components; MUI-free, safe to export *) ---
export * from './icons';
