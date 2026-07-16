**Comparison target**

- Source visual truth: `output/playwright/internal-cs-chat/reference.png`
- Latest desktop implementation: `output/playwright/internal-cs-chat/final-desktop-review.png`
- Latest mobile implementation: `output/playwright/internal-cs-chat/final-mobile-chat.png`
- Viewport: 1536 × 1024 desktop, 390 × 844 mobile
- State: refund-policy conversation selected; desktop review drawer open; mobile review drawer closed after its open state was separately tested
- Route: `/admin/cs-chatbot`

**Findings**

- No actionable P0/P1/P2 design differences remain.
- [P3] The implementation uses a 64px dark header and slightly denser small-label typography than the source visual. This preserves more vertical room for live conversation content and remains consistent with the repository's admin typography.
- [P3] The source includes a notification bell and decorative review-row chevrons. The implementation omits those non-core controls and uses the existing Lucide icon family so every visible primary control has a real action.

**Required fidelity surfaces**

- Fonts and typography: the same Korean-first sans-serif hierarchy is preserved. Headings, navigation labels, metadata, body copy, textarea copy, wrapping, and muted states remain legible at both tested viewports.
- Spacing and layout rhythm: the final desktop build matches the source's full-screen shell, left-aligned 820px conversation column, 438px review drawer, full-width composer, tab rhythm, restrained radii, 1px borders, and minimal elevation. The mobile toolbar wraps without horizontal page overflow.
- Colors and visual tokens: the dark charcoal header, white working canvas, Classin deep green accents, pale green support surfaces, warm review-warning state, and repository border token are preserved.
- Image and asset fidelity: the target contains no photographic or illustrative asset. All interface icons use Lucide rather than handcrafted SVG, CSS art, emoji, or placeholder imagery.
- Copy and content: the selected refund-policy scenario, internal-only caveat, evidence disclosure, HQ template, regression action, human-review checklist, and approval wording are represented with realistic Korean CS copy.

**Full-view comparison evidence**

- Desktop source and final implementation were opened together at 1536 × 1024 with the review drawer open.
- The final composition preserves the source hierarchy: dark identity bar → primary tabs → conversation toolbar → single chat canvas and sticky composer → optional right review drawer.
- The implementation intentionally adds an `운영 도구` tab to connect existing admin functions without duplicating their mutation controls.

**Focused-region comparison evidence**

- A separate crop was not required because the 1536 × 1024 captures keep the toolbar, conversation cards, disclosures, review checklist, final-answer field, and approval buttons readable in the same comparison input.
- The 390 × 844 capture was inspected separately for toolbar wrapping, message-card width, composer persistence, drawer width, and control clipping.

**Comparison history**

1. Earlier finding [P1]: the global admin sidebar remained visible and reduced the CS workspace width compared with the supplied full-screen concept.
   Fix: changed the CS workspace to a route-local full-screen shell while preserving navigation through the `운영 도구` tab.
   Post-fix evidence: `output/playwright/internal-cs-chat/iteration-1-fullscreen.png`.
2. Earlier finding [P2]: the first review drawer overlaid the centered conversation column, clipping message and composer content; it was also 390px instead of the source's approximately 438px.
   Fix: widened the drawer to 438px and reserved that width in the conversation workspace while the drawer is open; left-aligned the message column and expanded the composer within the remaining canvas.
   Post-fix evidence: `output/playwright/internal-cs-chat/final-desktop-review.png`.
3. Earlier finding [P2]: the floating archive action overlapped the mobile composer.
   Fix: removed the floating archive action below the small breakpoint; archive remains available through the dedicated tab and desktop conversation action.
   Post-fix evidence: `output/playwright/internal-cs-chat/final-mobile-chat.png`.

**Primary interactions tested**

- Conversation, queue, archive, and operating-tools tab changes
- Review drawer open and close on desktop and mobile
- Three mandatory human-review checks and disabled/enabled approval state
- Approval result locking, local copy confirmation, and no automatic external send
- Existing admin destination hrefs for docs gaps, recommended questions, Channel Talk, chatbot operations, canonical docs, and integrations
- 1536 × 1024 and 390 × 844 responsive states

**Console and runtime notes**

- Browser console was checked. The only error is the expected local `503` from the new conversation list endpoint while the database migration is not applied; development mode switches to deterministic preview data. This is an environment setup condition, not a visual or interaction defect. Production does not enable preview fallback.

**Implementation checklist**

- [x] Match the selected full-screen minimal shell.
- [x] Keep queue, archive, review, evidence, HQ template, and regression actions usable.
- [x] Keep final approval with the CS operator.
- [x] Connect existing admin chatbot operations without duplicating publish/sync/reindex authority.
- [x] Verify desktop and mobile primary flows.

**Follow-up polish**

- Consider restoring a real notification entry in the dark header only if the admin notification surface gets a stable destination route.

final result: passed
