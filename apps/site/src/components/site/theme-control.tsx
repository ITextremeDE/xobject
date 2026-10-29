import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

/** Native selection with the shared primitive; external CSP-safe JS persists it. */
export function ThemeControl() {
  return (
    <label className="theme-control">
      <span className="sr-only">Darstellung</span>
      <NativeSelect id="theme" aria-label="Darstellung" defaultValue="system">
        <NativeSelectOption value="system">System</NativeSelectOption>
        <NativeSelectOption value="light">Hell</NativeSelectOption>
        <NativeSelectOption value="dark">Dunkel</NativeSelectOption>
      </NativeSelect>
    </label>
  );
}
