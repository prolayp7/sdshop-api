# Homepage Modules Recommendation

## Goal

Keep the BYTEVEX homepage focused on helping shoppers find the right product
quickly. Prioritise useful catalogue entry points and trustworthy product
information over repeated search prompts and generic promotional content.

## Current homepage review

Reviewed the rendered homepage on 7 October 2026 and compared it with the
storefront's homepage implementation and product brief. This is a content and
module recommendation, not confirmation that the displayed catalogue data,
prices, policies or compatibility claims are accurate.

| Module | What is present now | Recommendation |
| --- | --- | --- |
| Hero | Rotating storage-focused hero with two actions, including a device finder. | **Keep**, but give one action clear priority. Leave general product search in the header. Keep claims and product artwork tied to verified products and specifications. |
| Device discovery | Six device-category tiles appear before the card-type section. A second camera/drone search form with overlapping quick links appears below featured products. | **Consolidate.** Keep one concise device/model discovery path; remove the repeated prompt and quick links. Place it after the product-format entry point. Call it compatibility matching only if verified device-to-product data powers it. |
| Card types | Four cards: SD, microSD, CFexpress and card readers. | **Keep** as the primary catalogue navigation and place it directly after the hero. Confirm each destination resolves to the corresponding stocked range. The current cards do not include general storage accessories, so do not imply that they do. |
| Featured products | Four live products show names, prices and stock status; format filters are present. Capacity/speed and review ratings are not shown as product-specific decision details. In the reviewed render, the product labels/artwork and linked product names did not consistently describe the same item. | **Keep only after validating product-to-card data.** Use real product-specific names, images, capacity, speed class, price and stock. Add a rating only when backed by published customer reviews. Do not label the set “best sellers” unless sales data supports that ranking. |
| Guides and editorial | Several separate groups cover guides, editorial topics and the knowledge hub; some links lead to the same blog destination. | **Reduce to one curated guide module** with useful, working article links. Move the remaining technical education to the guide pages. |
| Workflow and testimonial-style content | A workflow-support band and a “Real workflows” section with general audience descriptions. | **Remove or defer** unless these sections contain distinct, evidenced value. Do not present generic copy as customer testimonials or proof. |
| FAQs and reassurance | Four detailed homepage FAQ answers make specific warranty, collection/replacement, compatibility-exchange and tax-invoice promises. There is no concise, dedicated reassurance strip; the closing strip is navigation advice. | **Verify or remove the policy claims before publication.** Surface only confirmed delivery, returns, warranty and support facts in a short strip. Keep detailed support answers on the help page; show a homepage FAQ only for a frequent purchase question with an approved, accurate answer. |
| Brand and market | The page presents BYTEVEX branding and ₹ prices. | **Confirm before launch.** The storefront brief leaves the brand identity undecided and describes a UK retailer; use approved brand assets and the correct market currency. |

## Recommended order

1. **Hero with a clear shopping action**  
   State what the store sells and provide one primary action. Keep general
   product search available in the site header; avoid competing hero actions.

2. **Shop by card type**  
   Keep a compact grid for **SD cards**, **microSD cards**, **CF/CFexpress
   cards**, and **card readers**, provided each is a real, available catalogue
   range. Link each card to its matching category. Keep accessories separate
   unless they are a meaningful, stocked range.

3. **Find by device or camera model**  
   Keep one device/model search for shoppers who do not know the required
   format. Claim compatibility matching only when verified device-to-product
   data powers the results; otherwise, describe it as a catalogue search aid.

4. **A small product selection**  
   Show a few real featured products or best sellers. Include product-specific
   capacity, speed class, price and stock status. Show a rating only when it is
   backed by published customer reviews; call products “best sellers” only when
   sales data supports that label. Ensure each image and specification belongs
   to the linked product.

5. **Brief reassurance strip**  
   Show only confirmed information about delivery, returns, warranty or support.
   Keep it to a short strip rather than a full-width promotional section.

## Conditional modules

- **Deals and offers:** show only when there are current, meaningful offers.
- **One buying guide:** retain a single curated guide module if it answers a
  common buying question, such as speed classes or card/device compatibility.
  Keep the full guide on its own page and use working, distinct article links.
- **FAQs:** keep detailed answers on a help page. Surface only a short,
  verified answer to a frequent purchase concern.

## Keep the homepage concise

Keep one path for each task: browse by product type, search by device, and
compare a small product selection. Avoid repeating finder prompts, stacking
guide/editorial grids, or adding generic workflow and testimonial-style
sections without verified content. Move detailed technical education and
support content to the pages designed for them.

## Scope note

This recommendation follows the SD/microSD/CF-card requirements in
[`requirement.md`](./requirement.md), and the reviewed homepage is primarily
storage-media focused. However, the storefront product brief
[`PRODUCT.md`](../../sdshop/PRODUCT.md) defines a broader UK computer and
component retailer, and leaves real catalogue data, ratings, brand identity,
delivery and returns policies, and warranty terms undecided. The rendered ₹
prices also need to be reconciled with that UK-market brief. Resolve which
catalogue and market are intended before finalising homepage categories. If the
broader range is the target, adapt the entry points to its product families and
buyer tasks rather than mixing computer-hardware and memory-card scopes. Until
real data, brand assets and policies are confirmed, treat rendered products and
claims as placeholders, not evidence.

## Recent visual refinements (developer notes)

- Today's Best Deals header: typography and sizing were aligned to match the
  "Shop by card type" heading. The deals heading now uses the same responsive
  clamp() sizing and typographic scale to preserve visual hierarchy across
  breakpoints.

- Heading geometry and rule alignment: the decorative SVG curve, the blue
  horizontal rule, and the heading background were tuned in CSS to align the
  rule baseline with the SVG lower edge and to avoid overlap at common
  breakpoints.

- Border artifact: a non-destructive mask approach was tried to hide a small
  top-right 1–2px vertical seam that appeared in some device-pixel-ratio and
  zoom combinations. The current implementation preserves the native right and
  bottom borders while attempting to conceal the seam with a white pseudo
  element. This works in many cases but may show a sliver on some DPR/zoom
  combinations due to subpixel anti-aliasing.

- Files changed (dev):
  - `sdshop/src/designs/bytevex/home.module.css` — updated `.dealsHeading` to
    match card-type heading sizing/scale, removed conflicting small-breakpoint
    font overrides, and retained the tuned SVG/rule alignment and the mask
    pseudo-element attempts.
  - `sdshop/src/designs/bytevex/TodaysBestDeals.tsx` — reviewed: no SVG
    geometry edits were applied (shape preserved).

- Next steps and choices (pick one):
  1. Keep the current mask approach (least invasive). After selecting this,
     a DPR/zoom screenshot sweep is recommended (DPR 1/2/3 and 125% zoom) to
     confirm the seam is gone in all target environments.
  2. Replace the mask with a clip-path covering the top-right corner for a
     more robust, CSS-only mask that preserves shapes without editing the SVG.
  3. Edit the SVG to remove the short vertical stroke entirely (most robust,
     modifies the supplied shape). This requires approval to change artwork.

If you want a follow-up change, specify which option to apply and the
prioritised device/viewport set for the visual verification sweep. If you are
happy with the visual parity of the headings and the other homepage changes,
this document is now updated to reflect the implementation and recommended
next action.
