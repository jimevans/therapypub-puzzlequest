import type { Schemas } from "@puzzlequest/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router";
import { ApiError, api, dataOrThrow, messageOf } from "../../api";
import { isAdministrator, useSession } from "../../session";
import { fieldErrorsOf } from "../../fieldErrors";
import { Banner } from "../../ui/Banner";
import { Button } from "../../ui/Button";
import styles from "./Account.module.css";
import { UserFields } from "./UserFields";
import { type AccountFormValues, formatPhone } from "./accountForm";
import { userQuery } from "./userQuery";

function EditForm({
  user,
  canChooseRole,
}: {
  user: Schemas["User"];
  canChooseRole: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profilePath = `/user/${encodeURIComponent(user.userName)}`;
  const { control, register, handleSubmit, setError } =
    useForm<AccountFormValues>({
      defaultValues: {
        userName: user.userName,
        displayName: user.displayName,
        email: user.email,
        phone: formatPhone(user.phone),
        sms: user.sms,
        password: "",
        confirmPassword: "",
        role: user.role,
      },
    });
  const save = useMutation({
    mutationFn: async ({
      displayName,
      email,
      phone,
      sms,
      role,
    }: AccountFormValues) =>
      dataOrThrow(
        await api.PATCH("/users/{userName}", {
          params: { path: { userName: user.userName } },
          body: {
            displayName,
            email,
            phone,
            sms,
            ...(canChooseRole ? { role } : {}),
          },
        })
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries(userQuery(user.userName)),
        queryClient.invalidateQueries({ queryKey: ["session"] }),
      ]);
      await navigate(profilePath);
    },
    onError: (error) => {
      fieldErrorsOf<keyof AccountFormValues>(error).forEach(
        ({ field, message }) => setError(field, { message })
      );
    },
  });
  const showBanner = save.error && fieldErrorsOf(save.error).length === 0;

  return (
    <>
      <h1>Edit details</h1>
      <p>User name: {user.userName}</p>
      {showBanner && <Banner tone="danger">{messageOf(save.error)}</Banner>}
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          void handleSubmit((values) => save.mutate(values))(event);
        }}
      >
        <UserFields
          control={control}
          register={register}
          isEditing
          canChooseRole={canChooseRole}
        />
        <Button
          id="save-profile"
          type="submit"
          variant="primary"
          isPending={save.isPending}
        >
          Save
        </Button>
      </form>
      <Link to={profilePath}>Cancel</Link>
    </>
  );
}

/** Edits a user's details: their own, or anyone's for an administrator. */
export function EditProfile() {
  const userName = useParams().userName ?? "";
  const session = useSession();
  const user = useQuery(userQuery(userName));
  const gone = user.error instanceof ApiError && user.error.status === 404;

  return (
    <>
      <title>Edit details · PuzzleQuest</title>
      {gone ? (
        <>
          <h1>User not found</h1>
          <a href="/">Go to the home page</a>
        </>
      ) : user.data && session.data !== undefined ? (
        <EditForm
          user={user.data}
          canChooseRole={isAdministrator(session.data?.user)}
        />
      ) : (
        user.isError && <Banner tone="danger">{messageOf(user.error)}</Banner>
      )}
    </>
  );
}
