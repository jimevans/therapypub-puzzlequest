import type { ComponentProps } from "react";
import {
  type Control,
  Controller,
  type FieldPath,
  type FieldValues,
  type RegisterOptions,
} from "react-hook-form";
import { TextField } from "./TextField";

interface FormTextFieldProps<Values extends FieldValues> extends Omit<
  ComponentProps<typeof TextField>,
  "name" | "value" | "defaultValue" | "onChange" | "onBlur" | "inputRef"
> {
  control: Control<Values>;
  name: FieldPath<Values>;
  rules?: RegisterOptions<Values, FieldPath<Values>>;
}

/** A TextField connected to a React Hook Form, showing that field's error. */
export function FormTextField<Values extends FieldValues>({
  control,
  name,
  rules,
  ...props
}: FormTextFieldProps<Values>) {
  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field: { ref, ...field }, fieldState: { error } }) => (
        <TextField
          {...props}
          {...field}
          inputRef={ref}
          errorMessage={error?.message}
        />
      )}
    />
  );
}
