import {CustomFieldControl} from './custom-field-control';
import {RecordReadField} from './contact-summary-group';
import {Link} from 'react-router';
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ContactInheritanceField,
  ContactInheritanceWrite,
  FieldDefinition,
} from "@xobject/contracts";
import { Field, FieldSet, FieldLegend, FieldLabel, FieldDescription } from "./ui/field";
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
  workspaceId,objectTypeId,workspaceCode,
  state,
  draft,
  disabled,hideLabel=false,
  onChange,
}: {
  field: FieldDefinition;
  workspaceId:string;objectTypeId:string;workspaceCode:string;
  state: ContactInheritanceField;
  draft?: ContactInheritanceWrite[number];
  disabled: boolean;hideLabel?:boolean;
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
  const modes=(<ToggleGroup
        variant="outline"
        className="max-w-full flex-wrap"
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
      </ToggleGroup>);
  return (
    <Field data-contact-inheritance={field.id}>
      {field.kind!=='structured'?<><FieldLabel htmlFor={id}>{field.label}</FieldLabel>{modes}</>:null}

      {field.kind==='structured'?(mode==='inherit'?<FieldSet><FieldLegend variant="label" className="flex w-full flex-wrap items-center justify-between gap-3"><span className={hideLabel?'sr-only':undefined}>{field.label}</span>{modes}</FieldLegend><RecordReadField hideLabel field={field} value={value} workspaceCode={workspaceCode}/></FieldSet>:<CustomFieldControl labelHidden={hideLabel} legendActions={modes} field={field} value={value} workspaceId={workspaceId} objectTypeId={objectTypeId} disabled={disabled||!state.canEdit} onChange={value=>onChange({fieldId:field.id,mode:'own',value})}/>):<Input id={id} maxLength={10000} value={typeof value==='string'?value:''} readOnly={mode==='inherit'} disabled={disabled||!state.canEdit} onChange={event=>onChange({fieldId:field.id,mode:'own',value:event.target.value||null})}/>}
      <FieldDescription>
        {mode === "own"
          ? t("contactOwnHelp")
          : state.source
            ? <Link to={`/w/${workspaceCode}/objects/contacts/${state.source.recordId}`}>{t("contactInheritedFrom", { name: state.source.keyword })}</Link>
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
