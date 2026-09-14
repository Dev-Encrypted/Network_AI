# Private application interface design

The interface is a workspace for consuming inference and inspecting contribution, with the active conversation as the main task. Route and session indicators follow actual observed states. Hypothetical network totals and decorative commercial metrics do not appear as live data.

## Visual system

The palette uses navy ink `#172A43`, cool paper `#F5F8FC`, white surfaces `#FFFFFF`, blue actions `#365CC9`, operational green `#18786E`, and amber attention `#AD620D`. IBM Plex Sans supports reading and navigation; IBM Plex Mono is reserved for technical values and code. Fonts are served locally.

The desktop layout has a narrow navigation area, a broad conversation area, and optional route context. Catalog and session records use comparable rows. Forms have their own panels and explicit actions. On smaller screens, navigation and content adapt without requiring horizontal page scrolling.

## Behavior and accessibility

Visible focus, useful empty states, descriptive controls and clear terminal reasons matter more than decorative motion. Model output is rendered as content rather than executable HTML. Logout clears the conversation and fences delayed responses belonging to the previous authentication state.

The private acceptance campaign included desktop/mobile visual inspection and automated accessibility checks on authenticated chat. The report records zero violations for that automated page scope, not full WCAG certification. [Validation scope](STATUS.md).

## Language and product scope

The current interface is Brazilian Portuguese. Maintained public GitHub documentation is English, and the [beginner guide](../GETTING_STARTED.md) translates navigation labels. A future UI localization change should preserve authorization, persisted preference, fallbacks and actual browser behavior.

The interface must continue to distinguish current local capabilities from the network's intended models-above-27B distributed service. A catalog row or topology drawing cannot stand in for a qualified route.
