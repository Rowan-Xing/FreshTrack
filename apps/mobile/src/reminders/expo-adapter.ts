import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";

import type {
  ReminderNotifications,
  ReminderNotificationInput
} from "./coordinator";
import type { ReminderPermission } from "./planner";
import { createReminderStorage } from "./storage";

const REMINDER_CHANNEL_ID = "freshtrack-expiry-reminders";

function permissionFromExpo(
  status: Notifications.NotificationPermissionsStatus
): ReminderPermission {
  if (
    status.granted ||
    status.status === Notifications.PermissionStatus.GRANTED
  ) {
    return "allowed";
  }
  return status.status === Notifications.PermissionStatus.UNDETERMINED
    ? "undetermined"
    : "denied";
}

let initialized = false;

Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false
    })
});

export const asyncReminderStorage = createReminderStorage(AsyncStorage);

export const expoReminderNotifications: ReminderNotifications = {
  async initialize() {
    if (initialized) {
      return;
    }
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
        name: "食品到期提醒",
        description: "鲜知 FreshTrack 的本地食品到期提醒",
        importance: Notifications.AndroidImportance.DEFAULT,
        enableVibrate: true,
        showBadge: false
      });
    }
    initialized = true;
  },

  async getPermission() {
    return permissionFromExpo(await Notifications.getPermissionsAsync());
  },

  async requestPermission() {
    return permissionFromExpo(await Notifications.requestPermissionsAsync());
  },

  schedule(input: ReminderNotificationInput) {
    return Notifications.scheduleNotificationAsync({
      content: {
        title: `${input.foodName} 即将到期`,
        body: `${input.foodName} 的到期日是 ${input.expiryDate}`,
        data: {
          source: "freshtrack",
          userId: input.userId,
          foodId: input.foodId
        }
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: input.trigger,
        channelId: REMINDER_CHANNEL_ID
      }
    });
  },

  cancel(identifier) {
    return Notifications.cancelScheduledNotificationAsync(identifier);
  },

  openSettings() {
    return Linking.openSettings();
  }
};
