# Color token matrix

The typed registry has **53 tokens**. Each preset supplies every key; strict validation rejects extra or missing keys. Runtime CSS consumes `--store-<key>` and RGB-channel companions for alpha utilities. No input becomes an arbitrary CSS property.

| Group | Registry tokens | Customer application |
| --- | --- | --- |
| Canvas and content | `pageBg`, `surface`, `card`, `text`, `secondaryText`, `disabledText` | Customer wrapper, surfaces/cards and content utilities |
| Primary CTA | `primary`, `primaryHover`, `primaryPressed`, `primaryText`, `focus`, `disabled` | Shared default Button, PDP buy CTA and focus/disabled state |
| Secondary / outline | `secondary`, `secondaryHover`, `secondaryPressed`, `secondaryForeground`, `outline`, `outlineHover`, `outlinePressed`, `outlineText` | Shared scoped Button variants and outlined controls |
| Accent | `accent`, `accentHover`, `accentPressed`, `accentForeground` | Accent Button variant and preview state sample |
| Links / controls | `link`, `linkHover`, `linkPressed`, `border`, `icon`, `field`, `fieldText` | Body links, field surfaces, control border and content icons |
| Shell | `header`, `headerText`, `footer`, `footerText`, `nav`, `navText`, `navActive`, `navActiveText` | Storefront/checkout header, storefront footer, bottom navigation |
| Commerce / feedback | `badge`, `badgeText`, `promo`, `promoText`, `price`, `discount`, `info`, `warning`, `error`, `success`, `selected`, `selectedText`, `modal`, `modalText` | Badge, flash promo, product price/discount, semantic feedback, selected PDP pill, in-wrapper dialogs |

## Gradient targets

| Target | Surface | Foreground / fallback |
| --- | --- | --- |
| hero | Shared hero container/image overlay | Bounded generated gradient; imagery has no theme text overlay |
| promo | Home flash-sale / preview promo | Explicit gradient foreground and fallback |
| buttons | Default CTA and PDP purchase button | Explicit gradient foreground; safe normal hover/pressed states |
| header / footer | Customer shell | Explicit gradient foreground and fallback |
| highlightCard | Product cards | Explicit gradient foreground and fallback |

Linear only,2–4 ascending stops,0/100 endpoints, integer angle0–360. Contrast checks every stop plus11 evenly spaced samples and solid fallback. No user `url()`, CSS text or style attribute is accepted.

## Contrast and compatibility

Normal text/labels and button states require4.5:1. Focus/control/icon pairs require3:1. The validator enumerates foreground/background pairs and reports each failing token pair. Presets generate light/dark foregrounds and bounded hover/pressed colors and are unit tested in full.

Legacy default intentionally keeps the previous link/focus blue, muted gray and border values and does not activate the override stylesheet. Publishing legacy unchanged fails AA checks. Explicit rollback to revision0 is the documented compatibility exception.

## Audit exceptions and isolation

Physical SKU swatch colors, product photography, third-party imagery, legal contents and stored order snapshots are not theme values. Customer business calculations/handlers are unchanged. Auth/legal and admin shared component colors stay outside the customer wrapper. Preview uses synthetic component content and cannot place orders.

Product-card prices and badges have explicit semantic attributes. Existing utility-based surfaces/text/borders are mapped only beneath an active customer wrapper. PDP selectors override its local constants while legacy remains intact. Portal content outside that wrapper is not automatically themed; current audited customer dialogs are in-wrapper. New customer components must use the registry/semantic attributes and extend contrast/evidence tests.

## Evidence requirements

See VERIFICATION.md for the actual command results and baseline comparison conditions. A complete visual audit of every arbitrary content/imagery combination is not implied by schema or contrast tests.
