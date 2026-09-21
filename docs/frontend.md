# Frontend

Next.js 16 App Router, React 19 with the React Compiler on, Tailwind CSS 4, Radix
primitives for anything with real interaction semantics.

## Routes

| Route | Rendering | What it is |
| --- | --- | --- |
| `/` | static | Redirects to `/kits` |
| `/login`, `/register` | static shell | The same form component in two modes |
| `/kits` | static shell, client data | The kit list |
| `/kits/new` | static shell, client data | One role, or a file of them |
| `/kits/[id]` | dynamic | The builder |
| `/kits/[id]/practice` | dynamic | A practice session |
| `/api/auth/[...nextauth]` | route handler | NextAuth |
| `/backend/[...path]` | route handler | The authenticated forwarder to the API |

`proxy.ts` (Next 16's rename of middleware) guards everything except `/backend`,
`/api` and static assets. Signed out anywhere private redirects to
`/login?next=<path>`; signed in on `/login` or `/register` redirects to `/kits`. The
guard is a convenience — the API enforces authorisation regardless.

## Component layers

```
components/ui/         primitives. Know nothing about kits.
  button, field, card, badge, feedback, overlays, tabs, menu, theme-toggle
components/kits/       feature components. One panel per builder tab.
components/practice/   the practice session
components/            app-shell, providers
```

A primitive never imports a feature component, and a feature component never reaches
into another feature's internals. The only shared state is the React Query cache.

## State

**Server state is React Query.** There is no client store. A kit has exactly one source
of truth — `queryKeys.kit(id)` — and every mutation writes the server's response back
into it.

**Every edit is optimistic.** `useKitMutation` snapshots the cache, applies a local
patch, fires the request, and rolls back on failure:

```ts
onMutate:   cancel in-flight reads, snapshot, apply the optimistic patch
onError:    restore the snapshot
onSuccess:  write the server's authoritative kit
```

**Text edits are debounced, not per-keystroke.** `InlineEditable` keeps a local draft,
saves 700 ms after typing stops, and also saves on blur. It stops syncing from the
server while focused, so an in-flight response cannot yank text out from under the
cursor. A small "Saved" marker appears for 1.6 seconds, which is the only feedback that
is needed.

**Generation progress is a stream.** `useKitProgressStream` opens an `EventSource` only
while a kit is `queued` or `running`, pushes each event into the cached detail, and
invalidates on a terminal status. Because the API also persists events, a reload
mid-generation replays what was missed rather than showing an empty timeline.

**Polling is scoped.** The list refetches every five seconds only while at least one kit
is still generating, and stops on its own.

## Reordering

`@dnd-kit` with pointer and keyboard sensors, restricted to the vertical axis and the
parent container.

Questions are grouped by category but stored in one array. Dragging inside a group
reorders only that group's ids, then rebuilds the global order by walking the original
array and substituting the reordered ids at the positions that category already
occupied. Every other category keeps its exact place.

Moving a question **between** categories is a menu action, not a cross-list drag. It is
faster with a mouse, it works with a keyboard, and it avoids the ambiguity of "where in
the target list does this land".

## Accessibility

- Radix underneath the dialog, tabs, dropdown menu and tooltip, so focus trapping,
  escape handling, roving tabindex and `aria-*` wiring are not hand-rolled.
- The drag handle is a real button with an instruction in its accessible name
  ("Reorder …. Press space, then use the arrow keys"). `@dnd-kit`'s keyboard sensor
  makes that literally true.
- Practice mode is fully keyboard-driven: space reveals, `1`–`4` grade. The handler
  ignores keystrokes originating in an input.
- `Field` generates the id, wires `aria-describedby` to the hint and the error, and sets
  `aria-invalid`. Errors are announced with `role="alert"`.
- A skip link, a single `<main id="main">`, and headings that follow the visual order.
- The theme switch is a `fieldset` of real radio inputs, so arrow keys move between the
  options.
- Progress bars carry `role="progressbar"` with real values; the step list is
  `aria-live="polite"`.
- Focus is never removed — `:focus-visible` gets a two-pixel accent outline everywhere.
- `prefers-reduced-motion` collapses animation and transition durations.

## Theming

CSS custom properties in `oklch`, defined on `:root` and overridden under `.dark`, then
exposed to Tailwind through `@theme inline`. Components reference semantic names —
`bg-surface`, `text-ink-muted`, `border-line` — never raw palette values, so both themes
are maintained in one place.

Dark mode is a `.dark` class, not the media query alone, so it can be switched manually.
A small inline script applies the stored preference before first paint, which is what
stops the white flash. `color-scheme` is set so native controls and scrollbars follow.

Cursors are set once in the base layer rather than per component: pointer for buttons,
links, labels, summaries, selects and ARIA-interactive roles; `not-allowed` for disabled
things; `text` for text inputs. Tailwind 4 no longer applies a pointer cursor to buttons
by default, so this is deliberate rather than incidental.

## Responsiveness

A single `max-w-7xl` container with a 16-pixel gutter. Panels are single-column below
`lg` and two-column above it. The builder's tab strip scrolls horizontally on narrow
screens instead of wrapping into two rows. Question and flashcard rows reflow rather
than truncate. Everything is usable at 375 pixels wide.

## Loading, empty and error states

Every surface has all three, and they are specific rather than generic:

| Surface | Loading | Empty | Error |
| --- | --- | --- | --- |
| Kit list | Three card skeletons | "No kits yet" with the create action | The message, plus a retry button |
| Builder | Header and panel skeletons | Per panel — an empty question bank explains *why* it is empty | Message plus a route back |
| Generation | A live step checklist with substeps | — | The failure code, the message, every step that did complete, and a retry |
| Practice | A card skeleton | Links to the flashcard tab | Message plus retry |
| Readiness | Skeleton | "Nothing flagged" | — |

The pattern throughout: when something is missing, say why it is missing. A kit with no
questions because the posting was two lines says exactly that, rather than rendering an
empty list.

## The client `/backend` boundary

`lib/api.ts` is the only place `fetch` is called. It prefixes `/backend`, sets the
content type when there is a body, turns a non-2xx response into a typed
`ApiRequestError` with the server's code and message, and turns a network failure into
one too. Every hook in `lib/queries.ts` goes through it, so error handling has exactly
one shape.
