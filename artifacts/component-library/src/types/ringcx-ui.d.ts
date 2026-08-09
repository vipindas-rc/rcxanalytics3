// Ambient types for the vendored RingCX UI slim barrel (aliased in
// vite.config.ts). The vendor tree lives in the rcx-supervisor artifact and is
// excluded from typechecking, so we declare only the symbols this app uses.
declare module '@ringcx/ui' {
  import type { ComponentType, ReactNode } from 'react';

  export const theme: Record<string, unknown>;

  export enum TagColor {
    Blue = 'BLUE',
    Green = 'GREEN',
    Turquoise = 'TURQUOISE',
    Purple = 'PURPLE',
    Orange = 'ORANGE',
    Red = 'RED',
    Grey = 'GREY',
  }

  export enum DotColor {
    Default = '#A1A1A1',
    Blue = '#4481EB',
    Green = '#25A73C',
    Turquoise = '#22C2D6',
    Purple = '#9C74FF',
    Yellow = '#F7B502',
    Orange = '#F6852E',
    Red = '#F0512A',
    Asphalt = '#212121',
    Grey = '#ABABAB',
  }

  export const TagColorScheme: Record<
    TagColor,
    { background: string; text: string; border: string }
  >;

  export const TagComponent: ComponentType<{
    color: TagColor;
    text: string;
    bordered?: boolean;
    disabled?: boolean;
    shouldShowAlertIcon?: boolean;
    onClose?: () => void;
    onClick?: () => void;
  }>;

  // Styled primitives from Tag.styled.ts (see the slim barrel) so shared
  // variants can inherit the core Tag shape/typography without duplication.
  export const TagBorder: ComponentType<{
    color: TagColor;
    bordered?: boolean;
    disabled?: boolean;
    eclipsable?: boolean;
    className?: string;
    children?: ReactNode;
    'data-testid'?: string;
  }>;

  export const TagText: ComponentType<{
    className?: string;
    children?: ReactNode;
  }>;

  export const Chip: ComponentType<{
    title: string;
    variant?: 'contained' | 'outlined';
    size?: 'medium' | 'small';
    disabled?: boolean;
    onClick: () => void;
    onClose: () => void;
  }>;

  export const Badge: ComponentType<{
    badgeContent?: number;
    max?: number;
    color?: string;
    verticalCenter?: boolean;
    children?: ReactNode;
  }>;

  export const Dot: ComponentType<{ color: DotColor }>;
}
