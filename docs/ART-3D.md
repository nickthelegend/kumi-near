# Kumi 3D object kit

Single chunky objects with Kumi's happy face, one per card. They sit in the landing's how-it-works steps and NEAR
feature cards, the crew room's side-panel empty states and captain lane, the season page header and rules, the
success rows after chipping in, following or ragequitting, and every error notice. The approved clay art stays as it was:
the four mascots (owl, fox, bear, frog), the hero and season scenes, the how-it-works scenes, the bench empty state
and the section stickers in `public/art`. This kit adds objects next to them and replaces none of them.

- **Material:** chunky soft-touch candy plastic: thick rounded toy shapes with a velvety satin finish and a gentle
  soft sheen, like a soft-touch rubberised toy. Not wet gloss (Mempire's candy enamel), not vitreous enamelware
  (Kotoba), not matte clay (Kumi's own mascots), no metal, no chrome, no silver, no glitter.
- **Palette (from `styles.css`):** main coral `#ff6f59` (`--coral`), details in plum `#3b1f4a` (`--plum`) and cream
  `#fff4e6` (`--cream`), small butter `#ffd166` accents (`--butter`), a soft butter rim light, blush pink `#ff8fc7`
  (`--pink`) only on the cheeks. The captain's hat is the one plum-bodied object; the warning sign is butter with
  a coral rim, as in the app's own notice colours.
- **Face:** Kumi's mascot face, as on the clay crew: two small closed happy upward eye arcs and a small open smile in
  plum, two round pink blush cheeks. The empty state sleeps (closed downward arcs, calm smile); the warning sign is
  worried (two round dot eyes, a wobbly mouth). No pill eyes, no eyebrows. The voting hand and the logo-mark
  candidate carry no face.
- **Background:** transparent (no ground shadow), so each object sits on the cream page, the white cards and the
  tinted rule and notice panels. Cleaned of stray rim-light specks, trimmed, padded square, webp 640 px.
- **Subjects:** group chat bubble (hero object), piggy fund jar (chip in), voting hand and ballot box (DAO vote),
  captain's hat badge (captain lane, function-call key), rocket (trade executed), exit door (ragequit), crown
  (season), shield with a padlock (limits, non-transferable shares, proof), coin stack (score), hourglass (season
  window), sleepy chat bubble on a cushion (empty state), check-mark medallion (success), worried warning sign
  (errors), three huddled chat bubbles (logo-mark candidate, not wired in; the app keeps its brand mark).

Style line used in every prompt (ChatGPT, one image per message, one chat for the set):

> Chunky soft-touch candy plastic 3D render: thick rounded toy shapes with a velvety satin finish and gentle soft
> sheen (not wet gloss, not clay, not metal), main colour coral #FF6F59, details in deep plum #3B1F4A and warm cream
> #FFF4E6, small butter-yellow #FFD166 accents, soft butter-yellow rim light, soft studio lighting, rounded bevelled
> edges, gentle toy-like proportions, centred single object, transparent background (no background, no ground
> shadow), square 1024x1024, no text, no letters, no numbers, no logos. No chrome, no silver, no glitter.

Face line: "two small closed happy upward-curved eye arcs in plum #3B1F4A, a small open smiling mouth in plum, and
two round soft pink #FF8FC7 blush cheeks. No pill eyes, no eyebrows."

## Where each object is used

| Object | File | Used in |
|---|---|---|
| Piggy fund jar | `kumi-3d-jar.webp` | Landing step 01 "Chip into one jar"; Sub-accounts card; room "Your position" when signed out or not invited |
| Voting hand | `kumi-3d-vote.webp` | Landing step 02; Sputnik DAO v2 card; room "Other DAO votes" when none are open |
| Exit door | `kumi-3d-door.webp` | Landing step 03 "Leave whenever, exactly"; ragequit success row |
| Crown | `kumi-3d-crown.webp` | Landing step 04 "Climb the season"; season page title |
| Captain's hat | `kumi-3d-captain.webp` | Function-call keys card; room "Captain lane" card header |
| Chat bubble | `kumi-3d-chat.webp` | NEP-366 meta transactions card (email sign-in, relayed) |
| Rocket | `kumi-3d-rocket.webp` | NEAR Intents (1Click) card; lobby "Recent calls" empty state |
| Shield | `kumi-3d-shield.webp` | NEP-245 + NEP-141 card (non-transferable shares); season rule "Recomputed, not reported" |
| Coin stack | `kumi-3d-coins.webp` | Season rule "Return − ½ × max drawdown" |
| Hourglass | `kumi-3d-hourglass.webp` | Season rule "Monday to Sunday, UTC" |
| Sleepy bubble | `kumi-3d-empty.webp` | Landing live-proof card when the hub has no crew yet |
| Check medallion | `kumi-3d-success.webp` | Chip-in and follow success rows |
| Warning sign | `kumi-3d-warning.webp` | Every error notice (`<Notice error>`), still, 34 px |
| Huddled bubbles | `kumi-3d-mark.webp` | Logo-mark candidate only |

Motion: a 4 px float over 5.6 s (staggered per card), off under `prefers-reduced-motion`; the warning sign never
moves. Every object has a fixed width and height; decorative ones have empty alt text, card objects describe the
object.

Files: `packages/web/public/art/3d/kumi-3d-<subject>.webp` (640 px wide, transparent, 23 to 41 KB each).
3D art generated with ChatGPT.
