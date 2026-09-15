import type React from "react";
import "react";

declare module "react" {
  interface HTMLAttributes<T> {
    onPointerEnterCapture?: React.PointerEventHandler<T>;
    onPointerLeaveCapture?: React.PointerEventHandler<T>;
    placeholder?: string;
  }

  interface SVGAttributes<T> {
    onPointerEnterCapture?: React.PointerEventHandler<T>;
    onPointerLeaveCapture?: React.PointerEventHandler<T>;
  }
}