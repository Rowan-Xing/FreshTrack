import { ReminderCoordinator } from "./coordinator";
import {
  asyncReminderStorage,
  expoReminderNotifications
} from "./expo-adapter";

export const reminderCoordinator = new ReminderCoordinator(
  asyncReminderStorage,
  expoReminderNotifications
);
