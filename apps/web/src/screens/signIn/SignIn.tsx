import { useMutation } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { useSearchParams } from "react-router";
import { ApiError, api, dataOrThrow } from "../../api";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";
import { TextField } from "../../ui/TextField";
import styles from "./SignIn.module.css";

interface Credentials {
  userName: string;
  password: string;
}

/**
 * Decides where to go after signing in. The address comes from the URL, which
 * anyone can write a link with, so it must be a path on this site, rather than
 * an address elsewhere such as "//example.com" (or "/\example.com", which
 * browsers read the same way).
 * @param next the page that asked for sign-in, if any
 * @returns the path to go to
 */
export function pathAfterSignIn(next: string | null): string {
  return next && /^\/(?![/\\])/.test(next) ? next : "/";
}

export function SignIn() {
  const [searchParams] = useSearchParams();
  const { control, handleSubmit } = useForm<Credentials>({
    defaultValues: { userName: "", password: "" },
  });
  const signIn = useMutation({
    mutationFn: async (credentials: Credentials) =>
      dataOrThrow(await api.POST("/sessions", { body: credentials })),
    onSuccess: () => {
      // The server has set the session cookie. A full load, because the next
      // page may not be part of this app yet.
      location.assign(pathAfterSignIn(searchParams.get("next")));
    },
  });

  return (
    <>
      <title>Sign in · PuzzleQuest</title>
      <h1>Sign in</h1>
      {signIn.error && (
        <Banner tone="danger">
          {signIn.error instanceof ApiError
            ? signIn.error.message
            : "Couldn't reach the server. Check your connection and try again."}
        </Banner>
      )}
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          void handleSubmit((credentials) => signIn.mutate(credentials))(event);
        }}
      >
        <Controller
          control={control}
          name="userName"
          rules={{ required: "Enter your user name" }}
          render={({ field: { ref, ...field }, fieldState: { error } }) => (
            <TextField
              {...field}
              id="user-name"
              inputRef={ref}
              label="User name"
              autoComplete="username"
              inputProps={{
                autoCapitalize: "none",
                autoCorrect: "off",
                spellCheck: false,
              }}
              errorMessage={error?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          rules={{ required: "Enter your password" }}
          render={({ field: { ref, ...field }, fieldState: { error } }) => (
            <TextField
              {...field}
              id="password"
              inputRef={ref}
              label="Password"
              type="password"
              autoComplete="current-password"
              errorMessage={error?.message}
            />
          )}
        />
        <Button
          id="login"
          type="submit"
          variant="primary"
          isDisabled={signIn.isPending || signIn.isSuccess}
        >
          Sign in
        </Button>
      </form>
      <p className={styles.links}>
        <a href="/user/password/forgot">Forgot password?</a>
        <a href="/user/register">Create an account</a>
      </p>
    </>
  );
}
