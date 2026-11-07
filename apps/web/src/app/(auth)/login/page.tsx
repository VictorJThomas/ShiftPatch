import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/login-form";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";

export const metadata: Metadata = { title: "Sign in" };

const POINTS = ["Credentials checked before every claim", "Live coverage across all agencies", "Full audit log"];

export default function LoginPage() {
  return (
    <div className="login">
      <aside className="login-aside">
        <Logo size={48} wordSize={34} inverse />
        <div className="col" style={{ gap: 20, maxWidth: "30ch" }}>
          <h2>Every shift covered. Every action on record.</h2>
          <p style={{ fontSize: 18, opacity: 0.9 }}>Agencies post. Nurses claim. Hospitals see it all, as it happens.</p>
        </div>
        <ul style={{ display: "flex", flexDirection: "column", gap: 10, fontWeight: 600 }}>
          {POINTS.map((point) => (
            <li key={point} className="row" style={{ gap: 10 }}>
              <Icon name="check-circle" />
              {point}
            </li>
          ))}
        </ul>
      </aside>
      <main className="login-main">
        <div className="login-brand">
          <Logo size={44} wordSize={30} />
        </div>
        <LoginForm />
        <p className="muted login-foot">Times are shown in facility-local time, 24-hour.</p>
      </main>
    </div>
  );
}
