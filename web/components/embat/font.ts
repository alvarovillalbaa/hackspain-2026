import localFont from "next/font/local";

/** Inter Variable — UI copy in Figma (`Inter Variable Medium`). */
export const interVariable = localFont({
  src: "./fonts/InterVariable.woff2",
  variable: "--font-inter-variable",
  weight: "100 900",
  display: "swap",
});

/** Inter Display Medium — page titles in Figma (`Inter Display Medium`). */
export const interDisplay = localFont({
  src: "./fonts/InterDisplay-Medium.woff2",
  variable: "--font-inter-display",
  weight: "500",
  display: "swap",
});

/** CSS variables for both cuts. Put on `html` so portaled UI can resolve them. */
export const embatFontVars = `${interVariable.variable} ${interDisplay.variable}`;

/** Default Embat UI: Inter Variable. Also apply to portaled popovers/dialogs. */
export const embatUiClass = "embat-ui font-embat";

/** 20px titles: Inter Display. */
export const embatDisplayClass = "embat-display font-embat-display";

/** @deprecated Use `embatUiClass`. */
export const embatSans = interVariable;
