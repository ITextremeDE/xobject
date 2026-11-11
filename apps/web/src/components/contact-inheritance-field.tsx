import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ContactInheritanceField,
  ContactInheritanceWrite,
  FieldDefinition,
} from "@xobject/contracts";
import { Field, FieldLabel, FieldDescription } from "./ui/field";
import { Input } from "./ui/input";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "./ui/alert-dialog";
export function ContactInheritanceControl({
  field,
  state,
  draft,
  disabled,
  onChange,
}: {
  field: FieldDefinition;
  state: ContactInheritanceField;
  draft?: ContactInheritanceWrite[number];
  disabled: boolean;
  onChange: (write: ContactInheritanceWrite[number]) => void;
}) {
  const { t } = useTranslation(),
    [reset, setReset] = useState(false);
  const mode = draft?.mode ?? state.mode,
    value =
      draft?.mode === "own"
        ? draft.value
        : mode === "own"
          ? state.value
          : state.inheritedValue;
  const id = `contact-inheritance-${field.id}`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
      <ToggleGroup
        variant="outline"
        size="sm"
        value={[mode]}
        disabled={disabled || !state.canEdit}
        aria-label={t("contactInheritanceMode", { field: field.label })}
        onValueChange={(items) => {
          const next = items[0];
          if (next === "own")
            onChange({ fieldId: field.id, mode: "own", value: value ?? null });
          else if (next === "inherit" && mode === "own") setReset(true);
        }}
      >
        <ToggleGroupItem value="inherit">{t("contactInherit")}</ToggleGroupItem>
        <ToggleGroupItem value="own">{t("contactOwn")}</ToggleGroupItem>
      </ToggleGroup>
      <Input
        id={id}
        maxLength={10000}
        value={value ?? ""}
        readOnly={mode === "inherit"}
        disabled={disabled || !state.canEdit}
        onChange={(e) =>
          onChange({
            fieldId: field.id,
            mode: "own",
            value: e.target.value || null,
          })
        }
      />
      <FieldDescription>
        {mode === "own"
          ? t("contactOwnHelp")
          : state.source
            ? t("contactInheritedFrom", { name: state.source.keyword })
            : t("contactInheritedUnavailable")}
      </FieldDescription>
      <AlertDialog open={reset} onOpenChange={setReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("contactResetInheritance")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("contactResetInheritanceHelp", { field: field.label })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onChange({
                  fieldId: field.id,
                  mode: "inherit",
                  confirmReset: true,
                });
                setReset(false);
              }}
            >
              {t("contactInherit")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Field>
  );
}
