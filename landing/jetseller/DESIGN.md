---
name: Buat Toko Online Sendiri — Landing and Registration
description: Code-derived record of the preserved landing identity and its four-step registration surface.
colors:
  primary: "#E1251B"
  white: "#fff"
  landing-ink: "#131722"
  landing-muted: "#5e6876"
  landing-line: "#e9edf1"
  landing-red-dark: "#bd1712"
  form-ink: "#20232b"
  form-muted: "#626873"
  form-line: "#e5e7eb"
  field-line: "#ccd0d6"
  form-red-hover: "#c91e15"
  form-focus: "#a41a13"
  form-error: "#ad1b12"
  form-error-background: "#fff2f1"
  step-complete-background: "#fff0ef"
  step-complete-ink: "#a61b13"
  code-background: "#f6f7f8"
typography:
  landing-display:
    fontFamily: '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'
    fontSize: "clamp(2.35rem, 4.25vw, 3.62rem)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-.052em"
  form-headline:
    fontFamily: '"Plus Jakarta Sans", sans-serif'
    fontSize: "clamp(28px, 4vw, 38px)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-.035em"
  form-title:
    fontFamily: '"Plus Jakarta Sans", sans-serif'
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-.025em"
  form-body:
    fontFamily: '"Plus Jakarta Sans", sans-serif'
    fontSize: "14px"
    lineHeight: 1.7
  form-label:
    fontFamily: '"Plus Jakarta Sans", sans-serif'
    fontSize: "14px"
    fontWeight: 600
  form-hint:
    fontFamily: '"Plus Jakarta Sans", sans-serif'
    fontSize: "12px"
    lineHeight: 1.6
rounded:
  form-control: "10px"
  landing-button: "12px"
  landing-card: "18px"
  form-card: "22px"
  form-card-mobile: "18px"
  circle: "50%"
spacing:
  hint-gap: "8px"
  summary-gap: "24px"
  mobile-summary-gap: "18px"
  form-action-gap: "14px"
  form-action-top: "30px"
components:
  form-button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.white}"
    rounded: "{rounded.form-control}"
    padding: "13px 22px"
  form-button-primary-hover:
    backgroundColor: "{colors.form-red-hover}"
  form-button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "#373c45"
    rounded: "{rounded.form-control}"
    padding: "13px 22px"
  form-field:
    backgroundColor: "{colors.white}"
    textColor: "{colors.form-ink}"
    rounded: "{rounded.form-control}"
    padding: "13px 15px"
    width: "100%"
  form-card:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.form-card}"
    padding: "36px 40px"
  step-current:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.white}"
    rounded: "{rounded.circle}"
    width: "32px"
    height: "32px"
---

# Design System: Buat Toko Online Sendiri

## Overview

**Creative North Star: "Buat Toko Online Sendiri"**

This is a descriptive record of the existing implementation, not a new creative direction. The user's fixed identity is white with red actions and Plus Jakarta Sans. The landing keeps its established spacious composition, rounded cards, subtle grid and red-tinted depth. Registration applies the same identity to a focused form with restrained borders and a visible sequence of steps.

Scope is `landing/jetseller` only. The older documents in `platform/installer-web` describe another product surface and do not govern these routes. `main.css` followed by `refactor.css` governs the homepage; `registration.css` governs registration, guide and privacy pages. These stylesheet scopes intentionally have distinct neutral values and control dimensions; documenting them does not authorize global normalization.

**Key Characteristics:**

- White ground, red action emphasis, dark text and muted supporting copy.
- Plus Jakarta Sans throughout the public interface.
- Preserved landing composition; focused four-step form in a bounded card.
- Explicit current, completed, error, focus and saved states.

## Colors

The shared red carries identity and action; route-specific neutrals separate information without introducing another accent palette.

### Primary

`primary` is the brand red. Registration uses a solid primary button, darker hover, darker keyboard focus, and pale completed-step fill. Error ink and error backgrounds belong to validation, not decoration. The landing's existing primary-button gradient (`linear-gradient(145deg,#f22626,#de0813)`) and CTA gradient (`linear-gradient(120deg,#ec0b17,#c70918)`) remain local treatments, not replacements for the solid form accent.

### Neutral

The `landing-*` neutral tokens describe the homepage after its scoped overrides. The `form-*` neutrals describe registration and supporting articles. White remains the page and form-card background; field borders are stronger than card dividers. Code blocks use `code-background` for a quiet inset surface.

## Typography

The local Plus Jakarta Sans variable font is served from `assets/fonts/plus-jakarta-sans-latin.woff2`. Landing and registration retain their source fallback stacks. Bold headlines, medium labels and smaller muted hints make the sequence readable without uppercase display treatments.

Frontmatter records the desktop hierarchy. Below the registration mobile breakpoint, the page heading becomes 28px, form titles 23px, introduction text 13px and action labels 13px. Fields remain 15px. Landing has its own responsive display clamps, preserved in `refactor.css`; do not apply the form heading scale to its hero. Reference codes and shell commands retain code typography.

## Layout

Landing uses a centered `min(1200px, 100% - 48px)` container, with the existing small-screen gutter override, two-column desktop hero, three feature cards, five instructional cards, FAQ, CTA and footer. At 900px the hero stacks and its copy centers; at 600px copy becomes left aligned and feature cards stack. The instructional grid changes from five columns to three at 1100px and one at 700px. The form's four progress steps must not replace these five marketing instructions.

Registration has a header up to 1160px wide and a centered shell up to 840px wide including padding. Shell padding is 46px 24px 40px; the card uses the frontmatter padding. At 600px and below, header padding is 18px 20px, shell padding 32px 16px, and card padding 27px 22px. Step labels sit below their numbered circles. Confirmation summaries collapse from two columns to one. The primary form action expands into remaining mobile width; final guide actions stack full width.

Content wraps naturally. Receipt values and summaries allow arbitrary long strings to wrap. Guide commands use `white-space:pre-wrap` and `overflow-wrap:anywhere`. Form controls have a minimum height of 50px, buttons 48px, and checkbox/link action rows generally 44px.

## Elevation & Depth

The preserved landing combines pale gradients, a masked grid, illustration depth and soft red button shadows. Registration relies mainly on white space and borders, with a very light card shadow (`0 12px 36px #21263106`). The sidecar records shadow and motion values outside the frontmatter schema. Registration does not inherit the landing grid or large promotional gradients.

## Shapes

Rounded rectangular cards and controls establish continuity. Registration has larger card corners than its fields and buttons; mobile reduces the card radius. Numbered step circles are the compact progress signature. Keep the existing red outline storefront/check illustration on the saved state and the current self-hosted illustration in the landing hero. Decorative illustration content is not evidence of a live account or installed store.

## Components

### Buttons

Registration primary buttons are solid red with white labels. Secondary buttons are white with a gray border and dark labels. Disabled submission controls fade to 65% opacity and use a wait cursor. The form's keyboard focus is an offset outline, retained on links and controls. Landing button gradients, shadows and hover lift remain scoped to the homepage.

### Inputs / Fields

Persistent labels precede each native input, select or textarea; required and optional marks are text, not color alone. Focus changes the border to red and preserves the visible outline. Validation adds a darker red border and linked text. The no-domain checkbox clears and disables its domain field, which uses a muted background. Description length is visible beneath its textarea.

### Cards / Containers

One form card holds steps one through three; a second card replaces it after a valid saved receipt. A top-level error summary can precede the current section. Confirmation places seller and store summaries side by side on wider screens, each with an explicit edit action. Article notices and command blocks remain visually subordinate.

### Navigation

The landing keeps its sticky section navigation and small-screen menu. Registration uses a compact two-line wordmark/home link and a public guide link, not the landing navigation bar. Preserve skip links, heading focus targets and visible keyboard focus.

### Four-step progress and saved receipt

The labels are Isi Data, Info Toko, Konfirmasi and Panduan. `aria-current="step"` marks the active circle; prior circles use pale red completion styling. Forward movement validates the active section, backward/edit movement retains entered values in memory, and the heading receives focus. The short entry transition runs only when reduced motion is not requested. Step four represents a saved registration and guide, never installation completion.

## Do's and Don'ts

### Do:

- **Do** preserve the existing landing composition, assets and route-specific styles while extending registration.
- **Do** keep the white/red identity and local Plus Jakarta Sans font.
- **Do** retain visible focus, associated errors, readable wrapping and reduced-motion behavior.
- **Do** identify the saved state as registration and keep the installation guide publicly accessible.

### Don't:

- **Don't** turn this form addition into a landing redesign or normalize its neutral and radius differences unasked.
- **Don't** use a receipt, illustration or completed progress step to imply installation or production readiness.
- **Don't** introduce central account, login, OTP, pairing, agent or dashboard controls into this public flow.
- **Don't** claim reference-image fidelity: no approved external reference or comp was supplied.
