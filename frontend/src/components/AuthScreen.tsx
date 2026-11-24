import { useState, type FormEvent } from "react";
import { API_BASE_URL } from "../api";
import "./AuthScreen.css";

export type SessionUser = { id: number; email: string; full_name: string };

type Props = { onAuthenticated: (token: string, user: SessionUser) => void };

function AuthScreen({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      const endpoint = mode === "register" ? "/auth/register" : "/auth/login";
      const body = mode === "register" ? { full_name: name, email, password } : { email, password };
      const response = await fetch(`${API_BASE_URL}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { detail?: string; token?: string; user?: SessionUser };
      if (!response.ok || !data.token || !data.user) throw new Error(data.detail || "Unable to sign in. Please try again.");
      onAuthenticated(data.token, data.user);
    } catch (err) { setError(err instanceof Error ? err.message : "Connection failed. Is the VoiceShield service running?"); }
    finally { setLoading(false); }
  };

  return <main className="auth-screen"><div className="auth-backdrop"><div className="auth-glow glow-one"/><div className="auth-glow glow-two"/><div className="auth-grid-lines"/></div>
    <div className="auth-card"><div className="auth-brand"><span className="auth-brand-mark"><i>V</i></span><span><strong>VoiceShield AI</strong><small>VOICE SECURITY PLATFORM</small></span></div>
      <div className="auth-headline"><span className="auth-kicker"><i/> PRIVATE VOICE INTELLIGENCE</span><h1>{mode === "login" ? <>Welcome<br/><em>back.</em></> : <>Secure your<br/><em>workspace.</em></>}</h1><p>{mode === "login" ? "Sign in to review your voice security insights." : "Create an account to start protecting your conversations."}</p></div>
      <form className="auth-form" onSubmit={submit}>
        {mode === "register" && <label>Full name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" minLength={2} maxLength={80} required/></label>}
        <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" required/></label>
        <label>Password<span className="password-wrap"><input type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "register" ? "At least 12 characters" : "Enter your password"} minLength={mode === "register" ? 12 : 1} maxLength={256} required/><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></span></label>
        {mode === "register" && <span className="password-hint">Use 12 or more characters for your password.</span>}
        {error && <div className="auth-error" role="alert"><span>!</span>{error}</div>}
        <button className="auth-submit" disabled={loading}>{loading ? <><i className="auth-spinner"/> {mode === "login" ? "Signing in…" : "Creating account…"}</> : <>{mode === "login" ? "Sign in securely" : "Create secure account"}<span>→</span></>}</button>
      </form>
      <p className="auth-switch">{mode === "login" ? "New to VoiceShield?" : "Already have an account?"}<button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Create an account" : "Sign in"}</button></p>
      <div className="auth-foot"><span><i/> Private API access</span><span>12 hour session</span><span>Local workspace</span></div>
    </div><div className="auth-side-note"><span className="auth-orbit"><i/><b/><em/></span><span>TRUST EVERY SIGNAL</span></div>
  </main>;
}

export default AuthScreen;
