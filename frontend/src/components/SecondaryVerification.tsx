
import "./SecondaryVerification.css";

type Props = {
  riskLevel: string;
};

function SecondaryVerification({ riskLevel }: Props) {
  const level = riskLevel.toUpperCase();

  const recommendations = {
    LOW: {
      title: "Normal Verification",
      message:
        "No significant spoofing evidence was detected. Continue your normal identity verification process.",
      actions: [
        "Continue standard identity verification.",
        "Confirm sensitive requests through your usual security procedure.",
      ],
    },
    MEDIUM: {
      title: "Additional Verification Required",
      message:
        "The model detected some evidence of possible audio spoofing. Verify the speaker through another trusted channel.",
      actions: [
        "Send an OTP to the registered contact.",
        "Call back using a previously saved phone number.",
        "Confirm the request through a separate communication channel.",
        "Avoid sharing confidential information until verification is complete.",
      ],
    },
    HIGH: {
      title: "High-Risk Security Alert",
      message:
        "The model detected strong evidence of possible audio spoofing. Do not trust the voice alone for identity verification.",
      actions: [
        "Do not authorize financial or sensitive transactions.",
        "Verify identity using an authenticator app or biometric method where available.",
        "Contact the person using a previously verified phone number.",
        "Request manual verification from an authorized person.",
        "Report suspicious impersonation attempts to the appropriate security team.",
      ],
    },
  };

  const result =
    recommendations[level as keyof typeof recommendations] ??
    recommendations.LOW;

  const color =
    level === "HIGH"
      ? "#ef5350"
      : level === "MEDIUM"
      ? "#f59e0b"
      : "#35c98a";

  return (
    <section className="secondary-verification">
      <div className="verification-heading">
        <div>
          <h3>Secondary Verification System</h3>
          <p>Risk-based identity protection recommendations</p>
        </div>

        <span
          className="verification-status"
          style={{ color, borderColor: color }}
        >
          {level} RISK
        </span>
      </div>

      <div className="verification-message">
        <h4 style={{ color }}>{result.title}</h4>
        <p>{result.message}</p>
      </div>

      <h4>Recommended Security Measures</h4>

      <ul className="verification-list">
        {result.actions.map((action, index) => (
          <li key={index}>
            <span className="verification-number">
              {index + 1}
            </span>
            {action}
          </li>
        ))}
      </ul>

      <p className="verification-disclaimer">
        These are risk-based recommendations. They do not represent
        completed authentication or guarantee the speaker's identity.
      </p>
    </section>
  );
}

export default SecondaryVerification;
