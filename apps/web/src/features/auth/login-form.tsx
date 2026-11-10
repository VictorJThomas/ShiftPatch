"use client";

import "@/lib/zod-csp"; // first: zod must be jitless before any schema is built (see the module)
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { LoginRequest } from "@shiftpatch/contracts";
import { Button } from "@/components/shadcn/button";
import { Icon } from "@/components/ui/Icon";
import { ApiError } from "@/lib/api-client";
import { HOME_BY_ROLE } from "@/lib/routes";
import { useSessionStore } from "@/stores/session";
import { notify, useToastStore } from "@/stores/toasts";
import { login } from "./session-flow";

type Fields = { email: string; password: string };

const emailMessage = "Enter a valid email address";
const passwordMessage = (type?: string) => (type === "too_big" ? "Password is too long" : "Enter your password");

export function LoginForm() {
  const router = useRouter();
  const status = useSessionStore((s) => s.status);
  const role = useSessionStore((s) => s.user?.role);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Fields>({ resolver: zodResolver(LoginRequest), defaultValues: { email: "", password: "" } });

  // Already signed in (restored session, or login just succeeded): go home. Single source of the post-login redirect.
  useEffect(() => {
    if (status === "authenticated" && role) router.replace(HOME_BY_ROLE[role]);
  }, [status, role, router]);

  const onSubmit = handleSubmit(async (values) => {
    useToastStore.getState().clear();
    try {
      await login({ email: values.email.trim(), password: values.password });
    } catch (error) {
      // Server text verbatim (401 "Invalid email or password", 429 "Too many requests, ..."), never a guess.
      notify.error(error instanceof ApiError ? error.message : "Something went wrong. Try again.");
    }
  });

  const busy = isSubmitting || (status === "authenticated" && !!role);

  return (
    <form className="login-form" onSubmit={onSubmit} noValidate aria-busy={busy}>
      <h1>Sign in</h1>
      <p className="login-sub" style={{ color: "var(--c-ink-2)", marginBottom: 22 }}>
        Nurse, agency or hospital admin — same login.
      </p>

      <div className="fld">
        <label className="lbl" htmlFor="login-email">
          Email
        </label>
        <div className={`inp${errors.email ? " err" : ""}`}>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            inputMode="email"
            placeholder="you@example.com"
            data-testid="login-email-input"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "login-email-err" : undefined}
            {...register("email")}
          />
        </div>
        {errors.email && (
          <p className="errmsg" id="login-email-err">
            <Icon name="alert-circle" size="sm" />
            {emailMessage}
          </p>
        )}
      </div>

      <div className="fld">
        <label className="lbl" htmlFor="login-password">
          Password
        </label>
        <div className={`inp${errors.password ? " err" : ""}`}>
          <input
            id="login-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Your password"
            data-testid="login-password-input"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "login-password-err" : undefined}
            {...register("password")}
          />
          <Button variant="ghost" size="sm" aria-pressed={showPassword} onClick={() => setShowPassword((v) => !v)}>
            {showPassword ? "Hide" : "Show"}
            <span className="sr"> password</span>
          </Button>
        </div>
        {errors.password && (
          <p className="errmsg" id="login-password-err">
            <Icon name="alert-circle" size="sm" />
            {passwordMessage(errors.password.type)}
          </p>
        )}
      </div>

      <Button type="submit" block loading={busy} style={{ minHeight: 52, fontSize: 16 }} data-testid="login-submit-button" aria-busy={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
