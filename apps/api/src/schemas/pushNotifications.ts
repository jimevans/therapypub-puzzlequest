// What a push notification carries to the apps (decision 0024). The server
// checks each notification against this schema before sending it, and the
// API's description documents it, so the apps can rely on it; each release
// publishes it as push-notifications.json.
import { z } from "zod";

/** The kinds of push notification the API sends. */
export const PUSH_CATEGORIES = [
  "questStarted",
  "questPaused",
  "questResumed",
  "stopSolved",
  "standingsFinal",
  "message",
] as const;

/** A push notification, as the apps receive it. */
export const pushNotificationSchema = z
  .object({
    category: z.enum(PUSH_CATEGORIES).meta({
      description:
        "The kind of notification. Later versions may add kinds; an app ignores one it doesn't know.",
    }),
    questName: z.string().meta({
      description: "The quest it's about. Tapping it opens the quest.",
    }),
    puzzleName: z.string().optional().meta({
      description:
        "The puzzle it's about, where there is one: for stopSolved, the stop solved.",
    }),
    title: z.string().meta({
      description: "Its title: the quest's display name.",
    }),
    body: z.string().meta({
      description: "What happened, in English, written by the server.",
    }),
  })
  .meta({
    id: "PushNotification",
    description:
      "What a push notification carries. On iOS, title and body are the APNs alert, the other fields are custom keys beside aps, and the quest is the thread-id. On Android, title and body are the FCM notification, the other fields are its data (strings), and the quest is its tag. A notification never shows a solution or a hint, never says how many stops a quest has, and never tells a racing player about a rival's progress.",
  });

/** A push notification, as the apps receive it. */
export type PushNotification = z.infer<typeof pushNotificationSchema>;
