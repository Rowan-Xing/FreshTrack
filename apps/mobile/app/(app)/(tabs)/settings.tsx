import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { sp, wp } from "zkit-tools";
import { Button } from "zkit-ui/button";
import { LoadingSpinner } from "zkit-ui/loading-spinner";
import { Picker, type PickerOption } from "zkit-ui/picker";
import { Text } from "zkit-ui/text";
import { toast } from "zkit-ui/toast";

import { ApiClientError } from "../../../src/auth/api";
import { useAuth } from "../../../src/auth/provider";
import { PageHeader } from "../../../src/food/components";
import { useReminders } from "../../../src/reminders/provider";
import { reminderTimeSchema } from "../../../src/reminders/schema";
import { colors } from "../../../src/theme";
import { AppSwitch } from "../../../src/ui/app-switch";
import { PageBackground } from "../../../src/ui/page-background";

const daysOptions: PickerOption<number>[] = [0, 1, 2, 3].map((value) => ({
  value,
  label: value === 0 ? "到期当天" : `提前 ${value} 天`
}));

const timeOptions: PickerOption<string>[] = Array.from(
  { length: 24 },
  (_, hour) => {
    const hourText = String(hour).padStart(2, "0");
    return {
      value: hourText,
      label: `${hourText} 时`,
      children: Array.from({ length: 60 }, (_unused, minute) => {
        const minuteText = String(minute).padStart(2, "0");
        return { value: minuteText, label: `${minuteText} 分` };
      })
    };
  }
);

const permissionCopy = {
  undetermined: {
    label: "未询问",
    description: "只有你主动点击允许时，系统才会询问通知权限。"
  },
  allowed: {
    label: "已允许",
    description: "符合条件且时间尚未错过的食品会安排本地通知。"
  },
  denied: {
    label: "已拒绝",
    description: "FreshTrack 不会重复弹窗。请到 Android 应用设置中手动允许通知。"
  }
} as const;

export default function SettingsScreen() {
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const reminders = useReminders();
  const [signingOut, setSigningOut] = useState(false);
  const [globalEnabled, setGlobalEnabled] = useState(
    reminders.settings.globalEnabled
  );
  const [daysBefore, setDaysBefore] = useState(
    reminders.settings.daysBefore
  );
  const [time, setTime] = useState(reminders.settings.time);

  useEffect(() => {
    setGlobalEnabled(reminders.settings.globalEnabled);
    setDaysBefore(reminders.settings.daysBefore);
    setTime(reminders.settings.time);
  }, [reminders.settings]);

  if (auth.status !== "authenticated") {
    return null;
  }

  const busy =
    reminders.phase === "saving" || reminders.phase === "syncing";
  const copy = permissionCopy[reminders.permission];

  const save = async () => {
    if (busy) {
      return;
    }
    const result = await reminders.saveSettings({
      globalEnabled,
      daysBefore,
      time
    });
    if (result.status === "saved") {
      toast.success("提醒设置已保存");
      return;
    }
    if (result.status === "savedWithWarning") {
      toast.success("提醒设置已保存", {
        description: result.warning
      });
      return;
    }
    if (result.status === "failed") {
      toast.error("提醒设置未保存", {
        description: result.message
      });
    }
  };

  const signOut = async () => {
    if (signingOut) {
      return;
    }
    setSigningOut(true);
    try {
      await auth.signOut();
    } catch (error) {
      toast.error("退出失败", {
        description:
          error instanceof ApiClientError
            ? error.message
            : "请检查网络后重试"
      });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <View style={styles.screen}>
      <PageBackground variant="settings" />
      <ScrollView
        contentContainerStyle={[
          styles.page,
          { paddingTop: insets.top + wp(12) }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader title="设置" subtitle="账号与本地到期提醒" />
        <View style={styles.accountCard}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={wp(24)} color={colors.onPrimary} />
          </View>
          <View style={styles.accountCopy}>
            <Text size="xs" tone="muted">
              当前账号
            </Text>
            <Text size="md" weight="bold" numberOfLines={1}>
              {auth.user.email}
            </Text>
          </View>
        </View>

        {reminders.phase === "loading" ? (
          <View style={styles.loadingCard}>
            <LoadingSpinner size={wp(28)} color={colors.primary} />
            <Text tone="muted">正在读取提醒设置与系统权限…</Text>
          </View>
        ) : (
          <>
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeading}>
                <View style={styles.iconSurface}>
                  <Ionicons
                    name="notifications-outline"
                    size={wp(22)}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.sectionCopy}>
                  <Text weight="bold">通知权限：{copy.label}</Text>
                  <Text tone="muted" size="sm" lineHeight={sp(21)}>
                    {copy.description}
                  </Text>
                </View>
              </View>
              {reminders.permission === "undetermined" ? (
                <Button
                  block
                  variant="outline"
                  loading={reminders.phase === "syncing"}
                  disabled={reminders.phase === "saving"}
                  onPress={() => {
                    void reminders.requestPermission();
                  }}
                >
                  允许本地通知
                </Button>
              ) : null}
              {reminders.permission === "denied" ? (
                <Button
                  block
                  variant="outline"
                  onPress={() => {
                    void reminders.openSystemSettings();
                  }}
                >
                  打开 Android 应用设置
                </Button>
              ) : null}
            </View>

            <View style={styles.sectionCard}>
              <AppSwitch
                checked={globalEnabled}
                onCheckedChange={setGlobalEnabled}
                disabled={busy}
                label="全局提醒"
                description="关闭后会取消当前账号已记录的全部食品提醒"
              />
              <View style={styles.divider} />
              <View style={styles.field}>
                <View style={styles.fieldCopy}>
                  <Text weight="semibold">提前时间</Text>
                  <Text tone="muted" size="xs">
                    可选择到期当天或提前 1–3 天
                  </Text>
                </View>
                <Picker
                  options={daysOptions}
                  value={daysBefore}
                  valueMode="single"
                  title="选择提前天数"
                  disabled={busy}
                  onChange={(next) => {
                    if (
                      typeof next === "number" &&
                      Number.isInteger(next) &&
                      next >= 0 &&
                      next <= 3
                    ) {
                      setDaysBefore(next);
                    }
                  }}
                >
                  {({ open }) => (
                    <Button variant="outline" onPress={open} disabled={busy}>
                      {daysBefore === 0 ? "到期当天" : `提前 ${daysBefore} 天`}
                    </Button>
                  )}
                </Picker>
              </View>
              <View style={styles.divider} />
              <View style={styles.field}>
                <View style={styles.fieldCopy}>
                  <Text weight="semibold">提醒时间</Text>
                  <Text tone="muted" size="xs">
                    使用设备当前本地时区
                  </Text>
                </View>
                <Picker
                  options={timeOptions}
                  value={time.split(":")}
                  valueMode="path"
                  title="选择提醒时间"
                  separator=":"
                  disabled={busy}
                  renderColumnHeader={({ columnIndex }) => (
                    <Text size="xs" tone="muted" align="center">
                      {columnIndex === 0 ? "小时" : "分钟"}
                    </Text>
                  )}
                  onChange={(next) => {
                    if (!Array.isArray(next) || next.length !== 2) {
                      return;
                    }
                    const candidate = `${String(next[0])}:${String(next[1])}`;
                    const parsed = reminderTimeSchema.safeParse(candidate);
                    if (parsed.success) {
                      setTime(parsed.data);
                    }
                  }}
                >
                  {({ open }) => (
                    <Button variant="outline" onPress={open} disabled={busy}>
                      {time}
                    </Button>
                  )}
                </Picker>
              </View>
              <Button
                block
                size="lg"
                loading={reminders.phase === "saving"}
                disabled={reminders.phase === "syncing"}
                onPress={() => {
                  void save();
                }}
              >
                保存并重排提醒
              </Button>
            </View>
          </>
        )}

        {reminders.message ? (
          <View style={styles.errorCard}>
            <Text tone="danger" weight="semibold">
              {reminders.message}
            </Text>
            <Button
              size="sm"
              variant="outline"
              onPress={() => {
                void reminders.refresh();
              }}
            >
              重试同步
            </Button>
          </View>
        ) : null}
        {reminders.warning ? (
          <View style={styles.warningCard}>
            <Text weight="semibold" style={styles.warningText}>
              提醒同步警告
            </Text>
            <Text size="sm" lineHeight={sp(21)} style={styles.warningText}>
              {reminders.warning}
            </Text>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onPress={() => {
                void reminders.refresh();
              }}
            >
              重新同步全部提醒
            </Button>
          </View>
        ) : null}

        <Button
          block
          size="lg"
          variant="outline"
          tone="danger"
          loading={signingOut}
          disabled={busy}
          onPress={() => {
            void signOut();
          }}
        >
          退出登录
        </Button>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  page: {
    gap: wp(18),
    paddingHorizontal: wp(18),
    paddingBottom: wp(30)
  },
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: wp(14),
    padding: wp(18),
    borderRadius: wp(20),
    borderWidth: wp(1),
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  avatar: {
    width: wp(46),
    height: wp(46),
    alignItems: "center",
    justifyContent: "center",
    borderRadius: wp(15),
    backgroundColor: colors.primary
  },
  accountCopy: {
    flex: 1,
    gap: wp(4)
  },
  loadingCard: {
    minHeight: wp(140),
    alignItems: "center",
    justifyContent: "center",
    gap: wp(12),
    borderRadius: wp(20),
    backgroundColor: colors.surface
  },
  sectionCard: {
    gap: wp(17),
    padding: wp(18),
    borderRadius: wp(20),
    borderWidth: wp(1),
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: wp(12)
  },
  iconSurface: {
    width: wp(42),
    height: wp(42),
    alignItems: "center",
    justifyContent: "center",
    borderRadius: wp(14),
    backgroundColor: colors.secondary
  },
  sectionCopy: {
    flex: 1,
    gap: wp(5)
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: wp(12)
  },
  fieldCopy: {
    flex: 1,
    gap: wp(4)
  },
  errorCard: {
    gap: wp(10),
    padding: wp(16),
    borderRadius: wp(16),
    backgroundColor: colors.dangerSurface
  },
  warningCard: {
    gap: wp(9),
    padding: wp(16),
    borderRadius: wp(16),
    backgroundColor: colors.warningSurface
  },
  warningText: {
    color: colors.warning
  }
});
