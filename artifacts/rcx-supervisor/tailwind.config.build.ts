import tailwindcssAnimate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";
import browserSafeConfig from "./tailwind.config";

export default {
  ...browserSafeConfig,
  plugins: [tailwindcssAnimate, typography],
};