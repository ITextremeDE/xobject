import { FieldSet, FieldLegend } from "./ui/field";
import {
  ClassificationFields,
  initialChoices,
  type ClassificationValues,
} from "./classification-values";
import { useRegional } from "@/lib/regional-context";
import { localizedFieldDraft, normalizedFieldDraft } from "@/lib/numeric-input";
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
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  fieldApplies,
  type DataRecord,
  type FieldValue,
  type Inputs,
  type ObjectDefinition,
  type ContactConversionPreview,
} from "@xobject/contracts";
import { api } from "@/lib/api";
import { notifySuccess } from "@/lib/notifications";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { DialogActions } from "./dialog-actions";
import { FieldGroup, Field, FieldLabel, FieldDescription } from "./ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "./ui/select";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Alert, AlertDescription } from "./ui/alert";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "./ui/table";
import { ErrorNotice, Loading } from "./feedback";
import { CustomFieldControl } from "./custom-field-control";
import { displayFieldValue } from "@/lib/field-display";
export function ContactConversionDialog({
  definition,
  record,
  onClose,
  onConverted,
  onBusyChange,
  onDirtyChange,
}: {
  onBusyChange: (value: boolean) => void;
  onDirtyChange: (value: boolean) => void;
  definition: ObjectDefinition;
  record: DataRecord;
  onClose: () => void;
  onConverted: (record: DataRecord) => void;
}) {
  const { t, i18n } = useTranslation(),
    queryClient = useQueryClient(),
    p = definition.contactProfile!,
    kindField = definition.fields.find((f) => f.id === p.fields.contact_kind)!;
  const regional = useRegional();
  const company = definition.fields.find(
    (f) => f.id === p.fields.company_name,
  )!;
  const kind = record[kindField.technicalName],
    actions = (
      kind === p.kinds.individual
        ? [
            ...(definition.permissions?.create ? ["new_organization"] : []),
            "existing_organization",
          ]
        : kind === p.kinds.person
          ? ["individual"]
          : ["dissolve_organization"]
    ) as Inputs["get_contact_conversion_preview"]["action"][];
  const [action, setAction] = useState(actions[0]),
    [organizationId, setOrganizationId] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [organizationName, setOrganizationName] = useState(
      String(record[company.technicalName] ?? ""),
    ),
    [contactValues, setContactValues] = useState<
      Record<string, Record<string, FieldValue>>
    >({}),
    [preview, setPreview] = useState<ContactConversionPreview>();
  const [organizationDraft, setOrganizationDraft] = useState<
      Record<string, FieldValue>
    >({}),
    [organizationChoices, setOrganizationChoices] =
      useState<ClassificationValues>(() =>
        initialChoices(definition.classification),
      );
  const organizationExtraFields = definition.fields.filter(
    (f) =>
      f.state === "active" &&
      !f.isDerived &&
      f.required &&
      !["type", "status", "category"].includes(f.kind) &&
      f.fieldPermissions?.create === true &&
      ![
        "contact_kind",
        "company_name",
        "record_number",
        "access_principals",
      ].includes(f.technicalName) &&
      fieldApplies(f, definition.fields, {
        [kindField.technicalName]: p.kinds.organization,
        ...organizationDraft,
      }),
  );
  const organizationClassificationFields = definition.fields.filter(
    (f) =>
      f.state === "active" &&
      ["type", "status", "category"].includes(f.technicalName),
  );
  const currentValues = contactValues[record.id] ?? {};
  const input: Inputs["get_contact_conversion_preview"] = {
    objectTypeId: definition.id,
    recordId: record.id,
    version: record.version,
    action,
    ...(action === "existing_organization" ? { organizationId } : {}),
    organizationValues:
      action === "new_organization"
        ? {
            [company.technicalName]: organizationName,
            ...Object.fromEntries(
              Object.entries(organizationDraft).map(([key, value]) => [
                key,
                normalizedFieldDraft(
                  definition.fields.find((f) => f.technicalName === key)!,
                  value,
                  regional,
                ),
              ]),
            ),
          }
        : {},
    organizationClassification:
      action === "new_organization"
        ? Object.fromEntries(
            Object.entries(organizationChoices).filter(([key]) =>
              organizationClassificationFields.some(
                (f) =>
                  f.technicalName === key &&
                  f.fieldPermissions?.create === true,
              ),
            ),
          )
        : {},
    contactValues: Object.fromEntries(
      Object.entries(contactValues).map(([id, values]) => [
        id,
        Object.fromEntries(
          Object.entries(values).map(([key, value]) => {
            const field = definition.fields.find(
              (f) => f.technicalName === key,
            )!;
            return [key, normalizedFieldDraft(field, value, regional)];
          }),
        ),
      ]),
    ),
  };
  const organizations = useQuery({
    queryKey: ["conversion-organizations", definition.id, search, page],
    queryFn: () =>
      api("list_records", {
        objectTypeId: definition.id,
        contactKindId: p.kinds.organization,
        query: search,
        sortBy: "keyword",
        sortDirection: "asc",
        limit: 25,
        offset: page * 25,
      }),
    enabled: action === "existing_organization",
  });
  const targetKind =
    action === "individual" || action === "dissolve_organization"
      ? p.kinds.individual
      : p.kinds.person;
  const additional =
    action === "dissolve_organization"
      ? []
      : definition.fields.filter(
          (f) =>
            !f.isDerived &&
            !["type", "status", "category"].includes(f.kind) &&
            f.fieldPermissions?.edit !== false &&
            ((f.required &&
              fieldApplies(f, definition.fields, {
                ...record,
                ...currentValues,
                [kindField.technicalName]: targetKind,
              })) ||
              f.id === p.fields.last_name) &&
            ![
              "contact_kind",
              "company_name",
              "record_number",
              "access_principals",
            ].includes(f.technicalName),
        );
  const inspection = useMutation({
    mutationFn: () => api("get_contact_conversion_preview", input),
    onSuccess: setPreview,
  });
  const execution = useMutation({
    mutationFn: () =>
      api("convert_contact", {
        ...input,
        previewToken: preview!.previewToken,
        confirm: true,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries();
      const current = result.records.find((r) => r.id === record.id);
      notifySuccess(t("contactConversionDone"));
      onClose();
      if (current) onConverted(current);
    },
  });
  const busy = inspection.isPending || execution.isPending;
  const [discard, setDiscard] = useState(false);
  const dirty =
    Object.keys(contactValues).length > 0 ||
    Object.keys(organizationDraft).length > 0 ||
    JSON.stringify(organizationChoices) !==
      JSON.stringify(initialChoices(definition.classification)) ||
    Boolean(organizationId) ||
    organizationName !== String(record[company.technicalName] ?? "");
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  function close() {
    if (busy) return;
    if (dirty) setDiscard(true);
    else onClose();
  }

  const change = (run: () => void) => {
    run();
    setPreview(undefined);
    inspection.reset();
    execution.reset();
  };
  const kindLabel = (id: string) => {
    const key = Object.entries(p.kinds).find(([, v]) => v === id)?.[0];
    return t(`contactKind_${key}`);
  };
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          className="flex max-h-[90svh] flex-col overflow-hidden p-0 sm:max-w-3xl"
          finalFocus={()=>Array.from(document.querySelectorAll<HTMLElement>('[data-record-contact-actions]')).find(element=>element.getClientRects().length>0)??true}
          closeButtonDisabled={busy}
        >
          <DialogHeader className="shrink-0 px-4 pt-4 pr-12">
            <DialogTitle>{t("contactConvert")}</DialogTitle>
            <DialogDescription>{t("contactConversionHelp")}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto p-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="conversion-action">
                  {t("action")}
                </FieldLabel>
                <Select
                  items={actions.map((value) => ({
                    value,
                    label: t(`contactConversion_${value}`),
                  }))}
                  value={action}
                  onValueChange={(value) => {
                    if (value)
                      change(() => {
                        setAction(value);
                        setContactValues({});
                        setOrganizationId("");
                        setOrganizationName(
                          String(record[company.technicalName] ?? ""),
                        );
                        setOrganizationDraft({});
                        setOrganizationChoices(
                          initialChoices(definition.classification),
                        );
                      });
                  }}
                  disabled={busy}
                >
                  <SelectTrigger id="conversion-action" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {actions.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(`contactConversion_${value}`)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              {action === "new_organization" ? (
                <FieldSet>
                  <FieldLegend>{t("contactNewOrganizationFields")}</FieldLegend>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="conversion-company">
                        {company.label} *
                      </FieldLabel>
                      <Input
                        id="conversion-company"
                        required
                        value={organizationName}
                        maxLength={10000}
                        disabled={busy}
                        onChange={(e) =>
                          change(() => setOrganizationName(e.target.value))
                        }
                      />
                      <FieldDescription>
                        {t("contactConversionNewOrganization")}
                      </FieldDescription>
                    </Field>
                    <FieldGroup className="grid gap-4 sm:grid-cols-2">
                      {organizationClassificationFields
                        .filter((f) => f.fieldPermissions?.create === true)
                        .map((field) => (
                          <div
                            key={field.id}
                            className={
                              field.kind === "category"
                                ? "min-w-0 sm:col-span-2"
                                : "min-w-0"
                            }
                          >
                            <ClassificationFields
                              idPrefix="conversion-organization-"
                              fields={[field]}
                              config={definition.classification}
                              value={organizationChoices}
                              disabled={busy}
                              onChange={(next) =>
                                change(() => setOrganizationChoices(next))
                              }
                            />
                          </div>
                        ))}
                    </FieldGroup>
                    {organizationExtraFields.map((field) => (
                      <CustomFieldControl
                        idPrefix="conversion-organization-"
                        key={field.id}
                        field={field}
                        value={
                          Object.hasOwn(organizationDraft, field.technicalName)
                            ? organizationDraft[field.technicalName]
                            : localizedFieldDraft(
                                field,
                                field.inputRules?.defaultValue ?? null,
                                regional,
                              )
                        }
                        workspaceId={definition.workspaceId}
                        objectTypeId={definition.id}
                        disabled={busy}
                        onChange={(value) =>
                          change(() =>
                            setOrganizationDraft((old) => ({
                              ...old,
                              [field.technicalName]: value,
                            })),
                          )
                        }
                      />
                    ))}
                  </FieldGroup>
                </FieldSet>
              ) : null}
              {action === "existing_organization" ? (
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="conversion-search">
                      {t("search")}
                    </FieldLabel>
                    <Input
                      id="conversion-search"
                      type="search"
                      value={search}
                      maxLength={200}
                      disabled={busy}
                      onChange={(e) =>
                        change(() => {
                          setSearch(e.target.value);
                          setPage(0);
                        })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="conversion-organization">
                      {t("contactKind_organization")}
                    </FieldLabel>
                    <Select
                      items={(organizations.data?.records ?? []).map((r) => ({
                        value: r.id,
                        label: r.keyword,
                      }))}
                      value={organizationId || null}
                      onValueChange={(value) =>
                        change(() => setOrganizationId(value ?? ""))
                      }
                      disabled={busy || organizations.isFetching}
                    >
                      <SelectTrigger
                        id="conversion-organization"
                        className="w-full"
                      >
                        <SelectValue placeholder={t("noSelection")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {(organizations.data?.records ?? []).map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.keyword}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  {organizations.isError ? (
                    <ErrorNotice error={organizations.error} />
                  ) : null}
                  <div className="flex justify-between gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!page || busy}
                      onClick={() => setPage(page - 1)}
                    >
                      {t("previous")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        busy ||
                        (page + 1) * 25 >= (organizations.data?.total ?? 0)
                      }
                      onClick={() => setPage(page + 1)}
                    >
                      {t("next")}
                    </Button>
                  </div>
                </FieldGroup>
              ) : null}
              {additional.length ? (
                <FieldSet>
                  <FieldLegend>{kindLabel(targetKind)}</FieldLegend>
                  <FieldGroup>
                    {additional.map((field) => (
                      <CustomFieldControl
                        idPrefix="conversion-"
                        key={field.id}
                        field={{
                          ...field,
                          required:
                            field.required ||
                            (targetKind === p.kinds.person &&
                              field.id === p.fields.last_name),
                        }}
                        value={
                          Object.hasOwn(currentValues, field.technicalName)
                            ? currentValues[field.technicalName]
                            : localizedFieldDraft(
                                field,
                                (record[field.technicalName] as FieldValue) ??
                                  null,
                                regional,
                              )
                        }
                        workspaceId={definition.workspaceId}
                        objectTypeId={definition.id}
                        disabled={busy}
                        onChange={(value) =>
                          change(() =>
                            setContactValues((old) => ({
                              ...old,
                              [record.id]: {
                                ...old[record.id],
                                [field.technicalName]: value,
                              },
                            })),
                          )
                        }
                      />
                    ))}
                  </FieldGroup>
                </FieldSet>
              ) : null}
              {inspection.isError ? (
                <ErrorNotice error={inspection.error} />
              ) : null}
              {execution.isError ? (
                <ErrorNotice error={execution.error} />
              ) : null}
              {inspection.isPending ? <Loading /> : null}
              {preview ? (
                <>
                  <Alert>
                    <AlertDescription>
                      {t("contactConversionPreserves")}
                      {action === "dissolve_organization"
                        ? ` ${t("contactConversionKeepsOrganization")}`
                        : ""}
                    </AlertDescription>
                  </Alert>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table className="table-fixed [&_th]:whitespace-normal [&_td]:whitespace-normal [&_td]:[overflow-wrap:anywhere]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("before")}</TableHead>
                          <TableHead>{t("after")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.changes.map((row) => (
                          <TableRow key={row.recordId}>
                            <TableCell><p>{kindLabel(row.from)}</p><p className="wrap-anywhere text-muted-foreground">{row.keyword}</p></TableCell>
                            <TableCell><p>{kindLabel(row.to)}</p><p className="wrap-anywhere font-medium">{row.targetKeyword}</p></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {preview.changes.map((row) => (
                    <div key={row.recordId} className="flex flex-col gap-2">
                      <p className="font-medium">{row.targetKeyword}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("contactKind_organization")}:{" "}
                        {row.organizationLabel ?? t("contactConversionOrganizationRemoved")}
                      </p>
                      <dl className="grid gap-2 sm:grid-cols-2">
                        {Object.entries(row.values)
                          .filter(([key]) => key !== kindField.technicalName)
                          .map(([key, value]) => {
                            const f = definition.fields.find(
                              (f) => f.technicalName === key,
                            );
                            return (
                              <div key={key}>
                                <dt className="text-sm text-muted-foreground">
                                  {f?.label ?? key}
                                </dt>
                                <dd className="wrap-anywhere text-sm">
                                  {f
                                    ? `${displayFieldValue(f, row.sourceInheritance.find((item) => item.fieldId === p.fields[f.id === p.fields.company_name ? "organization_name" : f.id === p.fields.commercial_register ? "organization_commercial_register" : ""])?.value ?? row.beforeValues[key], i18n.language, t)} → ${displayFieldValue(f, value, i18n.language, t)}`
                                    : String(value ?? "—")}
                                </dd>
                              </div>
                            );
                          })}
                      </dl>
                      {row.sourceInheritance.map((item) => (
                        <p
                          key={item.fieldId}
                          className="text-sm text-muted-foreground"
                        >
                          {
                            definition.fields.find((f) => f.id === item.fieldId)
                              ?.label
                          }
                          :{" "}
                          {t(
                            item.mode === "own"
                              ? "contactOwn"
                              : "contactInherit",
                          )}
                          {item.source ? ` · ${item.source.keyword}` : ""}
                        </p>
                      ))}
                      {row.targetInheritance.length ? (
                        <dl className="grid gap-2 sm:grid-cols-2">
                          {row.targetInheritance.map((item) => (
                            <div key={item.fieldId}>
                              <dt className="text-sm text-muted-foreground">
                                {
                                  definition.fields.find(
                                    (f) => f.id === item.fieldId,
                                  )?.label
                                }
                              </dt>
                              <dd className="wrap-anywhere text-sm">
                                {t(
                                  item.mode === "own"
                                    ? "contactOwn"
                                    : "contactInherit",
                                )}
                                {` · ${item.value ?? "—"}`}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                    </div>
                  ))}
                  {action === "dissolve_organization"
                    ? preview.changes.map((row) => (
                        <FieldGroup key={row.recordId}>
                          {Array.from(
                            new Set(
                              preview.issues
                                .filter(
                                  (issue) =>
                                    issue.recordId === row.recordId &&
                                    issue.fieldId,
                                )
                                .map((issue) => issue.fieldId!),
                            ),
                          ).map((id) => {
                            const field = definition.fields.find(
                              (f) => f.id === id,
                            );
                            if (
                              !field ||
                              field.isDerived ||
                              field.fieldPermissions?.edit === false
                            )
                              return null;
                            return (
                              <CustomFieldControl
                                key={id}
                                idPrefix={`conversion-${row.recordId}-`}
                                field={{
                                  ...field,
                                  label: `${row.keyword} · ${field.label}`,
                                }}
                                value={
                                  contactValues[row.recordId]?.[
                                    field.technicalName
                                  ] ??
                                  row.values[field.technicalName] ??
                                  null
                                }
                                workspaceId={definition.workspaceId}
                                objectTypeId={definition.id}
                                disabled={busy}
                                onChange={(value) => {
                                  setContactValues((old) => ({
                                    ...old,
                                    [row.recordId]: {
                                      ...old[row.recordId],
                                      [field.technicalName]: value,
                                    },
                                  }));
                                  execution.reset();
                                }}
                              />
                            );
                          })}
                        </FieldGroup>
                      ))
                    : null}
                  {preview.issues.map((issue, index) => (
                    <Alert variant="destructive" key={index}>
                      <AlertDescription>
                        {t(`contactConversionIssue_${issue.code}`)}
                        {issue.fieldId
                          ? ` · ${definition.fields.find((f) => f.id === issue.fieldId)?.label ?? t("field")}`
                          : ""}
                      </AlertDescription>
                    </Alert>
                  ))}
                </>
              ) : null}
            </FieldGroup>
          </div>
          <DialogActions
            disabled={busy}
            onClose={close}
            closeLabel={t("cancel")}
          >
            <Button
              type="button"
              variant={preview?.canExecute ? "outline" : "default"}
              disabled={
                busy || (action === "existing_organization" && !organizationId)
              }
              onClick={() => inspection.mutate()}
            >
              {t("contactConversionPreview")}
            </Button>
            {preview?.canExecute ? (
              <Button
                type="button"
                disabled={busy}
                onClick={() => execution.mutate()}
              >
                {t("contactConversionConfirm")}
              </Button>
            ) : null}
          </DialogActions>
        </DialogContent>
      </Dialog>
      <AlertDialog open={discard} onOpenChange={setDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("discard")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("contactConversionDiscard")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("keepEditing")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setDiscard(false);
                onClose();
              }}
            >
              {t("discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
