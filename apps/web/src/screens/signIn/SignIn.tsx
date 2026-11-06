import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router";
import { api, dataOrThrow, messageOf } from "../../api";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";
import { FormTextField } from "../../ui/FormTextField";
import styles from "./SignIn.module.css";
import { pathAfterSignIn } from "./pathAfterSignIn";

interface Credentials {
  userName: string;
  password: string;
}

export function SignIn() {
  const [searchParams] = useSearchParams();
  const next = searchParams.get("next");
  const { control, handleSubmit } = useForm<Credentials>({
    defaultValues: { userName: "", password: "" },
  });
  const signIn = useMutation({
    mutationFn: async (credentials: Credentials) =>
      dataOrThrow(await api.POST("/sessions", { body: credentials })),
    onSuccess: () => {
      // The server has set the session cookie. A full load, because the next
      // page may not be part of this app yet.
      location.assign(pathAfterSignIn(next));
    },
  });

  return (
    <>
      <title>Sign in · PuzzleQuest</title>
      <h1>Sign in</h1>
      {signIn.error && <Banner tone="danger">{messageOf(signIn.error)}</Banner>}
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          void handleSubmit((credentials) => signIn.mutate(credentials))(event);
        }}
      >
        <FormTextField
          control={control}
          name="userName"
          rules={{ required: "Enter your user name" }}
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
          rules={{ required: "Enter your password" }}
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
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
        <Link to="/user/password/forgot">Forgot password?</Link>
        <Link
          to={
            next
              ? `/user/register?next=${encodeURIComponent(next)}`
              : "/user/register"
          }
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
