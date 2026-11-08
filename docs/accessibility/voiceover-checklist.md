# VoiceOver check: playing a quest on an iPhone

A screen reader pass through the player's journey, which automated checks
can't replace. It takes about 20 minutes. Do it after changes to the player's
screens, and before launch.

For each step, note anything that isn't read out, is read wrongly or twice,
is confusing, or where focus jumps somewhere unexpected.

## Before you start

**Set up a test quest, on a laptop, as an administrator:**

1. Create two text puzzles. Give the first one hint. Give the second two
   hints, the second marked as giving away the solution.
2. Create a quest with both puzzles, assigned to a test player account (not
   your own), and start it from its console. Note the two activation codes the
   console shows.
3. Keep the console open on the laptop: you'll pause and resume the quest
   from it.

**On the iPhone:**

- Turn VoiceOver on: **Settings → Accessibility → VoiceOver**. Setting
  **Accessibility Shortcut** (at the bottom of the Accessibility page) to
  VoiceOver lets you turn it on and off with a triple-click of the side
  button.
- Swipe right or left to move to the next or previous item; double-tap to
  activate what's selected. Turn two fingers like a dial to choose
  **Headings** on the rotor, then swipe up or down to jump between headings.
- Use Safari, signed out of the site.

## The journey

| #   | Do                                                    | You should hear                                                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Open the site's sign-in page.                         | "Sign in" as the page's heading. The fields as "User name" and "Password".                                                                                                                                                                                                 |
| 2   | Sign in with a wrong password.                        | "Incorrect user name or password", read out without moving there.                                                                                                                                                                                                          |
| 3   | Sign in as the test player.                           | The home page, with "Your quests" as its heading, and the test quest listed with its status.                                                                                                                                                                               |
| 4   | Open the test quest.                                  | Focus on the quest's name, as a heading. The clock read once when you reach it, not repeatedly as it runs.                                                                                                                                                                 |
| 5   | Open the first stop.                                  | Focus on the puzzle's name, as a heading; before it, "Stop 1". The camera may start for scanning: then "Enter the code instead", which leads to the typed form. In the typed form, the "Activation code" field, then "Start this puzzle", then "Scan the QR code instead". |
| 6   | Enter a wrong code, and start.                        | "Incorrect activation code for puzzle".                                                                                                                                                                                                                                    |
| 7   | Enter the right code, and start.                      | "The puzzle is started." Focus on the puzzle's name, not lost. The puzzle's text, "Your answer", "Check answer", and the hint button with its penalty, such as "Reveal next hint (+1:00)".                                                                                 |
| 8   | Reveal the hint.                                      | "Hint:" and its text. Focus stays on the hint button.                                                                                                                                                                                                                      |
| 9   | Answer wrongly.                                       | "Incorrect guess for puzzle solution".                                                                                                                                                                                                                                     |
| 10  | On the laptop, pause the quest from the console.      | On the phone, without touching it: "Paused by the puzzle master. The clock is stopped."                                                                                                                                                                                    |
| 11  | On the laptop, resume it.                             | "The quest has resumed."                                                                                                                                                                                                                                                   |
| 12  | Answer rightly.                                       | "Solved:" and the solution. Focus on the puzzle's name. Then "On to" and the next puzzle's name, as a link.                                                                                                                                                                |
| 13  | Follow it, and start the second puzzle with its code. | As in steps 5 and 7, with "Stop 2".                                                                                                                                                                                                                                        |
| 14  | Reveal the first hint, then try the second.           | The first read out, as in step 8. Then a dialog: "Give away the solution?", with "Keep trying" and "Show it".                                                                                                                                                              |
| 15  | Choose "Keep trying".                                 | The dialog closes, and focus is back on the hint button.                                                                                                                                                                                                                   |
| 16  | Answer rightly.                                       | "Solved:" and the solution, "End of the line.", and "Congratulations! You finished" with the quest's name and time.                                                                                                                                                        |
| 17  | Go back to the quest.                                 | Both stops, each with its name as a heading, and the finish.                                                                                                                                                                                                               |

## Also check

- **Larger text:** with **Settings → Display & Brightness → Text Size**
  turned up, or zoomed in with a pinch, the pages read without scrolling
  sideways, and nothing is cut off.
- **The scanner:** on a puzzle awaiting activation, "Scan the QR code
  instead" says what it does, and if the camera is refused, the code can
  still be typed.

## Afterwards

Delete the test quest, and its puzzles if you won't reuse them, and send
your notes, with the step number for each.
