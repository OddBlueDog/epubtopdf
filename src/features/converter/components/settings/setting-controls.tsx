/**
 * Generic, typed setting controls. Each one binds a single value to a labelled field;
 * the settings panel composes them without knowing about any widget details.
 */
import type { ReactNode } from "react";
import { useId } from "react";

import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { NumericRange } from "@/core/settings";
import { typedEntries } from "@/lib/object";

export type Option<T extends string> = {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
};

/** Builds typed options from one of the settings option records. */
export const optionsFrom = <T extends string>(
  record: Readonly<Record<T, { readonly label: string; readonly description?: string }>>,
): Option<T>[] =>
  typedEntries(record).map(([value, { label, description }]) =>
    description === undefined ? { value, label } : { value, label, description },
  );

const findOption = <T extends string>(
  options: readonly Option<T>[],
  value: string,
): Option<T> | undefined => options.find((option) => option.value === value);

type BaseProps = {
  readonly label: string;
  readonly description?: ReactNode;
  readonly disabled?: boolean;
};

export const SelectSetting = <T extends string>({
  label,
  description,
  disabled = false,
  value,
  options,
  onChange,
}: BaseProps & {
  readonly value: T;
  readonly options: readonly Option<T>[];
  readonly onChange: (value: T) => void;
}) => {
  const id = useId();
  return (
    <Field data-disabled={disabled}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          const option = findOption(options, next);
          if (option !== undefined) {
            onChange(option.value);
          }
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
              {option.description === undefined ? null : (
                <span className="text-muted-foreground">{option.description}</span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description === undefined ? null : <FieldDescription>{description}</FieldDescription>}
    </Field>
  );
};

export const SegmentedSetting = <T extends string>({
  label,
  description,
  disabled = false,
  value,
  options,
  onChange,
}: BaseProps & {
  readonly value: T;
  readonly options: readonly Option<T>[];
  readonly onChange: (value: T) => void;
}) => (
  <Field data-disabled={disabled}>
    <FieldLabel>{label}</FieldLabel>
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={0}
      className="w-full"
      value={value}
      disabled={disabled}
      aria-label={label}
      onValueChange={(next) => {
        const option = findOption(options, next);
        if (option !== undefined) {
          onChange(option.value);
        }
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value} className="flex-1">
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
    {description === undefined ? null : <FieldDescription>{description}</FieldDescription>}
  </Field>
);

export const SliderSetting = ({
  label,
  description,
  disabled = false,
  value,
  range,
  format,
  onChange,
}: BaseProps & {
  readonly value: number;
  readonly range: NumericRange;
  readonly format: (value: number) => string;
  readonly onChange: (value: number) => void;
}) => {
  const id = useId();
  return (
    <Field data-disabled={disabled}>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <output htmlFor={id} className="text-sm font-medium text-muted-foreground tabular-nums">
          {format(value)}
        </output>
      </div>
      <Slider
        id={id}
        min={range.min}
        max={range.max}
        step={range.step}
        value={[value]}
        disabled={disabled}
        aria-label={label}
        onValueChange={([next]) => {
          if (next !== undefined) {
            onChange(next);
          }
        }}
      />
      {description === undefined ? null : <FieldDescription>{description}</FieldDescription>}
    </Field>
  );
};

export const SwitchSetting = ({
  label,
  description,
  disabled = false,
  checked,
  onChange,
}: BaseProps & {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) => {
  const id = useId();
  return (
    <Field orientation="horizontal" data-disabled={disabled}>
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description === undefined ? null : <FieldDescription>{description}</FieldDescription>}
      </FieldContent>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </Field>
  );
};
