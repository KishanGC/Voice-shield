import { useCallback, useEffect, useState } from "react";
import AudioWaveform, { type ModelInputWaveform } from "./components/AudioWaveform";
import MicrophoneRecorder from "./components/MicrophoneRecorder";
import LiveAudioStreaming from "./components/LiveAudioStreaming";
import SecondaryVerification from "./components/SecondaryVerification";
import AuthScreen, { type SessionUser } from "./components/AuthScreen";
import MicrophoneIcon from "./components/MicrophoneIcon";
import DecisionEvidence, { type ModelExplanation } from "./components/DecisionEvidence";
import { API_BASE_URL } from "./api";
import "./App.css";
import "./AnalysisProgress.css";
import "./AnalysisWorkspace.css";

const TOKEN_KEY = "voiceshield.session";
type Analysis = { classification: string; spoof_probability: number; risk_level: string; risk_score: number; security_action: string; recommendation: string; assessment_basis: string; threshold_used: number; model_explanation?: ModelExplanation | null; model_input_waveform?: ModelInputWaveform | null };
type Transcript = { transcript: string; language_code: string | null; request_id: string | null };
type RecordItem = { id: number; filename: string; classification: string; spoof_probability: number; risk_level: string; recommendation: string; threshold_used: number; created_at: string; transcript: string | null; language_code: string | null; risk_score: number | null; security_action: string | null; assessment_basis: string | null };
type ApiError = { detail?: string };
type AnalysisStage = "model" | "transcription" | null;

const navItems = [
  ["overview", "Overview", "◫"], ["live", "Live detection", "◉"],
  ["analysis", "Audio analysis", "♫"], ["analytics", "Analytics", "⌁"],
  ["reports", "Reports", "▤"], ["history", "History", "◷"], ["settings", "Settings", "⚙"],
] as const;
const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const labelClass = (value: string) => value.toUpperCase() === "SPOOF" ? "spoof" : "genuine";

function App() {
  const [authToken, setAuthToken] = useState(() => window.localStorage.getItem(TOKEN_KEY) || "");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(() => {
    const preference = window.localStorage.getItem("voiceshield.motion");
    return preference === "on" || (preference !== "off" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [transcription, setTranscription] = useState<Transcript | null>(null);
  const [history, setHistory] = useState<RecordItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<AnalysisStage>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [activeNav, setActiveNav] = useState("overview");

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  useEffect(() => {
    let mounted = true;
    const existingToken = window.localStorage.getItem(TOKEN_KEY);
    if (!existingToken) { setAuthReady(true); return () => { mounted = false; }; }
    fetch(`${API_BASE_URL}/auth/me`, { headers: { Authorization: `Bearer ${existingToken}` } })
      .then(async (response) => {
        const data = await response.json() as { user?: SessionUser };
        if (!response.ok || !data.user) throw new Error("Session expired");
        if (mounted) { setAuthToken(existingToken); setUser(data.user); }
      })
      .catch(() => { window.localStorage.removeItem(TOKEN_KEY); if (mounted) setAuthToken(""); })
      .finally(() => { if (mounted) setAuthReady(true); });
    return () => { mounted = false; };
  }, []);

  const loadHistory = useCallback(async () => {
    if (!authToken) return;
    setHistoryLoading(true); setHistoryError("");
    try {
      const response = await fetch(`${API_BASE_URL}/history/`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!response.ok) throw new Error("Unable to load analysis history.");
      const data = await response.json();
      if (!data.success) throw new Error("The history service returned an invalid response.");
      setHistory(data.history);
    } catch (err) { setHistoryError(err instanceof Error ? err.message : "Unable to load history."); }
    finally { setHistoryLoading(false); }
  }, [authToken]);
  useEffect(() => { if (authReady && authToken) void loadHistory(); }, [authReady, authToken, loadHistory]);
  useEffect(() => {
    let mounted = true;
    fetch(`${API_BASE_URL}/health`).then((response) => {
      if (!response.ok) throw new Error("Backend unavailable");
      return response.json();
    }).then((data: { status?: string }) => { if (mounted) setBackendOnline(data.status === "healthy"); })
      .catch(() => { if (mounted) setBackendOnline(false); });
    return () => { mounted = false; };
  }, []);

  const selectFile = (selected: File | null) => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setError(""); setAnalysis(null); setTranscription(null);
    if (!selected) { setFile(null); setAudioUrl(""); return; }
    if (!selected.name.toLowerCase().endsWith(".wav")) { setFile(null); setAudioUrl(""); setError("Combined analysis currently supports WAV audio only."); return; }
    if (selected.size > 20 * 1024 * 1024) { setFile(null); setAudioUrl(""); setError("This file exceeds the 20 MB upload limit."); return; }
    setFile(selected); setAudioUrl(URL.createObjectURL(selected));
  };

  const handleRecordingComplete = (blob: Blob) => selectFile(new File([blob], `VoiceShield_Recording_${Date.now()}.wav`, { type: "audio/wav" }));

  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true); setAnalysisStage("model"); setError(""); setAnalysis(null); setTranscription(null);
    try {
      const predictionForm = new FormData(); predictionForm.append("file", file);
      const predictionResponse = await fetch(`${API_BASE_URL}/prediction/analyze`, { method: "POST", headers: { Authorization: `Bearer ${authToken}` }, body: predictionForm });
      const predictionJson = await predictionResponse.json() as { detail?: string; success?: boolean; history_id?: number; analysis?: Analysis };
      if (!predictionResponse.ok || !predictionJson.success || !predictionJson.analysis) throw new Error(predictionJson.detail || "Voice analysis failed.");
      setAnalysis(predictionJson.analysis);

      // Transcription uses the same selected file; it is an independent backend service.
      setAnalysisStage("transcription");
      const transcriptionForm = new FormData(); transcriptionForm.append("file", file);
      try {
        const transcriptionResponse = await fetch(`${API_BASE_URL}/transcription/analyze`, { method: "POST", headers: { Authorization: `Bearer ${authToken}` }, body: transcriptionForm });
        const transcriptionJson = await transcriptionResponse.json() as { detail?: string; transcription?: Transcript };
        if (!transcriptionResponse.ok || !transcriptionJson.transcription) throw new Error(transcriptionJson.detail || "Transcription is unavailable.");
        setTranscription(transcriptionJson.transcription);
        const saved = await fetch(`${API_BASE_URL}/prediction/history/${predictionJson.history_id}/transcription`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ transcript: transcriptionJson.transcription.transcript || "", language_code: transcriptionJson.transcription.language_code }) });
        if (!saved.ok) { const data = await saved.json() as ApiError; throw new Error(data.detail || "Transcription could not be saved to history."); }
      } catch (transcriptionError) {
        setError(transcriptionError instanceof Error ? `Voice detection completed. ${transcriptionError.message}` : "Voice detection completed; transcription is unavailable.");
      }
      await loadHistory();
    } catch (err) { setError(err instanceof Error ? err.message : "Analysis failed. Check the backend connection and try again."); }
    finally { setLoading(false); setAnalysisStage(null); }
  };

  const reset = () => { if (audioUrl) URL.revokeObjectURL(audioUrl); setAudioUrl(""); setFile(null); setAnalysis(null); setTranscription(null); setError(""); const input = document.getElementById("audio-upload") as HTMLInputElement | null; if (input) input.value = ""; };
  const signIn = (token: string, signedInUser: SessionUser) => { window.localStorage.setItem(TOKEN_KEY, token); setAuthToken(token); setUser(signedInUser); setAuthReady(true); };
  const signOut = async () => { try { await fetch(`${API_BASE_URL}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${authToken}` } }); } catch { /* Clear the local session even if the backend is unreachable. */ } finally { window.localStorage.removeItem(TOKEN_KEY); setAuthToken(""); setUser(null); setHistory([]); reset(); } };
  const updatePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setPasswordMessage(""); setPasswordError(""); setPasswordLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/password`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) });
      const data = await response.json() as { detail?: string; token?: string };
      if (!response.ok || !data.token) throw new Error(data.detail || "Unable to update password.");
      window.localStorage.setItem(TOKEN_KEY, data.token); setAuthToken(data.token); setCurrentPassword(""); setNewPassword(""); setPasswordMessage("Password updated. Other active sessions were signed out.");
    } catch (err) { setPasswordError(err instanceof Error ? err.message : "Password update failed."); }
    finally { setPasswordLoading(false); }
  };
  const downloadReport = async (recordId: number) => {
    try {
      const response = await fetch(`${API_BASE_URL}/reports/${recordId}/pdf`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!response.ok) throw new Error("Unable to download this report.");
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = `VoiceShield_Report_${recordId}.pdf`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err instanceof Error ? err.message : "Report download failed."); }
  };
  const exportCsv = () => {
    const headers = ["ID", "Filename", "Classification", "Spoof Probability (%)", "Risk Level", "Risk Score", "Detected Language", "Recognized Speech", "Security Action", "Assessment Basis", "Threshold", "Recommendation", "Date"];
    const escape = (value: string | number | null) => `"${String(value ?? "Not available").replace(/"/g, '""')}"`;
    const rows = history.map((r) => [r.id, r.filename, r.classification, (r.spoof_probability * 100).toFixed(2), r.risk_level, (r.risk_score ?? r.spoof_probability * 100).toFixed(2), r.language_code, r.transcript, r.security_action, r.assessment_basis, r.threshold_used, r.recommendation, r.created_at]);
    const blob = new Blob(["\uFEFF" + [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "VoiceShield_Analysis_History.csv"; link.click(); URL.revokeObjectURL(url);
  };
  const jumpTo = (id: string) => { setActiveNav(id); document.getElementById(id)?.scrollIntoView({ behavior: motionEnabled ? "smooth" : "auto", block: "start" }); };
  const total = history.length;
  const spoof = history.filter((r) => r.classification === "SPOOF").length;
  const genuine = history.filter((r) => r.classification === "BONA_FIDE").length;
  const high = history.filter((r) => r.risk_level.toUpperCase() === "HIGH").length;
  const pct = (count: number) => total ? Math.round(count / total * 100) : 0;
  const riskTone = analysis?.risk_level.toLowerCase() || "low";

  if (!authReady) return <div className="auth-loading"><span className="auth-spinner"/> Loading your secure workspace…</div>;
  if (!authToken || !user) return <AuthScreen onAuthenticated={signIn} />;

  return <div className={`shell ${motionEnabled ? "" : "motion-off"}`}>
    <aside className="sidebar">
      <a className="brand" href="#overview" onClick={(e) => { e.preventDefault(); jumpTo("overview"); }}><span className="brand-mark"><i>V</i></span><span><strong>VoiceShield</strong><small>AI SECURITY PLATFORM</small></span></a>
      <div className="workspace-label">WORKSPACE</div>
      <nav aria-label="Main navigation">{navItems.map(([id, title, icon]) => <button key={id} className={`nav-link ${activeNav === id ? "active" : ""}`} onClick={() => jumpTo(id)}><span className="nav-icon">{icon}</span>{title}{id === "live" && <span className="live-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="protected-card"><span className="shield-icon">✓</span><strong>Account protected</strong><small>Signed in as {user.full_name}</small><span className="protected-line" /></div><div className="user-profile"><span className="avatar">{user.full_name.slice(0, 2).toUpperCase()}</span><span className="profile-copy"><strong>{user.full_name}</strong><small>{user.email}</small></span><button className="logout-button" onClick={() => void signOut()} title="Sign out" aria-label="Sign out of VoiceShield">↪</button></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> <strong>Overview</strong></div><div className="top-actions"><span className={`system-health ${backendOnline === false ? "offline" : ""}`}><i /> {backendOnline === null ? "Checking API" : backendOnline ? "API connected" : "API unavailable"}</span><button className="icon-button" aria-label="Notifications">♧<b /></button><span className="top-avatar">VS</span></div></header>
      <div className="page-content">
        <section className="page-heading" id="overview"><div><div className="eyebrow"><span className="eyebrow-mark">✳</span> VOICE INTELLIGENCE</div><h1>Security overview</h1><p>Monitor voice authenticity and protect every conversation.</p></div><button className="outline-button" onClick={() => void loadHistory()} disabled={historyLoading}><span>↻</span> {historyLoading ? "Refreshing" : "Refresh data"}</button></section>

        <section className="stats-grid" aria-label="Analysis summary">
          <StatCard title="Total analyses" value={total} note="All recorded checks" icon="⌁" tone="violet" animated={motionEnabled} />
          <StatCard title="Spoof detections" value={spoof} note={total ? `${pct(spoof)}% of all analyses` : "Awaiting first analysis"} icon="◉" tone="red" animated={motionEnabled} />
          <StatCard title="Genuine voices" value={genuine} note={total ? `${pct(genuine)}% of all analyses` : "Awaiting first analysis"} icon="✓" tone="green" animated={motionEnabled} />
          <StatCard title="High risk cases" value={high} note={high ? "Review recommended" : "No high risk cases"} icon="⚑" tone="blue" animated={motionEnabled} />
        </section>

        <section className="overview-grid" id="analytics">
          <div className="panel chart-panel"><div className="panel-heading"><div><span className="section-kicker">SECURITY INSIGHTS</span><h2>Detection analytics</h2></div><span className="data-chip">Based on {total} {total === 1 ? "record" : "records"}</span></div>
            {total === 0 ? <EmptyState title="Your analytics will appear here" detail="Run an audio analysis to see classification and risk distribution." /> : <div className="charts"><div className="donut-wrap"><div className="donut" style={{ "--genuine": `${pct(genuine)}%` } as React.CSSProperties}><div><strong>{total}</strong><small>analyses</small></div></div><div className="legend"><span><i className="legend-green" /> Genuine <strong>{genuine}</strong></span><span><i className="legend-red" /> Potential spoof <strong>{spoof}</strong></span></div></div><div className="risk-bars"><h3>Risk distribution</h3>{[["High risk", high, "high"], ["Medium risk", history.filter((r) => r.risk_level.toUpperCase() === "MEDIUM").length, "medium"], ["Low risk", history.filter((r) => r.risk_level.toUpperCase() === "LOW").length, "low"]].map(([name, value, tone]) => <div className="risk-row" key={name as string}><div><span>{name}</span><strong>{value}</strong></div><div className="mini-track"><i className={`fill-${tone}`} style={{ width: `${pct(value as number)}%` }} /></div></div>)}</div></div>}
          </div>
          <div className="panel status-panel"><div className="panel-heading"><div><span className="section-kicker">PROTECTION</span><h2>System status</h2></div><span className="status-check">{backendOnline === false ? "!" : "✓"}</span></div><div className="shield-illustration"><div className="shield-orbit orbit-one"/><div className="shield-orbit orbit-two"/><div className="shield-core"><span>{backendOnline === false ? "!" : "✓"}</span></div><i className="orbit-dot dot-a"/><i className="orbit-dot dot-b"/></div><div className="status-copy"><strong>{backendOnline === null ? "Checking backend connection" : backendOnline ? "Voice monitoring available" : "Backend connection unavailable"}</strong><span>{backendOnline === false ? "Start the FastAPI service to analyze audio." : "Service state reported by the FastAPI health endpoint."}</span></div><div className="status-details"><span><i /> FastAPI service <b>{backendOnline === null ? "Checking" : backendOnline ? "Connected" : "Offline"}</b></span><span><i /> Analysis history <b>{historyLoading ? "Loading" : historyError ? "Unavailable" : "Loaded"}</b></span></div></div>
        </section>

        <section className="panel analysis-panel" id="analysis"><div className="panel-heading analysis-title"><div><span className="section-kicker">AUDIO ANALYSIS WORKSPACE</span><h2>Audio file analysis</h2><p>Upload a recording, preview its reference waveform, and review the complete detection results.</p></div><span className="secure-tag">⌑ &nbsp;PRIVATE ANALYSIS</span></div>
          <div className="analysis-workspace-grid"><div className="analysis-workspace-main">
          <div className={`dropzone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); selectFile(e.dataTransfer.files[0] ?? null); }}>
            <input id="audio-upload" type="file" accept=".wav,audio/wav" onChange={(e) => selectFile(e.target.files?.[0] ?? null)} aria-label="Select WAV audio" />
            {file ? <div className="file-selected"><div className="file-icon">♫</div><div className="file-info"><strong>{file.name}</strong><span>{formatBytes(file.size)} · WAV audio</span></div><button className="remove-file" aria-label="Remove selected file" onClick={reset}>×</button></div> : <><div className="upload-symbol"><span>↑</span></div><h3>Drop your audio file here</h3><p>or <label htmlFor="audio-upload">browse files</label> from your device</p><div className="upload-meta"><span>WAV format</span><i /> <span>Maximum file size 20 MB</span></div></>}
          </div>
          <details className="recording-option"><summary><MicrophoneIcon size={15}/> Or record audio with your microphone</summary><MicrophoneRecorder onRecordingComplete={handleRecordingComplete} /></details>
          {file && audioUrl && <AudioWaveform audioUrl={audioUrl} modelInputWaveform={analysis?.model_input_waveform} />}
          {error && <div className="inline-error" role="alert"><span>!</span>{error}</div>}
          <div className="analysis-controls"><div className="privacy-note"><span>♧</span><span><strong>Your audio stays private</strong><small>Processed securely for this analysis</small></span></div><div className="control-buttons">{file && <button className="text-button" onClick={reset} disabled={loading}>Remove file</button>}<button className="primary-button" onClick={() => void handleAnalyze()} disabled={!file || loading}>{loading ? <><span className="spinner" /> Analyzing recording</> : <>Analyze audio <span>→</span></>}</button></div></div>
          {loading && (
            <div className="analysis-progress-panel" role="status" aria-live="polite">
              <div className={"analysis-stage " + (analysisStage === "model" ? "active" : "complete")}>
                <span className="analysis-stage-number">{analysisStage === "model" ? "01" : "✓"}</span>
                <span className="analysis-stage-copy">
                  <strong>Random Forest analysis</strong>
                  <small>{analysisStage === "model" ? "Extracting 34 audio features and scoring this recording." : "Classification and decision evidence received."}</small>
                </span>
              </div>
              <div className={"analysis-stage " + (analysisStage === "transcription" ? "active" : "pending")}>
                <span className="analysis-stage-number">02</span>
                <span className="analysis-stage-copy">
                  <strong>Sarvam AI transcription</strong>
                  <small>{analysisStage === "transcription" ? "Transcribing speech and updating the history record." : "Starts after the model result is ready."}</small>
                </span>
              </div>
            </div>
          )}
          </div>
          </div>
        </section>

        {analysis && <section className="panel result-panel" aria-live="polite"><div className="result-banner"><div className={`result-icon ${labelClass(analysis.classification)}`}>{analysis.classification === "SPOOF" ? "!" : "✓"}</div><div><span className="section-kicker">ANALYSIS COMPLETE</span><h2>{analysis.classification === "SPOOF" ? "Potential spoof detected" : "Likely genuine voice"}</h2><p>{analysis.recommendation}</p></div><span className={`risk-pill ${riskTone}`}>{analysis.risk_level} RISK</span></div><div className="result-model-strip"><span><small>MODEL USED</small><strong>Random Forest</strong></span><span><small>CLASSIFICATION THRESHOLD</small><strong>{(analysis.threshold_used * 100).toFixed(0)}%</strong></span><span><small>REFERENCE FILE</small><strong title={file?.name}>{file?.name || "Uploaded WAV"}</strong></span></div><div className="result-metrics"><div className="gauge-wrap"><div className={`risk-gauge ${riskTone}`} style={{ "--risk": `${Math.min(100, Math.max(0, analysis.spoof_probability * 100))}%` } as React.CSSProperties}><div><strong>{(analysis.spoof_probability * 100).toFixed(1)}%</strong><small>SPOOF PROBABILITY</small></div></div></div><div className="result-detail"><span className="section-kicker">MODEL ASSESSMENT</span><h3>Risk score <b>{analysis.risk_score}/100</b></h3><div className="mini-track"><i className={`fill-${riskTone}`} style={{ width: `${Math.min(100, Math.max(0, analysis.risk_score))}%` }} /></div><p>{analysis.assessment_basis}</p><div className="action-callout"><span>↗</span><div><strong>Recommended security action</strong><p>{analysis.security_action}</p></div></div></div></div>{analysis.model_explanation && <DecisionEvidence explanation={analysis.model_explanation} classification={analysis.classification} spoofProbability={analysis.spoof_probability} threshold={analysis.threshold_used} />}<div className="transcript-card"><div><span className="section-kicker">SPEECH TRANSCRIPTION</span><h3>Recognized speech</h3></div>{transcription && <span className="language-chip">{transcription.language_code || "Language unavailable"}</span>}<p>{transcription?.transcript || (transcription ? "No speech was recognized." : "Transcription unavailable for this analysis.")}</p></div><SecondaryVerification riskLevel={analysis.risk_level} /><p className="disclaimer">AI model output is indicative and does not prove speaker identity or recording authenticity.</p></section>}

        <section className="panel live-panel" id="live"><div className="panel-heading"><div><span className="section-kicker">REAL-TIME PROTECTION</span><h2>Live detection</h2><p>Stream microphone audio for continuous spoof monitoring.</p></div><span className="live-badge"><MicrophoneIcon size={13}/> STREAM READY</span></div><LiveAudioStreaming authToken={authToken} /></section>

        <section className="panel history-panel" id="history"><div className="panel-heading history-title"><div><span className="section-kicker">AUDIT TRAIL</span><h2>Recent analysis activity</h2><p>Review detection results and download compliance reports.</p></div><div className="history-tools"><button className="outline-button" onClick={() => void loadHistory()} disabled={historyLoading}>↻ Refresh</button><button className="primary-button compact" onClick={exportCsv} disabled={!history.length}>↓ Export CSV</button></div></div>
          {historyError ? <div className="empty-state"><strong>Could not load analysis history</strong><span>{historyError}</span><button className="text-button" onClick={() => void loadHistory()}>Try again</button></div> : historyLoading && !history.length ? <div className="empty-state"><span className="spinner"/><strong>Loading your analysis history</strong></div> : !history.length ? <EmptyState title="No analysis records yet" detail="Completed audio analyses will appear here." /> : <div className="table-wrap"><table><thead><tr><th>RECORDING</th><th>CLASSIFICATION</th><th>RISK</th><th>LANGUAGE</th><th>ANALYZED</th><th>REPORT</th></tr></thead><tbody>{history.map((record) => <tr key={record.id}><td><div className="record-name"><span className="table-audio">♫</span><strong title={record.filename}>{record.filename}</strong><small>{record.transcript || "Transcript unavailable"}</small></div></td><td><span className={`classification ${labelClass(record.classification)}`}><i />{record.classification === "BONA_FIDE" ? "Genuine" : "Potential spoof"}</span><small className="table-sub">{(record.spoof_probability * 100).toFixed(1)}% spoof probability</small></td><td><span className={`risk-pill ${record.risk_level.toLowerCase()}`}>{record.risk_level}</span></td><td>{record.language_code || "—"}</td><td>{new Date(record.created_at).toLocaleDateString()}<small className="table-sub">{new Date(record.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></td><td><button className="pdf-link" onClick={() => void downloadReport(record.id)}>↓ PDF</button></td></tr>)}</tbody></table></div>}
        </section>
        <section className="panel settings-panel" id="settings"><div className="panel-heading"><div><span className="section-kicker">PREFERENCES & ACCOUNT</span><h2>Settings</h2><p>Manage your workspace preferences and active account.</p></div><span className="settings-gear">⚙</span></div><div className="settings-grid"><div className="setting-row"><span className="setting-icon">✦</span><div><strong>Motion effects</strong><small>Use subtle transitions and animated dashboard elements.</small></div><button className={`setting-switch ${motionEnabled ? "on" : ""}`} role="switch" aria-checked={motionEnabled} aria-label="Toggle motion effects" onClick={() => setMotionEnabled((enabled) => { const next = !enabled; window.localStorage.setItem("voiceshield.motion", next ? "on" : "off"); return next; })}><i/></button></div><div className="setting-row"><span className="setting-icon account">◎</span><div><strong>Signed-in account</strong><small>{user.full_name} · {user.email}</small></div><button className="settings-signout" onClick={() => void signOut()}>Sign out <span>↗</span></button></div><div className="setting-row"><span className="setting-icon security">⌑</span><div><strong>Session security</strong><small>Sessions expire after 12 hours. Sign out to revoke this session immediately.</small></div><span className="settings-state">ACTIVE SESSION</span></div><div className="setting-row"><span className="setting-icon audio">♫</span><div><strong>Audio analysis</strong><small>WAV files up to 20 MB · audio is processed by the configured VoiceShield services.</small></div><span className="settings-state">WAV · 20 MB</span></div></div><details className="password-settings"><summary>Change password</summary><form onSubmit={(event) => void updatePassword(event)}><label>Current password<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required/></label><label>New password<input type="password" autoComplete="new-password" minLength={12} maxLength={256} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required/><small>Use at least 12 characters.</small></label><button className="primary-button compact" disabled={passwordLoading}>{passwordLoading ? "Updating…" : "Update password"}</button></form>{passwordMessage && <p className="password-success">✓ {passwordMessage}</p>}{passwordError && <p className="password-error">{passwordError}</p>}</details></section>
        <footer className="page-footer"><span>© VoiceShield AI</span><span>AI-powered voice security · Results are indicative</span><button id="reports" onClick={() => jumpTo("history")}>Reports & history ↑</button></footer>
      </div>
    </main>
  </div>;
}

function StatCard({ title, value, note, icon, tone, animated }: { title: string; value: number; note: string; icon: string; tone: string; animated: boolean }) {
  const [displayValue, setDisplayValue] = useState(animated ? 0 : value);
  useEffect(() => {
    if (!animated || value === 0) { setDisplayValue(value); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 650);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animated, value]);
  return <article className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><span className="stat-label">{title}</span><strong className="stat-value">{displayValue}</strong><span className="stat-note">{note}</span><span className={`stat-spark ${tone}`} aria-hidden="true">⌁⌁⌁⌁⌁⌁</span></article>;
}
function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="empty-state"><span className="empty-icon">⌁</span><strong>{title}</strong><span>{detail}</span></div>; }

export default App;
