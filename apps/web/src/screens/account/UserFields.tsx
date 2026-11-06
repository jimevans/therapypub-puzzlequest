import { useState } from "react";
import type { Control, UseFormRegister } from "react-hook-form";
import { Button } from "../../ui/Button";
import { FormTextField } from "../../ui/FormTextField";
import styles from "./Account.module.css";
import { AUTHORIZATION_LEVELS, type AccountFormValues } from "./accountForm";

/**
 * Consent to text messages, in words that are part of what players agree to, so
 * change them only deliberately.
 */
function SmsConsent() {
  return (
    <p id="more-info" className={styles.note}>
      Checking this box gives The PuzzleQuest Game consent to send you mobile
      text (SMS) messages. These messages will come from The PuzzleQuest Game
      number (813-296-5411). The PuzzleQuest Game does not charge for these
      services, but messaging and data rates from your mobile provider may
      apply. You may opt out of receiving the messages at any time by replying
      "STOP", or by unchecking this checkbox. See our{" "}
      <a href="/policies/privacy.html">Privacy Policy</a> for full details.
    </p>
  );
}

interface UserFieldsProps {
  control: Control<AccountFormValues>;
  register: UseFormRegister<AccountFormValues>;
  /** Editing an existing user, whose new email address must be verified. */
  isEditing: boolean;
  /** Only an administrator may choose an authorization level. */
  canChooseLevel: boolean;
}

/** The details of a user, as both signing up and editing a profile ask them. */
export function UserFields({
  control,
  register,
  isEditing,
  canChooseLevel,
}: UserFieldsProps) {
  const [showConsent, setShowConsent] = useState(false);
  return (
    <>
      <FormTextField
        control={control}
        name="displayName"
        rules={{ required: "Enter a display name" }}
        id="display-name"
        label="Display name"
        autoComplete="name"
      />
      <FormTextField
        control={control}
        name="email"
        rules={{ required: "Enter an email address" }}
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        description={
          isEditing
            ? "Changing it sends a link to the new address to verify it."
            : undefined
        }
        inputProps={{ autoCapitalize: "none", autoCorrect: "off" }}
      />
      <FormTextField
        control={control}
        name="phone"
        id="phone"
        label="Phone number"
        type="tel"
        autoComplete="tel"
        description="US and Canadian numbers only, for now."
      />
      <div className={styles.checkbox}>
        <input id="allow-sms" type="checkbox" {...register("sms")} />
        <label htmlFor="allow-sms">Allow sending of SMS messages</label>
        {!showConsent && (
          <Button id="more-info-link" onPress={() => setShowConsent(true)}>
            More info
          </Button>
        )}
      </div>
      {showConsent && <SmsConsent />}
      {canChooseLevel && (
        <div className={styles.field}>
          <label htmlFor="auth-level">Authorization level</label>
          <select
            id="auth-level"
            className={styles.select}
            {...register("authorizationLevel", { valueAsNumber: true })}
          >
            {AUTHORIZATION_LEVELS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
