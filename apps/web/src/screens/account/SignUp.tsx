import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router";
import { api, dataOrThrow, messageOf } from "../../api";
import { useSession } from "../../session";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";
import { FormTextField } from "../../ui/FormTextField";
import { pathAfterSignIn } from "../signIn/pathAfterSignIn";
import styles from "./Account.module.css";
import { UserFields } from "./UserFields";
import { PASSWORDS_DIFFER, newPasswordRules } from "./passwords";
import {
  type AccountFormValues,
  fieldErrorsOf,
  isAdministrator,
} from "./accountForm";

/** The form for signing up, or for an administrator creating a user. */
function SignUpForm({ forAdministrator }: { forAdministrator: boolean }) {
  const [searchParams] = useSearchParams();
  const next = searchParams.get("next");
  const { control, register, handleSubmit, getValues, setError } =
    useForm<AccountFormValues>({
      defaultValues: {
        userName: "",
        displayName: "",
        email: "",
        phone: "",
        sms: false,
        password: "",
        confirmPassword: "",
        authorizationLevel: 1,
      },
    });
  const signUp = useMutation({
    mutationFn: async ({
      confirmPassword: _confirmPassword,
      authorizationLevel,
      ...details
    }: AccountFormValues) => {
      dataOrThrow(
        await api.POST("/users", {
          body: forAdministrator ? { ...details, authorizationLevel } : details,
        })
      );
      // An administrator stays who they are. Anyone else carries straight on as
      // the new player; if that fails, the account is fine, and they can sign in.
      if (forAdministrator) {
        return "/";
      }
      const session = await api.POST("/sessions", {
        body: { userName: details.userName, password: details.password },
      });
      const destination = pathAfterSignIn(next);
      return session.response.ok
        ? destination
        : `/login?next=${encodeURIComponent(destination)}`;
    },
    // A full load, because the next page may not be part of this app yet.
    onSuccess: (destination) => location.assign(destination),
    onError: (error) => {
      fieldErrorsOf(error).forEach(({ field, message }) =>
        setError(field, { message })
      );
    },
  });
  const showBanner = signUp.error && fieldErrorsOf(signUp.error).length === 0;

  return (
    <>
      <h1>{forAdministrator ? "Create a user" : "Sign up"}</h1>
      {showBanner && <Banner tone="danger">{messageOf(signUp.error)}</Banner>}
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          void handleSubmit((values) => signUp.mutate(values))(event);
        }}
      >
        <FormTextField
          control={control}
          name="userName"
          rules={{ required: "Enter a user name" }}
          id="user-name"
          label="User name"
          autoComplete="username"
          inputProps={{
            autoCapitalize: "none",
            autoCorrect: "off",
            spellCheck: false,
          }}
        />
        <FormTextField
          control={control}
          name="password"
          rules={newPasswordRules}
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
        />
        <FormTextField
          control={control}
          name="confirmPassword"
          rules={{
            validate: (value) =>
              value === getValues("password") || PASSWORDS_DIFFER,
          }}
          id="password-confirm"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
        />
        <UserFields
          control={control}
          register={register}
          isEditing={false}
          canChooseLevel={forAdministrator}
        />
        <Button
          id="sign-up"
          type="submit"
          variant="primary"
          isDisabled={signUp.isPending || signUp.isSuccess}
        >
          {forAdministrator ? "Create user" : "Sign up"}
        </Button>
      </form>
      {!forAdministrator && (
        <p className={styles.note}>
          Already have an account?{" "}
          <Link
            to={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          >
            Sign in
          </Link>
        </p>
      )}
    </>
  );
}

/** Signing up: for someone new, or an administrator creating a user. */
export function SignUp() {
  const session = useSession();
  const user = session.data?.user;

  return (
    <>
      <title>Sign up · PuzzleQuest</title>
      {session.isPending ? null : user && !isAdministrator(user) ? (
        <>
          <h1>You're already signed in</h1>
          <p>To create a new account, sign out first.</p>
          <a href="/">Go to your quests</a>
        </>
      ) : (
        <SignUpForm forAdministrator={isAdministrator(user)} />
      )}
    </>
  );
}
