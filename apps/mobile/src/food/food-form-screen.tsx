import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  builtinFoodUnits,
  foodCategories,
  foodCategoryLabels,
  foodCategorySchema,
  foodFormSchema,
  formatLocalDate,
  type Food,
  type FoodCreate,
  type FoodForm
} from "@freshtrack/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View
} from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { wp } from "zkit-tools";
import { Button } from "zkit-ui/button";
import { DatePicker } from "zkit-ui/date-picker";
import { Picker, type PickerOption } from "zkit-ui/picker";
import { Text } from "zkit-ui/text";
import { TextInput } from "zkit-ui/text-input";
import { toast } from "zkit-ui/toast";

import { ApiClientError } from "../auth/api";
import { useAuth } from "../auth/provider";
import { colors } from "../theme";
import { AppSwitch } from "../ui/app-switch";
import { useReminders } from "../reminders/provider";
import * as foodApi from "./api";
import { foodQueryKeys, foodToForm } from "./state";

const categoryOptions: PickerOption<string>[] = foodCategories.map(
  (category) => ({
    value: category,
    label: foodCategoryLabels[category]
  })
);
const CUSTOM_UNIT = "__custom__";
const unitOptions: PickerOption<string>[] = [
  ...builtinFoodUnits.map((unit) => ({ value: unit, label: unit })),
  { value: CUSTOM_UNIT, label: "自定义单位" }
];

function initialValues(food?: Food): FoodForm {
  return food
    ? foodToForm(food)
    : {
        name: "",
        category: "PRODUCE",
        quantity: "",
        unit: "克",
        expiryDate: formatLocalDate(new Date()),
        reminderEnabled: true,
        notes: null
      };
}

export function FoodFormScreen({
  mode,
  food
}: {
  mode: "create" | "edit";
  food?: Food;
}) {
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const reminders = useReminders();
  const token = auth.status === "authenticated" ? auth.token : "";
  const userId = auth.status === "authenticated" ? auth.user.id : "";
  const {
    control,
    handleSubmit,
    setError,
    watch,
    setValue,
    formState: { errors }
  } = useForm<FoodForm, unknown, FoodCreate>({
    resolver: zodResolver(foodFormSchema),
    defaultValues: initialValues(food),
    mode: "onTouched"
  });
  const unit = watch("unit");
  const isCustomUnit = !builtinFoodUnits.some((value) => value === unit);

  const mutation = useMutation({
    mutationFn: async (input: FoodCreate) => {
      if (mode === "edit" && food) {
        return foodApi.updateFood(token, food.id, input);
      }
      return foodApi.createFood(token, input);
    },
    onSuccess: async (saved) => {
      if (!auth.isCurrentSession(token)) {
        return;
      }
      await queryClient.invalidateQueries({
        queryKey: foodQueryKeys.root(userId, token)
      });
      if (!auth.isCurrentSession(token)) {
        return;
      }
      queryClient.setQueryData(
        foodQueryKeys.detail(userId, token, saved.id),
        saved
      );
      const reminderWarnings = await reminders.reconcileFood(saved);
      if (!auth.isCurrentSession(token)) {
        return;
      }
      toast.success(mode === "edit" ? "食品已更新" : "食品已添加", {
        ...(reminderWarnings.length > 0
          ? { description: reminderWarnings.join("；") }
          : {})
      });
      router.back();
    },
    onError: async (error) => {
      await auth.handleAuthenticatedError(error, token);
      if (!auth.isCurrentSession(token)) {
        return;
      }
      if (error instanceof ApiClientError) {
        for (const name of [
          "name",
          "category",
          "quantity",
          "unit",
          "expiryDate",
          "reminderEnabled",
          "notes"
        ] as const) {
          const message = error.fields?.[name]?.[0];
          if (message) {
            setError(name, { message });
          }
        }
        setError("root", { message: error.message });
      } else {
        setError("root", { message: "提交失败，请稍后重试" });
      }
    }
  });

  if (auth.status !== "authenticated") {
    return null;
  }

  const submit = handleSubmit(async (input) => {
    if (!mutation.isPending) {
      await mutation.mutateAsync(input);
    }
  });

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View
          style={[
            styles.topBar,
            {
              minHeight: insets.top + wp(58),
              paddingTop: insets.top
            }
          ]}
        >
          <Button
            iconOnly
            variant="ghost"
            icon={
              <Ionicons
                name="chevron-back"
                size={wp(23)}
                color={colors.onSurface}
              />
            }
            onPress={() => {
              router.back();
            }}
            accessibilityLabel="返回"
          />
          <Text variant="heading" size="lg" weight="bold">
            {mode === "edit" ? "编辑食品" : "新增食品"}
          </Text>
          <View style={styles.topPlaceholder} />
        </View>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + wp(18) }
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={styles.card}
            entering={FadeInDown.duration(200).reduceMotion(ReduceMotion.System)}
          >
            <Controller
              control={control}
              name="name"
              render={({ field: { onBlur, onChange, value } }) => (
                <TextInput
                  label="食品名称"
                  required
                  value={value}
                  onChange={onChange}
                  onBlur={onBlur}
                  placeholder="例如：低脂牛奶"
                  maxLength={100}
                  clearable
                  error={errors.name?.message}
                  invalid={Boolean(errors.name)}
                />
              )}
            />
            <Controller
              control={control}
              name="category"
              render={({ field: { onChange, value } }) => (
                <View style={styles.field}>
                  <Text size="sm" weight="semibold">
                    分类
                  </Text>
                  <Picker
                    options={categoryOptions}
                    value={value}
                    title="选择食品分类"
                    onChange={(next) => {
                      const parsed = foodCategorySchema.safeParse(next);
                      if (parsed.success) {
                        onChange(parsed.data);
                      }
                    }}
                  >
                    {({ label, open }) => (
                      <Button block variant="outline" onPress={open}>
                        {label}
                      </Button>
                    )}
                  </Picker>
                  {errors.category?.message ? (
                    <Text tone="danger" size="xs">
                      {errors.category.message}
                    </Text>
                  ) : null}
                </View>
              )}
            />
            <View style={styles.quantityRow}>
              <View style={styles.quantityField}>
                <Controller
                  control={control}
                  name="quantity"
                  render={({ field: { onBlur, onChange, value } }) => (
                    <TextInput
                      label="数量"
                      required
                      value={value}
                      onChange={onChange}
                      onBlur={onBlur}
                      keyboardType="decimal-pad"
                      placeholder="例如 1.5"
                      error={errors.quantity?.message}
                      invalid={Boolean(errors.quantity)}
                    />
                  )}
                />
              </View>
              <View style={styles.unitField}>
                <Text size="sm" weight="semibold">
                  单位
                </Text>
                <Picker
                  options={unitOptions}
                  value={isCustomUnit ? CUSTOM_UNIT : unit}
                  title="选择单位"
                  onChange={(next) => {
                    if (typeof next !== "string") {
                      return;
                    }
                    setValue("unit", next === CUSTOM_UNIT ? "" : next, {
                      shouldDirty: true,
                      shouldValidate: true
                    });
                  }}
                >
                  {({ label, open }) => (
                    <Button block variant="outline" onPress={open}>
                      {isCustomUnit ? "自定义" : label}
                    </Button>
                  )}
                </Picker>
              </View>
            </View>
            {isCustomUnit ? (
              <Controller
                control={control}
                name="unit"
                render={({ field: { onBlur, onChange, value } }) => (
                  <TextInput
                    label="自定义单位"
                    required
                    value={value}
                    onChange={onChange}
                    onBlur={onBlur}
                    placeholder="最多 20 个字符"
                    maxLength={20}
                    error={errors.unit?.message}
                    invalid={Boolean(errors.unit)}
                  />
                )}
              />
            ) : null}
            <Controller
              control={control}
              name="expiryDate"
              render={({ field: { onChange, value } }) => (
                <View style={styles.field}>
                  <Text size="sm" weight="semibold">
                    到期日期
                  </Text>
                  <DatePicker
                    value={value}
                    precision="day"
                    title="选择到期日期"
                    onChange={onChange}
                  >
                    {({ label, open }) => (
                      <Button block variant="outline" onPress={open}>
                        {label || value}
                      </Button>
                    )}
                  </DatePicker>
                  {errors.expiryDate?.message ? (
                    <Text tone="danger" size="xs">
                      {errors.expiryDate.message}
                    </Text>
                  ) : null}
                </View>
              )}
            />
            <Controller
              control={control}
              name="reminderEnabled"
              render={({ field: { onChange, value } }) => (
                <AppSwitch
                  checked={value}
                  onCheckedChange={onChange}
                  label="到期提醒"
                  description="是否按当前账号的提醒设置安排本地通知"
                />
              )}
            />
            <Controller
              control={control}
              name="notes"
              render={({ field: { onBlur, onChange, value } }) => (
                <TextInput
                  label="备注（可选）"
                  value={value ?? ""}
                  onChange={onChange}
                  onBlur={onBlur}
                  multiline
                  minRows={3}
                  maxRows={6}
                  maxLength={500}
                  showCount
                  placeholder="例如：开封后冷藏"
                  error={errors.notes?.message}
                  invalid={Boolean(errors.notes)}
                />
              )}
            />
            {errors.root?.message ? (
              <View style={styles.errorBanner}>
                <Text tone="danger" size="sm">
                  {errors.root.message}
                </Text>
              </View>
            ) : null}
          </Animated.View>
          <Button
            block
            size="xl"
            loading={mutation.isPending}
            onPress={() => {
              void submit();
            }}
          >
            {mode === "edit" ? "保存修改" : "添加食品"}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  keyboard: {
    flex: 1
  },
  topBar: {
    paddingHorizontal: wp(14),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: wp(1),
    borderBottomColor: colors.border,
    backgroundColor: colors.surface
  },
  topPlaceholder: {
    width: wp(44)
  },
  content: {
    padding: wp(18),
    gap: wp(18)
  },
  card: {
    gap: wp(19),
    padding: wp(18),
    borderRadius: wp(22),
    borderWidth: wp(1),
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  field: {
    gap: wp(8)
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: wp(10)
  },
  quantityField: {
    flex: 1.25
  },
  unitField: {
    flex: 1,
    gap: wp(8)
  },
  errorBanner: {
    padding: wp(12),
    borderRadius: wp(12),
    backgroundColor: colors.dangerSurface
  }
});
